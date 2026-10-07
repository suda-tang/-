# -*- coding: utf-8 -*-
"""回归测试：**「broker 忙」不许被判成「服务死了」**（否则守护会腰斩在途任务）。

现场（2026-10-03）：
  broker 是单线程的，正在服务页面请求（实测 13~20 秒）或正在重载页面时，
  `/token` 读不到。而 `read_broker_state()` 读不到就返回 `{}` ——
  **「忙」和「死」在返回值上完全一样**。于是：
    · `/health` 内部 `read_broker_state()` 默认超时 2 秒，而守护的探测总超时也是 2 秒
      → **预算里没有余量**，broker 一忙必然被判「接口无响应」；
    · 守护连续 3 次（约 45 秒）就把一个**完全健康**的服务杀掉。
  supervisor.log 实测：11:55:40 / 11:55:57 / 11:56:14 三次失败 → 11:56:16 重启子进程，
  而当时服务正在正常工作 —— **用户的在途任务被腰斩。**

修法（两道）：
  1. `service_ok()`：`broker_online` **或** `broker_recently_ok` 都算健康；
  2. 超时留余量：`/health` 读 broker 只给 1 秒、守护探测给 5 秒。

本测试三组：
  [1] `service_ok()` 的四个判据（含**改动前对照**：旧判据必须把「忙」误判成不健康）；
  [2] `broker_recently_ok()` 的新鲜度语义（刚读到=真、从未读到=假、超时=假）；
  [3] 源码守卫：超时数字必须留余量（读真实代码，不抄常量）。

跑法：`Python312\\python.exe test_broker_busy_not_dead.py`
"""
from __future__ import annotations

import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import launcher  # noqa: E402
import suda_api  # noqa: E402

PASS = 0
FAIL = 0
FAILURES: list[str] = []


