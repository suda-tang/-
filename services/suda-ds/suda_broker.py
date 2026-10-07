#!/usr/bin/env python3
"""苏州大学 DeepSeek 登录代理（本机 127.0.0.1:8766）

职责：
  1. 用 Playwright 驱动本机 Edge 打开 ds.suda.edu.cn，维持登录态；
  2. 从页面 storage 中抓取 access_token，供 WebSocket 直连模式使用；
  3. 提供 /chat 接口，把消息送进网页输入框并把回答抓回来；
  4. /chat 支持 SSE 增量流式：模型边说边往回推，而不是等说完再一次性返回。

只监听 127.0.0.1，不对外暴露。
"""

from __future__ import annotations

import base64
import json
import os
import queue
import re
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

try:  # 可选：个人自动填表模块（与原版 embedded_credentials 兼容）
    import embedded_credentials
except ImportError:
    embedded_credentials = None


# ── 配置 ──────────────────────────────────────────────────────────────
COPILOT_ID = os.getenv("SUDA_DEEPSEEK_MODEL", "01JMP3EFD6EV6Q8QEXNHEH0FC4")
# 校外（不在校园网）时 ds.suda.edu.cn 直连不通，broker 会打不开页面、拿不到 token。
# 此时把 SUDA_DEEPSEEK_LOGIN_URL 指向 WebVPN 代理地址
# （https://wvpn.suda.edu.cn/https/webvpn<hash>/copilot-center/...），
# 并配合 SUDA_DEEPSEEK_BROWSER_PROFILE 指向带 VPN 登录态的 profile。
# 不设时行为与原来完全一致（直连 ds）。
LOGIN_URL = os.getenv("SUDA_DEEPSEEK_LOGIN_URL") or (
    "https://ds.suda.edu.cn/copilot-center/"
    f"airobotsuda?showSource=true&id={COPILOT_ID}"
)
PORT = int(os.getenv("SUDA_DEEPSEEK_AUTH_PORT", "8766"))
PAGE_INPUT_LIMIT = int(os.getenv("SUDA_DEEPSEEK_PAGE_INPUT_LIMIT", "5900"))
PAGE_POLL_INTERVAL = float(os.getenv("SUDA_DEEPSEEK_PAGE_POLL_INTERVAL", "0.5"))
CHAT_TIMEOUT = float(os.getenv("SUDA_DEEPSEEK_CHAT_TIMEOUT", "150"))
# 发送后多久还没在页面上看到本轮提问，就认为这一发没生效（重发一次）。
STALL_LIMIT = float(os.getenv("SUDA_DEEPSEEK_STALL_LIMIT", "25"))
# 「静默失败」快速识别：正常请求页面 0.6 秒左右就会追加本轮提问容器
# （实测首次 found 在 0.58 秒）。如果输入框已清空（=消息确实提交了）、
# 页面也不忙（没有 .denyInput 遮罩，说明前端根本没在处理），却迟迟不见容器，
# 那是「发出去了但对话后端没接」的半可用状态 —— 干等到 STALL_LIMIT 毫无意义，
# 越早交给上层刷新重发越好。取 6 秒：比正常回显慢 10 倍，足够排除抖动。
SILENT_STALL_LIMIT = float(os.getenv("SUDA_DEEPSEEK_SILENT_STALL_LIMIT", "6"))
# 卡住自愈：刷新页面后重试那一轮最多等多久
RETRY_TIMEOUT = float(os.getenv("SUDA_DEEPSEEK_RETRY_TIMEOUT", "90"))
# 发送校验：等页面回显本轮提问的上限
SEND_VERIFY_LIMIT = float(os.getenv("SUDA_DEEPSEEK_SEND_VERIFY_LIMIT", "8"))
# 页面不会稳定地给出"生成结束"信号（有时一直停在"思考中"），
# 因此以"文本停止增长"作为收尾判据，这个值是静默多久算结束。
STABLE_LIMIT = float(os.getenv("SUDA_DEEPSEEK_STABLE_LIMIT", "6"))
# 绝对兜底：即使页面一直声称"还在生成"，静止超过这个时间也必须收工，
# 否则一个坏掉的页面会把整轮请求拖到超时。
HARD_STABLE_LIMIT = float(os.getenv("SUDA_DEEPSEEK_HARD_STABLE_LIMIT", "30"))
# 页面「忙」（输入框被 .denyInput 遮罩）时，最多再相信这个信号多久。
# 超过就不再等它，避免遮罩因别的原因一直挂着时白等到超时。
BUSY_GRACE = float(os.getenv("SUDA_DEEPSEEK_BUSY_GRACE", "75"))
# 发送前发现页面还在生成，最多等它多久（秒）。
INPUT_IDLE_WAIT = float(os.getenv("SUDA_DEEPSEEK_INPUT_IDLE_WAIT", "30"))
# 问答容器已出现但正文迟迟不出来（页面停在"正在思考"）时的容忍时间
THINK_PHASE_LIMIT = float(os.getenv("SUDA_DEEPSEEK_THINK_PHASE_LIMIT", "60"))
# 页面自己报了"思考已完成"后，再等一小段让它完成重排
FINAL_QUIET = float(os.getenv("SUDA_DEEPSEEK_FINAL_QUIET", "1.2"))
# 收尾后的稳定确认：轮询间隔、最长确认时间、需要连续几次读到相同文本
SETTLE_INTERVAL = float(os.getenv("SUDA_DEEPSEEK_SETTLE_INTERVAL", "0.8"))
SETTLE_LIMIT = float(os.getenv("SUDA_DEEPSEEK_SETTLE_LIMIT", "15"))
# 网页端是有状态的连续会话：每问一轮就往 DOM 里追加一组问答。
# 实测 20 轮内答案速度没有明显退化，但**工具模式**下每轮会往页面塞一大段
# 工具指令 + 工具结果，几十轮后单个会话容器能涨到 75KB / 100+ 个节点。
# 但「每轮都点新建会话」会让页面频繁重建会话，反而更容易出现「发送不生效」，
# 所以策略是：就地累积，**只有当前会话轮数超过阈值时才清**。
RESET_EACH_TURN = os.getenv("SUDA_DEEPSEEK_RESET_EACH_TURN", "0") != "0"
# 当前会话累计多少轮之后就重置（RESET_EACH_TURN=1 时忽略此值）
CONVERSATION_TURN_LIMIT = int(os.getenv("SUDA_DEEPSEEK_CONVERSATION_TURN_LIMIT", "10"))
# 重置后等待输入框重新出现的上限
RESET_READY_TIMEOUT = float(os.getenv("SUDA_DEEPSEEK_RESET_READY_TIMEOUT", "30"))
# 每处理 N 轮就整页刷新一次，清掉「新建会话」累积下来的隐藏容器
PAGE_RELOAD_EVERY_TURNS = int(os.getenv("SUDA_DEEPSEEK_RELOAD_EVERY_TURNS", "20"))
# 回答被截断时最多补写几轮（0 = 关闭续写）。苏大页面会把长回答砍在半句上，
# 靠「请接着写完」再要一轮能补回来，实测这是最有效的兜底手段。
CONTINUE_LIMIT = int(os.getenv("SUDA_DEEPSEEK_CONTINUE_LIMIT", "2"))
# 页面明确报错（错误提示条 / 错误气泡）时，最多再留多久给页面把提示换成真回答。
# 超了就直接可见失败，交给上层刷新重试；不再干等到 THINK_PHASE_LIMIT（60 秒）。
PAGE_NOISE_GRACE = float(os.getenv("SUDA_DEEPSEEK_PAGE_NOISE_GRACE", "8"))
_trace_lock = threading.Lock()


