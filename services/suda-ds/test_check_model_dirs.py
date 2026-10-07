# -*- coding: utf-8 -*-
r"""回归测试：`check-model.py` 必须**只挑日期目录**，不能靠 mtime 猜。

## 背景（2026-10-01 实测踩到）

`recent_logs()` 原来按**目录 mtime** 倒序取前 N 个当「最近几天的日志目录」。
但 `~/.workbuddy/logs` 根下混着一堆**非日期目录**：

```
startup        22:25:43   ← mtime 最新
mcp-runtime    13:31:46
2026-10-01     12:56:22   ← 真正的日期目录，被挤到第 3 位
update         12:55:49
```

`dirs[:2]` 取到的是 `startup` + `mcp-runtime`，**日期目录整个被切掉**，
脚本于是报：

```
没找到任何请求记录。日志目录：C:\Users\mail\.workbuddy\logs
```

**真相是「目录选错了」，不是「没有请求」。** 要是信了这个结论，
排查方向会完全跑偏（去查「为什么客户端不发请求」，而其实只是脚本没读到日志）。

这和「观测链路自己会漏」是同一类问题：**你以为在看数据，其实在看残缺的数据。**

本文件把「只认日期目录」和「按目录名排序」钉住。
"""
import importlib.util
import os
import sys
import tempfile
import time
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))


def _load():
    spec = importlib.util.spec_from_file_location(
        "check_model", os.path.join(HERE, "check-model.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_logs(tmp: str, date_dirs: list[str], noise_dirs: list[str]) -> None:
    """造一个假 logs 目录：日期目录 + 非日期目录（噪声目录 mtime 更新）。"""
    for name in date_dirs + noise_dirs:
        day = os.path.join(tmp, name)
        os.makedirs(day, exist_ok=True)
        with open(os.path.join(day, "x.log"), "w", encoding="utf-8") as handle:
            handle.write("dummy\n")
    # 把日期目录的 mtime 做旧 —— 证明实现**不看 mtime**
    old = time.time() - 86400 * 3
    for name in date_dirs:
        try:
            os.utime(os.path.join(tmp, name), (old, old))
        except OSError:
            pass


def test_only_date_dirs_are_picked():
    """★ 非日期目录（mtime 更新）不能把日期目录挤掉。"""
    module = _load()
    original = module.LOG_DIR
    with tempfile.TemporaryDirectory() as tmp:
        _make_logs(tmp, ["2026-09-30", "2026-10-01"],
                   ["startup", "mcp-runtime", "update", "migration", "Crash-Log"])
        module.LOG_DIR = Path(tmp)
        try:
            picked = [d.name for d in module.recent_logs(2)]
        finally:
            module.LOG_DIR = original
    assert picked == ["2026-10-01", "2026-09-30"], \
        f"应只挑日期目录、按目录名倒序，实际挑到 {picked}"


def test_date_dirs_sorted_by_name_not_mtime():
    """排序依据必须是**目录名**（日期天然可比），不是 mtime。

    mtime 会被「目录里有文件被写」影响，用它排序等于把「最近改过的」
    当成「最近的日期」—— 这两件事不是一回事。
    """
    module = _load()
    original = module.LOG_DIR
    with tempfile.TemporaryDirectory() as tmp:
        _make_logs(tmp, ["2026-09-28", "2026-10-01", "2026-09-30"], [])
        # 故意把**最旧**的日期目录 mtime 改成最新
        newest = time.time()
        os.utime(os.path.join(tmp, "2026-09-28"), (newest, newest))
        module.LOG_DIR = Path(tmp)
        try:
            picked = [d.name for d in module.recent_logs(3)]
        finally:
            module.LOG_DIR = original
    assert picked == ["2026-10-01", "2026-09-30", "2026-09-28"], \
        f"必须按目录名倒序（mtime 干扰不了它），实际 {picked}"


def test_collect_reports_where_it_scanned():
    """★ `collect` 必须回报「扫了哪些文件」——「目录选错了」和「真的没有请求」
    必须能区分开，否则又是一个假结论。
    """
    module = _load()
    original = module.LOG_DIR
    with tempfile.TemporaryDirectory() as tmp:
        _make_logs(tmp, ["2026-10-01"], ["startup"])
        # 往日期目录里塞一条真实形状的记录
        line = ("[2026/10/1 13:27:24.628] [Info] [ModelProvider]  "
                "[ModelProvider] Sending request: agent=cli, "
                "model=custom-local:suda-deepseek, requestId=abc, stream=true, "
                "url=http://127.0.0.1:8765/v1/chat/completions\n")
        with open(os.path.join(tmp, "2026-10-01", "x.log"), "w", encoding="utf-8") as handle:
            handle.write(line)
        module.LOG_DIR = Path(tmp)
        try:
            rows, scanned = module.collect(25)
        finally:
            module.LOG_DIR = original

    assert len(rows) == 1, f"应解析出 1 条记录，实际 {len(rows)}"
    assert rows[0][1] == "custom-local:suda-deepseek"
    assert rows[0][2].startswith("http://127.0.0.1:8765"), "URL 应解析出来"
    assert scanned, "必须回报扫过的文件（用于区分「没请求」和「没扫到」）"
    assert all("startup" not in str(p) for p in scanned), \
        f"不该扫非日期目录：{[str(p) for p in scanned]}"


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
