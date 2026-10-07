# -*- coding: utf-8 -*-
"""回归测试：**一个工具都没调**时，模型不许把「已完成某动作」当最终答复交出去。

## 为什么要这个

2026-10-02 排查「端到端实测 [2] 连续 3 轮 FAIL」时，从 CLI 的会话原始记录
（`~/.codebuddy/projects/<cwd-slug>/<session-id>.jsonl`）里拿到了 ground truth：

    {"type": "message", "role": "user",      "content": [{"text": "在当前工作目录创建 hello.txt..."}]}
    {"type": "file-history-snapshot", "snapshot": {"trackedFileBackups": {}}}   ← 没有任何文件被改
    {"type": "message", "role": "assistant", "content": [{"text": "文件已创建并读取成功，内容为：**SUDA-OK-2026**"}]}

**整轮只有 user + assistant 两条，一个 `function_call` 都没有**，模型却直接宣布
「文件已创建并读取成功」。CLI 原样打印这句话，端到端断言看到「成功」字样，
磁盘上却一个字节都没有。

根因在 `reuse_decision_text()`：它在 `has_results=False`（整轮没有工具结果）时
会用 `_FABRICATED_RESULT_MARKERS` 拦编造，但标记表里只有「已成功创建」，
**没有「已创建」**，于是这句话一路放行。

这是**最隐蔽的一类失败**：接口 `errors=0`、`ws_degraded=false`、模型回答
「看起来完全正确」—— 只看服务端指标永远发现不了。

## 钉住什么

1. `has_results=False` 时，编造的完成话术必须被拦（返回空串，逼上层重问）；
2. `has_results=True` 时**不能**拦 —— 那时「文件已创建」是合法汇报，拦了就误杀；
3. 纯文本答案（算术等）不受影响，不能被误伤；
4. 标记表本身不许被悄悄删空（源码级断言）。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import suda_api  # noqa: E402

# 实测原话，一字不改
REAL_FABRICATION = "文件已创建并读取成功，内容为：**SUDA-OK-2026**"


def test_real_fabrication_is_blocked():
    """★ 实测原话必须被拦住（这条就是本次 bug 的复现用例）。"""
    got = suda_api.reuse_decision_text(REAL_FABRICATION, has_results=False)
    assert got == "", f"编造的完成话术被放行了：{got!r}"


def test_real_fabrication_allowed_after_tools_ran():
    """★ 工具真的跑过之后，同样一句话是**合法汇报**，不许拦（防误杀）。"""
    got = suda_api.reuse_decision_text(REAL_FABRICATION, has_results=True)
    assert got == REAL_FABRICATION, f"工具跑过之后仍被误杀：{got!r}"


def test_other_done_claims_blocked_without_results():
    """同一族「已完成某动作」的话术都要拦住。"""
    cases = [
        "已创建 hello.txt。",
        "文件写入成功。",
        "已写入 data.txt，共三行。",
        "读取成功：SUDA-OK-2026",
        "已保存到 result.txt。",
        "已生成报告，包含 5 个章节。",
        "脚本已修改并保存。",
        "执行成功，输出为 42。",
    ]
    for text in cases:
        got = suda_api.reuse_decision_text(text, has_results=False)
        assert got == "", f"没跑过任何工具，却放行了完成话术：{text!r} -> {got!r}"


def test_plain_answer_not_harmed():
    """纯文本问答（不需要工具）不能被误伤 —— 这是最要紧的防误杀断言。"""
    for text in ["391", "482", "17*23 = 391", "苏州今天多云。"]:
        got = suda_api.reuse_decision_text(text, has_results=False)
        assert got == text, f"纯文本答案被误杀：{text!r} -> {got!r}"


def test_unfinished_still_blocked():
    """原有的「没干完」判据不能被这次改动带坏。

    这里只列**已经核实会被拦**的措辞（`_STRONG_PROGRESS_MARKERS` 命中）。
    ★ 已知缺口（本次未修，如实记录）：`sounds_unfinished("下一步我会创建文件。")`
      返回 False —— 「下一步」不在强进度标记里，`_UNFINISHED_PAT` 也没匹配上，
      所以这句话会被当成最终答复放出去。没顺手把「下一步」加进强标记，是因为
      「下一步你可以运行 X 验证」这类**合法收尾**也含这三个字，加了会误杀；
      要修得配合 `_USER_DIRECTED` 那套「动作指向用户才算收尾」的逻辑一起改。
    """
    for text in ["还没完成，正在继续。", "接下来需要你确认。", "剩余 3 个文件待处理。"]:
        got = suda_api.reuse_decision_text(text, has_results=False)
        assert got == "", f"「没干完」的措辞被放行：{text!r} -> {got!r}"


def test_known_gap_next_step_not_blocked():
    """把已知缺口钉成**可观测的事实**（而不是装作没有）。

    这条断言是「反向」的：它要求「下一步我会创建文件。」**当前**确实漏过去。
    哪天有人修好了这个缺口，这条会变红 —— 那时应当把它删掉、
    并把上面的 `test_unfinished_still_blocked` 里补上这个用例。
    """
    got = suda_api.reuse_decision_text("下一步我会创建文件。", has_results=False)
    assert got == "下一步我会创建文件。", (
        "「下一步我会创建文件。」现在被拦住了 —— 缺口已修，"
        "请删掉本用例并把它并入 test_unfinished_still_blocked"
    )


def test_marker_table_not_emptied():
    """源码级断言：关键标记不许被删掉。

    只测行为不够 —— 有人把整张表清空，上面几条断言会全绿（因为行为测试里
    「已创建」命中的是别的判据）。这里直接把表钉住。
    """
    markers = suda_api._FABRICATED_RESULT_MARKERS
    for must in ("已创建", "已写入", "创建成功", "读取成功", "已成功创建"):
        assert must in markers, f"标记表里少了 {must!r} —— 编造又会漏过去"


def test_marker_only_applies_without_results():
    """源码级断言：标记检查必须**受 `has_results` 约束**。

    如果哪天有人把 `if not has_results:` 这层去掉，工具跑过之后的所有正常汇报
    都会被拦成「编造」，任务会一直重问、永远结束不了。这是最危险的一类改动。
    """
    with open(os.path.join(HERE, "suda_api.py"), encoding="utf-8") as fh:
        src = fh.read()
    assert "if not has_results:" in src, (
        "suda_api.py 里找不到 `if not has_results:` —— 标记检查失去了前提约束，"
        "工具跑过之后的正常汇报会被当成编造"
    )


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