def trace_tool(stage: str, payload: dict) -> None:
    """把 broker 侧的事件（续写、补全）也记进同一份追踪文件，方便循环调优。"""
    if os.getenv("SUDA_DEEPSEEK_TOOL_TRACE", "1") == "0":
        return
    try:
        record = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), "stage": stage}
        record.update(payload)
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tool-trace.log")
        with _trace_lock:
            with open(path, "a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:  # noqa: BLE001 - 追踪失败不能影响请求
        pass
HEADLESS = os.getenv("SUDA_DEEPSEEK_HEADLESS", "0") == "1"
BROWSER_CHANNEL = os.getenv("SUDA_DEEPSEEK_BROWSER_CHANNEL", "msedge")


class PageStalledError(RuntimeError):
    """页面卡住：本轮提问迟迟没有在页面上出现。可以刷新后重试。"""


class NoAnswerError(RuntimeError):
    """页面给了回答但内容不可用（空 / 只有标点 / 只捞到中间片段）。刷新后重试。"""


def default_profile_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "SudaDeepSeekProfile"
    return Path(__file__).resolve().parent / ".browser-profile"


PROFILE = Path(os.getenv("SUDA_DEEPSEEK_BROWSER_PROFILE", str(default_profile_dir())))

# 页面未就绪多久后自动重新加载（秒）。网络恢复后靠它自愈，无需人工干预。
PAGE_RETRY_DELAY = float(os.getenv("SUDA_DEEPSEEK_PAGE_RETRY_DELAY", "45"))


def export_wvpn_cookies(context) -> None:
    """把浏览器里 wvpn 域的 cookie 导出到 `SUDA_DEEPSEEK_WS_COOKIE_FILE`。

    ★★ 2026-10-07 血的教训：**谁拥有浏览器，谁就负责导出 cookie**。

    校外走 WebVPN 时，WS 直连通道（`suda_api` → `wss://wvpn.suda.edu.cn/...`）
    需要**网关会话 cookie**；而那个会话就是**本浏览器的**会话。
    如果 cookie 文件是别的进程、别的时刻写的，它和浏览器里的**不是同一个会话**，
    症状是：`直连失败（登录已过期，请完成登录/验证码后重试。），退回页面驱动模式`
    —— 页面模式照样能用（它就在浏览器里），WS 直连却永远 401，
    白白退化成又慢又抖的页面模式。

    导出时机：每次 token 变化（= 页面重载过、会话可能变了）都导一次。
    `suda_api._ws_extra_headers()` 是**每次握手都重读文件**的，所以不需要重启服务。
    """
    path = os.getenv("SUDA_DEEPSEEK_WS_COOKIE_FILE", "")
    if not path:
        return
    try:
        picked = {
            c["name"]: c["value"] for c in context.cookies()
            if "wvpn.suda.edu.cn" in (c.get("domain") or "")
        }
        if not picked:
            return
        header = "; ".join(f"{k}={v}" for k, v in picked.items())
        Path(path).write_text(header, encoding="utf-8")
        log(f"已导出 {len(picked)} 项 wvpn cookie → {Path(path).name}")
    except Exception as exc:  # noqa: BLE001 - 导出失败绝不能影响主循环
        log(f"导出 wvpn cookie 失败：{type(exc).__name__}: {exc}")


# ── 统一身份认证自动登录（2026-10-07 加，校外 WebVPN 自愈用）─────────────
CAS_USER = "input#username"
CAS_PASS = "input#password"
CAS_SUBMIT = "input#login-submit"
AUTOLOGIN_INTERVAL = float(os.getenv("SUDA_DEEPSEEK_AUTOLOGIN_INTERVAL", "5"))
_autologin_last = 0.0


def load_wvpn_credentials():
    """读苏大统一身份认证凭据。**绝不打印密码。**

    优先级：环境变量 SUDA_WVPN_USER/SUDA_WVPN_PASS → `.wvpn-credentials.json`。
    没有就返回 None（此时保持原行为：等人工登录）。
    """
    u = (os.getenv("SUDA_WVPN_USER") or "").strip()
    p = os.getenv("SUDA_WVPN_PASS") or ""
    if u and p:
        return u, p
    try:
        data = json.loads(
            (Path(__file__).resolve().parent / ".wvpn-credentials.json")
            .read_text(encoding="utf-8"))
        u = str(data.get("username") or "").strip()
        p = str(data.get("password") or "")
        if u and p:
            return u, p
    except Exception:
        pass
    return None


def maybe_autologin(page) -> bool:
    """页面停在统一身份认证登录页时，自动填表登录。

    ★★ 为什么 broker 必须自己会登录（2026-10-07）：
      校外走 WebVPN 时，ds 页面要过 ds 自己的 SSO（网关把 auth.suda.edu.cn 的
      CAS 登录页代理过来）。CAS 会话一过期，页面就永远停在登录页 →
      `页面已 45 秒未就绪，自动重新加载` 死循环 → 拿不到 token → 全接口 401。
      让 broker 自己填表，整条链路就能**自愈**，不依赖外部脚本协调。
      （外部脚本方案要独占 profile，和 broker 抢锁，实测把 broker 的
       browser context 搞崩成 TargetClosedError —— 已废弃。）

    选择器见 `wvpn_login.py`（`input#username` / `input#password` /
    `input#login-submit`，实测**没有验证码**）。这里用 sync API，因为 broker 就是 sync。
    """
    global _autologin_last
    now = time.time()
    if now - _autologin_last < AUTOLOGIN_INTERVAL:
        return False
    _autologin_last = now
    try:
        if page.locator(CAS_SUBMIT).count() == 0:
            return False
        cred = load_wvpn_credentials()
        if not cred:
            log("页面停在统一身份认证登录页，但没配凭据（.wvpn-credentials.json），等人工登录。")
            return False
        user, pwd = cred
        log("页面停在统一身份认证登录页，自动填表登录…")
        page.locator(CAS_USER).first.fill(user)
        page.locator(CAS_PASS).first.fill(pwd)
        page.locator(CAS_SUBMIT).first.click()
        log("已提交统一身份认证，等待跳转…")
        page.wait_for_timeout(8000)
        return True
    except Exception as exc:  # noqa: BLE001 - 自动登录失败不能影响主循环
        log(f"自动登录异常：{type(exc).__name__}: {exc}")
        return False


class PageRetryTimer:
    """页面长时间没就绪 → 该自己重新加载了。

    为什么需要：主循环原本只在 `page.is_closed()` 时重建页面。
    网络中断（例如校园 VPN 掉线）后首次 `goto` 会失败，页面就永远停在错误页上，
    `page_ready` 一直 false，必须人工 `POST /reload` 才能恢复。
    用这个计时器补上自动重试，网络恢复后最多 delay 秒自动接上。

    用法：
        timer = PageRetryTimer(45)
        if timer.due(page_ready):            # 每轮循环喂一次「页面是否就绪」
            page.goto(...)

    ★ 只能喂**页面是否就绪**这一个信号。曾经写成 `page_ready or token`，
      结果 token 一旦拿到就长期有值 → 判据恒为 True → 计时器永不触发，
      「token 有效但页面卡死」时兜底静默失效（2026-10-03 实测卡 5 分钟）。
      见 `test_page_retry_call_site.py` 的源码守卫。
    """

    def __init__(self, delay: float) -> None:
        self.delay = max(1.0, float(delay))
        self._since = 0.0

    def reset(self) -> None:
        """已就绪时调用，清掉计时。"""
        self._since = 0.0

    def due(self, ready: bool, now: float | None = None) -> bool:
        """喂进当前是否就绪；返回 True 表示这一轮该重新加载页面了。

        ⚠ `ready=True` 会立刻 `reset()` 并返回 False —— 所以**别**把
        「token 有值」这种长期为真的条件或进来，否则永远等不到 True。
        """
        now = time.time() if now is None else now
        if ready:
            self._since = 0.0
            return False
        if self._since == 0.0:
            # 第一次发现不就绪，只起表，不立刻重试
            self._since = now
            return False
        if now - self._since >= self.delay:
            self._since = now
            return True
        return False


class SilentFailureDetector:
    """识别「消息提交了、页面也不忙、却迟迟没有回显」的半可用状态。

    为什么需要：发送后页面不出现本轮提问容器，其实有两类完全不同的原因，
    以前被一视同仁地干等到 `STALL_LIMIT`（25 秒）：

      ① 消息**没**提交 —— 输入框里还留着刚才那段话。
         对策：原样重发（代价小），由 `SEND_VERIFY_LIMIT` 那条分支处理。
      ② 消息**提交了**，但对话后端没接 —— 输入框已清空，页面也不忙。
         实测（2026-10-01 06:36）就是这一类：输入框 `value=''`、`disabled=False`、
         没有 `.denyInput` 遮罩，提问却始终没被追加到 DOM。
         对策：干等没用，尽早让上层刷新页面重发（实测刷新后连续 3/3 成功）。

    正常回显只要 0.58 秒，所以「超过 limit 秒还没容器」本身就足够异常。
    这里只做纯判断，方便单测（内联在 while 循环里的判据是测不到的）。

    用法：
        detector = SilentFailureDetector(6)
        if not box_seen and elapsed > detector.limit:
            if detector.due(elapsed=elapsed, box_seen=False,
                            pending_text=input_pending_text(page),
                            blocked=input_blocked(page)):
                raise PageStalledError(...)
    """

    def __init__(self, limit: float) -> None:
        self.limit = max(1.0, float(limit))

    def due(
        self,
        *,
        elapsed: float,
        box_seen: bool,
        pending_text: str,
        blocked: bool,
    ) -> bool:
        """返回 True 表示这一发属于「静默失败」，应立刻交给上层自愈重发。

        - `box_seen`：本轮提问容器是否已经出现（出现就说明没失败）。
        - `pending_text`：输入框里还留着的内容（非空 = 没提交出去）。
        - `blocked`：页面是否给输入框套了遮罩（True = 前端确实在忙，别打断）。
        """
        if box_seen:
            return False
        if elapsed <= self.limit:
            return False
        if (pending_text or "").strip():
            # 还留在输入框里 = 没提交，交给「重发」分支，不要整页刷新
            return False
        if blocked:
            # 页面自己说还在忙（生成上一轮 / 正在处理），给它时间
            return False
        return True


# ── 运行时状态 ────────────────────────────────────────────────────────
state = {
    "access_token": "",
    "updated_at": 0.0,
    "logged_in": False,
    "page_ready": False,
    "force_login": False,
    # 只重载页面（保留 SSO cookie）让前端重跑一次 OIDC，换一张新 token。
    # 比 force_login（清 cookie + storage，需要账号密码）温和得多，
    # 实测换 token 后无需人工介入。
    "force_reload": False,
    "invalidated_at": 0.0,
    "last_error": "",
    "started_at": time.time(),
    "chats_served": 0,
}
invalid_tokens: set[str] = set()
lock = threading.Lock()
chat_queue: "queue.Queue[dict]" = queue.Queue()
current_page: dict[str, Any] = {"page": None}  # 供 /debug 诊断使用
# Playwright 同步 API 只能在创建它的线程里调用，因此诊断请求也走队列
debug_requests: "queue.Queue[dict]" = queue.Queue()
# 最近一次对话的轮询轨迹（供 /trace 排障）
last_trace: list[dict] = []
# 已服务轮数，用于「每 N 轮整页刷新一次」
_turn_counter = 0

# 诊断用：定位回答容器的候选选择器
CANDIDATE_SELECTORS = [
    "textarea.question",
    "textarea",
    "[class*='markdown' i]",
    "[class*='message' i]",
    "[class*='answer' i]",
    "[class*='chat' i]",
    "[class*='content' i]",
    "[class*='reply' i]",
    "[class*='bubble' i]",
]


def collect_dom_report(page) -> dict:
    """诊断苏大页面结构：各候选选择器命中情况 + 页面尾部文本。

    必须在创建 Playwright 的那个线程里调用。
    """
    report: dict = {}
    try:
        report["url"] = page.url
    except Exception as exc:
        report["url"] = f"<error {exc}>"
    selectors: dict = {}
    for selector in CANDIDATE_SELECTORS:
        try:
            locator = page.locator(selector)
            count = locator.count()
            entry: dict = {"count": count}
            if count:
                try:
                    entry["last_text"] = (locator.last.inner_text() or "")[:300]
                except Exception as exc:
                    entry["last_text"] = f"<error {exc}>"
            selectors[selector] = entry
        except Exception as exc:
            selectors[selector] = {"error": str(exc)}
    report["selectors"] = selectors

    try:
        report["textareas"] = page.evaluate(
            """() => {
              const areas = Array.from(document.querySelectorAll('textarea'));
              return areas.map((el, i) => {
                const r = el.getBoundingClientRect();
                const chain = [];
                let p = el.parentElement;
                for (let k = 0; k < 9 && p; k++) {
                  chain.push(p.tagName.toLowerCase()
                    + (p.className ? '.' + String(p.className).trim().replace(/\\s+/g, '.').slice(0, 70) : ''));
                  p = p.parentElement;
                }
                return {i, visible: r.width > 0 && r.height > 0,
                        w: Math.round(r.width), h: Math.round(r.height), chain};
              });
            }"""
        )
    except Exception as exc:
        report["textareas"] = f"<error {exc}>"

    try:
        report["text_tree"] = page.evaluate(
            """() => {
              const out = [];
              const walk = (el, depth) => {
                if (depth > 14 || out.length > 400) return;
                let own = '';
                for (const node of el.childNodes) {
                  if (node.nodeType === 3) own += node.textContent;
                }
                own = own.trim();
                if (own) {
                  const r = el.getBoundingClientRect();
                  out.push({d: depth, tag: el.tagName.toLowerCase(),
                            cls: String(el.className || '').slice(0, 60),
                            vis: r.width > 0 && r.height > 0, t: own.slice(0, 70)});
                }
                for (const child of el.children) walk(child, depth + 1);
              };
              walk(document.body, 0);
              return out.slice(-140);
            }"""
        )
    except Exception as exc:
        report["text_tree"] = f"<error {exc}>"

    try:
        report["robot_instances"] = page.evaluate(
            """() => {
              const roots = Array.from(document.querySelectorAll('div.user_robots'));
              const info = roots.map((el, i) => {
                const r = el.getBoundingClientRect();
                const text = el.innerText || '';
                return {i, rectW: Math.round(r.width), rectH: Math.round(r.height),
                        len: text.length, hasMarker: text.includes('SUDA_REQUEST_END'),
                        tail: text.slice(-500)};
              });
              return {total: roots.length, instances: info};
            }"""
        )
    except Exception as exc:
        report["robot_instances"] = f"<error {exc}>"

    try:
        report["answer_nodes"] = page.evaluate(
            """() => {
              const btns = Array.from(document.querySelectorAll('.thinking-btn'));
              return btns.slice(-4).map((btn) => {
                const chain = [];
                let el = btn;
                for (let k = 0; k < 8 && el; k++) {
                  const r = el.getBoundingClientRect();
                  chain.push({
                    lvl: k,
                    tag: el.tagName.toLowerCase(),
                    cls: String(el.className || '').slice(0, 55),
                    w: Math.round(r.width),
                    h: Math.round(r.height),
                    len: (el.innerText || '').length,
                    tail: (el.innerText || '').slice(-170),
                  });
                  el = el.parentElement;
                }
                return {btnText: (btn.innerText || '').slice(0, 40), chain};
              });
            }"""
        )
    except Exception as exc:
        report["answer_nodes"] = f"<error {exc}>"

    try:
        report["last_answer_html"] = page.evaluate(
            """() => {
              const boxes = Array.from(document.querySelectorAll('div.chat_box.robot'));
              if (!boxes.length) return '<none>';
              return (boxes[boxes.length - 1].innerHTML || '').slice(0, 3000);
            }"""
        )
    except Exception as exc:
        report["last_answer_html"] = f"<error {exc}>"

    try:
        report["marked_chain"] = page.evaluate(
            """() => {
              const nodes = Array.from(document.querySelectorAll('span.contentsMarked'));
              return nodes.slice(-4).map((el) => {
                const chain = [];
                let p = el;
                for (let k = 0; k < 9 && p; k++) {
                  chain.push(p.tagName.toLowerCase() + '.' + String(p.className || '').slice(0, 45));
                  p = p.parentElement;
                }
                return {text: (el.innerText || '').slice(0, 60), chain};
              });
            }"""
        )
    except Exception as exc:
        report["marked_chain"] = f"<error {exc}>"

    try:
        report["marked_order"] = page.evaluate(
            """() => {
              const nodes = Array.from(document.querySelectorAll('span.contentsMarked'));
              return nodes.map((el, i) => {
                const box = el.closest('.chat_box');
                return {i,
                        robot: box ? box.classList.contains('robot') : false,
                        text: (el.innerText || '').slice(0, 42)};
              });
            }"""
        )
    except Exception as exc:
        report["marked_order"] = f"<error {exc}>"

    try:
        report["body_tail"] = (page.evaluate("() => document.body?.innerText || ''") or "")[-1800:]
    except Exception as exc:
        report["body_tail"] = f"<error {exc}>"
    return report

BUSY_PHRASES = ["正在思考中请稍候", "正在思考", "思考中", "等待模型响应"]

# 输入框候选选择器，按优先级尝试，避免页面改版后彻底失效
INPUT_SELECTORS = [
    "textarea.question:visible",
    "textarea.chat-input:visible",
    "textarea:visible",
    "div[contenteditable='true']:visible",
    "[role='textbox']:visible",
]


def log(message: str) -> None:
    print(f"[suda-broker] {message}", flush=True)


def set_error(message: str) -> None:
    with lock:
        state["last_error"] = message


# ── 可选的内置凭据（个人版） ──────────────────────────────────────────
def embedded_login() -> tuple[str, str]:
    if not embedded_credentials or not getattr(embedded_credentials, "KEY", ""):
        return "", ""
    try:
        key = base64.b64decode(embedded_credentials.KEY)

        def decode(value: str) -> str:
            raw = base64.b64decode(value)
            plain = bytes(b ^ key[i % len(key)] for i, b in enumerate(raw))
            return plain.decode("utf-8")

        return decode(embedded_credentials.USERNAME), decode(embedded_credentials.PASSWORD)
    except Exception:
        return "", ""


# ── 文本处理 ──────────────────────────────────────────────────────────
def compact_text(text: str) -> str:
    return "".join(str(text or "").split())


# ── 页面自己的错误提示条（toast / 错误气泡）──────────────────────────
# ★ 2026-10-05 实测（用户投诉「这个自定义模型还是不能实际办成事情」时挖出来的）：
# 上游故障时苏大页面会在**机器人回答气泡里**渲染一条错误提示：
#     您好，出现未知故障，请刷新页面稍后再试~  消息框于3秒后自动关闭
# 它会被 `page_turn` 的正文通道当成「模型回答」抓走；又因为「≥30 字且以汉字结尾」
# 还会被判成「回答被截断」→ 触发自动续写 → 把真正的答案拼在它后面，
# 交付给用户一条「错误提示 + 真答案」的污染回答。实测 trace 铁证：
#     [continue] {"attempt":1,"head_chars":33,"tail_chars":34,"added_chars":35}
# 其中 head 就是上面这条 33 字的提示条。
#
# 判据刻意保守：**整段必须很短、且不带句末标点**，且
#   · 命中强特征词（`出现未知故障` / `刷新页面稍后再试` / `消息框于` / 消息框N秒后自动关闭）
#     —— 命中一个即判；
#   · 否则要**同时命中两个**弱特征词（如 `系统繁忙` + `稍后再试`）。
# 两个约束都是为了把「整条就是 UI 提示」和「正常回答里引用了它」分开：
#   · 长度上限 80：提示条是固定短文案（实测 33 字）；引用它的正常回答会长得多；
#   · 句末标点：提示条本身没有句末标点；正常回答（哪怕只是「请刷新页面重试。」）
#     几乎必然带 —— 所以「有句末标点」一律放行，避免误杀正常短回答。
_PAGE_NOISE_STRONG = (
    "出现未知故障",
    "刷新页面稍后再试",
    "消息框于",
    "消息框将",
)
_PAGE_NOISE_WEAK = (
    "请刷新页面",
    "稍后再试",
    "自动关闭",
    "未知故障",
    "系统繁忙",
    "服务异常",
    "网络异常",
)
_PAGE_NOISE_AUTOCLOSE_RE = re.compile(r"消息框[于将][^\n]{0,12}?自动关闭")
_PAGE_NOISE_SENTENCE_END_RE = re.compile(r"[。！？!?；;]")
PAGE_NOISE_MAX_LEN = 80


def is_page_noise(text: str) -> bool:
    """整段是否只是页面自己的错误/提示条（不是模型回答）。

    只认「整段很短 + 不带句末标点 + 命中特征词」，宁可见失败也不交付垃圾回答。
    见上方注释里的实测铁证与判据取舍。
    """
    compact = "".join(str(text or "").split())
    if not compact or len(compact) > PAGE_NOISE_MAX_LEN:
        return False
    if _PAGE_NOISE_SENTENCE_END_RE.search(compact):
        return False
    if any(marker in compact for marker in _PAGE_NOISE_STRONG):
        return True
    if _PAGE_NOISE_AUTOCLOSE_RE.search(compact):
        return True
    return sum(1 for marker in _PAGE_NOISE_WEAK if marker in compact) >= 2


def page_noise_line(raw: str) -> str:
    """从**原始**页面文本里找出页面提示条（返回命中的那一行；没有则空串）。

    ★★ 为什么必须拿**原始文本**判，而不是拿 `clean_answer()` 清完之后的正文判
    （2026-10-05 实测踩到，属于「护栏看着在、其实永远进不去」）：

        `clean_answer()` 会**逐行**把提示条剥掉 → 清完之后 `candidate` 变成**空串**
        → `if candidate and is_page_noise(candidate)` **永远为假**
        → `PAGE_NOISE_GRACE` 宽限期不启动 → 用户要等满 `THINK_PHASE_LIMIT`(60s)
          才看到失败，而不是设计的 8s。

    现场证据：`page_turn` 里那三条提示条护栏的日志在整个 `launcher.log` 里
    **0 次触发** —— 不是「没发生」，是**永远不会发生**。

    所以判定回到原始文本；调用方再用「清完之后一个字都不剩」把范围收窄，
    避免把「回答里引用提示条」（正文还有别的内容）误判成页面故障。
    """
    text = str(raw or "")
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and is_page_noise(stripped):
            return stripped
    compact = "".join(text.split())
    return compact if compact and is_page_noise(compact) else ""


def clip_middle(text: str, max_chars: int) -> str:
    """保留首尾、省略中间，适配苏大网页 6000 字输入限制。"""
    text = str(text or "")
    if max_chars <= 0:
        return ""
    if len(text) <= max_chars:
        return text
    marker = "\n...[中间内容因网页输入限制已省略]...\n"
    if max_chars <= len(marker) + 20:
        return text[:max_chars]
    keep = max_chars - len(marker)
    head = max(1, keep * 2 // 3)
    tail = max(1, keep - head)
    return text[:head] + marker + text[-tail:]


FEEDBACK_MARKER = "您的反馈将帮助我们进步"
FEEDBACK_WORDS = {
    "格式问题", "逻辑问题", "有害信息", "事实错误", "没有帮助", "答非所问", "提交",
}


# 定位与读取策略（多轮实测后确定）：
#   1) 页面里同时存在多个 .comments_box 会话容器，且"当前会话"在文档顺序里
#      往往排在历史会话之前，因此既不能全局按顺序取"最后一个"，也不能只扫尾部；
#      必须用本轮提问里的唯一 marker 去定位用户消息，再在它所在的容器内找回答容器；
#   2) 容器内布局是「一批 person 紧跟一批 robot」，同一轮还会出现两个 robot 容器
#      （一个永远停在"思考中"的僵尸容器 + 一个会收尾的容器），因此取 marker 之后
#      紧随的若干个 robot，并优先选已收尾的那个；
#   3) 页面把模型输出分成两条通道：.thinking（思维链）与 .contentsMarked（正文）。
#      实测有时正文通道只剩一个尾字符（如"。"），真正的答案在 .thinking 里；
#   4) 轮询必须廉价：早期版本每 0.3 秒对整页读 innerText，会强制大量重排，
#      把页面拖慢约 10 倍（27 秒的答案拖到 280 秒），因此轮询只用 textContent，
#      等确认收尾后再取一次带换行的 innerText；
#   5) 页面生成过程中有"打字动画"中间态（DOM 里会短暂出现 markdown 源码和重复
#      字符），中间态不可靠，所以只在文本稳定后才输出最终回答。
POLL_JS = """(payload) => {
  const marker = payload.marker || '';
  // 文本里是否还有「实质内容」：只剩标点/符号/markdown 记号就不算答案。
  const hasContent = (s) => ((s || '').replace(/[\\s\\p{P}\\p{S}]/gu, '').length > 0);
  const empty = {found: false, src: 'waiting', text: '', think: '', streaming: false,
                 partial: false, final: false, rid: '', robots: 0};

  // 1) 用本轮提问里的唯一 marker 定位用户消息。
  //    注意：页面里同时挂着多个会话容器，且"当前会话"在文档顺序里往往排在
  //    历史会话之前，所以不能只扫尾部，必须全量扫（textContent 不触发重排，成本很低）。
  const marks = document.querySelectorAll('.contentsMarked');
  let userNode = null;
  for (let i = marks.length - 1; i >= 0; i--) {
    if ((marks[i].textContent || '').includes(marker)) { userNode = marks[i]; break; }
  }
  if (!userNode) return empty;

  // 2) 取同一会话容器内、DOM 顺序上排在它后面的回答容器。
  //    页面布局是「一批 person 紧跟一批 robot」，所以紧随其后的 2~3 个 robot
  //    就是本轮的（同一轮常有一个僵尸容器 + 一个会收尾的容器）。
  const container = userNode.closest('.comments_box') || document;
  const robots = Array.from(container.querySelectorAll('.chat_box.robot'));
  const following = [];
  for (const r of robots) {
    if (userNode.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) {
      following.push(r);
      if (following.length >= 3) break;
    }
  }
  if (!following.length) return Object.assign({}, empty, {src: 'norobot'});

  // 3) 页面结构：.chat_box.robot > .txt.marked > { .thinking-btn, .thinking, .contentsMarked }
  //    这个页面有两个阶段，元素含义会变，实测结论：
  //      流式阶段：正文逐字写进 .thinking；.contentsMarked 里只有「正在打字的高亮片段」
  //                （3~5 个字，并且会在末尾重复渲染一遍）
  //      完成态  ：正文整体搬到 .contentsMarked（几百字）；.thinking 换成思考过程(reasoning)
  //    所以不能固定读某一个：
  //      · .contentsMarked 够长（>=20 字）→ 说明已收尾，读它最干净；
  //      · 否则说明还在流式输出 → 读 .thinking（那里才是正在累积的正文）。
  //    以前「正文为空就回退 .thinking」+「取最长候选」，恰好把两者的含义搞反了。
  const MARKED_READY = 20;
  const probe = (box) => {
    const btn = box.querySelector('.thinking-btn');
    const thinkEl = box.querySelector('.thinking');
    const markedEl = box.querySelector('.contentsMarked');
    const txtEl = box.querySelector('.txt.marked') || box.querySelector('.txt') || box;
    const think = ((thinkEl && thinkEl.textContent) || '').trim();
    const marked = ((markedEl && markedEl.textContent) || '').trim();
    const settled = hasContent(marked) && marked.length >= MARKED_READY;
    let answer = settled ? marked : think;
    if (!hasContent(answer)) {
      // 兜底：把 .txt 全文减掉状态条和（完成态的）思考过程
      let raw = ((txtEl && txtEl.textContent) || '');
      if (btn) {
        const label = btn.textContent || '';
        if (label) raw = raw.replace(label, '');
      }
      if (think && raw.includes(think)) raw = raw.replace(think, '');
      answer = raw.trim();
    }
    return {
      rid: box.id,
      answer: answer,
      think: think,
      answerLen: hasContent(answer) ? answer.length : 0,
      streaming: !settled,
      // 正文还完全没出来 = 还在思考/渲染，此刻不能当成"已结束"
      partial: !hasContent(answer),
    };
  };

  const probes = following.map(probe);
  let best = null;
  for (const p of probes) {
    if (!p.answerLen) continue;
    if (!best || p.answerLen > best.answerLen) best = p;
  }
  let fallback = null;
  for (let i = probes.length - 1; i >= 0; i--) {
    if (hasContent(probes[i].think)) { fallback = probes[i]; break; }
  }
  const chosen = best || fallback || probes[probes.length - 1];
  // 结构探针：把选中容器里所有「有实义文本的叶子节点」列出来，
  // 用来确认回答正文到底挂在哪个元素上（生成期与完成期结构不同）。
  const chosenBox = document.getElementById(chosen.rid);
  const domInfo = (() => {
    if (!chosenBox) return null;
    const txt = chosenBox.querySelector('.txt') || chosenBox.querySelector('.txt.marked');
    const thinkEl = chosenBox.querySelector('.thinking');
    const markedEl = chosenBox.querySelector('.contentsMarked');
    return {
      fullLen: (chosenBox.textContent || '').length,
      kids: Array.from(chosenBox.children).map((c) => ({
        c: String(c.className || c.tagName).slice(0, 30),
        l: (c.textContent || '').length,
      })),
      txtCls: txt ? String(txt.className) : null,
      txtLen: txt ? (txt.textContent || '').length : 0,
      txtTail: txt ? (txt.textContent || '').slice(-200) : '',
      thinkHead: thinkEl ? (thinkEl.textContent || '').slice(0, 150) : null,
      thinkLen: thinkEl ? (thinkEl.textContent || '').length : 0,
      markedCount: chosenBox.querySelectorAll('.contentsMarked').length,
      markedLen: markedEl ? (markedEl.textContent || '').length : 0,
    };
  })();
  // 页面是否还在生成：生成过程中输入框会套上一层遮罩（class 里带 denyInput），
  // 这是页面自己给的「忙」信号，比猜正文形状可靠得多。
  // 实测踩到的坑：页面中途停顿好几秒，正文看着「稳定」了，其实还在写 ——
  // 结果只读到 20 个字的半句（`好的，我理解您的问题。您希望反重力`）就返回给用户，
  // 而页面继续生成，下一个请求直接撞上「输入被禁用」报 502。
  const inputBusy = !!(document.querySelector('.denyInput'));
  return {
    found: true,
    rid: chosen.rid,
    src: best ? 'marked' : (fallback ? 'think' : 'empty'),
    text: best ? best.answer : '',
    think: fallback ? fallback.think : '',
    streaming: chosen.streaming,
    partial: chosen.partial,
    final: !!best && !chosen.streaming,
    inputBusy: inputBusy,
    robots: following.length,
    dbg: probes.map((p) => ({id: p.rid.slice(-6), a: p.answerLen, t: p.think.length, s: p.streaming})),
    dom: domInfo,
  };
}"""


# 确认收尾后，再取一次带换行的正文（innerText 会强制重排，所以只在最后调一次）
FINAL_TEXT_JS = """(rid) => {
  const box = document.getElementById(rid);
  if (!box) return '';
  const markedEl = box.querySelector('.contentsMarked');
  const marked = ((markedEl && (markedEl.innerText || markedEl.textContent)) || '').trim();
  // 完成态：正文已经搬进 .contentsMarked（流式阶段那里只有几个字的高亮片段）
  if (marked.length >= 20) return marked;
  const thinkEl = box.querySelector('.thinking');
  const think = ((thinkEl && (thinkEl.innerText || thinkEl.textContent)) || '').trim();
  if (think) return think;
  return marked;
}"""


# 轮询脚本自身的错误：以前 page.evaluate 抛异常会被静默吞成 found:false，
# 表现是「页面永远没反应」，排查时完全看不出真正原因。这里记下来并只报一次。
poll_error = {"message": ""}


def poll_answer(page, marker: str) -> dict:
    """廉价轮询：返回本轮回答容器的纯文本（尚未出现时 found 为 False）。"""
    try:
        result = page.evaluate(POLL_JS, {"marker": marker})
    except Exception as exc:  # noqa: BLE001 - 轮询失败不能中断整轮
        message = str(exc).splitlines()[0]
        if message != poll_error["message"]:
            poll_error["message"] = message
            log(f"轮询脚本执行失败（页面结构可能变了）：{message}")
        return {"found": False, "src": "evalerror", "text": ""}
    if not isinstance(result, dict):
        return {"found": False, "src": "badresult", "text": ""}
    return result


def read_final_text(page, rid: str) -> str:
    """收尾后取一次带换行的正文。"""
    if not rid:
        return ""
    try:
        value = page.evaluate(FINAL_TEXT_JS, rid)
        return str(value or "")
    except Exception:
        return ""


THINKING_PATTERN = re.compile(r"(?:思考已完成|已深度思考)[，,]?\s*耗时\s*\d+\s*秒\s*")
BUSY_PATTERN = re.compile(r"思考中[.。…]*\s*")


def page_username(page) -> str:
    """取页面上的当前用户显示名（回答容器里会夹带这个名字）。"""
    try:
        value = page.evaluate(
            "() => { const el = document.querySelector('div.user_name');"
            " return el ? (el.innerText || '').trim() : ''; }"
        )
        return str(value or "").strip()
    except Exception:
        return ""


# 免责尾注的判据已抽到 `suda_text.py`，与 WebSocket 直连共用同一套
# （直连不经过 broker，各自维护一份的话必然一边修一边漏）。
from suda_text import FOOTER_MAX_LEN, FOOTER_PATTERNS, is_footer_line  # noqa: E402,F401


def clean_answer(raw: str, username: str = "") -> str:
    """清掉作者名、思考状态、反馈按钮等页面噪音，只留回答正文。"""
    text = str(raw or "")
    text = THINKING_PATTERN.sub("", text)
    text = BUSY_PATTERN.sub("", text)
    text = re.sub(r"\d+\s*/\s*6000", "", text)

    lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if FEEDBACK_MARKER in stripped:
            break  # 反馈区之后的内容全部丢弃
        if not stripped:
            lines.append("")
            continue
        if stripped in FEEDBACK_WORDS:
            continue
        if is_page_noise(stripped):
            # 页面自己的错误提示条混在回答里（整条 / 独立一行）—— 丢掉。
            # 见 `is_page_noise`：判据保守（≤80 字 + 无句末标点 + 特征词），
            # 正常回答的正文行不会被误伤。
            continue
        if username and stripped == username:
            continue
        if stripped.startswith(("思考中", "思考已完成", "已深度思考", "正在思考")):
            continue
        lines.append(stripped)

    # 免责尾注只会出现在末尾，从尾部剥掉（避免误删正文中间的同句式内容）
    while lines:
        tail = lines[-1].strip()
        if not tail or is_footer_line(tail):
            lines.pop()
            continue
        break

    result = "\n".join(lines).strip()
    if username and result.startswith(username):
        result = result[len(username):].lstrip()
    while "\n\n\n" in result:
        result = result.replace("\n\n\n", "\n\n")
    return result


def looks_like_busy_only(text: str) -> bool:
    compact = compact_text(text)
    if not compact:
        return True
    for phrase in BUSY_PHRASES:
        if compact == phrase or (compact.startswith(phrase) and len(compact) <= len(phrase) + 12):
            return True
    return False


def is_meaningful_answer(text: str) -> bool:
    """回答里是否还有实质内容。

    页面的打字动画中间态会让正文通道只剩标点或 markdown 记号（实测抓到过 `**。`），
    这种绝不能当成答案——否则会把一个符号当最终回答交给用户。
    """
    return bool(re.sub(r"[\s\W_]+", "", str(text or ""), flags=re.UNICODE))


# ── 页面交互 ──────────────────────────────────────────────────────────
def locate_input(page):
    """定位聊天输入框，按候选选择器依次尝试。"""
    for selector in INPUT_SELECTORS:
        try:
            locator = page.locator(selector)
            count = locator.count()
            if count == 1:
                return locator
            if count > 1:
                return locator.last
        except Exception:
            continue
    return None


def _input_cleared(textarea, wait: float = 0.0) -> bool:
    """输入框是否已经清空（清空 = 提交成功）。"""
    deadline = time.time() + wait
    while True:
        try:
            if not (textarea.input_value() or "").strip():
                return True
        except Exception:  # noqa: BLE001 - 输入框已消失也算提交成功
            return True
        if time.time() >= deadline:
            return False
        time.sleep(0.2)


def input_pending_text(page) -> str:
    """输入框里还留着的内容（非空说明那一发可能没送出去）。"""
    try:
        textarea = locate_input(page)
        if textarea is None:
            return ""
        return (textarea.input_value() or "").strip()
    except Exception:  # noqa: BLE001
        return ""


def input_blocked(page) -> bool:
    """页面是否给输入框套了遮罩（说明上一轮回答还在生成）。"""
    try:
        return bool(page.evaluate("() => !!document.querySelector('.denyInput')"))
    except Exception:  # noqa: BLE001
        return False


def wait_input_idle(page, limit: float | None = None) -> bool:
    """等页面把上一轮回答写完（遮罩摘掉）。"""
    deadline = time.time() + (limit if limit is not None else INPUT_IDLE_WAIT)
    while time.time() < deadline:
        if not input_blocked(page):
            return True
        time.sleep(0.6)
    return False


def send_prompt(page, prompt: str) -> None:
    """把提问写入输入框并提交；Enter 无效时回退到点击发送按钮。

    注意：这里**不**把「输入框没清空」当成硬失败。页面的输入框可能因为
    组件重渲染、异步清空等原因短暂留着文本，误判会触发一次代价很大的
    整页刷新重试。真正的判据交给上层——发送后页面必须出现带 marker 的提问，
    否则重发、再不行才自愈。
    """
    textarea = locate_input(page)
    if textarea is None:
        raise RuntimeError("未找到苏大网页输入框，请确认页面已加载完成。")

    # 输入框被禁用时 Enter 和点按钮都是静默无效的，先拦下来交给自愈逻辑。
    try:
        disabled = textarea.is_disabled(timeout=2_000)
    except Exception:  # noqa: BLE001
        disabled = False
    if disabled:
        raise PageStalledError("苏大页面输入框当前不可用，页面可能已进入异常状态。")

    # 页面还在生成上一轮回答时，会给输入框套一层 .denyInput 遮罩。
    # 遮罩没有 disable 元素（所以上面的 is_disabled() 仍是 False），
    # 但它挡住了点击 —— 原地傻等 15 秒后报一个看不懂的
    # "<div class=chat_txt denyInput> intercepts pointer events"，还拿不到自愈机会。
    # 这里主动认出来：先等它生成完（页面自己会摘掉遮罩），等不到再交给上层自愈。
    if input_blocked(page):
        log("输入框被遮罩挡住，页面仍在生成上一轮回答，先等它写完。")
        if not wait_input_idle(page):
            raise PageStalledError(
                f"苏大页面输入框持续被遮罩挡住（{INPUT_IDLE_WAIT:.0f} 秒未恢复）。"
            )

    try:
        textarea.click(timeout=5_000)
    except Exception:  # noqa: BLE001
        # 点到点不到都不影响：fill() 自己会聚焦并写入。别让点击成为硬失败。
        pass
    textarea.fill(prompt, timeout=30_000)
    time.sleep(0.2)  # 让 Vue 把内容同步进组件状态，否则 Enter 可能被吃掉
    textarea.press("Enter", timeout=15_000)
    if _input_cleared(textarea):
        return

    # Enter 可能被吃掉，再补一次
    try:
        textarea.press("Enter", timeout=8_000)
    except Exception:  # noqa: BLE001
        pass
    if _input_cleared(textarea):
        return

    # 仍然没清空：点发送按钮兜底（按钮不存在或被禁用才报错）
    clicked = page.evaluate(
        """() => {
            const re = /发送|send|submit/i;
            const items = Array.from(document.querySelectorAll('button,[role=button],a,div'));
            const target = items.find((el) => {
                const text = [el.innerText, el.textContent, el.getAttribute('aria-label'), el.title]
                    .filter(Boolean).join(' ');
                const rect = el.getBoundingClientRect();
                return re.test(text) && rect.width > 0 && rect.height > 0;
            });
            if (!target) return false;
            if (target.disabled) return false;
            target.click();
            return true;
        }"""
    )
    if not clicked:
        raise PageStalledError("已填入内容但未能提交（找不到可用的发送按钮）。")
    if not _input_cleared(textarea, wait=3.0):
        # 只记日志，不失败：交给「页面必须出现 marker」的判据决定是否重发/自愈
        log("提示：发送后输入框未清空，等待页面回显以确认是否真的发出去了。")


def page_turn(page, messages: list[dict], on_delta=None, timeout: float | None = None) -> dict:
    """发送一轮对话并抓取回答（单轮，不做截断续写）。

    说明：苏大页面的生成过程有"打字动画"中间态（会短暂出现 markdown 源码和
    重复字符），中间态不可靠，因此本函数只在文本稳定后回调一次 on_delta，
    给出的是完整、干净的回答正文。
    """
    prompt = latest_user_prompt(messages).strip()
    if not prompt:
        raise RuntimeError("消息为空，无法发送到苏大网页。")

    marker = f"[[SUDA_REQUEST_END_{uuid.uuid4().hex}]]"
    suffix = f"\n\n请直接回答上面的问题，不要复述上下文，也不要输出这一行标记。\n{marker}"
    prompt_to_send = clip_middle(prompt, PAGE_INPUT_LIMIT - len(suffix)) + suffix

    page.bring_to_front()
    username = page_username(page)
    # 只用 textContent 取一份"发送前"快照：innerText 会强制整页重排，
    # 页面历史累积后单次调用就能拖慢几百毫秒。
    body_before = page.evaluate("() => (document.body && document.body.textContent) || ''")

    sent_at = time.time()
    send_prompt(page, prompt_to_send)
    log("已发送请求，等待页面回显")

    answer = ""
    last_candidate = ""
    think_text = ""
    stable_since = 0.0
    # 页面错误提示条的现场（用于快速可见失败，见 PAGE_NOISE_GRACE）
    noise_text = ""
    noise_at = 0.0
    deadline = sent_at + (timeout if timeout is not None else CHAT_TIMEOUT)
    announced = False
    box_seen = False
    resent = False
    # 最近一次「把提问送进页面」的时刻。重发之后要重新计时，
    # 否则刚重发出去就会被静默失败判据当场判死。
    last_send_at = sent_at
    silent_failure = SilentFailureDetector(SILENT_STALL_LIMIT)
    last_rid = ""
    trace: list[dict] = []
    last_trace.clear()
    last_trace.append({
        "t": 0.0, "sent": prompt_to_send[-120:], "marker": marker,
        "body_before_tail": (body_before or "")[-200:],
    })

    # 页面在生成过程中会经过"打字动画"状态：此时 DOM 里会短暂出现
    # markdown 源码（`**加粗**`）和重复字符，等收尾重排后才是干净的正文。
    # 因此这里不推送中间态，而是等文本稳定下来再一次性给出完整回答。
    while time.time() < deadline:
        info = poll_answer(page, marker)
        elapsed = round(time.time() - sent_at, 2)
        rid = info.get("rid") or ""
        if rid:
            last_rid = rid
        is_final = False
        generating = False
        if info.get("found"):
            if not announced:
                announced = True
                box_seen = True
                log(f"已定位到本轮回答容器：{rid}")
            # ★ 原始文本要留着：`clean_answer` 会把提示条整行剥掉，之后就没法判噪音了
            raw_text = info.get("text") or ""
            raw_think = info.get("think") or ""
            candidate = clean_answer(raw_text, username)
            think_text = clean_answer(raw_think, username)
            is_final = bool(info.get("final"))
            # 页面还在生成的两类信号：
            #   1) .thinking-btn 不存在或仍显示「思考中」；
            #   2) 正文通道变成 partial —— .contentsMarked 正在被重写
            #      （实测：生成过程中正文通道会短暂只剩标点，此时 candidate 为空，
            #       如果只按"文本没变"判静止，就会在页面还在生成时提前收工）。
            generating = bool(info.get("streaming")) or bool(info.get("partial"))
        else:
            raw_text = ""
            raw_think = ""
            candidate = ""
            think_text = ""
        # 发送校验：发出去之后页面应该很快出现带 marker 的本轮提问。
        # 迟迟不出现说明这一发没生效（输入框被禁用、页面状态异常等），
        # 先原样重发一次，别傻等整个超时。
        if not box_seen and not resent and elapsed > SEND_VERIFY_LIMIT:
            resent = True
            # 只有「输入框里还留着刚才那段话」才说明真的没发出去。
            # 输入框已空 = 消息已提交，只是页面回显慢，重发会造成重复提问。
            if input_pending_text(page):
                log(f"发送后 {SEND_VERIFY_LIMIT:.0f} 秒仍未回显，且输入框仍有内容，重发一次。")
                try:
                    send_prompt(page, prompt_to_send)
                except Exception as exc:  # noqa: BLE001
                    raise PageStalledError(f"苏大页面未能接收本轮提问：{exc}") from exc
                last_send_at = time.time()
            else:
                log("输入框已清空，消息应已发出，继续等待页面回显。")
        # 静默失败快速识别：消息提交了、页面也不忙，却迟迟没有回显 ——
        # 这是「对话后端没接」的半可用状态，干等到 STALL_LIMIT 只是白等。
        # 正常回显只要 0.58 秒，所以 6 秒还没容器就足够异常，尽早交给上层刷新重发。
        if not box_seen:
            silent_elapsed = time.time() - last_send_at
            if silent_elapsed > SILENT_STALL_LIMIT and silent_failure.due(
                elapsed=silent_elapsed,
                box_seen=False,
                pending_text=input_pending_text(page),
                blocked=input_blocked(page),
            ):
                raise PageStalledError(
                    f"苏大页面已接受提问，但 {int(SILENT_STALL_LIMIT)} 秒内没有出现本轮"
                    "问答容器（输入框已清空、页面也不忙），页面可能处于半可用状态。"
                )
        # 卡死保护：重发之后仍然定位不到，就交给上层刷新页面重试。
        if not box_seen and resent and elapsed > STALL_LIMIT:
            raise PageStalledError(
                f"苏大页面 {int(STALL_LIMIT)} 秒内没有出现本轮问答容器，页面可能卡住了。"
            )
        if len(trace) < 400:
            row = {
                "t": elapsed,
                "found": bool(info.get("found")),
                "src": info.get("src"),
                "rid": rid,
                "final": is_final,
                "streaming": bool(info.get("streaming")),
                "partial": bool(info.get("partial")),
                "busy": bool(info.get("inputBusy")),
                "gen": generating,
                "raw": (info.get("text") or "")[:160],
                "think_len": len(think_text),
                "len": len(candidate),
            }
            if elapsed < 14:
                # 只在前 14 秒带容器级明细：调页面结构时全靠它
                row["dbg"] = info.get("dbg")
                row["dom"] = info.get("dom")
            trace.append(row)
            last_trace.append(row)

        # ★★ 提示条判定必须用**原始文本**（2026-10-05 修）：原来写的是
        #    `if candidate and is_page_noise(candidate)`，但 `clean_answer` 已经把
        #    提示条整行剥掉了 → `candidate` 是空串 → 这个条件**永远为假** →
        #    下面的宽限期不启动 → 用户要等满 THINK_PHASE_LIMIT(60s) 才看到失败，
        #    而不是设计的 8s。日志里这三条护栏 **0 次触发**就是这么来的。
        #    条件收窄成「正文一个字都不剩、而原始文本里确实有提示条」——
        #    回答里**引用**提示条（正文还有别的内容）不算页面故障。
        noise_line = page_noise_line(raw_text)
        if noise_line and not candidate:
            noise_text = noise_line
            if not noise_at:
                noise_at = time.time()
                log(f"页面返回错误提示条，已忽略：{noise_line[:60]}")
        # 页面明确报了错、且迟迟没有真回答：留 PAGE_NOISE_GRACE 秒给页面自愈，
        # 超了就可见失败 + 交给上层刷新重试，不再干等到 THINK_PHASE_LIMIT。
        if noise_at and not last_candidate and time.time() - noise_at > PAGE_NOISE_GRACE:
            if noise_line:
                raise PageStalledError(
                    f"苏大页面返回错误提示「{noise_text[:60]}」，本轮拿不到回答。"
                )
            # 提示条已经消失（页面在自愈、正文可能要来了）：撤掉计时，继续等正文。
            # 这样「先弹提示条、随后真的写出回答」不会被误判成故障。
            noise_at = 0.0
        if candidate and not looks_like_busy_only(candidate) and not is_meaningful_answer(candidate):
            # 只剩标点/符号 = 渲染中间态，丢掉继续等
            candidate = ""
        if candidate and not looks_like_busy_only(candidate):
            # 用「去掉空白和标点」的紧凑形式比较：页面重排时同一段文字会
            # 在空格/换行/markdown 记号上抖动，直接比原文会导致永远判不出静止。
            if compact_text(candidate) != compact_text(last_candidate):
                last_candidate = candidate
                stable_since = time.time()
            elif stable_since and time.time() - stable_since >= STABLE_LIMIT:
                # 正文连续 STABLE_LIMIT 秒没有变化 → 按理该收工了。
                # 但页面会在生成中途中停顿好几秒，只看「文本没变」会把半句当成完整回答。
                # 实测踩到：只读到 20 个字的半句（`好的，我理解您的问题。您希望反重力`）
                # 就返回给用户，而页面其实还在继续写；紧接着下一个请求撞上
                # 「输入框被遮罩挡住」直接 502。
                # 页面自己给的「忙」信号可靠得多：生成期间输入框会套上 .denyInput 遮罩，
                # 生成完才摘掉 —— 实测 busy 从 True 翻到 False 的时刻正好是正文定稿的时刻。
                if info.get("inputBusy") and elapsed < BUSY_GRACE:
                    stable_since = time.time()   # 页面还在写，重新计时
                    time.sleep(PAGE_POLL_INTERVAL)
                    continue
                break
        elif box_seen and not last_candidate and elapsed >= THINK_PHASE_LIMIT:
            raise NoAnswerError(
                f"本轮问答容器已出现，但 {int(THINK_PHASE_LIMIT)} 秒内没有读到任何正文。"
            )
        time.sleep(PAGE_POLL_INTERVAL)

    # 等页面重排结束：连续两次读到相同文本才算稳定
    if box_seen and (last_candidate or think_text):
        stable_reads = 0
        settle_deadline = time.time() + SETTLE_LIMIT
        settle_hard = time.time() + HARD_STABLE_LIMIT
        while time.time() < settle_deadline and time.time() < settle_hard:
            time.sleep(SETTLE_INTERVAL)
            info = poll_answer(page, marker)
            text = clean_answer(info.get("text") or "", username)
            if info.get("partial"):
                # 正文一点都没读到，说明还在思考/渲染：延长观察窗口
                stable_reads = 0
                settle_deadline = max(settle_deadline, time.time() + SETTLE_INTERVAL * 2)
                continue
            if not text:
                # 清完之后一个字都不剩 —— 包含「整条就是页面提示条」被 `clean_answer`
                # 整行剥掉的情形（所以这里不需要再判一次 `is_page_noise(text)`：
                # 清完的正文里**不可能**还有提示条，那样判永远是死代码）。
                # 收尾阶段只有在已经读到过正文时才会进来，因此不影响可见失败的时机。
                continue
            if text == last_candidate:
                stable_reads += 1
                if stable_reads >= 2:
                    break
                continue
            stable_reads = 0
            old_compact = compact_text(last_candidate)
            new_compact = compact_text(text)
            # 新读到的内容只是旧内容的片段 → 打字动画在回退，拒绝替换；
            # 其余情况都采用最新读到的内容（页面可能刚补上更完整的版本）。
            if new_compact and old_compact and new_compact in old_compact and len(new_compact) < len(old_compact):
                continue
            if len(text) > len(last_candidate) and old_compact and old_compact in new_compact:
                log("收尾阶段读到更完整的回答，采用新版本。")
            last_candidate = text
        # 页面稳定后再取一次带换行的排版文本；只有内容一致（仅排版差异）才采用
        formatted = clean_answer(read_final_text(page, last_rid), username)
        if formatted and compact_text(formatted) == compact_text(last_candidate):
            last_candidate = formatted
        elif (
            formatted
            and compact_text(last_candidate)
            and len(formatted) > len(last_candidate)
            and compact_text(last_candidate) in compact_text(formatted)
        ):
            log("收尾阶段拿到带排版的完整回答，采用。")
            last_candidate = formatted
        elif formatted and not last_candidate:
            last_candidate = formatted

    if not last_candidate and think_text and not page_noise_line(raw_think):
        # 正文通道（.contentsMarked）整轮都没读出内容，只能退回思考过程。
        # 这通常意味着页面版本变了或渲染异常，记下来便于排查。
        # ★ 用**原始**思考文本判噪音：`think_text` 已经过 `clean_answer`，
        #   拿它判 `is_page_noise` 永远是假（提示条早被剥掉了）。
        log("本轮没有读到正文通道内容，退回使用思考过程。")
        last_candidate = think_text
    if not last_candidate and noise_at:
        # 兜底：整轮只捞到页面错误提示条 —— 宁可报「拿不到回答」让上层刷新重试，
        # 也绝不能把错误提示当答案交付（2026-10-05 实测污染现场）。
        # ★ 这里**不能**写 `is_page_noise(last_candidate)`：`last_candidate` 来自
        #   `clean_answer`，提示条早被整行剥掉，那样判永远是死代码。
        #   改成看「本轮见过提示条且最终没拿到正文」这个事实。
        log(f"本轮抓到的是页面错误提示，已丢弃：{noise_text[:60]!r}")
        raise PageStalledError(
            f"苏大页面整轮只返回错误提示「{noise_text[:60]}」，拿不到回答。"
        )
    if last_candidate and not is_meaningful_answer(last_candidate):
        # 兜底：整轮只捞到标点/符号，宁可报错让客户端重试，也不能把符号当答案
        log(f"本轮只抓到无意义内容，已丢弃：{last_candidate[:40]!r}")
        last_candidate = ""
    if last_candidate:
        if on_delta:
            on_delta(last_candidate)
        answer = last_candidate
    if not answer:
        raise NoAnswerError("苏大网页没有返回可识别的回答，请确认页面已登录且能正常对话。")
    return {
        "data": {
            "chat": {
                "choices": [{
                    "message": {
                        "text": answer,
                        "role": "assistant",
                        "name": f"page-{int(time.time())}",
                    }
                }]
            }
        }
    }


# 结尾出现这些记号 = 明显话没说完（未闭合的加粗/代码块、悬空的标点或列表项）
_TRUNCATED_TAIL_RE = re.compile(
    r"(?:\*\*|__|```|，|,|、|：|:|；|;|…|\||\\|[-*+>]|\d+\.)$"
)

# 工具调用的完整形态：`TOOL: <名字>` 配 `COMMAND_BEGIN … COMMAND_END`。
# 这种文本以字母结尾（COMMAND_END 的 D），会被下面的「语义截断」误判 ——
# 2026-10-05 实测：页面模式下每轮工具调用都白跑一次补写；其中一次还把工具调用
# 和另一段完整回答拼在一起（added_chars=143），**直接污染了工具调用本身**。
_TOOL_CALL_BEGIN_RE = re.compile(r"COMMAND_BEGIN\b")
_TOOL_CALL_END_RE = re.compile(r"COMMAND_END\s*$")

# 「以代码/结果标识收尾」的完整短回答，例如实测样本
#   `文件 out.txt 已创建并写入内容 CONC-1-OK。读取结果如下：\n\nCONC-1-OK`
# （48 字，以字母 K 结尾）——含大写或数字的标识不是「话说到一半」。
_CODE_TAIL_RE = re.compile(r"([A-Za-z0-9][A-Za-z0-9._-]*)\s*$")
_SENTENCE_END_RE = re.compile(r"[。！？!?；;]")


def looks_like_complete_tool_call(text: str) -> bool:
    """整段是否是一个写完整的工具调用（不该当成「被截断的回答」去续写）。

    只有 `COMMAND_BEGIN` 和收尾的 `COMMAND_END` **都**在，才算完整；
    半截的（`COMMAND_BEGIN` 之后被切断）仍然交给截断判据去续写。
    """
    stripped = (text or "").strip()
    if not _TOOL_CALL_BEGIN_RE.search(stripped):
        return False
    return bool(_TOOL_CALL_END_RE.search(stripped))


def ends_with_code_token(text: str) -> bool:
    """结尾是否是一个「代码样」的标识，且前面已经写过完整句子。

    收窄到「含大写或数字 + 含分隔符或数字 + 不以分隔符结尾」，避免把
    `3.`（半截编号）、`out.txt`（纯小写）这类**仍然可能是截断**的结尾放过去。
    """
    stripped = (text or "").rstrip()
    m = _CODE_TAIL_RE.search(stripped)
    if not m:
        return False
    token = m.group(1)
    if len(token) < 2 or len(token) > 40:
        return False
    if token[-1] in "._-":
        return False
    if not re.search(r"[A-Z0-9]", token):
        return False
    if not re.search(r"[-_.0-9]", token):
        return False
    return bool(_SENTENCE_END_RE.search(stripped))


def looks_truncated(text: str) -> bool:
    """回答是否明显被截断（写到一半就停了）。

    苏大页面会把长回答停在中途，实测两次：
      `…有以下常见解决方案和诊断思路：\\n\\n**使用`
      `…将手机调至静音或飞行模式，放在视线之外。\\n每天列出最重要的三件事`
    后者停在汉字上——中文回答正常一定以句末标点收尾，所以「以汉字/字母结尾」
    本身就是很强的截断信号。

    ⚠️ 但这个语义信号会**误伤两类完整内容**（2026-10-05 实测，页面模式 8/8 条
    续写记录全是误判）：完整的工具调用、以代码/结果标识收尾的短回答。误判的代价
    不只是慢一倍——`merge_continuation` 会把补写内容拼上去，实测污染过一次工具调用。
    所以先做「结构性信号」（真截断照样拦），再放过这两类完整形态，最后才用语义信号。
    """
    stripped = (text or "").strip()
    if not stripped:
        return False
    # 页面错误提示条不是「被截断的回答」，别让它触发续写（2026-10-05 实测踩到：
    # 33 字的提示条被判截断 → 续写 → 把真答案拼在提示条后面交付）。
    if is_page_noise(stripped):
        return False
    # 结构性信号：多短都算（未闭合的加粗/代码块、括号不配对）。
    # 放在「完整形态」豁免之前 —— 半截的工具调用/JSON 括号不配对，必须仍然判截断。
    if stripped.count("**") % 2 == 1 or stripped.count("```") % 2 == 1:
        return True
    if stripped.count("{") != stripped.count("}") or stripped.count("[") != stripped.count("]"):
        return True
    # 完整形态豁免：写完整的工具调用、以代码/结果标识收尾的完整回答，
    # 都不是「写到一半停了」，不该触发续写。
    if looks_like_complete_tool_call(stripped) or ends_with_code_token(stripped):
        return False
    # 悬空的标点 / 列表记号 / 半截编号
    if _TRUNCATED_TAIL_RE.search(stripped):
        return True
    # 语义信号：内容够长却停在汉字/字母上，说明是被截断的（短句本来就可能不带句号）
    if len(stripped) >= 30 and re.search(r"[\u4e00-\u9fffA-Za-z]$", stripped):
        return True
    return False


def merge_continuation(head: str, tail: str) -> tuple[str, str]:
    """把补写内容接到已有回答后面，返回 (合并结果, 真正新增的增量)。

    页面上的模型看不到自己刚才输出了什么，所以补写可能：
      · 接着写（正常）→ 去掉重叠后拼接；
      · 把全文重写一遍 → 增量取「尾部多出来的部分」，避免正文重复。
    """
    head = (head or "").rstrip()
    tail = (tail or "").strip()
    if not tail:
        return head, ""
    # 补写轮如果拿回来的是页面错误提示条，绝不能拼进回答（2026-10-05 实测）。
    if is_page_noise(tail):
        return head, ""
    head_compact = compact_text(head)
    tail_compact = compact_text(tail)
    if not tail_compact or tail_compact in head_compact:
        return head, ""
    window = head[-240:]
    for size in range(min(len(window), len(tail)), 4, -1):
        if window[-size:] == tail[:size]:
            return head + tail[size:], tail[size:]
    joiner = "" if head.endswith(("\n", " ")) else "\n"
    return head + joiner + tail, joiner + tail


def build_continue_prompt(answer: str) -> str:
    """让页面把上一轮没写完的内容接着写完。"""
    if answer.lstrip().startswith("{"):
        return (
            "你上一条输出是一段被截断的 JSON。请只输出「还没写完的剩余部分」，"
            "包括缺失的引号和花括号，紧接着最后一个字符继续，"
            "不要重复已经输出过的内容，不要解释，不要加 Markdown 代码块。\n\n"
            "[已输出的开头]\n" + answer[-400:]
        )
    return (
        "你上一条回答在输出到一半时被截断了。请只输出「还没写完的剩余部分」，"
        "紧接着上一条回答的最后一个字继续写，"
        "不要重复已经输出过的内容，不要解释，不要重新开头。\n\n"
        "[上一条回答的结尾]\n" + answer[-400:]
    )


def chat_via_page(page, messages: list[dict], on_delta=None, timeout: float | None = None) -> dict:
    """发送一轮对话并抓取回答，回答被截断时自动让页面补写完整。"""
    result = page_turn(page, messages, on_delta=on_delta, timeout=timeout)
    answer = result["data"]["chat"]["choices"][0]["message"]["text"]

    # 兜底护栏：page_turn 已经会把页面提示条过滤掉，这里再挡一次 ——
    # 万一它以别的路径混进来，宁可报「拿不到回答」让上层刷新重试，
    # 也绝不能把错误提示条当答案交付（2026-10-05 实测污染现场）。
    if is_page_noise(answer):
        raise NoAnswerError(f"苏大页面返回的是错误提示而非回答：{answer[:60]}")

    for attempt in range(max(0, CONTINUE_LIMIT)):
        if not looks_truncated(answer):
            break
        log(f"回答疑似被截断（第 {attempt + 1} 次），请页面接着写完。")
        try:
            more = page_turn(
                page,
                [{"role": "user", "content": build_continue_prompt(answer)}],
                timeout=min(RETRY_TIMEOUT, CHAT_TIMEOUT),
            )
        except (PageStalledError, NoAnswerError) as exc:
            log(f"补写失败（{exc}），保留已抓到的内容。")
            break
        tail = more["data"]["chat"]["choices"][0]["message"]["text"]
        if is_page_noise(tail):
            log("补写轮拿到的是页面错误提示，已丢弃。")
            break
        merged, delta = merge_continuation(answer, tail)
        # ★ 先记录再判 delta（2026-10-05 修）：以前只在 delta 非空时记录，
        #   于是「补写没带来新内容 → 把 33 字的页面提示原样交付」这条最脏的出路
        #   **在 trace 里完全看不到**，只能靠猜。现在任何出路都留下现场原文。
        trace_tool("continue", {
            "attempt": attempt + 1,
            "head_chars": len(answer),
            "tail_chars": len(tail),
            "added_chars": len(delta),
            "head": answer[:200],
            "tail": tail[:200],
        })
        if not delta:
            log(f"补写没有带来新内容，停止。本轮交付的回答（{len(answer)} 字）：{answer[:80]!r}")
            break
        answer = merged
        if on_delta:
            on_delta(delta)

    result["data"]["chat"]["choices"][0]["message"]["text"] = answer
    return result


def latest_user_prompt(messages: list[dict]) -> str:
    for item in reversed(messages):
        if item.get("role") == "user" and item.get("content"):
            return str(item["content"])
    return str(messages[-1].get("content", "")) if messages else ""


def process_debug_queue(page) -> None:
    """在主线程里响应 /debug 与 /eval 请求。"""
    while True:
        try:
            task = debug_requests.get_nowait()
        except queue.Empty:
            return
        try:
            if task.get("reset"):
                task["result"] = {"reset": reset_conversation(page)}
            elif task.get("reload"):
                page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=120_000)
                task["result"] = {"url": page.url}
            else:
                js = task.get("js")
                task["result"] = page.evaluate(js) if js else collect_dom_report(page)
        except Exception as exc:  # noqa: BLE001
            task["result"] = {"error": str(exc)}
        finally:
            task["event"].set()


ROBOT_COUNT_JS = """() => {
  // 页面会同时挂着多个 .comments_box（当前会话 + 历史会话），历史那些是隐藏的。
  // 判断"当前会话是否干净"必须只数**可见**容器，否则永远等不到 0。
  const boxes = Array.from(document.querySelectorAll('.comments_box'));
  const vis = boxes.filter(b => b.offsetParent !== null);
  const scope = vis.length ? vis : boxes.slice(-1);
  return scope.reduce((n, b) => n + b.querySelectorAll('.chat_box.robot').length, 0);
}"""


VISIBLE_TURNS_JS = """() => {
  // 当前会话已经攒了多少轮提问（= 可见容器里的 person 数量）。
  const boxes = Array.from(document.querySelectorAll('.comments_box'));
  const vis = boxes.filter(b => b.offsetParent !== null);
  const scope = vis.length ? vis : boxes.slice(-1);
  return scope.reduce((n, b) => n + b.querySelectorAll('.chat_box.person').length, 0);
}"""


def visible_turn_count(page) -> int:
    try:
        return int(page.evaluate(VISIBLE_TURNS_JS) or 0)
    except Exception:  # noqa: BLE001
        return 0


def reset_conversation(page) -> bool:
    """开启一个全新会话，清空网页端累积的对话历史。

    网页端每问一轮就会往 DOM 里追加一组问答，累积几十轮后页面会明显变慢；
    而客户端本来就会重发完整历史，所以网页端的历史既冗余又拖性能。
    页面上有 `.newchat`（会话列表右侧的 + 号）可以开新会话。
    """
    try:
        before = int(page.evaluate(ROBOT_COUNT_JS) or 0)
    except Exception:  # noqa: BLE001
        before = -1
    if before == 0:
        return True  # 已经是干净会话

    clicked = False
    for selector in (".newchat", ".copilot_selects .el-icon-plus", ".el-icon-plus"):
        try:
            locator = page.locator(selector)
            if locator.count() > 0:
                locator.first.click(timeout=8_000)
                clicked = True
                break
        except Exception:  # noqa: BLE001
            continue
    if not clicked:
        log("页面上没有找到「新建会话」按钮，改用整页刷新。")

    deadline = time.time() + RESET_READY_TIMEOUT
    while time.time() < deadline:
        time.sleep(0.3)
        try:
            now = int(page.evaluate(ROBOT_COUNT_JS) or 0)
            ready = locate_input(page) is not None
        except Exception:  # noqa: BLE001
            continue
        if now == 0 and ready:
            log("已开启全新会话。")
            return True

    log("新会话未生效，回退到整页刷新。")
    try:
        page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=120_000)
    except Exception as exc:  # noqa: BLE001
        log(f"重置苏大页面失败：{exc}")
        return False
    return True


