# -*- coding: utf-8 -*-
"""回归测试：**「技能/工具不存在」这类报错必须被判成「工具失败」**。

## ★★★ 现场（2026-10-03 18:10，唐老师第二次说「实际效果很不好」）

客户端报：

    Error Code: 10000
    模型没有给出有效动作（只说做不到或下一步），请重试。

服务端 `tool-trace.log` 那一次的完整链路：

| 阶段 | 模型回答 | parsed |
|---|---|---|
| `decision` | 「我无法直接执行"挖导师"这个技能…请告诉我您具体需要查找哪位导师」 | null |
| `strict-trigger`(unfinished) → 重试 | 同上 | null |
| `decision-strict-json` | 「抱歉，我无法找到名为"挖导师"的技能…」 | null |
| `decision-strict-text` | 「您好！我是苏州大学AI智能助手…」 | null |
| `fallback-skipped` | 放弃 → 把纯文字交回客户端 | → 客户端报「没给有效动作」 |

而**触发这一串的**，是上一条工具结果：

    Error: Can not find skill: "挖导师". Also checked for slash command "/挖导师" but not found.

## 根因

`tool_result_looks_failed()` 对上面这段返回 **False**：

* `_TOOL_ERROR_MARKERS` 里没有 `can not find skill` / `no such tool` /
  `unknown skill`，**连最通用的 `Error:` 开头都没有**；
* `_EMPTY_RESULT_MARKERS` 里有 `not found`，但那条分支要求
  `len(text) < 40`，而现场这条是 ~95 字符 → 不命中。

于是 `build_tool_decision_prompt` 走到 **else 分支**：

    「注意：本轮对话末尾是「工具结果」，优先给出最终回答；
      只有确实还需要另一个工具时才继续调用。」

模型被明确告知「直接回答」→ 它回头问用户「你想查哪位导师」→ **零工具调用**
→ WorkBuddy 判「没给有效动作」。**提示词其实写对了，是判据漏了这一类错误。**

## 为什么我的 e2e 全绿却漏了这个

`cli-e2e.sh` 只测「写文件 / 算数 / 跑脚本」，**从来没测过「调用一个不存在的技能」**。
真实使用里这种「能力不存在」的失败很常见，测试里一次都没有。

## 本测试钉住什么

1. 「技能/工具不存在」的各种写法都要判成失败（含 `Error:` 开头这种最通用的形态）；
2. **正常成功的结果不许误判成失败**（否则会把「已成功」当成报错，逼模型瞎重试）；
3. 原有的报错识别不许退化。
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


# ★ 现场原文，一个字都不改
FIELD_CASE = (
    'Error: Can not find skill: "\u6316\u5bfc\u5e08". '
    'Also checked for slash command "/\u6316\u5bfc\u5e08" but not found.'
)


def main() -> int:
    fn = suda_api.tool_result_looks_failed

    # ── [1] 必须判成失败：「技能/工具不存在」的各种写法 ──────────────────
    print("[1] 「技能/工具不存在」必须判成失败")
    should_fail = [
        (FIELD_CASE, "★ 现场原文（挖导师）"),
        ('Error: Can not find skill: "foo".', "Skill 找不到"),
        ('Error: No such tool: "bar"', "未知工具"),
        ('Error: Tool "Baz" not found in tool list.', "工具不在清单里"),
        ('Error: Unknown skill "x".', "未知技能"),
        ('Error: Skill "y" does not exist.', "技能不存在"),
        ("Error: unknown tool 'z'", "小写 unknown tool"),
        ("Error: something went wrong", "★ 通用 Error: 开头"),
    ]
    for text, note in should_fail:
        if fn(text):
            ok(f"判为失败：{note}")
        else:
            bad(f"漏判（返回 False）：{note} —— {text[:60]!r}")

    # ── [2] 不许误判：正常的成功结果 ────────────────────────────────────
    print("\n[2] 正常成功结果不许误判成失败")
    should_pass = [
        ("1 1 2 3 5 8 13 21 34 55", "命令的正常输出"),
        ("lines=3 sum=21", "统计结果"),
        ("Successfully created and wrote to file: C:/a/b.txt", "写文件成功"),
        ("\u6587\u4ef6\u5df2\u5199\u5165\u6210\u529f\uff0c\u5185\u5bb9\u4e3a\uff1aCONC-2-OK", "中文成功回执"),
        ("C:/x/y.txt", "路径"),
        ("", "空字符串（空结果 = 失败，这条单独在 [3] 判）"),
    ]
    for text, note in should_pass[:-1]:
        if not fn(text):
            ok(f"未误判：{note}")
        else:
            bad(f"误判成失败：{note} —— {text[:60]!r}")

    # ── [3] 空结果仍然要算失败（原有行为不许退化） ───────────────────────
    print("\n[3] 原有判据不许退化")
    if fn(""):
        ok("空字符串仍判为失败")
    else:
        bad("空字符串不再判为失败 —— 原有行为退化了")
    if fn("C:\\Users\\x : \u65e0\u6cd5\u627e\u5230\u8def\u5f84"):
        ok("「无法找到路径」仍判为失败")
    else:
        bad("「无法找到路径」不再判为失败 —— 原有行为退化了")
    if fn("ParseError: xxx"):
        ok("ParseError 仍判为失败")
    else:
        bad("ParseError 不再判为失败 —— 原有行为退化了")

    # ── [4] 提示词必须走「能力不存在」分支，而不是「直接回答」分支 ──────
    #    这是真正决定模型行为的一环：判据改对了但提示词没跟上，等于没修。
    print("\n[4] 决策提示词的分支选择")
    tools = [
        {"type": "function", "function": {"name": n, "description": f"{n} 工具",
                                          "parameters": {"type": "object", "properties": {}}}}
        for n in ("Skill", "WebSearch", "WebFetch", "Read", "Grep", "Glob", "Write",
                  "PowerShell", "Bash")
    ]
    messages = [
        {"role": "user", "content": "帮我挖一下导师的信息"},
        {"role": "assistant", "content": None,
         "tool_calls": [{"id": "c1", "type": "function",
                         "function": {"name": "Skill",
                                      "arguments": '{"skill":"\u6316\u5bfc\u5e08"}'}}]},
        {"role": "tool", "tool_call_id": "c1", "name": "Skill", "content": FIELD_CASE},
    ]
    try:
        prompt = suda_api.build_tool_decision_prompt(messages, tools)
    except Exception as exc:  # noqa: BLE001
        bad(f"build_tool_decision_prompt 抛异常 {type(exc).__name__}: {exc}")
        print(f"\n结果：PASS={PASS}  FAIL={FAIL}")
        return 1

    if "这个技能/工具不存在" in prompt:
        ok("提示词命中「能力不存在」分支")
    else:
        bad("提示词**没有**命中「能力不存在」分支 —— 判据改了但提示词没跟上，等于没修")

    if "优先给出最终回答" in prompt:
        bad("提示词里仍有「优先给出最终回答」—— 那正是让模型回头问用户的元凶")
    else:
        ok("提示词里不再有「优先给出最终回答」（不会再把模型推去直接回答）")

    if "绝不能回头问用户" in prompt:
        ok("提示词明确禁止回头问用户（否则照样被判「没给有效动作」）")
    else:
        bad("提示词没有禁止回头问用户 —— 模型还会去问「你想查哪位导师」")

    if "WebSearch" in prompt:
        ok("提示词点名了可替代的真实工具（WebSearch 等）")
    else:
        bad("提示词没有给出可替代工具，模型不知道该换什么")

    # 阴性对照：工具结果**正常**时，不许走「能力不存在」分支
    ok_messages = [
        {"role": "user", "content": "读一下 a.txt"},
        {"role": "assistant", "content": None,
         "tool_calls": [{"id": "c1", "type": "function",
                         "function": {"name": "Read",
                                      "arguments": '{"file_path":"C:/a.txt"}'}}]},
        {"role": "tool", "tool_call_id": "c1", "name": "Read", "content": "SUDA-OK-2026"},
    ]
    try:
        ok_prompt = suda_api.build_tool_decision_prompt(ok_messages, tools)
    except Exception as exc:  # noqa: BLE001
        bad(f"阴性对照：build_tool_decision_prompt 抛异常 {type(exc).__name__}: {exc}")
    else:
        if "这个技能/工具不存在" not in ok_prompt:
            ok("阴性对照：结果正常时不走「能力不存在」分支（没放宽过头）")
        else:
            bad("阴性对照：结果正常也走「能力不存在」分支 —— 判据放宽过头了")

    print(f"\n结果：PASS={PASS}  FAIL={FAIL}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
