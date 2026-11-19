"""导师访问日志报表（本地运行，不经过任何公开接口）。

数据来源：server.py 在 do_GET 里写入的 .sites-runtime/mentor-access.jsonl
（每条：时间、visit 令牌、老师姓名、单位、路径、UA、referer）。
令牌→老师 的映射来自 dist/mentor-visits.json。

用法：
  python scripts/mentor-access-report.py                 # 汇总 + 最近 20 条
  python scripts/mentor-access-report.py --days 7        # 只看最近 7 天
  python scripts/mentor-access-report.py --recent 50     # 最近 50 条明细
  python scripts/mentor-access-report.py --teacher 张骁   # 只看某位老师
"""
import argparse
import json
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / '.sites-runtime' / 'mentor-access.jsonl'
OLD = LOG.with_suffix('.jsonl.1')


def rows():
    out = []
    for path in (OLD, LOG):
        try:
            text = path.read_text(encoding='utf-8')
        except OSError:
            continue
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except ValueError:
                continue
    out.sort(key=lambda r: r.get('ts', 0))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=float, default=0, help='只看最近 N 天（0=全部）')
    ap.add_argument('--recent', type=int, default=20, help='最近 N 条明细')
    ap.add_argument('--teacher', default='', help='只看某位老师')
    args = ap.parse_args()

    data = rows()
    if args.days:
        cutoff = (time.time() - args.days * 86400) * 1000
        data = [r for r in data if r.get('ts', 0) >= cutoff]
    if args.teacher:
        data = [r for r in data if args.teacher in (r.get('name') or '')]

    print('访问记录：%d 条' % len(data))
    if not data:
        print('（还没有记录。用带 ?visit=<令牌> 或 ?mentor=<姓名> 的链接访问一次即可产生。）')
        return

    by = defaultdict(lambda: {'count': 0, 'first': None, 'last': None, 'inst': ''})
    for r in data:
        key = r.get('name') or '(未命名)'
        b = by[key]
        b['count'] += 1
        b['inst'] = r.get('institution') or b['inst']
        if b['first'] is None or r['ts'] < b['first']:
            b['first'] = r['ts']
        if b['last'] is None or r['ts'] > b['last']:
            b['last'] = r['ts']

    fmt = lambda ms: time.strftime('%m-%d %H:%M', time.localtime((ms or 0) / 1000))
    print('\n按老师汇总（共 %d 位）：' % len(by))
    print('%-14s %-24s %6s  %-14s  %s' % ('姓名', '单位', '次数', '首次', '最近'))
    for name, b in sorted(by.items(), key=lambda kv: kv[1]['last'] or 0, reverse=True):
        print('%-14s %-24s %6d  %-14s  %s' % (name[:14], (b['inst'] or '')[:24], b['count'], fmt(b['first']), fmt(b['last'])))

    print('\n最近 %d 条：' % min(args.recent, len(data)))
    for r in data[-args.recent:][::-1]:
        t = time.strftime('%m-%d %H:%M:%S', time.localtime(r.get('ts', 0) / 1000))
        print('  [%s] %-12s %-20s %s' % (t, (r.get('name') or '?')[:12],
                                         (r.get('institution') or '')[:20], (r.get('query') or '')[:70]))


if __name__ == '__main__':
    main()
