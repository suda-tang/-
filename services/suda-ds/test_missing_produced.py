# -*- coding: utf-8 -*-
"""钉住「多步任务做到一半就收工」的判据：missing_produced_files / last_real_user_text。

背景（2026-10-02 run13 的 [3] 实测）：prompt 要求 3 步，模型做了 1) 2)，
第 3) 步的 result.txt 没写就交了最终答复。旧的 `file-task` 判据带
`not has_results` 条件，多步场景必然被短路 —— 这个文件就是防它回归。
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import suda_api  # noqa: E402

PASS = 0
FAIL = 0


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {extra}")


C3_PROMPT = (
    "在当前工作目录做三件事：1) 用 Write 创建 data.txt，内容为三行：3、7、11；"
    "2) 用 shell 统计 data.txt 行数；3) 把行数和数字总和写入 result.txt，"
    "格式为 lines=X sum=Y。最后把 result.txt 的内容原样告诉我。"
)
REMINDER = (
    "<system-reminder><current-working-directory>\n"
    "Current working directory: C:\\x\\y\\c3\n"
    "Files operation rules:\n- Paths in tool calls: Use absolute paths\n"
    "</current-working-directory></system-reminder>"
)
MEMORY = (
    '<system-reminder data-role="memory"><memory>\n# auto memory\n</memory>'
    "</system-reminder>"
)


def msgs(user_text, extra_tail=None):
    out = [{"role": "system", "content": "sys"}, {"role": "user", "content": user_text}]
    if extra_tail:
        out.extend(extra_tail)
    return out


# ---------- 1. 基本命中 ----------
print("[1] 基本命中")
with tempfile.TemporaryDirectory() as d:
    got = suda_api.missing_produced_files(msgs(C3_PROMPT), d)
    check("两个产出文件都不存在 → 都报出来", got == ["data.txt", "result.txt"], got)

# ---------- 2. 只缺一个（这就是 run13 的真实形态）----------
print("[2] 只缺最后一个（run13 的真实形态）")
with tempfile.TemporaryDirectory() as d:
    open(os.path.join(d, "data.txt"), "w", encoding="utf-8").write("3\n7\n11\n")
    got = suda_api.missing_produced_files(msgs(C3_PROMPT), d)
    check("data.txt 已存在、result.txt 缺失 → 只报 result.txt",
          got == ["result.txt"], got)

# ---------- 3. 全都产出了 → 不该拦 ----------
print("[3] 全都有 → 不该拦")
with tempfile.TemporaryDirectory() as d:
    for n in ("data.txt", "result.txt"):
        open(os.path.join(d, n), "w", encoding="utf-8").write("x")
    got = suda_api.missing_produced_files(msgs(C3_PROMPT), d)
    check("文件都在 → 返回空（不误杀已完成的轮次）", got == [], got)

# ---------- 4. 反向用例：不该被当成「要产出文件」----------
print("[4] 反向用例（纯问答 / 纯写作）")
with tempfile.TemporaryDirectory() as d:
    cases = [
        ("计算 (17*23+91) 的值，只回复这个数字，不要任何其他文字。", "算术题"),
        ("写一首关于秋天的诗。", "纯写作"),
        (".py 和 .js 有什么区别？", "扩展名问答"),
        ("用一句话解释什么是递归。", "纯解释"),
    ]
    for text, label in cases:
        got = suda_api.missing_produced_files(msgs(text), d)
        check(f"{label} → 不拦", got == [], got)

# ---------- 5. 没有 workdir → 宁可不判 ----------
print("[5] 没有 workdir")
check("workdir 为空串 → 返回空", suda_api.missing_produced_files(msgs(C3_PROMPT), "") == [])
check("workdir 为 None → 返回空", suda_api.missing_produced_files(msgs(C3_PROMPT), None) == [])

# ---------- 6. reminder 干扰：CLI 把 workdir 注入成独立最后一条 user 消息 ----------
print("[6] reminder 干扰（run11 踩过的坑）")
with tempfile.TemporaryDirectory() as d:
    open(os.path.join(d, "data.txt"), "w", encoding="utf-8").write("x")
    m = msgs(C3_PROMPT, [{"role": "user", "content": REMINDER}])
    got = suda_api.missing_produced_files(m, d)
    check("workdir reminder 排在最后 → 仍能取到真正的请求",
          got == ["result.txt"], got)

# ---------- 7. 带属性的 memory 注入也要被剥掉 ----------
print("[7] 带属性的 system-reminder（memory 块）")
check("_strip_reminders 能吃 <system-reminder data-role=...>",
      suda_api._strip_reminders("A" + MEMORY + "B").strip() == "AB",
      repr(suda_api._strip_reminders("A" + MEMORY + "B")))
m = [{"role": "user", "content": MEMORY}, {"role": "user", "content": C3_PROMPT}]
check("memory 块不会被当成用户请求", suda_api.last_real_user_text(m) == C3_PROMPT)
with tempfile.TemporaryDirectory() as d:
    got = suda_api.missing_produced_files(m, d)
    check("memory 块在前、真请求在后 → 正常命中",
          got == ["data.txt", "result.txt"], got)

# ---------- 8. last_real_user_text 基本行为 ----------
print("[8] last_real_user_text")
check("跳过纯 reminder 取真正的请求",
      suda_api.last_real_user_text(msgs(C3_PROMPT, [{"role": "user", "content": REMINDER}])) == C3_PROMPT)
check("全是 reminder → 空串",
      suda_api.last_real_user_text([{"role": "user", "content": REMINDER}]) == "")
check("list 形式 content 也能取",
      suda_api.last_real_user_text([{"role": "user", "content": [{"type": "text", "text": "你好"}]}]) == "你好")

# ---------- 9. 源码级：判据必须真的接进 tool_phase ----------
print("[9] 源码级接线")
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "suda_api.py"),
           encoding="utf-8").read()
check("tool_phase 里出现 strict_reason = \"file-missing\"", 'strict_reason = "file-missing"' in src)
check("判据调用 missing_produced_files(messages, extract_workdir(messages))",
      "missing_produced_files(messages, extract_workdir(messages))" in src)
check("重试提示词有 file-missing 专用段", 'strict_reason == "file-missing"' in src)

print()
print(f"{PASS}/{PASS + FAIL} 通过")
sys.exit(0 if FAIL == 0 else 1)
