# -*- coding: utf-8 -*-
"""钉住「用户要求动磁盘、模型却不调工具 → 强制重试」这条判据。

背景（2026-10-02 端到端实测）：
  模型（苏大 DeepSeek）会把「动磁盘的活」当成一道题，直接心算/背答案交差：
    要求「用 Write 创建 data.txt + shell 统计 + 写 result.txt」→ 答「lines=3 sum=21」
    要求「创建 fib.py 并运行」                              → 答「1 1 2 3 5 8 13 21 34 55」
    要求「创建 out.txt 并用 Read 读回」                     → 答「文件已创建并读取，内容为：CONC-1-OK」
  磁盘上一个字节都没有，但回答看起来完全正确。

  `_FABRICATED_RESULT_MARKERS` 只能拦「声称做过」，拦不住「假装不需要做」。
  所以加 `looks_like_file_task()`，在决策阶段强制 strict 重试。

对照旧实现：`looks_like_file_task` 不存在 → 前 7 条全挂。
"""

import suda_api


def _u(text):
    return [{"role": "user", "content": text}]


# ---------- 该识别的 ----------

def test_detects_create_file_task():
    assert suda_api.looks_like_file_task(
        _u("在当前工作目录创建 data.txt，内容为三行：3、7、11；然后用 shell 统计行数。")
    )


def test_detects_run_script_task():
    assert suda_api.looks_like_file_task(
        _u("在当前工作目录创建 fib.py，写一个 Python 脚本…然后用 shell 运行 python fib.py。")
    )


def test_detects_write_and_read_back():
    assert suda_api.looks_like_file_task(
        _u("在当前目录创建 out.txt，写入一行 CONC-1-OK，然后用 Read 读回并告诉我内容。")
    )


# ---------- 不该误伤的 ----------

def test_plain_arithmetic_not_detected():
    """★ 这是 [1] 用例的原文 —— 它必须**不**被识别成文件任务，否则纯问答会被逼去调工具。"""
    assert not suda_api.looks_like_file_task(
        _u("计算 (17*23+91) 的值，只回复这个数字，不要任何其他文字。")
    )


def test_poem_not_detected():
    """有动作词（写）但没有文件扩展名 → 纯写作，不该被拦。"""
    assert not suda_api.looks_like_file_task(_u("写一首关于秋天的诗。"))


def test_extension_question_not_detected():
    """有扩展名但没有动作词 → 纯问答，不该被拦。"""
    assert not suda_api.looks_like_file_task(_u(".py 和 .js 有什么区别？"))


def test_no_user_message_returns_false():
    assert not suda_api.looks_like_file_task(
        [{"role": "system", "content": "创建 a.txt"}]
    )


def test_list_content_supported():
    msgs = [
        {
            "role": "user",
            "content": [{"type": "input_text", "text": "创建 hello.txt 写入 OK"}],
        }
    ]
    assert suda_api.looks_like_file_task(msgs)


def test_takes_last_user_message():
    """多轮时只看**最后一条有实质内容的** user 消息。"""
    msgs = [
        {"role": "user", "content": "创建 a.txt"},
        {"role": "assistant", "content": "好的"},
        {"role": "user", "content": "谢谢"},
    ]
    assert not suda_api.looks_like_file_task(msgs)


REMINDER = (
    "<system-reminder><current-working-directory>\n"
    "Current working directory: C:\\Users\\mail\\.workbuddy\\suda-deepseek"
    "\\cli-sandbox\\run-1002-165646\\c3\n"
    "\n"
    "Files operation rules:\n"
    "- Paths in tool calls: Use absolute paths rooted at this directory.\n"
    "</current-working-directory></system-reminder>"
)


def test_reminder_as_last_user_message_still_detected():
    """★ 复现用例：CLI 把 workdir 注入成**独立的最后一条 user 消息**。

    修前：取到的就是这条 reminder（只有路径和文件操作规则，没有动作词/扩展名）
    → 返回 False → 判据等于白加。实测就是这么漏掉的（run11 里 file-task 触发 0 次）。
    """
    msgs = [
        {
            "role": "user",
            "content": "在当前工作目录创建 data.txt，内容为三行：3、7、11；"
            "然后用 shell 统计行数。",
        },
        {"role": "user", "content": REMINDER},
    ]
    assert suda_api.looks_like_file_task(msgs)


def test_reminder_appended_to_prompt_still_detected():
    """reminder 与原 prompt 写在同一条消息里（CLI 两种形态都出现过）。"""
    msgs = [
        {"role": "user", "content": REMINDER + "\n\n创建 hello.txt 写入 OK"},
    ]
    assert suda_api.looks_like_file_task(msgs)


def test_only_reminder_returns_false():
    """整轮只有 reminder、没有真正的请求 → False（不该凭空判定）。"""
    assert not suda_api.looks_like_file_task([{"role": "user", "content": REMINDER}])


# ---------- 结构性：确认 tool_phase 真的用了它 ----------

def test_tool_phase_uses_file_task_guard():
    """源码级断言：tool_phase 里必须有 file-task 这条判据。"""
    import inspect
    src = inspect.getsource(suda_api.tool_phase)
    assert 'strict_reason = "file-task"' in src, "tool_phase 必须用 file-task 强制重试"
    assert "looks_like_file_task(messages)" in src, "必须调用 looks_like_file_task"
    assert "not has_results" in src, "必须限定在「一次工具都没执行过」时"


if __name__ == "__main__":
    import traceback

    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = failed = 0
    for fn in fns:
        try:
            fn()
            print(f"  PASS  {fn.__name__}")
            passed += 1
        except Exception:
            print(f"  FAIL  {fn.__name__}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed}/{passed + failed} 通过")
    raise SystemExit(1 if failed else 0)
