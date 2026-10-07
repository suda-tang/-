# -*- coding: utf-8 -*-
"""回归测试：识别「消息提交了、页面也不忙、却迟迟没有回显」的静默失败。

背景（2026-10-01 06:36 实测）：
苏大页面能打开、输入框能用、`logged_in` 也是 true，但提问发出去之后
对话后端没有响应 —— 页面上永远不会追加本轮问答容器。
当时 broker 要干等到 `STALL_LIMIT=25` 秒才报
「苏大页面 25 秒内没有出现本轮问答容器」，用户拿到的就是那条 Error Report。

而正常请求的首次回显只要 **0.58 秒**（同一份 /trace 记录）。

现在用 `SilentFailureDetector` 在 6 秒就把这一类失败认出来，尽早交给
上层刷新页面重发（实测刷新后连续 3/3 成功）。本测试锁住它的判据。

跑法（suda_broker 依赖 playwright，必须用 3.12）：
    C:\\Users\\mail\\AppData\\Local\\Programs\\Python\\Python312\\python.exe test_silent_stall.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from suda_broker import SILENT_STALL_LIMIT, SilentFailureDetector  # noqa: E402

LIMIT = 6.0


def _due(elapsed, *, box_seen=False, pending="", blocked=False):
    return SilentFailureDetector(LIMIT).due(
        elapsed=elapsed, box_seen=box_seen, pending_text=pending, blocked=blocked
    )


def test_not_yet_due():
    """正常回显 0.58 秒，阈值内一律不下判断。"""
    assert _due(0.6) is False
    assert _due(5.9) is False


def test_boundary_is_inclusive_of_limit():
    """恰好等于阈值不算（`<=` 不触发），超过才算。"""
    assert _due(LIMIT) is False
    assert _due(LIMIT + 0.01) is True


def test_silent_failure_detected():
    """★ 核心用例：输入框已清空 + 页面不忙 + 超时无容器 = 静默失败。"""
    assert _due(6.5, pending="", blocked=False) is True


def test_pending_text_means_not_sent():
    """输入框里还留着内容 = 根本没提交出去，该走「重发」而不是整页刷新。"""
    assert _due(20.0, pending="请帮我查一下苏州大学的新闻", blocked=False) is False


def test_blank_pending_counts_as_empty():
    """输入框只剩空白字符，等同于已清空。"""
    assert _due(7.0, pending="   \n\t ", blocked=False) is True


def test_busy_page_is_not_a_silent_failure():
    """页面自己说还在忙（.denyInput 遮罩）→ 给它时间，别打断。"""
    assert _due(20.0, pending="", blocked=True) is False


def test_box_seen_short_circuits():
    """容器已经出现就不是失败，哪怕输入框状态再怪。"""
    assert _due(30.0, box_seen=True, pending="x", blocked=True) is False


def test_limit_floor():
    """阈值过小会让正常请求被误判，兜底至少 1 秒。"""
    assert SilentFailureDetector(0).limit >= 1.0
    assert SilentFailureDetector(-3).limit >= 1.0


def test_default_limit_is_6():
    """默认 6 秒：比正常回显（0.58s）慢约 10 倍，足够排除网络抖动。"""
    assert SILENT_STALL_LIMIT == 6.0


if __name__ == "__main__":
    names = sorted(k for k in list(globals()) if k.startswith("test_"))
    failures = 0
    for name in names:
        try:
            globals()[name]()
            print(f"PASS  {name}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL  {name}: {exc}")
    print(f"\n{len(names) - failures}/{len(names)} 通过")
    sys.exit(1 if failures else 0)
