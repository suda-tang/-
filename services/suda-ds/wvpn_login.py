#!/usr/bin/env python
"""苏大 WebVPN 自动登录 + 取 ds 代理 hash（可复用模块）。

被 `refresh_wvpn.py` / `wvpn_guard.py` 共同 import。

★★ 2026-10-07 摸清的完整真相（跟之前的理解**不一样**，改动前务必先读）

  1. 入口页 `https://wvpn.suda.edu.cn/enclient/start.html` 的 hash 路由
     `#/login/sign-in` **只是 SPA 的默认路由，不代表未登录**。
     之前的判据「URL 含 sign-in = 没登录」是**错的** —— 会永远认为没登录，
     等人工等到超时（实测 00:10 那次就是这样干等了 60 分钟）。
     真判据是：**点完『登录』之后有没有进到 `/https/webvpn.../` 门户**。

  2. 入口页只有一个 `button.el-button.el-button--primary`（文字「登录」）。
     点它 → 进 WebVPN 门户。这一步通常**靠 profile 里残留的会话自动完成**，
     不需要密码。所以「进门户」≠「ds 的 SSO 也有效」。

  3. 然后点 ds 深链。**ds 应用要求自己的 SSO 登录**，网关会把
     `auth.suda.edu.cn` 的 CAS 登录页代理过来：
       `.../https/webvpn<hash>/cas/login?service=...`
     标题 = 「统一身份认证」。

  4. **这才是真正需要账号密码的地方**，而且**没有验证码**（canvas=0，无验证码图）。

  5. 填完提交 → CAS 链走完 → 网关才会为 **ds** 签 hash，
     此时 URL 变成 `.../https/webvpn<ds_hash>/copilot-center/airobotsuda...`。
     ⚠ 注意区分：CAS 登录页 URL 里的 hash 是 **auth.suda.edu.cn 的 hash**，
     拿它去访问 `/copilot-center/...` 全是 404。**必须等 URL 里出现 copilot-center**。

选择器（2026-10-07 实测，都是稳定 id）：
  `input#username`      用户名（type=text）
  `input#password`      密码（type=password）
  `input#login-submit`  登录按钮（**是 `input[type=button]`，不是 `<button>`**）
  `form#login-form`     action 直接 POST 到 `https://auth.suda.edu.cn/cas/login?service=...`
                        （公网可达，不需要经网关）

凭据来源（按优先级）：
  1. 环境变量 `SUDA_WVPN_USER` / `SUDA_WVPN_PASS`
  2. 文件 `.wvpn-credentials.json`（`{"username": ..., "password": ...}`）
凭据**只在本机使用，绝不写入日志**。
"""
from __future__ import annotations

import json
import os
import re
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CRED_FILE = os.path.join(HERE, ".wvpn-credentials.json")

ENTRY = "https://wvpn.suda.edu.cn/enclient/start.html"
# 跳板：苏州大学主页的代理地址（已注册应用，hash 稳定）
JUMP = "https://wvpn.suda.edu.cn/https/webvpn88376f646abb70594867e29f7e6f15ac/"
COPILOT_ID = os.getenv("SUDA_DEEPSEEK_MODEL", "01JMP3EFD6EV6Q8QEXNHEH0FC4")
DS_DEEP = (f"https://ds.suda.edu.cn/copilot-center/airobotsuda"
           f"?showSource=true&id={COPILOT_ID}")

PORTAL_BTN = "button.el-button.el-button--primary"
CAS_USER = "input#username"
CAS_PASS = "input#password"
CAS_SUBMIT = "input#login-submit"

# 只有 URL 里出现这个才算真的拿到 ds 的 hash
DS_MARK = "copilot-center"

CLICK_LINK_JS = """(t) => { const a=document.createElement('a');
     a.href=t; a.target='_self'; a.id='go_ds';
     document.body.appendChild(a); a.click(); }"""


# --------------------------------------------------------------------------
# 凭据
# --------------------------------------------------------------------------
def load_credentials() -> tuple[str, str] | None:
    """返回 (用户名, 密码)；没配置或读不到返回 None。**绝不打印密码。**"""
    u = (os.getenv("SUDA_WVPN_USER") or "").strip()
    p = os.getenv("SUDA_WVPN_PASS") or ""
    if u and p:
        return u, p
    try:
        with open(CRED_FILE, encoding="utf-8") as fh:
            d = json.load(fh)
        u = str(d.get("username") or "").strip()
        p = str(d.get("password") or "")
        if u and p:
            return u, p
    except Exception:
        pass
    return None


def credentials_available() -> bool:
    return load_credentials() is not None


