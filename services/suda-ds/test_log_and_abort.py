# -*- coding: utf-8 -*-
"""回归测试：服务端日志**必须带时间戳**，客户端断开**不许打 traceback**。

## 为什么要这两个

2026-10-01 排查一条「客户端发了、服务端没有」的请求时撞上两件事：

1. **`launcher.log` 没有时间戳** —— 里面有 9 处未捕获的 `ConnectionResetError`
   traceback，但**完全无法定位到具体时刻**，跟 `requests.log`（有时间）对不上，
   只能靠猜。排障日志没有时间戳，等于半个瞎。
2. **客户端断开打 16 行 traceback** —— 来源是 WorkBuddy 做 context compaction 时
   abort 在途请求（实测 13:33:35.694 发出、13:33:35.696 取消，2 毫秒）。
   这是**正常现象**，但 16 行 traceback 会淹没真故障，也没法数。

本文件钉住：时间戳存在且格式稳定；断开降成一行 + 计数；**真故障仍然照打**。
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import suda_api  # noqa: E402


# ── 日志时间戳 ──────────────────────────────────────────────────────────
def test_log_line_starts_with_timestamp():
    """★ 每行服务端日志必须以时间戳开头，否则排障时无法与 requests.log 对齐。"""
    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    try:
        suda_api.log("测试消息")
    finally:
        sys.stdout = old
    out = buf.getvalue().strip()
    assert "[suda-api] 测试消息" in out, f"日志正文丢了：{out!r}"
    assert re.match(r"^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] ", out), \
        f"日志必须以 [YYYY-MM-DD HH:MM:SS] 开头：{out!r}"


def test_ts_format_matches_requests_log():
    """时间戳格式要和 requests.log 的 `at` 字段**同构**，这样两边能直接对。

    requests.log 用的是 `time.strftime("%Y-%m-%d %H:%M:%S")`；
    如果这里用了别的格式（比如带毫秒或 ISO8601 的 T），
    「把两份日志按时间对齐」就还得写一层转换 —— 排障时最容易出错的地方。
    """
    stamp = suda_api._ts()
    assert re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", stamp), stamp
    # 和 requests.log 的写法逐字一致
    import time as _time
    assert stamp == _time.strftime("%Y-%m-%d %H:%M:%S")


# ── 客户端断开 ──────────────────────────────────────────────────────────
def _server_without_binding():
    """造一个没绑定端口的 APIServer 实例（只为调用 handle_error）。"""
    return suda_api.APIServer.__new__(suda_api.APIServer)


def test_client_abort_is_counted_and_not_a_traceback():
    """★ 客户端断开：计数 +1，且**不打 traceback**。"""
    server = _server_without_binding()
    before = suda_api._stats.get("client_aborts", 0)
    err, out = io.StringIO(), io.StringIO()
    old_err, old_out = sys.stderr, sys.stdout
    sys.stderr, sys.stdout = err, out
    try:
        try:
            raise ConnectionResetError("[WinError 10054] 远程主机强迫关闭了一个现有的连接。")
        except ConnectionResetError:
            server.handle_error(None, ("127.0.0.1", 12345))
    finally:
        sys.stderr, sys.stdout = old_err, old_out

    assert suda_api._stats.get("client_aborts", 0) == before + 1, "断开必须计数"
    assert "Traceback" not in err.getvalue(), f"不该打 traceback：{err.getvalue()[:200]}"
    assert "客户端断开连接" in out.getvalue(), f"应该留一行可读记录：{out.getvalue()!r}"


def test_broken_pipe_also_treated_as_client_abort():
    """BrokenPipeError 同类 —— 客户端读走一半就关了。"""
    server = _server_without_binding()
    before = suda_api._stats.get("client_aborts", 0)
    err = io.StringIO()
    old_err = sys.stderr
    sys.stderr = err
    try:
        try:
            raise BrokenPipeError("客户端提前关闭")
        except BrokenPipeError:
            server.handle_error(None, ("127.0.0.1", 1))
    finally:
        sys.stderr = old_err
    assert suda_api._stats.get("client_aborts", 0) == before + 1
    assert "Traceback" not in err.getvalue()


def test_connection_aborted_also_treated_as_client_abort():
    """★ `ConnectionAbortedError` 也是客户端断开 —— **它不是 ConnectionResetError 的子类**。

    实测踩到（2026-10-01 深夜）：日志里出现

        [suda-api] 处理请求失败：[WinError 10053] 你的主机中的软件中止了一个已建立的连接。
        [suda-api] "POST /v1/chat/completions HTTP/1.1" 500 -
        ---- 后面跟一整段 traceback ----

    Windows 上「客户端中途断开」报的是 `[WinError 10053]`，对应
    **`ConnectionAbortedError`**，而原先只捕了
    `(BrokenPipeError, ConnectionResetError)` —— 于是漏网：
    ①照样刷整段 traceback ②`client_aborts` 计数偏小（实测偏了 30+）。
    """
    server = _server_without_binding()
    before = suda_api._stats.get("client_aborts", 0)
    err, out = io.StringIO(), io.StringIO()
    old_err, old_out = sys.stderr, sys.stdout
    sys.stderr, sys.stdout = err, out
    try:
        try:
            raise ConnectionAbortedError(
                "[WinError 10053] 你的主机中的软件中止了一个已建立的连接。")
        except ConnectionAbortedError:
            server.handle_error(None, ("127.0.0.1", 12345))
    finally:
        sys.stderr, sys.stdout = old_err, old_out

    assert suda_api._stats.get("client_aborts", 0) == before + 1, \
        "WinError 10053 必须被算成客户端断开"
    assert "Traceback" not in err.getvalue(), \
        f"WinError 10053 不该打 traceback：{err.getvalue()[:200]}"
    assert "客户端断开连接" in out.getvalue(), out.getvalue()


def test_real_errors_still_produce_a_traceback():
    """★ 反过来：**真故障必须照打** —— 别把抑制做成掩盖。

    这是这个改动最容易做错的地方：一旦写成「所有异常都吞掉」，
    真故障就再也不会出现在日志里了，比原先更糟。
    """
    server = _server_without_binding()
    before = suda_api._stats.get("client_aborts", 0)
    err = io.StringIO()
    old_err = sys.stderr
    sys.stderr = err
    try:
        try:
            raise ValueError("这是一个真故障")
        except ValueError:
            server.handle_error(None, ("127.0.0.1", 1))
    finally:
        sys.stderr = old_err

    text = err.getvalue()
    assert "ValueError" in text and "这是一个真故障" in text, \
        f"真异常必须原样打出来：{text[:300]!r}"
    assert suda_api._stats.get("client_aborts", 0) == before, \
        "真异常不该被算成客户端断开"


def test_all_entrypoints_use_apiserver():
    """★ 两个启动入口都必须用 `APIServer`，不能直接用裸的 `ThreadingHTTPServer`。

    实测踩到（2026-10-01）：给 `APIServer` 加了「客户端断开不打 traceback」，
    重启后 traceback 照样出现、`client_aborts` 恒为 0 —— 因为**实际运行走的是
    `launcher.py --supervise`**，而那里用的是基类 `ThreadingHTTPServer`。
    改了 A、跑的是 B，白改一场，而且**差点带着它收工**。

    单测 `APIServer` 本身是过不了的 —— 它能证明类是对的，证明不了「跑的是它」。
    所以这里直接钉住源码：不许出现裸的实例化。
    """
    for name in ("suda_api.py", "launcher.py"):
        with open(os.path.join(HERE, name), encoding="utf-8") as handle:
            src = handle.read()
        assert "ThreadingHTTPServer((" not in src, (
            f"{name} 里出现了裸的 ThreadingHTTPServer 实例化 —— "
            f"APIServer 上的处理（断开抑制、client_aborts 计数）会全部失效"
        )
    with open(os.path.join(HERE, "launcher.py"), encoding="utf-8") as handle:
        assert "suda_api.APIServer((" in handle.read(), \
            "launcher.py 必须用 suda_api.APIServer 起服务（supervise 是实际运行入口）"


def test_capture_ws_never_touches_missing_headers():
    """★ `_capture_ws` 不许裸访问 `ws.headers` —— Playwright 的 WebSocket 没这个属性。

    实测（2026-10-01 深夜，launcher.log）：

        suda_broker.py line 1785, in _capture_ws
            for k, v in ws.headers.items()}})
        AttributeError: 'WebSocket' object has no attribute 'headers'
        [suda-api] 上游错误 502: Page.evaluate: 'WebSocket' object has no attribute 'headers'

    注意它是**在 `page.on("websocket") 的事件回调里**抛的，Playwright 会把它
    包装成 `Page.evaluate: ...` 一路冒到**主流程** → 直接 502。
    **最坏的一种：开了抓包调试开关（`SUDA_DEEPSEEK_CAPTURE_GRAPHQL=1`），
    反而把主流程搞崩。**

    这里做源码级断言（本文件跑在没装 playwright 的解释器上，import 不了 suda_broker）。
    """
    with open(os.path.join(HERE, "suda_broker.py"), encoding="utf-8") as handle:
        src = handle.read()
    assert "ws.headers" not in src, (
        "suda_broker.py 里又出现了裸的 `ws.headers` —— Playwright 的 WebSocket "
        "对象没有这个属性，会抛 AttributeError 并被包装成 Page.evaluate 错误 → 502"
    )
    assert 'getattr(ws, "headers"' in src, \
        "必须用 getattr(ws, \"headers\", None) 兜底，拿不到就只记 URL"


# ── 跑起来 ──────────────────────────────────────────────────────────────
def main() -> int:
    tests = [value for name, value in sorted(globals().items())
             if name.startswith("test_") and callable(value)]
    failed = 0
    for test in tests:
        try:
            test()
        except AssertionError as exc:
            failed += 1
            print(f"✗ {test.__name__}\n    {exc}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"✗ {test.__name__} 抛异常 {type(exc).__name__}: {exc}")
        else:
            print(f"✓ {test.__name__}")
    print(f"\n{len(tests) - failed}/{len(tests)} 通过")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
