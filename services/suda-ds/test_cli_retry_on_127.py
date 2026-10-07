# -*- coding: utf-8 -*-
"""回归测试：CLI 启动被 `timeout` 层吞掉（rc=127）时**必须重试**。

## 坑 18（2026-10-03）现场

`cli-e2e.sh` 的并发用例偶发报 `退出码=127 输出字节=0`。
A/B/C 对照（见 `_probe_cli_127.py`）定性：

| 组 | 条件 | 结果 |
|---|---|---|
| A | 并发 + 带 `timeout` | 24 次里 **2 次 127**（8%）← 现场复现 |
| B | 并发 + 不带 `timeout` | 24/24 全 0 |
| C | 串行 + 不带 `timeout` | 24/24 全 0 |

→ 元凶是 **Git Bash 的 `timeout`（coreutils 8.32，MSYS fork 模拟）**，
不是模型、不是服务端、也不是并发本身。

## 本测试怎么验

**不抄一份** `run_cli` 来测（那样测的是副本，不是真代码）——
而是从 `cli-e2e.sh` **原文里抽出** `run_cli()` 函数体，喂给一个真 bash 执行，
配一个**桩命令**：第一次调用退 127、第二次正常退 0。

断言：
1. 桩命令被调了 **2 次**（说明真的重试了）；
2. 最终 rc = **0**（说明重试救回来了）；
3. 输出里出现 `[坑18]` 提示（说明是可观测的，不是静默重试）；
4. 源码守卫：`cli-e2e.sh` 里确实存在 127 重试（防止以后被删）。

⚠ 前提：本机得有 bash。没有就 **rc=2 跳过**，不假装通过。
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
E2E = os.path.join(HERE, "cli-e2e.sh")

PASS = 0
FAIL = 0


def ok(msg: str) -> None:
    global PASS
    PASS += 1
    print(f"PASS  {msg}")


def bad(msg: str) -> None:
    global FAIL
    FAIL += 1
    print(f"FAIL  {msg}")


def extract_run_cli(src: str) -> str:
    """从 cli-e2e.sh 原文里抽出 run_cli() 函数体（整段，到行首的 `}` 为止）。"""
    lines = src.splitlines()
    out: list[str] = []
    inside = False
    for line in lines:
        if line.startswith("run_cli() {"):
            inside = True
        if inside:
            out.append(line)
            if line == "}":
                break
    return "\n".join(out)


def main() -> int:
    if not shutil.which("bash"):
        print("SKIP: 本机没有 bash，无法验证 run_cli（rc=2）")
        return 2
    if not os.path.exists(E2E):
        print(f"SKIP: 找不到 {E2E}（rc=2）")
        return 2

    with open(E2E, encoding="utf-8") as handle:
        e2e_src = handle.read()

    # ── [0] 源码守卫：重试必须真的在脚本里 ──────────────────────────────
    fn = extract_run_cli(e2e_src)
    if not fn.startswith("run_cli() {"):
        bad("源码守卫：cli-e2e.sh 里找不到 run_cli() 函数")
        return 1
    ok("源码守卫：cli-e2e.sh 里有 run_cli() 函数")
    if 'rc" != "127"' in fn or 'rc" != "127"' in e2e_src:
        ok("源码守卫：run_cli 里有针对 rc=127 的判据")
    else:
        bad("源码守卫：run_cli 里没有 rc=127 判据 —— 坑 18 的修复被删了")
    if "坑18" in fn or "坑 18" in fn:
        ok("源码守卫：重试时有 [坑18] 提示（可观测，不是静默重试）")
    else:
        bad("源码守卫：重试没有 [坑18] 提示 —— 应该让人看见发生了什么")

    # ── [1] 真跑一次：桩命令第一次 127、第二次 0 ────────────────────────
    with tempfile.TemporaryDirectory() as tmp:
        stub = os.path.join(tmp, "stub.sh")
        count_file = os.path.join(tmp, "count")
        log = os.path.join(tmp, "out.log")
        with open(stub, "w", encoding="utf-8") as handle:
            handle.write(
                "#!/bin/sh\n"
                f'n=$(cat "{count_file}" 2>/dev/null || echo 0)\n'
                "n=$((n+1))\n"
                f'echo "$n" > "{count_file}"\n'
                'if [ "$n" -eq 1 ]; then exit 127; fi\n'
                'echo "OK on attempt $n"\n'
                "exit 0\n"
            )
        os.chmod(stub, 0o755)

        script = (
            f"{fn}\n"
            f'NODE="{stub}"\n'
            'CLI="ignored-arg"\n'
            'MODEL="m"\n'
            'RUNID="r1"\n'
            'CLI_TIMEOUT="20"\n'
            f'run_cli "{tmp}" "sid" "prompt" "" "{log}"\n'
        )
        proc = subprocess.run(
            ["bash", "-c", script],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=120,
        )
        combined = (proc.stdout or b"").decode("utf-8", "replace")

        try:
            calls = int((open(count_file, encoding="utf-8").read().strip() or "0"))
        except (OSError, ValueError):
            calls = -1

        if calls == 2:
            ok(f"桩命令被调用了 {calls} 次（第一次 127 → 真的重试了）")
        else:
            bad(f"桩命令调用次数 = {calls}，期望 2（没重试？）")

        rc_file = ""
        if os.path.exists(log + ".rc"):
            rc_file = open(log + ".rc", encoding="utf-8").read().strip()
        if rc_file == "0":
            ok(f"最终 rc = {rc_file}（重试把结果救回来了）")
        else:
            bad(f"最终 rc = {rc_file!r}，期望 0")

        try:
            body = open(log, encoding="utf-8").read()
        except OSError:
            body = ""
        if "OK on attempt 2" in body:
            ok("第二次调用真的成功了（日志里有 OK on attempt 2）")
        else:
            bad(f"日志里没有第二次成功的痕迹：{body!r}")

        if "坑18" in combined or "坑 18" in combined:
            ok("重试时打印了 [坑18] 提示（可观测）")
        else:
            bad(f"重试时没有 [坑18] 提示，输出={combined!r}")

    # ── [2] 阴性对照：桩命令一直 127 → 不该死循环，最终 rc 还是 127 ──────
    with tempfile.TemporaryDirectory() as tmp:
        always = os.path.join(tmp, "always127.sh")
        log = os.path.join(tmp, "out.log")
        with open(always, "w", encoding="utf-8") as handle:
            handle.write("#!/bin/sh\nexit 127\n")
        os.chmod(always, 0o755)
        script = (
            f"{fn}\n"
            f'NODE="{always}"\n'
            'CLI="x"\nMODEL="m"\nRUNID="r2"\nCLI_TIMEOUT="20"\n'
            f'run_cli "{tmp}" "sid" "prompt" "" "{log}"\n'
        )
        proc = subprocess.run(
            ["bash", "-c", script],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=120,
        )
        rc_file = ""
        if os.path.exists(log + ".rc"):
            rc_file = open(log + ".rc", encoding="utf-8").read().strip()
        if rc_file == "127":
            ok("阴性对照：一直 127 时最终 rc 仍是 127（没把真失败粉饰成成功）")
        else:
            bad(f"阴性对照：一直 127 时最终 rc = {rc_file!r}，期望 127（别粉饰失败）")

    print(f"\n结果：PASS={PASS}  FAIL={FAIL}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
