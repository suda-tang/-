# -*- coding: utf-8 -*-
r"""回归测试：访问**本机**端口必须绕开系统代理。

为什么必须有这个测试（2026-10-03 定位）：
    唐老师机器上 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`（Clash，127.0.0.1:7897）
    是**用户级环境变量** —— 任何从登录会话起的进程都会继承，
    **开机自启的 `SudaDeepSeek-autostart.vbs` 就是**。

    ★ 决定变量不是 `*_PROXY`，而是 **`NO_PROXY` 在不在**：
      - User 级注册表：有代理、**没有 NO_PROXY**  → 开机自启那条路没有保护；
      - 编辑器/工具调用环境：工具会注入 `NO_PROXY=localhost,127.0.0.1,::1`
        → 所以**手动跑永远正常**，这个坑因此长期隐身。

    实测（清掉 NO_PROXY、把 HTTP_PROXY 指向一个死端口）：
        默认 urlopen      → URLError [WinError 10061] 由于目标计算机积极拒绝，无法连接。
        ProxyHandler({})  → 200
    （若代理**在听**，默认 urlopen 反而会靠代理转发 loopback 碰巧成功 ——
      所以准确的触发条件是「代理变量在 **且代理不可达**」。）

    后果（修之前）：
      ① `launcher.service_state()` 在代理不可达时失败 → 守护认为服务死了 → **反复重启**（浏览器被反复关掉）；
      ② `suda_api` 里 3 处调本机 broker（读 token / invalidate / chat）同样失败 → 拿不到 token → 所有请求挂。

    ★ 这个 bug 的特点是「现在不犯、开机才可能犯」：当前服务是从**工具环境**起的
      （带 NO_PROXY），所以一切正常；一旦开机自启接管（没有 NO_PROXY），
      只要 Clash 还没起来就会犯。**必须靠测试守住，不能靠现场撞。**

跑法：Python312\python.exe test_proxy_bypass.py
（需要 8765 在跑；A 组要用到真实 /health）
"""
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

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


# ★ 先制造「有代理」的环境，再导入被测模块 —— 让导入期的常量也吃到这个环境。
DEAD_PROXY = "http://127.0.0.1:7890"   # 死端口，真走代理必然连不上
for k in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
          "http_proxy", "https_proxy", "all_proxy"):
    os.environ[k] = DEAD_PROXY
os.environ.pop("NO_PROXY", None)
os.environ.pop("no_proxy", None)

import launcher  # noqa: E402
import suda_api  # noqa: E402

print("=" * 62)
print(" 本机端口必须绕开系统代理 —— 回归测试")
print(f" （已注入 HTTP_PROXY={DEAD_PROXY} 并 pop 掉 NO_PROXY，模拟开机自启场景）")
print("=" * 62)

# ── D 组（先做对照）：证明「有代理」这个条件**真的**会让默认 urlopen 失败 ──
# 没有这一组，A 组通过了也说明不了任何事（可能只是代理没生效）。
print("\n[D] 阳性对照：默认 urlopen 在代理环境下必须失败")
try:
    with urllib.request.urlopen("http://127.0.0.1:8765/health", timeout=3) as r:
        bad("对照失效：默认 urlopen 竟然通了 —— 说明代理没生效，A 组将无意义",
            f"status={r.status}")
except Exception as exc:  # noqa: BLE001
    ok(f"对照成立：默认 urlopen 如期失败（{type(exc).__name__}: {str(exc)[:60]}）")

# ── A 组：绕代理的路径必须能通 ──
print("\n[A] 绕代理后必须能读到本机 /health")
st = launcher.service_state()
if isinstance(st, dict) and st.get("status") == "ok":
    ok("launcher.service_state() 绕代理成功")
else:
    bad("launcher.service_state() 仍然失败（守护会误判服务已死 → 无限重启）", repr(st))

try:
    with launcher._LOCAL_OPENER.open("http://127.0.0.1:8765/health", timeout=3) as r:
        ok(f"launcher._LOCAL_OPENER 直连成功（status={r.status}）")
except Exception as exc:  # noqa: BLE001
    bad("launcher._LOCAL_OPENER 失败", f"{type(exc).__name__}: {exc}")

try:
    with suda_api._LOCAL_OPENER.open("http://127.0.0.1:8766/status", timeout=3) as r:
        ok(f"suda_api._LOCAL_OPENER 能连本机 broker（status={r.status}）")
except Exception as exc:  # noqa: BLE001
    bad("suda_api._LOCAL_OPENER 连本机 broker 失败（拿不到 token）",
        f"{type(exc).__name__}: {exc}")

# ── B 组：两个 opener 都必须**确实**不含 ProxyHandler ──
print("\n[B] opener 的 handler 里不许有 ProxyHandler")
for mod in (launcher, suda_api):
    kinds = [type(h).__name__ for h in mod._LOCAL_OPENER.handlers]
    if "ProxyHandler" not in kinds:
        ok(f"{mod.__name__}._LOCAL_OPENER 不含 ProxyHandler（{kinds}）")
    else:
        bad(f"{mod.__name__}._LOCAL_OPENER 里居然有 ProxyHandler", str(kinds))

# ── C 组：交给子进程的环境必须清掉代理 ──
print("\n[C] 子进程环境必须清掉所有 *_PROXY")
env = launcher.child_env()
left = [k for k in env if k.upper() in (
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")]
if not left:
    ok("child_env() 里没有任何 *_PROXY")
else:
    bad("child_env() 里还残留代理变量（子进程仍会被打穿）", str(left))
if env.get("NO_PROXY") == "*" and env.get("no_proxy") == "*":
    ok("child_env() 设了 NO_PROXY='*' / no_proxy='*'")
else:
    bad("child_env() 没设 NO_PROXY", f"NO_PROXY={env.get('NO_PROXY')!r}")
for key in ("PYTHONUTF8", "PYTHONUNBUFFERED", "PYTHONIOENCODING"):
    if env.get(key):
        ok(f"child_env() 保留了 {key}")
    else:
        bad(f"child_env() 丢了 {key}")
# 别的变量不许被误删（只该删代理）
if env.get("PATH") == os.environ.get("PATH"):
    ok("child_env() 没有误删无关变量（PATH 保持一致）")
else:
    bad("child_env() 把无关变量也改了")

print()
print(f"结果：PASS={PASS}  FAIL={FAIL}")
sys.exit(0 if FAIL == 0 else 1)
