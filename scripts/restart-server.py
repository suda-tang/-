"""Restart the local Piano Lab server so newly written modules take effect.

Python imports a module once per process, so edits to server.py and its
siblings (background_jobs.py, media_import.py, arrangement_service.py, ...)
are invisible to an already-running server -- new routes keep answering 404
("接口不存在") until the process is replaced.

This helper stops whatever is listening on the app port and relaunches
server.py detached with the project's Python, then waits for a health check.

Usage:
    python scripts/restart-server.py
"""
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get('PIANO_PORT', '5173'))
LOG = ROOT / '.sites-runtime' / 'server.log'
PYTHON_CANDIDATES = [
    Path(r'C:\Users\mail\AppData\Local\Programs\Python\Python312\python.exe'),
    Path(sys.executable) if sys.executable else None,
    Path(shutil.which('python')) if shutil.which('python') else None,
    Path(shutil.which('python3')) if shutil.which('python3') else None,
]


def pids_on_port(port):
    """Return PIDs currently LISTENING on the port (Windows netstat)."""
    try:
        # Windows netstat prints in the OEM/GBK codepage, so capture bytes and
        # decode leniently instead of letting text=True assume UTF-8.
        raw = subprocess.run(['netstat', '-ano', '-p', 'tcp'], capture_output=True,
                             timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    text = raw.decode('utf-8', errors='ignore') if raw else ''
    found = set()
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[3] == 'LISTENING' and parts[1].rsplit(':', 1)[-1] == str(port):
            try:
                found.add(int(parts[4]))
            except ValueError:
                pass
    return sorted(found)


def wait_for_release(port, timeout=15.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not pids_on_port(port):
            return True
        time.sleep(0.25)
    return not pids_on_port(port)


def wait_for_listen(port, timeout=20.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=1):
                return True
        except OSError:
            time.sleep(0.25)
    return False


RESTART_LOG = ROOT / '.sites-runtime' / 'restart.log'


def log(message):
    """把每次重启的经过写进 restart.log。

    以前这个脚本只在控制台 print，而源码监视是**分离进程**调用它的，
    输出无处可看 —— 一旦重启失败（实测踩到过一次：旧进程被停掉、新进程没起来，
    服务直接下线），现场没有任何痕迹。现在每一步都留档，便于事后定位。
    """
    line = time.strftime('[%Y-%m-%d %H:%M:%S] ') + message
    try:
        RESTART_LOG.parent.mkdir(parents=True, exist_ok=True)
        with RESTART_LOG.open('a', encoding='utf-8') as fh:
            fh.write(line + '\n')
    except OSError:
        pass
    print(message, flush=True)


def main():
    LOG.parent.mkdir(parents=True, exist_ok=True)
    log(f'重启请求：port={PORT} pid={os.getpid()}')
    stale = pids_on_port(PORT)
    for pid in stale:
        # Output is unused and taskkill prints in GBK; capture raw bytes only.
        subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True)
    if stale:
        log(f'已停止 {len(stale)} 个旧进程：{stale}')
        wait_for_release(PORT)
    else:
        log('端口上未发现监听进程，直接启动。')

    python = next((p for p in PYTHON_CANDIDATES if p and Path(p).is_file()), None)
    if not python:
        log('找不到可用的 Python 解释器，放弃重启。')
        return 2

    flags = 0
    if os.name == 'nt':
        flags = (getattr(subprocess, 'DETACHED_PROCESS', 0)
                 | getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0)
                 | getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    # 双保险：重拉时一并注入公网白名单域名，避免裸启动丢 PIANO_ALLOWED_HOSTS
    # 导致公网 403「仅接受本机同源请求」。server.py 里已对生产域名做了硬编码兜底，
    # 这里再显式传一遍，确保即便日后移除兜底也不会复现。
    env = dict(os.environ)
    env.setdefault('PIANO_ALLOWED_HOSTS', 'suzhou.super-tang.com')
    # ★ 启动失败自动重试：以前只拉一次，端口没及时释放或子进程偶发启动失败就把服务
    #   留在下线状态。现在最多试 3 次，每次先把半启动的残留进程清掉。
    for attempt in range(1, 4):
        with LOG.open('ab') as logfile:
            subprocess.Popen([str(python), str(ROOT / 'server.py')], cwd=str(ROOT),
                             stdin=subprocess.DEVNULL, stdout=logfile, stderr=subprocess.STDOUT,
                             creationflags=flags, close_fds=True, env=env)
        if wait_for_listen(PORT):
            log(f'服务已重启（第 {attempt} 次尝试）：http://127.0.0.1:{PORT}')
            return 0
        log(f'第 {attempt} 次启动后未在预期时间内监听 {PORT}，清理残留后重试。')
        for pid in pids_on_port(PORT):
            subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True)
        wait_for_release(PORT)
    log(f'连续 3 次都未能让服务监听 {PORT}，放弃。请查看 {LOG}')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
