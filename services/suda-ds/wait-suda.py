#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""守候 ds.suda.edu.cn 恢复，一通就自动让 broker 重新加载页面。

为什么需要它
------------
`ds.suda.edu.cn` 是校内业务主机（218.4.189.28），**只对校园网 / VPN 开放**；
`www.suda.edu.cn`（218.4.189.20）是门户站，对公网开放 —— 所以「别的苏大网站能开、
就它打不开」是正常现象，不是故障。

典型场景：VPN 掉了 → broker 里的页面加载失败 → `8766/health` 里
`page_ready: false`、`logged_in: false`。VPN 连回来之后页面不会自动恢复，
需要触发一次 reload。本脚本就是干这个的。

用法
----
    python wait-suda.py              # 最多守 30 分钟，每 20 秒探一次
    python wait-suda.py 60           # 最多守 60 分钟
"""
from __future__ import annotations

import json
import socket
import sys
import time
import urllib.request

HOST = "ds.suda.edu.cn"
BROKER = "http://127.0.0.1:8766"


def reachable(timeout: float = 6) -> bool:
    s = socket.socket()
    s.settimeout(timeout)
    try:
        s.connect((HOST, 443))
        return True
    except OSError:
        return False
    finally:
        s.close()


def reload_page() -> str:
    req = urllib.request.Request(BROKER + "/reload", method="POST")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=90) as resp:
            return resp.read().decode("utf-8", "ignore")[:300]
    except Exception as exc:  # noqa: BLE001
        return f"reload 失败: {exc}"


def health() -> dict:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(BROKER + "/health", timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8", "ignore"))
    except Exception:  # noqa: BLE001
        return {}


def main() -> int:
    minutes = float(sys.argv[1]) if len(sys.argv) > 1 else 30.0
    deadline = time.time() + minutes * 60

    print(f"守候 {HOST}:443（最多 {minutes:g} 分钟，每 20 秒一次）…")
    while time.time() < deadline:
        if reachable():
            print(f"[{time.strftime('%H:%M:%S')}] 网络已通，触发 broker 重新加载页面…")
            print("  ", reload_page())
            for _ in range(12):
                time.sleep(10)
                h = health()
                if h.get("page_ready"):
                    print(f"[{time.strftime('%H:%M:%S')}] ✅ page_ready=true，服务已恢复")
                    return 0
                print(f"   等待页面就绪… page_ready={h.get('page_ready')} "
                      f"logged_in={h.get('logged_in')}")
            print("页面仍未就绪，请检查浏览器窗口是否需要重新登录。")
            return 1
        print(f"[{time.strftime('%H:%M:%S')}] 仍不可达，继续等…")
        time.sleep(20)

    print("超时退出。请确认 VPN / 校园网是否已连接。")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