# --------------------------------------------------------------------------
# 页面判据
# --------------------------------------------------------------------------
async def cas_form_present(pg) -> bool:
    """是否真的停在统一身份认证**登录表单**页（要有提交按钮才算）。

    ★★ 2026-10-07 踩坑：别用 title 判「是不是还在登录页」——
      整个 `auth.suda.edu.cn` 站点的 title **都是「统一身份认证」**，
      登录成功后跳到 `/sso/user#/`（用户中心）也还是这个 title，
      于是会被误判成「还在登录页」，傻乎乎地反复填表。
      正确判据：**页面上有没有 `input#login-submit`**。
    """
    try:
        return bool(await pg.locator(CAS_SUBMIT).count())
    except Exception:
        return False


async def _settle(pg, net_idle: int = 12000) -> None:
    try:
        await pg.wait_for_load_state("networkidle", timeout=net_idle)
    except Exception:
        pass
    await pg.wait_for_timeout(2000)


async def in_portal(pg) -> bool:
    """是否已进 WebVPN 门户。

    ★★ 2026-10-07 踩坑：不能只认 `/https/webvpn`。
      点完「登录」后 SPA 有两种落点，**两种都算进门户**：
        1. 直接落到某个应用的代理页，如
           `.../enclient/start.html` → `https://wvpn.suda.edu.cn/https/webvpn88376.../`
        2. 落到门户自己的工作台路由，如
           `https://wvpn.suda.edu.cn/enclient/start.html#/home/work-bench`
      只认第 1 种会把第 2 种误判成「没进门户」，白等 40 秒后放弃。
      所以判据是：**URL 不在登录路由上**（`#/login/`、`sign-in`、`sign_up`）。
    """
    u = pg.url or ""
    if "/https/webvpn" in u and "start.html" not in u:
        return True
    if "start.html#" in u:
        tail = u.split("start.html#", 1)[1]
        return not any(k in tail for k in ("login", "sign-in", "sign_up"))
    return False


def ds_hash_from_url(url: str) -> str | None:
    """从 URL 里取 **ds 的** hash；没真正到 ds 页面就返回 None。

    ★ 2026-10-07 踩坑：一开始只判 `"copilot-center" in url`，结果**误匹配**了
      CAS 登录页 —— 它的 `service=` 查询参数里 URL-编码着最终跳转地址，
      `copilot-center` 会以明文（连字符不编码）出现在里面，于是
      「还停在统一身份认证页」被误判成「已到 ds」。
    修法：**必须同时满足**
      1. URL 里含 `copilot-center`
      2. URL 里**不含 `/cas/`**（CAS 登录页一定带这个）
      3. URL 里不含 `service=`（那是 CAS 的跳转参数）
    """
    u = url or ""
    if DS_MARK not in u:
        return None
    if "/cas/" in u or "service=" in u:
        return None
    m = re.search(r"/https/(webvpn[0-9a-f]+)/", u)
    return m.group(1) if m else None


# --------------------------------------------------------------------------
# 步骤
# --------------------------------------------------------------------------
async def enter_portal(pg, log=print, timeout: float = 60) -> bool:
    """打开入口页 → 点「登录」→ 确认进了门户。"""
    log("  打开 WebVPN 入口页...")
    await pg.goto(ENTRY, timeout=60000, wait_until="domcontentloaded")
    await pg.wait_for_timeout(5000)
    log(f"    入口页 URL = {(pg.url or '')[:120]}")

    if await in_portal(pg):
        log("    已在门户内（profile 会话仍有效）")
        return True

    btn = pg.locator(PORTAL_BTN).first
    if await btn.count() == 0:
        btn = pg.get_by_role("button", name="登录").first
    if await btn.count() == 0:
        log("    ⚠ 入口页上找不到「登录」按钮")
        return False

    log("    点击「登录」按钮...")
    try:
        await btn.click(timeout=12000)
    except Exception as exc:
        log(f"    点击异常（{type(exc).__name__}），继续观察 URL")

    t0 = time.time()
    while time.time() - t0 < timeout:
        await pg.wait_for_timeout(1500)
        if await in_portal(pg):
            log(f"    已进入门户 ✅ {pg.url[:100]}")
            return True
    log(f"    ⚠ {int(timeout)} 秒内没进门户，当前 URL = {(pg.url or '')[:120]}")
    return False


