"""真并行总守护：同时拉起并看护两组批处理（1879 常规 + 1075 公开课 PBL）。

背景：服务端 score_classroom.POOL 已扩到 max_workers=2，上游 suda-deepseek
实测 WS_MAX_CONCURRENT=2 断连 0%。两组各占一个 worker，可真正同时生成。

本进程是唯一常驻入口（可作为 managed background task 或启动文件夹 VBS 拉起）：
* 启动两个批处理子进程（各自 --retry-failed 断点续跑）。
* 每 60s 巡检，谁挂了就重新拉起谁；两组都完成则退出。
* 只管批处理，不碰 server.py / 8765 模型服务 / 前端。

用法：
  python scripts/parallel_batch_supervisor.py            # 常驻看护
  python scripts/parallel_batch_supervisor.py --once     # 只拉起一次，打印状态后退出
"""
import argparse
import json
import os
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '.sites-runtime' / 'classroom-batch'
LOG = OUT / 'parallel-supervisor.log'
PY = r'C:\Users\mail\AppData\Local\Programs\Python\Python312\python.exe'
CHECK_INTERVAL = 60
FLAG = OUT / 'parallel-mode.flag'

GROUPS = [
    dict(key='1879', script='run_classroom_batch.py', state='state.json',
         lock='batch.lock', goals='goals.jsonl', console='batch-console.log'),
    dict(key='openclass', script='run_openclass_batch.py', state='state-openclass.json',
         lock='openclass.lock', goals='goals-openclass.jsonl', console='openclass-console.log'),
]


def log(msg):
    line = '[%s] %s' % (time.strftime('%Y-%m-%d %H:%M:%S'), msg)
    print(line, flush=True)
    try:
        with LOG.open('a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


def total(goals_name):
    p = OUT / goals_name
    try:
        with p.open(encoding='utf-8') as f:
            return sum(1 for line in f if line.strip())
    except OSError:
        return 0


def counts(state_name):
    p = OUT / state_name
    try:
        s = json.loads(p.read_text(encoding='utf-8'))
        items = s.get('items', {})
        done = sum(1 for v in items.values() if v.get('status') == 'done')
        failed = sum(1 for v in items.values() if v.get('status') == 'failed')
        return done, failed
    except (OSError, ValueError):
        return 0, 0


def pid_from_lock(lock_name):
    p = OUT / lock_name
    if not p.exists():
        return None
    try:
        return int(p.read_text(encoding='utf-8').strip())
    except (OSError, ValueError):
        return None


def alive(pid):
    if not pid:
        return False
    try:
        import psutil
        return psutil.pid_exists(pid) and psutil.Process(pid).is_running()
    except ImportError:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
    except Exception:
        return False


def start_group(g):
    # 清掉陈旧锁，避免批处理自己接管时多等一轮
    lock = OUT / g['lock']
    pid = pid_from_lock(g['lock'])
    if pid and not alive(pid):
        try:
            lock.unlink()
        except OSError:
            pass
    log('拉起 %s 组：%s --retry-failed' % (g['key'], g['script']))
    creationflags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    proc = subprocess.Popen(
        [PY, str(ROOT / 'scripts' / g['script']), '--retry-failed'],
        cwd=str(ROOT),
        stdout=(OUT / g['console']).open('a', encoding='utf-8'),
        stderr=subprocess.STDOUT,
        creationflags=creationflags,
    )
    log('  %s 组子进程 pid=%d' % (g['key'], proc.pid))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--once', action='store_true', help='只拉起一次并打印状态后退出')
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    # 标志位同时用于让旧交接启动器保持静默
    FLAG.write_text('两组真并行 POOL=2 已启用；本文件存在时 launch_openclass_after_1879.py 不动作。\n',
                    encoding='utf-8')

    totals = {g['key']: total(g['goals']) for g in GROUPS}
    log('=== 真并行总守护启动 === POOL=2 | 1879 目标 %d 首 | 公开课目标 %d 首'
        % (totals['1879'], totals['openclass']))
    if not totals['1879'] or not totals['openclass']:
        log('目标清单缺失，退出')
        return 1

    for g in GROUPS:
        pid = pid_from_lock(g['lock'])
        if alive(pid):
            log('%s 组已在运行（pid=%d），跳过拉起' % (g['key'], pid))
        else:
            start_group(g)

    if args.once:
        time.sleep(3)
        for g in GROUPS:
            d, f = counts(g['state'])
            log('%s: done=%d failed=%d / %d' % (g['key'], d, f, totals[g['key']]))
        return 0

    while True:
        time.sleep(CHECK_INTERVAL)
        all_done = True
        lines = []
        for g in GROUPS:
            d, f = counts(g['state'])
            pid = pid_from_lock(g['lock'])
            running = alive(pid)
            lines.append('%s done=%d failed=%d running=%s' % (g['key'], d, f, running))
            if d + f < totals[g['key']]:
                all_done = False
            if not running and d + f < totals[g['key']]:
                log('%s 组进程掉了（pid=%s），重新拉起' % (g['key'], pid))
                start_group(g)
        log('巡检 | ' + ' | '.join(lines))
        if all_done:
            log('两组都已跑完，总守护退出')
            return 0


if __name__ == '__main__':
    sys.exit(main())
