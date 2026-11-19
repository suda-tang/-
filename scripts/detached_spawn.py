"""以 DETACHED 方式在后台长驻拉起一个子脚本，使其与当前 Bash / 会话解绑。

为什么需要它：
  server.py 之所以能在会话结束后仍活着，是因为 restart-server.py 用
  DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW 拉起它后自己退出，
  被拉起的进程属于新的进程组/会话，不再随本会话的 job 一起被回收。

  1879 批处理、它的守护、以及公开课交接启动器，之前都是「managed background task」
  或直接挂在 Bash 会话下，会话一结束就被回收，于是进度每次都卡在 ~50 首。
  本脚本复用同一组 flags，把它们也变成长驻进程。

用法：
  python scripts/detached_spawn.py scripts/classroom_batch_watchdog.py
  python scripts/detached_spawn.py scripts/launch_openclass_after_1879.py
  python scripts/detached_spawn.py scripts/run_openclass_batch.py --retry-failed
"""
import os
import subprocess
import sys
import time
from pathlib import Path

try:
    import psutil
except Exception:
    psutil = None

ROOT = Path(__file__).resolve().parent.parent
PY = r'C:\Users\mail\AppData\Local\Programs\Python\Python312\python.exe'


def main():
    if len(sys.argv) < 2:
        print('usage: detached_spawn.py <script.py> [args...]', file=sys.stderr)
        return 2
    target = Path(sys.argv[1])
    if not target.is_absolute():
        target = ROOT / target
    if not target.is_file():
        print('找不到脚本：%s' % target, file=sys.stderr)
        return 2
    args = [PY, str(target)] + sys.argv[2:]
    flags = (getattr(subprocess, 'DETACHED_PROCESS', 0)
             | getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0)
             | getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    # 独立日志，避免和子脚本自己的日志混在一起
    spawn_log = ROOT / '.sites-runtime' / (target.stem + '-spawn.log')
    spawn_log.parent.mkdir(parents=True, exist_ok=True)
    with spawn_log.open('ab') as lf:
        proc = subprocess.Popen(args, cwd=str(ROOT),
                                stdin=subprocess.DEVNULL, stdout=lf,
                                stderr=subprocess.STDOUT,
                                creationflags=flags, close_fds=True)
    print('已 DETACHED 拉起（pid=%s）：%s' % (proc.pid, ' '.join(args)))
    # 关键：不要立刻退出。restart-server.py 之所以能让 server.py 长驻，是因为它父进程
    # 在 wait_for_listen 期间多存活了几秒，子进程才有时间从当前 job/session 完全脱离。
    # 如果这里立刻 return，子进程往往还没脱离就被本 Bash 调用结束时的 job 回收。
    # 所以这里 linger 一段时间，确认子进程确实独立存活后再退出。
    linger = 12
    for _i in range(linger):
        time.sleep(1)
        if psutil is not None and not psutil.pid_exists(proc.pid):
            print('警告：子进程 %s 在脱离前已退出，请检查 %s' % (proc.pid, spawn_log))
            break
    else:
        print('子进程 %s 已稳定存活 %d 秒，脱离完成。' % (proc.pid, linger))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
