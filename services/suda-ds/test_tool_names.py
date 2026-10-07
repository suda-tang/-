# -*- coding: utf-8 -*-
"""回归测试：只转发「客户端确实提供」的工具调用。

背景（2026-10-01 08:19，12 步任务复测第 1 次实测）：
工具清单里只有 read_file / write_file / list_dir，模型却两次调 `PowerShell` 去读 p10。
当时 `KNOWN_TOOLS` 白名单（Bash/PowerShell/Read/Write/… 这些 WorkBuddy 真实工具名）
把它放行了 → 转发给客户端 → 客户端执行不了、返回「未知工具」→
**模型不重试，而是把没读到的第 10 段编了出来**
（写成「苏州的秋天，就这样慢慢深了」，素材其实是「天平山的枫叶，红得像一团火」），
最终文件看着完整、内容是假的。

所以改成严格校验：`allowed`（客户端 tools 里的名字）说了算。
解析不出来就走 strict 重试，重试提示词里带着完整工具清单，模型有机会改用对的工具。

不依赖 playwright，3.10 / 3.12 都能跑：
    python test_tool_names.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import suda_api  # noqa: E402

# 本地回归测试：不许往生产 tool-trace.log 里写记录。
# `parse_tool_call` 解析失败时会调 `note_unoffered_tool` 记一条诊断，
# 而本文件有一半用例就是在测「解析失败」—— 每次跑都会往 tool-trace.log 里留记录，
# 和真实请求产生的记录混在一起，把「模型想调客户端没提供的工具」这个健康指标搅浑
# （实测：我一直盯着它报 0，实际日志里躺着 99 条，其中绝大多数是本地脚本写的）。
suda_api.TOOL_TRACE_ENABLED = False


def _tools(*names: str) -> list[dict]:
    return [
        {"type": "function", "function": {"name": n, "parameters": {}}}
        for n in names
    ]


def test_offered_tool_is_accepted():
    tools = _tools("read_file", "write_file", "list_dir")
    got = suda_api.parse_tool_call(
        '{"tool_call":{"name":"read_file","arguments":{"path":"a.txt"}}}', tools
    )
    assert got and got["name"] == "read_file", f"提供了的工具却被拒: {got}"

    # 纯文本块格式只对 shell 工具（PowerShell / Bash）成立
    got = suda_api.parse_tool_call(
        "TOOL: PowerShell COMMAND_BEGIN Get-Content -Path 'C:/x/a.txt' -Raw COMMAND_END",
        _tools("PowerShell"),
    )
    assert got and got["name"] == "PowerShell", f"shell 块没解析出来: {got}"
    assert got["arguments"].get("command"), f"命令没取到: {got}"


def test_malformed_block_for_non_shell_tool_is_not_parsed():
    """`TOOL: write_file COMMAND_BEGIN … COMMAND_END` 是**畸形**写法，解析不出来才对。

    实测（2026-10-01，12 步任务复测）模型反复这么写 ——
    它想调 read_file / write_file，却套了 shell 的块格式。
    这种必须**解析失败**，然后由 `looks_like_tool_attempt` 兜住、走 strict 重试；
    如果这里宽容地解析出来，就会把 `COMMAND_BEGIN …` 当成参数传给工具，更糟。
    """
    text = "TOOL: write_file COMMAND_BEGIN $content = \"第1段：…\" COMMAND_END"
    tools = _tools("read_file", "write_file")
    assert suda_api.parse_tool_call(text, tools) is None, "畸形写法不该解析成功"
    # 但必须被判据识别，否则会静默落到兜底分支
    assert suda_api.looks_like_tool_attempt(text), "畸形写法没被判据识别"


def test_unoffered_tool_is_rejected():
    """**核心用例**：客户端没提供的工具，一律不转发。"""
    tools = _tools("read_file", "write_file", "list_dir")

    # 纯文本 PowerShell 块 —— 实测里就是这一条把任务带偏的
    got = suda_api.parse_tool_call(
        "TOOL: PowerShell COMMAND_BEGIN Get-Content -Path 'C:/x/p10.txt' -Raw COMMAND_END",
        tools,
    )
    assert got is None, f"没提供的 PowerShell 被转发了: {got}"

    # JSON 形式、名字是 WorkBuddy 真实工具名但这次没提供
    got = suda_api.parse_tool_call(
        '{"tool_call":{"name":"Write","arguments":{"file_path":"a.txt","content":"x"}}}',
        tools,
    )
    assert got is None, f"没提供的 Write 被转发了: {got}"

    got = suda_api.parse_tool_call(
        '{"tool_call":{"name":"Bash","arguments":{"command":"ls"}}}', tools
    )
    assert got is None, f"没提供的 Bash 被转发了: {got}"


def test_case_insensitive_alignment():
    """大小写不一致要能对齐到请求里的规范名（网页模型常写成 read、Read）。"""
    tools = _tools("Read", "Write")
    got = suda_api.parse_tool_call(
        '{"tool_call":{"name":"read","arguments":{"file_path":"a.txt"}}}', tools
    )
    assert got and got["name"] == "Read", f"大小写没对齐: {got}"


def test_no_tools_means_no_tool_call():
    """客户端一个工具都没给 → 不许凭空产生工具调用。"""
    got = suda_api.parse_tool_call(
        '{"tool_call":{"name":"Read","arguments":{"file_path":"a.txt"}}}', []
    )
    assert got is None, f"没有工具清单却解析出了工具调用: {got}"


def test_unoffered_tool_note_is_harmless():
    """诊断函数不能抛异常（它会在解析失败的路径上被调用）。

    ⚠️ 顺带把 trace 写盘关掉：这是**本地回归用例**，不该往生产 tool-trace.log
    里留下 `tool-not-offered` 记录。实测每次跑都留 2 条，它们和真实请求产生的
    记录混在同一个文件里，把「模型想调客户端没提供的工具」这个健康指标搅浑了
    （我一直盯着它、报的是 0，实际日志里躺着 99 条）。
    """
    calls: list[tuple[str, dict]] = []
    original_trace = suda_api._trace_tool
    original_enabled = suda_api.TOOL_TRACE_ENABLED
    suda_api._trace_tool = lambda stage, payload: calls.append((stage, payload))
    suda_api.TOOL_TRACE_ENABLED = False
    try:
        log_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "tool-trace.log"
        )
        try:
            with open(log_path, encoding="utf-8", errors="replace") as handle:
                before = sum(1 for _ in handle)
        except OSError:
            before = 0

        suda_api.note_unoffered_tool("TOOL: PowerShell COMMAND_BEGIN dir COMMAND_END", {"read_file"})
        suda_api.note_unoffered_tool("TOOL: read_file {}", {"read_file"})
        suda_api.note_unoffered_tool("", set())
        suda_api.note_unoffered_tool("完全不是工具调用的中文", {"read_file"})

        try:
            with open(log_path, encoding="utf-8", errors="replace") as handle:
                after = sum(1 for _ in handle)
        except OSError:
            after = 0
    finally:
        suda_api._trace_tool = original_trace
        suda_api.TOOL_TRACE_ENABLED = original_enabled

    # ① 行为不变：只有「想调没提供的 PowerShell」这一条会记诊断
    assert [p.get("requested") for stage, p in calls if stage == "tool-not-offered"] == \
        ["PowerShell"], f"诊断记录不对: {calls}"
    # ② 关掉开关后，真实日志一个字都不许多
    assert after == before, f"本地用例污染了 tool-trace.log（{before} → {after} 行）"


if __name__ == "__main__":
    failures = 0
    for name in sorted(k for k in list(globals()) if k.startswith("test_")):
        try:
            globals()[name]()
            print(f"PASS  {name}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL  {name}: {exc}")
    total = len([k for k in list(globals()) if k.startswith("test_")])
    print(f"\n{total - failures}/{total} 通过")
    sys.exit(1 if failures else 0)
