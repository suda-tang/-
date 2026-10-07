# -*- coding: utf-8 -*-
"""回归测试：`tool_phase` 在**没有任何 strict 判据命中**时，不许崩。

## 现场（2026-10-03 22:00:01，本机实测抓到）

```
[suda-api] 处理请求失败：cannot access local variable 'direct' where it is not
           associated with a value
[suda-api] "POST /v1/chat/completions HTTP/1.1" 500 -
```

`tool_phase` 里 `direct = reuse_decision_text(...)` 那一行**多缩进了一级**，
落在 `if strict_reason:` 里面，而下面的 `if direct:` 在外面 ——
于是只要 `strict_reason` 为空就会 `UnboundLocalError` → 整个请求 **500**。

触发它的模型回答是一句平铺直叙的答复：
「根据搜索结果，目前未能直接获取到…建议您尝试更精确的搜索…」——
任何 strict 判据（unfinished / transcript / echo / dump / file-task / file-missing）
都没命中，直接踩中未绑定变量。

## 为什么长期没被发现（又一次「测试没覆盖 → 一直绿着」）

* `cli-e2e.sh` 的纯文本用例**不带工具** → `tools_enabled` 为假 → 压根不进 `tool_phase`；
* 带工具的用例基本都会产出工具调用、或命中某条 strict 判据 → 正好绕开这条路径。

## 本测试钉住什么

1. **没有 strict 判据命中**时，`tool_phase` 必须正常返回（不抛异常）；
2. 返回值语义正确：`(None, 模型原话, False)` —— 原话要能被复用成最终答复；
3. 阳性对照：真正会命中 strict 的场景仍然照常触发（判据没被我改坏）。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import suda_api  # noqa: E402

PASS = 0
FAIL = 0


def ok(msg: str) -> None:
    global PASS
    PASS += 1
    print(f"PASS  {msg}")


def bad(msg: str) -> None:
    global FAIL
    FAIL += 1
    print(f"FAIL  {msg}")


TOOLS = [
    {"type": "function", "function": {
        "name": n, "description": f"{n} 工具",
        "parameters": {"type": "object", "properties": {}},
    }}
    for n in ("WebSearch", "Read", "Write", "PowerShell")
]

# 一句「看起来正常」的直接回答 —— 刻意不碰任何 strict 判据
PLAIN = "\u6839\u636e\u7ed3\u679c\uff0c\u8fd9\u4e2a\u6570\u662f 482\u3002"

MESSAGES = [
    {"role": "system", "content": "你是本地助手"},
    {"role": "user", "content": "17*23+91 \u7b49\u4e8e\u591a\u5c11\uff1f"},
]


def with_stub(answer: str, fn):
    original = suda_api.model_once
    try:
        suda_api.model_once = lambda prompt, model, reset_once=None: answer  # noqa: ARG005
        return fn()
    finally:
        suda_api.model_once = original


def main() -> int:
    # ── [1] ★ 核心：没有 strict 判据命中时不许崩 ────────────────────────
    print("[1] 无 strict 判据命中时不许崩")
    try:
        result = with_stub(PLAIN, lambda: suda_api.tool_phase(MESSAGES, TOOLS, None, "m"))
    except UnboundLocalError as exc:
        bad(f"★ 又踩中未绑定变量：{exc}")
        result = None
    except Exception as exc:  # noqa: BLE001
        bad(f"抛了别的异常 {type(exc).__name__}: {exc}")
        result = None
    else:
        ok("tool_phase 正常返回（没有 UnboundLocalError）")

    # ── [2] 返回值语义 ──────────────────────────────────────────────────
    print("\n[2] 返回值语义")
    if result is None:
        bad("拿不到返回值，跳过语义检查")
    else:
        call, direct, guard = result
        if call is None:
            ok("没有工具调用（模型直接回答，符合预期）")
        else:
            bad(f"不该有工具调用，实际 {call}")
        if direct and "482" in direct:
            ok(f"模型原话被复用为最终答复：{direct!r}")
        else:
            bad(f"direct 丢了（应为模型原话）：{direct!r}")
        if guard is False:
            ok("guard=False（不需要兜底清理）")
        else:
            bad(f"guard 应为 False，实际 {guard}")

    # ── [3] 阳性对照：真该命中 strict 的仍然命中 ────────────────────────
    print("\n[3] 阳性对照：strict 判据没被改坏")
    unfinished = "\u597d\u7684\uff0c\u6211\u4e0b\u4e00\u6b65\u5c06\u53bb\u8bfb\u53d6\u90a3\u4e2a\u6587\u4ef6\u3002"

    def run_unfinished():
        # 首发给「说下一步」的话；strict 重试给一个可解析的工具调用
        calls = {"n": 0}

        def fake(prompt, model, reset_once=None):  # noqa: ARG001
            calls["n"] += 1
            if calls["n"] == 1:
                return unfinished
            return '{"tool_call":{"name":"Read","arguments":{"file_path":"C:/a.txt"}}}'

        original = suda_api.model_once
        try:
            suda_api.model_once = fake
            return suda_api.tool_phase(MESSAGES, TOOLS, None, "m")
        finally:
            suda_api.model_once = original

    try:
        call, direct, guard = run_unfinished()
    except Exception as exc:  # noqa: BLE001
        bad(f"阳性对照抛异常 {type(exc).__name__}: {exc}")
    else:
        if call and call.get("name") == "Read":
            ok(f"「说下一步」仍被拦住并重试出工具调用：{call.get('name')}")
        else:
            bad(f"阳性对照失败：没拦住「说下一步」→ call={call}")

    print(f"\n结果：PASS={PASS}  FAIL={FAIL}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
