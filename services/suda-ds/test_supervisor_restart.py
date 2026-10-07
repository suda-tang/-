r"""守护进程「单次探测失败不许重启」的回归测试。

为什么需要它（2026-10-03 实测）：
    原逻辑是 `if alive and not ok: terminate()` —— 探测超时只有 2 秒，
    一次偶发的 ConnectionAbortedError（launcher.log 09:23:32 就有一条）
    就让守护把一个**完全健康**的服务杀掉：浏览器被一起关掉，
    重新拉起 + 重新认证要 30 秒以上。
    现在改成「连续失败 SUDA_DEEPSEEK_FAIL_THRESHOLD 次（默认 3）」才动手。

测试手法：把 service_ok / log_line / subprocess.Popen / 单例锁端口全部换成替身，
在子线程里跑**真实的 supervise() 循环**，然后断言日志与 terminate 次数。

⚠️ 两个坑（第一版测试就踩了，记下来）：
  1. `log_line()` **不看 `LOG_PATH`** —— 它把日志硬写到 `HERE/supervisor.log`。
     所以想捕获日志必须替身 `launcher.log_line`，否则会污染真实日志。
  2. 失败序列必须**单调**：第一版写了 `[True, False, False, True, True]`，
     第 4 个探测又返回 True 把 fails 清零了，于是「第 2/3 次」永远不出现 ——
     看着像实现坏了，其实是**测试数据错了**。断言前先确认序列本身符合预期。

跑法：Python312\python.exe test_supervisor_restart.py
"""
import os
import socket
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import launcher  # noqa: E402

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


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class FakeChild:
    def __init__(self):
        self.alive = True
        self.terminated = 0
        self.killed = 0

    def poll(self):
        return None if self.alive else 0

    def terminate(self):
        self.terminated += 1
        self.alive = False

    def kill(self):
        self.killed += 1
        self.alive = False

    def wait(self, timeout=None):
        return 0


def run_case(name, ok_sequence, threshold, stop_after, want_restart, want_launch):
    """ok_sequence: 探测返回值序列（越界后重复最后一个）。
    stop_after:   第几次探测时抛 KeyboardInterrupt 收尾（supervise 自己会捕）。"""
    orig = (launcher.SUPERVISE_LOCK_PORT, launcher.service_ok,
            launcher.subprocess.Popen, launcher.log_line)
    lines: list[str] = []
    children = []
    calls = {"n": 0}

    def fake_service_ok(port=8765):
        i = calls["n"]
        calls["n"] += 1
        if calls["n"] >= stop_after:
            raise KeyboardInterrupt
        good = ok_sequence[min(i, len(ok_sequence) - 1)]
        return (good, "正常" if good else "接口无响应")

    def fake_popen(*a, **k):
        c = FakeChild()
        children.append(c)
        return c

    try:
        launcher.SUPERVISE_LOCK_PORT = free_port()
        launcher.service_ok = fake_service_ok
        launcher.subprocess.Popen = fake_popen
        launcher.log_line = lines.append
        os.environ["SUDA_DEEPSEEK_FAIL_THRESHOLD"] = str(threshold)

        t = threading.Thread(
            target=launcher.supervise, args=("127.0.0.1", 8765, 0.01), daemon=True
        )
        t.start()
        t.join(timeout=10)
        time.sleep(0.05)
    finally:
        (launcher.SUPERVISE_LOCK_PORT, launcher.service_ok,
         launcher.subprocess.Popen, launcher.log_line) = orig
        os.environ.pop("SUDA_DEEPSEEK_FAIL_THRESHOLD", None)

    text = "\n".join(lines)
    restarts = text.count("重启子进程")
    launches = text.count("正在拉起")
    terminations = sum(c.terminated for c in children)
    # ⚠️ terminate 次数 = 重启次数 + 收尾一次（supervise 的 finally 也会 terminate 存活子进程）。
    #    第一版直接把 terminations 和 want_restart 比，结果 4 个用例假失败 ——
    #    又是「断言自己的假设错了」，不是实现错了。
    expected_term = want_restart + (1 if want_launch > 0 else 0)
    detail = (f"[探测={calls['n']} 重启={restarts} 拉起={launches} "
              f"terminate={terminations}(含收尾1次)]")

    if restarts == want_restart and launches == want_launch and terminations == expected_term:
        ok(f"{name} {detail}")
    else:
        bad(f"{name} 期望 重启{want_restart}/拉起{want_launch}/term{expected_term}，"
            f"实际 {restarts}/{launches}/{terminations}", detail)
        for line in text.splitlines():
            print("      | " + line)
    return text


