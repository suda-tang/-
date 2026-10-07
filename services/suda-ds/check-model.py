# -*- coding: utf-8 -*-
"""自检：WorkBuddy 当前到底在用哪个模型？

界面上显示「选中了苏州大学 DeepSeek」不代表请求真的发给了它 ——
会话会记住自己上次用的模型，把全局默认覆盖掉。
唯一可信的判据是 WorkBuddy 日志里每一次真实请求的 model + url。

用法：
    python check-model.py            # 看今天最近的真实请求
    python check-model.py 40         # 多看一些（默认 25 条）
"""

from __future__ import annotations

import os
import re
import sys
import time
from pathlib import Path

LOG_DIR = Path.home() / ".workbuddy" / "logs"
LOCAL_HINT = "127.0.0.1:8765"

# [2026/9/30 21:37:53.827] ... Sending request: agent=cli, model=hy3, requestId=xxx, stream=true, url=https://...
RE_LINE = re.compile(
    r"\[(?P<ts>\d{4}/\d{1,2}/\d{1,2} [\d:.]+)\].*?Sending request:.*?"
    r"model=(?P<model>[^,]+).*?url=(?P<url>\S+)"
)

# ★ 只认「日期目录」（`YYYY-MM-DD`）。
#
# 原来用「按 mtime 排序取前 N 个目录」来挑日期 —— 实测踩到（2026-10-01）：
# `~/.workbuddy/logs` 根下混着 `startup` / `mcp-runtime` / `update` / `migration` /
# `Crash-Log` 这些**非日期目录**，它们的 mtime 常常比日期目录更新
# （实测 `startup` 是 22:25、`2026-10-01` 是 12:56），于是 `dirs[:2]` 把日期目录
# 整个挤掉，脚本报「没找到任何请求记录」—— 一个**会把人带偏的假结论**
# （真相是「目录选错了」，不是「没有请求」）。
# 现在按**目录名**排（日期名天然可比），不靠 mtime。
RE_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def recent_logs(days: int = 2):
    """按目录名倒序返回最近几天的日期目录（只认 `YYYY-MM-DD`）。"""
    if not LOG_DIR.exists():
        return []
    dirs = [d for d in LOG_DIR.iterdir() if d.is_dir() and RE_DAY.match(d.name)]
    dirs.sort(key=lambda d: d.name, reverse=True)
    return dirs[:days]


def collect(limit: int):
    """返回 (记录列表, 扫过的日志文件列表)。

    ★ 第二个返回值是为了**可见性**：脚本说「没找到」时，必须能看出它到底扫了哪里 ——
    否则「目录选错了」和「真的没有请求」长得一模一样（这个坑刚踩过）。
    """
    rows, scanned = [], []
    for day in recent_logs():
        for path in sorted(day.glob("*.log"), key=lambda p: p.stat().st_mtime, reverse=True):
            scanned.append(path)
            try:
                with open(path, encoding="utf-8", errors="replace") as f:
                    for line in f:
                        if "Sending request" not in line:
                            continue
                        m = RE_LINE.search(line)
                        if m:
                            rows.append((m.group("ts"), m.group("model").strip(),
                                         m.group("url").strip(), path.name))
            except OSError:
                continue
        if len(rows) >= limit:
            break
    rows.sort(key=lambda r: r[0])
    return rows[-limit:], scanned


def main() -> int:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 25
    rows, scanned = collect(limit)

    print("=" * 72)
    print("WorkBuddy 真实请求记录（最近 %d 条）" % len(rows))
    print("=" * 72)
    # ★ 先报「扫了哪里」——「目录选错了」和「真的没有请求」必须能区分开。
    days = ", ".join(d.name for d in recent_logs()) or "无"
    print("扫描范围：%s" % LOG_DIR)
    print("          日期目录 %s，共 %d 个日志文件" % (days, len(scanned)))
    if not rows:
        print()
        print("没找到任何请求记录。扫过的文件：")
        for path in scanned[:10]:
            print("    %s" % path.name)
        if len(scanned) > 10:
            print("    …（共 %d 个）" % len(scanned))
        print("⚠ 先确认上面「日期目录」是不是你预期的那天 —— 曾因为根目录下混着")
        print("   startup / mcp-runtime 等非日期目录、按 mtime 取前 N 个把它们")
        print("   当成了日期目录，报出过「没有任何请求」的假结论。")
        return 1

    for ts, model, url, src in rows:
        local = LOCAL_HINT in url
        mark = "本地✅" if local else "云端  "
        print("%s %s  %s  %s" % (mark, ts[-14:], model.ljust(28), url[:46]))

    used_local = [r for r in rows if LOCAL_HINT in r[2]]
    print("-" * 72)
    if used_local:
        print("结论：最近 %d 条里有 %d 条打到本地服务 %s —— 模型确实在用。"
              % (len(rows), len(used_local), LOCAL_HINT))
        print("最近一次本地请求：%s" % used_local[-1][0])
    else:
        print("结论：最近 %d 条请求**没有一条**打到 %s。" % (len(rows), LOCAL_HINT))
        print("      WorkBuddy 现在用的是云端模型，本地服务没参与。")
        print("      界面显示「选中了自定义模型」不代表请求会发给它 ——")
        print("      老会话会沿用自己的模型，把全局默认覆盖掉。")
        print("      解决：新建一个会话，在模型选择器里选「苏州大学 DeepSeek」。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
