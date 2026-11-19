"""公开课 PBL 通道的「交接启动器」。

设计目标：绝不打断正在跑的 1879 全量批处理。它只做一个判断——
「1879 批处理已经不再产生新的完成了」（done 数连续 N 分钟没变，说明剩下的都卡在
永久性失败上、没有可继续生成的课），此时才：

  1) 停掉 1879 的批处理与守护；
  2) 重启 server.py，让新的 openClass 代码（score_classroom.create 写入 openClass、
     classroom-pipeline.mjs 的公开课提质分支）生效；
  3) 拉起 run_openclass_batch.py + openclass_watchdog.py，开始 1075 首公开课生成。

整个过程无人值守：把本脚本挂在后台，它自己会等到合适时机再动手。

用法：
  python scripts/launch_openclass_after_1879.py --dry-run   # 只看 1879 当前进度，不动作
  python scripts/launch_openclass_after_1879.py            # 后台长驻，条件满足后自动交接
"""
import argparse
import atexit
import json
import os
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '.sites-runtime' / 'classroom-batch'
STATE_1879 = OUT / 'state.json'
GOALS_1879 = OUT / 'goals.jsonl'
GEN_SLOT = OUT / 'gen-slot.lock'
RESTART_LOG = ROOT / '.sites-runtime' / 'launch-openclass.log'
CLASSROOM_DIR = ROOT / '.sites-runtime' / 'classrooms'
PY = r'C:\Users\mail\AppData\Local\Programs\Python\Python312\python.exe'

CHECK_INTERVAL = 120          # 秒，轮询 1879 进度
DONE_STABLE_SECS = 3600       # 1879 的 done 数连续这么久没变，就认为它已不再出新成果
LAUNCH_LOCK = OUT / 'launch-openclass.lock'   # 单实例锁，避免多个交接启动器互相抢停机/重启


