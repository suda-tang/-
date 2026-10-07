# -*- coding: utf-8 -*-
"""回归测试：完整请求体存档（`requests-full.jsonl`）+ 原样重放链路。

## 为什么要这个

`requests.log` 只存摘要，**没法重放**。所以「真实 WorkBuddy 客户端在直连模式下
行不行」只能靠复刻的「真实形状」间接推断 —— 而请求体的构造权在客户端手里。
`SUDA_DEEPSEEK_LOG_REQUESTS_FULL=1` 打开后把 body 完整存下来，才能原样打回去。

这个能力最怕两件事，本文件各钉一遍：

1. **存下来的不是原样** —— 只要序列化时丢了字段、改了转义，重放就变成了
   「重放我以为的请求」，比不测还危险（给人虚假的安全感）。
   → `test_body_roundtrip_is_byte_identical`
2. **默认偷偷开着** —— 单条 150KB+，长会话跑一天几十 MB，不该默认占盘。
   → `test_disabled_by_default` / `test_disabled_means_no_file`

另外把「超限整条不存（而不是截断）」和「replay 的过滤/解析」也钉住。
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import suda_api  # noqa: E402

PY313 = sys.executable  # 这个测试不依赖 playwright，用当前解释器起子进程即可


# ── 辅助 ────────────────────────────────────────────────────────────────
def _run(bodies: list, *, max_bytes: int | None = None, rotate_bytes: int | None = None):
    """把存档指到临时文件，跑一批 body，返回 (记录列表, 是否轮转过, seq, 降级数)。

    绝不污染真实的 requests-full.jsonl（路径是每次调用现读的全局量）。
    ★ 标记文件也要一起指走：否则真实目录里若存在 `enable-full-log`，
      `test_disabled_*` 那两个用例会被它误开，测试就不再是隔离的。
    """
    origin = (suda_api.REQUEST_FULL_PATH, suda_api._REQUEST_FULL_MAX_BYTES,
              suda_api._REQUEST_FULL_ROTATE_BYTES, suda_api.REQUEST_FULL_ENABLED,
              suda_api.REQUEST_FULL_FLAG,
              suda_api._request_full_seq, suda_api._request_full_degraded)
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "requests-full.jsonl")
        suda_api.REQUEST_FULL_PATH = path
        suda_api.REQUEST_FULL_ENABLED = True
        suda_api.REQUEST_FULL_FLAG = os.path.join(tmp, "no-such-flag")
        if max_bytes is not None:
            suda_api._REQUEST_FULL_MAX_BYTES = max_bytes
        if rotate_bytes is not None:
            suda_api._REQUEST_FULL_ROTATE_BYTES = rotate_bytes
        try:
            for body in bodies:
                suda_api.log_request_full("/v1/chat/completions", body, "WorkBuddy/5.2.5")
            records = []
            if os.path.exists(path):
                with open(path, encoding="utf-8") as handle:
                    records = [json.loads(line) for line in handle if line.strip()]
            rotated = os.path.exists(path + ".1")
            seq, degraded = suda_api._request_full_seq, suda_api._request_full_degraded
        finally:
            (suda_api.REQUEST_FULL_PATH, suda_api._REQUEST_FULL_MAX_BYTES,
             suda_api._REQUEST_FULL_ROTATE_BYTES, suda_api.REQUEST_FULL_ENABLED,
             suda_api.REQUEST_FULL_FLAG,
             suda_api._request_full_seq, suda_api._request_full_degraded) = origin
    return records, rotated, seq, degraded


# 一条「真实形状」的请求：45K 系统提示词 + 28 个工具 + 多轮历史 + 工具结果回填。
# 故意塞进各种容易在序列化时出问题的东西：中文、换行、反斜杠路径、emoji、
# 嵌套结构、content 是数组、tool_calls 里 arguments 是字符串化的 JSON。
_REAL_SHAPE = {
    "model": "suda-deepseek",
    "stream": True,
    "tool_choice": "auto",
    "messages": [
        {"role": "system", "content": "你是助手。\n路径：C:\\Users\\mail\\a.txt\n表情：🚀\n引号：\"双\" '单'"},
        {"role": "user", "content": "读一下 README.md"},
        {"role": "assistant", "content": "", "tool_calls": [
            {"id": "call_1", "type": "function",
             "function": {"name": "Read", "arguments": '{"file_path":"README.md","limit":5}'}}]},
        {"role": "tool", "tool_call_id": "call_1", "content": [{"type": "text", "text": "1|# 标题"}]},
    ],
    "tools": [
        {"type": "function", "function": {"name": "Read", "description": "读文件\n带换行",
                                          "parameters": {"type": "object", "properties": {
                                              "file_path": {"type": "string"}}}}},
        {"type": "function", "function": {"name": "Bash", "parameters": {"type": "object"}}},
    ],
}


# ── 用例 ────────────────────────────────────────────────────────────────
def test_disabled_by_default():
    """★ 默认必须是**关**：单条 150KB+，长会话跑一天几十 MB，不该默认占盘。"""
    env = dict(os.environ)
    env.pop("SUDA_DEEPSEEK_LOG_REQUESTS_FULL", None)
    code = (
        f"import sys; sys.path.insert(0, r'{HERE}');"
        "import suda_api; print(suda_api.REQUEST_FULL_ENABLED)"
    )
    out = subprocess.run([PY313, "-c", code], capture_output=True, text=True, env=env)
    assert out.returncode == 0, f"子进程 import 失败：{out.stderr}"
    assert out.stdout.strip() == "False", f"默认应为 False，实际 {out.stdout.strip()!r}"


def test_disabled_means_no_file():
    """关了就是真不写 —— 不能只靠 REQUEST_FULL_PATH 指向不存在的目录来「没写」。"""
    origin_enabled, origin_path = suda_api.REQUEST_FULL_ENABLED, suda_api.REQUEST_FULL_PATH
    origin_flag = suda_api.REQUEST_FULL_FLAG
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "requests-full.jsonl")
        suda_api.REQUEST_FULL_ENABLED = False
        suda_api.REQUEST_FULL_PATH = path
        suda_api.REQUEST_FULL_FLAG = os.path.join(tmp, "no-such-flag")
        try:
            assert suda_api._request_full_on() == "", "env 关 + 无标记文件时应为关"
            suda_api.log_request_full("/v1/chat/completions", _REAL_SHAPE, "WorkBuddy/5.2.5")
        finally:
            (suda_api.REQUEST_FULL_ENABLED, suda_api.REQUEST_FULL_PATH,
             suda_api.REQUEST_FULL_FLAG) = origin_enabled, origin_path, origin_flag
        assert not os.path.exists(path), "开关关闭时不该产生存档文件"


def test_flag_file_enables_without_restart():
    """★ 标记文件存在即生效，且**不需要重启服务**。

    服务常态是 VBS 自启动拉起的，改环境变量很麻烦；而「临时抓一轮真实客户端
    请求」应该是随手能做的事。所以开关必须是运行时可操作的。
    """
    origin_flag, origin_enabled = suda_api.REQUEST_FULL_FLAG, suda_api.REQUEST_FULL_ENABLED
    with tempfile.TemporaryDirectory() as tmp:
        flag = os.path.join(tmp, "enable-full-log")
        suda_api.REQUEST_FULL_FLAG = flag
        suda_api.REQUEST_FULL_ENABLED = False
        try:
            assert suda_api._request_full_on() == "", "没有标记文件时应该是关的"
            with open(flag, "w", encoding="utf-8"):
                pass
            assert suda_api._request_full_on() == "flag", "标记文件存在就该生效"
            # 同一进程内，不重启，删掉就关 —— 证明是现查而非启动期决定
            os.remove(flag)
            assert suda_api._request_full_on() == "", "删掉标记文件就该立刻关掉"
        finally:
            suda_api.REQUEST_FULL_FLAG, suda_api.REQUEST_FULL_ENABLED = origin_flag, origin_enabled


def test_body_roundtrip_is_byte_identical():
    """★ 核心：存档里的 body 必须与原请求**逐字节**一致。

    只要序列化时丢了字段或改了转义，重放就变成「重放我以为的请求」——
    比不测更危险，因为它给人虚假的安全感。
    """
    records, _, _, _ = _run([_REAL_SHAPE])
    assert len(records) == 1, f"应落 1 条，实际 {len(records)}"
    record = records[0]
    assert "body" in record, "完整存档必须有 body 字段"
    assert record["body"] == json.dumps(_REAL_SHAPE, ensure_ascii=False), "存档 body 与序列化结果不一致"
    assert record["bytes"] == len(record["body"].encode("utf-8")), "bytes 字段算错"
    assert json.loads(record["body"]) == _REAL_SHAPE, "反序列化后与原请求不等价"
    # 中文/emoji 必须原样保留，不能被转义成 \uXXXX
    # （否则存档 bytes 与客户端实际发出的字节数不一致，「原样」就名不副实）
    assert "你是助手" in record["body"], "中文被转义了 —— ensure_ascii 没关"
    assert "🚀" in record["body"], "emoji 丢了"
    assert record["client"] == "WorkBuddy/5.2.5"
    assert record["path"] == "/v1/chat/completions"


def test_oversized_request_is_skipped_whole_not_truncated():
    """超限要**整条不存**并留痕，不能存半截。

    半截 JSON 重放不了，存了也是垃圾 —— 更糟的是它会假装「存档里有这条」。
    """
    big = {"model": "x", "messages": [{"role": "user", "content": "长" * 5000}]}
    records, _, _, _ = _run([big], max_bytes=200)
    assert len(records) == 1
    record = records[0]
    assert record.get("skipped") is True, "超限应标 skipped"
    assert "body" not in record, "超限不能留下半截 body"
    assert "200" in record["skipped_reason"], f"原因里应带上限：{record['skipped_reason']}"
    assert record["bytes"] > 200


def test_unserializable_body_does_not_crash_or_leave_junk():
    """循环引用这类序列化失败：不炸、计数 +1、不留半行。"""
    cyclic: dict = {"messages": []}
    cyclic["self"] = cyclic
    records, _, _, degraded = _run([cyclic, _REAL_SHAPE])
    assert degraded == 1, f"降级计数应为 1，实际 {degraded}"
    assert len(records) == 1, "失败那条不该留记录，正常那条要留下"
    assert records[0]["seq"] == 2, f"seq 应继续递增到 2，实际 {records[0]['seq']}"


def test_seq_increments_across_requests():
    """seq 必须单调递增 —— replay 靠它定位。"""
    records, _, seq, _ = _run([_REAL_SHAPE, _REAL_SHAPE, _REAL_SHAPE])
    assert [r["seq"] for r in records] == [1, 2, 3]
    assert seq == 3


def test_rotation():
    """超过轮转上限要把老文件挪到 .1，别让单文件无限涨。"""
    _, rotated, _, _ = _run([_REAL_SHAPE] * 3, rotate_bytes=200)
    assert rotated, "超过轮转上限应产生 requests-full.jsonl.1"


# ── replay-request.py 的解析与过滤 ───────────────────────────────────────
def _load_replay_module():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "replay_request", os.path.join(HERE, "replay-request.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_replay_filters_by_client_and_reports_skipped():
    """replay 默认只看 WorkBuddy 的请求，并如实报出被跳过的记录。"""
    module = _load_replay_module()
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "requests-full.jsonl")
        rows = [
            {"at": "t", "seq": 1, "path": "/v1/chat/completions", "client": "WorkBuddy/5.2.5",
             "bytes": 10, "body": json.dumps(_REAL_SHAPE, ensure_ascii=False)},
            {"at": "t", "seq": 2, "path": "/v1/chat/completions", "client": "Python-urllib/3.13",
             "bytes": 10, "body": json.dumps({"messages": []}, ensure_ascii=False)},
            {"at": "t", "seq": 3, "path": "/v1/chat/completions", "client": "WorkBuddy/5.2.5",
             "bytes": 99999, "skipped": True, "skipped_reason": "太大"},
            {"at": "t", "seq": 4, "path": "/v1/chat/completions", "client": "WorkBuddy/5.2.5",
             "bytes": 5, "body": "{不是 json"},
        ]
        with open(path, "w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")

        records, skipped = module.load_archive(path, "WorkBuddy")
        assert [r["seq"] for r in records] == [1, 4], f"过滤结果不对：{[r['seq'] for r in records]}"
        assert any("太大" in note for note in skipped), f"应报出被跳过的记录：{skipped}"

        all_records, _ = module.load_archive(path, "")
        assert len(all_records) == 3, f"空前缀应不过滤：{len(all_records)}"


def test_replay_shape_counts_match_real_shape():
    """replay 的形状统计要跟请求体对得上（用于人眼核对「这条是不是真实形状」）。"""
    module = _load_replay_module()
    record = {"bytes": 1, "body": json.dumps(_REAL_SHAPE, ensure_ascii=False)}
    info = module.shape(record)
    assert info["messages"] == 4
    assert info["tools"] == 2
    assert info["stream"] is True
    assert info["roles"] == ["system", "user", "assistant", "tool"]
    assert info["chars"] > 0


def test_replay_sse_accumulates_tool_args_by_index():
    """★ 重放用的解析器必须按 index 累积 —— 这个坑踩过一次。

    第一帧给 name，后续帧**只给 arguments 片段、不带 name**。只认「同帧带 name」
    的解析会丢掉全部参数，然后误报「模型没给参数」。
    """
    module = _load_replay_module()
    frames = [
        {"choices": [{"delta": {"tool_calls": [
            {"index": 0, "id": "call_1", "type": "function",
             "function": {"name": "Bash", "arguments": ""}}]}}]},
        {"choices": [{"delta": {"tool_calls": [
            {"index": 0, "function": {"arguments": '{"command":'}}]}}]},
        {"choices": [{"delta": {"tool_calls": [
            {"index": 0, "function": {"arguments": '"echo hi"}'}}]}}]},
    ]
    raw = "".join(f"data: {json.dumps(f)}\n\n" for f in frames) + "data: [DONE]\n\n"
    parsed = module.parse_sse(raw)
    assert parsed["done"] is True
    assert len(parsed["tool_calls"]) == 1
    call = parsed["tool_calls"][0]
    assert call["name"] == "Bash", f"工具名丢了：{call}"
    assert call["arguments"] == '{"command":"echo hi"}', f"参数没累积：{call}"
    assert json.loads(call["arguments"]) == {"command": "echo hi"}
    assert parsed["args_in_own_frame"] is True


def test_replay_marks_itself_so_it_is_not_mistaken_for_the_real_client():
    """★ 重放必须自己暴露身份，否则会把自己骗了。

    重放会沿用原记录的 User-Agent（否则服务端日志的来源分类就断了），而重放本身
    也是一次请求、也会进存档 —— 于是存档里会堆一堆 `client` 看着就是真实客户端的
    记录，**其实全是自己重放出来的**。没有标记的话，光看 `--list` 就会误判成
    「真实客户端跑过了」—— 这是本轮最容易犯、代价最大的错。
    """
    module = _load_replay_module()
    real = {"client": "WorkBuddy/5.2.5 WorkBuddy/5.2.5 CLI/2.106.4"}
    assert module.is_replay(real) is False, "真实客户端的记录不该被标成 replay"
    ua = module.replay_user_agent(real)
    assert ua.startswith("WorkBuddy/5.2.5"), f"必须保留原 UA 前缀（否则默认过滤挑不到）：{ua}"
    assert "[replay]" in ua, f"重放的 UA 必须带标记：{ua}"
    assert module.is_replay({"client": ua}) is True, "带标记的记录应被识别为 replay"
    # 没有 client 字段时也不能崩
    assert "[replay]" in module.replay_user_agent({}), "缺 client 字段也要能构造 UA"


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
