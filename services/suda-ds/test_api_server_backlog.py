# -*- coding: utf-8 -*-
"""回归测试：API 服务器的 **accept backlog** 必须显式放大（不许吃默认的 5）。

## 背景（2026-10-03）

排查「守护偶发把健康服务判死」时，撞见一个**可确认的薄弱点**：

    class APIServer(ThreadingHTTPServer): ...

`socketserver.TCPServer.request_queue_size` 默认只有 **5**。而现实是：

* WorkBuddy 会**并发**发流式请求（实测一个会话 8 条）；
* 守护每 15 秒还要探测一次 `/health`；
* 突发时新连接会在 accept 队列里排队 —— 排到第 6 个就**连不上**（对端看到的是
  连接被拒/超时，而不是一个 5xx），这正是「为什么只有突发时出事、而平时 `/token`
  一直很快」的一种合理解释。

## ⚠ 诚实标注（很重要，别把这条读成「根因已找到」）

加大 backlog 是**加固**，**不是已证实的根因**。我两次尝试复现「`/health` 读满超时」
都被**阳性对照**拦下（`broker_busy` 0 次、`/token` 最慢 0.19s / 0.03s），
详见 README「坑 17」。这里钉住的只是「**这个值必须被显式设过、且足够大**」，
防止以后有人手滑把它删回去。

## 为什么断言是「>= 64」而不是「== 128」

值本身可以调；要守住的是**量级**：默认 5 太小，几十~上百才够扛住并发突发。
钉死具体数字反而会在合理调参时误报。
"""
import os
import socketserver
import sys
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import suda_api  # noqa: E402

# 放大后的合理下限。默认值 5 远低于此，改小到 5~几十 都会在这里被拦下。
MIN_BACKLOG = 64


# ── 类形状 ──────────────────────────────────────────────────────────────
def test_apiserver_is_threading_http_server():
    """服务端必须仍是线程化的 —— 否则一个慢请求就堵住所有人。"""
    assert issubclass(suda_api.APIServer, ThreadingHTTPServer), (
        "APIServer 不再是 ThreadingHTTPServer 子类：单线程 HTTP 服务会被一个"
        "长请求（比如页面兜底的十几秒）整条堵死"
    )


def test_apiserver_overrides_request_queue_size():
    """★ 关键守卫：必须在**自己类上**显式设过 `request_queue_size`。

    `getattr(cls, "request_queue_size")` 会沿继承链拿到默认的 5，
    所以这里断言的是「在 `cls.__dict__` 里」—— 证明是我们主动设的，
    而不是碰巧继承了某个大值。
    """
    own = suda_api.APIServer.__dict__.get("request_queue_size")
    assert own is not None, (
        "APIServer 没有在类上显式设置 request_queue_size —— 会退回 socketserver 的"
        "默认值 5。并发突发时新连接会在 accept 队列里排队，健康探测可能还没被 accept"
        "就超时了。"
    )


def test_backlog_is_large_enough():
    """★ 关键守卫：backlog 量级必须够大（默认 5 不行）。"""
    got = suda_api.APIServer.request_queue_size
    assert isinstance(got, int) and not isinstance(got, bool), \
        f"request_queue_size 必须是 int，现在是 {type(got).__name__}"
    assert got >= MIN_BACKLOG, (
        f"request_queue_size = {got}，小于下限 {MIN_BACKLOG}。"
        "WorkBuddy 会并发发流式请求 + 守护每 15s 探测，队列太浅会在突发时丢连接。"
    )


# ── 改动前对照（证明这个加固不是空洞的） ────────────────────────────────
def test_stdlib_default_is_tiny():
    """★ 阳性对照：标准库默认值确实很小 —— 证明「不显式设置」是有风险的。

    如果哪天标准库默认值变大了，这条会失败并提醒我们「加固的前提变了」。
    """
    default = socketserver.TCPServer.request_queue_size
    assert default < MIN_BACKLOG, (
        f"socketserver 默认 backlog = {default}，已不小于我们的下限 {MIN_BACKLOG}；"
        "加固的前提变了，请复核本测试与 README 坑 17"
    )


def test_fix_is_actually_a_change():
    """★ 改动前对照：加固后的值必须**大于**标准库默认值（否则等于没改）。"""
    default = socketserver.TCPServer.request_queue_size
    got = suda_api.APIServer.request_queue_size
    assert got > default, (
        f"APIServer.request_queue_size ({got}) 没有大于标准库默认值 ({default})，"
        "这个加固等于没做"
    )


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