def check(cond: bool, name: str, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        FAILURES.append(name)
        print(f"  FAIL  {name}  {extra}")


print("=" * 72)
print(" 回归：broker 忙 ≠ 服务死（守护不许腰斩在途任务）")
print("=" * 72)

# ── [1] service_ok 的判据 ────────────────────────────────────────────
print("\n[1] service_ok() 判据")
_orig_state = launcher.service_state


def with_state(payload):
    launcher.service_state = lambda port=8765, timeout=5.0: payload
    try:
        return launcher.service_ok()
    finally:
        launcher.service_state = _orig_state


def old_service_ok(state):
    """**改动前**的判据（原样复刻），用来证明新判据不是空洞的。"""
    if not state:
        return False
    return bool(state.get("broker_online"))


# ① 接口真的没响应
ok1, why1 = with_state(None)
check(ok1 is False and "接口无响应" in why1, "接口没响应 → 不健康", f"got {(ok1, why1)!r}")

# ② 一切正常
ok2, why2 = with_state({"broker_online": True, "broker_recently_ok": True})
check(ok2 is True, "broker 在线 → 健康", f"got {(ok2, why2)!r}")

# ③ ★ 核心：broker 忙（这一秒没读到，但最近读到过）
busy = {"broker_online": False, "broker_busy": True, "broker_recently_ok": True}
ok3, why3 = with_state(busy)
check(ok3 is True, "★ broker 忙（recently_ok）→ **健康，不许重启**", f"got {(ok3, why3)!r}")
check("忙" in why3, "理由里明确写出「忙」，日志不再含糊", f"got {why3!r}")

# ④ 改动前对照：旧判据必须把「忙」误判成不健康 —— 否则本用例证明不了任何事
check(old_service_ok(busy) is False,
      "★ 改动前对照：旧判据把「忙」误判为不健康（证明修复非空洞）",
      f"old={old_service_ok(busy)!r}")

# ⑤ broker 真的没了（从未读到过 / 超过 60 秒没读到）
dead = {"broker_online": False, "broker_busy": True, "broker_recently_ok": False}
ok5, why5 = with_state(dead)
check(ok5 is False and "登录代理未就绪" in why5, "broker 真的没了 → 不健康（仍会重启）",
      f"got {(ok5, why5)!r}")
check(old_service_ok(dead) is False, "改动前对照：真死时新旧判据一致（没放宽过头）")

# ── [2] broker_recently_ok() 新鲜度 ─────────────────────────────────
print("\n[2] broker_recently_ok() 新鲜度语义")
saved = (suda_api._broker_last_ok_at, suda_api._broker_last_state)
try:
    suda_api._broker_last_ok_at = 0.0
    suda_api._broker_last_state = {}
    check(suda_api.broker_recently_ok() is False, "从未读到过 → False")

    suda_api._remember_broker({"page_ready": True, "access_token": "t"})
    check(suda_api.broker_recently_ok() is True, "刚读到 → True")
    check(suda_api.broker_last_state().get("page_ready") is True, "快照被记下来了")

    suda_api._broker_last_ok_at = time.time() - (suda_api._BROKER_STALE_AFTER + 5)
    check(suda_api.broker_recently_ok() is False,
          f"超过 {suda_api._BROKER_STALE_AFTER:.0f} 秒没读到 → False（真死会被抓到）")

    # 401 也算「读到了」（broker 活着，只是没登录）
    suda_api._broker_last_ok_at = 0.0
    suda_api._remember_broker({})
    check(suda_api.broker_recently_ok() is True,
          "401/空体也算读到了（broker 活着，只是没登录）")
finally:
    suda_api._broker_last_ok_at, suda_api._broker_last_state = saved

# ── [3] 启动宽限期：服务刚起来时不许被守护判死 ──────────────────────
print("\n[3] 启动宽限期（上游恢复期不许被守护腰斩）")

check(suda_api.in_startup_grace() is True,
      "刚启动 → 在宽限期内（守护不会杀正在恢复的服务）")

_saved_started = suda_api._SERVICE_STARTED_AT
try:
    suda_api._SERVICE_STARTED_AT = time.time() - (suda_api._STARTUP_GRACE + 5)
    check(suda_api.in_startup_grace() is False,
          f"超过 {suda_api._STARTUP_GRACE:.0f} 秒 → 宽限期结束（真死照样会被抓到）")
finally:
    suda_api._SERVICE_STARTED_AT = _saved_started

check(suda_api._STARTUP_GRACE >= 120.0,
      f"宽限期 ≥120 秒（当前 {suda_api._STARTUP_GRACE:.0f}s）",
      f"只有 {suda_api._STARTUP_GRACE:.0f}s —— 挡不住上游恢复期的页面重载+重新登录")

with open(os.path.join(HERE, "suda_api.py"), encoding="utf-8") as fh:
    api_src = fh.read()
with open(os.path.join(HERE, "launcher.py"), encoding="utf-8") as fh:
    sup_src = fh.read()

# ★ 源码守卫：必须是「or 叠加」到 /health 字段，而**不是**改掉 broker_recently_ok()
#   的语义 —— 后者有 [2] 守着，改了就会红。
check("broker_recently_ok() or in_startup_grace()" in api_src,
      "★ /health 用「or 叠加」宽限期（没污染 broker_recently_ok 的新鲜度语义）",
      "没找到叠加写法 —— 小心把 [2] 的新鲜度语义改坏了")

# ── [4] 源码守卫：超时数字必须留余量 ────────────────────────────────
print("\n[4] 源码守卫：超时预算必须留余量（读真实代码，不抄常量）")

# /health 里读 broker 的超时
m = re.search(r"broker = read_broker_state\(timeout=([\d.]+)\)", api_src)
check(m is not None, "源码守卫：/health 显式指定了读 broker 的超时（不是默认值）",
      "没找到 `broker = read_broker_state(timeout=...)`")
health_to = float(m.group(1)) if m else 99.0

# 守护探测的超时（默认参数）
m2 = re.search(r"def service_state\(port: int = 8765, timeout: float = ([\d.]+)\)", sup_src)
check(m2 is not None, "源码守卫：service_state 的超时是显式默认参数")
probe_to = float(m2.group(1)) if m2 else 0.0

print(f"      /health 读 broker 超时 = {health_to}s，守护探测超时 = {probe_to}s")
check(probe_to - health_to >= 2.0,
      f"★ 探测超时比 /health 内部超时至少多 2 秒（{probe_to} - {health_to} ≥ 2）",
      f"余量只有 {probe_to - health_to}s —— broker 一忙就会误判")
check(probe_to >= 4.0, f"探测超时 ≥4s（实测 {probe_to}s）", f"got {probe_to}")

print(f"\n结果：PASS={PASS}  FAIL={FAIL}")
if FAILURES:
    print("未通过：" + ", ".join(FAILURES))
sys.exit(0 if FAIL == 0 else 1)
