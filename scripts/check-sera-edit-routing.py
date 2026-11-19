#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SeraEdit 自然语言路由回归：验证「用户的自然改谱说法」能正确路由到 edit_score 动作，
且非改谱 / 越界说法不会被误路由。

为什么需要它（2026-11-12 真 bug）：
之前 check-sera-edit-ai.py 用桩响应手动注入 edit_score 动作，只验证了「面板能接住」，
**完全没测 AI 路由**——即 natural-language → edit_score 这一步。于是 SERA_EDITABLE_RE
没收录「编辑 / 修改 / 改一下」等动词、且 fast_plan 里 1413 行的「做不到」兜底会误杀，
用户一用自然语言说「编辑一下第3小节的音符」就被拒答「改谱做不到」，而所有测试全绿。
本脚本直接调 fast_plan（离线、确定性、不依赖模型），守住这条路由。

运行：python scripts/check-sera-edit-routing.py  （退出码 0=全过，1=有失败）
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ai_workspace as aw  # noqa: E402

CTX = {'scores': [], 'parts': [], 'settings': {}, 'controls': []}

# 正向：用户的自然改谱说法，必须路由到 edit_score（曾经漏掉的用 ✗ 标注）
POSITIVE = [
    "把第1小节升高一个半音", "加上断奏", "把调号改成G大调", "把力度改成强",
    "✗编辑一下第3小节的音符", "修改第1小节的调号", "帮我把谱子移调到大调",
    "✗改一下谱面", "✗把第2小节的时值改短", "✗把这个音符改高一点", "改一改第4小节的音高",
    "✗编辑一下谱子，把力度加大", "把这首曲子移调", "升一个半音", "降低八度",
    "✗把第5小节的音符改成高音do", "✗我想改一下谱子", "在谱面上加个重音记号",
    "把第3小节的音符移调", "✗改一下这个谱子的力度",
]
# 越界改谱：Sera 规则层不支持，应如实拒答（不路由到 edit_score，交给模型说做不到）
OUT_OF_SCOPE = ["标一下指法", "把第3小节删掉", "帮我即兴写八小节", "给这首曲子编曲"]
# 非改谱的正常指令：绝不能变成 edit_score
NEGATIVE = [
    "打开《月光》", "把速度调到80", "分析一下第3小节的和弦", "切到简谱",
    "把钢琴静音", "播放", "跳到第12小节", "把这首曲子导出成PDF",
    "能不能改一下调号？",  # 疑问句：交给模型回答，不是 edit_score 也不是 做不到
]


def route(text):
    r = aw.fast_plan({'messages': [{'role': 'user', 'content': text}], 'context': CTX})
    if not r:
        return None
    acts = r.get('actions') or []
    return acts[0].get('type') if acts else '__reply__'


def main():
    fails = []
    for raw in POSITIVE:
        p = raw.lstrip('✗')
        if route(p) != 'edit_score':
            fails.append(('应路由到 edit_score 却没路由', p))
    for p in OUT_OF_SCOPE + NEGATIVE:
        if route(p) == 'edit_score':
            fails.append(('不应路由到 edit_score 却被路由', p))
    total = len(POSITIVE) + len(OUT_OF_SCOPE) + len(NEGATIVE)
    print(f"SeraEdit 路由校验: {total - len(fails)}/{total} 通过")
    for why, p in fails:
        print(f"  ✗ {why}: {p}")
    if fails:
        print("结果: 失败")
        sys.exit(1)
    print("结果: 全部通过")


if __name__ == '__main__':
    main()
