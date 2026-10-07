#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一句话回答：**现在连不上，是我们这边坏了，还是苏大那边坏了？**

为什么需要它
------------
2026-10-03 凌晨，CodeBuddy CLI 出现「静默秒退」：0 输出、rc=0、不产生任何日志、
不向 8765 发请求。我当时按「CLI 运行时问题」排查，逐个试了 node 版本、cwd、
V8 编译缓存、product.json、local_storage 缓存、内存……**40+ 次工具调用全打空**。

真因是：`ds.suda.edu.cn`（218.4.189.28）那台机器 TCP 都连不上，CLI 等上游超时后
异常退出。**正确做法是第一件事就跑本脚本**，它 20 秒内就能把责任分给「上游」或「我们」。

核心手法：**拿同网段相邻 IP 做对照**
  - `www.suda.edu.cn`  → 218.4.189.20  （对照组，正常应通）
  - `ds.suda.edu.cn`   → 218.4.189.28  （被测对象）
两者在同一 /24 网段、IP 只差 8。所以：
  - 对照通 + 对象不通  → **目标主机/服务的问题**（挂了、维护、仅校园网可达）
  - 对照也不通        → 本机网络/DNS/出口路由的问题
  - 两个都通          → 往上查我们的服务（launcher.log、/health）

用法
----
    python diag-upstream.py

退出码：0 = 上游 OK；2 = 上游不可达（不是我们的问题）；3 = 本机网络有问题
"""
from __future__ import annotations

import json
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request

# 被测对象与对照组：同网段相邻 IP，这一点是判据的关键
TARGET = "https://ds.suda.edu.cn/"
CONTROL = "https://www.suda.edu.cn/"
# 更强的对照：公网
CONTROL2 = "https://www.baidu.com/"

LOCAL_HEALTH = "http://127.0.0.1:8765/health"

# 本机挂着系统代理，直连必须绕开，否则会把「服务是好的」误判成「连不上」
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def probe(url: str, timeout: float = 12.0) -> tuple[str, float, str]:
    """返回 (状态, 耗时秒, 说明)。状态是 OK / HTTP<code> / FAIL。"""
    t0 = time.time()
    try:
        with _OPENER.open(url, timeout=timeout) as resp:
            return f"HTTP{resp.status}", time.time() - t0, ""
    except urllib.error.HTTPError as e:
        # 有 HTTP 响应就算「通」，4xx/5xx 也是服务活着
        return f"HTTP{e.code}", time.time() - t0, ""
    except Exception as e:  # noqa: BLE001
        return "FAIL", time.time() - t0, f"{type(e).__name__}: {e}"


def tcp_probe(host: str, port: int = 443, timeout: float = 6.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def local_health() -> dict | None:
    try:
        with _OPENER.open(LOCAL_HEALTH, timeout=8) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001
        return None


def main() -> int:
    print("=" * 62)
    print(" 上游可达性诊断：是我们坏了，还是苏大那边坏了？")
    print("=" * 62)

    rows: list[tuple[str, str, float]] = []
    for label, url in (("被测 ds.suda.edu.cn", TARGET),
                      ("对照 www.suda.edu.cn", CONTROL),
                      ("对照 www.baidu.com", CONTROL2)):
        st, dt, note = probe(url)
        rows.append((label, st, dt))
        flag = "✅" if st != "FAIL" else "❌"
        print(f"  {flag} {label:<24} {st:<10} {dt:6.2f}s  {note}")

    target_ok = rows[0][1] != "FAIL"
    control_ok = rows[1][1] != "FAIL"
    inet_ok = rows[2][1] != "FAIL"

    # TCP 层再确认一次（HTTP 层可能有缓存/CDN 干扰）
    print("\n TCP 直连（绕过一切 HTTP 层干扰）")
    for host in ("218.4.189.20", "218.4.189.28"):
        ok = tcp_probe(host)
        who = "www(对照)" if host.endswith(".20") else "ds(被测)"
        print(f"  {'✅' if ok else '❌'} {host}:443  [{who}]  {'通' if ok else '不通'}")

    print("\n 本地服务")
    h = local_health()
    if h is None:
        print("  ❌ 8765 /health 无响应（服务没起来）")
    else:
        print(f"  ✅ status={h.get('status')} page_ready={h.get('page_ready')} "
              f"logged_in={h.get('logged_in')} ws_degraded={h.get('ws_degraded')}")

    print("\n" + "=" * 62)
    if not inet_ok:
        print(" 结论：公网都不通 → **本机网络/DNS 有问题**，先修网络。")
        return 3
    if not target_ok and control_ok:
        print(" 结论：**苏大那台服务不可达**（同网段对照能通，被测不通）。")
        print("       不是我们的代码问题。可能原因：服务挂了 / 维护 / 仅校园网可达。")
        print("       请在校园网或 VPN 内重试；若已在校园网内，只能等对方恢复。")
        return 2
    if not target_ok and not control_ok:
        print(" 结论：苏大整片网段都不通 → 更像是**本机出口/路由**问题，")
        print("       或苏大整体维护。检查 VPN / 网络，或稍后再试。")
        return 3

    # 目标通了 → 责任在我们这一侧，继续给线索
    print(" 结论：上游可达 ✅ —— 问题在我们这一侧，继续往下查：")
    if h is None:
        print("       · 8765 服务没起 → 跑 launcher.py --supervise")
    else:
        if not h.get("page_ready"):
            print("       · page_ready=false → 页面卡住，试 "
                  "curl -X POST http://127.0.0.1:8766/reload")
        if h.get("ws_degraded"):
            print("       · ws_degraded=true → 最近一次走了页面降级，看 /health 的 transport 明细")
        if h.get("status") == "ok" and h.get("page_ready"):
            print("       · 服务健康、页面就绪 → 上游能答，可以跑 bash cli-e2e.sh 了")
    print("       细节看 launcher.log 与 requests.log。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
