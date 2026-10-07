# -*- coding: utf-8 -*-
"""回归测试：页面长时间未就绪时，broker 必须自己重新加载。

背景：主循环原本只在 `page.is_closed()` 时重建页面。
网络中断（例如校园 VPN 掉线）后首次 `goto` 失败，页面就永远停在错误页上，
`page_ready` 一直 false，必须人工 `POST /reload` —— 「VPN 回来也不会自动好」。

现在用 `PageRetryTimer` 补自动重试。本测试锁住它的行为。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from suda_broker import PageRetryTimer  # noqa: E402

DELAY = 45.0


def test_first_tick_does_not_fire():
    """刚发现不就绪时只起表，不立刻重试（否则会疯狂刷页面）。"""
    t = PageRetryTimer(DELAY)
    assert t.due(False, now=1000.0) is False


def test_fires_after_delay():
    t = PageRetryTimer(DELAY)
    t.due(False, now=1000.0)
    assert t.due(False, now=1000.0 + DELAY - 1) is False, "还没到时间不该触发"
    assert t.due(False, now=1000.0 + DELAY) is True, "到点了必须触发"


def test_rearms_after_firing():
    """触发一次后要重新计时，不能每轮都刷。"""
    t = PageRetryTimer(DELAY)
    t.due(False, now=1000.0)
    assert t.due(False, now=1000.0 + DELAY) is True
    assert t.due(False, now=1000.0 + DELAY + 1) is False, "触发后应重新计时"
    assert t.due(False, now=1000.0 + DELAY * 2) is True


def test_ready_resets_timer():
    """一旦就绪就清零；之后再断，要重新等满一个周期。"""
    t = PageRetryTimer(DELAY)
    t.due(False, now=1000.0)
    assert t.due(True, now=1000.0 + DELAY - 1) is False
    # 刚重置过，所以这一轮只是重新起表
    assert t.due(False, now=1000.0 + DELAY) is False
    assert t.due(False, now=1000.0 + DELAY + DELAY) is True


def test_outage_then_recovery():
    """模拟：断网 3 分钟（每 5 秒探一次），恢复后立刻不再触发。"""
    t = PageRetryTimer(DELAY)
    now = 1000.0
    fires = []
    while now < 1000.0 + 180:
        if t.due(False, now=now):
            fires.append(round(now - 1000.0))
        now += 5
    assert fires, "断网 3 分钟至少应触发一次重试"
    # 45 秒周期、5 秒采样 → 触发点应落在 45 / 90 / 135 附近
    assert fires == [45, 90, 135], f"触发节奏不对: {fires}"
    assert t.due(True, now=now) is False, "恢复后不应再触发"


def test_delay_floor():
    """delay 过小会让页面被反复刷，兜底至少 1 秒。"""
    assert PageRetryTimer(0).delay >= 1.0
    assert PageRetryTimer(-5).delay >= 1.0


def test_default_delay_is_45():
    import suda_broker

    assert suda_broker.PAGE_RETRY_DELAY == 45.0


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