def reload_page(page, reason: str = "") -> bool:
    """整页刷新苏大页面，并等输入框重新就绪。"""
    tag = f"（{reason}）" if reason else ""
    try:
        page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=120_000)
    except Exception as exc:  # noqa: BLE001
        log(f"刷新苏大页面失败{tag}：{exc}")
        return False
    deadline = time.time() + RESET_READY_TIMEOUT
    while time.time() < deadline:
        try:
            if locate_input(page) is not None:
                log(f"苏大页面已刷新并就绪{tag}。")
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.5)
    log(f"刷新后输入框仍未就绪{tag}。")
    return False


def chat_via_page_resilient(page, messages: list[dict], on_delta=None) -> dict:
    """页面卡住 / 回答不可用时自动刷新重试一次。

    以前这里直接把「请刷新苏大页面后重试」抛给用户——用户看到的就是
    WorkBuddy 里一条 error report。其实刷新页面这件事程序自己能做，
    所以改成：卡住或没捞到可用回答 → 整页刷新 → 重发一次。
    """
    try:
        return chat_via_page(page, messages, on_delta=on_delta)
    except (PageStalledError, NoAnswerError) as exc:
        log(f"本轮需要自愈重试：{exc}")
        if not reload_page(page, "自愈重试"):
            raise
        log("已刷新页面，重新发送本轮提问。")
        return chat_via_page(page, messages, on_delta=on_delta, timeout=RETRY_TIMEOUT)


