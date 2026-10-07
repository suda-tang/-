# -*- coding: utf-8 -*-
"""回归测试：新会话必须先清掉网页端残留的旧上下文；且一次请求只清一次。

背景（2026-10-01 08:02，12 步任务复测第 3 次实测）：
网页端自己也在累积对话历史，而它的会话边界和客户端的**不是一回事**。
第 2 次任务在第 5 轮断掉，页面只累积了 5 轮（没到 CONVERSATION_TURN_LIMIT=10，
因此没触发重置）；紧接着第 3 次任务作为**全新请求**发过来（客户端只发 1 条消息），
模型却接着上一次的进度、第一个动作就是 `read_file p5.txt`，
第 9 轮还说「我注意到序列中缺少 p1.txt 到 p4.txt」。

危害：新任务若换了一批文件，模型会把上一段任务读过的文件当成已读过，
**跳过读取、直接给基于旧文件的结论**，而用户完全看不出来。

判据必须放在 **API 层**：broker 只收到一整段拼好的提示词
（`{"role":"user","content": prompt}`），看不到消息角色，判不出会话边界。
（第一版把它放在 broker 里，结果判据**每次发送都为真**、每轮都清一次页面，
日志里出现了「发送后 8 秒仍未回显，且输入框仍有内容，重发一次」——
正是 README 里警告过的「清完立刻发送容易发送不生效」。）

不依赖 playwright，3.10 / 3.12 都能跑：
    python test_new_conversation.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import suda_api  # noqa: E402


def test_first_turn_is_new_conversation():
    """只有 user（或 system+user）→ 新会话第一轮。"""
    assert suda_api.starts_new_conversation([{"role": "user", "content": "读 p1~p10 并合并"}])
    assert suda_api.starts_new_conversation([
        {"role": "system", "content": "你是助手"},
        {"role": "user", "content": "读 p1~p10 并合并"},
    ])


def test_continuation_is_not_new_conversation():
    """出现 assistant / tool 轮 → 是同一段会话的续轮，不能重置。"""
    assert not suda_api.starts_new_conversation([
        {"role": "user", "content": "读 p1~p10 并合并"},
        {"role": "assistant", "content": "", "tool_calls": []},
        {"role": "tool", "content": "第1段：苏州的秋天"},
    ])
    assert not suda_api.starts_new_conversation([
        {"role": "user", "content": "你好"},
        {"role": "assistant", "content": "你好，有什么可以帮您"},
    ])


def test_tool_only_history_is_continuation():
    """只要有 tool 轮就算续轮 —— 工具结果的 content 可能是空的，不能靠内容判。"""
    assert not suda_api.starts_new_conversation([
        {"role": "assistant", "content": ""},
        {"role": "tool", "content": ""},
    ])


def test_empty_messages_treated_as_new():
    """空历史（异常请求）按新会话处理 —— 重置在页面本来就干净时立即返回，代价可忽略。"""
    assert suda_api.starts_new_conversation([])


def test_reset_once_only_fires_on_first_send():
    """一次请求可能发送多次（工具决策 → strict 重试 → 最终回答），只清第一次。

    如果在每次发送前都清页面，既多花几次点击，又会踩到
    「清完立刻发送容易发送不生效」的坑。
    """
    gate = suda_api.ResetOnce(True)
    assert gate.take() is True, "第一次发送应该清页面"
    for _ in range(5):
        assert gate.take() is False, "后续发送不该再清页面"

    # 不是新会话 → 一次都不清
    quiet = suda_api.ResetOnce(False)
    for _ in range(3):
        assert quiet.take() is False


def test_reset_once_threads_into_payload():
    """`reset` 标志要真的进到发给 broker 的请求体里（只带一次）。"""
    sent: list[dict] = []
    original = suda_api.broker_chat_stream

    def fake_stream(prompt, model, reset_once=None):
        body = {"reset": bool(reset_once is not None and reset_once.take())}
        sent.append(body)
        return iter(["ok"])

    # 直接替换底层发送函数，验证「谁消费了这个开关」
    suda_api.broker_chat_stream = fake_stream
    try:
        gate = suda_api.ResetOnce(True)
        suda_api.broker_chat_once("第一段提示词", "m", reset_once=gate)
        suda_api.broker_chat_once("第二段提示词", "m", reset_once=gate)
    finally:
        suda_api.broker_chat_stream = original

    assert sent[0]["reset"] is True, "第一次发送必须带 reset"
    assert sent[1]["reset"] is False, "第二次发送不该再带 reset"


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
