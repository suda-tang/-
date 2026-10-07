# -*- coding: utf-8 -*-
"""回归测试：传输模式默认值 + 直连失败降级。

背景（2026-09-30）：产品把聊天通道从「驱动浏览器页面」换成
「直连苏大 GraphQL-over-WebSocket」。直连更快也更稳，但它依赖上游
一个**没有文档、随时可能变**的内部协议。所以除了换默认值，还加了一层
降级：直连失败且页面驱动仍可用时，自动退回页面驱动。

这个文件锁两件事，防止以后被悄悄改回去：
  ① 不设任何环境变量时，默认必须是**直连**（BROWSER_CHAT is False）；
     且 SUDA_DEEPSEEK_BROWSER_CHAT=1 能退回页面模式。
  ② 降级只在「还没吐出任何正文」时发生；一旦已经流式吐字，就必须
     直接报错，不能换通道续写（否则用户会看到两段拼接的正文）。

环境相关的断言用子进程跑（BROWSER_CHAT 是 import 期常量，进程内改不动）。
    python test_default_mode.py
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable

FAILURES: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not ok else ""))
    if not ok:
        FAILURES.append(name)


def probe(env_value: str | None) -> tuple[bool, bool]:
    """在干净子进程里 import suda_api，回报 (BROWSER_CHAT, WS_FALLBACK)。"""
    env = {k: v for k, v in os.environ.items()
           if k not in ("SUDA_DEEPSEEK_BROWSER_CHAT", "SUDA_DEEPSEEK_WS_FALLBACK")}
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    if env_value is not None:
        env["SUDA_DEEPSEEK_BROWSER_CHAT"] = env_value
    code = (
        "import sys; sys.path.insert(0, r'%s');"
        "import suda_api;"
        "print(int(suda_api.BROWSER_CHAT), int(suda_api.WS_FALLBACK))" % HERE
    )
    out = subprocess.run(
        [PY, "-c", code], capture_output=True, text=True, env=env, cwd=HERE, timeout=60
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[-400:])
    parts = out.stdout.strip().split()
    return bool(int(parts[0])), bool(int(parts[1]))


# ── ① 默认值 ─────────────────────────────────────────────────────────
browser, fallback = probe(None)
check("默认走 WebSocket 直连（BROWSER_CHAT=False）", browser is False, f"got {browser}")
check("默认开启直连降级（WS_FALLBACK=True）", fallback is True, f"got {fallback}")

browser, _ = probe("1")
check("SUDA_DEEPSEEK_BROWSER_CHAT=1 退回页面驱动", browser is True, f"got {browser}")

browser, _ = probe("0")
check("SUDA_DEEPSEEK_BROWSER_CHAT=0 显式直连", browser is False, f"got {browser}")


# ── ② 降级语义（进程内打桩） ─────────────────────────────────────────
sys.path.insert(0, HERE)
os.environ["SUDA_DEEPSEEK_BROWSER_CHAT"] = "0"   # 让模块按直连加载
import suda_api  # noqa: E402

_ORIG = {
    "chat_ws": suda_api.chat_ws,
    "broker_chat_once": suda_api.broker_chat_once,
    "read_broker_state": suda_api.read_broker_state,
    "ws_stream_sync": suda_api._ws_stream_sync,
    "broker_chat_stream": suda_api.broker_chat_stream,
    "ws_fallback": suda_api.WS_FALLBACK,
}


def _restore() -> None:
    suda_api.chat_ws = _ORIG["chat_ws"]
    suda_api.broker_chat_once = _ORIG["broker_chat_once"]
    suda_api.read_broker_state = _ORIG["read_broker_state"]
    suda_api._ws_stream_sync = _ORIG["ws_stream_sync"]
    suda_api.broker_chat_stream = _ORIG["broker_chat_stream"]
    suda_api.WS_FALLBACK = _ORIG["ws_fallback"]


# 打桩「代理状态读取」，让 _page_driver_available() 的真实门禁逻辑参与判定
# （直接替掉 _page_driver_available 会把 WS_FALLBACK 开关一起绕过，测不出东西）
def _broker_ready(ready: bool):
    return lambda timeout=2: (
        {"page_ready": True, "logged_in": True} if ready else {}
    )


def _fake_upstream(text: str) -> dict:
    return {"data": {"chat": {"choices": [{"message": {"text": text, "role": "assistant"}}]}}}


async def _ws_boom(messages, model):  # noqa: ANN001
    raise suda_api.UpstreamError(502, "无法连接苏大 DeepSeek：模拟协议变更")


# ②a：直连失败 + 页面可用 → 自动降级
try:
    suda_api.WS_FALLBACK = True
    suda_api.chat_ws = _ws_boom
    suda_api.read_broker_state = _broker_ready(True)
    suda_api.broker_chat_once = lambda prompt, model, reset_once=None: _fake_upstream("来自页面驱动")
    text = suda_api.model_once("问一句", "suda-deepseek")
    check("直连失败时自动降级到页面驱动", text == "来自页面驱动", f"got {text!r}")
finally:
    _restore()

# ②b：直连失败 + 页面不可用 → 原样抛出（可见失败）
try:
    suda_api.WS_FALLBACK = True
    suda_api.chat_ws = _ws_boom
    suda_api.read_broker_state = _broker_ready(False)
    raised = False
    try:
        suda_api.model_once("问一句", "suda-deepseek")
    except suda_api.UpstreamError:
        raised = True
    check("页面驱动不可用时如实报错，不静默兜底", raised)
finally:
    _restore()

# ②c：降级开关关掉 → 即使页面可用也不降级
try:
    suda_api.WS_FALLBACK = False
    suda_api.chat_ws = _ws_boom
    suda_api.read_broker_state = _broker_ready(True)
    raised = False
    try:
        suda_api.model_once("问一句", "suda-deepseek")
    except suda_api.UpstreamError:
        raised = True
    check("SUDA_DEEPSEEK_WS_FALLBACK=0 时不做降级", raised)
finally:
    _restore()


def _converted():
    return [{"role": "user", "content": "写点东西"}]


# ②d：流式 —— 一个字都没吐就失败 → 降级，且正文完整
try:
    suda_api.WS_FALLBACK = True
    suda_api.read_broker_state = _broker_ready(True)

    def _boom_before_any(converted, model):
        raise suda_api.UpstreamError(502, "握手阶段就断了")
        yield  # pragma: no cover - 让它是生成器

    suda_api._ws_stream_sync = _boom_before_any
    suda_api.broker_chat_stream = lambda prompt, model, reset_once=None: iter(["页面", "驱动", "正文"])
    events = list(suda_api.chat_stream(_converted(), "suda-deepseek"))
    deltas = [v for k, v in events if k == "delta"]
    done = [v for k, v in events if k == "done"]
    check("流式：未吐字前失败可降级", "".join(deltas) == "页面驱动正文", f"got {deltas!r}")
    check("流式：降级后 done 与正文一致", done and done[-1] == "页面驱动正文", f"got {done!r}")
finally:
    _restore()

# ②e：流式 —— **已经吐了字**再失败 → 必须报错，绝不换通道续写
# 注意「吐了字」的判据：尾部守卫会压住 FOOTER_HOLD_CHARS（默认 80）字不发，
# 所以正文必须**明显长于**压住长度，才真的会有内容发到客户端。
# （短正文被压住、失败时等于「一个字都没吐」→ 走降级是对的，见 ②f）
try:
    suda_api.WS_FALLBACK = True
    suda_api.read_broker_state = _broker_ready(True)
    long_part = "直连已经吐出的正文内容" * 12   # 120 字 > 压住长度
    assert len(long_part) > suda_api.FOOTER_HOLD_CHARS

    def _boom_after_delta(converted, model):
        yield long_part
        raise suda_api.UpstreamError(502, "中途断了")

    suda_api._ws_stream_sync = _boom_after_delta
    suda_api.broker_chat_stream = lambda prompt, model, reset_once=None: iter(["页面续写"])
    seen: list[str] = []
    raised = False
    try:
        for kind, value in suda_api.chat_stream(_converted(), "suda-deepseek"):
            if kind == "delta":
                seen.append(value)
    except suda_api.UpstreamError:
        raised = True
    got = "".join(seen)
    check("流式：已吐字后失败必须报错（不拼接两段正文）", raised, f"seen={seen!r}")
    check("流式：报错前吐出的就是直连原文的前缀、没掺页面驱动的内容",
          bool(got) and got == long_part[:len(got)] and "页面续写" not in got,
          f"got={got!r}")
finally:
    _restore()

# ②f：流式 —— 正文短到**全被尾部压住**时失败 → 等于「一个字都没吐」，降级是对的。
# 这条是加了尾部守卫之后新增的行为：用户拿到的是完整的页面驱动答案，
# 而不是「半截正文 + 报错」。
try:
    suda_api.WS_FALLBACK = True
    suda_api.read_broker_state = _broker_ready(True)

    def _boom_short(converted, model):
        yield "前半段"          # 3 字，远小于压住长度 → 一帧都不会发出去
        raise suda_api.UpstreamError(502, "中途断了")

    suda_api._ws_stream_sync = _boom_short
    suda_api.broker_chat_stream = lambda prompt, model, reset_once=None: iter(["完整", "答案"])
    events = list(suda_api.chat_stream(_converted(), "suda-deepseek"))
    deltas = [v for k, v in events if k == "delta"]
    done = [v for k, v in events if k == "done"]
    check("流式：正文全被压住时失败 → 降级给出完整答案",
          "".join(deltas) == "完整答案", f"got {deltas!r}")
    check("流式：降级后 done 一致", done and done[-1] == "完整答案", f"got {done!r}")
    check("流式：降级后不残留直连的半截正文",
          all("前半段" not in d for d in deltas), f"got {deltas!r}")
finally:
    _restore()


# ── ③ 实际通道必须可观测（降级要看得见） ─────────────────────────────
# `/health` 里的 browser_chat 只说明「配置成什么」。降级发生时它**不会变**，
# 界面上跟正常直连一模一样 —— 所以必须有单独的计数说明「实际走了什么」。
def _counter(kind: str) -> int:
    with suda_api._stats_lock:
        return int(suda_api._stats.get(kind, 0))


# ③a：直连成功 → ws 计数 +1
try:
    suda_api.WS_FALLBACK = True
    suda_api.read_broker_state = _broker_ready(True)
    before = _counter("ws")

    async def _ws_ok(messages, model):  # noqa: ANN001
        return _fake_upstream("直连成功")

    suda_api.chat_ws = _ws_ok
    text = suda_api.model_once("问一句", "suda-deepseek")
    check("直连成功时 ws 计数 +1", _counter("ws") == before + 1, f"got {_counter('ws')}")
    check("直连成功后 last_transport=ws",
          suda_api._stats.get("last_transport") == "ws",
          f"got {suda_api._stats.get('last_transport')!r}")
finally:
    _restore()

# ③b：降级 → page_fallback 计数 +1（这是「降级看得见」的核心）
try:
    suda_api.WS_FALLBACK = True
    suda_api.chat_ws = _ws_boom
    suda_api.read_broker_state = _broker_ready(True)
    suda_api.broker_chat_once = lambda prompt, model, reset_once=None: _fake_upstream("来自页面驱动")
    before = _counter("page_fallback")
    suda_api.model_once("问一句", "suda-deepseek")
    check("降级时 page_fallback 计数 +1",
          _counter("page_fallback") == before + 1, f"got {_counter('page_fallback')}")
    check("降级后 last_transport=page_fallback",
          suda_api._stats.get("last_transport") == "page_fallback",
          f"got {suda_api._stats.get('last_transport')!r}")
finally:
    _restore()

# ③c：/health 的 JSON 契约里必须带 transport / ws_degraded
# （只测计数不够 —— 计数对了但没暴露出去，用户照样看不见）
try:
    import json as _json
    import threading as _threading
    import urllib.request as _urlreq

    server = suda_api.ThreadingHTTPServer(("127.0.0.1", 0), suda_api.APIHandler)
    port = server.server_address[1]
    _threading.Thread(target=server.serve_forever, daemon=True).start()

    def _health() -> dict:
        with _urlreq.urlopen(f"http://127.0.0.1:{port}/health", timeout=10) as resp:
            return _json.loads(resp.read().decode("utf-8"))

    # 此时 ③b 刚做过一次降级 → last 应该是 page_fallback、ws_degraded 应该是 True
    suda_api.WS_FALLBACK = True
    suda_api.chat_ws = _ws_boom
    suda_api.read_broker_state = _broker_ready(True)
    suda_api.broker_chat_once = lambda prompt, model, reset_once=None: _fake_upstream("页面驱动")
    suda_api.model_once("问一句", "suda-deepseek")
    health = _health()
    check("/health 带 transport 分组", isinstance(health.get("transport"), dict),
          f"got {health.get('transport')!r}")
    check("/health 带 ws_degraded 标志", "ws_degraded" in health, f"keys={sorted(health)}")
    check("/health 的 transport 带 last / last_fallback_at",
          {"last", "last_fallback_at"} <= set(health.get("transport") or {}),
          f"got {health.get('transport')!r}")
    check("降级后 ws_degraded=True", health.get("ws_degraded") is True,
          f"got {health.get('ws_degraded')!r}")
    check("ws_degraded 跟随 last（而非累计计数）",
          health.get("ws_degraded") == (health["transport"]["last"] == "page_fallback"),
          f"got {health.get('ws_degraded')!r} / {health.get('transport')!r}")
    check("降级后 last_fallback_at > 0",
          float(health["transport"]["last_fallback_at"]) > 0,
          f"got {health['transport'].get('last_fallback_at')!r}")
    fallback_total = int(health["transport"]["page_fallback"])

    # ③d：直连恢复后 ws_degraded 必须变回 False（累计计数仍 >0）
    # 这是最容易写错的地方：拿「历史累计」当「当前状态」的话，直连好了还在报警，
    # 排查的人会照着已经消失的问题找半天。
    async def _ws_ok(messages, model):  # noqa: ANN001
        return _fake_upstream("直连恢复了")

    suda_api.chat_ws = _ws_ok
    suda_api.model_once("再问一句", "suda-deepseek")
    health = _health()
    check("直连恢复后 ws_degraded 变回 False", health.get("ws_degraded") is False,
          f"got {health.get('ws_degraded')!r}")
    check("但累计 page_fallback 计数保留（历史不丢）",
          int(health["transport"]["page_fallback"]) == fallback_total,
          f"got {health['transport']['page_fallback']!r}, want {fallback_total}")
    check("恢复后 last=ws", health["transport"]["last"] == "ws",
          f"got {health['transport']['last']!r}")

    server.shutdown()
    server.server_close()
finally:
    _restore()

print()
if FAILURES:
    print(f"{len(FAILURES)} 项未通过：" + ", ".join(FAILURES))
    sys.exit(1)
print("全部通过")
