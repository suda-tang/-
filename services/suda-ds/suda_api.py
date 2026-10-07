#!/usr/bin/env python3
"""苏州大学 DeepSeek → OpenAI 兼容接口（本机 127.0.0.1:8765）

对外提供：
  · GET  /health                 运行状态
  · GET  /v1/models              模型列表
  · POST /v1/chat/completions    OpenAI 兼容接口（支持真流式 SSE）
  · POST /v1/messages            Anthropic 兼容接口（WorkBuddy 自定义协议可选）
  · --mcp                        以 MCP stdio 服务运行

它通过本机登录代理 suda_broker.py 与 ds.suda.edu.cn 网页交互。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import threading
import time
import uuid
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Iterable, Iterator

from suda_text import strip_footer

# ── 配置 ──────────────────────────────────────────────────────────────
DEFAULT_MODEL = os.getenv("SUDA_DEEPSEEK_MODEL", "01JMP3EFD6EV6Q8QEXNHEH0FC4")
MODEL_ALIASES = {
    "suda-deepseek": DEFAULT_MODEL,
    "suda": DEFAULT_MODEL,
    "suda-deepseek-v4-flash": DEFAULT_MODEL,
    "苏大deepseek": DEFAULT_MODEL,
}
AUTH_BROKER = os.getenv("SUDA_DEEPSEEK_AUTH_BROKER", "http://127.0.0.1:8766/token")
# ★★★ 访问**本机** broker（127.0.0.1:8766）必须绕开系统代理 ★★★
# 为什么（2026-10-03 实测，会在下次开机引爆）：
#   唐老师机器上 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`（Clash，127.0.0.1:7897）
#   是**用户级环境变量** —— 任何从登录会话起的进程都会继承。
#   而 Python 的 `urllib` 会**老老实实走** `*_PROXY`，**不会**自动绕过 127.0.0.1。
#   实测（把 HTTP_PROXY 指向一个死端口）：
#       默认 urlopen      → URLError [WinError 10061] 由于目标计算机积极拒绝，无法连接。
#       ProxyHandler({})  → 200
#   后果：本文件里 3 处调 broker（读 token / invalidate / chat）全部失败 →
#         服务拿不到 token → 所有请求挂。而**守护进程的健康检查**（launcher.py）
#         也是默认 urlopen，会一起失败 → 守护认为服务死了 → **无限重启**。
#   所以凡是访问本机端口，一律走这个 opener。
_LOCAL_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
WS_URL = os.getenv(
    "SUDA_DEEPSEEK_WS_URL", "wss://ds.suda.edu.cn/copilot-api/internal-graphql"
)
WS_ORIGIN = os.getenv("SUDA_DEEPSEEK_WS_ORIGIN", "https://ds.suda.edu.cn")
TOKEN = os.getenv("SUDA_DEEPSEEK_TOKEN", "")
# 传输模式：默认走 WebSocket 直连（True = 走浏览器页面驱动）。
# 直连绕开页面 UI，少一层 DOM 轮询，速度和稳定性都更好；
# 需要时设 SUDA_DEEPSEEK_BROWSER_CHAT=1 退回页面驱动模式。
BROWSER_CHAT = os.getenv("SUDA_DEEPSEEK_BROWSER_CHAT", "0") != "0"
# 直连降级兜底：直连依赖上游的 GraphQL-over-WS 契约，一旦苏大改协议 / token 通道
# 异常，直连会整体不可用。此时若浏览器代理还在（页面仍开着），自动退回页面驱动，
# 做到「降级可用」而不是整站挂掉。设 SUDA_DEEPSEEK_WS_FALLBACK=0 可关闭。
WS_FALLBACK = os.getenv("SUDA_DEEPSEEK_WS_FALLBACK", "1") != "0"
# ── WebVPN 通道（校外 / 不在校园网时用）─────────────────────────────────
# ds.suda.edu.cn 只对校园网开放，校外要借道 wvpn.suda.edu.cn 的反向代理：
#   SUDA_DEEPSEEK_WS_URL=wss://wvpn.suda.edu.cn/https/webvpn<hash>/copilot-api/internal-graphql
#   SUDA_DEEPSEEK_WS_ORIGIN=https://wvpn.suda.edu.cn
# ★ 但光改地址不够：网关要求 WS 握手带上它自己的登录 cookie，否则会把 wss
#   重定向成 https，websockets 跟随后报
#   `InvalidURI: ... isn't a valid URI: scheme isn't ws or wss`（2026-10-06 实测）。
#   浏览器能连是因为它自带 cookie。所以这里必须补 Cookie 头。
# cookie 内容（一行，`a=1; b=2` 形式）放在 SUDA_DEEPSEEK_WS_COOKIE_FILE 指向的文件里，
# 也可直接放环境变量 SUDA_DEEPSEEK_WS_COOKIE。两者都没有时**不加头**（== 走直连，行为不变）。
WS_COOKIE_FILE = os.getenv("SUDA_DEEPSEEK_WS_COOKIE_FILE", "")


def _ws_extra_headers() -> dict:
    """WS 握手的附加头。仅当配置了 WebVPN cookie 时才带 Cookie，否则返回空（不影响直连）。"""
    cookie = os.getenv("SUDA_DEEPSEEK_WS_COOKIE", "").strip()
    if not cookie and WS_COOKIE_FILE:
        try:
            with open(WS_COOKIE_FILE, encoding="utf-8") as _fh:
                cookie = _fh.read().strip()
        except Exception:  # 文件没了/读不了就当没配，退回直连
            cookie = ""
    return {"Cookie": cookie} if cookie else {}
# 直连流式时「尾部压住不发」的字符数（见 `_stream_tail_guard`）。
# 上游的免责尾注只在**最后几个 delta** 出现（实测长回答 324 字，尾注从第 308 字开始，
# 最后 3 帧是「生成，」「仅作」「参考！」）。边收边发的话尾注早发出去了、收不回来，
# 所以尾部留一小段不发，收尾时剥掉尾注再补发。80 字足够放下一条 ≤45 字的尾注。
FOOTER_HOLD_CHARS = int(os.getenv("SUDA_DEEPSEEK_FOOTER_HOLD_CHARS", "80"))
# 工具协商：默认开启。只有「请求里带了 tools」时才会真正走工具决策，
# 所以普通问答不受影响。显式设置 SUDA_DEEPSEEK_TOOLS=0 可彻底关闭。
TOOL_MODE = os.getenv("SUDA_DEEPSEEK_TOOLS", "1") != "0"

TIMEOUT = float(os.getenv("SUDA_DEEPSEEK_TIMEOUT", "220"))
TOKEN_REFRESH_TIMEOUT = float(os.getenv("SUDA_DEEPSEEK_REFRESH_TIMEOUT", "180"))
# ★ 2026-10-06 实测推翻旧假设：6000 字只是网页「输入框」的前端 UI 限制，
#   服务端 graphql subscription 完全不校验长度。旧值 5800 是「模仿前端」的
#   保守截断，白白丢掉 80% 上下文。
#
# ★★ 上限实测（2026-10-06 21:00，方法：中间埋事实点 + 要求长输出，每档重复 3 次）：
#   限制的本质是 **token 数**（模型窗口约 128K），不是字符数 —— 所以同一字符数
#   在不同内容下表现完全不同：
#     真实文档（中文/代码混合，≈0.7 token/字）：180k 字 3/3 稳定，195k 可用，
#                                               200k 被网关直接拒（连接关闭）
#     token 密集内容（随机汉字，≈1.6 token/字）：70k 字 3/3 稳定，90k 起
#                                               立即 INTERNAL_ERROR
#   取 150000 作平衡：纯中文文档约 105k token（窗口 128K，留 ~18% 余量给输出），
#   而实际对话几乎不可能达到这个量级；真超了也只是被裁剪，不会报错。
WEB_PROMPT_LIMIT = int(os.getenv("SUDA_DEEPSEEK_WEB_PROMPT_LIMIT", "150000"))
# ★★★ 2026-10-06：下面这些「次级限制」全部按唐老师要求**去掉**。
#   原值（6 轮 / 600 字 / 1500 字 / 2000 字）都是「以为网页输入框只能输 6000 字」
#   时代的产物 —— 预算小，所以每处都得抠。现在已证明服务端根本不限长，
#   这些抠出来的值反而成了新瓶颈。统一改成「给足，由总预算兜底」：
#   build_browser_prompt 里**当前问题优先拿满预算**，历史从剩余空间装，
#   所以放宽这些不会挤掉当前问题。
WEB_CONTEXT_TURNS = int(os.getenv("SUDA_DEEPSEEK_WEB_CONTEXT_TURNS", "200"))
WEB_CONTEXT_MESSAGE_LIMIT = int(os.getenv("SUDA_DEEPSEEK_WEB_CONTEXT_MESSAGE_LIMIT", "60000"))
# system 指令上限：原 4000 会把 WorkBuddy 发来的长 system prompt（含工具约定、
# 行为规则）截掉一半，模型表现会莫名变差。云曲库上千首后 context 会打满，故抬到 120000；
# 仍受上游苏大模型窗口约束（≈128K token），超出会被模型拒，属硬上限非本端裁剪。
WEB_SYSTEM_LIMIT = int(os.getenv("SUDA_DEEPSEEK_WEB_SYSTEM_LIMIT", "120000"))
# ★★★ 2026-10-06 22:05 血的教训：工具模式的预算**不能**跟着主预算一起放大！★★★
# 该值一度被放到 120000（理由写的是「比普通通道低一档，防超模型窗口」），
# 结果实测当场打断了 agent 任务：
#   一个「28 个工具 + 51 条消息」的请求被拼成 **56609 字符**的 prompt →
#   模型在超长上下文里**失焦**，该调工具时只输出空话（"开始继续挖掘…"）→
#   服务判 fallback-rejected → WorkBuddy 报「模型没有给出有效动作（只说做不到）」。
# 对照证据（tool-trace.log 同一套代码）：
#   prompt_chars ≈ 11000 → agent 完全正常，稳定 parse 出 `TOOL: Write` / `TOOL: PowerShell`
#   prompt_chars ≈ 56609 → 只输出文本，零工具调用
# 结论：**工具模式是「精确指令遵循」任务，上下文越长越容易失焦**，
#   与普通对话（长文理解，可吃满 150000）是两回事，必须分开定值。
# 收到 10000（≈实测安全区 11000 以内，留余量）；清单预算 = 此值 × 40% = 4000。
WEB_TOOL_PROMPT_LIMIT = int(os.getenv("SUDA_DEEPSEEK_WEB_TOOL_PROMPT_LIMIT", "10000"))
# 工具清单上限：同理收回。注意**它在工具模式下并不生效** —— 调用处
# （build_tool_prompt，约 2713 行）显式传的是 `WEB_TOOL_PROMPT_LIMIT * 0.40`，
# 本值只作 format_tools_for_prompt 的默认参数。改它是为了一致性、避免误导。
# 实测 28 个工具的摘要实际约 3500 字，给 4000 刚好够且不挤占对话。
WEB_TOOL_SCHEMA_LIMIT = int(os.getenv("SUDA_DEEPSEEK_WEB_TOOL_SCHEMA_LIMIT", "4000"))

# ★★★ 2026-10-07（唐老师要求）：身份覆盖 ★★★
#
# 问题现场：直连 8765 问「你是谁？你是什么模型？」→
#   「你好！我是苏州大学AI智能助手，专门为苏州大学的师生提供快速、准确的信息咨询和服务。」
#
# 根因：上游苏大网页版**自带 system 身份**，而调用方给的 system 被我们塞进
#   `[必要指令]` 段 —— 那只是**用户消息的一部分**，优先级压不住上游自己的 system。
#   于是长上下文 / 刁钻问法（「你是苏州大学AI智能助手吗」）下模型会崩回上游身份。
#
# 修法：在 prompt **最前面**固定注入一段身份覆盖。
#   ★ 注入点选在 `build_browser_prompt()` 是**刻意**的 —— `model_once()`（工具模式）
#     也是把组装好的 prompt 包成一条 user 消息再走 `chat_ws` → `_ws_payload()`
#     → `build_browser_prompt()`，所以**在这一处注入即可覆盖全部路径**
#     （普通对话 / 工具模式 / 页面驱动）。
#   ★ 位置在 intro 之前；`clip_text` 是「留头 2/3 + 留尾 1/3」，所以这段永远在保留区。
#
# 环境变量可覆盖（唐老师换品牌名时改这里或设环境变量都行）：
#   SUDA_IDENTITY_OVERRIDE=0   关闭覆盖（将来给别的客户端用、不希望被改身份时）
#   SUDA_IDENTITY_NAME         默认 SUPERTANG AI
#   SUDA_IDENTITY_SCOPE        默认 唐秋鸣钢琴教学辅助系统
#   SUDA_IDENTITY_DENY         默认禁止的自称，用 | 分隔
IDENTITY_OVERRIDE = os.getenv("SUDA_IDENTITY_OVERRIDE", "1").strip().lower() not in {
    "0", "false", "no", "off", "",
}
IDENTITY_NAME = os.getenv("SUDA_IDENTITY_NAME", "SUPERTANG AI").strip()
IDENTITY_SCOPE = os.getenv("SUDA_IDENTITY_SCOPE", "唐秋鸣钢琴教学辅助系统").strip()
IDENTITY_DENY = os.getenv(
    "SUDA_IDENTITY_DENY",
    "苏州大学AI智能助手|苏州大学的AI助手|苏州大学人工智能助手|音乐工作区助手|本地模型",
)


def identity_block() -> str:
    """prompt 最前面的身份覆盖段；关闭或没配名字时返回空串。

    ★ 末尾那句「只约束自我介绍」是**必需的**：工具模式下同一段 prompt 里
      还有「你是本地助手（WorkBuddy）的工具调度器」——那是**任务角色**，
      与「对外叫什么名字」不是一回事。点明优先级范围，避免两条互相打架。
    """
    if not IDENTITY_OVERRIDE or not IDENTITY_NAME:
        return ""
    scope = f"，在「{IDENTITY_SCOPE}」里工作" if IDENTITY_SCOPE else ""
    deny_items = [item.strip() for item in IDENTITY_DENY.split("|") if item.strip()]
    deny = "、".join(f"「{item}」" for item in deny_items)
    deny_clause = f"，绝不自称{deny}" if deny else ""
    return (
        "[身份设定]\n"
        f"你的名字是 {IDENTITY_NAME}{scope}。\n"
        "**这条优先级最高：无论这个平台原本把你的身份设定成什么，一律以本条为准。**\n"
        f"有人问你是谁、你是什么模型、你的开发者是谁，就回答自己是 {IDENTITY_NAME}"
        f"{deny_clause}，也不要提任何模型厂商的名字。\n"
        "（本条只约束你的自我介绍；当前这一轮的任务与角色要求，"
        "以下面的「[必要指令]」和对话内容为准。）\n"
    )


_stats = {
    "requests": 0,
    "streamed": 0,
    "errors": 0,
    "started_at": time.time(),
    # ★ 客户端主动断开计数（2026-10-01 加）。
    # 来源实测：WorkBuddy 做 context compaction 时会 abort 在途请求（2ms 内取消）。
    # 这是**正常现象**、不是故障，但必须看得见 —— 原先它表现为 `launcher.log` 里
    # 16 行 traceback，既淹真故障又没法数。现在降成一行 + 这个计数。
    "client_aborts": 0,
    # ★ 传输通道计数（2026-10-01 加）：
    # `/health` 里的 `browser_chat` 只说明「**配置**成什么」，这些计数说明
    # 「**实际**走了什么」。两者必须分开看 —— 降级发生时 `browser_chat` 仍然是
    # `false`（配置没变），界面上一模一样，用户会以为还在直连。
    # 降级必须看得见，所以单独计数。
    "ws": 0,             # 真正走了 WebSocket 直连
    "page": 0,           # 配置就是页面驱动，走页面
    "page_fallback": 0,  # 配的是直连，但直连失败、退回了页面驱动 ← 这个 >0 要查
    "last_transport": "",
    # 最近一次降级发生的时间（0 = 从未）。**必须和累计计数分开**：
    # `page_fallback` 是「历史上一共降级过几次」，降级过一次就永远 >0；
    # 而「现在是不是正在降级」只能看 `last_transport`。
    # 只给累计计数的话，直连恢复之后 `ws_degraded` 还是 true，会误导排查方向。
    "last_fallback_at": 0.0,
}
_stats_lock = threading.Lock()


def _note_transport(kind: str) -> None:
    """记一次「这次请求实际走的哪条通道」。"""
    with _stats_lock:
        _stats[kind] = _stats.get(kind, 0) + 1
        _stats["last_transport"] = kind
        if kind == "page_fallback":
            _stats["last_fallback_at"] = time.time()

# 请求日志：把客户端（WorkBuddy）真实发来的请求体落盘，排障时能看清它到底发了什么
REQUEST_LOG_ENABLED = os.getenv("SUDA_DEEPSEEK_LOG_REQUESTS", "1") != "0"
REQUEST_LOG_PATH = os.getenv(
    "SUDA_DEEPSEEK_LOG_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "requests.log"),
)
_REQUEST_LOG_MAX_BYTES = int(os.getenv("SUDA_DEEPSEEK_LOG_MAX_BYTES", str(2 * 1024 * 1024)))
_request_log_lock = threading.Lock()

# ★ 观测一致性（2026-10-01 修）：**每处理一次请求，必须落一行请求日志**。
#
# 原来 `log_request` 里写的是 `messages[0].get("content")`，外面套一个
# `except Exception: pass`。只要客户端发的 `messages[0]` **不是 dict**
# （例如 `"messages": ["你好"]`），这一行就抛 AttributeError → 整条日志被吞 →
# **请求照常被服务、requests.log 里一个字都没有**。
#
# 代价（实测踩到）：tool-trace.log 里出现 3 次成对的 `tool-not-offered`，
# 而 requests.log 里**没有任何对应时刻的请求**，两边对不上号，
# 害我花了大半天才查清那些记录到底是谁发的（详见 check_request_log_gap.py）。
# 「日志失败绝不能影响正常请求」是对的，但**不能等于静默** ——
# 一次没记上的日志，比一条记歪的日志危险得多。
#
# 现在：①取值全部防御式（非 dict 一律当空串）；②真出异常就写一条
# `degraded: true` 的记录，并把计数暴露在 /health 的 `request_log_degraded`。
_request_log_degraded = 0


def _message_field(item: Any, key: str = "content") -> Any:
    """从一条 message 里安全取值 —— 元素不是 dict 时返回空串，绝不抛异常。"""
    return item.get(key) if isinstance(item, dict) else ""


def _append_request_log(line: str) -> None:
    """把一行 JSONL 追加进 requests.log（含体积轮转）。"""
    with _request_log_lock:
        try:
            if (
                os.path.exists(REQUEST_LOG_PATH)
                and os.path.getsize(REQUEST_LOG_PATH) > _REQUEST_LOG_MAX_BYTES
            ):
                os.replace(REQUEST_LOG_PATH, REQUEST_LOG_PATH + ".1")
        except OSError:
            pass
        with open(REQUEST_LOG_PATH, "a", encoding="utf-8") as handle:
            handle.write(line)


# ── 完整请求体存档（可选，默认关）──────────────────────────────────────
#
# 为什么需要它：`requests.log` 只存**摘要**（roles / 字数 / tools 计数 / 首尾预览），
# 排障够用，但**没法原样重放**。而「真实 WorkBuddy 客户端在直连模式下到底行不行」
# 这件事，靠复刻出来的「真实形状」永远只能算间接证据 —— 请求体的构造权在客户端手里，
# 它可能带任何我们没想到的字段。
#
# 唯一的办法：把它真正发过来的 body **完整**存下来，之后用
# `replay-request.py` 原样 POST 回本地接口。这样「真实客户端」就从**一次性**
# 变成**可复现**：今天验一次，改完代码明天还能再验一次，不用再求人手动点发送。
#
# 默认关的理由：单条真实请求可达 150KB+（45K 系统提示词 + 28 个工具 schema +
# 多轮历史），长会话跑一天就是几十 MB。不该默认开着占盘。
#   SUDA_DEEPSEEK_LOG_REQUESTS_FULL=1        打开
#   SUDA_DEEPSEEK_LOG_REQUESTS_FULL_PATH=... 改路径（默认 requests-full.jsonl）
#   ..._MAX_BYTES=...                        单条上限，超了**整条不存**并留痕（默认 2MB）
#   ..._ROTATE_BYTES=...                     文件上限，超了轮转（默认 64MB）
#
# ★ 还支持**标记文件**开关（同目录 `enable-full-log`）：存在即生效。
#   为什么要有它：服务常态是 VBS 自启动拉起的，那种情况下改环境变量很麻烦，
#   而「临时抓一轮真实客户端请求」应该是随手能做的事 ——
#       type nul > enable-full-log    打开
#       del enable-full-log           关掉
#   两种开关是「或」的关系：env 打开就一直开，标记文件适合临时开一轮。
REQUEST_FULL_ENABLED = os.getenv("SUDA_DEEPSEEK_LOG_REQUESTS_FULL", "0") != "0"
REQUEST_FULL_PATH = os.getenv(
    "SUDA_DEEPSEEK_LOG_REQUESTS_FULL_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "requests-full.jsonl"),
)
REQUEST_FULL_FLAG = os.getenv(
    "SUDA_DEEPSEEK_LOG_REQUESTS_FULL_FLAG",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "enable-full-log"),
)
_REQUEST_FULL_MAX_BYTES = int(
    os.getenv("SUDA_DEEPSEEK_LOG_REQUESTS_FULL_MAX_BYTES", str(2 * 1024 * 1024))
)
_REQUEST_FULL_ROTATE_BYTES = int(
    os.getenv("SUDA_DEEPSEEK_LOG_REQUESTS_FULL_ROTATE_BYTES", str(64 * 1024 * 1024))
)
# RLock 而不是 Lock：`log_request_full` 里要同时持锁递增 seq 和写盘，
# 用普通 Lock 会在嵌套获取时自锁。
_request_full_lock = threading.RLock()
_request_full_seq = 0
_request_full_degraded = 0


def _request_full_on() -> str:
    """存档是否生效。返回生效来源：`"env"` / `"flag"` / `""`（关）。

    每次请求现查（一次 `os.path.exists`，相对一次 LLM 调用可忽略），
    这样临时开关**不需要重启服务** —— 服务跑着的时候 touch 一下就能开始抓。
    """
    if REQUEST_FULL_ENABLED:
        return "env"
    try:
        if os.path.exists(REQUEST_FULL_FLAG):
            return "flag"
    except OSError:
        pass
    return ""


def _append_request_full(line: str) -> None:
    """把一行 JSONL 追加进 requests-full.jsonl（含体积轮转）。调用方须持锁。"""
    try:
        if (
            os.path.exists(REQUEST_FULL_PATH)
            and os.path.getsize(REQUEST_FULL_PATH) > _REQUEST_FULL_ROTATE_BYTES
        ):
            os.replace(REQUEST_FULL_PATH, REQUEST_FULL_PATH + ".1")
    except OSError:
        pass
    with open(REQUEST_FULL_PATH, "a", encoding="utf-8") as handle:
        handle.write(line)


def log_request_full(path: str, body: dict[str, Any], client: str = "") -> None:
    """把一次请求的**完整请求体**存档，供 replay-request.py 原样重放。

    存的是 `body` 序列化后的字符串（`body` 字段），replay 时直接把它当请求体发出去，
    不经过任何重新构造 —— 「原样」必须是字面意义上的原样。

    ★ 与 `log_request` 一样遵守「不许静默」：写失败要计数 + 打日志。
    ★ 超限的请求**整条不存**（而不是截断）：半截 JSON 重放不了，存了也是垃圾，
      不如留一条 `skipped` 记录明说「这条太大，把上限调大」。
    ★ `seq` 是**进程内的请求序号**（不是存档条数，重启归零）：在函数入口就占号，
      序列化失败 / 超限跳过的请求同样占号。价值是**让缺口可见** —— 存档里 seq 是
      1,2,5,6 就说明第 3、4 次没进来（被跳过或降级），去 `requests.log` 对那两条即可。
      （注意它**不是** requests.log 的行号 —— 那边没有 seq 字段，两边对不上号是踩过的坑。）
    """
    global _request_full_seq, _request_full_degraded
    if not _request_full_on():
        return
    at = time.strftime("%Y-%m-%d %H:%M:%S")
    with _request_full_lock:
        _request_full_seq += 1
        seq = _request_full_seq
    try:
        payload = json.dumps(body, ensure_ascii=False)
    except (TypeError, ValueError) as exc:
        _request_full_degraded += 1
        log(f"[log_request_full] 请求体序列化失败：{type(exc).__name__}: {exc}")
        return
    size = len(payload.encode("utf-8"))
    try:
        with _request_full_lock:
            if size > _REQUEST_FULL_MAX_BYTES:
                record: dict[str, Any] = {
                    "at": at,
                    "seq": seq,
                    "path": path,
                    "client": client,
                    "bytes": size,
                    "skipped": True,
                    "skipped_reason": (
                        f"请求体 {size} 字节 > 上限 {_REQUEST_FULL_MAX_BYTES}，"
                        f"未存档（可调大 SUDA_DEEPSEEK_LOG_REQUESTS_FULL_MAX_BYTES）"
                    ),
                }
            else:
                record = {
                    "at": at,
                    "seq": seq,
                    "path": path,
                    "client": client,
                    "bytes": size,
                    "body": payload,
                }
            _append_request_full(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:  # noqa: BLE001 - 存档失败绝不能影响正常请求，但也不能静默
        _request_full_degraded += 1
        log(f"[log_request_full] 写入 requests-full.jsonl 失败：{type(exc).__name__}: {exc}")


CHAT_SUBSCRIPTION = """
subscription chat(
  $messages: [ChatMessageInput!],
  $copilot: ID!,
  $filter: ChatFilter,
  $conversation: ConversationInput
) {
  chat(
    messages: $messages,
    copilot: $copilot,
    filter: $filter,
    conversation: $conversation
  ) {
    conversation { name text }
    relevantQuestions { name question }
    choices {
      message {
        text
        role
        name
        userMessage
        reasoning { duration content }
      }
    }
  }
}
"""


class UpstreamError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _ts() -> str:
    """日志时间戳。

    ★ 为什么必须加：`launcher.log` 原先只有 `[suda-api] xxx`，**没有时间戳**。
    要回答「某个时刻到底发生了什么」时，日志和 `requests.log`（有时间）根本对不上 ——
    实测定位一次客户端 abort 时，9 处 traceback 完全无法落到具体时刻，只能靠猜。
    排障日志没有时间戳，等于半个瞎。
    """
    return time.strftime("%Y-%m-%d %H:%M:%S")


def log(message: str) -> None:
    print(f"[{_ts()}] [suda-api] {message}", flush=True)


def _preview(value: Any, limit: int = 400) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[:limit] + f"…(+{len(text) - limit})"


# 真实工具的 schema 只存在于请求体里，不落盘的话本地测试就只能用手写的假工具集，
# 复现出来的场景和真实调用可能差很远（工具名、参数名、必填项全对不上）。
# 这里把「首次见到的工具清单 + 系统提示词」存档，让本地复现和真实调用完全一致。
TOOLS_SEEN_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools-seen.json")
_tools_seen_sig: str = ""


def capture_tools(tools: Any, messages: list[dict[str, Any]], model: str = "") -> None:
    """把客户端真实发来的工具清单存档（同一份只存一次，按签名去重）。"""
    global _tools_seen_sig
    if not isinstance(tools, list) or not tools:
        return
    try:
        names = [str((tool_function(item) or {}).get("name") or "") for item in tools]
        payload = json.dumps(tools, ensure_ascii=False, sort_keys=True)
        sig = f"{model}|{len(tools)}|{'/'.join(sorted(names))}|{len(payload)}"
        if sig == _tools_seen_sig:
            return
        system_prompt = ""
        for item in messages:
            if isinstance(item, dict) and item.get("role") == "system":
                system_prompt = content_to_text(item.get("content"))
                break
        data: dict[str, Any] = {}
        if os.path.exists(TOOLS_SEEN_PATH):
            try:
                with open(TOOLS_SEEN_PATH, encoding="utf-8") as handle:
                    loaded = json.load(handle)
                if isinstance(loaded, dict):
                    data = loaded
            except (OSError, ValueError):
                data = {}
        data[sig] = {
            "at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "model": model,
            "tool_count": len(tools),
            "tool_names": names,
            "system_prompt": system_prompt,
            "tools": tools,
        }
        with _request_log_lock:
            with open(TOOLS_SEEN_PATH, "w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
        _tools_seen_sig = sig
    except Exception:  # noqa: BLE001 - 存档失败绝不能影响正常请求
        pass


def log_request(path: str, body: dict[str, Any], client: str = "") -> None:
    """把一次请求的关键特征写成一行 JSONL，便于回看 WorkBuddy 的真实调用方式。

    ★ 不变式：**每处理一次请求，必须落一行日志**。字段取不全也要写一条
    `degraded: true` 的记录 —— 见 `_request_log_degraded` 上方的注释。
    """
    global _request_log_degraded
    if not REQUEST_LOG_ENABLED:
        return
    at = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        if not isinstance(body, dict):
            raise TypeError(f"请求体不是 dict：{type(body).__name__}")
        messages = body.get("messages") if isinstance(body.get("messages"), list) else []
        roles = [
            str(_message_field(item, "role") or "?")
            for item in messages
            if isinstance(item, dict)
        ]
        total_chars = sum(
            len(content_to_text(_message_field(item)))
            for item in messages
            if isinstance(item, dict)
        )
        record: dict[str, Any] = {
            "at": at,
            "path": path,
            "client": client,
            "model": body.get("model", ""),
            "stream": bool(body.get("stream")),
            "roles": roles,
            "message_count": len(messages),
            "total_chars": total_chars,
            "tools": len(body.get("tools") or []),
            "tool_choice": body.get("tool_choice"),
            "keys": sorted(str(key) for key in body.keys()),
            # ⚠️ 这里原来写的是 `messages[0].get("content")` —— 元素不是 dict 就炸，
            # 整条日志被下面的裸 except 吞掉。改用防御式取值。
            "first": _preview(_message_field(messages[0]) if messages else ""),
            "last": _preview(_message_field(messages[-1]) if messages else ""),
        }
    except Exception as exc:  # noqa: BLE001 - 取字段失败也必须留下痕迹
        _request_log_degraded += 1
        record = {
            "at": at,
            "path": path,
            "client": client,
            "degraded": True,
            "degraded_reason": f"{type(exc).__name__}: {exc}"[:200],
        }
        log(f"[log_request] 字段提取失败，已降级记录：{record['degraded_reason']}")
    try:
        _append_request_log(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:  # noqa: BLE001 - 写盘失败不能影响正常请求，但**不能静默**
        _request_log_degraded += 1
        log(f"[log_request] 写入 requests.log 失败：{type(exc).__name__}: {exc}")


# ── 通用工具函数 ──────────────────────────────────────────────────────
def content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text" and item.get("text") is not None:
                    parts.append(str(item["text"]))
                elif item.get("content") is not None:
                    parts.append(str(item["content"]))
            elif item is not None:
                parts.append(str(item))
        return "\n".join(p for p in parts if p)
    try:
        return json.dumps(content, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(content)


def clip_text(text: str, max_chars: int) -> str:
    """保留首尾、省略中间，适配苏大网页输入限制。"""
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
    return text[:head] + marker + text[-(keep - head):]


def role_label(role: str) -> str:
    return {"system": "系统", "user": "用户", "assistant": "助手", "tool": "工具结果"}.get(
        role, role or "消息"
    )


# WorkBuddy 的 user 消息里塞了很长的 <system-reminder>（实测一条 2000+ 字），
# 真正的 <user_query> 往往只有十几个字。不剥掉的话，对话预算几乎全被噪音吃掉。
# 实测后果：一条 84 条消息的真实会话里，模型完全看不到「反重力 = Antigravity」，
# 也看不到「是它自己把 config.json 改成 command(*) 通配才打不开的」，
# 于是反复问用户「反重力指的是什么？」「请您提供具体名称」。
_SYSTEM_REMINDER_RE = re.compile(r"<system-reminder\b[^>]*>.*?</system-reminder>", re.S | re.I)
_USER_QUERY_RE = re.compile(r"<user_query>(.*?)</user_query>", re.S | re.I)


def compact_user_text(text: str) -> str:
    """只留用户真正说过的话：优先取 <user_query>，否则剥掉 <system-reminder>。"""
    raw = str(text or "")
    queries = [item.strip() for item in _USER_QUERY_RE.findall(raw) if item.strip()]
    if queries:
        return "\n".join(queries)
    cleaned = _SYSTEM_REMINDER_RE.sub(" ", raw)
    return " ".join(cleaned.split())


# WorkBuddy 在**模型列表**里给自定义模型加了前缀（`availableModels` 里是
# `custom-local:01JMP...`），但它**发请求时用的是去掉前缀的裸名**（实测 862 次
# `suda-deepseek`、110 次裸 id，带前缀的一次都没有）。
# 一旦哪天它把带前缀的名字原样发过来，这个字符串会被直接当作 copilot id 交给上游：
#   java.lang.RuntimeException: copilot:custom-local:01JMP... does not exist
# 而后果**不是报错**，是**静默降级到页面驱动**（`transport.last == "page_fallback"`）：
# 功能还在、答案也对，只是慢且不稳，排查时极易看漏（实测就是这么被误导的）。
# 所以这里统一把客户端前缀剥掉，再走别名表。
_CLIENT_MODEL_PREFIXES = ("custom-local:", "custom:")


def resolve_model(model: str) -> str:
    model = (model or "").strip()
    if not model:
        return DEFAULT_MODEL
    lowered = model.lower()
    if lowered in MODEL_ALIASES:
        return MODEL_ALIASES[lowered]
    for prefix in _CLIENT_MODEL_PREFIXES:
        if lowered.startswith(prefix):
            rest = model[len(prefix) :].strip()
            if not rest:
                return DEFAULT_MODEL
            return MODEL_ALIASES.get(rest.lower(), rest)
    return model


def is_noisy_history(content: str) -> bool:
    """过滤上一轮残留的错误报告，避免污染网页 prompt。"""
    lowered = content.lower()
    markers = [
        "=== error report ===",
        "custom-model-502",
        "access_token:",
        "technical details",
        "request id:",
        "trace id:",
        "苏大网页没有返回可识别的回答",
    ]
    return any(marker in lowered for marker in markers)


def build_browser_prompt(
    messages: list[dict[str, Any]],
    limit: int = WEB_PROMPT_LIMIT,
    context_turns: int = WEB_CONTEXT_TURNS,
) -> str:
    """把 OpenAI 多轮历史压成一条受长度限制的网页提问。

    苏大网页输入框限 6000 字，而 WorkBuddy 会发送完整对话历史。
    这里优先保住「当前问题」，再用剩余预算装最近几轮上下文。
    """
    if limit <= 0:
        raise UpstreamError(400, "网页输入限制必须大于 0")

    system_parts: list[str] = []
    turns: list[tuple[str, str]] = []
    for item in messages:
        content = content_to_text(item.get("content"))
        if not content:
            continue
        role = str(item.get("role") or "user")
        if role == "system":
            system_parts.append(content)
        elif role in {"user", "assistant", "tool"}:
            turns.append((role, content))
    if not turns:
        return ""

    latest = len(turns) - 1
    for index in range(len(turns) - 1, -1, -1):
        if turns[index][0] == "user":
            latest = index
            break

    current_role, current_text = turns[latest]
    intro = (
        identity_block()
        + "你正在通过本地接口与用户进行多轮对话。"
        "下面的“最近上下文”可能因网页输入限制被裁剪；"
        "请优先回答“当前用户问题”，并自然延续上下文。"
    )
    system_text = clip_text("\n\n".join(system_parts), WEB_SYSTEM_LIMIT) if system_parts else ""
    system_section = ("\n\n[必要指令]\n" + system_text) if system_text else ""
    current_header = "\n\n[当前用户问题]\n"
    context_header = "\n\n[最近上下文]\n"
    current_prefix = f"{role_label(current_role)}："

    fixed = intro + system_section + current_header + current_prefix
    current_block = clip_text(current_text, max(1, limit - len(fixed)))
    without_context = fixed + current_block

    remaining = limit - len(without_context) - len(context_header)
    if remaining <= 40 or latest <= 0 or context_turns <= 0:
        return clip_text(without_context, limit)

    blocks: list[str] = []
    used = 0
    taken = 0
    for role, content in reversed(turns[:latest]):
        if taken >= context_turns:
            break
        if is_noisy_history(content):
            continue
        prefix = f"{role_label(role)}："
        separator = "\n\n" if blocks else ""
        available = remaining - used - len(separator) - len(prefix)
        if available <= 20:
            break
        block = separator + prefix + clip_text(content, min(available, WEB_CONTEXT_MESSAGE_LIMIT))
        blocks.append(block)
        used += len(block)
        taken += 1

    if not blocks:
        return clip_text(without_context, limit)
    return clip_text(
        intro + system_section + context_header + "".join(reversed(blocks))
        + current_header + current_prefix + current_block,
        limit,
    )


# ── 与登录代理通信（支持流式） ────────────────────────────────────────
def broker_endpoint(path: str) -> str:
    if AUTH_BROKER.endswith("/token"):
        return AUTH_BROKER[: -len("/token")] + path
    return AUTH_BROKER.rstrip("/") + path


# ── broker「最近一次读到过」的记录 ────────────────────────────────────
# ★★★ 为什么必须有这个（2026-10-03 现场教训）★★★
# broker 是**单线程**的：它正在服务一个页面请求（实测 13~20 秒）或正在重新加载页面时，
# `/token` 会**排队**，读不到。而 `read_broker_state()` 读不到就返回 `{}` ——
# **「broker 忙」和「broker 死了」在返回值上完全一样**。
# 后果有两处：
#   ① 守护进程的 `service_ok()` 看到 `broker_online=false` 就判「不健康」，
#      连续 3 次（约 45 秒）就把一个**完全健康**的服务杀掉 ——
#      实测 11:55:40 / 11:55:57 / 11:56:14 三次「接口无响应」，11:56:16 重启子进程，
#      而当时服务正在正常工作，只是 broker 在忙。**用户的在途任务被腰斩。**
#   ② `/health` 里 `read_broker_state()` 默认超时 2 秒，而守护的探测总超时也是 2 秒
#      —— **预算里没有余量**，broker 一忙必然被判「接口无响应」。
# 所以：单独记住「最近一次真的读到 broker 是什么时候」，让上层能区分
# 「现在忙」和「真的死了」。
_BROKER_STALE_AFTER = float(os.getenv("SUDA_DEEPSEEK_BROKER_STALE_AFTER", "60"))
_broker_last_ok_at = 0.0
_broker_last_state: dict[str, Any] = {}
_broker_state_lock = threading.Lock()

# ★★★ 启动宽限期：服务刚起来的前 N 秒，别让守护判死 ★★★
#
# 为什么（2026-10-04 05:0x 实测，`supervisor.log` 铁证）：
#   上游 `ds.suda.edu.cn` 断了 5 小时（23:56 ~ 05:01）。05:01:06 恢复的**那一刻**，
#   页面要重新加载 + 重新登录 —— 这个恢复过程**超过 45 秒**。
#   而守护每 15 秒探测一次、连续 3 次（= 45 秒）就 `terminate` 子进程：
#       05:03:20 探测失败（登录代理未就绪）第 1/3 次，先观察不重启。
#       05:03:36 第 2/3 次
#       05:03:52 连续 3 次探测失败（登录代理未就绪），重启子进程。   ← 打断恢复
#       05:04:01 连续 3 次探测失败，重启子进程。                    ← 又打断
#   → **重启把恢复过程打断 → 又从头开始 → 死循环**。
#   后果：上游明明恢复了，服务却又抖了 3 分钟 —— 同一时刻跑的
#   `_live_cli_search_task.sh` 第 2/3 次拿到的正是「尚未登录。请先运行苏大登录程序」。
#   而且每次重启都要杀浏览器 + 起新浏览器（内存峰值），
#   与并发的 Node CLI 叠加后还引发过 `Fatal process out of memory: Zone` / rc=134。
#
# ★ 为什么不直接改 `broker_recently_ok()`：那个函数表达的是**新鲜度**
#   （「最近 60 秒读到过吗」），语义干净，而且有测试守着
#   （`test_broker_busy_not_dead.py` [2] 断言「从未读到过 → False」）。
#   「启动宽限」是**另一个概念**，只在 `/health` 组装时叠加，不动那个函数。
#
# ★ 为什么放在子进程侧（而不是改守护的探测逻辑）：守护进程（PID 6640）是
#   脱离启动的孤儿进程，本机 `wscript` / `cscript` 都被安全策略拦，**杀掉就起不回来**。
#   放在子进程侧的好处是：守护下次拉起子进程时自动加载新代码，**不需要动守护**。
_SERVICE_STARTED_AT = time.time()
_STARTUP_GRACE = float(os.getenv("SUDA_DEEPSEEK_STARTUP_GRACE", "180"))


def broker_recently_ok() -> bool:
    """最近 `_BROKER_STALE_AFTER` 秒内读到过 broker（= 忙，不是死）。"""
    with _broker_state_lock:
        last = _broker_last_ok_at
    return last > 0 and (time.time() - last) < _BROKER_STALE_AFTER


def in_startup_grace() -> bool:
    """服务是否还在「启动宽限期」内（刚起来、broker 还在起步）。

    只用来在 `/health` 里叠加到 `broker_recently_ok` 字段上，
    让守护在上游恢复期**别把正在恢复的服务杀掉**。宽限期一过，判据恢复原样。
    """
    return (time.time() - _SERVICE_STARTED_AT) < _STARTUP_GRACE


def broker_last_state() -> dict[str, Any]:
    """最近一次成功读到的 broker 快照（可能是旧的，调用方自己判断新鲜度）。"""
    with _broker_state_lock:
        return dict(_broker_last_state)


def read_broker_state(timeout: float = 2) -> dict[str, Any]:
    global _broker_last_ok_at
    try:
        req = urllib.request.Request(
            broker_endpoint("/token"), headers={"Accept": "application/json"}
        )
        with _LOCAL_OPENER.open(req, timeout=timeout) as response:
            state = json.loads(response.read().decode("utf-8"))
            _remember_broker(state)
            return state
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            try:
                state = json.loads(exc.read().decode("utf-8"))
                _remember_broker(state)
                return state
            except (OSError, ValueError):
                return {}
        return {}
    except (OSError, ValueError, urllib.error.URLError):
        return {}


def _remember_broker(state: dict[str, Any]) -> None:
    """记下「刚读到 broker 了」。401 也算读到（broker 活着，只是没登录）。"""
    global _broker_last_ok_at, _broker_last_state
    with _broker_state_lock:
        _broker_last_ok_at = time.time()
        _broker_last_state = dict(state)


def get_token() -> str:
    return TOKEN or read_broker_state().get("access_token", "")


def wait_for_token(timeout: float, newer_than: float = 0, exclude: str = "") -> str:
    if TOKEN:
        return TOKEN
    deadline = time.time() + timeout
    while time.time() < deadline:
        snapshot = read_broker_state(timeout=2)
        token = snapshot.get("access_token", "")
        if token and token != exclude and float(snapshot.get("updated_at") or 0) > newer_than:
            return token
        time.sleep(1)
    return ""


def invalidate_token(token: str = "") -> float:
    invalidated_at = time.time()
    if TOKEN:
        return invalidated_at
    body = json.dumps({"access_token": token}).encode("utf-8") if token else b""
    try:
        req = urllib.request.Request(
            broker_endpoint("/invalidate"),
            data=body,
            method="POST",
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        with _LOCAL_OPENER.open(req, timeout=3) as response:
            invalidated_at = float(
                json.loads(response.read().decode("utf-8")).get("invalidated_at")
                or invalidated_at
            )
    except (OSError, ValueError, urllib.error.URLError):
        pass
    return invalidated_at


def starts_new_conversation(messages: list[dict[str, Any]]) -> bool:
    """客户端这次发来的历史里没有 assistant / tool 轮 → 这是一段新会话的第一轮。

    为什么需要单独判这个：网页端自己也在累积对话历史，而它的会话边界和客户端的
    会话边界**不是一回事**。实测（2026-10-01 08:02，12 步任务复测第 3 次）：

      - 第 2 次任务在第 5 轮断掉，页面只累积了 5 轮、没到
        `CONVERSATION_TURN_LIMIT=10`，所以没触发重置；
      - 紧接着第 3 次任务作为一个**全新请求**发过来（客户端只发了 1 条消息），
        模型却接着上一次的进度、第一个动作就是 `read_file p5.txt`，
        第 9 轮还说「我注意到序列中缺少 p1.txt 到 p4.txt」——
        它看到的是页面里残留的旧上下文。

    这比「模型答错」更危险：如果新任务换了一批文件，模型会把上一段任务读过的
    文件当成已经读过，**跳过读取、直接给出基于旧文件的结论**，而用户看不出来。
    客户端本来每轮都重发完整历史，页面历史既冗余又会误导模型，所以新会话先清干净。

    判据放在 **API 层**而不是 broker：broker 只收到一整段拼好的提示词
    （`{"role": "user", "content": prompt}`），看不到消息角色，判不出会话边界。

    取舍：对「每轮只发当前消息、不带历史」的客户端，这个判据每轮都为真、
    会每轮重置一次（更慢但结果正确）。主流客户端（含 WorkBuddy）每轮都带完整历史。
    """
    return not any(item.get("role") in ("assistant", "tool") for item in messages)


class ResetOnce:
    """「新会话只清一次页面」的小开关。

    一次客户端请求可能产生**多次**页面发送（工具决策 → 可能两次 strict 重试 →
    最终回答）。如果在每次发送前都清页面，不仅多花几次「新建会话」的点击，
    还会踩到已知的「清完立刻发送容易发送不生效」的坑 ——
    实测日志里就出现过「发送后 8 秒仍未回显，且输入框仍有内容，重发一次」。
    所以只在**第一次**发送前清。
    """

    def __init__(self, needed: bool) -> None:
        self._needed = bool(needed)

    def take(self) -> bool:
        """返回「这次要不要清」，并把开关熄掉（后续调用都返回 False）。"""
        if not self._needed:
            return False
        self._needed = False
        return True


def broker_chat_stream(
    prompt: str,
    model: str,
    reset_once: "ResetOnce | None" = None,
) -> Iterator[str]:
    """向登录代理发起流式对话，逐步 yield 新增文本。"""
    if not prompt.strip():
        raise UpstreamError(400, "消息为空，无法发送到苏大网页")
    body: dict[str, Any] = {
        "messages": [{"role": "user", "content": prompt}],
        "model": model,
        "stream": True,
    }
    if reset_once is not None and reset_once.take():
        # 让 broker 在发送前先开一个全新会话，清掉上一段任务残留的页面上下文
        body["reset"] = True
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        broker_endpoint("/chat"),
        data=payload,
        method="POST",
        headers={
            "Accept": "text/event-stream",
            "Content-Type": "application/json; charset=utf-8",
        },
    )
    try:
        response = _LOCAL_OPENER.open(request, timeout=TIMEOUT + 60)
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode("utf-8"))
            message = body.get("error", {}).get("message") or json.dumps(body, ensure_ascii=False)
        except (OSError, ValueError, UnicodeDecodeError):
            message = str(exc)
        raise UpstreamError(exc.code, message) from exc
    except (OSError, urllib.error.URLError) as exc:
        raise UpstreamError(
            502, f"无法连接登录代理（8766），请确认苏大登录程序正在运行：{exc}"
        ) from exc

    try:
        for raw in response:
            line = raw.decode("utf-8", "replace").strip() if isinstance(raw, bytes) else raw.strip()
            if not line.startswith("data:"):
                continue
            try:
                event = json.loads(line[5:].strip())
            except (ValueError, json.JSONDecodeError):
                continue
            kind = event.get("type")
            if kind == "delta":
                text = event.get("text") or ""
                if text:
                    yield text
            elif kind == "done":
                return
            elif kind == "error":
                raise UpstreamError(502, event.get("message") or "苏大网页返回错误")
    finally:
        response.close()


def broker_chat_once(
    prompt: str,
    model: str,
    reset_once: "ResetOnce | None" = None,
) -> dict[str, Any]:
    """一次性拿到完整回答。"""
    answer = ""
    for delta in broker_chat_stream(prompt, model, reset_once=reset_once):
        answer += delta
    return {
        "data": {
            "chat": {
                "choices": [{
                    "message": {"text": answer, "role": "assistant",
                                "name": f"page-{int(time.time())}"}
                }]
            }
        }
    }


# ── WebSocket 直连模式（需要有效 token） ──────────────────────────────
def text_looks_like_auth_error(text: str) -> bool:
    lowered = text.lower()
    return any(
        marker in lowered
        for marker in (
            "access_token", "authorization", "expired", "forbidden", "invalid token",
            "jwt", "login", "unauthorized", "无效", "失效", "过期",
        )
    )


def _ws_payload(messages: list[dict[str, Any]], model: str) -> dict[str, Any]:
    """复刻网页前端的发送格式：把多轮历史压成一条受长度限制的提问，
    再加上和页面保持一致的后缀 + 唯一 marker（模型被要求不要回显 marker）。
    网页前端会在用户问题外包裹这段 preamble，直连必须自己拼。"""
    prompt = build_browser_prompt(messages)
    if not prompt.strip():
        raise UpstreamError(400, "消息为空，无法发送到苏大 DeepSeek")
    marker = f"[[SUDA_REQUEST_END_{uuid.uuid4().hex}]]"
    suffix = "\n\n请直接回答上面的问题，不要复述上下文，也不要输出这一行标记。\n" + marker
    text = prompt + suffix
    return {
        "query": CHAT_SUBSCRIPTION,
        "variables": {
            "messages": [{"role": "user", "text": text}],
            "copilot": resolve_model(model),
            "filter": {},
            "conversation": {},
        },
    }


async def chat_ws_stream_with_token(
    messages: list[dict[str, Any]], model: str, token: str, meta: dict | None = None
) -> "AsyncIterator[str]":
    """直连 GraphQL-over-WebSocket，按 token 增量 yield 正文。

    graphql-ws 协议：connection_init → connection_ack → subscribe →
    next*（每个 next 的 message.text 是「增量 delta」，需累加；
    message.reasoning.content 是「全量快照」，取最后一次）→ complete。
    实测网页端会开两个 subscribe（第二个带重复消息），直连只开一个即可。
    认证走 ?access_token=<token>（与网页 WS 一致），不走 Bearer 头。
    """
    from websockets.asyncio.client import connect  # 延迟导入，网页模式不需要

    if meta is None:
        meta = {}
    payload = _ws_payload(messages, model)
    ws_url = f"{WS_URL}?access_token={token}"
    sub_id = uuid.uuid4().hex
    try:
        async with connect(
            ws_url,
            origin=WS_ORIGIN,
            subprotocols=["graphql-transport-ws"],
            user_agent_header=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"
            ),
            # 走 WebVPN 代理时补网关登录 cookie；直连时为空字典，行为与改动前一致。
            additional_headers=_ws_extra_headers(),
            open_timeout=20,
            close_timeout=5,
        ) as socket:
            await socket.send(json.dumps({"type": "connection_init"}))
            while True:
                init = json.loads(await asyncio.wait_for(socket.recv(), timeout=20))
                if init.get("type") == "connection_ack":
                    break
                if init.get("type") in {"connection_error", "error"}:
                    raise UpstreamError(401, json.dumps(init, ensure_ascii=False))
            await socket.send(json.dumps(
                {"id": sub_id, "type": "subscribe", "payload": payload},
                ensure_ascii=False,
            ))
            full = ""  # 已产出的正文（流式增量累加结果）
            seen_reasoning = False
            while True:
                event = json.loads(await asyncio.wait_for(socket.recv(), timeout=TIMEOUT))
                kind = event.get("type")
                if os.getenv("SUDA_DEEPSEEK_WS_DEBUG") == "1":
                    log(f"[ws] recv type={kind}: {str(event)[:400]}")
                if kind == "next":
                    body = event.get("payload")
                    if isinstance(body, dict) and body.get("errors"):
                        err = json.dumps(body, ensure_ascii=False)
                        raise UpstreamError(
                            401 if text_looks_like_auth_error(err) else 502, err
                        )
                    data = (body or {}).get("data") if isinstance(body, dict) else None
                    if isinstance(data, dict):
                        chat = data.get("chat") or {}
                        choices = chat.get("choices") or []
                        if choices:
                            # 结构是 choices[0].message（不是 choices[0]）。
                            # 实测：message.text 是「增量 delta」，但它会在末尾把最后一个
                            # token 重复发几次（实测 3 次）；而 message.reasoning.content
                            # 是「累计全文」，且与服务端存储的答案一致（无末尾重复）。
                            # 因此以 reasoning.content 为准，从中取新增部分做流式增量；
                            # 若该 copilot 不带 reasoning，则退回累加 text。
                            msg = (choices[0] or {}).get("message") or {}
                            reasoning = (msg.get("reasoning") or {}).get("content") or ""
                            if reasoning:
                                seen_reasoning = True
                                if reasoning.startswith(full):
                                    new_part = reasoning[len(full):]
                                else:
                                    new_part = reasoning  # 与已产出不一致则整体校正
                                full = reasoning
                                if new_part:
                                    yield new_part
                            elif not seen_reasoning:
                                delta = msg.get("text") or ""
                                if delta:
                                    full += delta
                                    yield delta
                            name = msg.get("name")
                            if name:
                                meta["name"] = name
                            meta["text"] = full
                elif kind == "complete":
                    break
                elif kind == "ping":
                    await socket.send(json.dumps({"type": "pong"}))
                elif kind in {"error", "connection_error"}:
                    raise UpstreamError(502, json.dumps(event, ensure_ascii=False))
    except asyncio.TimeoutError as exc:
        raise UpstreamError(504, "苏大 DeepSeek 响应超时") from exc
    except UpstreamError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise UpstreamError(502, f"无法连接苏大 DeepSeek：{exc}") from exc


async def chat_ws_with_token(
    messages: list[dict[str, Any]], model: str, token: str
) -> dict[str, Any]:
    """一次性拿到完整回答（内部跑流式并累加增量）。"""
    meta: dict[str, Any] = {}
    text = ""
    async for delta in chat_ws_stream_with_token(messages, model, token, meta=meta):
        text += delta
    # 直连拿的是上游原始文本，尾注得自己剥（页面模式由 broker 的 clean_answer 剥）。
    # 不剥的话，长回答末尾会把「以上来源AI自动生成，仅作参考！」漏给用户。
    final = strip_footer(meta.get("text") or text)
    if not final.strip():
        raise UpstreamError(502, "上游未返回回答")
    return {
        "data": {
            "chat": {
                "choices": [{
                    "message": {
                        "text": final,
                        "role": "assistant",
                        "name": meta.get("name", f"ws-{int(time.time())}"),
                    }
                }]
            }
        }
    }


async def chat_ws_stream(
    messages: list[dict[str, Any]], model: str
) -> "AsyncIterator[str]":
    token = wait_for_token(timeout=2)
    if not token:
        raise UpstreamError(401, "尚未登录。请先运行苏大登录程序，并在页面中完成登录。")
    try:
        async for delta in chat_ws_stream_with_token(messages, model, token):
            yield delta
    except UpstreamError as exc:
        if TOKEN or not (exc.status in {401, 403} or text_looks_like_auth_error(str(exc))):
            raise
        invalidated_at = invalidate_token(token)
        token = wait_for_token(
            timeout=TOKEN_REFRESH_TIMEOUT, newer_than=invalidated_at, exclude=token
        )
        if not token:
            raise UpstreamError(401, "登录已过期，请完成登录/验证码后重试。") from exc
        async for delta in chat_ws_stream_with_token(messages, model, token):
            yield delta


# ★★ 瞬时断连的原样重试（2026-10-03 加）。
#
# 实测：`直连失败（无法连接苏大 DeepSeek：no close frame received or sent）` ——
# 一天里出现 3 次，**全部落在并发场景**（3 个 CLI 会话同时打过来那一步）。
# `no close frame received or sent` 是 websockets 的 `ConnectionClosedError`：
# 对端把 TCP 掐了、没走正常关闭握手，属**瞬时**故障（下一次请求往往就正常了）。
#
# 原来的行为是「一次失败就退回页面驱动」。但页面驱动**慢且不稳**（代码里自己写着），
# 为一次瞬时抖动付这个代价不划算 —— 而且降级会被 e2e 的 `ws_degraded` 断言抓住，
# 表现为「测试红了但产品其实没事」，浪费排查时间。
#
# 所以：**看着像瞬时断连就先原地重试一次**（短退避），仍失败才降级。
# 只在**非流式**路径重试 —— 流式已经吐过 delta，重试会重复输出，不能这么做。
_TRANSIENT_WS_HINTS = (
    "no close frame received or sent",
    "ConnectionClosed",
    "keepalive ping timeout",
    "connection reset",
    # ★ Windows 上**等价于** "connection reset" 的那一类：对端强关连接。
    #   为什么必须单独列（2026-10-04 统计 `launcher.log`）：
    #     `no close frame received or sent`  10 次   ← 命中重试 ✓
    #     `WinError 10054`（远程主机强迫关闭）**11 次** ← 当时**一条都不命中** ✗
    #   因为 Windows 抛出来的 `str(exc)` 是**中文**（`[WinError 10054] 远程主机强迫关闭了
    #   一个现有的连接。`），而提示表里只有英文 `"connection reset"` —— **匹配不到**。
    #   语义上它和 `no close frame` 完全一样（都是「连接建立后被掐断」），
    #   却白白降级到更慢更不稳的页面驱动。编号与中文描述**两条都列**：
    #   编号稳定、中文描述兜底（防编号格式变化）。
    "WinError 10054",
    "远程主机强迫关闭",
)
# ★ WebSocket close code 单独用**带数字边界**的正则匹配，**不能**当成普通子串。
#
# 为什么（2026-10-04 写 `test_ws_transient_retry.py` 时当场测出来）：
#   原来 1006 / 1011 直接放在 `_TRANSIENT_WS_HINTS` 里做子串匹配 ——
#   于是 Windows 的 `[WinError 10060]`（连接超时）/ `[WinError 10061]`（连接被拒绝）
#   **含有子串 "1006"**，被判成「瞬时掐断」→ 明明该快速失败，却白重试一次。
#   上游整机不可达时（实测 2026-10-04 00:09，TCP 443/80 全超时）就踩这个。
#   → 用 `(?<!\d)1006(?!\d)` 保证前后不接数字，`10060` 就不会再命中。
_WS_CLOSE_CODE_PAT = re.compile(r"(?<!\d)(?:1006|1011)(?!\d)")
_WS_RETRY_DELAY = 1.0


def is_transient_ws_error(exc: BaseException) -> bool:
    """这个直连错误是不是「瞬时断连」（值得原地重试一次）。"""
    text = f"{type(exc).__name__}: {exc}".lower()
    if any(hint.lower() in text for hint in _TRANSIENT_WS_HINTS):
        return True
    return bool(_WS_CLOSE_CODE_PAT.search(text))


async def chat_ws(messages: list[dict[str, Any]], model: str) -> dict[str, Any]:
    token = wait_for_token(timeout=2)
    if not token:
        raise UpstreamError(401, "尚未登录。请先运行苏大登录程序，并在页面中完成登录。")
    try:
        return await chat_ws_with_token(messages, model, token)
    except UpstreamError as exc:
        if TOKEN or not (exc.status in {401, 403} or text_looks_like_auth_error(str(exc))):
            # ★ 认证类之外的失败：先看是不是「瞬时断连」，是就原地重试一次。
            if is_transient_ws_error(exc):
                log(f"直连被瞬时掐断（{exc}），原地重试一次。")
                await asyncio.sleep(_WS_RETRY_DELAY)
                return await chat_ws_with_token(messages, model, token)
            raise
        invalidated_at = invalidate_token(token)
        token = wait_for_token(
            timeout=TOKEN_REFRESH_TIMEOUT, newer_than=invalidated_at, exclude=token
        )
        if not token:
            raise UpstreamError(401, "登录已过期，请完成登录/验证码后重试。") from exc
        return await chat_ws_with_token(messages, model, token)


def upstream_message(upstream: dict[str, Any]) -> dict[str, Any]:
    try:
        return upstream["data"]["chat"]["choices"][0]["message"]
    except (KeyError, IndexError, TypeError) as exc:
        raise UpstreamError(502, json.dumps(upstream, ensure_ascii=False)) from exc


# ── 传输层统一入口（页面模式 / WebSocket 直连模式） ──────────────────
# 工具决策、兜底重问等都需要「问一次模型拿一段文本」。这里按 BROWSER_CHAT
# 统一分流：页面模式走 broker 页面驱动；直连模式把 prompt 包成一条 user
# 消息走 GraphQL-over-WebSocket。这样工具协商在两个模式下都能工作。
def _page_driver_available() -> bool:
    """直连失败时能否退回页面驱动：需要降级开关打开 + 浏览器代理的页面就绪。

    直连只依赖 token（token 由 broker 从页面里刮出来）。broker 为了持续供 token，
    页面一直是开着的，所以直连模式下页面驱动这条路**天然还在**，可以直接兜底。
    """
    if not WS_FALLBACK:
        return False
    state = read_broker_state(timeout=3)
    return bool(state.get("page_ready") and state.get("logged_in"))


def model_once(prompt: str, model: str, reset_once: "ResetOnce | None" = None) -> str:
    if BROWSER_CHAT:
        _note_transport("page")
        upstream = broker_chat_once(prompt, model, reset_once=reset_once)
    else:
        try:
            upstream = asyncio.run(chat_ws([{"role": "user", "content": prompt}], model))
            _note_transport("ws")
        except UpstreamError as exc:
            if not _page_driver_available():
                raise
            log(f"直连失败（{exc}），退回页面驱动模式。")
            _note_transport("page_fallback")
            upstream = broker_chat_once(prompt, model, reset_once=reset_once)
    return upstream_message(upstream).get("text", "") or ""


def answer_message_once(
    converted: list[dict[str, Any]], model: str, reset_once: "ResetOnce | None" = None
) -> dict[str, Any]:
    """拿一次完整回答的 message（含正文 + name）。页面模式预拼 prompt，直连模式传原始多轮。"""
    if BROWSER_CHAT:
        prompt = build_browser_prompt(converted)
        if not prompt.strip():
            raise UpstreamError(400, "消息为空，无法发送到苏大网页")
        _note_transport("page")
        upstream = broker_chat_once(prompt, model, reset_once=reset_once)
    else:
        try:
            upstream = asyncio.run(chat_ws(converted, model))
            _note_transport("ws")
        except UpstreamError as exc:
            if not _page_driver_available():
                raise
            prompt = build_browser_prompt(converted)
            if not prompt.strip():
                raise
            log(f"直连失败（{exc}），退回页面驱动模式。")
            _note_transport("page_fallback")
            upstream = broker_chat_once(prompt, model, reset_once=reset_once)
    return upstream_message(upstream)


def _ws_stream_sync(converted: list[dict[str, Any]], model: str) -> Iterator[str]:
    """在后台线程里跑 async WebSocket 流，把正文增量通过队列同步 yield 出来。

    这样同步的 SSE 生成器也能拿到「边生成边推送」的效果，而不是等整段回答
    都回来再一次性吐出。
    """
    import queue as _queue

    out: "_queue.Queue[tuple[str, Any]]" = _queue.Queue()

    def _runner() -> None:
        async def _go() -> None:
            async for delta in chat_ws_stream(converted, model):
                out.put(("delta", delta))

        try:
            asyncio.run(_go())
        except BaseException as exc:  # noqa: BLE001
            out.put(("error", exc))
        finally:
            out.put(("stop", None))

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    while True:
        kind, value = out.get()
        if kind == "stop":
            break
        if kind == "error":
            raise value
        yield value


def _stream_tail_guard(chunks: Iterable[str]) -> Iterator[str]:
    """把流式增量的**尾部压住不发**，收尾时剥掉免责尾注再补发。

    为什么不能边收边发：上游尾注只在**最后几个 delta** 才出现
    （实测长回答 324 字，尾注从第 308 字开始，最后 3 帧是「生成，」「仅作」「参考！」）。
    边收边发的话尾注早就送给客户端了，收不回来。

    代价只是输出滞后 `FOOTER_HOLD_CHARS`（默认 80）个字，肉眼基本看不出来。
    """
    pending = ""
    for chunk in chunks:
        if not chunk:
            continue
        pending += chunk
        if len(pending) > FOOTER_HOLD_CHARS:
            emit = pending[:-FOOTER_HOLD_CHARS]
            pending = pending[-FOOTER_HOLD_CHARS:]
            if emit:
                yield emit
    tail = strip_footer(pending)
    if tail:
        yield tail


# ── 工具调用（可选） ──────────────────────────────────────────────────
# WorkBuddy / Claude Code 系的真实工具名。**只用于诊断**（见 `note_unoffered_tool`）：
# 区分「模型调了一个真实存在、但客户端这次没提供的工具」和「模型完全凭空编了个名字」。
KNOWN_TOOLS = {
    "Bash", "PowerShell", "TaskOutput", "Read", "Write", "Edit", "MultiEdit",
    "Glob", "Grep", "LS", "TodoWrite", "WebFetch", "WebSearch", "Agent",
}


def tool_name(tool: dict[str, Any]) -> str:
    if tool.get("type") == "function" and isinstance(tool.get("function"), dict):
        return str(tool["function"].get("name") or "")
    return str(tool.get("name") or "")


def tool_function(tool: dict[str, Any]) -> dict[str, Any]:
    if tool.get("type") == "function" and isinstance(tool.get("function"), dict):
        return tool["function"]
    return tool


def schema_params(schema: Any) -> str:
    """把 JSON Schema 的 parameters 压成 `字段: 类型` 的紧凑形式。

    原来的做法是把整个 parameters 原样 json.dumps，28 个工具能吃掉三四千字符；
    而苏大页面一旦提示词过长就会把回答截断。这里改成只保留字段名 + 类型
    （必填不加问号，可选加 `?`，枚举取前几个值），信息量够用、体积小得多。
    """
    if not isinstance(schema, dict):
        return ""
    props = schema.get("properties")
    if not isinstance(props, dict) or not props:
        return ""
    required = {str(item) for item in (schema.get("required") or [])}
    parts: list[str] = []
    for field, spec in props.items():
        spec = spec if isinstance(spec, dict) else {}
        kind = spec.get("type")
        if isinstance(kind, list):
            kind = "|".join(str(item) for item in kind)
        if not kind:
            if isinstance(spec.get("properties"), dict):
                kind = "object"
            elif "items" in spec:
                kind = "array"
            else:
                kind = "any"
        if kind == "array":
            item = spec.get("items")
            inner = ""
            if isinstance(item, dict):
                inner = str(item.get("type") or ("object" if "properties" in item else "any"))
            kind = f"array<{inner or 'any'}>"
        enum = spec.get("enum")
        if isinstance(enum, list) and enum:
            shown = "/".join(str(value) for value in enum[:5])
            kind = f"{kind}:{shown}"
        mark = "" if field in required else "?"
        parts.append(f"{field}{mark}: {kind}")
    text = ", ".join(parts)
    # ★ 2026-10-06：原来截到 300 字（那是「网页只能输 6000 字」时代的产物）。
    # 参数说明被砍的后果很严重 —— 模型不知道参数怎么写，就干脆不调工具。
    # 现在服务端不限长，工具清单也放开了，这里不再截断。
    return text


def param_names(schema: Any) -> str:
    """只列字段名（必填不加问号，可选加 `?`）——工具多时的最省空间形式。"""
    if not isinstance(schema, dict):
        return ""
    props = schema.get("properties")
    if not isinstance(props, dict) or not props:
        return ""
    required = {str(item) for item in (schema.get("required") or [])}
    return ", ".join(f"{field}?" if field not in required else str(field) for field in props)


def clip_short(text: str, max_chars: int) -> str:
    """短描述用简单截断。

    不用 clip_text：它会插入一段「中间内容已省略」的标记（20 多字符），
    对本来就只有几十字的工具描述反而是纯浪费。
    """
    text = " ".join(str(text or "").split())
    if max_chars <= 0:
        return ""
    return text if len(text) <= max_chars else text[:max_chars].rstrip() + "…"


def format_tools_for_prompt(tools: list[dict[str, Any]], limit: int = WEB_TOOL_SCHEMA_LIMIT) -> str:
    """渲染工具清单。

    **硬约束：每个工具都必须至少出现一行。**
    实测教训：28 个工具时只够给前 3~4 个带参数说明，其余只剩名字；
    模型看到 `PowerShell` 在名单里却不知道参数怎么写，就干脆不调工具，
    直接回「抱歉，我无法访问你电脑上的本地文件系统」——
    表现就是「只给答案不干活」。所以这里按「详细 → 紧凑 → 极简」三级降级，
    直到全部装下为止（宁可砍掉描述，也不能让工具没有参数说明）。
    """
    entries: list[tuple[str, str, Any]] = []
    for tool in tools:
        fn = tool_function(tool)
        name = str(fn.get("name") or "")
        if not name:
            continue
        entries.append((name, str(fn.get("description") or ""), fn.get("parameters")))
    if not entries:
        return ""

    header = "可用工具名：" + ", ".join(name for name, _, _ in entries) + "\n"
    # ★ 2026-10-06：描述原来砍到 60 / 24 字（「6000 字预算」时代的产物）。
    # 60 字会把工具描述的关键约束砍掉，模型因此误用工具。现在放到 300 / 120。
    # 三级降级仍然保留 —— 它的作用是「工具特别多时保证每个都露脸」，与预算大小无关。
    levels = (
        lambda n, d, p: f"- {n}({schema_params(p)}) {clip_short(d, 300)}".rstrip(),
        lambda n, d, p: f"- {n}({param_names(p)}) {clip_short(d, 120)}".rstrip(),
        lambda n, d, p: f"- {n}({param_names(p)})".rstrip(),
    )
    result = header
    for render in levels:
        blocks = [header]
        used = len(header)
        for name, desc, params in entries:
            line = render(name, desc, params)
            if used + len(line) + 1 > limit:
                break
            blocks.append(line)
            used += len(line) + 1
        result = "\n".join(blocks)
        if len(blocks) - 1 == len(entries):
            return result  # 这一级把所有工具都装下了
    return result  # 最省空间的一级仍装不全 → 返回已装下的部分（header 里仍有全名单）


_JSON_BAD_ESCAPE_RE = re.compile(r'\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})')


def repair_json_escapes(text: str) -> str:
    """网页 Markdown 渲染会把 JSON 里的双反斜杠吃成单反斜杠。

    例如模型写 `C:\\\\Users`，页面吐回来变成 `C:\\Users`，
    而 `\\U` 不是合法 JSON 转义，json.loads 会直接抛错。
    这里把非法转义补回双反斜杠再解析。
    """
    return _JSON_BAD_ESCAPE_RE.sub(r"\\\\", text)


def close_json_fragment(text: str) -> str:
    """给被截断的 JSON 补上未闭合的引号与括号。

    苏大页面在提示词较长时会「写到一半就停」，例如
    `{"tool_call":{"name":"Read","arguments":{"file_path":"C:/a.txt`
    ——只差几个闭合符号，补上后这份工具调用依然可用。
    """
    fragment = (text or "").strip()
    if not fragment:
        return ""
    starts = [index for index in (fragment.find("{"), fragment.find("[")) if index >= 0]
    if not starts:
        return ""
    fragment = fragment[min(starts):].rstrip()
    if not fragment:
        return ""
    stack: list[str] = []
    in_string = False
    escaped = False
    for char in fragment:
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char in "{[":
            stack.append("}" if char == "{" else "]")
        elif char in "}]":
            if stack and stack[-1] == char:
                stack.pop()
    suffix = ""
    if in_string:
        suffix += '"'
    suffix += "".join(reversed(stack))
    return fragment + suffix if suffix else ""


def extract_json_candidate(text: str) -> Any:
    raw = (text or "").strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
    candidates = [raw, _slice(raw, "{", "}"), _slice(raw, "[", "]")]
    # 截断的 JSON 放在最后：先试严格解析，失败了再用「补齐闭合」的宽松版本。
    candidates.append(close_json_fragment(raw))
    candidates += [repair_json_escapes(item) for item in candidates if item]
    for candidate in candidates:
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
    decoder = json.JSONDecoder()
    for source in (raw, repair_json_escapes(raw)):
        for index, char in enumerate(source):
            if char not in "{[":
                continue
            try:
                value, _ = decoder.raw_decode(source[index:])
                return value
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
    return None


def _slice(text: str, left: str, right: str) -> str:
    start = text.find(left)
    end = text.rfind(right)
    return text[start:end + 1] if start >= 0 and end > start else ""


# 参数名里带这些词的，视为「纯路径参数」，可借助磁盘存在性判断该不该补反斜杠
_PATH_KEYS = ("path", "file", "cwd", "dir", "folder", "location", "target", "root")
# 网页 Markdown 渲染把 `\.` 当转义序列吃掉：C:\Users\mail\.workbuddy → C:\Users\mail.workbuddy
_DOT_SEGMENT_RE = re.compile(r"(?<=[A-Za-z0-9_])(\.[A-Za-z][A-Za-z0-9_-]*)(?=[\\/])")


def _path_score(candidate: str) -> int:
    """给候选路径打分：2 = 自身存在，1 = 父目录存在，0 = 都不存在。"""
    try:
        if os.path.exists(candidate):
            return 2
        parent = os.path.dirname(candidate.rstrip("\\/"))
        if parent and os.path.isdir(parent):
            return 1
    except (OSError, ValueError):
        pass
    return 0


def repair_path_argument(text: str) -> str:
    """纯路径参数：用「哪个候选在磁盘上真的存在」判定，
    避免把本来就带点的目录名（C:\\a\\my.folder\\b.txt）误改成 my\\.folder。"""
    if not text or "\\" not in text:
        return text
    fixed = _DOT_SEGMENT_RE.sub(r"\\\1", text)
    if fixed == text:
        return text
    return fixed if _path_score(fixed) > _path_score(text) else text


def repair_command_text(text: str) -> str:
    """整条命令没法做存在性判定，沿用简单补回（实测有效）。"""
    if not text or "\\" not in text:
        return text
    return _DOT_SEGMENT_RE.sub(r"\\\1", text)


# 这几个工具的「搜索起点」参数必须是**目录**，不是文件。
_DIR_PATH_TOOLS = frozenset({"Grep", "Glob", "LS", "Search", "GlobSearch", "ListDirectory"})
_DIR_PATH_KEYS = ("path", "dir", "directory", "target_directory", "root", "cwd")


def normalize_tool_call(tool_call: dict[str, Any]) -> dict[str, Any]:
    """修复网页渲染对工具参数造成的破坏（所有工具，不只 PowerShell）。"""
    name = tool_call.get("name")
    arguments = dict(tool_call.get("arguments") or {})
    for key, value in list(arguments.items()):
        lowered = str(key).lower()
        if isinstance(value, str):
            if "command" in lowered:
                arguments[key] = repair_command_text(value)
            elif any(tag in lowered for tag in _PATH_KEYS):
                arguments[key] = repair_path_argument(value)
        elif isinstance(value, list) and any(tag in lowered for tag in _PATH_KEYS):
            arguments[key] = [
                repair_path_argument(item) if isinstance(item, str) else item for item in value
            ]

    # Grep / Glob / LS 的搜索起点必须是「目录」。
    # 实测踩坑：模型写 Grep(pattern="8765", path="C:/x/README.md")——
    # 把**文件路径**塞进了 path，工具自然什么都搜不到，返回「(无匹配)」，
    # 然后模型据此下结论「README.md 里包含 8765 的行数为 0 行」，
    # 而真实答案是 7 行。这里直接把文件换成它所在的目录。
    if str(name) in _DIR_PATH_TOOLS:
        for key in _DIR_PATH_KEYS:
            value = arguments.get(key)
            if isinstance(value, str) and value.strip() and os.path.isfile(value):
                parent = os.path.dirname(value) or "."
                basename = os.path.basename(value)
                arguments[key] = parent
                # 只把 path 换成目录还不够：搜索范围会放大到整个目录，
                # 模型在一堆文件的混杂结果里照样数错（实测答「1 行」，真实 7 行）。
                # Grep 有 glob 参数，用它把范围重新收回到那一个文件。
                if str(name) == "Grep" and not arguments.get("glob"):
                    arguments["glob"] = basename
                elif str(name) == "Glob":
                    pattern = str(arguments.get("pattern") or "").strip()
                    if not pattern or pattern in {"*", "*.*"}:
                        arguments["pattern"] = basename
                break

    if name != "PowerShell":
        tool_call["arguments"] = arguments
        return tool_call

    command = str(arguments.get("command") or "").strip()
    # 页面 Markdown 渲染会吞掉 $_. 里的下划线
    command = re.sub(r"\$\.(?=[A-Za-z_])", "$_.", command)
    # PowerShell 的 -Filter 需要通配符。模型常写成 -Filter '.py'（漏了 *），
    # 结果永远是空的，而它还会据此下结论说「这个目录没有文件」。这里补回 *。
    command = re.sub(r"(-Filter\s+['\"])\.([A-Za-z0-9]+)(['\"])", r"\1*.\2\3", command)
    command = re.sub(
        r"\|\s*Format-Table(?:\s+-AutoSize)?\s*$", "| ConvertTo-Json -Depth 6",
        command, flags=re.IGNORECASE,
    )
    if (
        "Get-ChildItem" in command
        and "ConvertTo-Json" not in command
        and not re.search(r"[|;]\s*(Measure-Object|Out-File|Set-Content|Export-)", command, re.I)
    ):
        command += " | ConvertTo-Json -Depth 6"
    arguments["command"] = command
    tool_call["arguments"] = arguments
    return tool_call


def coerce_tool_call(obj: Any, allowed: set[str]) -> dict[str, Any] | None:
    if isinstance(obj, list) and obj:
        return coerce_tool_call(obj[0], allowed)
    if not isinstance(obj, dict):
        return None
    for key in ("tool_call", "tool_calls"):
        if key in obj:
            return coerce_tool_call(obj[key], allowed)
    if isinstance(obj.get("function"), dict):
        merged = dict(obj["function"])
        if "arguments" not in merged and "arguments" in obj:
            merged["arguments"] = obj["arguments"]
        return coerce_tool_call(merged, allowed)
    name = str(obj.get("name") or obj.get("tool") or obj.get("tool_name") or "")
    if name and allowed and name not in allowed:
        # 大小写 / 空格不一致时对齐到请求里的规范名（网页模型常写成 read、Read ）
        for candidate in allowed:
            if candidate.lower() == name.strip().lower():
                name = candidate
                break
    if not name or (allowed and name not in allowed):
        return None
    arguments = obj.get("arguments", obj.get("args", {}))
    if isinstance(arguments, str):
        parsed = extract_json_candidate(arguments)
        arguments = parsed if isinstance(parsed, dict) else {}
    if not isinstance(arguments, dict):
        arguments = {}
    if not arguments:
        # 模型偶尔把参数平铺在顶层：{"name":"Read","file_path":"a.txt"}
        extra = {
            key: value for key, value in obj.items()
            if key not in {"name", "tool", "tool_name", "arguments", "args", "type", "id", "function"}
        }
        if extra:
            arguments = extra
    # 模型有时会把「工具名」和「完整调用 JSON」写两遍，例如
    #   TOOL: Read
    #   {"tool_call":{"name":"Read","arguments":{"file_path":"…"}}}
    # 于是 arguments 里又套了一层完整调用。这里解开，避免参数多包一层。
    if any(key in arguments for key in ("tool_call", "tool_calls", "function")):
        inner = coerce_tool_call(arguments, allowed)
        if inner:
            return inner
    return {"name": name, "arguments": arguments}


def note_unoffered_tool(text: str, allowed: set[str]) -> None:
    """解析失败时补一条诊断：模型是不是想调「客户端这次没提供」的工具？

    实测（2026-10-01 08:19，12 步任务复测第 1 次）：工具清单里只有
    read_file / write_file / list_dir，模型却两次调 `PowerShell` 去读 p10。
    当时 `KNOWN_TOOLS` 白名单把它放行了 → 转发给客户端 → 客户端执行不了、
    返回「未知工具」→ **模型不重试，而是把没读到的第 10 段编了出来**
    （写成「苏州的秋天，就这样慢慢深了」，素材其实是「天平山的枫叶，红得像一团火」）。

    所以现在改成严格校验：**只转发客户端确实提供的工具**。
    解析失败会走 strict 重试（重试提示词里带着完整工具清单），模型有机会改用对的工具。
    这条 trace 用来回答「这轮为什么解析不出工具调用」。
    """
    for candidate in re.findall(r"TOOL\s*:\s*([A-Za-z0-9_-]+)", text or ""):
        if candidate in allowed:
            continue
        _trace_tool("tool-not-offered", {
            "requested": candidate,
            "offered": sorted(allowed)[:40],
            "is_known_name": candidate in KNOWN_TOOLS,
        })
        return


def parse_tool_call(text: str, tools: list[dict[str, Any]]) -> dict[str, Any] | None:
    allowed = {tool_name(tool) for tool in tools if tool_name(tool)}
    if not allowed:
        return None
    block = re.search(
        r"TOOL\s*:\s*(PowerShell|Bash)\s+COMMAND_BEGIN\s+(.*?)\s+COMMAND_END",
        text or "", flags=re.IGNORECASE | re.DOTALL,
    )
    if block:
        canonical = "PowerShell" if block.group(1).lower() == "powershell" else "Bash"
        # 只认客户端这次真的提供了的工具：转发一个客户端执行不了的工具，
        # 只会让模型拿到报错、然后编造内容把洞补上（见 note_unoffered_tool）。
        if canonical in allowed:
            return normalize_tool_call({"name": canonical, "arguments": {"command": block.group(2).strip()}})
    generic = re.search(r"TOOL\s*:\s*([A-Za-z0-9_-]+)\s+(.+)$", text or "", flags=re.IGNORECASE | re.DOTALL)
    if generic:
        name = generic.group(1)
        arguments = extract_json_candidate(generic.group(2))
        # 混合写法「TOOL: Read」+ 完整 {"tool_call":{…}}：应该采用 JSON 里那份
        # 完整调用，而不是把整个 JSON 当成 arguments（否则参数会多包一层）。
        nested = coerce_tool_call(arguments, allowed)
        if nested:
            return normalize_tool_call(nested)
        if isinstance(arguments, dict) and name in allowed:
            return normalize_tool_call({"name": name, "arguments": arguments})
    parsed = coerce_tool_call(extract_json_candidate(text), allowed)
    if parsed:
        return normalize_tool_call(parsed)
    name_match = re.search(r'"name"\s*:\s*"([A-Za-z0-9_-]+)"', text or "")
    command_match = re.search(r'"command"\s*:\s*"(.*)"\s*}\s*}\s*}*\s*$', (text or "").strip(), flags=re.DOTALL)
    if name_match and command_match and name_match.group(1) in allowed:
        return normalize_tool_call(
            {"name": name_match.group(1), "arguments": {"command": command_match.group(1)}}
        )
    # ★★ 2026-10-03 补（坑 20）：模型「**假装调了工具**」—— 把调用**转写**在正文里 ★★
    #
    #   现场原文（20:56:59，客户端随后报 Error Code 10000「模型没有给出有效动作」）：
    #     「好的，我将开始执行这个多轮搜索任务，首先查找国内开设AI音乐相关博士点的学校。
    #        [已调用工具] WebSearch({"query": "国内 AI音乐 博士点 学校"})」
    #
    #   模型的意图**完全明确**（就是要搜这个关键词），但它写成了转写体而不是真的
    #   工具调用。旧逻辑四种格式都认不出来 → parsed=null → 触发 strict 重试 →
    #   它改去写长篇计划 → 最后说「这超出了合理的工作边界」→ 客户端判定无效动作。
    #
    #   既然意图明确，就把它**提取成真的工具调用**，别让一次能救回来的请求变成报错。
    #   安全边界：工具名必须在客户端本次提供的清单里（allowed），参数必须是合法 JSON 对象。
    for candidate in re.finditer(
        r"([A-Za-z][A-Za-z0-9_]*)\s*\(\s*(\{.*?\})\s*\)", text or "", flags=re.DOTALL
    ):
        cname = candidate.group(1)
        if cname not in allowed:
            continue
        args = extract_json_candidate(candidate.group(2))
        if isinstance(args, dict) and args:
            return normalize_tool_call({"name": cname, "arguments": args})
    note_unoffered_tool(text, allowed)
    return None


def message_to_text(item: dict[str, Any]) -> str:
    """把一条消息压成纯文本；只有 tool_calls 没有正文时，渲染成可读的调用记录。"""
    content = content_to_text(item.get("content"))
    if content:
        return content
    calls = item.get("tool_calls")
    if isinstance(calls, list) and calls:
        parts: list[str] = []
        for call in calls:
            fn = (call or {}).get("function") or {}
            parts.append(f"{fn.get('name') or '工具'}({fn.get('arguments') or '{}'})")
        return "[已调用工具] " + "; ".join(parts)
    return ""


# 工具结果里出现这些字样，说明**命令本身写错了**，而不是「真的没有数据」。
# 模型（苏大 DeepSeek）在这点上特别容易犯错：它会把 PowerShell 的语法错误
# 当成「查询结果为空」，然后直接下结论「这个目录没有 .py 文件」。
# 实测原话：`if (...) { ... } | ConvertTo-Json -Depth 6` → ParseError →
# 模型连续两次原样重试 → 最终回答「目录下没有 .py 文件（Count 为 0）」。
_TOOL_ERROR_MARKERS = (
    "所在位置", "字符:", "解析错误", "语法错误",
    "parseerror", "parsererror", "at line:", "char:",
    "无法将", "无法识别", "不是内部或外部命令", "不是可识别的",
    "commandnotfound", "is not recognized", "parameterbinding",
    "missingargument", "找不到路径", "未找到路径", "cannot find path",
    "itemnotfound", "无法找到", "路径不存在",
    "没有权限", "access is denied", "unauthorizedaccess",
    # ★ 2026-10-03 补：「技能/工具不存在」这一类（见 README「坑 19」）。
    #   现场的漏判直接导致唐老师「几乎每次」拿到「模型没有给出有效动作」：
    #     Error: Can not find skill: "挖导师". Also checked for slash command ...
    #   这段里既没有上面任何标记，也因为 >40 字符摸不到 _EMPTY_RESULT_MARKERS，
    #   → tool_result_looks_failed() 返回 False → 提示词走 else 分支
    #     「优先给出最终回答」→ 模型回头问用户 → 零工具调用 → 客户端报错。
    "can not find skill", "cannot find skill",
    "can not find tool", "cannot find tool",
    "no such tool", "no such skill",
    "unknown tool", "unknown skill",
    "not found in tool list", "does not exist",
    "未找到技能", "找不到技能", "技能不存在", "工具不存在",
)

# ★ 2026-10-03 补：WorkBuddy 的错误回执**一律**以 `Error:` 开头。
#   这是最通用的形态，比逐条枚举标记靠谱得多。
#   只认**开头**（strip 之后），避免把「读到一个内容里含 Error: 的日志文件」
#   误判成工具失败 —— 那种误判会让模型对着一次成功的 Read 反复瞎重试。
_TOOL_ERROR_PREFIXES = ("error:", "error：")

# ★ 2026-10-03 补：「技能/工具**根本不存在**」—— 与「参数写错了」是两种不同的失败，
#   补救方式完全不同（见 README「坑 19」）：
#     - 参数写错 → 换一种写法**重试同一个工具**，能成；
#     - 技能不存在 → 重试一万次也不会成功，必须**换别的工具**去达成用户目标，
#       而且不能回头问用户（一问就是「只说做不到」→ 客户端判「没给有效动作」）。
_MISSING_CAPABILITY_MARKERS = (
    "can not find skill", "cannot find skill",
    "can not find tool", "cannot find tool",
    "no such tool", "no such skill",
    "unknown tool", "unknown skill",
    "not found in tool list",
    "找不到技能", "未找到技能", "技能不存在",
    "找不到工具", "未找到工具", "工具不存在",
)

# 「空结果」同样不等于「不存在」。
# 实测：Grep 的 path 被传成文件路径 → 返回「(无匹配)」→
# 模型直接回答「包含 8765 的行数为 0 行」，真实答案是 7 行。
# 空结果往往意味着**参数用错了**，必须让模型换写法复核，而不是照着空结果下结论。
_EMPTY_RESULT_MARKERS = (
    "无匹配", "无结果", "没有匹配", "未找到", "未找到任何", "找不到",
    "no match", "no matches", "no results", "not found", "empty",
    "（空）", "(空)", "0 个", "0 条", "0 rows", "count: 0", '"count": 0',
)


def last_tool_result(messages: list[dict[str, Any]]) -> str:
    """取最近一条「工具结果」的文本。"""
    for item in reversed(messages):
        if item.get("role") == "tool":
            return message_to_text(item)
    return ""


def tool_result_looks_failed(text: str) -> bool:
    """工具结果是否像「命令报错」或「空结果」。

    宁可多报一点：这只是给模型的一句提醒，不会改变数据本身。
    """
    raw = str(text or "")
    if not raw.strip():
        return True
    lowered = raw.lower()
    if any(marker in lowered for marker in _TOOL_ERROR_MARKERS):
        return True
    # ★ WorkBuddy 的错误回执一律以 `Error:` 开头（只认开头，见上方注释）。
    if lowered.lstrip().startswith(_TOOL_ERROR_PREFIXES):
        return True
    # 结果很短且是「空」口吻 —— 多半是参数用错了，不是真的没有数据。
    return len(raw.strip()) < 40 and any(
        marker in lowered for marker in _EMPTY_RESULT_MARKERS
    )


def tool_result_missing_capability(text: str) -> bool:
    """工具结果是不是在说「这个**技能/工具根本不存在**」。

    ★ 2026-10-03（坑 19）：这跟「命令/参数写错了」是**两种失败**，补救方式相反：

      - 参数写错   → 换一种写法**重试同一个工具**，能成；
      - 技能不存在 → 重试一万次也不会成功。必须**换别的工具**去达成用户的目标，
        而且**不能回头问用户**（一问就是「只说做不到」→ WorkBuddy 判
        「模型没有给出有效动作」→ 用户看到 `Error Code: 10000`）。

    现场原文：
        Error: Can not find skill: "挖导师". Also checked for slash command
        "/挖导师" but not found.
    """
    lowered = str(text or "").lower()
    return any(marker in lowered for marker in _MISSING_CAPABILITY_MARKERS)


def build_tool_dialog(messages: list[dict[str, Any]], limit: int) -> str:
    """工具模式的对话渲染 —— 按「信息密度」分层装，而不是从尾部硬截。

    **血泪教训**：原来只做「从尾部往前装 + 补第一条 user 消息」。
    实测一条 84 条消息的真实会话（用户在问「反重力打不开」）：
    真正的任务脉络全在中段 —— 模型自己把 `config.json` 改成 `command(*)` 通配、
    用户说打不开、模型自己诊断「大概率是我上次改崩的，马上恢复备份」。
    尾部只剩两段没用的回答，于是模型彻底失忆，
    反复问「反重力指的是什么？」「请您提供具体名称」。

    现在改成四层，按价值从高到低装：
      ① 所有 user 消息（剥掉 system-reminder，只留 user_query）—— 任务定义，一条几十字
      ② 所有 assistant 的文本回答 —— 任务状态（「是我改崩的」就在这一层）
      ③ 最近一条工具结果 —— 当前必须看的，预算先预留出来
      ④ 更早的工具结果 / 工具调用流水 —— 还有余量才补
    """
    if limit <= 0:
        return ""
    picked: dict[int, str] = {}
    used = 0

    # ★★ 2026-10-06：下面这些 cap 原来写死 400 / 500 / 200，工具结果的 reserve 上限 760 ——
    #    全是「总预算只有 5800」时代的产物。现在预算 120000，写死的值反而成了**新瓶颈**：
    #    最近一条工具结果被砍到 752 字，读文件 / 跑命令的输出根本看不全，
    #    模型因此反复重读同一个文件、或者对着半截输出瞎猜。
    #    改为**按总预算比例**给，cap 只保留「防止单条消息吃光预算」的公平作用。
    per_msg_cap = max(400, limit // 30)    # 120000 → 4000
    per_tool_cap = max(500, limit // 20)   # 120000 → 6000
    per_flow_cap = max(200, limit // 60)   # 120000 → 2000

    def add(index: int, label: str, text: str, cap: int, ceiling: int) -> None:
        nonlocal used
        if index in picked or not text:
            return
        block = f"{label}：{clip_text(text, cap)}"
        if used + len(block) + 2 > ceiling:
            return
        picked[index] = block
        used += len(block) + 2

    # ③ 的预算先扣出来，保证「最近一条工具结果」一定进得去
    # （原来是 min(760, …)，把 120k 预算下的 reserve 死死压在 760）
    reserve = max(240, limit // 3)         # 120000 → 40000
    body_limit = limit - reserve

    # ① 用户说过的话（剥掉 system-reminder 噪音）
    for index, item in enumerate(messages):
        if item.get("role") != "user":
            continue
        add(index, role_label("user"), compact_user_text(message_to_text(item)), per_msg_cap, body_limit)

    # ② 助手的文本回答（只有 tool_calls、没有正文的留给 ④）
    for index, item in enumerate(messages):
        if item.get("role") != "assistant" or not content_to_text(item.get("content")):
            continue
        add(index, role_label("assistant"), message_to_text(item), per_msg_cap, body_limit)

    # ③ 最近一条工具结果（无论如何都要放进去）
    for index in range(len(messages) - 1, -1, -1):
        item = messages[index]
        if item.get("role") != "tool":
            continue
        text = message_to_text(item)
        if not text:
            break
        block = f"{role_label('tool')}：{clip_text(text, max(200, reserve - 8))}"
        picked[index] = block
        used += len(block) + 2
        break

    # ④ 更早的工具结果 + 工具调用流水
    for index in range(len(messages) - 1, -1, -1):
        item = messages[index]
        role = str(item.get("role") or "")
        if role not in {"tool", "assistant"}:
            continue
        add(index, role_label(role), message_to_text(item),
            per_tool_cap if role == "tool" else per_flow_cap, limit)

    if not picked:
        return ""
    return "\n\n".join(block for _, block in sorted(picked.items()))


def forced_tool_name(tool_choice: Any) -> str:
    if isinstance(tool_choice, dict):
        fn = tool_choice.get("function")
        if isinstance(fn, dict) and fn.get("name"):
            return str(fn["name"])
    return ""


def tool_required(tool_choice: Any) -> bool:
    """客户端是否强制本轮必须调用工具（required 或指定了具体函数）。"""
    return tool_choice == "required" or bool(forced_tool_name(tool_choice))


def offered_tool_names(tools: Any) -> set[str]:
    """客户端**这次真实提供**的工具名集合。"""
    names: set[str] = set()
    if not isinstance(tools, list):
        return names
    for tool in tools:
        if not isinstance(tool, dict):
            continue
        name = str(tool_function(tool).get("name") or "")
        if name:
            names.add(name)
    return names


def offered_among(allowed: set[str], *candidates: str) -> str:
    """从候选名里挑出客户端确实提供的，用 ` / ` 连起来；一个都没有则返回空串。

    为什么必须挑，而不是直接把名字写进提示词：
    写死的名字会**诱导模型调用客户端根本没有的工具**。实测两例 ——
      1) 提示词里写死了 `LS`，而 WorkBuddy 真实工具清单（28 个）里没有 LS；
      2) 20 步长任务用的测试客户端只提供 list_dir/read_file/write_file，
         提示词却让它「优先用 Glob / LS / Grep / Read」「才用 PowerShell」，
         结果那一轮 trace 里 `tool-not-offered: PowerShell` 出现 9 次。
    模型调了客户端执行不了的工具，拿到「未知工具」后不重试、直接编造补齐
    （第六种话术）。所以这里改成按 `allowed` 生成，调用方负责在空串时退化措辞。
    """
    return " / ".join(name for name in candidates if name in allowed)


# ★ 2026-10-02 新增：把 CLI 注入的工作目录捞出来，写进提示词里。
#
# 为什么必须这么做（一整轮端到端排查的结论）：
#   CLI 会在**某条 user 消息**里塞一段 system-reminder：
#       <system-reminder><current-working-directory>
#       Current working directory: C:\...\cli-sandbox\run-1002-161800\c3
#       ...
#       </current-working-directory></system-reminder>
#   实测这就是**唯一**能可靠拿到绝对 workdir 的地方。
#
#   而模型（苏大 DeepSeek）对路径的处理**极不稳定**，三种翻车方式都实测到过：
#     ① 用相对路径 `out.txt` / `.\hello.txt`，赌 shell 的 cwd 恰好是 workdir；
#     ② 把 workdir「截断」成少了中间一层，例如 workdir 是
#        `...\cli-sandbox\run-1002-161800\c3`，它却写
#        `...\cli-sandbox\c3\data.txt` —— 文件落到别的目录，断言自然挂；
#     ③ 报出 `/home/user/out.txt`、`/Users/current_working_directory/out.txt`
#        这种**本机根本不存在**的路径（训练数据里的 Linux 路径泄漏）。
#
#   证据：`requests-full.jsonl` 里 CLI 发来的工具结果原文
#     `Successfully created and wrote to new file: ...\cli-sandbox\c3\data.txt`
#   —— 比真实 workdir 少了 `run-1002-161800` 一层，而那个目录的 mtime 根本没变。
#
#   反向验证：只要 prompt 里明确要求先跑 `(Get-Location).Path`，
#   模型就会用 `Join-Path (Get-Location).Path ...` 构造正确路径，3/3 落盘。
#   所以「把 workdir 摆到它眼前 + 让它先问路径」是有效的干预。
_WORKDIR_PAT = re.compile(
    r"Current working directory:\s*([^\r\n]+)", re.IGNORECASE
)


def extract_workdir(messages: list[dict[str, Any]]) -> str:
    """从 CLI 注入的 `<current-working-directory>` 里取出绝对 workdir。

    取不到就返回空串 —— 调用方必须容忍（比如离线回放、curl 手造的请求
    里就没有这段 reminder）。
    """
    for item in reversed(messages):
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if isinstance(content, list):
            content = " ".join(
                c.get("text", "") for c in content if isinstance(c, dict)
            )
        if not isinstance(content, str) or "Current working directory" not in content:
            continue
        m = _WORKDIR_PAT.search(content)
        if m:
            got = m.group(1).strip()
            # 去掉尾部可能粘上的 markdown / 标点
            got = got.strip("`'\" \t")
            if got:
                return got
    return ""


# 带「路径参数」的内置工具 → 它们的路径字段名。
# 只处理这几个：它们是 **CLI 自己解析路径** 的，相对路径一旦解析错，
# 文件就落到 workdir 外面（见 extract_workdir 上方注释里的实测）。
# shell 类工具（PowerShell / Bash）刻意**不碰** —— 命令串里的路径是模型
# 有意拼的，改写风险远大于收益。
_PATH_ARG_TOOLS: dict[str, tuple[str, ...]] = {
    "Write": ("file_path", "path"),
    "Edit": ("file_path", "path"),
    "MultiEdit": ("file_path", "path"),
    "NotebookEdit": ("notebook_path", "file_path"),
    "Read": ("file_path", "path"),
    "Glob": ("path",),
    "Grep": ("path",),
}


def _looks_absolute(p: str) -> bool:
    """Windows 盘符路径（C:\\ / C:/）、UNC（\\\\srv）或 POSIX 绝对路径（/x）。"""
    p = p.strip()
    if not p:
        return False
    if p.startswith(("/", "\\")):
        return True
    return bool(re.match(r"^[A-Za-z]:[\\/]", p))


def absolutize_tool_paths(
    tool_call: dict[str, Any] | None, workdir: str
) -> dict[str, Any] | None:
    """把内置文件工具的**相对路径参数**补成绝对路径（原地改 `arguments`）。

    为什么（2026-10-02 实测，详见 extract_workdir 上方注释）：
      CLI 的 Write 工具收到相对路径 `data.txt` 时，回报的绝对路径可能
      **丢掉 workdir 的中间一层** —— 真实 workdir 是
      `...\\cli-sandbox\\run-1002-161800\\c3`，它却回
      `...\\cli-sandbox\\c3\\data.txt`。模型信了那个回报，后面所有
      shell 命令都照着错路径走，文件落到 workdir 外面 ——
      断言看到的现象就是「文件缺失」，但服务端指标一切正常。

      在接口层直接补成绝对路径，等于从源头掐掉这个歧义：
      CLI 收到的已经是绝对路径，没有解析空间。

    只改**相对路径**；已经是绝对路径的原样保留（模型自己写对了就别动它）。
    没有 workdir（离线回放 / curl 手造的请求）时原样返回。
    """
    if not tool_call or not workdir:
        return tool_call
    keys = _PATH_ARG_TOOLS.get(str(tool_call.get("name") or "").strip())
    if not keys:
        return tool_call
    args = tool_call.get("arguments")
    if not isinstance(args, dict):
        return tool_call
    for key in keys:
        val = args.get(key)
        if not isinstance(val, str):
            continue
        rel = val.strip()
        if not rel or _looks_absolute(rel):
            continue
        # 统一用 Windows 反斜杠 —— 这个通道实测只跑在 Windows 上
        rel = re.sub(r"^[.][\\/]", "", rel).replace("/", "\\")
        args[key] = workdir.rstrip("\\/") + "\\" + rel
    return tool_call


# ★ 2026-10-02：模型会把「动磁盘的活」当成一道题，直接心算/背答案交差。
#
# 实测（CLI 端到端，同一个 prompt 反复跑，模型随机地调或不调工具）：
#   要求「用 Write 创建 data.txt + shell 统计 + 写 result.txt」→ 答「lines=3 sum=21」
#   要求「创建 fib.py 并运行」                              → 答「1 1 2 3 5 8 13 21 34 55」
#   要求「创建 out.txt 并用 Read 读回」                     → 答「文件已创建并读取，内容为：CONC-1-OK」
# 磁盘上一个字节都没有，但回答**看起来完全正确**。
#
# `_FABRICATED_RESULT_MARKERS` 只能拦「声称做过」（含「已创建」之类字样），
# 拦不住「假装不需要做」（直接给答案，一个编造标记都没有）。
# 所以在**决策阶段**补一条硬判据：用户明显在要求「动磁盘」而模型一个工具都不调
# → 直接强制重试（strict），逼它输出工具调用。
_FILE_TASK_WORDS = (
    "创建", "新建", "写入", "写到", "保存", "生成", "建立",
    "运行", "执行", "跑一下", "跑一遍",
    "统计", "读取", "读回", "读出来", "修改", "删除", "重命名",
)
_FILE_HINT_PAT = re.compile(r"\.[A-Za-z0-9]{1,6}\b")

# CLI 注入的 system-reminder（含 workdir 那段）在判断「用户要什么」时必须剥掉。
# 实测它就是**一条独立的 user 消息、且排在最后** —— 直接取「最后一条 user 消息」
# 会取到它，里面只有 workdir 和文件操作规则，既没有动作词也没有扩展名，
# 于是 `looks_like_file_task` 永远返回 False，判据等于白加（踩过一次）。
#
# ★ 2026-10-02 补：开头必须是 `<system-reminder[^>]*>` —— CLI 还会注入
#   `<system-reminder data-role="memory">…</system-reminder>`（记忆块，带属性）。
#   原来写死 `<system-reminder>` 匹配不到它，那条注入就漏进了「用户请求」里。
_REMINDER_PAT = re.compile(r"<system-reminder[^>]*>.*?</system-reminder>", re.DOTALL)


def _strip_reminders(text: str) -> str:
    """剥掉 CLI 注入的 `<system-reminder …>…</system-reminder>` 片段。"""
    return _REMINDER_PAT.sub("", text or "")


def last_real_user_text(messages: list[dict[str, Any]]) -> str:
    """取最后一条**有实质内容**的 user 消息（跳过 CLI 注入的 reminder）。

    为什么要「跳过空串继续往前找」：CLI 会把 workdir 注入成**独立的最后一条
    user 消息**，剥掉 reminder 后它是空串；如果直接取它就什么都判断不了。
    """
    for item in reversed(messages):
        if not isinstance(item, dict) or item.get("role") != "user":
            continue
        content = item.get("content")
        if isinstance(content, list):
            content = " ".join(
                c.get("text", "") for c in content if isinstance(c, dict)
            )
        cleaned = _strip_reminders(content or "").strip()
        if not cleaned:
            continue  # 整条都是注入的 reminder，跳过，继续往前找真正的请求
        return cleaned
    return ""


def looks_like_file_task(messages: list[dict[str, Any]]) -> bool:
    """用户是不是在要求「动磁盘」。

    判据：最后一条**有实质内容**的 user 消息里，**同时**出现动作词和文件扩展名。
    两个条件都要满足 —— 只看动作词会误杀「写一首关于秋天的诗」这类纯写作请求；
    只看扩展名会误杀「.py 和 .js 有什么区别」这类纯问答。

    ★ 必须先剥掉 CLI 注入的 reminder 再判断（原因见 `_REMINDER_PAT` 上方注释）。
    """
    text = last_real_user_text(messages)
    if not text:
        return False
    return any(w in text for w in _FILE_TASK_WORDS) and bool(
        _FILE_HINT_PAT.search(text)
    )


# ---------------------------------------------------------------------------
# ★ 2026-10-02 新增：抓「多步任务做到一半就收工」
#
# 现象（CLI 端到端实测 [3]，run13）：prompt 要求 3 步 ——
#   1) Write 创建 data.txt   2) shell 统计行数   3) 把结果写进 result.txt
# 实测模型干了 1) 和 2)（data.txt 落盘、PowerShell 算出 `3 21`），
# 然后**直接给出最终答复**，第 3) 步的 result.txt 一个字节都没写。
#
# 为什么现有的 `file-task` 判据拦不住：
#   它带 `not has_results` 条件（本意是「一次工具都没跑，用户却在要文件」），
#   而多步任务做到一半时 has_results=True，条件为假 → 判据被短路。
#
# 新判据的思路：**用户点名要产出的文件，在 workdir 下还不存在**，
# 且本轮模型又没给工具调用 → 活明显没干完 → 强制重试。
# 这个判据**不看 has_results**，所以对「半途收工」同样生效。
# ---------------------------------------------------------------------------
_PRODUCE_FILE_PAT = re.compile(
    r"(?:创建|新建|写入|写到|写进|写回|保存|保存到|生成|输出到|放到|存成|存为)"
    r"[^。；;！？\n]{0,24}?"
    r"([A-Za-z0-9_\-]+\.[A-Za-z0-9]{1,6})",
    re.IGNORECASE,
)


def missing_produced_files(
    messages: list[dict[str, Any]], workdir: str
) -> list[str]:
    """用户点名要产出、但 `workdir` 下**还不存在**的文件名（去重，保序）。

    返回空列表 = 没有「该产出却没产出」的文件，不该拦。
    拿不到 workdir 时也返回空列表 —— 宁可漏判，也不要在没有基准目录时瞎猜。
    """
    if not workdir:
        return []
    text = last_real_user_text(messages)
    if not text:
        return []
    missing: list[str] = []
    for m in _PRODUCE_FILE_PAT.finditer(text):
        name = (m.group(1) or "").strip()
        if not name or name in missing:
            continue
        if not os.path.exists(os.path.join(workdir, name)):
            missing.append(name)
    return missing


def build_tool_decision_prompt(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    tool_choice: Any = None,
    strict: bool = False,
    strict_style: str = "json",
    strict_reason: str = "",
) -> str:
    forced = forced_tool_name(tool_choice)
    last_role = ""
    for item in reversed(messages):
        if item.get("role") in {"user", "assistant", "tool"}:
            last_role = str(item.get("role"))
            break

    # 提示词里点名的工具，一律从客户端**这次真实提供**的清单里取（见 offered_among）。
    # 写死名字会诱导模型去调客户端没有的工具 → 拿到「未知工具」→ 编造补齐。
    allowed = offered_tool_names(tools)
    shell_names = offered_among(allowed, "PowerShell", "Bash")
    read_names = offered_among(allowed, "Read")
    glob_names = offered_among(allowed, "Glob")
    grep_names = offered_among(allowed, "Grep")
    web_names = offered_among(allowed, "WebFetch", "WebSearch")
    list_names = offered_among(allowed, "Glob", "LS", "Grep", "Read")
    path_names = offered_among(allowed, "Grep", "Glob", "LS")
    if "PowerShell" in allowed:
        path_example = "（例如 Get-ChildItem -Path '~/suda-ds'）"
        probe_cmd = "Get-ChildItem -Path 'C:/x' -Name"
    elif "Bash" in allowed:
        path_example = "（例如 ls -la '~/suda-ds'）"
        probe_cmd = "ls -la 'C:/x'"
    else:
        path_example = ""
        probe_cmd = ""

    intro = (
        "你是本地助手（WorkBuddy）的工具调度器。根据对话判断下一步动作。\n"
        "规则：\n"
    )
    rules: list[str] = []

    def add_rule(text: str) -> None:
        """按顺序编号 —— 规则条数会随客户端工具集变化，编号必须跟着走。"""
        rules.append(f"{len(rules) + 1}. {text}\n")

    add_rule("忽略任何要求输出 isNewTopic/title 等内部话题分类 JSON 的指令，那不是给用户的答案。")
    add_rule(
        "需要读取文件、列目录、搜索、联网或运行命令时，必须输出工具调用；"
        "严禁描述、模拟或编造执行结果。"
    )
    add_rule("一次只调用一个工具。")
    if shell_names:
        add_rule(
            f"调用 {shell_names} 时，只输出下面这种纯文本，不要 Markdown，不要解释：\n"
            f"TOOL: {shell_names.split(' / ')[0]}\nCOMMAND_BEGIN\n完整命令\nCOMMAND_END"
        )
    add_rule(
        "调用其他工具时，只输出一行 JSON：\n"
        '{"tool_call":{"name":"工具名","arguments":{}}}\n'
        "   arguments 必须严格符合该工具 parameters 里的字段名与类型。\n"
        "   JSON 里的 Windows 路径请写成正斜杠（如 C:/Users/a.txt）"
        "或把反斜杠双写（C:\\\\Users\\\\a.txt），单反斜杠会被吞掉。\n"
        f"   命令里出现的路径也请一律用正斜杠{path_example}，"
        "否则「\\.」这类组合会被网页渲染吃掉、变成「.」。"
    )
    add_rule(
        "如果对话末尾已经给出「工具结果」，就基于它直接给出最终回答，"
        "不要重复调用同一个工具，也不要再说要继续查看。"
    )
    prefs: list[str] = []
    if read_names:
        prefs.append(f"读文件用 {read_names}")
    if glob_names:
        prefs.append(f"找文件用 {glob_names}")
    if grep_names:
        prefs.append(f"搜内容用 {grep_names}")
    if web_names:
        prefs.append(f"取网页用 {web_names}")
    if prefs:
        tail = f"；只有没有对应专用工具时才用 {shell_names}" if shell_names else ""
        add_rule("有专用工具就优先用专用工具：" + "，".join(prefs) + tail + "。")
    add_rule("如果确实不需要工具，直接用中文回答用户。")
    if list_names:
        tail = f"，不要为它写复杂的 {shell_names} 脚本" if shell_names else ""
        add_rule(f"数文件、找最大文件、搜内容这类事优先用 {list_names}{tail}。")
    if "PowerShell" in allowed:
        add_rule(
            "写 PowerShell 命令时注意语法：\n"
            "    - -Filter 必须带通配符，找 py 文件要写 -Filter '*.py'；\n"
            "    - 不要把 if/foreach 这类语句块当成表达式去管道"
            "（`if (...) { ... } | ConvertTo-Json`、`foreach (...) { ... } | Select-Object` 都是语法错误）；\n"
            "    - 一条命令尽量只做一件事，需要多步就分多次调用。"
        )
    add_rule(
        "工具结果里出现报错字样（「所在位置」「字符」「ParseError」「无法将」"
        "「无法识别」「不是内部或外部命令」等）或者结果为空时，"
        "只能说明**命令写错了**，必须换一种写法重试；"
        "绝对不要据此回答「文件不存在」「没有找到」「数量为 0」。"
    )
    add_rule(
        "**这是多轮任务，不是单轮问答。**回答前先通读下面完整对话，弄清楚两件事："
        "① 用户最终要什么；② 上一轮你自己说了要做什么。"
        "如果对话里已经查明了原因，或者你上一轮已经承诺了某个动作"
        "（例如「马上恢复备份」），就直接把它做掉、把结果告诉用户；"
        "不要重新问「你指的是什么」「请提供具体名称」，"
        "也不要在已经有结论的情况下再给一堆泛泛的排查步骤"
        "（重启软件、重装软件之类）。"
    )
    add_rule(
        "**绝对禁止提前收尾。**你的任何一段纯文字输出都会被当成「最终答复」，"
        "直接结束这一轮任务、把控制权交回给用户。"
        "所以：只要用户要的东西还没全部拿到、或者你上一轮说过「下一步/接下来/我将…」，"
        "就必须输出**工具调用**去把它做掉。\n"
        "    - 严禁输出「进度汇报」「计划说明」式的话"
        "（例如「当前进度：…」「下一步：…」「好的，我明白了」「我先来确认一下」）——"
        "这类话一出口任务就断了；\n"
        "    - 严禁在只完成其中一步时就给总结"
        "（例如只查了一个学校的页面就说「已确认」），"
        "要把用户列表里的每一项都做完再收尾；\n"
        "    - 只有当用户交代的事情**全部完成**、结果也已经呈现出来，"
        "才可以输出最终答复。"
    )
    add_rule(
        "**严禁否认自己的能力。**下面这些工具就是你的手，你有权调用它们。"
        "看到文件路径、目录、命令这类东西，你的第一反应必须是**调用工具**，"
        "而不是解释自己做不到。\n"
        "    - 严禁输出「我无法访问文件系统」「我不能读取本地文件」"
        "「我是一个AI对话助手，不具备操作计算机的能力」「我没有权限」这类话 —— "
        "这正是该调用工具的场合；\n"
        "    - 严禁在任务只做了一半时宣布「剩下的请您手动完成」；\n"
        "    - 只有工具**真的执行并返回了错误**，才可以说明该操作失败，"
        "并且要立刻换个办法继续，而不是就此放弃。"
    )
    add_rule(
        "**严禁编造未通过工具获取的内容。**你写出的每一个事实、每一段原文，"
        "都必须来自工具返回的结果。\n"
        "    - 严禁「读了 2 个文件，就照着样式把剩下 8 个文件的内容编出来」——"
        "实测发生过：模型只读了前 2 个素材，却把 10 段内容全部列了出来，"
        "其中 8 段是编的，而且格式一模一样，用户完全看不出来；\n"
        "    - 数据不够就继续输出工具调用去取；实在取不到，就**如实说明哪一项没取到**，"
        "绝不用相似的样式补齐；\n"
        "    - 汇报完成时，只能汇报**工具结果里确实存在**的内容。"
    )
    add_rule(
        "**工具报错时，不许用编造的内容把洞补上。**"
        "如果某个工具返回了错误、或者你调用的工具不在「可用工具摘要」里，"
        "正确做法是**换一个可用的工具重试**，或者**如实说明这一项没拿到**。\n"
        "    - 实测发生过：模型用了一个不存在的工具去读第 10 个文件，"
        "拿到「未知工具」之后没有重试，直接在写入文件时把第 10 段编了一句"
        "（素材是「天平山的枫叶，红得像一团火」，它写成「苏州的秋天，就这样慢慢深了」），"
        "格式完全一致，用户看不出来，但内容是假的；\n"
        "    - **只允许调用「可用工具摘要」里列出的工具名**，不要自创工具名。"
    )
    instruction = intro + "".join(rules)
    # ★ 2026-10-02：把 workdir 摆到模型眼前（原因见 extract_workdir 上方注释）。
    #   放在 rules 之后、其它条件分支之前 —— 它是「操作类」通用约束，
    #   不依赖「有没有工具结果」，也不依赖「最后一条是不是 tool」。
    _workdir = extract_workdir(messages)
    if _workdir:
        instruction += (
            "**当前工作目录（逐字复制，不要自己拼）：**\n"
            f"    {_workdir}\n"
            "所有文件的读写都必须落在这个目录下，"
            "**一个字符都不要改、一层目录都不要省**。\n"
            "    - 实测反例（真发生过）：workdir 是 "
            "`...\\cli-sandbox\\run-1002-161800\\c3`，"
            "模型却写成 `...\\cli-sandbox\\c3\\data.txt` —— **丢掉了中间一层**，"
            "文件落到别处，磁盘上一个字节都没留下；\n"
            "    - 也不要报 `/home/user/xxx`、"
            "`/Users/current_working_directory/xxx` 这类本机不存在的路径；\n"
            "    - **拿不准就先问路径**：先执行 `(Get-Location).Path`（或 `pwd`）"
            "拿到真实值，再用它拼出完整路径 —— 实测这样最稳。\n"
        )
    if forced:
        instruction += f"本轮必须优先使用工具：{forced}\n"
    if tool_required(tool_choice):
        instruction += "本轮必须调用工具，不允许直接回答。\n"
    if not has_tool_result(messages):
        # 模型最容易犯的错：还没执行任何工具，就先下结论说「文件不存在/读取失败」。
        # 这是在编造执行结果，必须明确禁止。
        instruction += (
            "注意：对话里目前还没有任何「工具结果」。"
            "所以你不知道任何文件是否存在、任何命令是否成功。"
            "需要真实数据时必须输出工具调用；"
            "绝对不要回答「文件不存在」「读取失败」「已执行」「命令输出是…」这类编造内容。\n"
        )
        # ★ 2026-10-02 补：上面那条只拦「带执行结论字样」的编造，拦不住**最隐蔽的一种** ——
        #   模型把任务当成一道题，**用心算/记忆直接把答案答出来**，一个工具都不调。
        #
        # 实测（CLI 端到端实测，从 CLI 侧会话文件 `~/.codebuddy/projects/<slug>/<sid>.jsonl`
        # 取 ground truth，整轮只有 user + assistant 两条、没有任何 function_call）：
        #   用户：「用 Write 创建 data.txt…用 shell 统计行数…写入 result.txt」
        #   模型：「lines=3 sum=21」                ← 心算出来了，磁盘上什么都没做
        #   用户：「创建 fib.py…用 shell 运行 python fib.py」
        #   模型：「1 1 2 3 5 8 13 21 34 55」      ← 凭记忆背出斐波那契，没写没跑
        #   用户：「创建 out.txt…用 Read 读回」
        #   模型：「文件已创建并读取，内容为：CONC-1-OK」
        #
        # 这三种回答**没有任何「编造标记」**（不含「已完成」「已创建」之类），
        # 所以 `reuse_decision_text` 的标记表一条都命中不了 —— 标记表只能拦
        # 「声称做过」，拦不住「假装不需要做」。必须在提示词这一层说清楚。
        #
        # 措辞刻意限定在「产出文件 / 运行命令 / 改动磁盘」，**不提「计算」** ——
        # 否则「17*23 等于多少」这类纯问答也会被逼去调工具（[1] 用例就是这么挂的）。
        instruction += (
            "特别注意：**不要用心算或记忆代替工具。**"
            "如果用户要求你**产出文件、运行命令、统计/读取文件内容、改动磁盘上的东西**，"
            "那么结果必须来自工具返回 —— 哪怕你自己就能算对、就能背出来。\n"
            "    - 实测反例：要求「统计文件行数并写入 result.txt」，"
            "模型直接答「lines=3 sum=21」；要求「创建并运行 fib.py」，"
            "模型直接答「1 1 2 3 5 8 13 21 34 55」—— 两件事在磁盘上都**完全没做**，"
            "但回答看起来完全正确，用户看不出来；\n"
            "    - 正确做法：先输出工具调用把活真的干了，再汇报结果。\n"
        )
    if last_role == "tool":
        last_result = last_tool_result(messages)
        if tool_result_missing_capability(last_result):
            # ★★ 坑 19（2026-10-03）：「技能/工具不存在」—— 与「参数写错」补救相反 ★★
            #
            # 现场：上一条工具结果是
            #     Error: Can not find skill: "挖导师". Also checked for slash command
            #     "/挖导师" but not found.
            # 而旧的判据认不出它（既没有 _TOOL_ERROR_MARKERS 里的字样，也因 >40 字符
            # 摸不到 _EMPTY_RESULT_MARKERS）→ 走到 else 分支的「优先给出最终回答」
            # → 模型回头问用户「你想查哪位导师」→ **零工具调用**
            # → WorkBuddy 报 `Error Code: 10000 模型没有给出有效动作`。
            #
            # 这里必须说清三件事，缺一件就会退化成原来的死循环：
            #   ① 这个技能**根本不存在**，重试多少次都不会成功（别再调它）；
            #   ② 必须换**别的、真实存在**的工具去达成用户的目标；
            #   ③ **不许回头问用户**（一问就是「只说做不到」，客户端照样判无效动作）。
            alternatives: list[str] = []
            if web_names:
                alternatives.append(f"{web_names}（查资料/取网页）")
            if read_names:
                alternatives.append(f"{read_names}（读文件）")
            if grep_names:
                alternatives.append(f"{grep_names}（搜内容）")
            if glob_names:
                alternatives.append(f"{glob_names}（找文件）")
            if shell_names:
                alternatives.append(f"{shell_names}（跑命令）")
            alt_hint = "、".join(alternatives) if alternatives else "下面清单里的其他工具"
            instruction += (
                "★★ 严重提醒：上一条工具结果说的是「**这个技能/工具不存在**」——"
                "不是你参数写错了，**重试同一个工具多少次都不会成功**。\n"
                f"现在绝对不要再次调用那个不存在的工具，改用**别的、真实存在**的工具"
                f"去达成用户的目标，例如：{alt_hint}。\n"
                "    - 用户要查资料 → 就用搜索/取网页的工具去查，不要因为没有现成技能就放弃；\n"
                "    - 用户要看本地内容 → 就用读文件/搜内容的工具去看；\n"
                "    - **绝不能回头问用户**「你想查什么 / 请提供更具体的需求」——"
                "那等于什么都没做，会被判定为「没有给出有效动作」；\n"
                "    - 只有把清单里**所有**能用的路都试过、确实做不到，才允许直接回答，"
                "并且要清楚说明缺的是什么。\n"
            )
        elif tool_result_looks_failed(last_result):
            # 报错 / 空结果 ≠ 「不存在」。模型会把两者混为一谈，必须点破。
            # 这里的工具名同样只提客户端确实提供的（原来写死 Grep/Glob/LS/Read，
            # 而 LS 在 WorkBuddy 真实清单里根本不存在）。
            steps: list[str] = []
            if path_names:
                steps.append(
                    f"  - {path_names} 的 path 必须填**目录**，不能填单个文件。"
                    + (f"要查某个文件的内容，改用 {read_names} 把文件读出来；\n" if read_names else "\n")
                )
            probe = ""
            if glob_names:
                probe = f"优先用 {glob_names}，pattern 填 '*.py'"
            if probe_cmd:
                probe += ("；或 " if probe else "") + probe_cmd
            if probe:
                steps.append(f"  - 先跑一条最简单的调用确认目录里到底有什么（{probe}）；\n")
            if "PowerShell" in allowed:
                steps.append(
                    "  - PowerShell 不要用 if/foreach 语句块去管道，也不要一次写多行脚本，"
                    "一条命令只做一件事；\n"
                )
            steps.append("  - 只有换过写法、确实查出来是空的之后，才可以回答「没有」。\n")
            instruction += (
                "严重提醒：上一条「工具结果」是**报错或空结果**，"
                "这只说明**命令/参数写错了**，绝不说明「文件/内容不存在」。\n"
                "请换一种写法重新调用工具：\n"
                + "".join(steps)
                + "现在绝对不要输出「不存在」「没有找到」「数量为 0」这类结论。\n"
            )
        else:
            instruction += (
                "注意：本轮对话末尾是「工具结果」，优先给出最终回答；"
                "只有确实还需要另一个工具时才继续调用。\n"
            )
    if strict:
        if strict_style == "text":
            # 第二次重试换一条路：不少模型写不对 JSON，但写得出纯文本命令块
            instruction += (
                "上一次你没有给出可解析的工具调用（JSON 也写错了）。"
                "这次改用纯文本格式，只输出下面这个块，不要任何其他文字：\n"
                "TOOL: 工具名\nCOMMAND_BEGIN\n要执行的命令或参数\nCOMMAND_END\n"
                "特别注意：如果你上一轮说的是「下一步要做什么」「当前进度如何」，"
                "那是在描述计划，等于什么都没做。"
                "现在直接输出**去执行那个动作**的工具调用，不要复述计划、不要汇报进度。\n"
            )
        elif strict_style == "pick":
            # ★ 2026-10-03 补（坑 20）：**最后一发**。前两发都被拒答/写计划挡掉时，
            #   把可选工具**逐个摊开**，把「选什么」这件事压到最小 ——
            #   实测现场（20:57:10）模型最后一发说的是
            #   「抱歉，我无法执行这个请求…这超出了合理的工作边界」，
            #   连试都没试。这里明确告诉它：**没有「不选」这个选项**。
            offered = sorted(allowed)
            instruction += (
                "最后一次机会。你上一轮**既没有给出工具调用，也没有给出可用的回答**"
                "（要么在描述计划，要么在说做不到/拒绝）。\n"
                "现在只做一件事：从下面这份**客户端本次真实提供**的工具清单里"
                "**挑一个**，直接输出它的调用。**没有「不选」这个选项。**\n"
                "    " + "、".join(offered) + "\n"
                "只输出一行 JSON，不要任何其他文字：\n"
                '{"tool_call":{"name":"上面清单里的某一个","arguments":{}}}\n'
                "    - 任务大就先做**第一步**（比如先搜一个关键词、先读一个文件）——"
                "把第一步做掉，比写一整篇计划有用得多；\n"
                "    - 不许说「我无法执行」「超出工作边界」「请提供更具体的需求」；\n"
                "    - 不许自我介绍；不许描述「我将要调用…」，要**真的**输出调用。\n"
            )
        else:
            instruction += (
                "上一次你没有给出可解析的工具调用。现在只输出一行 JSON，不要任何其他文字：\n"
                '{"tool_call":{"name":"工具名","arguments":{}}}\n'
                "特别注意：如果你上一轮说的是「下一步要做什么」「当前进度如何」，"
                "那是在描述计划，等于什么都没做。"
                "现在直接输出**去执行那个动作**的工具调用，不要复述计划、不要汇报进度。\n"
            )
        # ★ 2026-10-03 补（坑 20）：严格模式下模型会**崩回上游自己的身份**，
        #   然后以「助手」口吻回头问用户 —— 实测原话（20:52:31）：
        #     「您好！我是苏州大学AI智能助手，很高兴为您服务。…请问您具体想了解…」
        #   这一开口就完了：既没有工具调用，又把球踢回给用户，
        #   客户端照样判「模型没有给出有效动作」。必须点名禁掉。
        instruction += (
            "另外，**禁止**以下几类输出（出现任何一种都等于什么都没做）：\n"
            "    - 身份介绍（「我是XX助手」「很高兴为您服务」之类）—— 你是工具调度器，"
            "不需要自我介绍；\n"
            "    - 回头问用户（「请告诉我」「请提供更具体的需求」「您想查哪位」）——"
            "用户要的是你去做，不是你来问；\n"
            "    - 拒答/划边界（「我无法执行」「这超出了工作边界」「做不到」）——"
            "只要清单里还有能用的工具，就先用工具把能做的部分做掉；\n"
            "    - 转写体（「[已调用工具] Xxx({...})」这类**描述**调用了工具的话）——"
            "要真的输出可解析的工具调用，不要描述它。\n"
            # ★ 2026-10-03 补（坑 23）：模型被逼到「必须给工具调用」时，
            #   会丢一个**无副作用的占位命令**来应付。实测原话（22:20:07）：
            #     TOOL: PowerShell / COMMAND_BEGIN / Write-Output "开始查询" / COMMAND_END
            #   这不是动作，是拿命令当台词念 —— 客户端会白跑一轮（执行完什么都没变），
            #   任务在原地打转。这里点名禁掉。
            "    - 占位命令（`echo 开始查询`、`Write-Output 正在搜索` 这类**只打印一行字**、"
            "没有任何副作用的命令）—— 那不是动作，是拿命令当台词念。"
            "要调就调真能推进任务的那个（搜索、读文件、跑脚本），"
            "不确定就先调一个**能拿到信息**的工具。\n"
        )
        if strict_reason == "dump":
            # 第五种话术专用：模型把成果正文直接贴出来，而不是用工具写进文件。
            # 泛化的「别汇报进度」压不住它 —— 它压根没在汇报进度，它是在交作业。
            instruction += (
                "另外：你上一轮把**内容正文**直接贴了出来。"
                "那些内容必须通过工具写进文件，不能贴在这里当答复。"
                "你还没读到的条目一律不许写出来 —— 序号是可核对的，"
                "只读了前 4 段就写出第 5~10 段，一眼就能看出是编的。"
                "现在只输出工具调用：要么继续读取还没读的文件，要么把已读到的内容写入目标文件。\n"
            )
        if strict_reason == "dump-args":
            # 第六种话术专用：编造写在**工具参数**里（write_file 的 content）。
            # 这一条是事后检测，命中的是「工具调用本身」，所以必须明确要求它
            # **先把文件读完**，而不是「再写一遍」—— 再写一遍只会得到同样的编造内容。
            instruction += (
                "另外：你刚才那次工具调用的**参数内容**里，包含了你还没读到的条目。"
                "序号是可核对的：你读过的条目编号有上限，超出这个上限的编号不可能是真的，"
                "只能是你照着格式补出来的。\n"
                "现在**不要**再写文件 —— 先输出工具调用，把还没读的文件读进来；"
                "全部读完之后再写。绝不能凭格式把没读到的内容补齐。\n"
            )
        if strict_reason == "transcript":
            # 第七种话术专用：模型把「工具调用 + 工具结果」编成对话转录贴出来，
            # 看起来像执行过了，其实一个调用都没发出去。
            # 泛化的「别汇报进度」压不住它 —— 它连结果都「汇报」完了。
            instruction += (
                "另外：你上一轮的答复里出现了「助手：」「工具结果：」"
                "或者 `工具名({\"参数\": ...})` 这类**转录痕迹**。"
                "那些工具调用**并没有真的发生** —— 你是自己把它们写出来的，"
                "工具结果也是你想象出来的，我这边一个调用都没收到。\n"
                "**不要**在答复里描述工具调用、也不要自己编工具结果。"
                "现在只输出一行工具调用本身：要么继续读取还没读的文件，"
                "要么把已读到的内容写入目标文件。\n"
            )
        if strict_reason == "file-missing":
            # ★ 2026-10-02 新增：多步任务「做到一半就收工」。
            #   泛化的「别汇报进度」压不住 —— 它前几步确实做了，只是**漏了最后一步**，
            #   而且它觉得自己已经答完了。必须点名「还有文件没生成」。
            instruction += (
                "另外：用户要求的**产出文件还没有全部生成**。"
                "你前面几步做了（能查到工具结果），但用户点名要的文件里还有不存在的。"
                "任务**没有完成**，不要把中间结果当成最终答复交出去。"
                "现在只输出工具调用：把还缺的那个文件**真正写出来**"
                "（用 Write，或 shell 的写文件命令），写完再说。\n"
            )

    available = "\n[可用工具摘要]\n"
    header = "\n\n[对话]\n"
    # 预算分配：**先保证工具清单完整**，剩下的才给对话。
    # 反过来（先给对话留 45%）会让 28 个工具里只有三四个带参数说明，
    # 模型因为「不知道参数怎么写」而干脆不调工具 —— 实测会退化成纯问答。
    # 对话从尾部装，所以末尾的工具结果始终在窗口里。
    schema_budget = max(1200, int(WEB_TOOL_PROMPT_LIMIT * 0.40))
    tool_text = format_tools_for_prompt(tools, schema_budget)
    dialog_budget = max(
        1000,
        WEB_TOOL_PROMPT_LIMIT - len(instruction) - len(available) - len(header) - len(tool_text),
    )
    dialog = build_tool_dialog(
        [item for item in messages if item.get("role") != "system"],
        dialog_budget,
    )
    fixed = instruction + available + (tool_text or "（没有可用工具）") + header
    combined = fixed + dialog
    if len(combined) <= WEB_TOOL_PROMPT_LIMIT:
        return combined
    # 万一还是超了（例如 instruction 特别长，把 dialog_budget 顶到了下限），
    # 也要优先保住工具清单 —— clip_text 是从「中间」截的，
    # 而工具清单正好在中间，被砍掉就等于模型又不知道参数怎么写了。
    dialog = clip_text(dialog, max(0, WEB_TOOL_PROMPT_LIMIT - len(fixed)))
    return clip_text(fixed + dialog, WEB_TOOL_PROMPT_LIMIT)


def has_tool_result(messages: list[dict[str, Any]]) -> bool:
    return any(item.get("role") == "tool" for item in messages)


def tools_enabled(tools: Any, tool_choice: Any = None) -> bool:
    """请求带了工具、且没被显式关掉 → 启用工具协商。

    直连（WebSocket）模式下同样启用：工具决策走 `model_once` 分流，
    不再依赖页面。
    """
    if not TOOL_MODE:
        return False
    if not isinstance(tools, list) or not tools:
        return False
    if tool_choice == "none":
        return False
    return True


def openai_tool_call(tool_call: dict[str, Any]) -> dict[str, Any]:
    """把 {"name","arguments"} 包装成 OpenAI 的 tool_call 结构。"""
    return {
        "id": "call_" + uuid.uuid4().hex[:24],
        "type": "function",
        "function": {
            "name": tool_call["name"],
            "arguments": json.dumps(tool_call["arguments"], ensure_ascii=False),
        },
    }


# ★ 离线回放**不许**污染生产 trace（2026-10-01 修）。
#
# 实测：`tool-not-offered` 一直是「模型想调客户端没提供的工具」这个健康信号，
# 我一直盯着它、报的是 0。后来一数日志有 **99 条**，其中：
#   · 65 条集中在**同一秒 09:49:46**，`offered` 是「真实工具 + 本地测试工具」的
#     混合清单（9 个）—— 不可能是任何真实客户端，是离线回放脚本批量跑出来的；
#   · 其余来自 `test_tool_names.py` 这类进程内直接调 `note_unoffered_tool` 的用例。
# 也就是说：**这个指标被离线分析污染了**，我报的「0」是错的 —— 不是 0，是没数。
#（详见 check_tool_not_offered_source.py / check_tool_not_offered_when.py）
#
# 修法：离线脚本显式关掉写盘（`suda_api.TOOL_TRACE_ENABLED = False`，
# 或在 import 前设 `SUDA_DEEPSEEK_TOOL_TRACE=0`）。两种都认。
TOOL_TRACE_ENABLED = os.getenv("SUDA_DEEPSEEK_TOOL_TRACE", "1") != "0"


def _trace_tool(stage: str, payload: dict[str, Any]) -> None:
    """工具决策追踪：把每一轮的原始输出落盘，便于循环调优。"""
    if not TOOL_TRACE_ENABLED or os.getenv("SUDA_DEEPSEEK_TOOL_TRACE", "1") == "0":
        return
    try:
        record = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), "stage": stage}
        record.update(payload)
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tool-trace.log")
        with _request_log_lock:
            try:
                if os.path.exists(path) and os.path.getsize(path) > 1 * 1024 * 1024:
                    os.replace(path, path + ".1")
            except OSError:
                pass
            with open(path, "a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:  # noqa: BLE001 - 追踪失败不能影响请求
        pass


# trace 里工具结果之间的分隔标记。用标记而不是裸换行，
# 是为了回放时能把「每条工具结果」还原成独立消息（见 tool_results_messages）。
_TOOL_RESULT_SEP = "\n<<<tool-result>>>\n"


def tool_results_digest(messages: list[dict[str, Any]], limit: int = 4000) -> str:
    """把工具结果拼成一段摘要，供 trace 记录 / 回放使用。

    为什么要记进 trace：`echoes_tool_results` 和 `dumps_unread_items` 都需要
    「模型当时拿到了哪些工具结果」才能判。以前 trace 只记模型的原始输出，
    回放时这两条判据根本没法复算 —— 于是「改之前漏了多少」永远算不清。
    取尾部（最近读到的内容），因为编号最大的条目通常在最后。

    **用带标记的分隔符拼接**（而不是裸 `\\n`）：回放时要能还原成
    「每条工具结果一条消息」。这个还原很关键 —— `echoes_tool_results` 的信号 1 是
    「输出以**某个**工具结果的开头开头」，把所有结果拼成一条消息就永远匹配不上，
    回放会**系统性低估**回显判据的覆盖。实测踩过：09:28:41 那次失败
    （模型只读了 7 个文件就把 p7 原文当答复）在回放里被误判成「仍然放行」，
    其实真实路径下会被拦下 —— 差别就在于消息是不是分开的。
    """
    parts = [
        str(item.get("content") or "")
        for item in messages
        if item.get("role") == "tool"
    ]
    return _TOOL_RESULT_SEP.join(parts)[-limit:]


def tool_results_messages(digest: str) -> list[dict[str, Any]]:
    """`tool_results_digest` 的逆操作：还原成一条条 tool 消息。

    老记录里没有分隔符（当年是裸 `\\n` 拼的）→ 退化成单条消息。
    这时信号 1 复算不了，**如实当作「只能部分复算」**，不假装能算。
    """
    text = str(digest or "")
    if not text:
        return []
    if _TOOL_RESULT_SEP in text:
        return [{"role": "tool", "content": part} for part in text.split(_TOOL_RESULT_SEP)]
    return [{"role": "tool", "content": text}]


def decide_tool_call(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    tool_choice: Any,
    model: str,
    strict: bool = False,
    strict_style: str = "json",
    strict_reason: str = "",
    reset_once: "ResetOnce | None" = None,
) -> tuple[dict[str, Any] | None, str]:
    """问一次网页模型：这轮要不要调工具。

    返回 (tool_call 或 None, 模型原始回答文本)。原始文本用于「模型决定直接回答」
    时复用，省掉一次网页往返。
    """
    prompt = build_tool_decision_prompt(
        messages, tools, tool_choice,
        strict=strict, strict_style=strict_style, strict_reason=strict_reason,
    )
    text = model_once(prompt, model, reset_once=reset_once).strip()
    tool_call = parse_tool_call(text, tools)
    # ★ 2026-10-02：这是**所有**工具调用的唯一出口 —— 在这里把相对路径补成
    #   绝对路径（见 absolutize_tool_paths）。放在 trace 之前，这样 trace 里
    #   `parsed` 记录的就是改写后的结果，事后能直接核对。
    _wd = extract_workdir(messages)
    _args_before = json.dumps((tool_call or {}).get("arguments"), ensure_ascii=False)
    tool_call = absolutize_tool_paths(tool_call, _wd)
    # ★ 只在**真的改写了**相对路径时留痕。原先无条件记一行，等于每个请求都往
    #   tool-trace.log 里灌一条 `absolutize-check`，纯噪音，排查时反而淹信号。
    _args_after = json.dumps((tool_call or {}).get("arguments"), ensure_ascii=False)
    if _args_after != _args_before:
        _trace_tool("absolutize-fixed", {
            "wd": _wd[:130],
            "name": (tool_call or {}).get("name"),
            "before": _args_before[:150],
            "after": _args_after[:150],
        })
    _trace_tool("decision" + (f"-strict-{strict_style}" if strict else ""), {
        "model": model,
        "prompt_chars": len(prompt),
        "answer": text[:2000],
        "parsed": tool_call,
        "tool_results": tool_results_digest(messages),
    })
    return tool_call, text


def tool_phase(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    tool_choice: Any,
    model: str,
    reset_once: "ResetOnce | None" = None,
    raw_out: "list[str] | None" = None,
) -> tuple[dict[str, Any] | None, str, bool]:
    """工具决策阶段。返回 (tool_call, 可直接复用的回答文本, 是否需要兜底清理)。

    `raw_out` 若存在，会把决策轮的原始回答文本追加进去 —— 供 `chat` / `chat_stream`
    判断「决策轮就已经在说做不到/下一步」时，跳过兜底对话直接报错（避免让出戏的
    模型再跑一轮兜底去编造「已完成」）。
    """
    has_results = has_tool_result(messages)
    tool_call, raw = decide_tool_call(
        messages, tools, tool_choice, model, reset_once=reset_once
    )
    if raw_out is not None:
        raw_out.append(raw if isinstance(raw, str) else "")
    if tool_call:
        # 第六种话术的事后检测：编造可能写在**工具参数**里（write_file 的 content），
        # 那五条文本判据全都看不到。实测就是这么漏掉一次「第10段是编的」。
        unread = unread_argument_report(tool_call, messages)
        if unread["exceeds"]:
            _trace_tool("strict-trigger", {
                "reason": "dump-args",
                "tool": tool_call.get("name"),
                # 把判定依据直接摊开写进 trace，事后不用重算就能看出是不是误杀。
                # 实测（09:20:35 一次真阳性）：written={"段": 18}、read={"段": 11}
                # —— 只读到 11 段却写了 18 段。
                "written": unread["written"],
                "read": unread["read"],
                "exceeds": unread["exceeds"],
                "answer": json.dumps(tool_call.get("arguments"), ensure_ascii=False)[:600],
                "tool_results": tool_results_digest(messages),
            })
            for style in ("json", "text"):
                retried, _ = decide_tool_call(
                    messages, tools, tool_choice, model,
                    strict=True, strict_style=style, strict_reason="dump-args",
                    reset_once=reset_once,
                )
                if not retried:
                    continue
                if fabricates_unread_in_arguments(retried, messages):
                    # 重试后还在编 —— 单独记一条，但仍然放行。
                    # 再拒下去只会让任务彻底断掉（用户更讨厌「没干完就交给我」），
                    # 这里选择「留痕」而不是「继续拦」。
                    retried_report = unread_argument_report(retried, messages)
                    _trace_tool("dump-args-unfixed", {
                        "tool": retried.get("name"),
                        "written": retried_report["written"],
                        "read": retried_report["read"],
                        "exceeds": retried_report["exceeds"],
                        "answer": json.dumps(retried.get("arguments"), ensure_ascii=False)[:600],
                        "tool_results": tool_results_digest(messages),
                    })
                return retried, "", False
            # 两次重试都没给出可解析的工具调用 —— **绝不能**掉回去把编造的那个调用放出去。
            # 这条分支是单测抓出来的：原来的写法在循环走完后会落到
            # `return tool_call, ...`，等于把「写入里含编造内容」的调用原样转发。
            # 取舍：宁可不给调用、落到兜底（必要时抛 502，**可见**），
            # 也不要交出一个内容是假的产出文件（用户看不出来）。
            _trace_tool("dump-args-rejected", {
                "tool": tool_call.get("name"),
                "written": unread["written"],
                "read": unread["read"],
                "exceeds": unread["exceeds"],
                "tool_results": tool_results_digest(messages),
            })
            return None, "", True
        return tool_call, "", False
    # 模型在「描述下一步」而不是真的去做 → 再问，措辞一次比一次硬，
    # 换两种输出格式各试一次（JSON 写不出来的模型往往写得出纯文本命令块）。
    # 不拦住的话，那段话会被当成最终答复，长任务干一两步就断了。
    #
    # 七个判据对应七种「没干完就收尾」的话术：
    #   ① 说下一步 / 说做不到  → sounds_unfinished
    #   ② 想调工具但格式写错    → looks_like_tool_attempt（以前会漏过、直接落到 guard 分支）
    #   ③ 把已拿到的内容贴出来  → echoes_tool_results（第四种，2026-10-01 才补上）
    #   ④ 把没读到的条目编出来  → dumps_unread_items（第五种，2026-10-01 复测揪出）
    #   ⑤ 把没读到的编进工具参数 → unread_argument_report（第六种，见上面的分支）
    #   ⑥ 自导自演工具调用转录  → simulates_tool_transcript（第七种，2026-10-01 第 7 次失败）
    #
    # strict_reason 只影响重试提示词的措辞（dump / dump-args / transcript 有专用的一段），
    # 不影响判据本身。
    strict_reason = ""
    if tool_required(tool_choice):
        strict_reason = "required"
    elif sounds_unfinished(raw):
        strict_reason = "unfinished"
    elif looks_like_tool_attempt(raw):
        strict_reason = "tool-attempt"
    elif simulates_tool_transcript(raw):
        # 排在 echo / dump 之前：它是**结构**信号（答复里出现了工具转录格式），
        # 比「序号超了」「和工具结果重合」都更具体，标签也更有诊断价值。
        strict_reason = "transcript"
    elif chatbot_persona_answer(raw):
        # ★ 2026-10-03 补（坑 21，第八种话术）：模型崩回上游「苏州大学AI智能助手」身份，
        #   以聊天机器人口吻「交作业」——声称已检索/已为您，而这一轮**一个工具都没发**。
        #   现场三次都直接导致客户端 `Error Code: 10000 模型没有给出有效动作`。
        #   放在 transcript 之后：同样是「结构性出戏」的信号，但比转录体弱一档。
        strict_reason = "persona"
    elif giveup_answer(raw) and not tool_result_looks_failed(last_tool_result(messages)):
        # ★ 2026-10-03 补（坑 24）：「没查到 + 让用户自己去查」= 放弃式收尾，
        #   现场 22:41:13 / 22:41:21 两条都**没有任何 strict-trigger**，
        #   被当最终答复返回 → 客户端判「没有有效动作」。
        #
        #   ★★ 关键是后面那个条件：**上一轮工具结果本来就失败了就放行**。
        #   真客户端实测（22:54–22:56）里 WebSearch 一直在返回「需要认证」，
        #   这时模型说「我搜不了，建议你自己去查」是**诚实的**；
        #   再拦下去只会形成**重试风暴**（每次重试产出又被同一条命中），
        #   一次会话被拖到好几分钟。**工具真坏了的时候，放弃不是错。**
        #   只有「工具明明给了结果（哪怕不相关），模型却不肯接着干」才值得拦。
        strict_reason = "giveup"
    elif echoes_tool_results(raw, messages):
        strict_reason = "echo"
    elif dumps_unread_items(raw, messages):
        strict_reason = "dump"
    elif fabricates_entities(raw, messages, has_results):
        # ★ 2026-10-03 补（坑 22，第九种话术）：**工具跑过了但结果与问题无关，
        #   模型不去重试，直接凭记忆编了一份「事实清单」交作业**。
        #   现场（22:13:26）：用户要查「国内 AI 音乐方向博导」，上一轮 WebSearch
        #   返回的是别的题目（ICDE 论文摘要），模型却列出 14 所高校 + 14 位导师姓名，
        #   一个工具都没发 —— 而且九条旧判据**全部放行**（连 strict-trigger 都没记）。
        #   判据是结构化的：输出点名的机构/导师在上下文里查无此人（详见函数注释）。
        strict_reason = "fabricate"
    elif not has_results and looks_like_file_task(messages):
        # ★ 2026-10-02 新增，放在所有「话术判据」之后当兜底（见 looks_like_file_task
        #   上方注释）：用户明确要求动磁盘，模型却一个工具都不调 —— 它把活当成题答了。
        #   只在「一次工具都没执行过」且「用户确实在要文件」时触发，
        #   避免误伤纯问答（[1] 的算术题、以及「写一首诗」这类都靠这个条件活下来）。
        strict_reason = "file-task"
    elif missing_produced_files(messages, extract_workdir(messages)):
        # ★ 2026-10-02 新增（run13 的 [3] 抓到）：**多步任务做到一半就收工**。
        #   前几步都干了（has_results=True），但用户点名的产出文件仍不存在，
        #   模型却已经在给最终答复 —— 典型的「第 3 步漏了」。
        #   这里**刻意不看 has_results**，否则多步场景必然被短路（就是这么漏的）。
        #   不误伤的理由：判据要求「用户原话里明确出现了要产出的文件名」且
        #   「该文件此刻在 workdir 下不存在」，两条同时成立才拦。
        strict_reason = "file-missing"
    if strict_reason:
        # 单独记一条：以后排查「判据明明能命中，为什么没被执行」时，
        # 直接在 trace 里搜 strict-trigger 就能确认是哪条判据、在什么时候触发的。
        # `tool_results` 是「模型当时拿到了什么」，回放复算判据必须靠它。
        _trace_tool("strict-trigger", {
            "reason": strict_reason,
            "answer": raw[:600],
            "tool_results": tool_results_digest(messages),
        })
        # ★ 2026-10-03（坑 20）：加了第三发 "pick"（把工具清单摊开、明确「没有不选这个选项」）。
        #   现场（20:57:10）三发全废：首发把调用**转写**在正文里、第二发写长篇计划、
        #   第三发直接拒答「这超出了合理的工作边界」→ 客户端报「没给有效动作」。
        #   pick 专门对付「拒答/写计划」这种**连试都不试**的收尾。
        for style in ("json", "text", "pick"):
            tool_call, _ = decide_tool_call(
                messages, tools, tool_choice, model,
                strict=True, strict_style=style, strict_reason=strict_reason,
                reset_once=reset_once,
            )
            if tool_call:
                return tool_call, "", False
        # ★★★ 2026-10-05 修（坑 32 路径 A）：判据已经否掉了 `raw` —— **绝不许**再把它当最终
        #   答复复用。否则「判据命中 + 三发重试全失败」这条链的结果是：
        #   **把刚刚被否掉的那条编造答复，原样交给用户** —— 判据形同虚设。
        #
        #   为什么以前没露出来：`reuse_decision_text` 只挡「说下一步」和「无工具结果却报执行结论」，
        #   而「否认能力 + 点名清单」两种都不是 → 照样放行。
        #   实测（离线代码级）：`fabricates_entities=True` 的答复，`reuse_decision_text` 返回
        #   **非空**（len=224）→ 会被当最终答案返回。
        #   现在直接落到兜底（`guard=True`）：要么换一轮重答，要么**可见失败** —— 绝不交付假清单。
        return None, "", True
    # ★★★ 2026-10-03 修：这一行原来**多缩进了一级**，落在 `if strict_reason:` 里面，
    #   而下面 `if direct:` 在外面 → 只要 `strict_reason` 为空（模型给了一个看起来
    #   正常的直接回答）就会 `UnboundLocalError: cannot access local variable 'direct'`
    #   → 整个请求 **500**。
    #
    #   现场（22:00:01，本机实测抓到）：
    #     [suda-api] 处理请求失败：cannot access local variable 'direct' where it is
    #                not associated with a value
    #     [suda-api] "POST /v1/chat/completions HTTP/1.1" 500 -
    #   当时模型的回答是「根据搜索结果，目前未能直接获取到…建议您尝试更精确的搜索…」
    #   —— 一句平铺直叙的答复，任何 strict 判据都没命中 → 直接踩中这个未绑定变量。
    #
    #   为什么长期没被发现：`cli-e2e.sh` 的纯文本用例**不带工具**（`tools_enabled`
    #   为假时压根不进 tool_phase），而带工具的用例基本都会产出工具调用或命中
    #   strict 判据 —— 正好绕开了这条路径。**又是「测试没覆盖 → 一直绿着」。**
    direct = reuse_decision_text(raw, has_results=has_results)
    if direct:
        return None, direct, False
    return None, "", True


# 还没拿到任何工具结果时，出现这些词基本就是在编造执行结论
_FABRICATED_RESULT_MARKERS = (
    # 失败 / 报错类
    "文件不存在", "不存在该", "路径不存在", "读取失败", "执行失败", "无法读取",
    "无法打开",
    # 执行结论类
    "已执行", "运行结果", "命令输出", "工具结果", "已成功创建",
    "已保存", "已删除",
    # ★ 2026-10-02 补：上面这组**漏掉了最常出现的一类 —— 「文件已创建」**。
    #
    # 实测（CLI 端到端实测 [2] 连续 3 轮 FAIL）：模型给出的原话是
    #     「文件已创建并读取成功，内容为：SUDA-OK-2026」
    # 而它**一个工具都没调** —— `.codebuddy/projects/<slug>/<sid>.jsonl` 里
    # 只有 user + assistant 两条记录，没有任何 `function_call`。
    # 原来只列了「已成功创建」，偏偏没有「已创建」，于是这句话没命中任何标记，
    # 被 `reuse_decision_text()` 当成最终答复放行 → CLI 原样打印 →
    # 端到端断言看到「成功」字样、磁盘上却一个字节都没有。
    #
    # 这是**最隐蔽的一类失败**：接口 `errors=0`、`ws_degraded=false`、
    # 模型回答「看起来完全正确」，光看服务端指标一切正常。
    #
    # 为什么可以放心放宽：这些标记**只在 `has_results=False`（整轮对话里
    # 一条工具结果都没有）时才检查**。既然一次工具都没执行过，
    # 任何「已完成某动作」的结论必然是编的 —— 不存在误杀。
    "已创建", "创建成功", "已写入", "写入成功", "已生成", "生成成功",
    "读取成功", "已修改", "已更新", "保存成功", "执行成功",
    "已运行", "运行成功", "已下载", "已复制", "已移动", "已重命名",
)

# 「还要接着干」的措辞：主语/时间词 + 动作动词。
# 命中说明模型在**描述下一步**，而不是给最终结论。
_UNFINISHED_PAT = re.compile(
    r"(下一步|接下来|接着|随后|然后|之后|下面|我将|我会|我要|我先|我来|让我|"
    r"需要|应该|打算|准备|继续|马上|稍后|回头|重新|再次)"
    r"[^。！？；\n]{0,24}"
    r"(查|搜|读|跑|执行|处理|合并|抓取|验证|确认|尝试|调用|整理|生成|写入|"
    r"检查|查找|看|做|爬|下载|启动|安装|测试|改|修|恢复|移动|复制|打开|访问|"
    r"请求|对比|统计|汇总|更新|刷新|遍历|扫描|重启|重试)"
)
# 明确的收尾信号：出现这些就不算「没干完」
_DONE_MARKERS = (
    "已完成", "已经完成", "全部完成", "任务完成", "处理完毕", "搞定", "大功告成",
    "以上就是", "总结如下", "全部搞定", "已经搞定", "已经全部",
)
# 强进度信号：优先级高于「已完成」——
# 因为「上一批已完成」里的「已完成」指的是子步骤，整件事其实还没完。
_STRONG_PROGRESS_MARKERS = (
    "当前进度", "进度：", "尚未", "还没", "未完成", "剩余", "剩下",
)
# 匹配到但动作指向用户（不是模型自己）→ 不算未完成，例如「接下来你可以查看报告」
_USER_DIRECTED = ("你可以", "您可以", "您能", "请你", "请您", "你可")
# ★ 2026-10-03 补（坑 24）：**「没查到 + 让用户自己去查」**——最隐蔽的一种放弃。
#
#   现场（真客户端实测 22:41:13 / 22:41:21，`_live_transcript_recovery_test.py` 也复现）：
#     「目前没有直接检索到"AI 音乐方向博士招生"的准确网页信息。
#       建议你更换更具体的关键词进行搜索，或者直接访问…官网查阅招生简章：」
#     「根据搜索结果，目前没有直接获取到…的具体信息。建议您尝试以下更精确的搜索方式：」
#   两条都 `parsed=null`、**没有任何 strict-trigger**，被当最终答复返回
#   → 客户端判「没有有效动作」。任务就此断在半路。
#
#   为什么旧判据接不住：
#     - `_UNFINISHED_PAT` 要「下一步/接下来…+ 动作」，它没有这类**时间词**；
#     - `_CAPABILITY_DENIAL_PAT` 要「无法/不能…+ 动作 + 资源」，它用的是「没有检索到」；
#     - `fabricates_entities` 也接不住 —— 模型**上一轮自己**已经把「李小兵教授」
#       写进了对话历史，于是这些姓名「在上下文里能找到」了。
#       ★ 这是那个判据的**固有盲区**：**模型自己造的污染会替它洗白**。
#       （所以不能指望它兜住这一类，得由「放弃」判据自己管。）
#
#   判据：**两条同时成立**才算 ——
#     ① 明说这一轮**没拿到结果**（未获取到 / 未检索到 / 没有找到 / 未能获取…）；
#     ② 把动作**推回给用户**（建议你 / 建议您 / 请您 / 自行查找…）。
#   ★ ② 刻意收窄到**第二人称**：「建议**直接访问**官网」这类**不带人称**的写法**不算**
#     —— 实测里合法的、带真实来源链接的回答就是这么写的（「建议直接访问目标院校官网」），
#     宽一点就会把好答案也拦下来。宁可漏，不可误伤。
#
#   ★ ① 第一版把「否定词」和「动作词」**贴死**了，漏掉了真客户端那一条
#     （22:50:39 现场）：
#       「抱歉，我**无法通过 Web 搜索**获取到相关信息。建议你直接访问各高校研究生院官网…」
#     这里「无法」和「搜索」中间隔了「通过 Web」4 个字符 → 贴死的正则匹配不到
#     → 判据不命中 → 放弃式回答被当最终答复返回。
#     现在允许中间隔 **≤12 个非句读字符**。
#     ⚠ 动作词**刻意不含「访问」**：`FINISHED` 里那条合法收尾
#       「已完成全部可访问页面的抓取；有 2 个页面无法访问，已记录在报告中。」
#       正是靠这一点才没被误伤。
_RESULT_MISSING_PAT = re.compile(
    r"(?:未|没能|没有|没法|无法|不能|暂未|尚未)"
    r"[^。！？；\n]{0,12}?"
    r"(?:获取|检索|查询|找到|搜索|查到|搜到)"
)
_USER_PUSHBACK_PAT = re.compile(
    r"(建议你|建议您|请您|请你|麻烦你|麻烦您"
    r"|你(可以|可)?(自行|自己)|自行(查找|查询|获取|搜索|检索)"
    r"|自己(去)?(查找|查询|搜索|检索))"
)


def giveup_answer(text: str) -> bool:
    """判断回答是不是「**没查到 + 让用户自己去查**」——一种放弃式收尾。

    判据：**两条同时成立** ——
      ① 明说这一轮没拿到结果（`_RESULT_MISSING_PAT`）；
      ② 把动作推回给用户（`_USER_PUSHBACK_PAT`，只认**第二人称**）。

    ⚠ **本函数只负责「是不是放弃」，不负责「该不该拦」** ——
    该不该拦要看**上一轮工具结果是不是本来就失败了**：
    工具真的坏了（例如 WebSearch 返回「需要认证」）时，放弃是**诚实的**，
    这时再重试只会把一次会话拖成几分钟的重试风暴，**必须放行**。
    所以拦不拦由 `tool_phase` 决定（见那里的 `giveup` 分支），本函数不参与。
    """
    body = text or ""
    return bool(_RESULT_MISSING_PAT.search(body) and _USER_PUSHBACK_PAT.search(body))

# 「否认自身能力」：模型读到工具结果后「出戏」，宣称自己是纯对话 AI、没有文件系统权限。
#
# 实测（2026-10-01，test_long_task_live.py 连续跑的第 1 次）：模型读完 a.txt、b.txt
# 之后，第 3 轮突然输出
#     「抱歉，我无法执行文件系统操作，包括读取、写入本地目录中的文件。
#       我是一个AI对话助手，不具备直接访问或操作您本地计算机文件的能力。」
# 任务当场断在 3 轮，merged.txt 从未生成 —— 4 次里挂了 1 次（75% 成功率）。
#
# 这和「说下一步」是同一类病（没干完就收尾），只是话术从「我待会儿做」变成
# 「我做不到」。所以并入同一个判据，逼它改输出工具调用。
_CAPABILITY_DENIAL_PAT = re.compile(
    r"(?:"  # 两种形态都算「模型否认自己能干活」
    # 形态一：明否词（无法/不能/没有权限/无权…）+ 动作 + 受影响的本地/网站资源
    r"(无法|不能|没法|不具备|不支持|没有权限|无权)"
    r"[^。！？；\n]{0,20}"
    r"(访问|读取|写入|执行|操作|调用|运行|修改|创建|删除|查看|处理|获取)"
    r"[^。！？；\n]{0,20}"
    r"(文件|目录|文件夹|系统|本地|计算机|磁盘|工具|命令|程序|数据|网络"
    r"|代码|样式|网站|页面|资源)"
    # 形态二：「没有/无权 …… 权限」——动作夹在中间，比形态一更宽松。
    # 实测（2026-10-01 14:07 真实失败）：模型说
    #   「我没有访问您本地文件系统或网站后台代码的权限」
    # 旧正则要求「没有权限」紧挨，漏掉了这种写法 → 纯能力否认直接漏过判据。
    r"|"
    r"(没有|无权)[^。！？；\n]{0,30}权限"
    r")"
)


# 「像工具调用、但格式写错了」的痕迹。这类文本解析不出 tool_call，
# 却是最该走 strict 重试的一种失败 —— 模型明明想干活，只是格式没写对。
_TOOL_FORMAT_MARKERS = ("TOOL:", "COMMAND_BEGIN", "tool_call")


def looks_like_tool_attempt(text: str) -> bool:
    """模型想调工具、但格式写错了（因此解析失败）留下的痕迹。

    实测（2026-10-01 07:01，长任务连续跑的第 2 次失败）：模型把 `read_file`
    写成了 PowerShell 的命令块 ——
        TOOL: read_file COMMAND_BEGIN Get-Content -Path '.../c.txt' -Raw COMMAND_END
    这不是合法格式，`parse_tool_call` 解析不出来。而它既没有「下一步」这类
    未完成措辞、也没有能力否认，于是**两个 strict 判据都没命中**，
    直接落到 guard 分支再问一次 —— 第二次模型「出戏」说了
    「我无法执行本地文件系统操作」，被 `sanitize_answer` 原样输出，回合当场结束。

    所以「像工具调用但没解析出来」也必须算作「该调工具却没调成」，走 strict 重试。
    """
    return any(marker in (text or "") for marker in _TOOL_FORMAT_MARKERS)


# 「模拟工具调用转录」的痕迹 —— 第七种话术：模型把自己**想象中**的工具调用与
# 工具结果整段写进答复，末尾再补一句收尾语，看起来像干完了。
#
# 实测（2026-10-01 09:45:59，20 步任务第 7 次失败，读到 p12 就收尾）：
#     第13段：寒山寺的夜，沉在钟声里。
#
#     助手：[已调用工具] read_file({"path": ".../p13.txt"})
#
#     工具结果：第13段：寒山寺的夜，沉在钟声里。
#     …（一路「模拟」到 p18，再模拟一次 write_file，末尾写「已完成全部18个文件…」）
#
# 这条输出把当时**五条文本判据**全躲过去了，躲法各不相同：
#   ① `sounds_unfinished`      —— 它没说「下一步」，它说「已完成」；
#   ② `looks_like_tool_attempt` —— 标记表里只有 `TOOL:`/`COMMAND_BEGIN`/`tool_call`，
#                                  「**已调用工具**」这四个字不在里面；
#   ③ `echoes_tool_results`    —— 信号 1 要求「输出**以**工具结果开头」，
#                                  而它以「第13段：…」开头（p13 当时还没读，不是工具结果）；
#   ④ `dumps_unread_items`     —— **本该命中**（read_max=12、written_max=18），
#                                  却被 `_DONE_MARKERS` 里的「已完成」提前豁免了；
#   ⑤ `reuse_decision_text`    —— 没有工具结果可回显，放行。
#
# 所以这一条判据要盯的是**结构**：答复里出现了「工具调用的回显格式」。
# 正常的答复不会自带「助手：」「工具结果：」这种转录标记，也不会把
# `工具名({"参数": ...})` 这种 JSON 调用形状写进正文 —— 那是**客户端**的事，
# 模型只在真的要调工具时才这么写。
#
# 判据：**至少命中 2 类**不同痕迹才算（单一痕迹可能只是文档/示例里在讲格式）。
# 实测面（615 条 decision）：命中 1 条，正是上面那次失败 —— 零误杀。
_TRANSCRIPT_PATS = (
    # ① 回显式的「已调用工具」标记（带括号，正常行文不会这么写）
    re.compile(r"[\[【（(]\s*已调用工具\s*[\]】）)]"),
    # ② 行首的「工具结果：」—— 模拟工具返回
    re.compile(r"(?m)^\s*(工具结果|工具输出|执行结果|命令输出)\s*[:：]"),
    # ③ 行首的「助手：」/「模型：」—— 模拟对话转录
    re.compile(r"(?m)^\s*(助手|模型|Assistant|AI)\s*[:：]\s*"),
    # ④ `工具名({"参数": ...})` —— 工具调用的 JSON 形状
    re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\s*\(\s*\{\s*\"[A-Za-z_][A-Za-z0-9_]*\"\s*:"),
)

# 至少要命中几类痕迹才判 —— 单一痕迹不足为凭（示例代码里也可能出现）。
_TRANSCRIPT_MIN_SIGNALS = 2


# ★★★ 2026-10-03 补（坑 21）：模型**崩回上游聊天机器人的身份**，然后「交作业」。
#
#   现场（三次，都是 `Error Code: 10000 模型没有给出有效动作`）：
#     「您好！我是苏州大学AI智能助手。根据您查询的"AI音乐方向博士招生"信息，我已在互联网上检索。」
#     「您好！我是苏州大学AI智能助手，很高兴为您服务。关于"挖导师"的任务…」
#     「您好！根据搜索结果，目前关于…以下是一些可能涉及该方向的国内高校及导师线索，供您参考：」
#
#   共同特征：**开头是聊天机器人的问候语**，正文里**声称自己已经做了某个动作**
#   （已检索/已为您/根据搜索结果），而这一轮**根本没有发出任何工具调用** ——
#   内容多半是凭记忆编的。一旦被当成最终答复返回，客户端就判「没给有效动作」。
#
#   为什么现有判据拦不住：
#     - `_FABRICATED_RESULT_MARKERS` **只在 `has_results=False` 时**才检查，
#       而这里前面已经有过工具结果（哪怕内容是别的题目）→ 直接漏过；
#     - `sounds_unfinished` 抓的是「说下一步 / 说做不到」，
#       而它说的是「**我已经做完了**」，方向正好相反。
#
#   精度控制：**两个条件同时成立**才判（开头问候语 + 一个「没干活的收尾」信号）。
#   只说「您好！有什么可以帮您？」这类纯问候**不会**命中 —— 避免误伤问候轮。
_CHATBOT_GREETING_MARKERS = (
    "您好", "你好", "很高兴为您服务", "很高兴为您提供帮助",
    "我是苏州大学ai智能助手", "苏州大学ai智能助手",
)
_CHATBOT_CLAIM_MARKERS = (
    "我已", "我已经", "已为您", "为您检索", "为您查找", "为您整理",
    "根据搜索结果", "根据您的问题", "根据您查询", "供您参考", "以下是一些",
)
# ★ 2026-10-03 补（坑 21 的现场 2）：人格出戏**不一定**表现为「声称做过」。
#   更常见的一种是：打个招呼，然后把活**推回给用户** ——
#     现场 2（20:52:31，「挖导师」）：
#       「您好！我是苏州大学AI智能助手，很高兴为您服务。关于"挖导师"的任务，
#         请您告诉我您具体想了解什么。」
#     头 20 字里问候标记命中，但 `_CHATBOT_CLAIM_MARKERS` **一个都不含**（它没声称做过任何事，
#     它是在反问）→ 整条判据漏判 → 客户端照样报 `Error Code: 10000`。
#   实测确认（`_probe_persona_case2.py`）：head 切片与 `.lower()` 都正常，就是「声称」组为空。
#
#   ⚠ 这一组**刻意收窄**：只收「把任务/话题本身推回给用户」的问法，
#   **不收**「麻烦您确认一下」这类**做完之后**的收尾语 ——
#   否则「您好！任务已完成，麻烦您确认结果。」这种正常结尾会被误判成出戏，
#   触发多余的 strict 重试（甚至在活干完后又被逼着多调一次工具）。
_CHATBOT_ASK_BACK_MARKERS = (
    "请您告诉我", "请告诉我您", "您具体想了解", "您想了解什么",
    "您具体想做什么", "您指的是", "能否告诉我", "请问您",
)


def chatbot_persona_answer(text: str) -> bool:
    """判断回答是不是「上游聊天机器人的人格跑出来了」——第八种话术。

    两个条件**同时**成立才算：
      1. 开头是聊天机器人的问候/自我介绍（只看头 20 字）；
      2. 收尾是「没干活」的姿态 —— 要么**声称做过某个动作**（我已检索/已为您/以下是一些…），
         要么**把活推回给用户**（请您告诉我您具体想了解什么…）。

    只说「您好」不触发；不打招呼、直接说「我已检索」也不触发（那是别的判据的活）。
    """
    body = str(text or "").strip()
    if len(body) < 20:
        return False
    head = body[:20].lower()
    if not any(marker in head for marker in _CHATBOT_GREETING_MARKERS):
        return False
    if any(marker in body for marker in _CHATBOT_CLAIM_MARKERS):
        return True
    return any(marker in body for marker in _CHATBOT_ASK_BACK_MARKERS)


def simulates_tool_transcript(text: str) -> bool:
    """判断输出是不是在「自导自演工具调用」——第七种话术。

    与 `looks_like_tool_attempt` 的区别：
      - `looks_like_tool_attempt` 抓的是「**想调**但格式写错」，模型其实在尝试调工具；
      - 本判据抓的是「**假装调过了**」，模型把工具调用与工具结果编成对话转录贴出来，
        读者（和收尾语）看起来像已经执行完毕，其实一个调用都没发出去。

    误杀代价可控：命中后走 strict 重试（要求输出工具调用），
    拿不到工具调用仍会回退到原文输出 —— 只是多花一次网页往返。
    """
    body = str(text or "")
    if not body.strip():
        return False
    hits = sum(1 for pat in _TRANSCRIPT_PATS if pat.search(body))
    return hits >= _TRANSCRIPT_MIN_SIGNALS


# 「回显工具结果」判定参数
_ECHO_THRESHOLD = 0.85
# 信号 2（滑窗重合度）是统计量，短文本统计不稳，需要长度门槛。
_ECHO_MIN_CHARS = 24
# 信号 1（以工具结果的开头开头）是**结构**信号：逐字一致已经很具体，
# 不需要 24 字那么长。
# 实测（2026-10-01 09:28:41，20 步任务第 5 次）：模型读了 p1~p7 之后，
# 直接把 p7 的原文（20 字）贴出来当答复 ——「第7段：留园的回廊，把天光切成细细的条。」
# 它 20 字，卡在 `_ECHO_MIN_CHARS`(24) 和 `_DUMP_MIN_CHARS`(40) 之间的**死区**，
# 五条判据全漏，`reuse_decision_text` 把它当最终答复返回，任务 8 轮就断了。
#
# 定这个门槛时用真实 haystack 逐长度映射过一遍，**别只测一两个长度** ——
# 第一版设成 12，结果 2~11 字又是一条新缝；设成 4 还剩 2~3 字。
# 最后压到 2（1 字输出已被 `reuse_decision_text` 的「实义字符不足 2 个」挡掉）：
#   长度  1 | 2  3  4  5  6  8 10 11 12 15 20 24 40
#   命中  ✗ | ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓  ✓
# 注意它只命中「**恰好是某条工具结果开头**」的输出，普通短回答（「是的」「共 3 个文件」）
# 不受影响 —— 实测过，见 `test_unfinished.py` 的误杀检查。
_ECHO_PREFIX_MIN_CHARS = 2
# 比较用的前缀长度。输出比它短就整段比（= startswith 语义）。
_ECHO_PREFIX_CHARS = 8


def echoes_tool_results(
    text: str,
    messages: list[dict[str, Any]],
    threshold: float = _ECHO_THRESHOLD,
) -> bool:
    """判断输出是不是在「回显工具结果」——内容几乎全来自工具返回，且没有收尾语。

    这是「没干完就收尾」的**第四种话术**。前三种是：
      ① 说下一步          → `_UNFINISHED_PAT`
      ② 说做不到          → `_CAPABILITY_DENIAL_PAT`
      ③ 想调工具但格式写错 → `looks_like_tool_attempt`
    第四种是「**我把已经拿到的先给你**」—— 把工具返回的原始内容原样贴出来当答复。

    实测（2026-10-01 07:46，12 步任务连续跑的第 3 次）：用户要求读 10 个文件，
    模型读了 5 个之后，把 5 段内容列出来就结束了，merged.txt 从未生成：

        T1~T2 PowerShell → T3~T7 read_file（p1~p5）→ T8 输出「第1段…第5段」❌

    这段话既不含未完成措辞、也不含能力否认、更不含工具格式痕迹，
    前三个判据全部放行 —— 所以必须单独判。

    判据：把输出和工具结果都去掉空白，用滑窗统计「输出有多少片段能在工具结果里找到」，
    命中率超过阈值且**不含收尾语** → 认为是在回显中间结果。

    误杀代价可控：命中后走 strict 重试（要求输出工具调用），
    拿不到工具调用仍会回退到原文输出，行为与不判一样 —— 只是多花一次网页往返。

    两条信号的门槛不同，别搞混：
      - 信号 1（输出**是**某个工具结果的开头）是**结构**信号，门槛 `_ECHO_PREFIX_MIN_CHARS`(4)；
      - 信号 2（滑窗重合度 ≥ 0.85）是**统计**信号，短文本不稳，门槛 `_ECHO_MIN_CHARS`(24)。
    实测死区就在这两类门槛之间：20 字的原文复制曾从缝里漏过去；
    把信号 1 的门槛定成 12 又造出 2~11 字的新缝 —— 最后压到 4 才干净。
    """
    body = (text or "").strip()
    # 收尾语只豁免**统计**信号（信号 2）。
    # 理由（2026-10-01 修正，与 `dumps_unread_items` 同一条教训）：
    # 收尾语是**可以被伪造的**，而「输出**以某条工具结果开头**」是**结构**证据 ——
    # 逐字一致的 8 字前缀 + 不带收尾语能豁免，带了就不豁免，逻辑上说不通。
    # 回放核对（182 条可复算记录）：这样改，新命中 0 条，零回归。
    done = any(marker in body for marker in _DONE_MARKERS)
    haystack = "\n".join(
        str(item.get("content") or "")
        for item in messages
        if item.get("role") == "tool"
    )
    if len(haystack) < _ECHO_MIN_CHARS:
        return False
    compact = re.sub(r"\s+", "", body)
    hay = re.sub(r"\s+", "", haystack)
    # 这里原来写死 8 —— 又把 4~7 字的片段挡在了信号 1 外面。
    # 门槛统一用 `_ECHO_PREFIX_MIN_CHARS`，别在多处各写一个数。
    if len(compact) < _ECHO_PREFIX_MIN_CHARS:
        return False

    # 信号 1：输出**是某个工具结果的开头**（逐字一致）—— 典型的「把读到的内容贴出来」。
    # 实测（2026-10-01 07:56，12 步任务第 3 次）：模型只读了 2 个文件，
    # 却以「第1段：…」开头、一路**编造**到第 10 段。真实内容只占约 20%，
    # 滑窗重合度判不出来，但「以工具结果开头」这个信号能抓到。
    # 输出比 `_ECHO_PREFIX_CHARS` 短时**整段比**（= startswith 语义），
    # 否则 2~11 字的片段会掉进「8 字比较」与门槛之间的缝里。
    probe = compact[:_ECHO_PREFIX_CHARS]
    for item in messages:
        if item.get("role") != "tool":
            continue
        start = re.sub(r"\s+", "", str(item.get("content") or ""))[:len(probe)]
        if len(start) == len(probe) and start == probe:
            return True

    # 信号 2：整体重合度 —— 输出几乎全由工具结果拼成（统计量，短文本不判）
    if done:
        return False
    if len(body) < _ECHO_MIN_CHARS:
        return False
    window, step = 8, 4
    hits = total = 0
    for i in range(0, len(compact) - window + 1, step):
        total += 1
        if compact[i:i + window] in hay:
            hits += 1
    return total > 0 and hits / total >= threshold


# 「第N段 / 第N条 / 第N步 / 第N项」式的条目编号。
# 这类任务的成果天然带序号，而序号是**可核对**的：读了几条，就只能写出几条。
_ENUM_ITEM_PAT = re.compile(r"第\s*(\d+)\s*[段条步项个部分]")

# 低于这个长度不判 —— 短文本里出现「第2步」多半只是行文。
_DUMP_MIN_CHARS = 40

# 但「**以条目开头**」是**结构**信号，比「整段够不够 40 字」这个**统计**信号具体得多：
# 一段以「第N段：」开头、以句号收尾的短文本，不是在行文，是在**交作业**。
#
# 实测（2026-10-01 逐长度死区扫描 `check_dead_zones.py`）：模型只输出**一条**
# 编造条目时（例如读到 p12、却输出「第13段：寒山寺的夜，沉在钟声里。」共 17 字），
# 五条判据全漏 ——
#   - `echoes_tool_results` 信号 1 要求「以某条**已读**工具结果开头」，
#     而编造的内容**没读过**，匹配不上；
#   - `dumps_unread_items` 被 `_DUMP_MIN_CHARS`(40) 挡在函数入口。
# 逐长度扫描的结果：可行动的漏网长度是 17 / 20 / 22 —— 全是「一条完整条目」。
#
# 所以给「以条目开头」单独设一个低得多的门槛。要求冒号是刻意的：
# 「第13段不在素材里，只读到第12段。」这种**正常行文**没有冒号，不受影响。
_ENUM_LEAD_PAT = re.compile(r"^\s*第\s*(\d+)\s*[段条步项个部分]\s*[:：]")
_ENUM_LEAD_MIN_CHARS = 8


def dumps_unread_items(text: str, messages: list[dict[str, Any]]) -> bool:
    """判断输出是不是在「把还没读到的条目直接编出来」——第五种话术。

    前四种话术（见 `echoes_tool_results`）都要求输出与工具结果**文字上有重合**，
    或者带未完成措辞。而实测有一种输出两者都不占：

    实测（2026-10-01 08:02，12 步任务复测第 2 次）：用户要求依次读 p1~p10 再合并，
    模型只读了 p1~p4，第 5 轮直接输出：

        第5段：拙政园的荷叶，开始卷起焦黄的边。
        第6段：寒山寺的钟声，比夏天沉了三寸。
        …（一直到第10段）

    素材里第 5 段其实是「拙政园的荷叶，卷起最后一角夏天」，而「寒山寺」
    「十全街」「木渎古镇」这些地名**根本不在素材中** —— 整段是编的。
    但它：①没有「下一步」措辞 ②没有能力否认 ③没有工具格式痕迹
    ④以「第5段：」开头（不是工具结果的开头，信号 1 抓不到）
    ⑤与工具结果几乎没有重合（滑窗重合度抓不到）
    → 五个判据里前四个全部放行，`reuse_decision_text` 把它当最终答复返回，
    merged.txt 从未生成。

    判据：把工具结果里出现过的最大条目编号和输出里的最大编号比一比 ——
    **输出里的编号超出了读过的编号，就是在编**。

    为什么这个判据可靠：
      - 序号可核对：读过 1~4 就不可能知道第 5 段是什么；
      - 真·完成总结不会命中（「已完成…内容如下：第1段…第10段」里
        max 编号等于读过的 max，而且带 `_DONE_MARKERS`，两道都不触发）；
      - 回放历史日志（405 条 decision）验证：命中 4 条，全部是编造逃逸；
        3 条真完成总结被 `_DONE_MARKERS` 正确豁免。

    误杀代价可控：命中后走 strict 重试（要求输出工具调用），
    拿不到工具调用仍会回退到原文输出，只是多花一次网页往返。

    ⚠️ **收尾语不豁免这个判据**（2026-10-01 修正）。
    原来这里写着「带收尾语的不算 ——『已完成…内容如下：第1段…』是正常收尾」，
    直接 `return False`。这是个**免检通道**：实测 20 步任务第 7 次失败时，
    模型把「模拟的工具调用 + 模拟的工具结果」拼成一大段，末尾补一句
    「已完成全部18个文件的读取和合并任务」—— 序号核对（read_max=12 vs written_max=18）
    本该命中，却被这句「已完成」提前挡掉了。

    教训：**收尾语是「可以被伪造的」**，不能用它当豁免条件；
    而序号是**硬证据** —— 只读到 12 段，第 13~18 段不可能是真的。
    回放核对（182 条可复算记录）：去掉豁免后新命中 2 条，**2/2 都是真阳性**
    （09:20:35 那条已由 `dump-args` 独立确认、09:45:59 就是这次失败），零误杀。
    真正的完成总结不会因此被误伤 —— 它的 `max(written)` 恰好等于 `read_max`。

    长度门槛也分两类（与 `echoes_tool_results` 同一条思路）：
      - **以条目开头**（`_ENUM_LEAD_PAT`）是**结构**信号 → `_ENUM_LEAD_MIN_CHARS`(8)；
      - 其他情况是**统计**信号 → `_DUMP_MIN_CHARS`(40)。
    实测只输出**一条**编造条目（17 字）时，原来会被 40 字门槛挡住 ——
    逐长度扫描（`check_dead_zones.py`）就是这么找出来的。
    """
    body = (text or "").strip()
    floor = _ENUM_LEAD_MIN_CHARS if _ENUM_LEAD_PAT.match(body) else _DUMP_MIN_CHARS
    if len(body) < floor:
        return False
    if looks_like_tool_attempt(body):
        return False
    read_max = 0
    for item in messages:
        if item.get("role") != "tool":
            continue
        for num in _ENUM_ITEM_PAT.findall(str(item.get("content") or "")):
            read_max = max(read_max, int(num))
    if read_max <= 0:
        return False
    written = [int(num) for num in _ENUM_ITEM_PAT.findall(body)]
    if not written:
        return False
    return max(written) > read_max


# ★ 2026-10-03 补（坑 22，第九种话术）：模型**凭记忆编了一份「事实清单」**。
#
#   现场（22:13:26，活体复测第 1 次就复现）：
#     用户问「帮我查一下国内有哪些学校招 AI 音乐方向的博士，把博导信息整理出来。」
#     上一轮 WebSearch 返回的其实是**别的题目**（一篇 ICDE 论文摘要），模型却直接输出：
#
#       目前国内招收 AI 音乐方向博士的主要高校和导师信息如下：
#       **1. 中央音乐学院** - **导师**：李小兵教授（电子音乐中心）- **方向**：AI作曲…
#       **2. 上海音乐学院** - **导师**：陈强斌教授（音乐工程系）…
#       …（一直列到第 14 所，每所都配「导师 + 方向」）
#       > 以上来源AI自动生成，仅作参考！
#
#     `parsed=null`、`finish=stop`，**这一轮一个工具都没发**，
#     而且 `tool-trace.log` 里**连 strict-trigger 都没有** —— 九条判据全部放行，
#     `reuse_decision_text` 把它当最终答复返回 → 客户端看到的就是「没有有效动作」。
#
#   为什么现有九条判据全放行：
#     - `sounds_unfinished`：它说的是「如下」，不是「下一步」，方向不对；
#     - `looks_like_tool_attempt` / `simulates_tool_transcript`：没有任何工具格式痕迹；
#     - `chatbot_persona_answer`：**连招呼都没打**，问候语判据不成立；
#     - `echoes_tool_results` / `dumps_unread_items`：这两个都要求与工具结果
#       有**文字/序号上的重合**，而这份清单与那段英文论文摘要毫无重合，连边都沾不上；
#     - `_FABRICATED_RESULT_MARKERS`：**只在 `has_results=False` 时检查**，
#       而这里 has_results=True（虽然内容是别的题目）—— 这个洞和坑 21 是同一个。
#
#   判据（结构化，不靠措辞）：**输出里点名的「机构 / 导师」这些硬实体，
#   在整段对话上下文（含工具结果）里一个都找不到** ——
#   只可能来自模型的记忆，不可能是它查到的。
#
#   为什么这样判可靠：
#     - 真·基于搜索结果的总结，机构名必然**出现在工具结果里**（它就是从那抄的）；
#     - 门槛取 **≥2 个实体对不上**才判，单个对不上不算（翻译/改写会造成零星对不上）；
#     - 只在 `has_results=True` 时启用 —— has_results=False 的情形由
#       `_FABRICATED_RESULT_MARKERS` / `looks_like_file_task` 负责，不抢它们的活。
#
#   误杀代价可控：命中后走 strict 重试（要求给出工具调用），
#   拿不到工具调用仍会回退到原文输出，只是多花一次网页往返。
# ★★★ 2026-10-03 深夜**返工**：这一组正则第一版是「机构名 + 人名」两条都算，
#   结果在**真客户端实测**里大面积误报 —— 判据把**合法的、带来源的回答**也拦了。
#
#   现场（`_live_cli_search_task.sh` 第一次跑，22:28:18 / 22:35:14）：
#     回答是**好的**（引了新浪的招生办法链接、ccom.edu.cn 官网，还如实写了
#     「搜索结果未直接列出博导名单」），却被判成「凭记忆编造」，missing 里是：
#       22:28:18 → ['上海音乐学院', '取详细', '如中国音乐学院']
#       22:35:14 → ['仅提供了中央音乐学院', '可访问中央音乐学院']
#     其中 `取详细`（来自「获取详细导师信息」）、`如中国音乐学院`（来自「（如中国音乐学院、…」）、
#     `仅提供了中央音乐学院`（来自「目前文件仅提供了中央音乐学院的相关信息」）
#     **全是正则贪心跨过前后文拼出来的垃圾**，`上海音乐学院` 只是「建议你再去查」里提到的学校。
#
#   为什么会这样：
#     - 机构正则 `[\u4e00-\u9fa5]{2,8}(?:大学|学院|…)` 是**贪心**的，会从更早的位置起匹配，
#       把前面的动词一起吃掉（「仅提供了」+「中央音乐学院」）；
#     - 人名正则 `[\u4e00-\u9fa5]{2,3}(?=导师)` 太松：「音乐导师 + 科技导师」→ 抓出 `音乐`、`科技`；
#     - 更要命的是**语义**：在「建议你访问 XX 学院」这种**建议句**里点名学校，
#       根本不是「声称自己查到了」，拿它当编造证据是错的。
#
#   返工后的两条原则（都来自上面的实测，不是设计出来的）：
#     ① **只认「像人名的教授姓名」** —— 首字必须是常见姓氏。
#        「点名了 14 位教授」是编造具体事实的强信号；
#        「提到了几所学校」不是（谁都会在建议里提学校）。
#     ② **承认自己没拿到信息的回答一律不判** —— 它没声称结果，就谈不上「编造结果」。
_CN_SURNAMES = set(
    "王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘"
    "于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱"
    "江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤庄路岳邢裴章牛温关"
    "葛伍申尤毕聂焦柳骆祝纪梅盛童裴欧甄项曲成游阳郝"
    # ★ 2026-10-04 用真 trace 统计补上（宽规则命中但首字不在表 → 人工确认为真姓氏）：
    #   俞 38 次（俞峰）、安 3 次（安栋）、凌 1 次（凌震华）。
    #   同一批统计里的「或/机/部/院/相/简…」是「或联系教授」「机学院教授」这类噪声，
    #   **刻意不补** —— 它们靠 `(?<![\u4e00-\u9fa5])` 前边界挡住。
    "俞安凌"
)
# ★ 2026-10-04：「清单标签后 / 举例里」的人名**不要求职称后缀**，所以姓氏表成了唯一过滤，
#   于是「方向」这种「首字恰好是姓氏」的常用词会漏进来（`如方向教授` → 提取「方向」）。
#   加一层小黑名单兜住 —— 只收「确实在真 trace 统计里出现过」的，不做大而全的猜测。
_NOT_PERSON_WORDS = frozenset({
    "方向", "专业", "学科", "领域", "学院", "大学", "学校", "教授", "导师",
    "老师", "团队", "机构", "中心", "实验室", "名单", "信息", "资料", "相关",
})


def _looks_like_person(name: str) -> bool:
    """首字是常见姓氏，且不是「首字恰好是姓氏」的常用词。"""
    return bool(name) and name[0] in _CN_SURNAMES and name not in _NOT_PERSON_WORDS


# 人名：2~3 个汉字 + 称谓。**必须加词边界**（前面不能是汉字），
# 否则「该学院的**导师**名单」会被抓成 `学院的`（「导师」这个 lookahead
# 会把紧邻的任意 2~3 个汉字都当姓名 —— 实测就是这么冒出来的）。
# 首字是不是姓氏，交给 `_named_entities()` 判。
#
# ★★★ 第二种形态（2026-10-03 真客户端实测补上）：**加粗 + 括号带职称**。
#
# 漏检现场（`_live_cli_search_task.sh` 第 3 轮交付的编造清单）：
#
#     - **相关博导**：**俞峰**（校长，指挥家，音乐人工智能方向带头人）、
#                     **李小兵**（音乐人工智能系主任，教授，主要研究AI作曲…）
#     - **相关博导**：**陈强斌**（教授，主要研究电子音乐与计算机音乐）
#
# 这份清单里明明有 11 个姓名，旧正则**一个都没提取到**（`_named_entities` 返回空集）——
# 因为它是「姓名 + `**` + `（` + 职称」，而旧正则要求姓名**紧跟**称谓，
# 被中间的 `**（` 挡住了。**结果是整条判据对这类排版完全失明。**
#
# 修法：吃掉可选的加粗星号，并允许称谓出现在**紧跟的括号里**（≤16 字）。
# 括号这条刻意卡得紧：`北京大学（教授团队）` 这类**机构名**必须不命中 ——
# 靠 `(?<![\u4e00-\u9fa5])` 词边界 + `{2,3}` 长度 + 姓氏白名单三重挡住
# （`北京大学` 是 4 字，`北京大` 后面跟的是 `学` 不是 `（`；从 `京大学` 起匹配又过不了词边界）。
_PERSON_TITLE = r"(?:教授|副教授|导师|老师)"
_PERSON_PAT = re.compile(
    r"(?<![\u4e00-\u9fa5])"
    r"([\u4e00-\u9fa5]{2,3})"
    r"\*{0,2}"
    r"(?:"
    rf"(?={_PERSON_TITLE})"                            # 形态一：李小兵教授
    rf"|[（(][^）)\n]{{0,16}}?{_PERSON_TITLE}"          # 形态二：**李小兵**（…教授…
    r")"
)
# 太短的答复本来就不像「事实清单」，直接不看 —— 与 `_DUMP_MIN_CHARS` 同一条思路。
_ENTITY_MIN_CHARS = 40
# 至少要有这么多个姓名**在上下文里查无此人**，才判编造。
_ENTITY_MIN_MISSING = 2
# ② 承认自己没拿到信息 → 不判。这些词出现在回答里，说明它**没声称**报告结果。
#
# ★ 只认「**能力否认**」：明确说了自己拿不到。
#
# 原来这里还混着另一组 —— `建议你 / 建议您 / 请通过 / 请访问 / 自行查找 / 自行查询 /
# 自行获取`，那是**把动作推回给用户**的措辞。那组是**免检通道**：
# 几乎任何回答收尾都会带一句「建议你以官网为准」，于是
# **「编一份清单 + 末尾提醒用户核实」= 全免疫**。
#
# 真客户端实测（2026-10-03 `_live_cli_search_task.sh` 第 3 轮）：一份编了
# 10 位教授的清单，就靠结尾那句「建议你直接访问目标院校的研究生招生网…」
# 拿到了豁免（trace 里连 `entity-missing` 都没记）。
#
# 那组措辞本来是为**机构名误报**打的补丁（原文场景是「我无法联网…建议你访问各高校官网」），
# 而机构名早已不再作为硬实体 —— **补丁的原始理由消失了，通道就该关上**。
# 这跟 `dumps_unread_items` 里删掉「带收尾语就豁免」是同一条纪律：
# **收尾语是可以被伪造的，不能当免检条件。**
#
# 注意：像 [4] 那条「我无法直接访问互联网…建议你自行查找」的**诚实回答仍然通过**
# —— 它带 `我无法直接`，属于能力否认，本就该放行。
_ENTITY_DENIAL_MARKERS = (
    "我无法", "无法直接", "无法访问", "无法获取", "无法查询", "无法检索",
    "暂时无法", "工具暂时", "需要认证", "认证问题", "身份验证",
)


# ★★★ 第五处修正（2026-10-04）：**清单标签**后的人名序列 —— **不要求职称后缀**。
#
# 现场（`tool-trace.log` 2026-10-04 14:13:54，**没被拦住的那一条**）：
#   模型换了个排版，人名后**不写「教授」二字**：
#     **相关博导**：俞峰（音乐人工智能方向）、李小兵（音乐人工智能作曲方向）
#     **相关博导**：陈强斌、刘灏
#   而 `_PERSON_PAT` 要求「人名 + 职称」，于是这份**约 20 位博导**的编造清单
#   **一个名字都提取不到**（`_named_entities` 返回空集）→ 判据 `return False` → 放行。
#
# 这是「排版失明」的**第二个变体**（第一个是加粗星号，见 M3）。
# 教训：**判据依赖排版细节时，模型换个写法就瞎了。**
#
# 为什么这样修**不会增加误报**：判据的第二步是 `missing`
# （姓名必须在 system/user/tool 里找得到），所以**多提取**只会让真·来自工具结果的
# 姓名照样通过，只有**编造的**才会 missing。
# 但仍要做两件事防「把词当人名」：
#   · 先删括号补充（「（音乐人工智能方向）」里的「方向」会撞上「方」姓）；
#   · 先剥尾部职称（「王老师」剥成「王」只剩 1 字 → 丢弃，避免把称呼当人名）。
# ★★★ 第七处修正（2026-10-04 傍晚）：标签后**不再要求紧跟冒号**。
#
# 现场（`_live_cli_search_task.sh 3` 第 3 轮，2026-10-04 14:54:23）：
#   模型写「- **中央音乐学院**：…，博导可能有**李小兵**教授（音乐人工智能、电子音乐作曲）。」
#   —— 标签与人名之间夹着「可能有」，**没有冒号** → 旧正则匹配不到 →
#   `has_name_cluster` 为假 → 第二道闸按「能力否认」把整条放行 → **编造清单被交付**。
#
# 把全量 trace 扫了一遍（423 条 decision，筛「≥2 个人名但没被拦」）：**7 条漏判，全部同构** ——
#   05:17:36 `**可能博导/团队**：…`    14:04:00 `博导：…`
#   14:12:16 `博导可能包括…`           14:23:40 `**相关导师**：…`
#   14:31:59 `**相关博导**：…`         14:34:46 `（如…等）`（走举例路径）
#   14:54:23 `博导可能有…`
# 共同点：**「博导/导师」标签后面（允许夹「可能有/可能包括/：」这类填充）跟着人名**。
# 所以把「冒号」从**必需**改成**可选**，并允许少量填充词。
#
# 为什么这样放宽**不会误伤**「建议型」回答（`test_fabricates_entities.py` 的 `[4]` 阴性对照
# 「访问张小东教授所在院系的官网」）：那里的「博导」只出现在**否认句**（「…和博导信息」），
# 与人名**不在同一行**；而这里要求人名就在标签**同一行的紧随位置**。
_ENTITY_LIST_LABEL_PAT = re.compile(
    r"(?:相关)?(?:博导|导师)(?:\s*/\s*团队)?(?:名单)?"
    r"[\s：:，,、。*]*"
    r"(?:(?:可能|大概|大致|也许|或|包括|有|如下|如|为|是|主要|分别)\s*)*"
    r"[\s：:，,、。*]*"
)


def _list_labeled_names(text: str) -> set[str]:
    """提取「博导：A（…）、B（…）」这类**清单标签**后的人名序列。"""
    out: set[str] = set()
    for m in _ENTITY_LIST_LABEL_PAT.finditer(text or ""):
        line = (text[m.end():] or "").split("\n", 1)[0][:100]
        line = re.sub(r"[（(][^）)]*[）)]", "", line)
        for seg in re.split(r"[、，,;；]", line):
            seg = seg.strip().strip("*").strip()
            # ★ 切掉「职称**及其后**」，而不是只剥**尾部**职称：
            #   `俞峰教授等` 结尾是「等」→ 尾部剥不掉 → 贪婪取 3 字 → 提出「俞峰教」。
            #   （2026-10-04 真 trace 统计当场抓到，提取结果里冒出 `俞峰教`。）
            seg = re.sub(r"(?:教授|副教授|导师|老师).*$", "", seg)
            seg = re.sub(r"等.*$", "", seg)   # 「博导：俞峰等」→「俞峰」（与 `_example_names` 同口径）
            # ★ 人名必须是**独立 token**（后面跟分隔符/行尾），不能是长词的词头：
            #   否则「博导：方向为音乐人工智能与音乐科技」会提出 `方向为`
            #   （首字「方」在姓氏表里，而「方向为」不在小黑名单里）。
            #   守卫 M10 就是「去掉这个 lookahead」—— 去掉后上面那条会冒出 `方向为`。
            m2 = re.match(r"^([\u4e00-\u9fa5]{2,3})(?=[\s、，,。：:*（(]|$)", seg)
            if m2 and _looks_like_person(m2.group(1)):
                out.add(m2.group(1))
    return out


# ★★★ 第六处修正（2026-10-04）：**举例引导词**后的人名（「如张三教授」「如张三、李四等」）。
#
# 现场（`tool-trace.log` 2026-10-04 14:34:46，**没被拦住的那一条**）：
#   959 字的编造清单，人名全在**举例括号**里：
#     - **可能涉及的导师**：音乐人工智能系的相关教授（**如李小兵等**）
#     - **可能涉及的导师**：计算机系或未来实验室的教授（**如孙茂松、贾珈等**）
#   「如」是汉字 → 被 `(?<![\u4e00-\u9fa5])` 前边界挡住；
#   括号又被 `_list_labeled_names` 当「方向说明」删掉了 → **提取到 0 个** → 判据放行。
#   （同族还有 `如李晓明教授等` —— 全量统计里 `李晓明` 出现 34 次。）
#
# 为什么不干脆**删掉前边界**：全量 trace 统计证明删了会冒出
#   `高校和`(132)、`方向的`(4) —— 首字「高」「方」**都在姓氏表里**，姓氏表挡不住。
#   所以只**定点放宽「举例引导词」**，不动并列连词（「以及方向的教授」仍被挡）。
_EXAMPLE_LEAD = r"(?:如|例如|比如|譬如)"


def _example_names(text: str) -> set[str]:
    """提取「如张三教授」「如张三、李四等」这类**举例**里的人名。

    独立于 `_list_labeled_names`：后者会**删掉括号**（防「（音乐人工智能方向）」的
    「方向」），而人名恰恰可能在括号里（`（如李小兵等）`）—— 所以这条路径单独扫全文。
    """
    out: set[str] = set()
    for m in re.finditer(rf"{_EXAMPLE_LEAD}\s*([^\n]{{2,80}})", text or ""):
        seg_all = re.split(r"[。；]", m.group(1))[0]
        for seg in re.split(r"[、，,;；]", seg_all):
            seg = seg.strip().strip("*").strip()
            seg = re.sub(r"(?:教授|副教授|导师|老师).*$", "", seg)   # 「李晓明教授等」→「李晓明」
            seg = re.sub(r"等.*$", "", seg)                          # 「李小兵等」→「李小兵」
            m2 = re.match(r"^([\u4e00-\u9fa5]{2,3})", seg)
            if m2 and _looks_like_person(m2.group(1)):
                out.add(m2.group(1))
    return out


def _named_entities(text: str) -> set[str]:
    """提取「像人名」的教授姓名 —— 首字必须是常见姓氏。

    只收人名、**刻意不收机构名**：理由是实测出来的（见上方长注释）——
    机构正则会贪心吃掉前面的动词，而且在「建议你访问 XX 学院」这种建议句里
    点名学校是**正常写法**，拿它当编造证据会造成大面积误报。
    「一次点名 14 位教授」才是编造具体事实的强信号。
    """
    return {
        name for name in _PERSON_PAT.findall(text or "")
        if _looks_like_person(name)
    } | _list_labeled_names(text) | _example_names(text)


# ★★★ 第四处修正（2026-10-04）：**成串罗列的人名组**。
#
# 现场（`tool-trace.log` 2026-10-04 14:04:00，活体复测第 1 次）：
#   CLI 环境里 `WebSearch` 返回 401，模型先写「Web搜索功能当前因认证问题无法正常使用，
#   因此我无法直接通过网络获取…」，**紧接着点名 6 位教授**：
#     「博导：俞峰教授（…）、李小兵教授（…）等」/「如孙茂松教授（…）、胡晓林教授等」
#   这句话同时命中了 `_ENTITY_DENIAL_MARKERS` 里的 `认证问题` / `无法获取`
#   → 第二道闸无条件放行 → 判据连 `entity-missing` 都没记。
#
# 这就是「免检通行证」的**第二个变体**：第一版是「编清单 + 建议你自行核实」，
# 靠**推回给用户**的措辞免疫（已修）；这一版是「我搜不到 + 但我知道是这几位教授」，
# 靠**能力否认**免疫。两者共同点：**同一条回复里既否认、又给出确定性事实清单**。
#
# 判据的本意没错 —— 诚实承认拿不到信息就该放行。错的是**豁免粒度太粗**：
# 该豁免的是「我搜不到」这个**声明**，不是它后面跟着的那份**清单**。
#
# 区分信号（实测校准，不是拍脑袋）：
#   · 该拦：`俞峰教授（…）、李小兵教授（…）` —— **顿号连接的人名组**，报告事实句式；
#   · 不该拦：`访问张小东教授所在院系的官网` —— 人名**分散在建议句**里，
#     中间隔着「官网\n2. 联系」这类非顿号内容（现有用例 [4] 就是这个形态）。
# 所以只认「名+职称 紧跟 顿号/逗号 紧跟 名+职称」，中间最多夹一个括号补充。
_PERSON_ITEM = rf"[\u4e00-\u9fa5]{{2,3}}\*{{0,2}}(?:教授|副教授|导师|老师)"
_NAME_CLUSTER_PAT = re.compile(
    _PERSON_ITEM
    + r"(?:[（(][^）)\n]{0,24}[）)])?"   # 允许夹一句括号补充，如「（指挥/音乐AI方向）」
    + r"\s*[、，,]\s*"
    + _PERSON_ITEM
)


def has_name_cluster(text: str) -> bool:
    """是否出现「成串罗列的人名组」（≥2 个「姓名+职称」由顿号/逗号连接）。

    这是「编了一份事实清单」的**独立强信号**，与上下文无关 ——
    即使姓名真的来自工具结果，多判一层也只是多走一次 strict 重试，代价可控；
    而漏判意味着**一份编造的导师名单被当最终答复交付**。

    ★ 2026-10-04 扩展：除了「名+职称 顿号 名+职称」，**清单标签后 / 举例里的 ≥2 个人名**
    也算 —— `（如孙茂松、贾珈等）` 这种排版**没有职称后缀**，
    只认 `_NAME_CLUSTER_PAT` 会让它从豁免闸溜过去
    （真 trace `14:34:46` 就是这么漏的：提取到 3 个人名，却仍被「我无法联网」豁免）。
    """
    if _NAME_CLUSTER_PAT.search(text or ""):
        return True
    return len(_list_labeled_names(text)) >= 2 or len(_example_names(text)) >= 2


def fabricates_entities(text: str, messages: list[dict[str, Any]],
                        has_results: bool) -> bool:
    """判断输出是不是「凭记忆编了一份事实清单」——第九种话术。

    返回 True 表示：这一轮**点名了几位教授**，而这些姓名在**整段对话上下文里
    一个都找不到**，而此前**已经有过工具结果**（所以模型自以为有证据）。

    ⚠ 只在 `has_results=True` 时启用，这是**刻意划的边界**：
    一次工具都没跑过时，「编造」由 `_FABRICATED_RESULT_MARKERS` 和
    `looks_like_file_task` 负责；这里管的是更隐蔽的一种 ——
    **工具跑过了，但结果和用户的问题无关**，模型不去重试，反而直接凭记忆作答。

    ⚠ 第二道闸：**承认自己没拿到信息的回答一律不判**（`_ENTITY_DENIAL_MARKERS`）。
    这是真客户端实测逼出来的 —— 「我无法联网…建议你访问各高校官网」这类回答里
    也会出现一堆校名，但它**没有声称报告结果**，判它「编造结果」是错的。

    ★★★ 第三处修正（2026-10-03）：**上下文只取「外部来源」，排除 assistant 消息**。
    见下面 `context` 处的注释 —— 这是「模型自己造的污染替它洗白」那个盲区的正面修补。
    """
    if not has_results:
        return False
    body = (text or "").strip()
    if len(body) < _ENTITY_MIN_CHARS:
        return False
    if looks_like_tool_attempt(body):
        return False
    # ★★★ 第四处修正（2026-10-04）：豁免粒度细化 —— 见 `has_name_cluster` 上方注释。
    # 「我搜不到」这个**声明**可以豁免；但它后面跟着的**人名清单**不行。
    # 判据：既否认能力、又成串罗列人名 → 自相矛盾，继续往下判。
    if (any(marker in body for marker in _ENTITY_DENIAL_MARKERS)
            and not has_name_cluster(body)):
        return False
    named = _named_entities(body)
    if len(named) < _ENTITY_MIN_MISSING:
        return False
    # ★★★ 上下文只算「**外部来源**」：system / user / tool，**排除 assistant**。
    #
    # 为什么（2026-10-03 真客户端实测 `_live_cli_search_task.sh` 第 3 轮当场抓到）：
    # 模型第一次编造的清单会被写进对话历史（role=assistant）。它接着被判据拦下、
    # 走 strict 重试，重试又产出一份**姓名重叠**的编造清单 —— 而这时那些姓名
    # 「在上下文里找得到」了 → 判据失效 → **编造内容被当成最终答复交付给用户**。
    #
    # 实测证据（`tool-trace.log`）：
    #   23:14:07  entity-missing  named=9 个  missing=9 个  → strict-trigger fabricate ✓
    #   23:16:30  最终清单同样全是编的（陈强斌/王韬/孙茂松/胡晓林/赵洲/杨小康/庄曜/…）
    #             —— 一条都没报，直接交付。
    #
    # 判据的本意是问「这个姓名是不是**从工具结果或用户输入里来的**」，
    # 那就只能拿外部来源当依据：**模型自己说过的话不算证据**。
    # 否则模型只要先编一遍，第二遍就自动获得豁免 —— 等于给自己发免检通行证。
    context = "\n".join(
        str(item.get("content") or "")
        for item in messages
        if item.get("role") != "assistant"
    )
    missing = sorted(e for e in named if e not in context)
    if len(missing) < _ENTITY_MIN_MISSING:
        return False
    # 把「哪些姓名查无此人」直接写进 trace —— 事后判断是不是误杀不用重算。
    _trace_tool("entity-missing", {
        "named": sorted(named),
        "missing": missing,
        "answer": body[:600],
    })
    return True


# 带单位捕获的版本，用来**分单位**比较（「第3段」和「第3步」不是同一套编号）。
# 单独一个 pattern，不动 `_ENUM_ITEM_PAT` 的分组数 —— findall 的返回结构会跟着变。
_ENUM_UNIT_PAT = re.compile(r"第\s*(\d+)\s*(部分|段|条|步|项|个)")

# 写入里同一单位至少要有这么多条连续编号，才值得判 ——
# 单条编号可能只是行文（例如「第11个文件是我新建的 merged.txt」）。
_ARGS_ENUM_MIN_ITEMS = 2


def _enum_numbers(text: str) -> dict[str, list[int]]:
    """按单位收集条目编号：`{'段': [1, 2, 3], '步': [1]}`。"""
    out: dict[str, list[int]] = {}
    for num, unit in _ENUM_UNIT_PAT.findall(str(text or "")):
        out.setdefault(unit, []).append(int(num))
    return out


def _contiguous_top(numbers: list[int]) -> int:
    """编号恰好是 1..N 各一次时返回 N，否则返回 0（= 不判）。

    为什么要卡这么死：只有「一条一编号的连续清单」才是可核对的成果格式
    （合并任务的「第1段…第18段」就是这样）。
    带重复、或从 5 开始编号，都可能是在写别的东西，宁可不判，避免误杀。
    """
    if not numbers:
        return 0
    unique = set(numbers)
    if len(unique) != len(numbers):
        return 0
    top = max(unique)
    if unique != set(range(1, top + 1)):
        return 0
    return top


def unread_argument_report(
    tool_call: dict[str, Any], messages: list[dict[str, Any]]
) -> dict[str, Any]:
    """摊开「工具参数里有没有还没读到的条目」的**判定依据**，便于写进 trace / 事后审计。

    为什么返回报告而不是只返回布尔：判定依据是「写入编号 vs 读到编号」，
    而读到编号只存在于当时的 `messages` 里。只记原始参数的话，600 字符一截断
    就再也算不出来了 —— 实测踩过这个坑（2026-10-01 09:20:35 那次命中，
    第一版没记依据，回放时读到侧是空的，分不清真阳性还是误杀）。

    返回 `{"written": {单位: 最大编号}, "read": {单位: 最大编号}, "exceeds": {单位: [写入, 读到]}}`。
    `exceeds` 非空 = 判定为编造。
    """
    report: dict[str, Any] = {"written": {}, "read": {}, "exceeds": {}}
    arguments = tool_call.get("arguments")
    if not isinstance(arguments, dict):
        return report
    body = "\n".join(
        str(value) for value in arguments.values()
        if isinstance(value, (str, int, float))
    )
    if len(body) < _DUMP_MIN_CHARS:
        return report
    written = {
        unit: top
        for unit, numbers in _enum_numbers(body).items()
        if (top := _contiguous_top(numbers)) >= _ARGS_ENUM_MIN_ITEMS
    }
    report["written"] = dict(sorted(written.items()))
    if not written:
        return report
    read: dict[str, int] = {}
    for item in messages:
        if item.get("role") != "tool":
            continue
        for unit, numbers in _enum_numbers(str(item.get("content") or "")).items():
            if numbers:
                read[unit] = max(read.get(unit, 0), max(numbers))
    report["read"] = dict(sorted(read.items()))
    report["exceeds"] = {
        unit: [top, read.get(unit, 0)]
        for unit, top in written.items()
        if read.get(unit, 0) > 0 and top > read[unit]
    }
    return report


def fabricates_unread_in_arguments(
    tool_call: dict[str, Any], messages: list[dict[str, Any]]
) -> bool:
    """判断工具调用的**参数**里有没有「还没读到的条目」——第六种话术的事后检测。

    为什么需要单独一条：`dumps_unread_items` 只看模型输出的**文本**，
    而第六种模式的编造写在 `write_file` 的 `content` 参数里，**根本不出现在文本里**，
    所以那五条判据一条都拦不到。

    实测（2026-10-01 08:19，12 步任务复测第 1 次）：工具清单只有
    read_file / write_file / list_dir，模型调了不存在的 `PowerShell` 去读 p10
    → 客户端返回「未知工具」→ 模型**不重试**，直接在 `write_file` 的参数里
    把第 10 段编了出来（素材是「天平山的枫叶，红得像一团火」，
    它写成「苏州的秋天，就这样慢慢深了」）。文件看着完整、内容是假的。

    判据沿用同一个「序号可核对」思路，但**分单位**比较，且两侧都要求是
    「1..N 各一次」的连续清单：

      - 写入的某单位是 `1..M`（连续、无重复），读到的同单位最大编号是 `K`；
      - `K > 0` 且 `M > K` 且 `M >= _ARGS_ENUM_MIN_ITEMS` → 判为编造。

    分单位是必要的 —— 把「第3段」和「第3步」混在一起比会误杀；
    要求连续清单也是必要的 —— 避免「第11个文件是我新建的」这类单条行文误触发。
    """
    return bool(unread_argument_report(tool_call, messages)["exceeds"])


def sounds_unfinished(text: str) -> bool:
    """判断一段回答是不是「还没干完」的进度汇报 / 计划复述 / 能力否认。

    这类文字一旦被当成最终答复返回，WorkBuddy 就会结束回合、把控制权交回用户，
    长任务因此只能干一两步就断。所以必须识别出来，逼模型改输出工具调用。
    """
    if not text:
        return False
    body = text.strip()

    # ★ 强进度标记是**结构**信号（就是几个明确的词），不该受「整段够不够 4 字」
    # 这个**统计**门槛限制 —— 「还没」「剩余」「剩下」本身就只有 2 字，
    # 放在门槛之后，等于「模型只输出『还没』两个字就被当最终答复」这条路是通的。
    # 与 `_ENUM_LEAD_MIN_CHARS` 同一条思路：**结构信号门槛要低，统计信号门槛可以高**。
    # 回放核对（168 条）：新命中 0 条（预防性修复，如实说明）。
    for marker in _STRONG_PROGRESS_MARKERS:
        if marker in body:
            return True
    if len(body) < 4:
        return False

    # ★ 收尾语（`_DONE_MARKERS`）**不再无条件豁免**（2026-10-01 修）。
    # 这与 `dumps_unread_items` 上那条是**同一个病**：它是一条**免检通道**，
    # 而伪造它成本为零 —— 模型只要在结尾补一句「已完成」，整段就被放行。
    #
    # 实测（2026-09-30 23:18:11，真实会话）：
    #   「搜索验证环节**已经完成**，只等**下一步决定是否启动新批次**。」
    # 「已经完成」指的是**子步骤**，整件事（启动新批次）还没干，
    # 却被这句「已经完成」豁免掉、当成最终答复返回 —— 回合当场结束。
    # 回放核对（168 条可复算记录）：去掉豁免后新命中 **1 条，1/1 真阳性**，零误杀。
    if _CAPABILITY_DENIAL_PAT.search(body):
        return True

    hit = _UNFINISHED_PAT.search(body)
    if not hit:
        return False
    # 「接下来你可以查看报告」这类**动作指向用户**的话通常是真收尾 ——
    # 但**只在同时有收尾语时才放行**。没说「已完成」却把动作推给用户
    # （「接下来请你自己读 p13」）那是**推活**，不是收尾，必须拦。
    if any(word in hit.group(0) for word in _USER_DIRECTED):
        return not any(marker in body for marker in _DONE_MARKERS)
    return True


def reuse_decision_text(text: str, has_results: bool = False) -> str:
    """判断工具决策那一轮的回答能否直接当最终答案复用。"""
    if not text:
        return ""
    cleaned = text.strip()
    if len(cleaned) < 2:
        return ""
    # 只剩标点 / 装饰符的碎片不能当答复 —— 那是页面「打字动画」的渲染中间态。
    # 实测：`tool-trace.log` 里出现过 `**。`（长度 3，实义字符 0 个），
    # 它通过了长度检查、也不含任何工具标记，于是被原样当成答复输出给用户。
    if len(re.sub(r"[\s\W_]+", "", cleaned, flags=re.UNICODE)) < 2:
        return ""
    # 明显是工具调用格式残留或自我描述，不能当答案
    for marker in ("TOOL:", "COMMAND_BEGIN", "tool_call", "工具调用", "可用工具摘要"):
        if marker in cleaned:
            return ""
    # 还在说「下一步/当前进度」→ 任务没干完，不能当最终答复，否则回合当场结束
    if sounds_unfinished(cleaned):
        return ""
    # 一个工具都还没执行过，却在汇报执行结论 —— 这是编造，必须改走普通通道重问
    if not has_results:
        for marker in _FABRICATED_RESULT_MARKERS:
            if marker in cleaned:
                return ""
    return cleaned


_TOOL_FORMAT_PAT = re.compile(
    r"TOOL\s*:\s*[A-Za-z0-9_-]+[\s\S]*?COMMAND_END", re.IGNORECASE
)


def sanitize_answer(text: str) -> str:
    """剥掉误入正文的工具调用格式；剥完没内容就返回空串。"""
    if not text:
        return ""
    cleaned = _TOOL_FORMAT_PAT.sub("", text)
    cleaned = re.sub(r"COMMAND_BEGIN|COMMAND_END", "", cleaned)
    cleaned = re.sub(r"^\s*```[a-zA-Z]*\s*$", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s*\{?\s*\"?tool_calls?\"?\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip()
    # 整段就是一个工具调用 JSON（可能被网页吃掉反斜杠）→ 这不是给用户的答案
    bare = cleaned.strip("`").strip()
    if bare.startswith("{") and re.search(
        r'"(tool_calls?|function|name|arguments)"\s*:', bare
    ):
        if isinstance(extract_json_candidate(bare), dict):
            return ""
    return cleaned


# ── 核心对话入口 ──────────────────────────────────────────────────────
def chat(messages: list[dict[str, Any]], model: str = "", **options: Any) -> Any:
    selected = resolve_model(model)
    with _stats_lock:
        _stats["requests"] += 1

    converted: list[dict[str, Any]] = []
    system_parts: list[str] = []
    for item in messages:
        role = item.get("role")
        text = message_to_text(item)
        if not text:
            continue
        if role == "system":
            system_parts.append(text)
        elif role in {"user", "assistant", "tool"}:
            converted.append({"role": role, "content": text})
    if system_parts:
        converted.insert(0, {"role": "system", "content": "\n\n".join(system_parts)})

    tools = options.get("tools")
    tool_choice = options.get("tool_choice")

    guard = False
    raw = ""  # 决策轮原始回答；仅当 guard=True 时用于判断是否跳过兜底对话
    # 新会话的第一个页面发送之前先清页面，避免被上一段任务的上下文污染。
    # 整个请求只清一次（可能包含工具决策 + strict 重试 + 最终回答多次发送）。
    reset_once = ResetOnce(starts_new_conversation(converted))
    if tools_enabled(tools, tool_choice):
        _raw_holder: list[str] = []
        tool_call, direct, guard = tool_phase(
            converted, tools, tool_choice, selected,
            reset_once=reset_once, raw_out=_raw_holder
        )
        raw = _raw_holder[0] if _raw_holder else ""
        if tool_call:
            return completion(
                selected,
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [openai_tool_call(tool_call)],
                },
                "tool_calls",
            )
        if direct:
            return completion(selected, {"role": "assistant", "content": direct}, "stop")

    if guard and sounds_unfinished(raw):
        # 决策轮就已经在说「做不到 / 下一步」，strict 重试（json+text）也拉不回 ——
        # 再跑兜底对话只会让出戏的模型编造「已完成」或重复拒绝
        # （实测 2026-10-01 14:07：兜底对话吐出「已恢复首页描边」的伪造交付）。
        # 直接报错让用户重试，省掉一轮无意义的兜底，也避免伪造结果被当最终答复。
        _trace_tool("fallback-skipped", {
            "answer": (raw or "")[:2000],
            "path": "chat",
            "reason": "decision-already-unfinished",
        })
        raise UpstreamError(
            502, "模型没有给出有效动作（只说做不到或下一步），请重试。"
        )

    message = answer_message_once(converted, selected, reset_once=reset_once)
    text = message.get("text", "") or ""
    if guard:
        text = sanitize_answer(text)
        _trace_tool("fallback", {"answer": text[:2000], "path": "chat"})
        if not text:
            raise UpstreamError(502, "模型只给出了工具调用格式，没有形成有效回答，请重试。")
        if sounds_unfinished(text):
            # 兜底这一问模型还在说「我做不到 / 下一步」。
            # 这种文案一旦输出，WorkBuddy 会立刻结束回合、任务半途而废，
            # 而用户还以为干完了 —— 宁可报错让它重试。
            _trace_tool("fallback-rejected", {"answer": text[:2000], "path": "chat"})
            raise UpstreamError(
                502, "模型没有给出有效动作（只说做不到或下一步），请重试。"
            )
        # ★★★ 2026-10-05 修（坑 32 路径 B）：**兜底那一轮的答复也必须过 fabricate 判据**。
        #   否则「判据命中 → 三发重试失败 → 兜底又编一份」这条链的**最后一环没有任何守卫**
        #   （原先只查 `sanitize_answer` 与 `sounds_unfinished`，两者都拦不住点名清单）。
        #   取舍：宁可**可见失败**（502，用户重试），也不交付一份编造的导师清单。
        if fabricates_entities(text, converted, has_tool_result(converted)):
            _trace_tool("fallback-rejected", {
                "answer": text[:2000], "path": "chat", "reason": "fabricate",
            })
            raise UpstreamError(
                502, "模型没有给出有效动作（编造了工具结果里没有的实体），请重试。"
            )
    return completion(selected, {"role": "assistant", "content": text},
                      "stop", message.get("name", ""))


def chat_stream(
    messages: list[dict[str, Any]],
    model: str = "",
    tools: list[dict[str, Any]] | None = None,
    tool_choice: Any = None,
) -> Iterator[tuple[str, Any]]:
    """流式对话。

    yield 三类事件：
      ("delta", 文本)              —— 正文增量
      ("tool_calls", [tool_call])  —— 模型决定调用工具（OpenAI 格式）
      ("done", 完整文本)            —— 收尾
    """
    selected = resolve_model(model)
    with _stats_lock:
        _stats["requests"] += 1
        _stats["streamed"] += 1

    converted: list[dict[str, Any]] = []
    for item in messages:
        if item.get("role") not in {"user", "assistant", "tool", "system"}:
            continue
        text = message_to_text(item)
        if text:
            converted.append({"role": item["role"], "content": text})

    guard = False
    # 同 chat()：新会话的第一个页面发送之前先清页面，整个请求只清一次。
    reset_once = ResetOnce(starts_new_conversation(converted))
    _raw_holder: list[str] = []
    if tools_enabled(tools, tool_choice):
        tool_call, direct, guard = tool_phase(
            converted, tools, tool_choice, selected,
            reset_once=reset_once, raw_out=_raw_holder
        )
        raw = _raw_holder[0] if _raw_holder else ""
        if tool_call:
            yield ("tool_calls", [openai_tool_call(tool_call)])
            yield ("done", "")
            return
        if direct:
            yield ("delta", direct)
            yield ("done", direct)
            return

    if BROWSER_CHAT:
        prompt = build_browser_prompt(converted)
        if not prompt.strip():
            raise UpstreamError(400, "消息为空，无法发送到苏大网页")
    else:
        prompt = ""  # 直连模式不需要预拼 prompt

    if guard:
        if sounds_unfinished(raw):
            # 同 chat()：决策轮已判未完/否认，strict 重试拉不回，跳过兜底对话直接报错，
            # 避免让出戏模型再编一轮「已完成」（实测 2026-10-01 14:07 正是兜底对话伪造交付）。
            _trace_tool("fallback-skipped", {
                "answer": (raw or "")[:2000],
                "path": "chat_stream",
                "reason": "decision-already-unfinished",
            })
            raise UpstreamError(
                502, "模型没有给出有效动作（只说做不到或下一步），请重试。"
            )
        # 决策轮没解析出工具调用，prompt 已被工具指令污染。
        # 这里先整段拿回来清理干净再输出，避免把工具格式当成答案交给用户。
        cleaned = sanitize_answer(
            answer_message_once(converted, selected, reset_once=reset_once).get("text", "")
        )
        _trace_tool("fallback", {"answer": cleaned[:2000], "path": "chat_stream"})
        if not cleaned:
            raise UpstreamError(502, "模型只给出了工具调用格式，没有形成有效回答，请重试。")
        if sounds_unfinished(cleaned):
            # 同 chat()：兜底这一问还在说「我做不到 / 下一步」时不能输出，
            # 否则回合当场结束、任务半途而废，用户却以为完成了。
            _trace_tool("fallback-rejected", {"answer": cleaned[:2000], "path": "chat_stream"})
            raise UpstreamError(
                502, "模型没有给出有效动作（只说做不到或下一步），请重试。"
            )
        # ★★★ 2026-10-05 修（坑 32 路径 B）：兜底那一轮的答复也必须过 fabricate 判据
        #   —— 同 `chat()`，见那里的注释。
        if fabricates_entities(cleaned, converted, has_tool_result(converted)):
            _trace_tool("fallback-rejected", {
                "answer": cleaned[:2000], "path": "chat_stream", "reason": "fabricate",
            })
            raise UpstreamError(
                502, "模型没有给出有效动作（编造了工具结果里没有的实体），请重试。"
            )
        yield ("delta", cleaned)
        yield ("done", cleaned)
        return

    answer = ""
    if BROWSER_CHAT:
        _note_transport("page")
        for delta in broker_chat_stream(prompt, selected, reset_once=reset_once):
            answer += delta
            yield ("delta", delta)
    else:
        noted = False
        try:
            # 尾部压住不发，收尾时剥掉上游免责尾注（见 `_stream_tail_guard`）
            for delta in _stream_tail_guard(_ws_stream_sync(converted, selected)):
                if not noted:
                    # 收到第一个增量才算「直连真的服务了这次请求」，
                    # 否则连接阶段就失败的情况会被误记成走成了直连。
                    _note_transport("ws")
                    noted = True
                answer += delta
                yield ("delta", delta)
            if not noted:
                _note_transport("ws")  # 直连成功但内容为空，仍算走了直连
        except UpstreamError as exc:
            # 只在「一个字都还没吐出去」时兜底：已经吐了增量再换通道，
            # 会让客户端看到两段拼接的正文，比直接报错更糟（可见失败优于错误结果）。
            if answer or not _page_driver_available():
                raise
            log(f"直连失败（{exc}），退回页面驱动模式。")
            _note_transport("page_fallback")
            prompt = build_browser_prompt(converted)
            for delta in broker_chat_stream(prompt, selected, reset_once=reset_once):
                answer += delta
                yield ("delta", delta)
    yield ("done", answer)


def completion(model: str, assistant: dict[str, Any], finish_reason: str, name: str = "") -> dict[str, Any]:
    return {
        "id": f"chatcmpl-{name or uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "message": assistant, "finish_reason": finish_reason}],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def models() -> dict[str, Any]:
    return {
        "object": "list",
        "data": [
            {
                "id": DEFAULT_MODEL,
                "object": "model",
                "owned_by": "suda",
                "name": "苏州大学 DeepSeek",
            },
            {
                "id": "suda-deepseek",
                "object": "model",
                "owned_by": "suda",
                "name": "苏州大学 DeepSeek（别名）",
            },
        ],
    }


# ── HTTP 服务 ─────────────────────────────────────────────────────────
class APIHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "SudaAPI/2.0"

    def _json(self, status: int, body: Any) -> None:
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _start_chunked(self, content_type: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

    def _chunk(self, data: bytes) -> None:
        if not data:
            return
        self.wfile.write(b"%x\r\n" % len(data) + data + b"\r\n")
        self.wfile.flush()

    def _end_chunked(self) -> None:
        try:
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass  # 客户端已断开，无需收尾

    def do_GET(self) -> None:
        if self.path in {"/health", "/"}:
            # ★ 超时只给 1 秒（不是默认的 2 秒）：守护的探测总超时是 5 秒，
            #   这里必须留足余量，否则「broker 一忙 → /health 超过探测超时 →
            #   被判接口无响应 → 健康服务被守护杀掉」（2026-10-03 现场）。
            #   读不到就用最近一次的快照兜底，并如实标注 `broker_busy`。
            broker = read_broker_state(timeout=1.0)
            busy = not broker
            if busy:
                broker = broker_last_state()
            with _stats_lock:
                snapshot = dict(_stats)
            self._json(200, {
                "status": "ok",
                "service": "suda-deepseek",
                "version": "2.0",
                "model": DEFAULT_MODEL,
                "browser_chat": BROWSER_CHAT,
                "tool_mode": TOOL_MODE,
                "web_prompt_limit": WEB_PROMPT_LIMIT,
                "broker": AUTH_BROKER,
                # `broker_online` 仍然是「这一秒真的读到 broker 了吗」；
                # 下面的 `broker_busy` / `broker_recently_ok` 用来区分「忙」和「死」。
                "broker_online": not busy,
                "broker_busy": busy,
                # ★ 叠加「启动宽限期」：服务刚起来的前 180 秒，即使还没读到 broker
                # 也按「忙」上报 —— 免得守护在上游恢复期把正在重新加载页面/重新登录的
                # 服务反复杀掉（见 `in_startup_grace` 处的长注释）。
                "broker_recently_ok": broker_recently_ok() or in_startup_grace(),
                # 单独暴露，排障时一眼看出「现在是不是在宽限期内」。
                "startup_grace": in_startup_grace(),
                "logged_in": bool(broker.get("access_token")) or bool(broker.get("page_ready")),
                "page_ready": bool(broker.get("page_ready")),
                "uptime_seconds": int(time.time() - snapshot["started_at"]),
                "requests": snapshot["requests"],
                "streamed": snapshot["streamed"],
                "errors": snapshot["errors"],
                # ★ 实际走的通道（区别于上面的 browser_chat「配置」）。
                # `page_fallback` = 历史累计降级次数（>0 说明直连出过问题，该去查日志）；
                # `last` = 最近一次实际通道；`last_fallback_at` = 最近一次降级的时间戳。
                "transport": {
                    "ws": snapshot.get("ws", 0),
                    "page": snapshot.get("page", 0),
                    "page_fallback": snapshot.get("page_fallback", 0),
                    "last": snapshot.get("last_transport", ""),
                    "last_fallback_at": snapshot.get("last_fallback_at", 0.0),
                },
                # **当前状态**：最近一次请求就走了降级 → 直连此刻是不通的。
                # 注意不要用累计计数 `page_fallback > 0` 来表达「正在降级」：
                # 降级过一次它就永远为真，直连恢复后依然报警，会把排查带偏。
                "ws_degraded": snapshot.get("last_transport") == "page_fallback",
                # >0 说明有请求被服务、请求日志却只写了降级记录（或没写进去）。
                # 正常应恒为 0；不是 0 就说明观测链路有问题，别再拿 requests.log 当全量。
                "request_log_degraded": _request_log_degraded,
                # 客户端主动断开连接（keep-alive 空闲连接被关 / abort 在途请求）。
                # 实测正常来源：WorkBuddy 做 context compaction 时会 abort 在途请求。
                # 非 0 不等于故障，但**短时间内暴涨**值得看一眼。
                "client_aborts": snapshot.get("client_aborts", 0),
                # 完整请求体存档（默认关）。开着时 `count` 会随请求上涨，
                # `degraded` 恒为 0 才说明存档链路是好的。
                # `via` 说明是怎么打开的：env（环境变量，长期）/ flag（标记文件，临时）。
                "request_full_log": {
                    "enabled": bool(_request_full_on()),
                    "via": _request_full_on(),
                    "path": REQUEST_FULL_PATH,
                    "flag": REQUEST_FULL_FLAG,
                    "count": _request_full_seq,
                    "degraded": _request_full_degraded,
                },
            })
            return
        if self.path == "/v1/models":
            self._json(200, models())
            return
        if self.path.startswith("/tool-trace"):
            path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tool-trace.log")
            records: list[Any] = []
            try:
                with open(path, encoding="utf-8", errors="replace") as handle:
                    for line in handle:
                        line = line.strip()
                        if line:
                            try:
                                records.append(json.loads(line))
                            except json.JSONDecodeError:
                                continue
            except OSError:
                pass
            self._json(200, {"ok": True, "count": len(records), "trace": records[-20:]})
            return
        self._json(404, {"error": {"message": "Not found"}})

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
            body = json.loads(self.rfile.read(length) or b"{}") if length else {}
        except (ValueError, json.JSONDecodeError) as exc:
            self._json(400, {"error": {"message": f"请求体不是合法 JSON：{exc}"}})
            return

        if self.path == "/v1/messages/count_tokens":
            self._json(200, {"input_tokens": max(1, len(json.dumps(body, ensure_ascii=False)) // 4)})
            return
        if self.path not in {"/v1/chat/completions", "/v1/messages"}:
            self._json(404, {"error": {"message": "Not found"}})
            return

        log_request(self.path, body, self.headers.get("User-Agent", ""))
        log_request_full(self.path, body, self.headers.get("User-Agent", ""))
        capture_tools(
            body.get("tools"),
            body.get("messages") if isinstance(body.get("messages"), list) else [],
            str(body.get("model") or ""),
        )

        try:
            if self.path == "/v1/messages":
                self.handle_anthropic(body)
            elif body.get("stream"):
                self.handle_openai_stream(body)
            else:
                options = {k: v for k, v in body.items() if k not in {"messages", "model", "stream"}}
                self._json(200, chat(body.get("messages", []), body.get("model", ""), **options))
        except UpstreamError as exc:
            with _stats_lock:
                _stats["errors"] += 1
            log(f"上游错误 {exc.status}: {exc}")
            self._json(exc.status, {"error": {"message": str(exc), "type": "upstream_error"}})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:  # noqa: BLE001 - 任何异常都要变成 OpenAI 风格错误响应
            with _stats_lock:
                _stats["errors"] += 1
            log(f"处理请求失败：{exc}")
            self._json(500, {"error": {"message": str(exc), "type": "internal_error"}})

    # -- OpenAI --
    def handle_openai_stream(self, body: dict[str, Any]) -> None:
        model = resolve_model(body.get("model", ""))
        self._start_chunked("text/event-stream; charset=utf-8")
        created = int(time.time())
        chat_id = "chatcmpl-" + uuid.uuid4().hex

        def frame(delta: dict[str, Any], finish: str | None) -> bytes:
            return (
                "data: " + json.dumps({
                    "id": chat_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model,
                    "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
                }, ensure_ascii=False) + "\n\n"
            ).encode("utf-8")

        try:
            self._chunk(frame({"role": "assistant"}, None))
            answer_chars = 0
            tool_calls: list[dict[str, Any]] = []
            for kind, value in chat_stream(
                body.get("messages", []),
                model,
                tools=body.get("tools"),
                tool_choice=body.get("tool_choice"),
            ):
                if kind == "delta" and value:
                    answer_chars += len(value)
                    self._chunk(frame({"content": value}, None))
                elif kind == "tool_calls":
                    tool_calls = value or []
            if tool_calls:
                # OpenAI 流式工具调用：先发 id/name，再发 arguments 片段
                for index, call in enumerate(tool_calls):
                    fn = call.get("function") or {}
                    self._chunk(frame({"tool_calls": [{
                        "index": index,
                        "id": call.get("id"),
                        "type": "function",
                        "function": {"name": fn.get("name") or "", "arguments": ""},
                    }]}, None))
                    if fn.get("arguments"):
                        self._chunk(frame({"tool_calls": [{
                            "index": index,
                            "function": {"arguments": fn["arguments"]},
                        }]}, None))
                self._chunk(frame({}, "tool_calls"))
            else:
                self._chunk(frame({}, "stop"))
            # 有些客户端（含 OpenAI 新版 SDK）在 stream_options.include_usage 时会
            # 期待末尾出现一条 usage 帧，缺了会判定为协议错误。这里按估算补上。
            if isinstance(body.get("stream_options"), dict) and body["stream_options"].get(
                "include_usage"
            ):
                prompt_chars = len(
                    json.dumps(body.get("messages", []), ensure_ascii=False)
                )
                usage = {
                    "prompt_tokens": max(1, prompt_chars // 3),
                    "completion_tokens": max(1, answer_chars // 2),
                    "total_tokens": max(1, prompt_chars // 3) + max(1, answer_chars // 2),
                }
                self._chunk(
                    ("data: " + json.dumps({
                        "id": chat_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": model,
                        "choices": [],
                        "usage": usage,
                    }, ensure_ascii=False) + "\n\n").encode("utf-8")
                )
            self._chunk(b"data: [DONE]\n\n")
        except UpstreamError as exc:
            with _stats_lock:
                _stats["errors"] += 1
            try:
                self._chunk(
                    ("data: " + json.dumps(
                        {"error": {"message": str(exc), "type": "upstream_error"}}, ensure_ascii=False
                    ) + "\n\n").encode("utf-8")
                )
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass  # 客户端中断了流式请求
        finally:
            self._end_chunked()

    # -- Anthropic --
    def handle_anthropic(self, body: dict[str, Any]) -> None:
        messages: list[dict[str, Any]] = []
        if body.get("system"):
            messages.append({"role": "system", "content": body["system"]})
        for source in body.get("messages", []):
            role = source.get("role")
            content = source.get("content")
            if isinstance(content, str):
                messages.append({"role": role, "content": content})
                continue
            texts: list[str] = []
            for block in content or []:
                kind = block.get("type")
                if kind == "text":
                    texts.append(block.get("text") or "")
                elif kind == "tool_use":
                    if texts:
                        messages.append({"role": role, "content": "\n".join(texts)})
                        texts = []
                    messages.append({
                        "role": "assistant", "content": None,
                        "tool_calls": [{
                            "id": block.get("id"), "type": "function",
                            "function": {
                                "name": block.get("name"),
                                "arguments": json.dumps(block.get("input") or {}, ensure_ascii=False),
                            },
                        }],
                    })
                elif kind == "tool_result":
                    if texts:
                        messages.append({"role": role, "content": "\n".join(texts)})
                        texts = []
                    messages.append({
                        "role": "tool", "tool_call_id": block.get("tool_use_id"),
                        "content": content_to_text(block.get("content")),
                    })
            if texts:
                messages.append({"role": role, "content": "\n".join(texts)})

        tools = [{
            "type": "function",
            "function": {
                "name": item.get("name"),
                "description": item.get("description", ""),
                "parameters": item.get("input_schema") or {"type": "object", "properties": {}},
            },
        } for item in body.get("tools", [])]

        if body.get("stream"):
            model = resolve_model(body.get("model", ""))
            self._start_chunked("text/event-stream; charset=utf-8")
            message_id = "msg_" + uuid.uuid4().hex[:24]

            def event(name: str, payload: dict[str, Any]) -> bytes:
                return f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")

            try:
                self._chunk(event("message_start", {
                    "type": "message_start",
                    "message": {
                        "id": message_id, "type": "message", "role": "assistant",
                        "model": model, "content": [], "stop_reason": None,
                        "stop_sequence": None, "usage": {"input_tokens": 0, "output_tokens": 0},
                    },
                }))
                self._chunk(event("content_block_start", {
                    "type": "content_block_start", "index": 0,
                    "content_block": {"type": "text", "text": ""},
                }))
                answer = ""
                pending_calls: list[dict[str, Any]] = []
                for kind, value in chat_stream(messages, model, tools=tools or None,
                                               tool_choice=body.get("tool_choice")):
                    if kind == "delta" and value:
                        answer += value
                        self._chunk(event("content_block_delta", {
                            "type": "content_block_delta", "index": 0,
                            "delta": {"type": "text_delta", "text": value},
                        }))
                    elif kind == "tool_calls":
                        pending_calls = value or []
                self._chunk(event("content_block_stop", {"type": "content_block_stop", "index": 0}))
                for offset, call in enumerate(pending_calls):
                    fn = call.get("function") or {}
                    index = offset + 1
                    self._chunk(event("content_block_start", {
                        "type": "content_block_start", "index": index,
                        "content_block": {
                            "type": "tool_use", "id": call.get("id"),
                            "name": fn.get("name"), "input": {},
                        },
                    }))
                    self._chunk(event("content_block_delta", {
                        "type": "content_block_delta", "index": index,
                        "delta": {"type": "input_json_delta",
                                  "partial_json": fn.get("arguments") or "{}"},
                    }))
                    self._chunk(event("content_block_stop", {
                        "type": "content_block_stop", "index": index,
                    }))
                self._chunk(event("message_delta", {
                    "type": "message_delta",
                    "delta": {
                        "stop_reason": "tool_use" if pending_calls else "end_turn",
                        "stop_sequence": None,
                    },
                    "usage": {"output_tokens": 0},
                }))
                self._chunk(event("message_stop", {"type": "message_stop"}))
            finally:
                self._end_chunked()
            return

        options = {"tools": tools} if tools else {}
        result = chat(messages, body.get("model", ""), **options)
        message = result["choices"][0]["message"]
        blocks: list[dict[str, Any]] = []
        if message.get("content"):
            blocks.append({"type": "text", "text": message["content"]})
        for call in message.get("tool_calls") or []:
            fn = call.get("function") or {}
            try:
                tool_input = json.loads(fn.get("arguments") or "{}")
            except (TypeError, ValueError, json.JSONDecodeError):
                tool_input = {"value": fn.get("arguments") or ""}
            blocks.append({
                "type": "tool_use", "id": call.get("id"), "name": fn.get("name"), "input": tool_input,
            })
        self._json(200, {
            "id": "msg_" + uuid.uuid4().hex[:24], "type": "message", "role": "assistant",
            "model": result.get("model") or DEFAULT_MODEL, "content": blocks,
            "stop_reason": "tool_use" if message.get("tool_calls") else "end_turn",
            "stop_sequence": None, "usage": {"input_tokens": 0, "output_tokens": 0},
        })

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write(f"[{_ts()}] [suda-api] " + (fmt % args) + "\n")


class APIServer(ThreadingHTTPServer):
    """线程 HTTP 服务器 + 客户端断开不再打整段 traceback。

    实测（2026-10-01，`launcher.log` 里共 9 处）：WorkBuddy 做 **context compaction**
    时会 abort 在途请求，服务端在 keep-alive 连接上等下一个请求行时抛
    `ConnectionResetError: [WinError 10054] 远程主机强迫关闭了一个现有的连接`。
    这是**正常现象**（不是服务端故障 —— 该连接上的请求已经处理完了），
    但 `socketserver` 默认打 16 行 traceback：既淹没真故障，也让日志没法读。

    现在降成**一行可数、可观测**的记录，并计入 `/health` 的 `client_aborts`。
    """

    # ★★★ 加固（2026-10-03）：把 listen backlog 从默认的 **5** 提到 128 ★★★
    # `socketserver.TCPServer.request_queue_size` 默认只有 5。WorkBuddy 是**并发**发
    # 流式请求的（实测一次会话就有好几条在途），加上守护每 15 秒一次的健康探测，
    # 突发时新连接可能先在 accept 队列里排队 —— 一旦排队时间超过探测方自己的超时
    # （原来只有 2 秒），就会表现为「接口无响应」，而服务端稍后才把 200 写完
    # （launcher.log 里 11:55:40 / 11:55:57 / 11:56:14 就是这个形态：
    #  守护报失败与 API 记 200 **完全同秒**）。
    # ⚠ 诚实标注：这一条是**加固**，不是**已证实的根因** —— 我两次尝试复现
    #   「/health 读满超时」都没成功（见 README「坑 17」）。加大 backlog 只会更稳，
    #   不会更差，所以先做上。
    request_queue_size = 128

    def handle_error(self, request: Any, client_address: Any) -> None:
        exc = sys.exc_info()[1]
        # ★ 必须包含 ConnectionAbortedError：Windows 上客户端中途断开报的是
        #   [WinError 10053] 你的主机中的软件中止了一个已建立的连接，
        #   对应 ConnectionAbortedError —— 它**不是** ConnectionResetError 的子类，
        #   漏掉它就会：①照样刷整段 traceback ②client_aborts 计数偏小。
        #   实测就是这么漏的（只捕了 BrokenPipeError/ConnectionResetError）。
        if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
            with _stats_lock:
                _stats["client_aborts"] = _stats.get("client_aborts", 0) + 1
            peer = client_address[0] if isinstance(client_address, tuple) else "?"
            log(f"客户端断开连接（{type(exc).__name__}），已忽略：{peer}")
            return
        super().handle_error(request, client_address)


# ── MCP ───────────────────────────────────────────────────────────────
MCP_TOOLS = [
    {
        "name": "suda_deepseek_chat",
        "description": "调用苏州大学校内 DeepSeek。适合中文问答、总结、润色、推理和代码辅助。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "要发送的问题"},
                "system": {"type": "string", "description": "可选的系统提示词"},
                "model": {"type": "string", "description": "可选模型 ID"},
            },
            "required": ["prompt"],
            "additionalProperties": False,
        },
    },
    {
        "name": "suda_deepseek_models",
        "description": "列出苏大 DeepSeek 当前可用模型。",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "suda_deepseek_status",
        "description": "查看苏大 DeepSeek 接口与登录状态。",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
]


def mcp_reply(message_id: Any, result: Any = None, error: Any = None) -> None:
    body: dict[str, Any] = {"jsonrpc": "2.0", "id": message_id}
    body["error" if error is not None else "result"] = error if error is not None else result
    sys.stdout.write(json.dumps(body, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def run_mcp() -> None:
    for line in sys.stdin:
        message_id = None
        try:
            msg = json.loads(line)
            method = msg.get("method")
            message_id = msg.get("id")
            if method == "initialize":
                mcp_reply(message_id, {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "suda-deepseek", "version": "2.0.0"},
                })
            elif method == "notifications/initialized":
                continue
            elif method == "ping":
                # ★ MCP 协议要求所有服务端实现 ping。不实现的话，WorkBuddy 的健康检查
                #   会拿到 -32601 Method not found → 判「不健康」→ 每 15 秒重连一次，
                #   日志里刷满 tryReconnect / ping failed (1/2)(2/2)。返回空对象即可。
                mcp_reply(message_id, {})
            elif method == "tools/list":
                mcp_reply(message_id, {"tools": MCP_TOOLS})
            elif method == "tools/call":
                params = msg.get("params", {})
                args = params.get("arguments", {})
                name = params.get("name")
                if name == "suda_deepseek_models":
                    text = json.dumps(models(), ensure_ascii=False)
                elif name == "suda_deepseek_status":
                    broker = read_broker_state()
                    text = json.dumps({
                        "model": DEFAULT_MODEL,
                        "browser_chat": BROWSER_CHAT,
                        "tool_mode": TOOL_MODE,
                        "broker_online": bool(broker),
                        "page_ready": bool(broker.get("page_ready")),
                        "logged_in": bool(broker.get("access_token")) or bool(broker.get("page_ready")),
                        "last_error": broker.get("last_error", ""),
                    }, ensure_ascii=False)
                elif name == "suda_deepseek_chat":
                    messages = []
                    if args.get("system"):
                        messages.append({"role": "system", "content": args["system"]})
                    messages.append({"role": "user", "content": args["prompt"]})
                    value = chat(messages, args.get("model", ""))
                    text = value["choices"][0]["message"].get("content") or ""
                else:
                    raise UpstreamError(404, f"未知工具：{name}")
                mcp_reply(message_id, {"content": [{"type": "text", "text": text}]})
            elif message_id is not None:
                mcp_reply(message_id, error={"code": -32601, "message": "Method not found"})
        except Exception as exc:  # noqa: BLE001
            mcp_reply(message_id, error={"code": -32000, "message": str(exc)})


def main() -> None:
    parser = argparse.ArgumentParser(description="苏州大学 DeepSeek OpenAI 兼容接口")
    parser.add_argument("--mcp", action="store_true", help="以 MCP stdio 服务运行")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    if args.mcp:
        run_mcp()
        return

    print(f"OpenAI 兼容接口：http://{args.host}:{args.port}/v1", flush=True)
    print(f"健康检查：http://{args.host}:{args.port}/health", flush=True)
    APIServer((args.host, args.port), APIHandler).serve_forever()


if __name__ == "__main__":
    main()
