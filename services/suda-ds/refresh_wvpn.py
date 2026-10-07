#!/usr/bin/env python
"""刷新 WebVPN 通道：重新拿 ds 的 webvpn hash + 网关 cookie，写进配置，并重启服务。

什么时候跑：
  - /health 里 errors 涨、ws_degraded=true，或请求报「连不上 / 尚未登录」时；
  - 或者定期跑一次做预防。

做什么：
  1. **停掉服务（8765/8766）和守护（8767）** —— 独占 `.wvpn-profile`；
  2. 走 `wvpn_login.login_and_get_ds_hash()`：
     入口页点「登录」→ 跳板页 → 点 ds 深链 →（必要时**用凭据自动填表登录**）→ ds hash；
  3. 把 hash 写进 `.wvpn-env.json`，wvpn cookie 写进 `.wvpn-cookie.txt`；
  4. **拉起守护**，让服务带新配置与新会话起来，等 /health 变 ok。

★★ 2026-10-07 摸清的四个关键认知（旧版本全搞错了，改动前务必先读）

  1. **入口页的 `#/login/sign-in` 不代表未登录** —— 那只是 SPA 默认路由。
     旧版据此判断「没登录」并干等人工 60 分钟，其实一直是登录着的。
  2. **ds 的 hash 是稳定的**（同一个应用注册），实测多次拿到都是
     `webvpnf90789cfdb1c9a4496852ef105ee5a33`。真正会过期的是 **CAS 会话**；
     会话一失效，网关就拒绝代理（客户端表现为 `InvalidURI` / HTTP 302）。
  3. **需要账号密码的是 ds 自己的 SSO 页**（网关把 auth.suda.edu.cn 的 CAS
     登录页代理过来），选择器见 `wvpn_login.py`。登录成功后**必须重新点一次深链**
     才会拿到 ds 的 hash（OIDC 不会自动跳回来）。
  4. ★★ **broker 也必须用这个 profile**（`SUDA_DEEPSEEK_BROWSER_PROFILE`）。
     漏了它的后果：broker 用没有 VPN 会话的 `.browser-profile` 去开代理后的 ds 页面
     → 永远卡在统一身份认证页 → `页面已 45 秒未就绪，自动重新加载` 死循环
     → 拿不到 `access_token` → 8766 `/token` 返回空 → 8765 一律
     401「尚未登录。请先运行苏大登录程序…」。见 `suda_broker.py:38-40`。

★ 为什么要**停掉守护**再登录：守护会在 ~7 秒内把服务拉回来，而服务一起来
  broker 就去抓 `.wvpn-profile`。登录需要独占该 profile，必须让它别抢。
  （早先用「profile 副本 + 事后落回」的写法，落回时 32 个文件被占住复制不过去，
    broker 的 browser context 直接崩成 `TargetClosedError` —— 已废弃。）

用法:
  Python312\\python.exe refresh_wvpn.py            # 自动登录（读 .wvpn-credentials.json）
  Python312\\python.exe refresh_wvpn.py --human    # 强制人工登录（凭据失效时用）
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.async_api import async_playwright

import wvpn_login as W

HERE = os.path.dirname(os.path.abspath(__file__))
PROFILE = os.path.join(HERE, ".wvpn-profile")
ENV_FILE = os.path.join(HERE, ".wvpn-env.json")
COOKIE_FILE = os.path.join(HERE, ".wvpn-cookie.txt")
CHROME = os.getenv("SUDA_DEEPSEEK_BROWSER_EXECUTABLE", "") or None

COPILOT_ID = os.getenv("SUDA_DEEPSEEK_MODEL", "01JMP3EFD6EV6Q8QEXNHEH0FC4")

# 服务端口 + 守护端口。守护在 8767。
SERVICE_PORTS = (8765, 8766, 8767)

# 有凭据时是否无头跑（默认无头 —— 自动续期不该弹窗打扰人）。
HEADLESS = (os.getenv("SUDA_DEEPSEEK_WVPN_HEADLESS", "1") != "0")
# 自动失败后转人工等待（秒）
HUMAN_WAIT = int(os.getenv("SUDA_DEEPSEEK_WVPN_LOGIN_WAIT", "900"))
# 备用：用 profile 副本登录（默认关）。只有在「不能停服务」时才需要。
USE_COPY = (os.getenv("SUDA_DEEPSEEK_WVPN_USE_COPY", "0") == "1")


def log(m: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


# ── 进程/服务控制 ─────────────────────────────────────────────────────
def _pids_on(ports=SERVICE_PORTS) -> list[int]:
    """netstat 找监听指定端口的 PID。**中文 Windows 输出是 GBK，要 decode('gbk')。**"""
    try:
        raw = subprocess.run(["netstat", "-ano"], capture_output=True).stdout
    except Exception:
        return []
    out: set[int] = set()
    for line in raw.decode("gbk", errors="replace").splitlines():
        if "LISTENING" not in line.upper():
            continue
        parts = line.split()
        if len(parts) < 2 or not parts[-1].isdigit():
            continue
        if any(parts[1].endswith(f":{p}") for p in ports):
            out.add(int(parts[-1]))
    return sorted(out)


def health_ok() -> bool:
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with op.open("http://127.0.0.1:8765/health", timeout=8) as r:
            return json.loads(r.read().decode()).get("status") == "ok"
    except Exception:
        return False


def stop_service_and_supervisor(wait: float = 40) -> None:
    """停掉服务（8765/8766）**和守护**（8767），独占 profile。"""
    pids = _pids_on()
    log(f"停服务+守护：PID = {pids or '(无)'}")
    for pid in pids:
        subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True)
    t0 = time.time()
    while time.time() - t0 < wait:
        time.sleep(1)
        if not _pids_on():
            log(f"  已全部停止（{int(time.time() - t0)} 秒）")
            return
    log("  ⚠ 仍有进程占着 8765/8766/8767")


def start_supervisor() -> None:
    """拉起守护（它会自己把 8765/8766 服务带起来）。"""
    pyw = sys.executable.replace("python.exe", "pythonw.exe")
    if not os.path.exists(pyw):
        pyw = sys.executable
    subprocess.Popen(
        [pyw, "launcher.py", "--supervise"], cwd=HERE,
        creationflags=0x00000008 | 0x00000200,   # DETACHED_PROCESS | NEW_PROCESS_GROUP
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
    log(f"已拉起守护：{pyw} launcher.py --supervise")


def wait_health(wait: float = 180) -> bool:
    t0 = time.time()
    while time.time() - t0 < wait:
        time.sleep(5)
        if health_ok():
            log(f"服务已恢复（{int(time.time() - t0)} 秒）")
            return True
    log("⚠ 服务未在预期时间内恢复")
    return False


# ── 杂项 ─────────────────────────────────────────────────────────────
def load_env() -> dict:
    try:
        with open(ENV_FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def make_profile_copy() -> str:
    """复制一份 profile 再用（仅在 USE_COPY 时走这条路）。

    `shutil.copytree` **没有 ignore_errors 参数**（只有 dirs_exist_ok），
    且遇到锁文件会整体抛错，所以这里自己 walk + copy2，单个失败不影响整体。
    """
    dst = os.path.join(tempfile.gettempdir(), f"wvpn-profile-{os.getpid()}")
    shutil.rmtree(dst, ignore_errors=True)
    skipped = 0
    for root, _dirs, files in os.walk(PROFILE):
        rel = os.path.relpath(root, PROFILE)
        target_root = dst if rel == "." else os.path.join(dst, rel)
        os.makedirs(target_root, exist_ok=True)
        for name in files:
            try:
                shutil.copy2(os.path.join(root, name), os.path.join(target_root, name))
            except OSError:
                skipped += 1
    for name in ("lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket"):
        path = os.path.join(dst, name)
        try:
            if os.path.exists(path) or os.path.islink(path):
                os.remove(path)
        except OSError:
            pass
    if skipped:
        log(f"  （复制时跳过 {skipped} 个被占用的文件）")
    return dst


async def _launch(p, profile: str, headless: bool):
    return await p.chromium.launch_persistent_context(
        profile, executable_path=CHROME, headless=headless,
        ignore_https_errors=True,
        args=['--no-sandbox', '--disable-dev-shm-usage']
        + ([] if headless else ['--start-maximized']),
        viewport={"width": 1440, "height": 900} if headless else None)


async def _wait_human(pg, timeout: int) -> bool:
    """人工兜底：等唐老师把 ds 页面点出来（URL 出现 copilot-center 即算成功）。"""
    log(f">>> 请在弹出的窗口里完成统一身份认证；最多等 {timeout // 60} 分钟 <<<")
    t0 = time.time()
    while time.time() - t0 < timeout:
        await pg.wait_for_timeout(3000)
        if W.ds_hash_from_url(pg.url or ""):
            return True
    return False


# ── 主流程 ───────────────────────────────────────────────────────────
async def main(human_only: bool = False) -> int:
    cfg = load_env()
    old_hash = ""
    m = re.search(r"/https/(webvpn[0-9a-f]+)", cfg.get("SUDA_DEEPSEEK_WS_URL", ""))
    if m:
        old_hash = m.group(1)
    log(f"当前 hash: {old_hash or '(无)'}")

    has_cred = W.credentials_available()
    log(f"自动登录凭据: {'✅ 可用' if has_cred else '❌ 不可用'}")
    if human_only:
        log("（--human：跳过自动登录，直接等人工）")

    headless = HEADLESS and has_cred and not human_only

    # ★ 单属主：独占 profile 再登录
    if not USE_COPY:
        stop_service_and_supervisor()
    else:
        log("（USE_COPY：不停服务，改用 profile 副本 —— broker 会拿不到新会话！）")

    new_hash = None
    cookie_header = ""
    try:
        async with async_playwright() as p:
            if USE_COPY:
                work_profile = make_profile_copy()
                log(f"profile 副本: {work_profile}")
            else:
                work_profile = PROFILE
                log(f"profile（独占）: {work_profile}")

            log(f"启动浏览器（headless={headless}）...")
            ctx = await _launch(p, work_profile, headless)
            pg = ctx.pages[0] if ctx.pages else await ctx.new_page()

            if human_only:
                await pg.goto(W.ENTRY, timeout=60000, wait_until="domcontentloaded")
                await pg.wait_for_timeout(4000)
                await pg.goto(W.JUMP, timeout=60000, wait_until="domcontentloaded")
                await pg.wait_for_timeout(4000)
                await pg.evaluate(W.CLICK_LINK_JS, W.DS_DEEP)
                if await _wait_human(pg, HUMAN_WAIT):
                    new_hash = W.ds_hash_from_url(pg.url)
            else:
                new_hash = await W.login_and_get_ds_hash(pg, log=log)

            if not new_hash and not headless:
                log("自动流程未拿到 hash，转人工兜底...")
                if await _wait_human(pg, HUMAN_WAIT):
                    new_hash = W.ds_hash_from_url(pg.url)

            if new_hash:
                log(f"拿到 ds hash: {new_hash}"
                    + ("（未变）" if new_hash == old_hash else "（已更新）"))
                picked = W.collect_wvpn_cookies(await ctx.cookies())
                if picked:
                    cookie_header = "; ".join(f"{k}={v}" for k, v in picked.items())
                else:
                    log("✗ 没拿到 wvpn cookie")
                    new_hash = None

            await ctx.close()
    except Exception as exc:  # noqa: BLE001 - 任何异常都要把守护拉回来
        log(f"✗ 登录过程异常：{type(exc).__name__}: {str(exc)[:200]}")

    if not new_hash or not cookie_header:
        log("✗ 续期失败，配置保持原样。拉回守护...")
        start_supervisor()
        wait_health()
        return 1

    with open(COOKIE_FILE, "w", encoding="utf-8") as fh:
        fh.write(cookie_header)
    log(f"cookie 已写入 {COOKIE_FILE}（{len(cookie_header)} 字符）")

    # 写配置（含 BROWSER_PROFILE —— 见文件头第 4 条）
    cfg["_comment"] = ("校外通道配置：ds.suda.edu.cn 只对校园网开放，不在校园网时借道 "
                       "wvpn.suda.edu.cn 反向代理。删掉本文件即回到直连。")
    cfg["SUDA_DEEPSEEK_WS_URL"] = (
        f"wss://wvpn.suda.edu.cn/https/{new_hash}/copilot-api/internal-graphql")
    cfg["SUDA_DEEPSEEK_WS_ORIGIN"] = "https://wvpn.suda.edu.cn"
    cfg["SUDA_DEEPSEEK_WS_COOKIE_FILE"] = COOKIE_FILE
    cfg["SUDA_DEEPSEEK_LOGIN_URL"] = (
        f"https://wvpn.suda.edu.cn/https/{new_hash}/copilot-center/"
        f"airobotsuda?showSource=true&id={COPILOT_ID}")
    cfg["SUDA_DEEPSEEK_BROWSER_PROFILE"] = PROFILE
    with open(ENV_FILE, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, ensure_ascii=False, indent=1)
    log(f"配置已写入 {ENV_FILE}")
    log(f"  （含 SUDA_DEEPSEEK_BROWSER_PROFILE={PROFILE}）")

    # ★ 配置是 launcher 在**启动子进程时**读进环境的 —— 必须**在写完之后**才拉服务。
    log("拉起守护（带新配置）...")
    start_supervisor()
    ok = wait_health()
    log("完成 ✅" if ok else "完成（但服务未按时恢复，请检查守护）")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main(human_only="--human" in sys.argv)))
