# -*- coding: utf-8 -*-
r"""回归测试：`PageRetryTimer` 的**调用点**只能喂「页面是否就绪」。

── 缺陷现场（2026-10-03）──────────────────────────────────────────
  09:42:15  一次 WS 直连超时 → 降级走页面 → 页面回答成功（HTTP 200）
  09:42:40  「已开启全新会话」之后，页面上 99 个 textarea 的宽高全为 0
            （它们是历史消息里内嵌的展示用 textarea，className=question），
            没有可见输入框 → locate_input() 返回 None → page_ready=false
  09:42:44~09:48  约 5 分钟里，launcher.log **一次**「自动重新加载」都没有
  人工 POST /reload 后，page_ready 立刻回到 true（可见 textarea 0 → 1）

── 根因 ────────────────────────────────────────────────────────────
  调用点写的是   if page_retry.due(bool(page_ready or token)):
  而 `PageRetryTimer.due(ready=True)` 会**直接 reset 并返回 False**。
  token 一旦拿到就长期有值（正常情况一直有）→ 判据恒为 True → 计时器永不触发。
  于是「token 有效但页面卡死」时兜底**静默失效、无法自愈**。

── 阳性对照（证明计时器本身是好的）────────────────────────────────
  凌晨断网时页面打不开、token 也取不到（token 为空 → 旧判据恰好为 False），
  launcher.log 里「自动重新加载」出现 **136 次**。
  所以坏的只是调用点传参，不是计时器。

── 为什么用「源码守卫」而不只是行为测试 ──────────────────────────
  缺陷在**调用点的一个表达式**上。若测试自己把那个表达式抄一遍
  （原来的版本就是 `t.due(bool(page_ready or TOKEN))`），
  那修了实现它照样红 —— 正是「测试写死实现形状」的老毛病。
  所以这里**直接读 `suda_broker.py` 的真实调用行**来断言。

跑法：Python312\python.exe test_page_retry_call_site.py
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from suda_broker import PageRetryTimer  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BROKER = os.path.join(HERE, "suda_broker.py")
DELAY = 45.0
TOKEN = "1f528b24e805fd03ae0633ff1458bf22"  # 形态同真实 token，仅用于判据

PASS = 0
FAIL = 0


def ok(name):
    global PASS
    PASS += 1
    print(f"  PASS  {name}")


def bad(name, extra=""):
    global FAIL
    FAIL += 1
    print(f"  FAIL  {name}  {extra}")


def real_call_sites():
    """返回 `suda_broker.py` 里所有 `page_retry.due(...)` 的实际参数文本。"""
    with open(BROKER, encoding="utf-8") as handle:
        source = handle.read()
    return re.findall(r"page_retry\.due\(([^)]*)\)", source)


print("=" * 66)
print(" PageRetryTimer 调用点回归测试（页面卡死能否自愈）")
print("=" * 66)

# ── 1. 阳性对照：计时器在 ready=False 时必须能触发 ──────────────────
print("\n[1] 阳性对照：计时器本身是好的")
timer = PageRetryTimer(DELAY)
now = 1000.0
first = timer.due(False, now=now)
second = timer.due(False, now=now + DELAY)
if first is False and second is True:
    ok("ready=False → 第一次只起表、到点触发（对照成立）")
else:
    bad("计时器坏了：ready=False 竟然不触发", f"first={first} second={second}")

# ── 2. 陷阱说明：喂一个「恒为真」的信号 → 永不触发 ─────────────────
print("\n[2] 陷阱：喂恒为真的信号 → 永不触发（这正是 `or token` 干的事）")
timer = PageRetryTimer(DELAY)
fired = any(timer.due(bool(False or TOKEN), now=now + i * DELAY) for i in range(5))
if fired is False:
    ok("token 有值恒为真 → 连续 5 个周期都不触发（说明为什么不能 or token）")
else:
    bad("恒真信号竟然触发了，与 due() 语义不符")

# ── 3. 源码守卫：真实调用点必须只喂 page_ready ─────────────────────
print("\n[3] 源码守卫：suda_broker.py 的真实调用点")
sites = real_call_sites()
if not sites:
    bad("在 suda_broker.py 里找不到 `page_retry.due(...)` 调用点",
        "（改了实现却忘了改测试？请同步本测试）")
else:
    ok(f"找到 {len(sites)} 处调用点：{[s.strip() for s in sites]}")
    for arg in sites:
        if arg.strip() == "page_ready":
            ok(f"调用点参数正确：due({arg.strip()})")
        else:
            bad(f"调用点参数不对：due({arg.strip()})",
                "必须是 due(page_ready)；带上 token 会让计时器永不触发")
    if any("token" in s for s in sites):
        bad("调用点里出现了 token", "`or token` 会让兜底静默失效（2026-10-03 实测卡 5 分钟）")
    else:
        ok("调用点里没有 token")

# ── 4. 行为等价性：两种写法只在「page_ready=False 且 token 有值」时不同 ──
print("\n[4] 行为等价性：证明改动没有波及其它场景")
diffs = []
for page_ready in (False, True):
    for token in ("", TOKEN):
        old = bool(page_ready or token)
        new = bool(page_ready)
        if old != new:
            diffs.append((page_ready, bool(token)))
if diffs == [(False, True)]:
    ok("两种写法只差在「page_ready=False 且 token 有值」—— 正是缺陷场景")
    ok("登录页 / 断网时 token 为空，行为完全不变（不会引入新副作用）")
else:
    bad("差异集合与预期不符（可能引入了额外副作用）", str(diffs))

print()
print(f"结果：PASS={PASS}  FAIL={FAIL}")
sys.exit(0 if FAIL == 0 else 1)