def process_chat_queue(page) -> None:
    """在主线程里串行处理网页对话，避免多请求互相串扰。"""
    global _turn_counter
    handled = False
    while True:
        try:
            task = chat_queue.get_nowait()
        except queue.Empty:
            break
        deltas = task.get("deltas")

        def push(text: str) -> None:
            if deltas is not None:
                deltas.put({"type": "delta", "text": text})

        try:
            # 新会话先把页面清干净：否则模型会接着上一段任务的进度往下干
            # （实测会跳过读取新任务的文件，直接给基于旧文件的结论）。
            # 标志由 API 层给出 —— broker 只收到一整段提示词，看不到消息角色，
            # 判不出会话边界。reset_conversation 在页面本来就干净时立即返回。
            if task.get("reset"):
                reset_conversation(page)
            task["result"] = chat_via_page_resilient(page, task["messages"], on_delta=push)
            handled = True
            _turn_counter += 1
            with lock:
                state["chats_served"] += 1
            if deltas is not None:
                deltas.put({"type": "done", "result": task["result"]})
        except Exception as exc:  # noqa: BLE001 - 需要把任何页面异常回传给调用方
            task["error"] = exc
            set_error(str(exc))
            if deltas is not None:
                deltas.put({"type": "error", "message": str(exc)})
        finally:
            task["event"].set()

    # 队列已清空，此时才收拾页面，避免把等待中的请求一起拖慢
    if handled and chat_queue.empty():
        if PAGE_RELOAD_EVERY_TURNS > 0 and _turn_counter % PAGE_RELOAD_EVERY_TURNS == 0:
            # 「新建会话」只换会话、不清理 DOM，隐藏容器会一直累积，
            # 所以每隔若干轮整页刷新一次，把页面彻底归零。
            reload_page(page, f"每 {PAGE_RELOAD_EVERY_TURNS} 轮定期清理")
        elif RESET_EACH_TURN:
            reset_conversation(page)
        elif visible_turn_count(page) >= CONVERSATION_TURN_LIMIT:
            # 就地累积到阈值才清，避免每轮重建会话导致「发送不生效」
            reset_conversation(page)


