#!/usr/bin/env python3
"""苏州大学 DeepSeek 一键启动器

同时拉起登录代理（8766）和 OpenAI 兼容接口（8765），并打印接入 WorkBuddy 所需的配置信息。
用法：
    python launcher.py              启动全部
    python launcher.py --check      只做环境自检
    python launcher.py --api-only   只起接口（登录代理已在别处运行）
    python launcher.py --supervise  常驻守护：服务挂了自动拉起（开机自启用这个）
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

import suda_api
import suda_broker

HERE = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(HERE, "launcher.log")
# 守护进程的单例锁：占住这个本地端口，避免「开机自启」和手动启动各跑一个守护
SUPERVISE_LOCK_PORT = int(os.getenv("SUDA_DEEPSEEK_SUPERVISE_LOCK_PORT", "8767"))
DEFAULT_INTERVAL = float(os.getenv("SUDA_DEEPSEEK_SUPERVISE_INTERVAL", "15"))

# ★★★ 本机健康检查必须绕开系统代理 ★★★
# 唐老师机器上 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`（Clash，127.0.0.1:7897）
# 是**用户级环境变量**，任何从登录会话起的进程都会继承（**开机自启的 VBS 就是**）。
# 而 Python 的 `urllib` 会老老实实走 `*_PROXY`，**不会**自动绕过 127.0.0.1。
# 实测（HTTP_PROXY 指向死端口）：
#     默认 urlopen      → URLError [WinError 10061] 目标计算机积极拒绝
#     ProxyHandler({})  → 200
# 后果：守护的健康检查永远失败 → 它认为服务死了 → **无限重启**（浏览器被反复关掉）。
_LOCAL_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

# 给子进程清掉代理变量：本服务的设计前提就是**不走代理**
# （本机 broker 是 127.0.0.1；上游 ds.suda.edu.cn 是校园网服务，走 Clash 反而连不上）。
_PROXY_KEYS = (
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
    "http_proxy", "https_proxy", "all_proxy",
)


def _webvpn_env() -> dict:
    """校外通道配置：从 `.wvpn-env.json` 读额外的 `SUDA_DEEPSEEK_*` 变量。

    `ds.suda.edu.cn` 只对校园网开放，校外必须借道 `wvpn.suda.edu.cn` 的反向代理。
    把 WS_URL / WS_ORIGIN / WS_COOKIE_FILE / LOGIN_URL / BROWSER_PROFILE 写进这个文件，
    服务（含守护拉起的子进程）就统一走代理。文件不存在 = 直连，行为与改动前完全一致。
    """
    path = os.path.join(HERE, ".wvpn-env.json")
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items()}
    except FileNotFoundError:
        pass
    except Exception as exc:  # noqa: BLE001 - 配置坏了也不能让启动挂掉
        log_line(f".wvpn-env.json 读取失败，按直连启动：{exc}")
    return {}


def child_env() -> dict:
    """子进程环境：清掉所有 `*_PROXY`，并设 `NO_PROXY=*`。"""
    env = {k: v for k, v in os.environ.items() if k not in _PROXY_KEYS}
    env["NO_PROXY"] = "*"
    env["no_proxy"] = "*"
    env.update({
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
        "PYTHONUNBUFFERED": "1",
    })
    env.update(_webvpn_env())  # 校外走 WebVPN 时生效；没配置就是空字典
    return env


def log_line(message: str) -> None:
    """写一行日志。同时落盘到 supervisor.log，这样静默启动时也能查。"""
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{stamp}] {message}"
    try:
        print(line, flush=True)
    except Exception:  # noqa: BLE001 - pythonw 下没有 stdout
        pass
    try:
        with open(os.path.join(HERE, "supervisor.log"), "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError:
        pass


def check_environment() -> bool:
    ok = True
    print("环境自检")
    print("-" * 58)
    print(f"Python      : {sys.version.split()[0]}")

    try:
        import playwright  # noqa: F401
        print("Playwright  : 已安装")
    except ImportError:
        print("Playwright  : 缺失（pip install playwright）")
        ok = False

    try:
        import websockets  # noqa: F401
        print("websockets  : 已安装（WebSocket 直连模式需要）")
    except ImportError:
        print("websockets  : 缺失（仅影响直连模式，网页模式不受影响）")

    from playwright.sync_api import sync_playwright

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                channel=suda_broker.BROWSER_CHANNEL, headless=True
            )
            page = browser.new_page()
            page.set_content("<title>ok</title>")
            assert page.title() == "ok"
            browser.close()
        print(f"浏览器      : {suda_broker.BROWSER_CHANNEL} 可用")
    except Exception as exc:
        print(f"浏览器      : {suda_broker.BROWSER_CHANNEL} 不可用（{exc}）")
        ok = False

    print("-" * 58)
    print("自检通过" if ok else "存在问题，请先修复上面标记为缺失的项目")
    return ok


def wait_for(url: str, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with _LOCAL_OPENER.open(url, timeout=1.5) as response:
                if response.status < 500:
                    return True
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.6)
    return False


def service_state(port: int = 8765, timeout: float = 5.0) -> dict | None:
    """读接口的 /health；服务没起来或返回异常则返回 None。

    ★ 超时从 2 秒放宽到 5 秒（2026-10-03）：`/health` 内部要读 broker，
    而 broker 是单线程的，服务页面请求时要排队。原来的 2 秒**没有余量**，
    于是「broker 忙」被误判成「接口无响应」→ 连续 3 次 → 把一个完全健康的
    服务杀掉（实测 11:56:16 就发生过一次，正好腰斩了用户在途的任务）。
    """
    try:
        with _LOCAL_OPENER.open(
            f"http://127.0.0.1:{port}/health", timeout=timeout
        ) as response:
            if response.status != 200:
                return None
            return json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError, urllib.error.URLError):
        return None


def service_ok(port: int = 8765) -> tuple[bool, str]:
    """健康 = 接口在 + 登录代理也在。

    ★★ 2026-10-03 修正：「broker 这一秒没读到」**不等于**「服务该重启」★★
    broker 单线程，正在服务一个页面请求（实测 13~20 秒）或正在重载页面时，
    `/token` 读不到 —— 但这恰恰说明**它正在干活**，此时重启等于把用户的在途任务腰斩。
    所以判据改成：**这一秒读到** 或 **最近 60 秒内读到过**，都算健康。
    只有「连续 60 秒完全读不到」才判定登录代理真的没了。
    （`broker_recently_ok` 由 suda_api 侧记录，见 `_remember_broker`。）
    """
    state = service_state(port)
    if not state:
        return False, "接口无响应"
    if state.get("broker_online"):
        return True, "正常"
    if state.get("broker_recently_ok"):
        # 忙 ≠ 死：明确说出来，别在日志里留下含糊的「未就绪」
        return True, "正常（登录代理忙）"
    return False, "登录代理未就绪"


def port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """端口有没有人在监听。

    ★ 2026-10-06 实测补：用来识别「孤儿服务占端口」——
    强杀 supervisor（`taskkill /F`）时它的 child 会变成孤儿、继续占着端口。
    此时新 supervisor 探测孤儿：它一忙 `/health` 就超时 → 判「接口无响应」→
    盲目拉起新实例 → 绑定失败秒退 → 无限循环。
    拉起前先问一句「端口是不是有人占着」，能直接掐断这个循环。
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(1.0)
        return probe.connect_ex((host, port)) == 0


