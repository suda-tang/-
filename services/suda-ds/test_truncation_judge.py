# -*- coding: utf-8 -*-
"""回归测试：`looks_truncated` 不能把**完整内容**误判成「被截断的回答」。

背景（2026-10-05 页面模式受控实验实测）：
`looks_truncated()` 的语义判据是「≥30 字且以汉字/字母结尾」。这条判据对**散文**
有效，但会误伤两类完整内容：

  1) 完整的工具调用 —— 以 `COMMAND_END` 的字母 `D` 结尾；
  2) 以代码/结果标识收尾的短回答 —— 例如 `…CONC-1-OK`（以字母 `K` 结尾）。

误判的代价**不只是慢**：页面模式下 8/8 条续写记录全是误判，其中一次
`tool-trace.log 16:39:04` 的 `added_chars=143`，把工具调用和另一段完整回答
**拼在了一起**，直接污染了工具调用本身：

    head(126) = "TOOL: PowerShell COMMAND_BEGIN python .../c4/fib.py COMMAND_END"
    tail(142) = "文件已创建。接下来运行脚本：\\n\\nTOOL: PowerShell COMMAND_BEGIN ... COMMAND_END"
    → merge 后工具调用出现两次

本文件锁住三件事：
  1) 完整的工具调用 / 代码标识收尾的完整回答 → **不判截断**；
  2) 真正的截断（含「半截的工具调用」）→ **照样判出来**（不能为修 bug 把判据改瞎）；
  3) 端到端：`chat_via_page` 抓到完整工具调用时**不发出续写轮**；
     并用「倒退 mutation」证明这两条豁免真的在起作用，不是摆设。

跑法（suda_broker 依赖 playwright，必须用 3.12）：
    C:\\Users\\mail\\AppData\\Local\\Programs\\Python\\Python312\\python.exe test_truncation_judge.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import suda_broker as B  # noqa: E402

# ── 真 trace 原文（tool-trace.log 2026-10-05 16:31–16:43，字段 `head`）─────
TOOL_CALL_PWSH_SHORT = (
    "TOOL: PowerShell COMMAND_BEGIN Set-Content -Path "
    "'C:/Users/mail/.workbuddy/suda-deepseek/cli-sandbox/run-1005-162855/c5/s1/out.txt' "
    "-Value 'CONC-1-OK' COMMAND_END"
)  # 162 字，以 D 结尾
TOOL_CALL_PWSH_LONG = (
    "TOOL: PowerShell COMMAND_BEGIN $lines = Get-Content "
    "'C:/Users/mail/.workbuddy/suda-deepseek/cli-sandbox/run-1005-163019/c3/data.txt'; "
    "$count = ($lines | Measure-Object -Line).Lines; $sum = ($lines | "
    "ForEach-Object { [int]$_ }) | Measure-Object -Sum; \"lines=$count sum=$($sum.Sum)\" "
    "COMMAND_END"
)  # 493 字
TOOL_CALL_WITH_PROSE = (
    "文件已创建。接下来运行脚本：\n\n"
    "TOOL: PowerShell COMMAND_BEGIN python "
    "C:/Users/mail/.workbuddy/suda-deepseek/cli-sandbox/run-1005-163019/c4/fib.py COMMAND_END"
)  # 142 字
TOOL_CALL_BARE = (
    "TOOL: PowerShell COMMAND_BEGIN python "
    "C:/Users/mail/.workbuddy/suda-deepseek/cli-sandbox/run-1005-163019/c4/fib.py COMMAND_END"
)  # 126 字
SHORT_RESULT_ANSWER = "文件 out.txt 已创建并写入内容 CONC-1-OK。读取结果如下：\n\nCONC-1-OK"  # 48 字，以 K 结尾

# 上游截断的两种真实形态（见 `looks_truncated` 文档字符串）
TRUNCATED_COLON = "以下是一些常见解决方案和诊断思路：\n\n**使用"
TRUNCATED_CJK = "将手机调至静音或飞行模式，放在视线之外。\n每天列出最重要的三件事"

# ★ 半截的工具调用：有 COMMAND_BEGIN 但没有收尾的 COMMAND_END（真 trace 同形态，
#   493 字那条的截断版）—— 必须仍然判截断，否则会交付半条命令给用户执行。
TOOL_CALL_CUT_MID_COMMAND = (
    "TOOL: PowerShell COMMAND_BEGIN $lines = Get-Content "
    "'C:/Users/mail/.workbuddy/suda-deepseek/cli-sandbox/run-1005-163019/c3/data.txt'; "
    "$count = ($lines | Measure-Object -Line).Lines; $sum = ($lines | F"
)


# ── 1. 完整形态：不许判截断 ─────────────────────────────────────────
def test_complete_tool_calls_are_not_truncated():
    """★ 核心用例：trace 里 4 条完整工具调用，以前全部被误判成截断。"""
    for text in (TOOL_CALL_PWSH_SHORT, TOOL_CALL_PWSH_LONG,
                 TOOL_CALL_WITH_PROSE, TOOL_CALL_BARE):
        assert B.looks_like_complete_tool_call(text) is True, f"漏判完整工具调用：{text[:60]!r}"
        assert B.looks_truncated(text) is False, f"完整工具调用被判截断：{text[:60]!r}"


def test_short_result_answer_is_not_truncated():
    """★ 以代码标识 `CONC-1-OK` 收尾的 48 字完整回答（trace 里出现 3 次）。"""
    assert B.ends_with_code_token(SHORT_RESULT_ANSWER) is True
    assert B.looks_truncated(SHORT_RESULT_ANSWER) is False


def test_balanced_json_tool_call_is_not_truncated():
    """JSON 形态的工具调用（花括号配对、以 `}` 结尾）本来就不该判截断，别改坏。"""
    text = '{"tool_call":{"name":"Read","arguments":{"file_path":"README.md"}}}'
    assert B.looks_truncated(text) is False
    text2 = 'TOOL: Read\n{"tool_call":{"name":"Read","arguments":{"file_path":"README.md"}}}'
    assert B.looks_truncated(text2) is False


# ── 2. 真截断：照样判出来（不能为了修 bug 把判据改瞎）────────────────
def test_real_truncation_still_caught():
    assert B.looks_truncated(TRUNCATED_COLON) is True, "未闭合的 `**` 必须判截断"
    assert B.looks_truncated(TRUNCATED_CJK) is True, "停在汉字上的散文必须判截断"


def test_half_tool_call_is_still_truncated():
    """★ 对照：`COMMAND_BEGIN` 之后被切断（没有 COMMAND_END）仍是截断。

    这条是「豁免不能开太大」的守门员 —— 半条 PowerShell 命令直接交给用户执行
    比慢一轮危险得多。
    """
    assert B.looks_like_complete_tool_call(TOOL_CALL_CUT_MID_COMMAND) is False
    assert B.looks_truncated(TOOL_CALL_CUT_MID_COMMAND) is True


def test_truncated_tool_call_json_is_still_truncated():
    """★ 对照：工具调用写了一半（JSON 花括号不配对）仍是截断。"""
    text = 'TOOL: Write COMMAND_BEGIN {"file_path": "x.py", "content": "a, b = 1'
    assert B.looks_truncated(text) is True


def test_dangling_list_number_is_still_truncated():
    """★ 对照：`3.` 这种半截编号不能被「代码标识豁免」放过。"""
    text = "排查顺序如下：\n1. 先看网络\n2. 再看代理\n3."
    assert B.ends_with_code_token(text) is False, "半截编号 `3.` 不该被当成代码标识"
    assert B.looks_truncated(text) is True


def test_lowercase_word_tail_is_not_exempted():
    """★ 对照：纯小写词收尾（`详见 out.txt` 之类）保守起见不豁免。

    宁可多跑一轮补写（延迟），也不要放过一条可能真被截断的散文。
    """
    text = "本次运行的全部日志已经保存在工作目录下的临时文件里，具体位置详见 out.txt"
    assert B.ends_with_code_token(text) is False
    assert B.looks_truncated(text) is True


# ── 3. 端到端：完整工具调用不该触发续写轮 ────────────────────────────
def _stub_page_turn(script):
    """把 `page_turn` 换成按脚本依次返回文本的桩，返回 (调用记录, 还原函数)。"""
    calls = []

    def fake(page, messages, on_delta=None, timeout=None):
        calls.append(messages)
        text = script[min(len(calls) - 1, len(script) - 1)]
        return {"data": {"chat": {"choices": [{"message": {"text": text}}]}}}

    original = B.page_turn
    B.page_turn = fake
    return calls, lambda: setattr(B, "page_turn", original)


def _run_chat_via_page():
    try:
        result = B.chat_via_page(None, [{"role": "user", "content": "读一下 out.txt"}])
    except B.NoAnswerError as exc:
        return "error", exc
    return "answer", result["data"]["chat"]["choices"][0]["message"]["text"]


def test_chat_via_page_does_not_continue_complete_tool_call():
    """★ 核心用例：第一轮就是完整工具调用 → 只跑一轮，不续写、不拼接。

    这正是 `16:39:04` 那次污染的路径：以前会续写一轮，把两段内容拼在一起。
    """
    calls, restore = _stub_page_turn([TOOL_CALL_BARE, TOOL_CALL_WITH_PROSE])
    try:
        kind, value = _run_chat_via_page()
    finally:
        restore()
    assert kind == "answer", f"完整工具调用应当直接交付，实际：{value!r}"
    assert value == TOOL_CALL_BARE
    assert len(calls) == 1, "完整工具调用不该触发续写轮（那正是污染的路径）"


def test_guard_actually_blocks_tool_call_regression():
    """★ 守卫有效性：把两条豁免倒退成恒 False → 污染必然复现。

    复现的正是 `16:39:04` 的现场：工具调用被拼接成两遍（added_chars=143）。
    如果倒退后仍然拿不到污染，说明上面那些用例根本挡不住回归，等于没写。
    """
    orig_tool = B.looks_like_complete_tool_call
    orig_code = B.ends_with_code_token
    B.looks_like_complete_tool_call = lambda text: False
    B.ends_with_code_token = lambda text: False
    try:
        calls, restore = _stub_page_turn([TOOL_CALL_BARE, TOOL_CALL_WITH_PROSE])
        try:
            kind, value = _run_chat_via_page()
        finally:
            restore()
    finally:
        B.looks_like_complete_tool_call = orig_tool
        B.ends_with_code_token = orig_code

    assert kind == "answer", "倒退后本该复现拼接，却仍然报错 —— 用例挡不住回归"
    # 复现的正是 `16:39:04`(attempt 1) + `16:39:15`(attempt 2, head_chars=269) 那条链：
    # 第一次续写把两段拼起来（126 → 269 字），第二次补写拿回同一段 → delta=0 才停。
    assert len(calls) == 3, f"倒退后应当触发两轮续写（污染的产生路径），实际 {len(calls)} 次"
    assert value.count("TOOL: PowerShell") == 2, f"倒退后工具调用应被拼成两遍，实际：{value!r}"
    assert value == TOOL_CALL_BARE + "\n" + TOOL_CALL_WITH_PROSE
    assert len(value) == 269, f"污染后的长度应当复现 trace 里的 269 字，实际 {len(value)}"


def test_guard_actually_blocks_short_answer_regression():
    """★ 守卫有效性（第二类）：倒退「代码标识」豁免 → 48 字完整回答会被续写。"""
    orig_code = B.ends_with_code_token
    B.ends_with_code_token = lambda text: False
    try:
        calls, restore = _stub_page_turn([SHORT_RESULT_ANSWER, SHORT_RESULT_ANSWER])
        try:
            kind, value = _run_chat_via_page()
        finally:
            restore()
    finally:
        B.ends_with_code_token = orig_code

    assert len(calls) == 2, "倒退后应当触发一次续写（误判路径）"


if __name__ == "__main__":
    names = sorted(k for k in list(globals()) if k.startswith("test_"))
    failed = 0
    for name in names:
        try:
            globals()[name]()
            print(f"PASS {name}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {name}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"ERROR {name}: {exc!r}")
    print(f"\n{len(names) - failed}/{len(names)} passed")
    sys.exit(1 if failed else 0)