# ── 自动填表（仅在提供内置凭据时） ────────────────────────────────────
def try_fill_login(page, username: str, password: str) -> bool:
    if not username or not password or "auth.suda.edu.cn" not in page.url:
        return False
    user_box = None
    for selector in ('input[name="username"]', 'input[id="username"]', 'input[type="text"]'):
        locator = page.locator(selector)
        if locator.count() == 1:
            user_box = locator
            break
    password_box = None
    for selector in ('input[name="password"]', 'input[id="password"]', 'input[type="password"]'):
        locator = page.locator(selector)
        if locator.count() == 1:
            password_box = locator
            break
    if not user_box or not password_box:
        return False
    user_box.fill(username)
    password_box.fill(password)

    captcha = page.locator(
        'input[name*="captcha" i], input[id*="captcha" i], input[placeholder*="验证码"]'
    )
    if captcha.count() and captcha.first.is_visible():
        log("账号密码已自动填写，请在页面中完成验证码并登录。")
        return True

    clicked = page.evaluate(
        """() => {
            const re = /登录|登\\s*录|login|submit/i;
            const target = Array.from(document.querySelectorAll(
                'button,input[type=button],input[type=submit],a'
            )).find((el) => {
                const text = [el.innerText, el.value, el.id, el.className,
                              el.getAttribute('aria-label')].filter(Boolean).join(' ');
                const rect = el.getBoundingClientRect();
                return re.test(text) && rect.width > 0 && rect.height > 0;
            });
            if (!target) return false;
            target.click();
            return true;
        }"""
    )
    if not clicked:
        password_box.press("Enter")
    log("账号密码已自动填写并提交登录。")
    return True