def port_owner_pid(port: int) -> int | None:
    """谁在 LISTEN 这个端口（找不到返回 None）。

    ★ 注意：中文 Windows 的 netstat 输出是 GBK，必须显式 decode("gbk")，
    否则 UnicodeDecodeError 会让 stdout 变成 None —— 静默失效，不报错但功能全丢
    （本仓库在 wvpn_guard.py 上踩过同一个坑）。
    """
    try:
        raw = subprocess.run(
            ["netstat", "-ano"], capture_output=True, timeout=15
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    text = raw.decode("gbk", errors="ignore")
    for line in text.splitlines():
        parts = line.split()
        # 形如：TCP  127.0.0.1:8765  0.0.0.0:0  LISTENING  12345
        if len(parts) >= 5 and parts[1].endswith(f":{port}") and parts[3] == "LISTENING":
            try:
                return int(parts[4])
            except ValueError:
                continue
    return None


def supervise(host: str, port: int, interval: float) -> None:
    """常驻守护：把服务作为子进程托管，挂了就重新拉起。"""
    # ★★★ 单次探测失败**不许**重启 ★★★
    # 为什么（2026-10-03 实测）：探测超时只有 2 秒，本机偶发一次
    # `ConnectionAbortedError`（launcher.log 09:23:32 就有一条）就足以让探测失败。
    # 原来的逻辑「alive and not ok → 立刻 terminate」于是把一个**完全健康**的服务杀掉：
    # 浏览器被一起关掉，重新拉起 + 重新认证要 30 秒以上，期间所有请求全废。
    # 现在改成「连续失败 FAIL_THRESHOLD 次」才动手，单次抖动只记一行日志。
    fail_threshold = int(os.environ.get("SUDA_DEEPSEEK_FAIL_THRESHOLD", "3"))
    # ★★★ 启动宽限期（2026-10-06 实测补）★★★
    # 冷启动要 60~90 秒（起浏览器 + 恢复登录态），而探测间隔只有 15 秒。
    # 不加宽限期的话，「刚拉起、还没就绪」会被当成「服务挂了」，
    # 连续 fail_threshold 次（3×15=45 秒）就把子进程 terminate 掉 ——
    # 陷入「拉起 → 45 秒后误杀 → 再拉起」的死循环。
    # （supervisor.log 21:32:23 / 21:33:40 连续两次拉起就是这个原因；
    #   表现为此刻发请求报 WinError 10061，看着像服务挂了，其实是正在重启。）
    # 宽限期内探测失败只记日志、不累计。
    startup_grace = float(os.environ.get("SUDA_DEEPSEEK_STARTUP_GRACE", "180"))
    # 单例锁：拿不到就说明已经有一个守护在跑，直接退出，避免重复开浏览器
    guard = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        guard.bind(("127.0.0.1", SUPERVISE_LOCK_PORT))
        guard.listen(1)
    except OSError:
        log_line(f"端口 {SUPERVISE_LOCK_PORT} 已被占用，已有守护进程在运行，本次退出。")
        return

    log_line(f"守护已启动（每 {interval:.0f} 秒检查一次）：http://127.0.0.1:{port}/health")
    child: subprocess.Popen | None = None
    child_started_at: float | None = None  # 子进程拉起时刻，用于算启动宽限期
    orphan_waits = 0  # 连续「端口被占但接口无响应」的次数（见下方拉起分支）
    # 最多容忍几次「端口被占但没响应」才动手杀占用者 —— 别无限等下去，
    # 否则遇到**僵死**（进程还在、端口还占着、但接口不应答）就永远恢复不了。
    orphan_max_wait = int(os.environ.get("SUDA_DEEPSEEK_ORPHAN_MAX_WAIT", "4"))
    fails = 0
    log_handle = open(LOG_PATH, "a", encoding="utf-8", errors="replace")

    try:
        while True:
            alive = child is not None and child.poll() is None
            ok, reason = service_ok(port)

            if alive and ok:
                fails = 0
                child_started_at = None  # 已度过启动期，之后失败要正常计数
                orphan_waits = 0
                time.sleep(interval)
                continue

            if alive and not ok:
                # ★ 启动宽限期内不计数：子进程可能正在起浏览器 / 恢复登录态。
                if (
                    child_started_at is not None
                    and time.monotonic() - child_started_at < startup_grace
                ):
                    log_line(
                        f"子进程启动中（{time.monotonic() - child_started_at:.0f}s"
                        f"/{startup_grace:.0f}s），{reason}，暂不计数。"
                    )
                    time.sleep(interval)
                    continue
                fails += 1
                if fails < fail_threshold:
                    log_line(
                        f"探测失败（{reason}）第 {fails}/{fail_threshold} 次，先观察不重启。"
                    )
                    time.sleep(interval)
                    continue
                log_line(f"连续 {fails} 次探测失败（{reason}），重启子进程。")
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=10)
                child = None
                child_started_at = None
                fails = 0
                continue

            if not alive and ok:
                # 服务是别处拉起来的（例如手动 start.cmd），不需要我们插手
                fails = 0
                time.sleep(interval)
                continue

            # ★ 拉起前先探端口占用（2026-10-06 实测补）：被占却无响应 = 孤儿服务在忙。
            #   盲目拉起只会绑定失败秒退，陷入「拉起→冲突→退出→再拉起」的无限循环。
            if port_in_use(port):
                orphan_waits += 1
                if orphan_waits < orphan_max_wait:
                    log_line(
                        f"端口 {port} 已被占用但接口无响应（{reason}），"
                        f"疑似孤儿服务在忙，第 {orphan_waits}/{orphan_max_wait} 次，本轮不拉起。"
                    )
                    time.sleep(interval)
                    continue
                # 等够了还是这样 —— 多半是僵死进程占着端口，杀掉它再拉起。
                log_line(
                    f"端口 {port} 被占且连续 {orphan_waits} 次无响应，"
                    "判定为僵死，杀掉占用者后拉起。"
                )
                owner = port_owner_pid(port)
                if owner:
                    try:
                        subprocess.run(
                            ["taskkill", "/PID", str(owner), "/F"],
                            capture_output=True,
                            timeout=15,
                        )
                        log_line(f"  已结束占用进程 {owner}。")
                    except (OSError, subprocess.SubprocessError) as exc:
                        log_line(f"  结束占用进程失败：{exc}")
                orphan_waits = 0
                time.sleep(3)
            else:
                orphan_waits = 0

            log_line(f"服务未运行（{reason}），正在拉起...")
            try:
                child = subprocess.Popen(
                    [sys.executable, os.path.join(HERE, "launcher.py"),
                     "--host", host, "--port", str(port)],
                    cwd=HERE,
                    stdout=log_handle,
                    stderr=subprocess.STDOUT,
                    # ★ 用 child_env() 而不是 {**os.environ}：必须清掉 *_PROXY，
                    #   否则开机自启（继承用户级 HTTP_PROXY）时本机 broker 调用会失败。
                    env=child_env(),
                )
                child_started_at = time.monotonic()  # 启动宽限期从这个时刻算起
            except OSError as exc:
                log_line(f"拉起失败：{exc}")
                child = None
                child_started_at = None
            fails = 0
            time.sleep(interval)
    except KeyboardInterrupt:
        log_line("守护已退出。")
    finally:
        if child is not None and child.poll() is None:
            child.terminate()
        log_handle.close()
        guard.close()


