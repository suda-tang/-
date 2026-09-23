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


def main():
    LOG.parent.mkdir(parents=True, exist_ok=True)
    stale = pids_on_port(PORT)
    for pid in stale:
        # Output is unused and taskkill prints in GBK; capture raw bytes only.
        subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True)
    if stale:
        print(f'已停止 {len(stale)} 个旧进程：{stale}')
        wait_for_release(PORT)
    else:
        print('端口上未发现监听进程，直接启动。')

    python = next((p for p in PYTHON_CANDIDATES if p and Path(p).is_file()), None)
    if not python:
        print('找不到可用的 Python 解释器，请手动指定。', file=sys.stderr)
        return 2

    flags = 0
    if os.name == 'nt':
        flags = (getattr(subprocess, 'DETACHED_PROCESS', 0)
                 | getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0)
                 | getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    with LOG.open('ab') as log:
        subprocess.Popen([str(python), str(ROOT / 'server.py')], cwd=str(ROOT),
                         stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                         creationflags=flags, close_fds=True)

    if wait_for_listen(PORT):
        print(f'服务已重启：http://127.0.0.1:{PORT}')
        return 0
    print(f'服务未在预期时间内监听 {PORT}，请查看 {LOG}', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
