#!/usr/bin/env python
"""WebVPN 通道自动续期守护。

做什么：定期用当前 cookie 探一次代理 WS 握手；失效就自动处理。
★ 2026-10-07 大简化：**broker 现在会自己登录并导出 cookie**（见 `suda_broker.py`
  的 `maybe_autologin` / `export_wvpn_cookies`），ds 的 hash 又是稳定的，
  所以「续期」= 「重启服务让 broker 重开一次页面」。
  不再需要自己开浏览器（那会和 broker 抢 `.wvpn-profile`，实测把 broker 搞崩）。

用法:
    Python312\\python.exe wvpn_guard.py            # 常驻守护
    Python312\\python.exe wvpn_guard.py --once      # 只探一次并按需刷新（调试用）
    Python312\\python.exe wvpn_guard.py --interval 180

日志: guard.log（同目录）
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

import wvpn_login as W

HERE = os.path.dirname(os.path.abspath(__file__))
PROFILE = os.path.join(HERE, ".wvpn-profile")
ENV_FILE = os.path.join(HERE, ".wvpn-env.json")
COOKIE_FILE = os.path.join(HERE, ".wvpn-cookie.txt")
LOG_FILE = os.path.join(HERE, "guard.log")
CHROME = os.getenv("SUDA_DEEPSEEK_BROWSER_EXECUTABLE", "") or None

COPILOT_ID = os.getenv("SUDA_DEEPSEEK_MODEL", "01JMP3EFD6EV6Q8QEXNHEH0FC4")
JUMP = "https://wvpn.suda.edu.cn/https/webvpn88376f646abb70594867e29f7e6f15ac/"
DS_DEEP = f"https://ds.suda.edu.cn/copilot-center/airobotsuda?showSource=true&id={COPILOT_ID}"

CHECK_INTERVAL = int(os.getenv("WVPN_GUARD_INTERVAL", "300"))   # 探测间隔（秒）
LOGIN_WAIT = int(os.getenv("WVPN_GUARD_LOGIN_WAIT", "900"))     # 弹窗等人工登录上限
PROBE_TIMEOUT = 20
HEARTBEAT = os.path.join(HERE, "guard.heartbeat")
STATE_FILE = os.path.join(HERE, "guard.state")


def _cmd_out(cmd: list[str]) -> str:
    """跑系统命令拿输出。

    ★ 中文 Windows 的 netstat / tasklist 输出是 **GBK**，用 `text=True`（UTF-8）解会
    UnicodeDecodeError，stdout 直接变 None —— 结果是 service_pid() 找不到服务、
    pid_alive() 恒为 False，去重和重启全部失效（2026-10-06 实测踩到）。
    """
    import subprocess
    try:
        raw = subprocess.run(cmd, capture_output=True, timeout=25).stdout
        return raw.decode("gbk", errors="ignore")
    except Exception:
        return ""


def pid_alive(pid: int) -> bool:
    out = _cmd_out(["tasklist", "/FI", f"PID eq {pid}", "/NH"])
    return str(pid) in out


def another_instance_running() -> bool:
    """靠「心跳 + PID 存活」判断是否有实例在跑。

    ★ 只看时间戳会出问题：手动重启守护时，**刚被杀掉的那个进程留下的心跳还是新鲜的**，
    新实例一看到就自己退出了，结果守护再也起不来（2026-10-06 实测踩到）。
    所以心跳里记 PID，再确认那个 PID 真的还活着才算「已有实例」。
    """
    try:
        with open(HEARTBEAT, encoding="utf-8") as fh:
            pid_s, ts_s = fh.read().split()
        pid, ts = int(pid_s), float(ts_s)
    except Exception:
        return False
    if time.time() - ts > max(CHECK_INTERVAL * 2, 120):
        return False      # 心跳太旧，视为没有实例
    return pid_alive(pid)


def beat() -> None:
    try:
        with open(HEARTBEAT, "w", encoding="utf-8") as fh:
            fh.write(f"{os.getpid()} {time.time()}")
    except OSError:
        pass


def log(msg: str) -> None:
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    try:
        print(line, flush=True)
    except Exception:
        pass
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def read_config() -> dict:
    try:
        with open(ENV_FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def proxy_enabled() -> bool:
    """代理模式是否启用（.wvpn-env.json 存在即为启用）。"""
    return os.path.exists(ENV_FILE)


def direct_reachable() -> bool:
    """ds.suda.edu.cn 能不能直连（== 在校园网里）。只看 TCP，够快也够准。"""
    import socket
    for host in ("ds.suda.edu.cn",):
        try:
            s = socket.create_connection((host, 443), timeout=5)
            s.close()
            return True
        except OSError:
            continue
    return False


def enable_proxy() -> bool:
    """启用代理通道：把 .off 备份（或内置模板）写成 .wvpn-env.json。"""
    import glob
    # 优先复用被停用的旧配置
    for bak in sorted(glob.glob(ENV_FILE + ".off*"), reverse=True):
        try:
            with open(bak, encoding="utf-8") as fh:
                json.load(fh)
            with open(bak, encoding="utf-8") as fh:
                data = fh.read()
            with open(ENV_FILE, "w", encoding="utf-8") as fh:
                fh.write(data)
            log(f"  已从 {os.path.basename(bak)} 恢复代理配置")
            return True
        except Exception:
            continue
    return False  # 没有备份就让 refresh() 去重新签 hash


def service_pid() -> int | None:
    """找 8765 的监听 PID（服务进程；8767 是守护，别杀它）。"""
    out = _cmd_out(["netstat", "-ano"])
    for line in out.splitlines():
        if ":8765" in line and "LISTENING" in line.upper():
            try:
                return int(line.split()[-1])
            except (ValueError, IndexError):
                continue
    return None


def restart_service() -> bool:
    """让服务重新加载配置：只杀服务进程，8767 守护会在 15 秒内拉起新的。

    ★ 为什么必须重启：`.wvpn-env.json` 是 launcher 在**启动子进程时**读进环境的，
    运行中改文件对已经跑起来的服务无效。所以网络环境一变（校园网 <-> 校外），
    光改配置不够，必须让服务重起一次，它才会用上新通道。
    """
    import subprocess
    pid = service_pid()
    if not pid:
        log("  找不到服务进程（8765），跳过重启")
        return False
    try:
        subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                       capture_output=True, timeout=25)
        log(f"  已结束服务进程 {pid}，等守护重新拉起（约 15 秒）...")
        return True
    except Exception as exc:
        log(f"  重启服务失败: {exc}")
        return False


def read_state() -> str:
    try:
        with open(STATE_FILE, encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return ""


def write_state(state: str) -> None:
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as fh:
            fh.write(state)
    except OSError:
        pass


def disable_proxy() -> None:
    """停用代理通道：把 .wvpn-env.json 改名成 .off-<日期>。"""
    if not os.path.exists(ENV_FILE):
        return
    bak = ENV_FILE + ".off-" + time.strftime("%Y%m%d")
    try:
        os.replace(ENV_FILE, bak)
        log(f"  已停用代理配置 -> {os.path.basename(bak)}")
    except OSError as exc:
        log(f"  停用失败: {exc}")


def read_cookie() -> str:
    try:
        with open(COOKIE_FILE, encoding="utf-8") as fh:
            return fh.read().strip()
    except Exception:
        return ""


def broker_token() -> str:
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with op.open("http://127.0.0.1:8766/token", timeout=8) as r:
            return json.loads(r.read().decode()).get("access_token", "")
    except Exception:
        return ""


async def probe(cookie: str, ws_url: str, origin: str) -> tuple[bool, str]:
    """轻量探测：带 cookie 做一次 WS 握手，只看 connection_ack。"""
    from websockets.asyncio.client import connect
    token = broker_token()
    url = f"{ws_url}?access_token={token}" if token else ws_url
    try:
        async with connect(url, origin=origin,
                           subprotocols=["graphql-transport-ws"],
                           additional_headers={"Cookie": cookie},
                           open_timeout=PROBE_TIMEOUT, close_timeout=3) as ws:
            await ws.send(json.dumps({"type": "connection_init"}))
            while True:
                ev = json.loads(await asyncio.wait_for(ws.recv(), timeout=PROBE_TIMEOUT))
                if ev.get("type") == "connection_ack":
                    return True, "ack"
                if ev.get("type") in {"connection_error", "error"}:
                    return True, "ack(服务端拒绝业务但通道通)"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {str(exc)[:120]}"


# 登录页的 URL 特征。登录页是 SPA（URL 形如
# `.../enclient/start.html#/login/sign-in`），**title 自始至终为空**，
# 所以只认 URL，不认 title。
LOGIN_MARKS = ("cas/login", "auth.suda.edu.cn", "/login/", "sign-in", "sign_up")


async def _on_login_page(pg) -> bool:
    """判断当前是否停在登录页（未登录）。

    ★ 2026-10-07 血泪修正：旧判据是
      `"cas/login" in pg.url or "统一身份认证" in (await pg.title())`
    而实测登录页 URL 里根本没有 `cas/login`，title 也一直是空的
    → 两个条件全落空 → 未登录被误判成「已登录」→ 直接点 ds 深链
    → 网关不代理 → 续期静默失败。这就是「离开校园网后 VPN 没自动接上」的真根因。
    """
    u = pg.url or ""
    if any(k in u for k in LOGIN_MARKS):
        return True
    try:
        return "统一身份认证" in (await pg.title())
    except Exception:
        return False


def _pids_on_service() -> list[int]:
    """netstat 找监听 8765/8766 的 PID（中文 Windows 输出是 GBK，要 decode('gbk')）。"""
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
        if any(parts[1].endswith(f":{p}") for p in (8765, 8766)):
            out.add(int(parts[-1]))
    return sorted(out)


def restart_service_only() -> None:
    """只重启 8765/8766 服务子进程；守护（8767）会自己拉回来。"""
    pids = _pids_on_service()
    log(f"  重启服务子进程：{pids or '(无)'}")
    for pid in pids:
        subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True)


async def refresh(headless: bool, wait_login: int) -> bool:
    """刷新通道。

    ★★ 2026-10-07 大简化。旧版是「自己开浏览器 → 抢 .wvpn-profile → 手动走登录」，
      现在**不需要了**，原因有二：
        1. broker 自己会登录（`suda_broker.maybe_autologin`）并导出 cookie
           （`suda_broker.export_wvpn_cookies`）；
        2. ds 的 webvpn hash 是**稳定的**（一直是 f90789…），不会过期。
      而旧版开浏览器会和 broker 抢同一个 profile，实测把 broker 的 browser context
      搞崩成 `TargetClosedError`。所以改成：
        · 配置里已有 wvpn hash → 只重启服务，让 broker 重开页面自愈；
        · 配置里没有 hash → 才退回浏览器流程（首次搭建时用）。
    """
    cfg = read_config()
    has_hash = bool(re.search(r"/https/(webvpn[0-9a-f]+)",
                              cfg.get("SUDA_DEEPSEEK_WS_URL", "")))
    if has_hash:
        log("  配置里已有 WebVPN hash（hash 稳定）→ 重启服务让 broker 自愈")
        restart_service_only()
        return True

    log("  配置里没有 WebVPN hash → 走浏览器流程（首次搭建）")
    return await _refresh_via_browser(headless, wait_login)


async def _refresh_via_browser(headless: bool, wait_login: int) -> bool:
    """首次搭建用：开浏览器走一遍登录，拿到 hash 与 cookie。"""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            PROFILE, executable_path=CHROME, headless=headless,
            ignore_https_errors=True,
            args=['--no-sandbox', '--disable-dev-shm-usage']
            + (['--start-maximized'] if not headless else []),
            viewport=None if not headless else {"width": 1440, "height": 900})
        pg = ctx.pages[0] if ctx.pages else await ctx.new_page()

        new_hash = await W.login_and_get_ds_hash(pg, log=log)
        if not new_hash:
            log("  没拿到 ds hash")
            await ctx.close()
            return False

        picked = W.collect_wvpn_cookies(await ctx.cookies())
        if not picked:
            log("  没拿到 wvpn cookie")
            await ctx.close()
            return False
        header = "; ".join(f"{k}={v}" for k, v in picked.items())
        with open(COOKIE_FILE, "w", encoding="utf-8") as fh:
            fh.write(header)
        log(f"  cookie 已更新（{len(picked)} 项）")

        cfg = read_config()
        cfg["_comment"] = ("校外通道配置：ds.suda.edu.cn 只对校园网开放，不在校园网时借道 "
                           "wvpn.suda.edu.cn 反向代理。删掉本文件即回到直连。")
        cfg["SUDA_DEEPSEEK_WS_URL"] = (
            f"wss://wvpn.suda.edu.cn/https/{new_hash}/copilot-api/internal-graphql")
        cfg["SUDA_DEEPSEEK_WS_ORIGIN"] = "https://wvpn.suda.edu.cn"
        cfg["SUDA_DEEPSEEK_WS_COOKIE_FILE"] = COOKIE_FILE
        cfg["SUDA_DEEPSEEK_LOGIN_URL"] = (
            f"https://wvpn.suda.edu.cn/https/{new_hash}/copilot-center/"
            f"airobotsuda?showSource=true&id={COPILOT_ID}")
        # ★ broker 的浏览器也必须用带 VPN 登录态的 profile（否则页面永远加载不出来）
        cfg["SUDA_DEEPSEEK_BROWSER_PROFILE"] = PROFILE
        with open(ENV_FILE, "w", encoding="utf-8") as fh:
            json.dump(cfg, fh, ensure_ascii=False, indent=1)
        log(f"  配置已更新 hash={new_hash}")
        await ctx.close()
        return True


async def health_ok() -> bool:
    import urllib.request
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with op.open("http://127.0.0.1:8765/health", timeout=10) as r:
            return json.loads(r.read().decode()).get("status") == "ok"
    except Exception:
        return False


async def apply_switch(want: str) -> None:
    """网络模式变了：重启服务，让它按新的 .wvpn-env.json 重新起步。"""
    log(f"网络模式切换 → {want}，重启服务让新配置生效")
    if not restart_service():
        return
    for _ in range(12):          # 守护 15 秒一轮，最多等 60 秒
        await asyncio.sleep(5)
        if await health_ok():
            log("  服务已恢复 ✅")
            return
    log("  服务仍未就绪 ⚠️（看 supervisor.log）")


async def run_once() -> bool:
    """一轮检查：直连优先；直连断了才启用/续期 WebVPN 通道。

    ★ 网络模式变化时会**重启服务**：`.wvpn-env.json` 只在 launcher 拉起子进程时
    读一次，运行中改文件对已跑起来的服务无效。不重启 = 配置改了也没用。
    """
    direct = direct_reachable()
    active = proxy_enabled()
    want = "direct" if direct else "proxy"
    prev = read_state()
    log(f"直连={'通' if direct else '不通'} 代理={'启用' if active else '停用'}")

    # 1) 在校园网：直连可用 → 确保代理是停用的（直连更快、不依赖 cookie）
    if direct:
        if active:
            disable_proxy()
            log("直连已恢复 → 已切回直连")
        else:
            log("直连正常，无需操作")
        if prev and want != prev:
            await apply_switch(want)
        if want != prev:
            write_state(want)
        return True

    # 2) 不在校园网：必须走代理
    if not active:
        log("直连不可达 → 启用 WebVPN 通道")
        enable_proxy()  # 没备份也无所谓，下面 refresh 会重新签 hash

    cfg = read_config()
    ws_url = cfg.get("SUDA_DEEPSEEK_WS_URL", "")
    origin = cfg.get("SUDA_DEEPSEEK_WS_ORIGIN", "https://wvpn.suda.edu.cn")
    cookie = read_cookie()

    result = False
    if ws_url and cookie:
        ok, why = await probe(cookie, ws_url, origin)
        if ok:
            log(f"代理通道正常（{why}）")
            result = True
        else:
            log(f"代理通道失效：{why}")
    else:
        log("代理配置/cookie 缺失，需要重新登录")

    if not result:
        log("尝试无头自动续期（靠 CAS 的 TGT 自动 SSO，无需人工）...")
        if await refresh(headless=True, wait_login=LOGIN_WAIT):
            cfg = read_config()
            ok2, why2 = await probe(read_cookie(),
                                    cfg.get("SUDA_DEEPSEEK_WS_URL", ws_url), origin)
            log(f"自动续期后复探：{ok2} {why2}")
            result = ok2

    if not result:
        log("无头续期失败（TGT 也过期了），弹窗等待人工登录...")
        if await refresh(headless=False, wait_login=LOGIN_WAIT):
            cfg = read_config()
            ok3, why3 = await probe(read_cookie(),
                                    cfg.get("SUDA_DEEPSEEK_WS_URL", ws_url), origin)
            log(f"人工登录后复探：{ok3} {why3}")
            result = ok3

    # 从直连切到代理，服务同样得重启才会读新配置
    if prev and want != prev:
        await apply_switch(want)
    if want != prev:
        write_state(want)
    return result


async def main() -> int:
    args = sys.argv[1:]
    if "--once" in args:
        return 0 if await run_once() else 1

    interval = CHECK_INTERVAL
    if "--interval" in args:
        try:
            interval = int(args[args.index("--interval") + 1])
        except (ValueError, IndexError):
            pass
    if another_instance_running():
        log("已有实例在跑（心跳新鲜），本实例退出")
        return 0
    log(f"守护启动，每 {interval} 秒探一次（日志 {LOG_FILE}）")
    fails = 0
    while True:
        beat()
        try:
            ok = await run_once()
            fails = 0 if ok else fails + 1
        except Exception as exc:
            fails += 1
            log(f"探测异常 {type(exc).__name__}: {str(exc)[:160]}")
        if fails >= 3:
            log("连续 3 次失败，退避 30 分钟")
            await asyncio.sleep(1800)
            fails = 0
        else:
            await asyncio.sleep(interval)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
