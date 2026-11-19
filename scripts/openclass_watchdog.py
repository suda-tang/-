"""公开课 PBL 批处理的自愈守护：批处理进程没了就自动续跑。

与 classroom_batch_watchdog.py 完全平行，但看守的是 run_openclass_batch.py
（state-openclass.json / openclass.lock / goals-openclass.jsonl），绝不碰 1879
批处理的任何文件。全量 1075 首按每首约 16 分钟算需要约两周，中途可能遇到机器
重启、服务重载、进程被回收。本脚本每 3 分钟检查一次：

  * 全部完成 → 写一条完成日志后退出。
  * 批处理进程不在（锁文件里的 pid 已死，或锁陈旧）→ 重新拉起批处理。
  * 批处理在跑 → 什么都不做。

用法（后台常驻）：
  python scripts/openclass_watchdog.py
"""
import json
import os
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '.sites-runtime' / 'classroom-batch'
STATE = OUT / 'state-openclass.json'
LOCK = OUT / 'openclass.lock'
GOALS = OUT / 'goals-openclass.jsonl'
LOG = OUT / 'watchdog-openclass.log'
PY = r'C:\Users\mail\AppData\Local\Programs\Python\Python312\python.exe'
CHECK_INTERVAL = 180


def log(msg):
    line = '[%s] %s' % (time.strftime('%Y-%m-%d %H:%M:%S'), msg)
    print(line, flush=True)
    try:
        with LOG.open('a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


def total_goals():
    try:
        with GOALS.open(encoding='utf-8') as f:
            return sum(1 for line in f if line.strip())
    except OSError:
        return 0


def done_count():
    try:
        s = json.loads(STATE.read_text(encoding='utf-8'))
        return sum(1 for v in s.get('items', {}).values() if v.get('status') == 'done')
    except (OSError, ValueError):
        return 0


def batch_alive():
    if not LOCK.exists():
        return False
    try:
        pid = int(LOCK.read_text(encoding='utf-8').strip())
    except (OSError, ValueError):
        return False
    try:
        import psutil
        if not psutil.pid_exists(pid):
            return False
        pr = psutil.Process(pid)
        return pr.is_running() and 'python' in (pr.name() or '').lower()
    except ImportError:
        return True
    except Exception:
        return False


def start_batch():
    log('公开课批处理不在运行，重新拉起（--retry-failed 续跑）')
    creationflags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    subprocess.Popen(
        [PY, str(ROOT / 'scripts' / 'run_openclass_batch.py'), '--retry-failed'],
        cwd=str(ROOT),
        stdout=(OUT / 'openclass-console.log').open('a', encoding='utf-8'),
        stderr=subprocess.STDOUT,
        creationflags=creationflags,
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    total = total_goals()
    if not total:
        log('goals-openclass.jsonl 不存在或为空，守护退出')
        return 1
    log('公开课守护启动：共 %d 首，当前已完成 %d 首' % (total, done_count()))
    while True:
        try:
            done = done_count()
            if done >= total:
                log('全部 %d 首公开课已完成，守护退出' % total)
                return 0
            if not batch_alive():
                try:
                    LOCK.unlink()
                except OSError:
                    pass
                start_batch()
                time.sleep(30)
            else:
                log('公开课批处理在跑（已完成 %d / %d）' % (done, total))
        except Exception as e:
            log('守护异常：%s: %s' % (type(e).__name__, str(e)[:160]))
        time.sleep(CHECK_INTERVAL)


if __name__ == '__main__':
    sys.exit(main())