def refresh_login_page(page) -> None:
    """清空页面凭据并重新走统一认证。"""
    try:
        page.context.clear_cookies()
    except Exception:
        pass
    for script in ("() => sessionStorage.clear()", "() => localStorage.clear()"):
        try:
            page.evaluate(script)
        except Exception:
            pass
    try:
        page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=120_000)
    except Exception as exc:
        log(f"重新打开登录页失败，稍后重试：{exc}")


def scrape_token(page) -> str:
    """从页面 storage / URL 中提取 access_token。"""
    try:
        return page.evaluate(
            """() => {
              const findToken = (value) => {
                if (!value) return '';
                try {
                  const parsed = JSON.parse(value);
                  if (parsed?.access_token) return parsed.access_token;
                  if (parsed?.accessToken) return parsed.accessToken;
                  if (parsed?.token?.access_token) return parsed.token.access_token;
                  if (parsed?.data?.access_token) return parsed.data.access_token;
                } catch (_) {}
                const match = String(value).match(/access[_-]?token["'=:\\s]+([^"',&\\s}]+)/i);
                return match ? match[1] : '';
              };
              try {
                const url = new URL(location.href);
                const fromUrl = url.searchParams.get('access_token')
                  || url.hash.match(/access_token=([^&]+)/)?.[1] || '';
                if (fromUrl) return decodeURIComponent(fromUrl);
              } catch (_) {}
              for (const storage of [sessionStorage, localStorage]) {
                for (let i = 0; i < storage.length; i += 1) {
                  const token = findToken(storage.getItem(storage.key(i)));
                  if (token) return token;
                }
              }
              return '';
            }"""
        ) or ""
    except Exception:
        return ""


