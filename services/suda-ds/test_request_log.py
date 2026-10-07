# -*- coding: utf-8 -*-
"""回归测试：**每处理一次请求，必须落一行请求日志**（观测一致性）。

背景（2026-10-01 实测定位）：
`log_request` 里原来写的是

    "first": _preview(messages[0].get("content") if messages else ""),

外面套一个 `except Exception: pass`。只要客户端发来的 `messages[0]` **不是 dict**
（`"messages": ["你好"]` 这种），这一行就抛 `AttributeError` → **整条日志被吞掉**，
而请求照常被服务。

代价：tool-trace.log 里出现 3 次成对的 `tool-not-offered`，
requests.log 里却**找不到任何对应时刻的请求**，两边对不上号，
查了大半天才发现是**日志自己丢了**（详见 `check_request_log_gap.py`）。

教训：「日志失败绝不能影响正常请求」是对的，但**不能等于静默** ——
一次没记上的日志，比一条记歪的日志危险得多。

本文件把五类 body 形状 + 写盘失败路径 + 轮转全钉住。
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import suda_api  # noqa: E402


# ── 辅助 ────────────────────────────────────────────────────────────────
def _run(bodies: list, max_bytes: int | None = None) -> list:
    """把 requests.log 指到临时文件，跑一批 body，返回落盘的记录。

    绝不污染真实的 requests.log（`REQUEST_LOG_PATH` 是每次调用现读的全局量，
    所以临时替换即可）。
    """
    original_path = suda_api.REQUEST_LOG_PATH
    original_max = suda_api._REQUEST_LOG_MAX_BYTES
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "requests.log")
        suda_api.REQUEST_LOG_PATH = path
        if max_bytes is not None:
            suda_api._REQUEST_LOG_MAX_BYTES = max_bytes
        try:
            for body in bodies:
                suda_api.log_request("/v1/chat/completions", body, "probe")
            records = []
            if os.path.exists(path):
                with open(path, encoding="utf-8") as handle:
                    records = [json.loads(line) for line in handle if line.strip()]
            rotated = os.path.exists(path + ".1")
        finally:
            suda_api.REQUEST_LOG_PATH = original_path
            suda_api._REQUEST_LOG_MAX_BYTES = original_max
    return records, rotated


# 客户端可能发来的 body 形状 —— 一条都不能漏记。
# 前 5 条与 check_request_log_gap.py 的探针完全一致（就是当初实测被吞掉的那几种）。
_SHAPES = [
    ("正常的 messages", {"messages": [{"role": "user", "content": "你好"}]}),
    ("messages[0] 是字符串", {"messages": ["你好"]}),
    ("messages[0] 是 None", {"messages": [None]}),
    ("messages 不是 list", {"messages": "你好"}),
    ("没有 messages 字段", {}),
    ("messages 是空 list", {"messages": []}),
    ("content 是分段列表", {"messages": [
        {"role": "user", "content": [{"type": "text", "text": "hi"}]}]}),
    ("带 tools 的完整请求", {"model": "deepseek-web", "messages": [
        {"role": "system", "content": "你是助手"},
        {"role": "user", "content": "读一下文件"}],
        "tools": [{"type": "function", "function": {"name": "read_file"}}],
        "tool_choice": "auto"}),
]


# ── 用例 ────────────────────────────────────────────────────────────────
def test_every_body_shape_still_logs_a_line():
    """★ 核心不变式：来一条请求，就必须落一行日志 —— 一条都不能少。

    旧实现在「messages[0] 是字符串 / None」这两种形状上会吞掉整条日志。
    """
    records, _ = _run([body for _, body in _SHAPES])
    assert len(records) == len(_SHAPES), (
        f"请求 {len(_SHAPES)} 条、日志只落了 {len(records)} 条 —— 有日志被吞了："
        f"落盘的是 {[r.get('first') for r in records]}"
    )


def test_non_dict_body_writes_a_degraded_record():
    """body 不是 dict 时不能静默 —— 必须留一条 degraded 记录，且计数要动。"""
    before = suda_api._request_log_degraded
    records, _ = _run(["这不是 dict"])
    assert len(records) == 1, f"body 不是 dict 时日志没落盘: {records}"
    assert records[0].get("degraded") is True, f"没标记 degraded: {records[0]}"
    assert records[0].get("degraded_reason"), f"没写降级原因: {records[0]}"
    assert records[0].get("at") and records[0].get("path"), \
        f"降级记录至少要有 at / path: {records[0]}"
    assert suda_api._request_log_degraded == before + 1, \
        "降级计数没加 —— 降级了却看不出来，等于换个方式静默"


def test_write_failure_is_visible_not_silent():
    """写盘失败可以不影响请求，但**不能静默** —— 计数必须动。

    旧实现是 `except Exception: pass`，写盘失败一点痕迹都不留。
    """
    before = suda_api._request_log_degraded
    original = suda_api._append_request_log

    def boom(_line):
        raise OSError("disk full")

    suda_api._append_request_log = boom
    try:
        # 不许抛 —— 日志失败绝不能影响正常请求
        suda_api.log_request("/v1/chat/completions", {"messages": []}, "probe")
    finally:
        suda_api._append_request_log = original
    assert suda_api._request_log_degraded == before + 1, (
        "写盘失败没被计数 —— 又把失败静默吞了（旧实现就是 except: pass）"
    )


def test_normal_record_fields_intact():
    """正常请求的字段不许被这次重构改坏。"""
    body = {
        "model": "deepseek-web",
        "stream": True,
        "messages": [
            {"role": "system", "content": "你是助手"},
            {"role": "user", "content": "你好"},
        ],
        "tools": [{"type": "function", "function": {"name": "read_file"}}],
        "tool_choice": "auto",
    }
    records, _ = _run([body])
    assert len(records) == 1, f"正常请求没落盘: {records}"
    rec = records[0]
    assert rec["roles"] == ["system", "user"], rec["roles"]
    assert rec["message_count"] == 2, rec["message_count"]
    assert rec["total_chars"] == len("你是助手") + len("你好"), rec["total_chars"]
    assert rec["tools"] == 1 and rec["tool_choice"] == "auto", rec
    assert rec["first"] == "你是助手" and rec["last"] == "你好", rec
    assert rec["stream"] is True and rec["model"] == "deepseek-web", rec
    assert rec["keys"] == sorted(["model", "stream", "messages", "tools", "tool_choice"]), rec["keys"]
    assert "degraded" not in rec, f"正常记录不该带 degraded 标记: {rec}"


def test_mixed_messages_keeps_first_and_last():
    """混入非 dict 元素时只降**字段**，不降**整条** —— 其余字段照样要落盘。"""
    body = {"messages": ["你好", {"role": "user", "content": "世界"}]}
    records, _ = _run([body])
    assert len(records) == 1, f"混入非 dict 元素就把整条日志丢了: {records}"
    rec = records[0]
    assert rec.get("degraded") is not True, f"不该整条降级: {rec}"
    assert rec["message_count"] == 2, rec["message_count"]
    assert rec["roles"] == ["user"], rec["roles"]     # 非 dict 元素不计入 roles
    assert rec["first"] == "" and rec["last"] == "世界", rec


def test_log_rotation_still_works():
    """轮转别被这次重构改坏：超过上限就把 requests.log 挪成 requests.log.1。"""
    body = {"messages": [{"role": "user", "content": "x" * 200}]}
    _, rotated = _run([body] * 6, max_bytes=200)
    assert rotated, "超过上限没轮转"


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
