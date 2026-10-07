# -*- coding: utf-8 -*-
"""回归测试：提示词里点名的工具，必须全部来自客户端**这次真实提供**的清单。

为什么要有这条（2026-10-01 09:0x，核对严格工具名校验对真实通路的影响时发现）：
`LS` 被**写死**在提示词里（「数文件…优先用 Glob / LS / Grep / Read」），
但 WorkBuddy 真实工具清单（28 个）里**没有 LS**。
等于代理自己诱导模型去调一个客户端执行不了的工具；
模型拿到「未知工具」后不重试、直接编造补齐 —— 第六种话术。
同一个毛病在 20 步长任务里也能看到：那个测试客户端只提供
list_dir / read_file / write_file 三个工具，提示词却让它
「优先用 Glob / LS / Grep / Read」「只有没有专用工具时才用 PowerShell」，
于是那一轮 trace 里 `tool-not-offered: PowerShell` 出现 **9 次**。

判据是**可核对的**（不看措辞、不看语气，只看集合包含关系）：
把提示词里出现的所有「疑似工具名」抓出来，逐个核对是否在 `allowed` 里。
候选集 = KNOWN_TOOLS ∪ 真实抓到的所有工具名，所以「未来又写死一个名字」也会被抓到。

不依赖 playwright，3.10 / 3.12 都能跑：
    python test_prompt_tool_names.py
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import suda_api as S  # noqa: E402

SEEN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools-seen.json")


def real_sets() -> list[tuple[str, set[str]]]:
    """从 tools-seen.json 还原真实工具清单（键格式：model|个数|名/名/…|hash）。"""
    raw = json.load(open(SEEN, encoding="utf-8"))
    out: list[tuple[str, set[str]]] = []
    for key in raw:
        parts = key.split("|")
        if len(parts) < 3:
            continue
        names = {n for n in parts[2].split("/") if n}
        if names:
            out.append((key, names))
    return out


REAL = real_sets()
ALL_REAL_NAMES: set[str] = set()
for _key, _names in REAL:
    ALL_REAL_NAMES |= _names

# 候选集必须比 KNOWN_TOOLS 大：KNOWN_TOOLS 只有 14 个，抓不出
# 「写死了一个不在这 14 个里的名字」这种情况。
CANDIDATES = set(S.KNOWN_TOOLS) | ALL_REAL_NAMES

THREE_TOOL_CLIENT = {"list_dir", "read_file", "write_file"}


def fake_tools(names: set[str]) -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": f"{name} 的说明",
                "parameters": {
                    "type": "object",
                    "properties": {"command": {"type": "string"}},
                    "required": ["command"],
                },
            },
        }
        for name in sorted(names)
    ]


def msgs(last_role: str = "user", last_text: str = "把目录里的文件列出来") -> list[dict]:
    base = [
        {"role": "system", "content": "你是助手"},
        {"role": "user", "content": "把目录里的文件列出来"},
        {"role": "assistant", "content": '{"tool_call":{"name":"x","arguments":{}}}'},
    ]
    if last_role == "tool":
        base.append({"role": "tool", "content": last_text})
    return base


def named_in(prompt: str, allowed: set[str]) -> list[str]:
    """提示词里出现、但不在 allowed 里的工具名（可核对，不依赖措辞）。"""
    return [
        name
        for name in sorted(CANDIDATES - allowed)
        if re.search(rf"\b{re.escape(name)}\b", prompt)
    ]


def test_no_unoffered_tool_named_in_prompt() -> None:
    """**核心用例**：真实清单下，提示词不许点名任何一个没提供的工具。"""
    assert REAL, "tools-seen.json 里没读到任何真实工具清单"
    for key, allowed in REAL:
        prompt = S.build_tool_decision_prompt(msgs(), fake_tools(allowed), "auto")
        offenders = named_in(prompt, allowed)
        assert not offenders, f"{key}: 提示词点名了客户端没提供的工具 {offenders}"


def test_three_tool_client_gets_no_shell_or_unix_tool_names() -> None:
    """20 步长任务用的就是这套 3 工具客户端 —— 它最容易踩这个坑。"""
    prompt = S.build_tool_decision_prompt(msgs(), fake_tools(THREE_TOOL_CLIENT), "auto")
    offenders = named_in(prompt, THREE_TOOL_CLIENT)
    assert not offenders, f"3 工具客户端下提示词点名了 {offenders}"
    # 特别盯住当初真出事的那个：PowerShell 与它的块格式
    assert "PowerShell" not in prompt
    assert "Bash" not in prompt
    assert "COMMAND_BEGIN" not in prompt, "没有 shell 工具时不该教块格式"


def test_failed_tool_result_hint_also_respects_allowed() -> None:
    """报错重试提示里原本写死 `Grep / Glob / LS`，同样必须按清单取。"""
    for key, allowed in REAL:
        prompt = S.build_tool_decision_prompt(
            msgs(last_role="tool", last_text="所在位置 行:1 字符:1 ParseError"),
            fake_tools(allowed),
            "auto",
        )
        offenders = named_in(prompt, allowed)
        assert not offenders, f"{key}: 报错提示里点名了 {offenders}"
        assert "严重提醒" in prompt, "报错重试提示没触发，用例失去意义"


def test_real_workbuddy_set_still_names_preferred_tools() -> None:
    """别改过头：真实 WorkBuddy 清单下，该提的专用工具必须还在。"""
    picked = [item for item in REAL if "PowerShell" in item[1] and "Read" in item[1]]
    assert picked, "没找到含 PowerShell+Read 的真实清单"
    key, allowed = picked[0]
    prompt = S.build_tool_decision_prompt(msgs(), fake_tools(allowed), "auto")
    for name in ("PowerShell", "Read", "Glob", "Grep", "WebFetch"):
        assert name in allowed and name in prompt, f"{key}: 应提到 {name}"


def test_rule_numbering_is_contiguous() -> None:
    """规则条数会随工具集变化，编号必须连续 —— 断号会让模型以为漏读了规则。"""
    for allowed in (set(S.KNOWN_TOOLS) | {"Read", "Glob"}, THREE_TOOL_CLIENT):
        prompt = S.build_tool_decision_prompt(msgs(), fake_tools(allowed), "auto")
        head = prompt.split("[可用工具摘要]")[0]
        nums = [int(m) for m in re.findall(r"^(\d+)\. ", head, re.M)]
        assert nums == list(range(1, len(nums) + 1)), f"{sorted(allowed)} → 编号 {nums}"


def test_offered_among_picks_only_offered() -> None:
    assert S.offered_among({"Bash", "Read"}, "PowerShell", "Bash") == "Bash"
    assert S.offered_among({"Read"}, "PowerShell", "Bash") == ""
    assert S.offered_among(set(), "Read") == ""
    # 顺序按调用方给的候选顺序，不按集合顺序 —— 提示词里的措辞要稳定
    assert S.offered_among({"Grep", "Glob", "LS"}, "Glob", "LS", "Grep") == "Glob / LS / Grep"


def test_offered_tool_names_handles_junk() -> None:
    assert S.offered_tool_names(fake_tools({"Bash", "Read"})) == {"Bash", "Read"}
    assert S.offered_tool_names([]) == set()
    assert S.offered_tool_names(None) == set()
    assert S.offered_tool_names("不是列表") == set()
    assert S.offered_tool_names([None, 1, "x"]) == set()
    assert S.offered_tool_names([{"type": "function", "function": {}}]) == set()


def test_prompt_never_claims_a_tool_that_is_not_offered() -> None:
    """反向核对：提示词里每个「像工具名」的英文词，都要能在 allowed 里找到出处。

    这条和第一条互补 —— 第一条查「已知名字被写死」，
    这条查「出现了候选集之外的工具名」（例如未来加了新工具名却忘了同步）。
    """
    # 允许出现在提示词里的非工具词（格式关键字、示例命令、路径片段）
    benign = {
        "TOOL", "COMMAND_BEGIN", "COMMAND_END", "JSON", "isNewTopic", "title",
        "tool_call", "name", "arguments", "parameters", "ConvertTo", "Json",
        "Select", "Object", "Filter", "Path", "ChildItem", "Raw", "BOM", "UTF",
        "Get", "Markdown", "Users", "Windows",
    }
    for key, allowed in REAL:
        prompt = S.build_tool_decision_prompt(msgs(), fake_tools(allowed), "auto")
        head = prompt.split("[可用工具摘要]")[0]
        tokens = set(re.findall(r"\b[A-Z][A-Za-z_]{2,}\b", head))
        unknown = {t for t in tokens if t not in benign and t not in allowed}
        # 允许形如 XxxYyy 的驼峰词（示例命令片段），但工具名一定是单驼峰词
        unknown = {t for t in unknown if not re.fullmatch(r"[A-Z][a-z]+[A-Z][A-Za-z]+", t)}
        assert not unknown, f"{key}: 提示词里出现了来源不明的工具名 {sorted(unknown)}"


if __name__ == "__main__":
    failures = 0
    tests = sorted(k for k in list(globals()) if k.startswith("test_"))
    for name in tests:
        try:
            globals()[name]()
            print(f"PASS  {name}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL  {name}: {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} 通过")
    sys.exit(1 if failures else 0)