# ── HTTP 接口 ─────────────────────────────────────────────────────────
def sse_frame(payload: dict) -> bytes:
    return ("data: " + json.dumps(payload, ensure_ascii=False) + "\n\n").encode("utf-8")


class BrokerHandler(BaseHTTPRequestHandler):
    server_version = "SudaBroker/2.0"

    def _json(self, status: int, body: dict) -> None:
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        if self.path == "/token":
            with lock:
                snapshot = dict(state)
            self._json(200 if snapshot["access_token"] else 401, snapshot)
            return
        if self.path == "/debug":
            task = {"event": threading.Event(), "result": None}
            debug_requests.put(task)
            if not task["event"].wait(30):
                self._json(504, {"error": "诊断请求超时"})
                return
            self._json(200, task["result"] or {})
            return
        if self.path == "/eval":
            self._json(404, {"error": "请用 POST /eval"})
            return
        if self.path == "/trace":
            self._json(200, {"ok": True, "trace": list(last_trace)})
            return
        if self.path in {"/status", "/health"}:
            with lock:
                snapshot = dict(state)
            self._json(200, {
                "ok": True,
                "port": PORT,
                "profile": str(PROFILE),
                "login_url": LOGIN_URL,
                **snapshot,
            })
            return
        self._json(404, {"error": {"message": "Not found"}})

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
            payload = json.loads(self.rfile.read(length) or b"{}") if length else {}
        except (ValueError, UnicodeDecodeError):
            payload = {}

        if self.path == "/chat":
            self.handle_chat(payload)
            return
        if self.path == "/eval":
            task = {"event": threading.Event(), "result": None,
                    "js": str(payload.get("js") or "")}
            debug_requests.put(task)
            if not task["event"].wait(30):
                self._json(504, {"error": "eval 超时"})
                return
            self._json(200, {"ok": True, "result": task["result"]})
            return
        if self.path == "/reload":
            task = {"event": threading.Event(), "result": None, "reload": True}
            debug_requests.put(task)
            if not task["event"].wait(60):
                self._json(504, {"error": "reload 超时"})
                return
            self._json(200, {"ok": True, "result": task["result"]})
            return
        if self.path == "/reset":
            task = {"event": threading.Event(), "result": None, "reset": True}
            debug_requests.put(task)
            if not task["event"].wait(90):
                self._json(504, {"error": "reset 超时"})
                return
            self._json(200, {"ok": True, "result": task["result"]})
            return
        if self.path in {"/invalidate", "/refresh"}:
            self.handle_invalidate(payload)
            return
        self._json(404, {"error": {"message": "Not found"}})

    def handle_invalidate(self, payload: dict) -> None:
        token = str(payload.get("access_token") or "")
        now = time.time()
        with lock:
            if token:
                invalid_tokens.add(token)
            state["access_token"] = ""
            state["updated_at"] = 0.0
            # 只重载页面（保留 SSO cookie）换新 token，别清 cookie 逼出统一认证登录页。
            state["force_reload"] = True
            state["invalidated_at"] = now
            snapshot = dict(state)
        self._json(200, {"ok": True, **snapshot})

    def handle_chat(self, payload: dict) -> None:
        messages = payload.get("messages") or []
        stream = bool(payload.get("stream"))
        deltas: "queue.Queue[dict] | None" = queue.Queue() if stream else None
        task = {
            "messages": messages,
            "model": payload.get("model", ""),
            # 是否先清页面再发送。由 API 层判定（只有它能看到带角色的完整历史），
            # 见 suda_api.starts_new_conversation / ResetOnce。
            "reset": bool(payload.get("reset")),
            "event": threading.Event(),
            "deltas": deltas,
            "result": None,
            "error": None,
        }
        chat_queue.put(task)

        if stream:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.end_headers()
            try:
                while True:
                    item = deltas.get()
                    kind = item.get("type")
                    if kind == "delta":
                        self.wfile.write(sse_frame({"type": "delta", "text": item["text"]}))
                        self.wfile.flush()
                        continue
                    if kind == "done":
                        self.wfile.write(sse_frame({"type": "done", "result": item["result"]}))
                    else:
                        self.wfile.write(sse_frame({"type": "error", "message": item.get("message", "")}))
                    self.wfile.flush()
                    break
            except (BrokenPipeError, ConnectionResetError):
                pass
            return

        # 等待预算必须覆盖「正常一轮 + 刷新页面 + 自愈重试一轮」，
        # 否则页面明明还在干活，HTTP 这一层就先 504 了（实测踩过这个坑）。
        wait_budget = CHAT_TIMEOUT + RESET_READY_TIMEOUT + RETRY_TIMEOUT + 60
        if not task["event"].wait(wait_budget):
            self._json(504, {"error": {"message": "苏大网页响应超时"}})
            return
        if task["error"]:
            self._json(502, {"error": {"message": str(task["error"])}})
            return
        self._json(200, task["result"])

    def log_message(self, *_args) -> None:
        pass


def serve() -> None:
    ThreadingHTTPServer(("127.0.0.1", PORT), BrokerHandler).serve_forever()


def browser_candidates() -> list:
    """按优先级列出可用的浏览器启动方式。

    只依赖 channel=msedge 是很脆的：Playwright 升级后内置 Chromium 版本号会变，
    系统 Edge 也可能因为 profile 被占用等原因启动失败，一旦回退到不存在的
    内置 Chromium，主线程就会直接崩掉（页面永远不就绪）。所以这里把
    「系统 Edge → 系统 Chrome → 内置 Chromium（扫目录）→ 交给 Playwright 自己找」
    都试一遍。
    """
    candidates: list = []
    if BROWSER_CHANNEL:
        candidates.append({"channel": BROWSER_CHANNEL})
    for path in (
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ):
        if os.path.exists(path):
            candidates.append({"executable_path": path})
    for name in ("msedge", "chrome"):
        candidates.append({"channel": name})
    root = os.path.join(os.environ.get("LOCALAPPDATA", ""), "ms-playwright")
    if os.path.isdir(root):
        for entry in sorted(os.listdir(root), reverse=True):
            if not entry.startswith("chromium-"):
                continue
            exe = os.path.join(root, entry, "chrome-win64", "chrome.exe")
            if os.path.exists(exe):
                candidates.append({"executable_path": exe})
    candidates.append({})  # 交给 Playwright 自己解析
    return candidates


