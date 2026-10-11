"""CPU piano fingering jobs. Optimizer is isolated from the HTTP process."""
import hashlib
import json
import math
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from storage import write_json

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / '.sites-runtime/fingering-cache'
POOL = ThreadPoolExecutor(max_workers=1)
LOCK = threading.Lock()
JOBS = {}
ENGINE = 'pianoplayer-3.0.2-adapter-3'

def process_alive(pid):
    if not pid: return False
    if sys.platform == 'win32':
        import ctypes
        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, int(pid))
        if not handle: return False
        code = ctypes.c_ulong()
        ok = ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
        ctypes.windll.kernel32.CloseHandle(handle)
        return bool(ok and code.value == 259)
    try:
        import os
        os.kill(int(pid), 0)
        return True
    except OSError: return False

def profile_key(payload):
    content = {'engine': ENGINE, 'size': payload.get('size', 'M'), 'notes': [{k: n[k] for k in ('id','midi','beat','duration','measure','hand')} for n in payload['notes']]}
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()

def profile(payload):
    key = profile_key(payload)
    target = CACHE / (key + '.saved.json')
    previous = json.loads(target.read_text(encoding='utf-8')) if target.exists() else {'fingers': {}}
    if 'fingers' in payload:
        ids = {n['id'] for n in payload['notes']}
        fingers = payload['fingers']
        if not isinstance(fingers, dict) or any(k not in ids or v not in (1,2,3,4,5) for k,v in fingers.items()):
            raise ValueError('保存的指法无效')
        write_json(target, {'fingers': fingers, 'manual': [k for k in payload.get('manual',previous.get('manual',[])) if k in ids]})
    return json.loads(target.read_text(encoding='utf-8')) if target.exists() else {'fingers': {}}

def start(payload):
    notes = payload.get('notes')
    if not isinstance(notes, list) or not notes:
        raise ValueError('当前乐器没有可标注的钢琴音符')
    size = payload.get('size', 'M')
    if size not in ('S', 'M', 'L'):
        raise ValueError('请选择手型大小')
    clean = []
    ids = set()
    for n in notes:
        item = {k: n[k] for k in ('id', 'midi', 'beat', 'duration', 'measure', 'hand')}
        if not isinstance(item['id'], str) or item['id'] in ids:
            raise ValueError('音符标识重复或无效')
        ids.add(item['id'])
        if item['hand'] not in ('left', 'right') or not isinstance(item['midi'], int) or not 21 <= item['midi'] <= 108:
            raise ValueError('指法适用于钢琴的 88 键音域，请选择钢琴声部')
        if any(not isinstance(item[k], (int, float)) or not math.isfinite(item[k]) for k in ('beat', 'duration', 'measure')) or item['duration'] <= 0 or item['beat'] < 0:
            raise ValueError('音符时间无效')
        finger = n.get('finger', 0)
        if finger not in (0, 1, 2, 3, 4, 5):
            raise ValueError('指法须为 1 至 5')
        item['finger'] = finger
        clean.append(item)
    content = {'engine': ENGINE, 'size': size, 'notes': clean}
    key = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
    CACHE.mkdir(parents=True, exist_ok=True)
    if (CACHE / (key + '.json')).exists():
        return status(key), 200
    with LOCK:
        if key in JOBS and JOBS[key]['status'] in ('queued', 'running'):
            return status_unlocked(key), 202
        JOBS[key] = {'id': key, 'status': 'queued', 'progress': 0, 'kind': 'fingering', 'label': '钢琴指法', 'scoreTitle': str(payload.get('title', '当前曲谱'))[:200], 'detail': '等待指法计算', 'created': time.time()}
    request = CACHE / (key + '.input.json')
    write_json(request, content)
    write_json(CACHE / (key + '.state.json'), JOBS[key])
    POOL.submit(run, key, request)
    return status(key), 202

def status_unlocked(key):
    return dict(JOBS.get(key, {'id': key, 'status': 'missing'}))

def status(key):
    if len(key) != 64 or any(c not in '0123456789abcdef' for c in key):
        return {'status': 'failed', 'error': '无效的指法任务'}
    with LOCK:
        job = status_unlocked(key)
    if job['status'] == 'missing':
        try:
            job = json.loads((CACHE / (key + '.state.json')).read_text(encoding='utf-8'))
            if job['status'] in ('queued','running') and not process_alive(job.get('pid')):
                job.update(status='failed', error='指法计算因服务重启而中断，请重新标注，已保存的指法仍保留')
        except (OSError,ValueError): pass
    result = CACHE / (key + '.json')
    if result.exists():
        job.update(status='complete', progress=100, result=json.loads(result.read_text(encoding='utf-8')))
    elif job['status'] == 'running':
        try:
            job.update(json.loads((CACHE / (key + '.progress.json')).read_text(encoding='utf-8')))
        except (OSError, ValueError):
            pass
    return job

def run(key, request):
    with LOCK:
        JOBS[key].update(status='running', detail='计算左右手指法')
    try:
        with (CACHE / (key + '.log')).open('w', encoding='utf-8') as log:
            process = subprocess.Popen([sys.executable, str(ROOT / 'scripts/piano-fingering.py'), str(request), str(CACHE / (key + '.json'))], stdout=log, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            with LOCK:
                JOBS[key]['pid'] = process.pid
                write_json(CACHE / (key + '.state.json'), JOBS[key])
            try: process.wait(timeout=300)
            except subprocess.TimeoutExpired:
                process.kill();process.wait();raise
        if process.returncode:
            tail = (CACHE / (key + '.log')).read_text(encoding='utf-8', errors='replace')[-800:]
            raise RuntimeError('指法计算未完成：' + tail)
        with LOCK:
            JOBS[key].update(status='complete', progress=100, detail='指法已保存')
        payload = json.loads(request.read_text(encoding='utf-8'))
        payload['fingers'] = json.loads((CACHE / (key + '.json')).read_text(encoding='utf-8'))['fingers']
        profile(payload)
    except Exception as error:
        with LOCK:
            JOBS[key].update(status='failed', error='指法计算超过五分钟，请分段校对后重试' if isinstance(error, subprocess.TimeoutExpired) else str(error))
    finally:
        with LOCK: write_json(CACHE / (key + '.state.json'), JOBS[key])