print("=" * 62)
print(" 守护进程重启策略回归测试（阈值默认 3）")
print("=" * 62)

# A. 连续失败 2 次（未达阈值 3）→ 不许重启，但日志要留痕
txt = run_case("A 失败 2 次不重启", [True, False], threshold=3,
               stop_after=5, want_restart=0, want_launch=1)
ok("A 日志留痕「先观察不重启」") if "先观察不重启" in txt else bad("A 缺「先观察不重启」")
ok("A 明确出现「第 1/3 次」") if "第 1/3 次" in txt else bad("A 缺「第 1/3 次」")
ok("A 明确出现「第 2/3 次」") if "第 2/3 次" in txt else bad("A 缺「第 2/3 次」")
bad("A 不该出现重启") if "重启子进程" in txt else ok("A 没有出现重启")

# B. 连续失败到阈值 3 → 必须重启一次
txt = run_case("B 连续 3 次失败必重启", [True, False], threshold=3,
               stop_after=7, want_restart=1, want_launch=2)
ok("B 日志写明「连续 3 次探测失败」") if "连续 3 次探测失败" in txt \
    else bad("B 缺「连续 3 次探测失败」")

# C. 全程健康 → 不重启、也不重复拉起
run_case("C 全程健康不重启", [True], threshold=3,
         stop_after=6, want_restart=0, want_launch=0)

# D. 阈值可配：阈值 2 时两次失败就该重启
txt = run_case("D 阈值=2 两次失败即重启", [True, False], threshold=2,
               stop_after=6, want_restart=1, want_launch=2)
ok("D 日志写明「第 1/2 次」") if "第 1/2 次" in txt else bad("D 缺「第 1/2 次」")

# E. 失败一次 → 恢复健康 → 再失败一次：计数必须被清零（不能攒着）
#    序列要**交替**，否则第 3 次失败就真重启了。
txt = run_case("E 恢复健康后计数清零", [True, False, True, False, True, False],
               threshold=3, stop_after=7, want_restart=0, want_launch=1)
ok("E 出现了「第 1/3 次」两次（说明中间清零过）") \
    if txt.count("第 1/3 次") == 2 else bad("E 计数没清零", f"count={txt.count('第 1/3 次')}")

# ── 对照模式：把「改动前」对照做成**可重复运行**的开关 ────────────────
# 为什么要有：我原本是手工把 launcher.py 改回旧版跑一遍（FAIL=11）再改回来 ——
# 那是一次性动作，下次谁也不会记得重做。这里把它固化成 `--control`。
# 等价性说明：旧代码没有计数器，等价于「阈值=1」——
#   fails=1; if fails < 1  →  False  →  立刻重启。行为完全一致。
if "--control" in sys.argv:
    print("─ 对照模式：阈值=1（行为等价于改动前「单次失败即重启」）─")
    ctl = run_case("对照 阈值=1 单次失败即重启", [True, False], threshold=1,
                   stop_after=5, want_restart=1, want_launch=2)
    if "重启子进程" in ctl and "先观察不重启" not in ctl:
        ok("对照成立：阈值=1 时确实单次失败就重启 → 上面的用例真挡得住回归")
    else:
        bad("对照不成立：阈值=1 居然没立刻重启，说明用例可能没测到真东西")

print()
print(f"结果：PASS={PASS}  FAIL={FAIL}")
sys.exit(0 if FAIL == 0 else 1)