def launch_browser(playwright, launch_kwargs):
    """依次尝试各种浏览器，全部失败时抛最后一个异常。"""
    last_error = None
    for attempt in range(1, 4):
        for option in browser_candidates():
            label = option.get("executable_path") or option.get("channel") or "内置 Chromium"
            try:
                context = playwright.chromium.launch_persistent_context(
                    str(PROFILE), **{**launch_kwargs, **option}
                )
                log(f"浏览器已启动：{label}")
                return context
            except Exception as exc:  # noqa: BLE001 - 逐个候选试错
                last_error = exc
                log(f"浏览器启动失败（{label}）：{str(exc).splitlines()[0]}")
        if attempt < 3:
            log(f"第 {attempt} 轮浏览器启动全部失败，5 秒后重试。")
            time.sleep(5)
    raise last_error if last_error is not None else RuntimeError("没有可用的浏览器")


# ── 主循环 ────────────────────────────────────────────────────────────
# ── GraphQL 抓包（临时诊断，SUDA_DEEPSEEK_CAPTURE_GRAPHQL=1 时启用）──
CAPTURE_GRAPHQL = os.getenv("SUDA_DEEPSEEK_CAPTURE_GRAPHQL") == "1"
_GRAPHQL_CAPTURE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "graphql_capture.log")


def _gql_payload_str(p):
    if isinstance(p, (bytes, bytearray)):
        try:
            return p.decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            return repr(p)[:4000]
    return str(p)[:4000]


def _gql_log(entry):
    if not CAPTURE_GRAPHQL:
        return
    try:
        with open(_GRAPHQL_CAPTURE_PATH, "a", encoding="utf-8") as _f:
            _f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        pass


def _capture_ws(ws):
    if "internal-graphql" not in ws.url and "copilot-api" not in ws.url:
        return
    # ★ Playwright 的 WebSocket 对象**没有 headers 属性**。直接访问会抛
    #   AttributeError，而它是在 page.on("websocket") 的事件回调里抛的，
    #   Playwright 会把它包装成 "Page.evaluate: ..." 一路冒到主流程 → 502。
    #   实测：`上游错误 502: Page.evaluate: 'WebSocket' object has no attribute 'headers'`
    #   —— 最坏的一种：**开了抓包调试开关，反而把主流程搞崩**。
    #   getattr + try 双保险：拿不到 headers 就只记 URL，绝不影响主流程。
    try:
        _hdrs = getattr(ws, "headers", None) or {}
        _gql_log({"kind": "ws_open", "url": ws.url,
                  "headers": {k: (v[:24] + "…" if k.lower() == "authorization" else v)
                              for k, v in _hdrs.items()}})
    except Exception as exc:  # noqa: BLE001
        _gql_log({"kind": "ws_open", "url": ws.url, "headers_error": str(exc)})
    try:
        ws.on("framesent",
              lambda f: _gql_log({"kind": "ws_send",
                                  "payload": _gql_payload_str(f.payload)}))
        ws.on("framereceived",
              lambda f: _gql_log({"kind": "ws_recv",
                                  "payload": _gql_payload_str(f.payload)}))
    except Exception as exc:  # noqa: BLE001
        _gql_log({"kind": "ws_error", "error": str(exc)})


def _gql_body(response):
    try:
        return response.text()[:4000]
    except Exception:  # noqa: BLE001
        return "<body-read-failed>"


def _capture_route(route, request):
    # 保留函数但不再使用（page.route 会暂停 SSE 请求、破坏页面初始化）。
    try:
        route.continue_()
    except Exception:  # noqa: BLE001
        pass


def _attach_gql_capture(page):
    if not CAPTURE_GRAPHQL:
        return
    # 备份：Playwright 原生 websocket 帧监听。必须在 page 创建后立即挂，
    # 才能抓到页面加载期建立的持久 WS 连接的帧（chat 发送就走这条 WS）。
    try:
        page.on("websocket", _capture_ws)
    except Exception as exc:  # noqa: BLE001
        _gql_log({"kind": "ws_hook_err", "error": str(exc)})
    try:
        # 用 CDP Network 域做纯观测（不拦截），能抓到 EventSource/SSE/WebSocket
        # 的网络层请求与帧，且不会像 page.route 那样暂停请求、破坏页面初始化。
        cdp = page.context.new_cdp_session(page)
        cdp.send("Network.enable")

        def _is_gql(u):
            # HTTP 层只关心 GraphQL 端点；WebSocket 帧由下方 webSocket* 监听
            # 单独、不限 URL 地记录（chat 发送就走那条 WS）。
            return "internal-graphql" in u or "copilot-api" in u

        def on_req(ev):
            req = ev.get("request", {})
            u = req.get("url", "")
            if _is_gql(u):
                _gql_log({
                    "kind": "request", "url": u[:400],
                    "method": req.get("method"),
                    "headers": {k: (v[:24] + "…" if k.lower() == "authorization" else v)
                                for k, v in req.get("headers", {}).items()},
                    "post": (req.get("postData") or "")[:8000],
                    "reqId": ev.get("requestId"),
                })

        def on_resp(ev):
            resp = ev.get("response", {})
            u = resp.get("url", "")
            if _is_gql(u):
                rid = ev.get("requestId")
                body = ""
                try:
                    body = cdp.send("Network.getResponseBody",
                                    {"requestId": rid}).get("body", "")[:8000]
                except Exception:  # noqa: BLE001
                    body = "<body-unavailable>"
                _gql_log({
                    "kind": "response", "url": u[:400],
                    "status": resp.get("status"),
                    "reqId": rid, "body": body,
                })

        def on_ws_created(ev):
            _gql_log({"kind": "ws_created", "url": ev.get("url", ""),
                      "requestId": ev.get("requestId")})

        def on_ws_sent(ev):
            _gql_log({"kind": "ws_send", "requestId": ev.get("requestId"),
                      "payload": _gql_payload_str(ev.get("response", {}).get("payloadData", ""))})

        def on_ws_recv(ev):
            _gql_log({"kind": "ws_recv", "requestId": ev.get("requestId"),
                      "payload": _gql_payload_str(ev.get("response", {}).get("payloadData", ""))})

        cdp.on("Network.requestWillBeSent", on_req)
        cdp.on("Network.responseReceived", on_resp)
        cdp.on("Network.webSocketCreated", on_ws_created)
        cdp.on("Network.webSocketFrameSent", on_ws_sent)
        cdp.on("Network.webSocketFrameReceived", on_ws_recv)
        # 兼容旧命名（部分 CDP 实现用 webSocketFrame 表示收到帧）
        try:
            cdp.on("Network.webSocketFrame", on_ws_recv)
        except Exception:  # noqa: BLE001
            pass
    except Exception as exc:  # noqa: BLE001
        log(f"抓包监听(CDP)挂载失败：{exc}")


def main() -> None:
    PROFILE.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=serve, daemon=True).start()
    log(f"登录代理已启动：http://127.0.0.1:{PORT}")
    log("正在打开苏大页面，请在浏览器窗口中完成统一身份认证（首次可能需要验证码）。")

    with sync_playwright() as playwright:
        username, password = embedded_login()
        launch_kwargs = {
            "headless": HEADLESS,
            "args": ["--disable-blink-features=AutomationControlled"],
        }
        # 浏览器起不来时不能直接退出，否则接口活着但永远没有页面，
        # 请求会一直挂到超时。这里改成循环重试。
        while True:
            try:
                context = launch_browser(playwright, launch_kwargs)
                break
            except Exception as exc:  # noqa: BLE001
                log(f"浏览器启动彻底失败：{str(exc).splitlines()[0]}")
                log("60 秒后重试；请确认已安装 Microsoft Edge，或执行 playwright install chromium。")
                time.sleep(60)

        page = context.pages[0] if context.pages else context.new_page()
        current_page["page"] = page
        _attach_gql_capture(page)
        try:
            page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=120_000)
        except Exception as exc:
            log(f"打开苏大页面失败：{exc}")

        filled_url = ""
        announced = False
        # 页面「未就绪」持续了多久就自己重载（网络恢复后自动接上），
        # 详见 PageRetryTimer 的说明。
        page_retry = PageRetryTimer(PAGE_RETRY_DELAY)
        try:
            while True:
                if page.is_closed():
                    log("苏大页面窗口已关闭，正在自动重建。")
                    page = context.new_page()
                    current_page["page"] = page
                    _attach_gql_capture(page)
                    filled_url = ""
                    announced = False
                    try:
                        page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=120_000)
                    except Exception as exc:
                        log(f"重建页面失败：{exc}")
                        time.sleep(1)
                        continue

                process_debug_queue(page)
                process_chat_queue(page)

                with lock:
                    force_login = bool(state.get("force_login"))
                    if force_login:
                        state["force_login"] = False
                    force_reload = bool(state.get("force_reload"))
                    if force_reload:
                        state["force_reload"] = False
                if force_reload:
                    # token 过期（API 收到 401 会 POST /invalidate）：只重载页面，
                    # 保留 SSO cookie，让前端重跑 OIDC 静默换一张新 token。
                    log("token 已失效，正在重载页面换取新 token（保留登录 cookie）。")
                    announced = False
                    filled_url = ""
                    # 重载是为了换新 token；旧的「黑名单」作废，否则万一前端重发的
                    # 还是同一串（服务端仍认），会被永久挡在门外。
                    with lock:
                        invalid_tokens.clear()
                    try:
                        page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=120_000)
                    except Exception as exc:  # noqa: BLE001
                        log(f"重载换 token 失败：{str(exc).splitlines()[0]}")
                if force_login:
                    log("登录态可能失效，正在自动刷新登录。")
                    announced = False
                    filled_url = ""
                    refresh_login_page(page)

                if page.url != filled_url and try_fill_login(page, username, password):
                    filled_url = page.url

                token = scrape_token(page)
                needs_login = "auth.suda.edu.cn" in (page.url or "")
                with lock:
                    page_ready = not needs_login and locate_input(page) is not None
                    state["page_ready"] = page_ready
                    state["logged_in"] = bool(token) or page_ready

                # 网络恢复后自动接上：页面长时间没就绪就自己重新加载一次，
                # 不需要外部脚本或人工点 /reload。
                #
                # ★ 这里只能喂 `page_ready`，**不能**写成 `page_ready or token`。
                #   `PageRetryTimer.due(ready=True)` 会直接 reset 并返回 False，
                #   而 token 一旦拿到就长期有值 → 判据被顶成 True → 计时器永不触发。
                #   后果：「token 有效但页面卡死」时兜底静默失效、无法自愈，
                #   只能人工 POST /reload（2026-10-03 09:42 实测卡了 5 分钟）。
                #   两种写法只在「page_ready=False 且 token 有值」时不同 ——
                #   而登录页 / 断网时 token 本就为空，行为完全不变。
                # ★ 校外 WebVPN：CAS 会话过期时页面会落到统一身份认证登录页。
                #   这里自动填表登录，让 broker 自愈（否则永远卡在登录页、拿不到 token）。
                maybe_autologin(page)

                if page_retry.due(page_ready):
                    log(f"页面已 {PAGE_RETRY_DELAY:.0f} 秒未就绪，自动重新加载"
                        f"（网络恢复后会自动接上）。")
                    try:
                        page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60_000)
                    except Exception as exc:  # noqa: BLE001
                        log(f"自动重载仍未成功：{str(exc).splitlines()[0]}")

                if token:
                    with lock:
                        if token in invalid_tokens:
                            token = ""
                        else:
                            changed = token != state["access_token"]
                            state["access_token"] = token
                            state["updated_at"] = time.time()
                    # ★ token 一变就同步导出 cookie —— WS 直连通道用的就是这个文件，
                    #   必须是**本浏览器**的会话，否则永远「登录已过期」。
                    if changed:
                        export_wvpn_cookies(context)
                    if token and (changed or not announced):
                        log("认证已就绪，苏大 DeepSeek 可以调用了。")
                        announced = True
                elif not announced:
                    with lock:
                        page_ready = state["page_ready"]
                    if page_ready:
                        log("页面已就绪（未取到 token，将使用网页模式对话）。")
                        announced = True

                time.sleep(0.5)
        except KeyboardInterrupt:
            pass
        finally:
            with lock:
                state["access_token"] = ""
            context.close()


if __name__ == "__main__":
    main()