async def fill_cas_login(pg, log=print) -> bool:
    """在统一身份认证页填表并提交。返回是否成功提交。**不打印密码。**"""
    cred = load_credentials()
    if not cred:
        log("    ✗ 没有可用凭据（.wvpn-credentials.json 或环境变量），无法自动登录")
        return False
    user, pwd = cred

    # 确保在「密码登录」标签（默认就是，但显式点一次更稳）
    try:
        tab = pg.get_by_text("密码登录", exact=True).first
        if await tab.count() and await tab.is_visible():
            await tab.click(timeout=3000)
            await pg.wait_for_timeout(600)
    except Exception:
        pass

    try:
        await pg.wait_for_selector(CAS_USER, timeout=15000, state="visible")
    except Exception:
        log("    ✗ 等不到用户名输入框")
        return False

    # 用 fill + 手动派发事件，兼容各种前端框架
    async def _set(sel: str, val: str) -> None:
        el = pg.locator(sel).first
        await el.click(timeout=5000)
        await el.fill(val, timeout=5000)
        await el.evaluate(
            """(el, v) => {
                 el.value = v;
                 el.dispatchEvent(new Event('input', {bubbles:true}));
                 el.dispatchEvent(new Event('change', {bubbles:true}));
               }""", val)

    await _set(CAS_USER, user)
    await _set(CAS_PASS, pwd)
    log(f"    已填入用户名（{len(user)} 位）与密码（{len(pwd)} 位）")

    try:
        await pg.locator(CAS_SUBMIT).first.click(timeout=10000)
    except Exception as exc:
        log(f"    ⚠ 点登录按钮异常（{type(exc).__name__}），试回车提交")
        try:
            await pg.locator(CAS_PASS).first.press("Enter")
        except Exception:
            return False
    log("    已提交登录表单，等待 SSO 跳转...")
    return True


async def read_cas_error(pg) -> str:
    """读登录页上的错误提示（密码错等）。**不会包含密码。**"""
    for sel in (".error", ".alert", ".login-error", "[class*=error]", "[class*=tip]"):
        try:
            loc = pg.locator(sel).first
            if await loc.count() and await loc.is_visible():
                t = (await loc.inner_text() or "").strip()
                if t:
                    return t[:160]
        except Exception:
            continue
    return ""


# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------
async def login_and_get_ds_hash(pg, log=print, rounds: int = 4) -> str | None:
    """完整流程：进门户 → 跳板页 → 点 ds 深链 →（必要时自动登录）→ ds hash。

    ★★ 为什么要**外圈重试深链**（2026-10-07 实测出来的关键）：
      ds 走的是 OIDC。第一次点深链时 CAS 会话已过期，网关把 CAS 登录页代理过来；
      在那一页登录成功后，浏览器会跑到 `auth.suda.edu.cn/sso/user#/`（用户中心），
      **不会自动回到 ds**。此时 CAS 会话已经建立，
      **必须重新点一次深链**，网关这次才能静默 SSO 并签发 ds 的 hash。
      所以是「两层循环」：外圈重试深链，内圈处理落在登录页的情况。

    返回 ds 的 webvpn hash；失败返回 None。
    """
    if not await enter_portal(pg, log=log):
        return None

    submitted = False
    for rnd in range(rounds):
        log(f"--- 第 {rnd + 1} 轮：跳板页 → ds 深链 ---")
        try:
            await pg.goto(JUMP, timeout=60000, wait_until="domcontentloaded")
        except Exception as exc:
            log(f"    打开跳板页失败：{type(exc).__name__}")
            continue
        await pg.wait_for_timeout(4000)
        try:
            await pg.evaluate(CLICK_LINK_JS, DS_DEEP)
        except Exception as exc:
            log(f"    点击深链失败：{type(exc).__name__}")
            continue

        # 内圈：等页面稳定，最多处理 2 次「落到登录页」
        for seg in range(3):
            await _settle(pg)
            url = pg.url or ""
            log(f"    URL = {url[:150]}")

            h = ds_hash_from_url(url)
            if h:
                log(f"  ✅ 拿到 ds 代理 hash = {h}")
                return h

            if await cas_form_present(pg):
                err = await read_cas_error(pg)
                if err:
                    log(f"    ⚠ 登录页提示：{err}")
                    if submitted:
                        log("    ✗ 已提交过一次仍报错，凭据可能不对，停止重试")
                        return None
                log("    落到统一身份认证登录页，自动填表...")
                if not await fill_cas_login(pg, log=log):
                    return None
                submitted = True
                continue

            break  # 既不是成功也不是登录页 → 交给外圈重试深链

        log(f"  第 {rnd + 1} 轮没拿到 hash，重新点一次深链")

    log("  ✗ 多轮之后仍未拿到 ds hash")
    return None


def collect_wvpn_cookies(cookies: list[dict]) -> dict[str, str]:
    """从 playwright 的 cookie 列表里挑出 wvpn 域的，返回 name→value。"""
    return {c["name"]: c["value"] for c in cookies
            if "wvpn.suda.edu.cn" in (c.get("domain") or "")}
