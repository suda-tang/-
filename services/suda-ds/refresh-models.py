#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 WorkBuddy 当前的「内置模型 id 全集」写回 models.json 的 availableModels。

为什么需要它
------------
WorkBuddy 里有这么一段（app.asar → WorkbuddyProductManager）：

    applyAvailableModelsFilter(config) {
      if (config.availableModels?.length)
        return { ...config, models: config.models.filter(m => config.availableModels.includes(m.id)) };
    }

也就是说 **availableModels 非空 = 过滤**，凡是没列进去的模型都会从界面消失。
而 WorkBuddy 每次同步都会把自己的清单打进
`~/.workbuddy/logs/<日期>/workbuddyMainThread__*.log`，形如：

    [Merge] Step 4 (availableModels filter): finalModels=36, cli.models=[...]
    [buildResolvedProductConfig] resolved ids: auto, fast-model, ... 

这份清单是**服务端下发、会随版本变**（实测 44 → 54 → 55，陆续多了 glm-5.3 / kimi-k3-1 /
space-bunny 等）。所以 availableModels 不能写死，必须跟着日志刷新 —— 本脚本就是干这个的。

⚠️ 这个「白名单过时」的直接症状就是用户报的
「**官方更新了新模型，但我的客户端没有**」（2026-10-02 实例：服务端新增 `space-bunny`，
白名单是前一天抄的旧快照，于是新模型被滤掉、界面里看不到）。

用法
----
    python refresh-models.py            # 刷新并写回（无变化则跳过，不落盘）
    python refresh-models.py --dry-run  # 只看会写什么，不落盘
    python refresh-models.py --force    # 即使没有变化也重写

已配每日 09:30 的自动化跑本脚本（automation 0447a177），新模型不会再有「悄悄消失」。
"""
from __future__ import annotations

import glob
import io
import json
import os
import re
import sys

USER_DIR = os.path.join(os.path.expanduser("~"), ".workbuddy")
MODELS_JSON = os.path.join(USER_DIR, "models.json")
LOG_GLOB = os.path.join(USER_DIR, "logs", "*", "workbuddyMainThread__*.log")

# 日志里承载「当前内置模型全集」的字段，按优先级取
MARKERS = (
    "resolved ids: ",
    "base ids: ",
    "model ids: ",
)


def _latest_log() -> str | None:
    files = sorted(glob.glob(LOG_GLOB), key=os.path.getmtime, reverse=True)
    return files[0] if files else None


def _line_at(data: str, pos: int) -> str:
    """取 pos 所在的那一整行。"""
    left = data.rfind("\n", 0, pos)
    right = data.find("\n", pos)
    return data[left + 1: right if right > 0 else len(data)]


def collect_builtin_ids(data: str) -> set[str]:
    ids: set[str] = set()
    for marker in MARKERS:
        for m in re.finditer(re.escape(marker), data):
            line = _line_at(data, m.end())
            payload = line.split("] [")[-1]
            payload = re.split(r"\s*\|\s*\[", payload)[0]
            for token in payload.split(","):
                token = token.strip().strip('"').strip()
                if not token or " " in token:
                    continue
                ids.add(token)
    # cli.models=[...] 是界面选择器真正用的那份，务必包含
    for m in re.finditer(r"cli\.models=(\[.*?\])", data):
        try:
            ids.update(json.loads(m.group(1)))
        except ValueError:
            pass
    return ids


def main() -> int:
    log = _latest_log()
    if not log:
        print("找不到 workbuddyMainThread 日志")
        return 1

    with io.open(log, "r", encoding="utf-8", errors="ignore") as f:
        data = f.read()

    builtin = collect_builtin_ids(data)

    with io.open(MODELS_JSON, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    models = cfg.get("models", [])
    custom_ids = [m["id"] for m in models if m.get("id")]

    # 自定义 id 必须留着；内置 id 取全集（宁多勿少，多余的只是匹配不上）
    merged = sorted(builtin) + [i for i in custom_ids if i not in builtin]
    seen: set[str] = set()
    ordered = []
    for x in merged:
        if x not in seen:
            seen.add(x)
            ordered.append(x)

    before = cfg.get("availableModels") or []
    added = [x for x in ordered if x not in before]
    print(f"日志: {log}")
    print(f"抓到内置 id: {len(builtin)}，自定义: {len(custom_ids)}")
    print(f"availableModels: {len(before)} -> {len(ordered)}")
    if added:
        # 这些就是「服务端新上线、但被白名单滤掉」的模型 —— 用户看不到新模型就是这个原因
        print(f"新增（之前被白名单滤掉，现在放出来）: {added}")

    if "--dry-run" in sys.argv:
        print("（dry-run，未落盘）")
        return 0

    if not added and "--force" not in sys.argv:
        # 没有变化就不落盘：避免无谓触发 WorkBuddy 的热重载（它会重新拉一遍模型列表）
        print("无变化，跳过写入。")
        return 0

    cfg["availableModels"] = ordered
    tmp = MODELS_JSON + ".tmp"
    with io.open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, MODELS_JSON)
    print(f"已写回 {MODELS_JSON}（{os.path.getsize(MODELS_JSON)} 字节）")
    print("WorkBuddy 会在约 10 秒内热重载生效，不用重启。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
