# -*- coding: utf-8 -*-
"""回归测试：严格模式的**第三发 `pick`**（最后一搏）必须把工具清单摊开。

## 为什么要第三发（2026-10-03，坑 20）

现场（20:57:10，客户端报 `Error Code: 10000`）三发全废：

| 发次 | 风格 | 模型回答 | parsed |
|---|---|---|---|
| 1 | （首发） | 「…[已调用工具] WebSearch({...})」← 转写成正文 | null |
| 2 | `json` | 「好的，这个任务需要访问多个高校官网…我将访问中央音乐学院…」← 写计划 | null |
| 3 | `text` | 「抱歉，我无法执行这个请求…这超出了合理的工作边界」← **拒答** | null |

前两发的失败形态（转写体）已由 `parse_tool_call` 兜底解决；
第三发专门对付「**连试都不试**」—— 拒答、划边界、写计划。

做法：把客户端本次真实提供的工具**逐个列出来**，并明确
**「没有『不选』这个选项」**，同时要求「任务大就先做第一步」。

## 本测试钉住什么

1. `pick` 风格下提示词必须列出工具清单、且包含「没有『不选』这个选项」；
2. 必须明确**禁止**拒答 / 自我介绍 / 描述「我将要调用」；
3. 必须要求「任务大就先做第一步」（否则模型还是会去写整篇计划）；
4. **只列出客户端真实提供的工具** —— 列出清单外的工具会诱导模型去调它，
   然后拿到「未知工具」再编造（本项目已有 `note_unoffered_tool` 的教训）。
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
    for n in ("WebSearch", "WebFetch", "Read", "Grep", "Write", "PowerShell")
]

MESSAGES = [
    {"role": "system", "content": "你是本地助手"},
    {"role": "user", "content": "帮我查一下国内 AI 音乐方向的博士"},
]


def main() -> int:
    prompt = suda_api.build_tool_decision_prompt(
        MESSAGES, TOOLS, None, strict=True, strict_style="pick",
        strict_reason="unfinished",
    )

    # ── [1] 必须列出工具清单 ────────────────────────────────────────────
    print("[1] 工具清单必须摊开")
    listed = [t["function"]["name"] for t in TOOLS]
    missing = [n for n in listed if n not in prompt]
    if not missing:
        ok(f"清单里 {len(listed)} 个工具全部列出：{', '.join(listed)}")
    else:
        bad(f"提示词里漏了这些工具：{missing}")

    # ── [2] 必须堵死「不选」这条路 ──────────────────────────────────────
    print("\n[2] 必须明确「没有不选这个选项」")
    if "没有「不选」这个选项" in prompt:
        ok("明确写了「没有『不选』这个选项」")
    else:
        bad("没有堵死「不选」—— 模型仍会拒答/划边界")

    # ── [3] 必须禁止拒答 / 自我介绍 / 描述式调用 ────────────────────────
    print("\n[3] 必须点名禁止几种收尾")
    checks = [
        ("我无法执行", "禁止拒答（「我无法执行」）"),
        ("超出工作边界", "禁止划边界（「超出工作边界」）"),
        ("自我介绍", "禁止自我介绍（防崩回上游身份）"),
        ("描述", "禁止描述式调用（「我将要调用…」）"),
        # ★ 2026-10-03 补（坑 23）：实测 22:20:07 模型被逼急时丢了个占位命令
        #   `Write-Output "开始查询"` —— 形式上是工具调用，实际什么都没干。
        ("占位命令", "禁止占位命令（`echo`/`Write-Output` 只打印一行字那种）"),
    ]
    for needle, note in checks:
        if needle in prompt:
            ok(note)
        else:
            bad(f"没写：{note}")

    # ── [4] 必须要求「先做第一步」 ──────────────────────────────────────
    print("\n[4] 必须要求先做第一步")
    if "先做" in prompt and "第一步" in prompt:
        ok("要求「任务大就先做第一步」（而不是写整篇计划）")
    else:
        bad("没要求先做第一步 —— 模型还会去写计划")

    # ── [5] 阴性对照：非 pick 风格不许出现这段话 ────────────────────────
    print("\n[5] 阴性对照：别的风格不许混入")
    plain = suda_api.build_tool_decision_prompt(MESSAGES, TOOLS, None)
    if "没有「不选」这个选项" not in plain:
        ok("首发（非 strict）里没有这段 —— 没把「必须调工具」强加给纯问答")
    else:
        bad("首发里就出现了「没有不选这个选项」—— 会逼纯问答也去调工具")

    jsonp = suda_api.build_tool_decision_prompt(
        MESSAGES, TOOLS, None, strict=True, strict_style="json",
        strict_reason="unfinished",
    )
    if "没有「不选」这个选项" not in jsonp:
        ok("json 风格里没有这段（三种风格互不串味）")
    else:
        bad("json 风格里混入了 pick 的措辞")

    print(f"\n结果：PASS={PASS}  FAIL={FAIL}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
