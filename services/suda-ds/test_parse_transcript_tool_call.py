# -*- coding: utf-8 -*-
"""回归测试：模型把工具调用**转写**在正文里时，必须被提取成**真的**工具调用。

## ★★★ 现场（2026-10-03 20:57，唐老师第三次拿到同一个错）

    Error Code: 10000
    模型没有给出有效动作（只说做不到或下一步），请重试。

`tool-trace.log` 那次：

```
[20:56:59] decision  parsed=null
  「好的，我将开始执行这个多轮搜索任务，首先查找国内开设AI音乐相关博士点的学校。
     [已调用工具] WebSearch({"query": "国内 AI音乐 博士点 学校"})」
[20:57:04] decision-strict-json  parsed=null   ← 改去写长篇计划
[20:57:10] decision-strict-text  parsed=null   ← 「这超出了合理的工作边界」
[20:57:10] fallback-skipped                    ← 放弃 → 客户端报错
```

## 根因

模型**假装调了工具**：把调用**转写**在正文里（`[已调用工具] WebSearch({...})`），
却没有真的输出工具调用。而 `parse_tool_call()` 原来只认四种格式：

1. `TOOL: PowerShell|Bash COMMAND_BEGIN … COMMAND_END`
2. `TOOL: <name> <json>`
3. `{"tool_call":{…}}` 之类的 JSON
4. `"name": …` + `"command": …`

**转写体一种都不匹配** → `parsed=null` → 触发 strict 重试 → 模型改去写计划、
最后直接拒答 → 客户端判「没给有效动作」。

**注意：模型的意图是完全明确的**（就是要搜「国内 AI音乐 博士点 学校」），
是我们把它丢了，才把一次能救回来的请求变成了报错。

## 本测试钉住什么

1. 各种转写体（`[已调用工具] X({…})`、`调用 X({…})`、裸 `X({…})`）都要能提取；
2. **工具名必须在客户端本次提供的清单里** —— 模型转写一个客户端没有的工具，
   不许照单转发（转过去只会拿到报错、然后模型编造内容补洞）；
3. 参数必须是**合法 JSON 对象**，`X(foo)`、`X()` 这种不许算；
4. **不许误伤**：正常的纯文本回答（哪怕里面提到了工具名、或者带括号）
   **不能**被凭空变成工具调用 —— 否则「我打算用 WebSearch 查一下」也会被当成调用。
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
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string"},
            "file_path": {"type": "string"},
            "command": {"type": "string"},
        }},
    }}
    for n in ("WebSearch", "WebFetch", "Read", "Grep", "Glob", "Write", "PowerShell")
]


def main() -> int:
    fn = suda_api.parse_tool_call

    # ── [1] 转写体必须被提取成真的工具调用 ──────────────────────────────
    print("[1] 正文里的转写体必须被提取")
    # ★ 现场原文（一个字不改）
    field = (
        '\u597d\u7684\uff0c\u6211\u5c06\u5f00\u59cb\u6267\u884c\u8fd9\u4e2a\u591a\u8f6e\u641c\u7d22\u4efb\u52a1\uff0c'
        '\u9996\u5148\u67e5\u627e\u56fd\u5185\u5f00\u8bbeAI\u97f3\u4e50\u76f8\u5173\u535a\u58eb\u70b9\u7684\u5b66\u6821\u3002'
        '  [\u5df2\u8c03\u7528\u5de5\u5177] WebSearch({"query": "\u56fd\u5185 AI\u97f3\u4e50 \u535a\u58eb\u70b9 \u5b66\u6821"})'
    )
    should_parse = [
        (field, "WebSearch", "\u56fd\u5185 AI\u97f3\u4e50 \u535a\u58eb\u70b9 \u5b66\u6821", "★ 现场原文（AI音乐博士点）"),
        ('\u6211\u5148\u67e5\u4e00\u4e0b\uff1aWebSearch({"query": "\u82cf\u5dde\u5927\u5b66 \u5bfc\u5e08"})',
         "WebSearch", "\u82cf\u5dde\u5927\u5b66 \u5bfc\u5e08", "\u5192\u53f7\u540e\u8ddf\u8c03\u7528"),
        ('\u8c03\u7528 Read({"file_path": "C:/a.txt"}) \u6765\u770b\u770b',
         "Read", "C:/a.txt", "「调用 X({…})」"),
        ('\u4e0b\u4e00\u6b65 Grep({"pattern": "8765"})',
         "Grep", "8765", "「下一步 X({…})」"),
    ]
    for text, want_name, want_val, note in should_parse:
        got = fn(text, TOOLS)
        if not got:
            bad(f"没解析出来：{note}")
            continue
        name = got.get("name")
        args = got.get("arguments") or {}
        vals = " ".join(str(v) for v in args.values())
        if name == want_name and want_val in vals:
            ok(f"解析为 {name}({args})：{note}")
        else:
            bad(f"解析错了：期望 {want_name} 含 {want_val!r}，实际 {got}：{note}")

    # ── [2] 客户端没提供的工具，不许照单转发 ────────────────────────────
    print("\n[2] 客户端没提供的工具不许转发")
    off = ('[已调用工具] SuperTool({"query": "x"})')
    got = fn(off, TOOLS)
    if got is None:
        ok("清单外的工具（SuperTool）不被转发")
    else:
        bad(f"转发了客户端没有的工具：{got} —— 会让模型拿到报错然后编造")

    # ── [3] 参数不是合法 JSON 对象的不许算 ──────────────────────────────
    print("\n[3] 参数不合法的不许算")
    for text, note in (
        ('WebSearch(foo)', "非 JSON 参数"),
        ('WebSearch()', "空参数"),
        ('WebSearch("just a string")', "字符串而非对象"),
    ):
        got = fn(text, TOOLS)
        if got is None or not (got.get("arguments") or {}):
            ok(f"未误当成调用：{note}")
        else:
            bad(f"误当成调用：{note} → {got}")

    # ── [4] 阴性对照：纯文本回答不许被凭空变成工具调用 ──────────────────
    print("\n[4] 阴性对照：纯文本回答不许被凭空变成调用")
    should_not_parse = [
        ("\u6211\u6253\u7b97\u7528 WebSearch \u6765\u67e5\u4e00\u4e0b\u3002", "只提到工具名，没给参数"),
        ("1 1 2 3 5 8 13 21 34 55", "纯结果"),
        ("\u6587\u4ef6\u5df2\u5199\u5165\u6210\u529f\uff0c\u5185\u5bb9\u4e3a\uff1aCONC-2-OK", "成功回执"),
        ("\u62b1\u6b49\uff0c\u6211\u65e0\u6cd5\u6267\u884c\u8fd9\u4e2a\u8bf7\u6c42\u3002", "拒答"),
    ]
    for text, note in should_not_parse:
        got = fn(text, TOOLS)
        if got is None:
            ok(f"未凭空造调用：{note}")
        else:
            bad(f"凭空造出了调用：{note} → {got}")

    # ── [5] 原有格式不许退化 ────────────────────────────────────────────
    print("\n[5] 原有四种格式不许退化")
    old_forms = [
        ('{"tool_call":{"name":"Read","arguments":{"file_path":"C:/a.txt"}}}', "Read", "纯 JSON"),
        ('TOOL: PowerShell COMMAND_BEGIN Get-ChildItem COMMAND_END', "PowerShell", "命令块"),
    ]
    for text, want, note in old_forms:
        got = fn(text, TOOLS)
        if got and got.get("name") == want:
            ok(f"仍可解析：{note}")
        else:
            bad(f"原有格式退化：{note} → {got}")

    # ── [6] ★ 链路级：把模型输出打桩成现场原文，走完整的 decide_tool_call ──
    #    只测 parse_tool_call 不够 —— 万一上游链路压根不把原文交给它（或提前 return），
    #    那就是**死代码**，单元测试再绿也没用。这一段直接把 model_once 打桩，
    #    断言整条链路真的吐出了工具调用。
    print("\n[6] 链路级：打桩模型输出，走 decide_tool_call")
    original_once = suda_api.model_once
    try:
        suda_api.model_once = lambda prompt, model, reset_once=None: field  # noqa: ARG005
        call, raw = suda_api.decide_tool_call(
            [
                {"role": "system", "content": "你是本地助手"},
                {"role": "user", "content": "帮我查一下国内 AI 音乐方向的博士"},
                {"role": "assistant", "content": None, "tool_calls": [
                    {"id": "c1", "type": "function",
                     "function": {"name": "WebSearch",
                                  "arguments": '{"query":"AI 音乐 博士"}'}}]},
                {"role": "tool", "tool_call_id": "c1", "name": "WebSearch",
                 "content": "（上一轮搜索结果）"},
            ],
            TOOLS, None, "test-model",
        )
    except Exception as exc:  # noqa: BLE001
        bad(f"decide_tool_call 抛异常 {type(exc).__name__}: {exc}")
        call = None
    finally:
        suda_api.model_once = original_once

    if call and call.get("name") == "WebSearch":
        ok(f"★ 链路级：转写体被救成真调用 → {call.get('name')}({call.get('arguments')})")
    else:
        bad(f"链路级：转写体没被救回来 → {call}（说明修复没接进真实链路）")

    print(f"\n结果：PASS={PASS}  FAIL={FAIL}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
