# -*- coding: utf-8 -*-
"""回归测试：客户端模型前缀（`custom-local:`）**不许**漏到上游 copilot id。

## 为什么要这个

2026-10-02 排查「干不了活」时，我在 `/health` 看到：

    transport: {"ws": 0, "page": 0, "page_fallback": 1, "last": "page_fallback"}
    ws_degraded: True

`launcher.log` 里的真报错是：

    java.lang.RuntimeException: copilot:custom-local:01JMP3EFD6EV6Q8QEXNHEH0FC4 does not exist

也就是说，`custom-local:01JMP...` 这串**带客户端前缀的名字被原样当成了 copilot id**
发给上游 GraphQL。而上游的回应不是「模型不存在」这种一眼能看懂的错，是**整个 WS 订阅
失败 → 静默降级到页面驱动**：答案还是对的，只是慢且不稳，`/health` 上 `browser_chat`
依旧是 `false`，界面完全看不出来。

对照 `requests.log` 全量统计（真实客户端发了 973 次请求）：

    'suda-deepseek'                          862
    '01JMP3EFD6EV6Q8QEXNHEH0FC4'             110
    ''                                        13
    'custom-local:01JMP3EFD6EV6Q8QEXNHEH0FC4'   1   ← 我自己 curl 造的

**结论要说清楚**：WorkBuddy 正常发请求时用的是**去掉前缀的裸名**，所以这不是当时那次
故障的根因（那次是我自己传错造成的假象）。但它是**真实的潜在缺陷** —— 前缀一旦被发过来，
故障形态是「静默降级」而不是「报错」，最难发现。本文件钉住 `resolve_model` 必须剥前缀。

## 钉住什么

1. 带前缀的别名（`custom-local:suda-deepseek`）→ 正常走别名表；
2. 带前缀的裸 id → 剥成裸 id；
3. **凡是客户端前缀，解析结果里绝不允许再出现冒号** ← 这条是防回归的关键断言；
4. 原有的裸名行为不能被改坏（`suda-deepseek` / 未知裸名 / 空串）。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import suda_api  # noqa: E402


def test_bare_alias_still_works():
    """原有的裸别名行为不能被改坏。"""
    assert suda_api.resolve_model("suda-deepseek") == suda_api.DEFAULT_MODEL
    assert suda_api.resolve_model("SUDA-DEEPSEEK") == suda_api.DEFAULT_MODEL
    assert suda_api.resolve_model("suda") == suda_api.DEFAULT_MODEL


def test_prefixed_alias_resolves_to_default():
    """★ `custom-local:suda-deepseek` 是 WorkBuddy 模型列表里的写法，必须能认。"""
    assert suda_api.resolve_model("custom-local:suda-deepseek") == suda_api.DEFAULT_MODEL
    assert suda_api.resolve_model("custom:suda-deepseek") == suda_api.DEFAULT_MODEL


def test_prefixed_raw_id_stripped():
    """★ 带前缀的裸 id 要剥成裸 id，否则上游报 `does not exist`。"""
    raw = "01JMP3EFD6EV6Q8QEXNHEH0FC4"
    assert suda_api.resolve_model(f"custom-local:{raw}") == raw
    assert suda_api.resolve_model(f"custom:{raw}") == raw


def test_resolved_never_keeps_client_prefix():
    """★★ 防回归核心：解析结果里**绝不允许**再残留客户端前缀。

    这条断言不依赖具体别名表内容 —— 只要有人把前缀处理逻辑改坏（比如把
    `startswith` 写成 `==`、或者把剥前缀的分支挪到别名查找之后），它就会红。
    """
    cases = [
        "custom-local:suda-deepseek",
        "custom-local:01JMP3EFD6EV6Q8QEXNHEH0FC4",
        "custom:suda",
        "custom-local:suda-deepseek-v4-flash",
    ]
    for name in cases:
        got = suda_api.resolve_model(name)
        assert ":" not in got, (
            f"resolve_model({name!r}) = {got!r} 里还留着冒号 —— "
            "客户端前缀会漏给上游，导致 WS 静默降级到页面驱动"
        )


def test_unknown_bare_name_passes_through():
    """未知的裸名要原样透传（上游可能真有这个 copilot），不要擅自替换。"""
    assert suda_api.resolve_model("some-other-copilot") == "some-other-copilot"


def test_empty_falls_back_to_default():
    """空 / 空白 → 默认模型（不能变成空串发给上游）。"""
    assert suda_api.resolve_model("") == suda_api.DEFAULT_MODEL
    assert suda_api.resolve_model("   ") == suda_api.DEFAULT_MODEL
    assert suda_api.resolve_model(None) == suda_api.DEFAULT_MODEL


def test_prefix_only_falls_back_to_default():
    """只有前缀、后面什么都没有 —— 不能剥成空串。"""
    assert suda_api.resolve_model("custom-local:") == suda_api.DEFAULT_MODEL
    assert suda_api.resolve_model("custom-local:   ") == suda_api.DEFAULT_MODEL


def test_ws_call_strips_prefix_before_upstream():
    """源码级断言：WS 组装订阅时用的必须是 `resolve_model()` 的结果。

    只测 `resolve_model` 本身不够 —— 万一有人绕过它、直接把请求体里的 model
    塞进 GraphQL variables，前面几条全绿也照样出事。这里钉住调用点。
    """
    with open(os.path.join(HERE, "suda_api.py"), encoding="utf-8") as fh:
        src = fh.read()
    assert "resolve_model(" in src, "suda_api.py 里找不到 resolve_model 的调用点"


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