def print_guide() -> None:
    print("=" * 62)
    print(" 苏州大学 DeepSeek → WorkBuddy 接口")
    print("=" * 62)
    print()
    print(" 1. 请在随后打开的浏览器窗口中完成苏大统一身份认证")
    print("    （首次可能需要输入验证码；看到“认证已就绪”即可）")
    print()
    print(" 2. 在 WorkBuddy 里添加自定义模型：")
    print("    提供商        ：自定义 / Custom")
    print("    接口地址      ：http://127.0.0.1:8765/v1/chat/completions")
    print("    API KEY       ：suda-local")
    print("    模型名称      ：suda-deepseek")
    print("    流式输出      ：开启")
    print("    工具调用      ：开启（Agent 能力；请求带 tools 时自动启用）")
    print()
    print(" 3. 健康检查：http://127.0.0.1:8765/health")
    print()
    print(" 保持本窗口与浏览器窗口运行；按 Ctrl+C 退出")
    print("=" * 62)
    print(flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="苏州大学 DeepSeek 启动器")
    parser.add_argument("--check", action="store_true", help="只做环境自检")
    parser.add_argument("--api-only", action="store_true", help="只启动接口，不拉起浏览器")
    parser.add_argument("--supervise", action="store_true",
                        help="常驻守护：服务挂了自动拉起（开机自启使用）")
    parser.add_argument("--interval", type=float, default=DEFAULT_INTERVAL,
                        help=f"守护检查间隔（秒），默认 {DEFAULT_INTERVAL:.0f}")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    if args.check:
        sys.exit(0 if check_environment() else 1)

    if args.supervise:
        supervise(args.host, args.port, args.interval)
        return

    print_guide()

    if not args.api_only:
        threading.Thread(target=suda_broker.main, daemon=True).start()
        if wait_for(f"http://127.0.0.1:{suda_broker.PORT}/status", timeout=25):
            print("登录代理已就绪：http://127.0.0.1:8766", flush=True)
        else:
            print("登录代理启动较慢，稍后会自动就绪，接口已可访问。", flush=True)

    # ★ 必须用 `suda_api.APIServer`，不能直接用裸的 `ThreadingHTTPServer`。
    #
    # 实测踩到（2026-10-01）：给 `APIServer` 加了「客户端断开不打 traceback」的
    # 处理，重启后 traceback 照样出现、`client_aborts` 恒为 0 —— 因为**实际运行
    # 走的是这里**，而这里用的是基类。改了 A、跑的是 B，白改一场。
    # 两个入口（这里的 `--supervise` 与 `suda_api.py` 的 `main`）必须都用 APIServer；
    # `test_log_and_abort.py::test_all_entrypoints_use_apiserver` 会挡住这个回归。
    server = suda_api.APIServer((args.host, args.port), suda_api.APIHandler)
    print(f"接口已启动：http://{args.host}:{args.port}/v1/chat/completions", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已退出。", flush=True)
    finally:
        server.server_close()



if __name__ == "__main__":
    main()