def log(msg):
    line = '[%s] %s' % (time.strftime('%Y-%m-%d %H:%M:%S'), msg)
    print(line, flush=True)
    try:
        with RESTART_LOG.open('a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


def total_1879():
    try:
        with GOALS_1879.open(encoding='utf-8') as f:
            return sum(1 for line in f if line.strip())
    except OSError:
        return 0


def progress_1879():
    """真实进度：直接扫描落盘的课堂文件，而不是信任可能滞后的 state.json。

    state.json 的 items 只记录本批处理「这次运行」扫到的条目，会落后于实际已生成的
    课堂文件；若据此判断「done 稳定」会过早触发交接、把还在跑的 1879 腰斩。
    这里改数 .sites-runtime/classrooms/*.json（排除 .input.json），并且只统计
    openClass != True 的 1879 课堂，避免把将来公开课通道的课堂也数进来。
    """
    done = failed = generating = queued = other = 0
    try:
        for fp in CLASSROOM_DIR.glob('*.json'):
            if fp.name.endswith('.input.json'):
                continue
            try:
                o = json.loads(fp.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                other += 1
                continue
            if o.get('openClass') is True:
                continue  # 公开课课堂不计入 1879 进度
            st = o.get('status')
            if st == 'complete':
                done += 1
            elif st == 'failed':
                failed += 1
            elif st == 'generating':
                generating += 1
            elif st == 'queued':
                queued += 1
            else:
                other += 1
    except OSError:
        return None
    return {'done': done, 'failed': failed, 'generating': generating,
            'queued': queued, 'running': generating + queued, 'other': other,
            'pending': max(0, total_1879() - done - failed)}


def find_procs(*names):
    """按命令行包含的名称找进程（用于定位 1879 批处理与守护）。"""
    found = []
    try:
        import psutil
    except ImportError:
        return found
    for pr in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmd = ' '.join(pr.info.get('cmdline') or [])
        except Exception:
            continue
        if any(name in cmd for name in names):
            found.append(pr)
    return found


def stop_1879():
    targets = ('run_classroom_batch.py', 'classroom_batch_watchdog.py')
    for _ in range(3):
        procs = find_procs(*targets)
        if not procs:
            break
        for pr in procs:
            try:
                pr.terminate()
            except Exception:
                pass
        time.sleep(5)
        for pr in procs:
            try:
                if pr.is_running():
                    pr.kill()
            except Exception:
                pass
        time.sleep(3)
    # 顺手清理可能残留的 node generate.mjs：它是 server.py 的子进程，stop 1879 时
    # 若 server 随后会被重启，残留 node 会写成孤儿继续写旧课堂文件；这里一并收掉。
    # 只杀 classroom-pipeline/generate 相关的 node，绝不碰 8765 模型服务本身。
    try:
        import psutil
        for pr in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cl = ' '.join(pr.info.get('cmdline') or [])
            except Exception:
                continue
            if 'classroom-pipeline.mjs' in cl or 'openmaic/generate.mjs' in cl:
                try:
                    pr.kill()
                    log('已清理残留生成进程 PID %d' % pr.info['pid'])
                except Exception:
                    pass
    except Exception:
        pass
    log('1879 批处理与守护已停止，残留生成进程已清理')


def wait_until_1879_idle():
    """轮询 1879 的真实进度，直到「done 与 failed 都连续 DONE_STABLE_SECS 秒不变、
    且没有任何在飞的课堂」才认为 1879 已不再产出。

    必须同时看住：
      * done 不再增长（不再有新课完成）
      * failed 不再变化（--retry-failed 的重试也都结束了）
      * 没有任何 generating/queued（单 worker 队列里没积压）
    任一条件不满足都重置稳定计时。这样即使 state.json 滞后，也不会误判 1879 已停。
    """
    last_done = -1
    last_failed = -1
    last_active = -1
    stable_since = None
    log('开始等待 1879 批处理停止产出新成果…（done/failed 稳定且无一在飞，需连续 %d 分钟）'
        % (DONE_STABLE_SECS // 60))
    while True:
        p = progress_1879()
        if p is None:
            log('读不到 1879 课堂目录，%d 秒后重试' % CHECK_INTERVAL)
            time.sleep(CHECK_INTERVAL)
            continue
        now = time.time()
        active = p['running']
        if p['done'] != last_done or p['failed'] != last_failed or active != last_active:
            last_done, last_failed, last_active = p['done'], p['failed'], active
            stable_since = now
            log('1879 进度：done=%d failed=%d 在飞=%d（generating=%d queued=%d）pending≈%d —— 仍在进行，继续等'
                % (p['done'], p['failed'], active, p['generating'], p['queued'], p['pending']))
        else:
            stable_for = now - (stable_since or now)
            remain = max(0, DONE_STABLE_SECS - stable_for)
            if remain <= 0:
                log('1879 done=%d failed=%d 已稳定 %d 分钟且无在飞课堂，可以交接'
                    % (p['done'], p['failed'], int(stable_for // 60)))
                return True
            if int(now) % CHECK_INTERVAL < 2:
                log('1879 done=%d 已稳定 %d 分钟，还需约 %d 分钟（在飞=%d）'
                    % (p['done'], int(stable_for // 60), int(remain // 60), active))
        time.sleep(CHECK_INTERVAL)


def restart_server():
    log('重启 server.py 以加载 openClass 新代码…')
    subprocess.run([PY, str(ROOT / 'scripts' / 'restart-server.py')],
                   capture_output=True, text=True, timeout=120)
    log('server.py 重启指令已发出，详见 restart.log')


def start_openclass():
    # 注意：本沙箱会在 Bash 调用结束时回收 DETACHED 子进程（与 server.py 的存活机制不同），
    # 所以这里不以 DETACHED 启动。本启动器自身是常驻（managed background task），
    # 公开课批处理与守护作为它的子进程随它一起存活；本进程在交接后进入看护循环不退出。
    log('拉起公开课批处理 + 守护（作为本进程的子进程，随本进程常驻）')
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    subprocess.Popen([PY, str(ROOT / 'scripts' / 'run_openclass_batch.py'), '--retry-failed'],
                     cwd=str(ROOT),
                     stdout=(OUT / 'openclass-console.log').open('a', encoding='utf-8'),
                     stderr=subprocess.STDOUT, creationflags=flags, close_fds=True)
    subprocess.Popen([PY, str(ROOT / 'scripts' / 'openclass_watchdog.py')],
                     cwd=str(ROOT),
                     stdout=(OUT / 'watchdog-openclass-console.log').open('a', encoding='utf-8'),
                     stderr=subprocess.STDOUT, creationflags=flags, close_fds=True)
    log('公开课通道已启动；可用 python scripts/run_openclass_batch.py --status 查看进度')


def monitor_openclass():
    """交接完成后持续驻留，看护公开课批处理（作为它的父进程不让其被回收）。"""
    log('交接完成，公开课通道已在运行中；本进程持续驻留以看护公开课批处理。')
    while True:
        try:
            s = json.loads((OUT / 'state-openclass.json').read_text(encoding='utf-8'))
            items = s.get('items', {})
            done = sum(1 for v in items.values() if v.get('status') == 'done')
            failed = sum(1 for v in items.values() if v.get('status') == 'failed')
            total = 0
            with (OUT / 'goals-openclass.jsonl').open(encoding='utf-8') as f:
                total = sum(1 for line in f if line.strip())
            log('公开课进度：done=%d failed=%d / %d' % (done, failed, total))
        except Exception as e:
            log('公开课进度读取失败：%s' % e)
        time.sleep(CHECK_INTERVAL)


def _pid_alive(pid):
    """优先 psutil，退回 os.kill(pid, 0) 探活。"""
    try:
        import psutil
        return psutil.pid_exists(pid) and psutil.Process(pid).is_running()
    except Exception:
        pass
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def acquire_lock():
    """单实例锁：避免同一台机器上多个交接启动器互相抢着停机/重启。

    仅非 dry-run 路径调用；dry-run 只读，允许多个共存。
    """
    try:
        if LAUNCH_LOCK.exists():
            try:
                data = json.loads(LAUNCH_LOCK.read_text(encoding='utf-8'))
                old_pid = int(data.get('pid', 0))
            except (ValueError, OSError):
                old_pid = 0
            if old_pid and _pid_alive(old_pid):
                log('已有交接启动器实例在运行（PID %d，started %s），本进程退出'
                    % (old_pid, data.get('started', '?')))
                return False
            log('发现残留锁（PID %s），接管' % (old_pid or '?'))
        LAUNCH_LOCK.write_text(
            json.dumps({'pid': os.getpid(),
                        'started': time.strftime('%Y-%m-%d %H:%M:%S')},
                       ensure_ascii=False),
            encoding='utf-8')
        atexit.register(release_lock)
        return True
    except OSError as e:
        log('无法写锁文件 %s：%s' % (LAUNCH_LOCK, e))
        return False


def release_lock():
    try:
        if LAUNCH_LOCK.exists():
            LAUNCH_LOCK.unlink()
    except OSError:
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='只打印 1879 当前进度，不停止/不重启/不启动')
    args = ap.parse_args()

    # 真并行模式：两组同时开工，本启动器「等 1879 停 -> 停 1879 -> 重启 server」
    # 的逻辑会误杀 1879 并中断两路生成，必须直接退出。
    if (OUT / 'parallel-mode.flag').exists():
        log('检测到 parallel-mode.flag：真并行模式已接管，本交接启动器退出')
        return 0

    if args.dry_run:
        p = progress_1879()
        if p:
            print('1879 进度：done=%d failed=%d running=%d pending=%d（共 %d）'
                  % (p['done'], p['failed'], p['running'], p['pending'], total_1879()))
        else:
            print('读不到 1879 state.json（可能还没开始，或路径不对）')
        return 0

    if not GOALS_1879.exists():
        log('找不到 goals.jsonl，无法判断 1879 进度，退出')
        return 1
    if not (OUT / 'goals-openclass.jsonl').exists():
        log('找不到 goals-openclass.jsonl，请先运行 build_openclass_goals.py，退出')
        return 1

    if not acquire_lock():
        return 1

    if wait_until_1879_idle():
        stop_1879()
        # 给任何残留的生成收个尾（理论上已无在飞课堂），再重启服务。
        time.sleep(30)
        restart_server()
        # 重启后稍等端口起来
        time.sleep(20)
        start_openclass()
        log('交接完成。公开课 PBL 通道已在运行中。')
        monitor_openclass()
    return 1


if __name__ == '__main__':
    sys.exit(main())
