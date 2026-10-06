#!/usr/bin/env python3
"""AI 任务 TTL 的守护检查（纯函数，不碰真实存储、不需要服务在跑）。

守测试报告 #8：浏览器关掉 / 页面崩了时 finally 不执行，任务会永远挂在「进行中」。
后端必须自己把超时未更新的 running/queued 判成 failed。

端到端的版本（真往 .sites-runtime/ai-tasks.json 塞一条再 GET 验证、测完还原）
放在 D:\\code\\2026-10-02-01-58-59\\check_task_ttl.py。
"""
import sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import ai_task_store as store

NOW = time.time() * 1000
CASES = [
    ('超时 running', {'status': 'running',  'updated': NOW - 11 * 60 * 1000}, 'failed'),
    ('超时 queued',  {'status': 'queued',   'updated': NOW - 11 * 60 * 1000}, 'failed'),
    ('刚过界',       {'status': 'running',  'updated': NOW - 10.5 * 60 * 1000}, 'failed'),
    ('新鲜 running', {'status': 'running',  'updated': NOW - 60 * 1000},      'running'),
    ('新鲜 queued',  {'status': 'queued',   'updated': NOW - 60 * 1000},      'queued'),
    ('已完成',       {'status': 'complete', 'updated': NOW - 60 * 60 * 1000}, 'complete'),
    ('已失败',       {'status': 'failed',   'updated': NOW - 60 * 60 * 1000}, 'failed'),
    ('没有 updated', {'status': 'running'},                                   'failed'),
]

items = [{'id': 'ai-%08d-unit' % i, **body} for i, (_, body, _) in enumerate(CASES)]
items, changed = store.sweep(items)

for (name, _, want), got in zip(CASES, items):
    assert got['status'] == want, '%s: 期望 %s，实际 %s' % (name, want, got['status'])

assert changed is True, '有超时任务却报告「没改动」，那清扫结果就不会落盘'
assert '10 分钟' in items[0]['detail'], '判失败时没说清原因：' + items[0]['detail']
# updated 必须保持原值：那是「最后一次真的收到回报」的时刻，改了就把中断时间点抹掉了。
assert items[0]['updated'] == CASES[0][1]['updated'], '清扫时不该改动 updated'

# 全新鲜时不能误报「改动过」，否则每次 GET 都会白写一次盘。
_, changed2 = store.sweep([{'id': 'ai-fresh000-unit', 'status': 'running', 'updated': NOW}])
assert changed2 is False, '没有超时任务却报告改动过，会导致每次 GET 都重写存储'

print('PASS AI 任务 TTL（超时判失败 / 新鲜不动 / 已完成不动 / 缺 updated 判失败 / 无变化不落盘）')
