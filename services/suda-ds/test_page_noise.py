# -*- coding: utf-8 -*-
"""回归测试：页面自己的错误提示条（toast / 错误气泡）不能被当成回答。

背景（2026-10-05 实测 —— 用户投诉「这个自定义模型现在还是不能实际办成事情」时挖出）：
上游故障时苏大页面会在**机器人回答气泡里**渲染一条错误提示：

    您好，出现未知故障，请刷新页面稍后再试~  消息框于3秒后自动关闭

它被 `page_turn` 的正文通道当成「模型回答」抓走（33 字）；又因为
`looks_truncated()` 的语义判据是「≥30 字且以汉字/字母结尾」，这条提示条
被判成「回答被截断」→ 触发自动续写 → 把真正的答案拼在提示条后面，
交付给用户一条「错误提示 + 真答案」的污染回答。

`tool-trace.log` 铁证（15:32:41）：

    [continue] {"attempt":1,"head_chars":33,"tail_chars":34,"added_chars":35}
    decision answer = "您好，出现未知故障，请刷新页面稍后再试~  消息框于3秒后自动关闭
                       斐波那契数列前10项：1 1 2 3 5 8 13 21 34 55"

本文件锁住三件事：
  1) `is_page_noise` 认得出提示条，且**不误杀**正常回答；
  2) `looks_truncated` / `merge_continuation` 不再被提示条牵着走；
  3) 端到端：`chat_via_page` 宁可报「拿不到回答」（可见失败，交给上层刷新重试），
     也绝不交付污染回答 —— 并用「倒退 mutation」证明这条护栏不是摆设。

跑法（suda_broker 依赖 playwright，必须用 3.12）：
    C:\\Users\\mail\\AppData\\Local\\Programs\\Python\\Python312\\python.exe test_page_noise.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import suda_broker as B  # noqa: E402

# 真 trace 原文（tool-trace.log 2026-10-05 15:32:41，head_chars=33）
TOAST = "您好，出现未知故障，请刷新页面稍后再试~  消息框于3秒后自动关闭"

# 同一现场里被拼进来的真答案（34 字）
REAL_ANSWER = "斐波那契数列前10项：1 1 2 3 5 8 13 21 34 55"

# 真 trace 里被拼出来的污染回答（交付给用户的就是它）
POLLUTED = TOAST + "\n" + REAL_ANSWER

# 上游截断的两种真实形态（见 `looks_truncated` 文档字符串）
TRUNCATED_COLON = "以下是一些常见解决方案和诊断思路：\n\n**使用"
TRUNCATED_CJK = "将手机调至静音或飞行模式，放在视线之外。\n每天列出最重要的三件事"


# ── 1. 判据：认得出提示条 ────────────────────────────────────────────
def test_real_toast_is_page_noise():
    """★ 核心用例：真 trace 原文必须被判为页面提示条。"""
    assert B.is_page_noise(TOAST) is True


def test_toast_variants_are_page_noise():
    """同一类提示的常见变体（页面改文案时也要拦住）。"""
    variants = [
        "出现未知故障，请刷新页面稍后再试~",
        "您好，出现未知故障，请刷新页面稍后再试~",
        "消息框于3秒后自动关闭",
        "消息框将于5秒后自动关闭",
        "系统繁忙，请稍后再试",
        "服务异常，请刷新页面",
        "网络异常，请刷新页面稍后再试",
        "当前系统繁忙，消息框于3秒后自动关闭",
    ]
    for text in variants:
        assert B.is_page_noise(text) is True, f"漏判：{text!r}"


# ── 2. 判据：不误杀正常回答 ──────────────────────────────────────────
def test_normal_answers_are_not_page_noise():
    """正常回答绝不能被判成提示条 —— 否则真答案会被丢弃。"""
    answers = [
        REAL_ANSWER,
        "请刷新页面重试。",                       # 只含 1 个弱特征词，不该判
        "如果提示请刷新页面，就刷新页面再试一次。",   # 重叠词不该叠加成 2 个
        "页面报错时可以先刷新页面，然后重新登录。",
        "你好，我是苏大 DeepSeek 助手，请问有什么可以帮你？",
        "这道题的答案是：因为物体受到重力作用，所以会向下加速运动。",
        "服务异常的排查步骤：先看网络，再看代理，最后看上游状态。",
    ]
    for text in answers:
        assert B.is_page_noise(text) is False, f"误杀：{text!r}"


def test_long_text_quoting_toast_is_not_noise():
    """长回答里引用这条提示条是合法的（用户问「报错怎么办」时很常见），不能误杀。"""
    long_answer = (
        "如果页面出现「出现未知故障，请刷新页面稍后再试~  消息框于3秒后自动关闭」，"
        "说明上游服务临时不可用。建议的处理顺序是：第一，先等待 30 秒再刷新页面；"
        "第二，如果仍然报错，检查本地网络与代理设置；第三，联系学校信息化中心确认"
        "上游是否在维护。绝大多数情况下，等待几分钟后重试即可恢复正常。"
    )
    assert len(long_answer) > B.PAGE_NOISE_MAX_LEN
    assert B.is_page_noise(long_answer) is False


# ── 3. 截断判据 / 拼接判据不再被提示条牵着走 ─────────────────────────
def test_looks_truncated_rejects_page_noise():
    """★ 提示条 33 字、以汉字结尾，以前正好命中「≥30 字且以汉字结尾」→ 被判截断。"""
    assert B.looks_truncated(TOAST) is False


def test_looks_truncated_still_catches_real_truncation():
    """对照：真正被截断的回答必须照样判出来（不能为了修 bug 把判据改瞎）。"""
    assert B.looks_truncated(TRUNCATED_COLON) is True
    assert B.looks_truncated(TRUNCATED_CJK) is True
    # 对照：现场那条真答案本来就是完整的，本来就不该判截断
    assert B.looks_truncated(REAL_ANSWER) is False


def test_merge_continuation_drops_noise_tail():
    """补写轮拿回提示条 → 不许拼进回答。"""
    merged, delta = B.merge_continuation(TRUNCATED_COLON, TOAST)
    assert delta == ""
    assert merged == TRUNCATED_COLON.rstrip()


def test_clean_answer_strips_noise_line():
    """提示条作为**独立一行**混在回答里 → 逐行剥掉，正文一行不少。"""
    raw = TOAST + "\n" + REAL_ANSWER
    cleaned = B.clean_answer(raw, "")
    assert "出现未知故障" not in cleaned
    assert REAL_ANSWER in cleaned


def test_clean_answer_keeps_normal_multiline():
    """对照：正常多行回答不许被逐行过滤误伤。"""
    raw = "第一行：斐波那契数列的定义。\n第二行：前10项是 1 1 2 3 5 8 13 21 34 55。\n第三行：完。"
    cleaned = B.clean_answer(raw, "")
    for line in ("第一行", "第二行", "第三行"):
        assert line in cleaned, f"正常行被误删：{line}"


# ── 4. 端到端：绝不交付污染回答 ──────────────────────────────────────
def _stub_page_turn(script):
    """把 `page_turn` 换成按脚本依次返回文本的桩，返回 (桩, 调用记录, 还原函数)。"""
    calls = []

    def fake(page, messages, on_delta=None, timeout=None):
        calls.append(messages)
        text = script[min(len(calls) - 1, len(script) - 1)]
        return {"data": {"chat": {"choices": [{"message": {"text": text}}]}}}

    original = B.page_turn
    B.page_turn = fake
    return calls, lambda: setattr(B, "page_turn", original)


def _run_chat_via_page():
    """跑一轮 `chat_via_page`，返回 ('answer', 文本) 或 ('error', 异常)。"""
    try:
        result = B.chat_via_page(None, [{"role": "user", "content": "斐波那契数列前10项"}])
    except B.NoAnswerError as exc:
        return "error", exc
    return "answer", result["data"]["chat"]["choices"][0]["message"]["text"]


def test_chat_via_page_rejects_toast_as_answer():
    """★ 核心用例：第一轮就是提示条 → 必须可见失败，且**不许**触发续写。"""
    calls, restore = _stub_page_turn([TOAST, REAL_ANSWER])
    try:
        kind, value = _run_chat_via_page()
    finally:
        restore()
    assert kind == "error", f"污染回答被交付了：{value!r}"
    assert "错误提示" in str(value)
    assert len(calls) == 1, "提示条不该触发续写轮（那正是污染的产生路径）"


def test_chat_via_page_drops_noise_from_continue_turn():
    """真回答被截断、补写轮却拿回提示条 → 保留已抓到的真回答，不拼接提示条。"""
    calls, restore = _stub_page_turn([TRUNCATED_COLON, TOAST])
    try:
        kind, value = _run_chat_via_page()
    finally:
        restore()
    assert kind == "answer", f"应当保留已抓到的真回答，实际：{value!r}"
    assert value == TRUNCATED_COLON.rstrip()
    assert TOAST[:8] not in value


def test_guard_actually_blocks_regression():
    """★ 守卫有效性：把 `is_page_noise` 倒退成恒 False → 污染回答必然复现。

    如果倒退之后仍然拿不到污染回答，说明上面那些用例根本挡不住回归，等于没写。
    """
    original = B.is_page_noise
    B.is_page_noise = lambda text: False
    try:
        calls, restore = _stub_page_turn([TOAST, REAL_ANSWER])
        try:
            kind, value = _run_chat_via_page()
        finally:
            restore()
    finally:
        B.is_page_noise = original

    assert kind == "answer", "倒退后本该复现污染，却仍然报错 —— 用例挡不住回归"
    assert value == POLLUTED, f"倒退后应复现 33+34 的污染回答，实际：{value!r}"
    assert len(calls) == 2, "倒退后应当触发一次续写（污染的产生路径）"


# ── 4. `page_turn` **内部**的护栏（★ 以前完全没被测到）────────────────────
# 上面所有用例都是把 `page_turn` **整个替换掉**的。而 `page_turn` 自己那几条
# 提示条护栏从来没被执行过 —— 生产日志里「页面返回错误提示条，已忽略」
# **0 次触发**。原因（2026-10-05 查清，属于「护栏看着在、其实永远进不去」）：
#
#     `clean_answer()` 会**逐行**把提示条剥掉 → 清完之后 `candidate` 是**空串**
#     → `if candidate and is_page_noise(candidate)` **永远为假**
#     → `PAGE_NOISE_GRACE` 宽限期不启动 → 用户要等满 `THINK_PHASE_LIMIT`(60s)
#
# 修法：判定回到**原始**页面文本（`page_noise_line`），并用「清完之后一个字都不剩」
# 把范围收窄。下面用桩页面把这条路径真正跑起来。


class _FakePage:
    """够 `page_turn` 用的最小页面桩。"""

    def bring_to_front(self):
        pass

    def evaluate(self, *_args, **_kwargs):
        return ""


def _found(text, think="", final=True):
    return {"found": True, "rid": "r1", "text": text, "think": think,
            "final": final, "streaming": False, "partial": False, "inputBusy": False}


def _stub_page_turn_deps(poll_script, logs, grace=0.08):
    """把 `page_turn` 的外部依赖 + 各种等待时长换成桩，返回 (调用计数, 还原函数)。

    `poll_script`：每次 `poll_answer` 依次返回的 dict；用完后一直返回最后一项。
    """
    counter = {"poll": 0}
    saved = {}
    names = ("page_username", "send_prompt", "poll_answer", "input_pending_text",
             "input_blocked", "read_final_text", "log")
    for n in names:
        saved[n] = getattr(B, n)

    def fake_poll(page, marker):
        i = counter["poll"]
        counter["poll"] += 1
        return poll_script[min(i, len(poll_script) - 1)]

    B.page_username = lambda page: "tester"
    B.send_prompt = lambda page, text: None
    B.poll_answer = fake_poll
    B.input_pending_text = lambda page: ""
    B.input_blocked = lambda page: False
    B.read_final_text = lambda page, rid: ""
    B.log = lambda msg: logs.append(str(msg))

    consts = ("PAGE_POLL_INTERVAL", "SETTLE_INTERVAL", "SETTLE_LIMIT", "HARD_STABLE_LIMIT",
              "STABLE_LIMIT", "SILENT_STALL_LIMIT", "STALL_LIMIT", "THINK_PHASE_LIMIT",
              "BUSY_GRACE", "PAGE_NOISE_GRACE", "SEND_VERIFY_LIMIT", "CHAT_TIMEOUT")
    for c in consts:
        saved[c] = getattr(B, c)
    # ★ CHAT_TIMEOUT 必须一起压掉（默认 150s）：万一护栏被倒退掉，`page_turn`
    #   会一路空转到 deadline —— 不压的话审计里一个用例就要跑 150 秒。
    B.CHAT_TIMEOUT = 1.0
    B.PAGE_POLL_INTERVAL = 0.005
    B.SETTLE_INTERVAL = 0.005
    B.SETTLE_LIMIT = 0.05
    B.HARD_STABLE_LIMIT = 0.05
    B.STABLE_LIMIT = 0.02
    B.SILENT_STALL_LIMIT = 999
    B.STALL_LIMIT = 999
    B.THINK_PHASE_LIMIT = 999
    B.BUSY_GRACE = 999
    B.PAGE_NOISE_GRACE = grace
    B.SEND_VERIFY_LIMIT = 999

    def restore():
        for n in names:
            setattr(B, n, saved[n])
        for c in consts:
            setattr(B, c, saved[c])

    return counter, restore


def _run_page_turn():
    """跑一轮 `page_turn`，返回 ('answer'|'stalled'|'noanswer', 文本或异常)。"""
    try:
        result = B.page_turn(_FakePage(), [{"role": "user", "content": "你好"}])
    except B.PageStalledError as exc:
        return "stalled", exc
    except B.NoAnswerError as exc:
        return "noanswer", exc
    return "answer", result["data"]["chat"]["choices"][0]["message"]["text"]


def test_clean_answer_swallows_toast_so_candidate_is_empty():
    """★ 先钉住这个陷阱本身：`clean_answer` 把提示条整行剥掉 → candidate 是空串。

    这正是「`is_page_noise(candidate)` 永远为假、护栏变死代码」的根因，
    所以判定必须回到**原始文本**（`page_noise_line`）。
    """
    assert B.clean_answer(TOAST, "") == "", "clean_answer 应当把提示条整行剥掉"
    assert B.is_page_noise(TOAST) is True
    assert B.page_noise_line(TOAST) == TOAST
    assert B.page_noise_line(TOAST + "\n" + REAL_ANSWER) == TOAST
    assert B.page_noise_line(REAL_ANSWER) == ""


def test_page_turn_fails_fast_on_toast_only():
    """★ 核心用例：整轮只有提示条 → 必须在 PAGE_NOISE_GRACE 内抛 PageStalledError。

    修之前这里会一直等到 `THINK_PHASE_LIMIT`(60s) 才报 NoAnswerError，
    设计的「8 秒可见失败」根本没生效。
    """
    logs = []
    counter, restore = _stub_page_turn_deps([_found(TOAST, think=TOAST)], logs, grace=0.05)
    try:
        kind, value = _run_page_turn()
    finally:
        restore()
    assert kind == "stalled", f"应当快速可见失败，实际：{kind} {value!r}"
    assert "错误提示" in str(value)
    # 注意：异常消息里**故意**带着提示条原文（便于排查），所以不能断言「消息不含提示条」；
    # 这里要断言的是「提示条没有被当成回答交付」—— `kind == "stalled"` 已经保证了这点。
    assert isinstance(value, B.PageStalledError)
    assert any("页面返回错误提示条" in m for m in logs), f"护栏日志没触发：{logs}"
    assert counter["poll"] < 80, f"等太久（poll={counter['poll']}）—— 宽限期没生效"


def test_page_turn_delivers_answer_after_transient_toast():
    """★ 对照：先弹提示条、随后真的写出回答 → 必须交付真回答，不能误判成故障。"""
    logs = []
    script = [_found(TOAST, think=TOAST), _found(REAL_ANSWER)]
    counter, restore = _stub_page_turn_deps(script, logs, grace=5.0)
    try:
        kind, value = _run_page_turn()
    finally:
        restore()
    assert kind == "answer", f"提示条消失后应当继续等正文，实际：{kind} {value!r}"
    assert value == REAL_ANSWER
    assert TOAST[:8] not in value


def test_page_turn_keeps_answer_when_toast_quoted():
    """★ 对照：回答里**引用**提示条（正文还有别的内容）不算页面故障。"""
    quoted = "页面如果出现「" + TOAST + "」，说明上游临时不可用，稍后重试即可。"
    logs = []
    counter, restore = _stub_page_turn_deps([_found(quoted)], logs, grace=5.0)
    try:
        kind, value = _run_page_turn()
    finally:
        restore()
    assert kind == "answer", f"引用提示条不该判成页面故障，实际：{kind} {value!r}"
    assert "稍后重试即可" in value


def test_page_turn_guard_actually_blocks_regression():
    """★ 守卫有效性：把 `is_page_noise` 倒退成恒 False → 提示条会被当回答交付。"""
    original = B.is_page_noise
    B.is_page_noise = lambda text: False
    logs = []
    counter, restore = _stub_page_turn_deps([_found(TOAST, think=TOAST)], logs, grace=0.05)
    try:
        kind, value = _run_page_turn()
    finally:
        restore()
        B.is_page_noise = original
    assert kind == "answer", f"倒退后本该把提示条交付出去，实际：{kind} {value!r}"
    assert value == TOAST, "倒退后交付的应当就是那条 33 字提示条"


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
