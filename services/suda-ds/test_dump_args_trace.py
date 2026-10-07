# -*- coding: utf-8 -*-
"""回归测试：`dump-args`（参数里的编造）命中时，**判定依据必须写进 trace**。

为什么单独测这条：判定依据是「写入编号 vs 读到编号」，而读到编号只存在于
当时的 `messages` 里。如果 trace 只记被截断到 600 字符的原始参数，事后就再也算不出来。
实测踩过这个坑 —— 2026-10-01 09:20:35 真的一次命中（只读到 11 段却写了 18 段），
但第一版没记依据，回放时读到侧是空的，**分不清真阳性还是误杀**，
只能靠翻相邻记录手工还原。现在这条判据的依据必须自证。

做法：把 `decide_tool_call` 和 `_trace_tool` 都换成替身，
不碰网络、不碰页面，就能确定性地走完 `tool_phase` 的两条分支。

不依赖 playwright，3.10 / 3.12 都能跑：
    python test_dump_args_trace.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import suda_api as S  # noqa: E402


def _messages(read_count: int) -> list[dict]:
    """模拟「已经读了 read_count 个文件」的对话。"""
    return [
        {"role": "user", "content": f"依次读 p1..p{read_count}，再合并写入 merged.txt"},
        *[
            {"role": "tool", "tool_call_id": f"c{i}", "content": f"第{i}段：素材第 {i} 句。"}
            for i in range(1, read_count + 1)
        ],
    ]


def _write_call(top: int) -> dict:
    return {
        "name": "write_file",
        "arguments": {
            "path": "merged.txt",
            "content": "\n".join(f"第{i}段：苏州的第 {i} 种秋色。" for i in range(1, top + 1)),
        },
    }


class _Harness:
    """替换 `decide_tool_call` 与 `_trace_tool`，把 trace 收集到内存里。"""

    def __init__(self, sequence: list[dict]) -> None:
        self.sequence = list(sequence)
        self.traces: list[tuple[str, dict]] = []
        self.calls: list[dict] = []

    def __enter__(self) -> "_Harness":
        self._decide = S.decide_tool_call
        self._trace = S._trace_tool

        def fake_decide(messages, tools, tool_choice, model, **kwargs):
            self.calls.append(kwargs)
            return self.sequence.pop(0), ""

        S.decide_tool_call = fake_decide
        S._trace_tool = lambda stage, payload: self.traces.append((stage, payload))
        return self

    def __exit__(self, *exc) -> None:
        S.decide_tool_call = self._decide
        S._trace_tool = self._trace

    def stages(self) -> list[str]:
        return [stage for stage, _ in self.traces]

    def payload(self, stage: str) -> dict:
        for name, body in self.traces:
            if name == stage:
                return body
        raise AssertionError(f"没有 {stage} 记录，实际有 {self.stages()}")


TOOLS = [
    {"type": "function", "function": {"name": "read_file", "parameters": {}}},
    {"type": "function", "function": {"name": "write_file", "parameters": {}}},
]


def test_dump_args_hit_records_basis_and_retries() -> None:
    """命中 → trace 里必须带 written / read / exceeds，且重试结果被采纳。"""
    good = {"name": "read_file", "arguments": {"path": "p5.txt"}}
    with _Harness([_write_call(10), good]) as harness:
        tool_call, text, guard = S.tool_phase(
            _messages(4), TOOLS, "auto", "test-model"
        )

    assert tool_call is good, f"重试结果没被采纳: {tool_call}"
    assert text == "" and guard is False
    body = harness.payload("strict-trigger")
    assert body["reason"] == "dump-args", body
    # 判定依据 —— 这三项就是「能不能事后核对」的关键
    assert body["written"] == {"段": 10}, body
    assert body["read"] == {"段": 4}, body
    assert body["exceeds"] == {"段": [10, 4]}, body
    # 原始参数（被截断的那份）仍然保留，方便看模型原话
    assert "第10段" in body["answer"], body
    # 「模型当时拿到了什么」也要在
    assert "第4段" in body["tool_results"] and "第5段" not in body["tool_results"], body
    # 重试提示词必须带上 dump-args 专用那段
    assert any(kwargs.get("strict_reason") == "dump-args" for kwargs in harness.calls), \
        harness.calls


def test_dump_args_hit_is_not_recorded_when_clean() -> None:
    """没编造时**不许**留下 strict-trigger 记录（否则 trace 会全是噪声）。"""
    clean = _write_call(4)  # 读了 4 段、写 4 段
    with _Harness([clean]) as harness:
        tool_call, _, _ = S.tool_phase(_messages(4), TOOLS, "auto", "test-model")
    assert tool_call is clean
    assert "strict-trigger" not in harness.stages(), harness.stages()


def test_dump_args_unfixed_is_traced_and_still_returned() -> None:
    """重试后仍在编 → 记 `dump-args-unfixed`，但仍然放行（留痕优于死拦）。"""
    with _Harness([_write_call(10), _write_call(10)]) as harness:
        tool_call, _, _ = S.tool_phase(_messages(4), TOOLS, "auto", "test-model")

    assert tool_call and tool_call["name"] == "write_file", tool_call
    assert harness.stages() == ["strict-trigger", "dump-args-unfixed"], harness.stages()
    body = harness.payload("dump-args-unfixed")
    assert body["written"] == {"段": 10} and body["exceeds"] == {"段": [10, 4]}, body
    assert body["tool_results"], "留痕记录也要带上「模型当时拿到了什么」"


def test_dump_args_retry_that_returns_no_call_falls_through() -> None:
    """两次重试都没给出工具调用 → **绝不**把编造的那个调用放出去。

    这条是单测抓出来的真 bug：原来的写法在重试循环走完后会落到
    `return tool_call, ...`，等于把「写入里含编造内容」的调用原样转发。
    取舍：宁可不给调用、落到兜底（必要时 502，**可见**），
    也不要交出一个内容是假的产出文件（用户看不出来）。
    """
    with _Harness([_write_call(10), None, None]) as harness:
        tool_call, text, guard = S.tool_phase(_messages(4), TOOLS, "auto", "test-model")
    assert tool_call is None, f"编造的调用被放行了: {tool_call}"
    assert guard is True, "应落到兜底清理分支"
    assert "dump-args-rejected" in harness.stages(), harness.stages()
    body = harness.payload("dump-args-rejected")
    assert body["exceeds"] == {"段": [10, 4]}, body


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
