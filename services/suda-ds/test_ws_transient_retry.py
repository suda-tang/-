# -*- coding: utf-8 -*-
"""回归测试：直连被**瞬时掐断**时原地重试一次（坑 26）。

背景（2026-10-03 实测）：
    `cli-e2e.sh` 偶发 `ws_degraded=true`，真因是
        `无法连接苏大 DeepSeek：no close frame received or sent`
    —— 连接建立后被上游掐断，属**瞬时抖动**。原来的行为是「一次失败就退回
    页面驱动」，而页面驱动慢且不稳，为一次抖动付这个代价不划算，还会让
    e2e 出现「测试红了但产品没事」。

    修法：`is_transient_ws_error()` + 非流式路径原地重试一次。
    本测试锁住这个行为，并把 **Windows 上「该重试 / 不该重试」的边界**钉死
    （见第 3 节：10054 该重试，1225 / 10060 / 10061 不该）。

★ 附带收获一：写本测试时当场测出**数字子串误匹配** ——
   `1006` 原本做裸子串匹配，而 `[WinError 10060]`（连接超时）含 `1006`
   → Windows 的「连不上」被误判成「瞬时掐断」→ 白重试一次。
   已改成带数字边界的正则，由 `test_windows_errno_not_matched_as_close_code` 守住。

★ 附带收获二：`WinError 10054`（连接被重置）曾是**盲区** ——
   提示表只有英文 `"connection reset"`，匹配不到**中文**的 WinError 描述；
   而它在 `launcher.log` 里真实出现过 **11 次**，全部白降级到更慢的页面驱动。
   现已补上「编号 + 中文描述」两条，由 `test_windows_conn_reset_is_matched` 守住。

★ 为什么要单独一个离线测试：这套逻辑只在上游抖动时才走到，而抖动不可控。
   用离线测试把「什么错误该重试、重试几次、什么错误不该重试」钉死，
   就不用等下一次上游抖动才知道代码对不对。
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import suda_api  # noqa: E402


# ── 小工具：临时替换模块属性 ────────────────────────────────────────
class _Patch:
    def __init__(self, **kw):
        self.kw = kw
        self.old = {}

    def __enter__(self):
        for key, value in self.kw.items():
            self.old[key] = getattr(suda_api, key)
            setattr(suda_api, key, value)
        return self

    def __exit__(self, *exc):
        for key, value in self.old.items():
            setattr(suda_api, key, value)
        return False


MSGS = [{"role": "user", "content": "hi"}]
OK = {"data": {"chat": {"choices": [{"message": {"text": "ok"}}]}}}


def _chat_ws_with(script):
    """按 script 依次返回/抛错；记录调用次数。

    script 里的元素：异常实例 → 抛出；其它 → 返回值。
    """
    calls = []

    async def fake(messages, model, token):
        calls.append((messages, model, token))
        step = script[min(len(calls) - 1, len(script) - 1)]
        if isinstance(step, BaseException):
            raise step
        return step

    return fake, calls


def _run(script, token="tok", env_token="", monkey=None):
    """跑一次 chat_ws，返回 (结果, 异常, 调用记录, 额外记录)。"""
    fake, calls = _chat_ws_with(script)
    extra = {}

    def fake_wait(timeout=2, **kw):
        if monkey and monkey.get("wait_calls") is not None:
            monkey["wait_calls"].append(timeout)
            return monkey["wait_returns"][len(monkey["wait_calls"]) - 1]
        return token

    with _Patch(
        wait_for_token=fake_wait,
        chat_ws_with_token=fake,
        TOKEN=env_token,
        _WS_RETRY_DELAY=0.0,   # 别真睡
    ):
        try:
            result = asyncio.run(suda_api.chat_ws(MSGS, "m"))
            return result, None, calls, extra
        except BaseException as exc:  # noqa: BLE001
            return None, exc, calls, extra


# ── 1. is_transient_ws_error 的判定 ────────────────────────────────
def test_transient_hints_all_hit():
    """6 条提示各自都要命中（大小写不敏感、只看子串）。"""
    cases = [
        "无法连接苏大 DeepSeek：no close frame received or sent",
        "ConnectionClosedError: connection closed",
        "keepalive ping timeout",
        "connection reset by peer",
        "websocket closed with code 1006",
        "websocket closed with code 1011",
    ]
    for text in cases:
        exc = suda_api.UpstreamError(502, text)
        assert suda_api.is_transient_ws_error(exc) is True, f"应命中却漏了: {text}"


def test_transient_hints_are_case_insensitive():
    exc = suda_api.UpstreamError(502, "NO CLOSE FRAME RECEIVED OR SENT")
    assert suda_api.is_transient_ws_error(exc) is True


def test_non_transient_errors_do_not_hit():
    """超时、认证、普通上游错误都不该被当成「瞬时掐断」。"""
    cases = [
        (504, "苏大 DeepSeek 响应超时"),
        (401, "unauthorized"),
        (401, "登录已过期，请完成登录/验证码后重试。"),
        (502, "上游未返回回答"),
        (502, "尚未登录。请先运行苏大登录程序，并在页面中完成登录。"),
        (502, ""),
    ]
    for status, text in cases:
        exc = suda_api.UpstreamError(status, text)
        assert suda_api.is_transient_ws_error(exc) is False, f"不该命中却命中了: {text!r}"


# ── 2. chat_ws 的重试行为 ──────────────────────────────────────────
def test_retry_once_then_success():
    """瞬时掐断 → 重试一次 → 成功。"""
    exc = suda_api.UpstreamError(502, "无法连接苏大 DeepSeek：no close frame received or sent")
    result, err, calls, _ = _run([exc, OK])
    assert err is None, f"不该抛错: {err}"
    assert result == OK
    assert len(calls) == 2, f"应恰好重试一次（共 2 次调用），实际 {len(calls)}"


def test_retry_only_once_then_raise():
    """重试仍失败 → 抛出，**不能无限重试**。"""
    exc = suda_api.UpstreamError(502, "无法连接苏大 DeepSeek：no close frame received or sent")
    result, err, calls, _ = _run([exc, exc, exc, exc])
    assert isinstance(err, suda_api.UpstreamError)
    assert len(calls) == 2, f"最多重试一次（共 2 次调用），实际 {len(calls)}"


def test_timeout_is_not_retried():
    """504 响应超时**不重试** —— 上游是慢不是断，重试等于等待翻倍。"""
    exc = suda_api.UpstreamError(504, "苏大 DeepSeek 响应超时")
    result, err, calls, _ = _run([exc, OK])
    assert isinstance(err, suda_api.UpstreamError)
    assert err.status == 504
    assert len(calls) == 1, f"超时不该重试，实际调用 {len(calls)} 次"


def test_plain_upstream_error_is_not_retried():
    exc = suda_api.UpstreamError(502, "上游未返回回答")
    result, err, calls, _ = _run([exc, OK])
    assert isinstance(err, suda_api.UpstreamError)
    assert len(calls) == 1


def test_no_token_raises_before_any_call():
    """没 token 时直接 401，不该发请求。"""
    result, err, calls, _ = _run([OK], token="")
    assert isinstance(err, suda_api.UpstreamError)
    assert err.status == 401
    assert "尚未登录" in str(err)
    assert len(calls) == 0, f"没 token 不该发请求，实际 {len(calls)} 次"


def test_auth_error_refreshes_token_not_retry():
    """认证错误（无环境 TOKEN）走**刷新 token** 分支，不是原地重试。"""
    exc = suda_api.UpstreamError(401, "unauthorized")
    monkey = {"wait_calls": [], "wait_returns": ["tok", ""]}  # 刷新后拿不到新 token
    result, err, calls, _ = _run([exc, OK], monkey=monkey)
    assert isinstance(err, suda_api.UpstreamError)
    assert "登录已过期" in str(err), f"应走刷新失败分支，实际: {err}"
    assert len(calls) == 1, f"认证失败不该原地重试，实际 {len(calls)} 次"


def test_auth_error_refresh_then_success():
    """认证错误 → 刷新到新 token → 用新 token 重发一次。"""
    exc = suda_api.UpstreamError(401, "unauthorized")
    monkey = {"wait_calls": [], "wait_returns": ["tok", "newtok"]}
    result, err, calls, _ = _run([exc, OK], monkey=monkey)
    assert err is None, f"不该抛错: {err}"
    assert result == OK
    assert len(calls) == 2
    assert calls[1][2] == "newtok", "第二次必须用刷新后的 token"


def test_env_token_also_retries_transient():
    """环境变量里带了 TOKEN 时，瞬时掐断同样要重试。"""
    exc = suda_api.UpstreamError(502, "无法连接苏大 DeepSeek：no close frame received or sent")
    result, err, calls, _ = _run([exc, OK], env_token="envtok")
    assert err is None
    assert len(calls) == 2


# ── 3. Windows 等价错误：10054 该重试，1225/10060/10061 不该 ──────────
# ★ 2026-10-04 用**真实数据**把这条边界钉死（统计 `launcher.log`）：
#     `no close frame received or sent`   10 次   ← 命中重试 ✓
#     `WinError 10054`（远程主机强迫关闭） 11 次   ← 曾一条都不命中 ✗（已补上）
#     `WinError 1225`（拒绝连接）           8 次   ← **不该**重试
#   区别：10054 是「连上了又被掐」（瞬时，值得再来一次）；
#        1225 / 10060 / 10061 是「压根没连上」（重试只是白等一个超时周期）。
def test_windows_conn_reset_is_matched():
    """★ `WinError 10054`（连接被重置）**必须**命中 —— 它与 `no close frame` 同义。

    编号与中文描述**两条都测**：编号稳定，中文描述兜底（防编号格式变化）。
    """
    for text in (
        "无法连接苏大 DeepSeek：[WinError 10054] 远程主机强迫关闭了一个现有的连接。",
        "无法连接苏大 DeepSeek：远程主机强迫关闭了一个现有的连接。",
    ):
        exc = suda_api.UpstreamError(502, text)
        assert suda_api.is_transient_ws_error(exc) is True, f"应命中却漏了: {text}"


def test_windows_errno_not_matched_as_close_code():
    """★ 回归守卫：`WinError 10060` / `10061` **不许**被当成 WebSocket close code 1006。

    2026-10-04 写本测试时当场测出来：`1006` 原本做**裸子串**匹配，而 `10060` 含 `1006`
    → Windows 的「连接超时 / 连接被拒绝」被判成「瞬时掐断」→ 明明该快速失败，却白重试一次。
    上游整机不可达时（TCP 443/80 全超时）正好踩这个。
    修法：close code 改用 `(?<!\\d)1006(?!\\d)` 带数字边界匹配。
    """
    for text in (
        "无法连接苏大 DeepSeek：[WinError 1225] 远程计算机拒绝网络连接。",
        "无法连接苏大 DeepSeek：[WinError 10060] 由于连接方在一段时间后没有正确答复"
        "或连接的主机没有反应，连接尝试失败。",
        "无法连接苏大 DeepSeek：[WinError 10061] 由于目标计算机积极拒绝，无法连接。",
    ):
        exc = suda_api.UpstreamError(502, text)
        assert suda_api.is_transient_ws_error(exc) is False, f"误命中: {text}"


def test_close_code_still_matched_with_boundary():
    """阳性对照：真正的 close code 1006 / 1011 仍必须命中 —— 数字边界不能误伤它。

    这几条文本都**不含**其它提示词，只能靠正则命中，否则就成了「修了误报、丢了真阳性」。
    """
    for text in (
        "received 1006 (abnormal closure)",
        "websocket closed with code 1011",
        "connection closed (1006)",
        "1006",
    ):
        exc = suda_api.UpstreamError(502, text)
        assert suda_api.is_transient_ws_error(exc) is True, f"应命中却漏了: {text}"


if __name__ == "__main__":
    names = sorted(k for k in list(globals()) if k.startswith("test_"))
    failures = 0
    for name in names:
        try:
            globals()[name]()
            print(f"PASS  {name}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL  {name}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"ERROR {name}: {type(exc).__name__}: {exc}")
    print(f"\n{len(names) - failures}/{len(names)} 通过")
    sys.exit(1 if failures else 0)
