"""把 build_classroom_goals.py 生成的提示词，一首一首陆陆续续送进曲谱课堂。

设计（对应唐老师的要求「所有云曲谱，一个一个，陆陆续续」）：

* 严格串行：任何时刻只向 /api/classroom/create 提交一首，等它 complete/failed
  之后再提交下一首。服务端 POOL 本身也是单 worker，这里不额外并发，避免
  把 8765 那个单页面串行模型通道压满。
* 断点续跑：state.json 记录每首的 done / failed / pending，进程被杀、机器重启、
  服务重载后重新执行本脚本会跳过已完成的，绝不重复生成。
* 不重复创建：课堂 id 由 goal 哈希决定，goal 固定 → 重复提交会命中已有课堂。
  失败后重提交同一 goal，服务端会复用已完成的 scenes 继续生成，不浪费。
* 上游瞬时抖动（401 尚未登录 / no close frame / 超时）自动原地重试；
  进度长时间不动判僵死跳过，不让单首堵死整条队列。
* 限速：每首之间留间隔，并可选 --max / --stop-after 分批推进。

用法：
  python scripts/run_classroom_batch.py --status               # 只看进度
  python scripts/run_classroom_batch.py --max 3                # 本次最多 3 首
  python scripts/run_classroom_batch.py                        # 一直跑到跑完
  python scripts/run_classroom_batch.py --retry-failed          # 连同失败项重跑
  python scripts/run_classroom_batch.py --stop-after 7200       # 最多跑 2 小时
"""
import argparse
import atexit
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '.sites-runtime' / 'classroom-batch'
GOALS = OUT / 'goals.jsonl'
STATE = OUT / 'state.json'
LOG = OUT / 'batch.log'
LOCK = OUT / 'batch.lock'
BASE = 'http://127.0.0.1:5173'
CLASSROOM_DIR = ROOT / '.sites-runtime' / 'classrooms'

POLL_INTERVAL = 20          # 秒，轮询课堂生成状态
GAP_BETWEEN = 25            # 秒，两首之间的缓冲，给 8765 喘息
SINGLE_TIMEOUT = 60 * 60    # 单首最长等待 60 分钟（真并行下两路共享上游，放宽）
STALL_TIMEOUT = 20 * 60     # 进度连续 20 分钟不动才判僵死（真并行避免误杀）
SUBMIT_TIMEOUT = 180        # create 请求本身可能要读大谱，给足时间
UPSTREAM_RETRY = 2          # 上游瞬时抖动时原地重试次数
UPSTREAM_MARKS = ('尚未登录', '模型连接未完成', 'no close frame', '登录已过期',
                  'UpstreamError', '直连失败', '响应超时', '连接未完成')


def log(msg):
    line = '[%s] %s' % (time.strftime('%Y-%m-%d %H:%M:%S'), msg)
    print(line, flush=True)
    try:
        with LOG.open('a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


def http(url, payload=None, timeout=60):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode('utf-8')
    headers = {'Content-Type': 'application/json'} if data else {}
    req = urllib.request.Request(url, data=data, headers=headers,
                                 method='POST' if data else 'GET')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def acquire_lock():
    """同一时刻只允许一个批处理实例，避免两个进程同时提交把单 worker 队列压满。"""
    OUT.mkdir(parents=True, exist_ok=True)
    if LOCK.exists():
        try:
            old_pid = int(LOCK.read_text(encoding='utf-8').strip())
        except (OSError, ValueError):
            old_pid = 0
        if old_pid:
            try:
                import psutil
                if psutil.pid_exists(old_pid) and psutil.Process(old_pid).is_running():
                    raise SystemExit('已有批处理实例在运行（pid %d），本次退出' % old_pid)
            except ImportError:
                pass
        log('发现陈旧锁（pid %s），接管' % (old_pid or '?'))
    LOCK.write_text(str(os.getpid()), encoding='utf-8')
    atexit.register(lambda: LOCK.unlink(missing_ok=True))


def load_goals():
    if not GOALS.exists():
        raise SystemExit('缺少 goals.jsonl，请先运行 build_classroom_goals.py')
    rows = []
    with GOALS.open(encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def load_state():
    if STATE.exists():
        try:
            return json.loads(STATE.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            log('state.json 损坏，重建空状态')
    return {'items': {}, 'startedAt': time.time(), 'runs': 0}


def save_state(state):
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding='utf-8')
    tmp.replace(STATE)


def classroom_status(cid):
    """直接读落盘的课堂文件，比走 HTTP 更轻，也不打扰服务。"""
    p = CLASSROOM_DIR / (cid + '.json')
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def submit(rec):
    payload = {
        'scoreId': rec['scoreId'],
        'goal': rec['goal'],
        'goalCustomized': True,
        'scope': 'whole',
        'start': 1,
        'end': 1,               # scope=whole 时服务端按全曲覆盖
        'mode': 'classroom',
        'schoolStage': rec['schoolStage'],
        'level': rec['level'],
        'duration': rec['duration'],
        'features': rec['features'],
        'materialIds': [],
        # 教学参考会联网搜多个搜索引擎，1891 首逐个跑时既慢又易受网络波动影响；
        # 针对性来自 goal 里注入的真实谱面证据，不依赖外部检索。
        'useReferences': False,
    }
    return http(BASE + '/api/classroom/create', payload, timeout=SUBMIT_TIMEOUT)


def create_with_retry(rec):
    """create 时服务端在读大谱，本地连接可能被重置，重试几次。"""
    last_error = None
    for attempt in range(4):
        try:
            created = submit(rec)
            cid = created.get('id')
            if not cid:
                raise RuntimeError('create 未返回课堂编号：%s' % str(created)[:160])
            return cid, None
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')[:200]
            last_error = 'HTTP %d %s' % (e.code, body)
            if e.code in (400, 422):
                break                   # 参数/档案问题，重试无意义
        except Exception as e:
            last_error = type(e).__name__ + ': ' + str(e)[:160]
        time.sleep(3 * (attempt + 1))
    return None, last_error or '提交无响应'


def wait_classroom(cid):
    """轮询到 complete / failed / 僵死 / 超时，返回结果与最后一条消息。"""
    deadline = time.monotonic() + SINGLE_TIMEOUT
    last_progress = None
    last_move = time.monotonic()
    while time.monotonic() < deadline:
        c = classroom_status(cid)
        if c:
            status = c.get('status')
            progress = c.get('progress', 0)
            if last_progress is None or int(progress // 25) > int(last_progress // 25):
                log('  %s | %d%% | %s' % (cid[:10], int(progress),
                                          str(c.get('message', ''))[:60]))
            if last_progress is not None and progress != last_progress:
                last_move = time.monotonic()
            last_progress = progress
            if status == 'complete':
                return 'done', ''
            if status == 'failed':
                msg = str(c.get('message', ''))
                log('  生成失败：%s' % msg[:160])
                return 'failed', msg
        if time.monotonic() - last_move > STALL_TIMEOUT:
            log('  进度 %d 分钟未变化，判定僵死' % (STALL_TIMEOUT // 60))
            return 'stalled', '进度僵死 %d 分钟' % (STALL_TIMEOUT // 60)
        time.sleep(POLL_INTERVAL)
    return 'timeout', '单首等待超过 %d 分钟' % (SINGLE_TIMEOUT // 60)


def process_one(rec, items, state):
    """处理一首，返回 True 表示完成。上游瞬时失败会原地重试。"""
    sid, title = rec['scoreId'], rec['title']
    entry = items.get(sid, {})
    cid = entry.get('classroomId')
    if cid:
        c = classroom_status(cid)
        if c and c.get('status') == 'complete':
            items[sid] = {'status': 'done', 'title': title,
                          'classroomId': cid, 'theme': rec['theme'],
                          'at': time.time(), 'reused': True}
            save_state(state)
            log('  复用已完成课堂 %s' % cid)
            return 'reused'

    for attempt in range(1, UPSTREAM_RETRY + 2):
        cid, err = create_with_retry(rec)
        if not cid:
            items[sid] = {'status': 'failed', 'title': title,
                          'error': err, 'at': time.time()}
            save_state(state)
            log('  提交失败：%s' % str(err)[:140])
            return False

        items[sid] = {'status': 'running', 'title': title,
                      'classroomId': cid, 'theme': rec['theme'], 'at': time.time()}
        save_state(state)
        log('  已创建 %s，等待生成…（第 %d 次）' % (cid, attempt))

        outcome, msg = wait_classroom(cid)
        if outcome == 'done':
            items[sid] = {'status': 'done', 'title': title,
                          'classroomId': cid, 'theme': rec['theme'], 'at': time.time()}
            save_state(state)
            log('  完成 ✓')
            return True

        transient = any(k in msg for k in UPSTREAM_MARKS)
        if transient and attempt <= UPSTREAM_RETRY:
            log('  上游瞬时抖动，稍后重试（已完成的环节会保留）')
            time.sleep(20)
            continue

        items[sid] = {'status': 'failed', 'title': title,
                      'classroomId': cid, 'theme': rec['theme'],
                      'error': msg[:200] or outcome, 'at': time.time()}
        save_state(state)
        log('  记为失败（可用 --retry-failed 重跑）')
        return False
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--max', type=int, default=0, help='本次最多生成多少首，0=不限')
    ap.add_argument('--stop-after', type=int, default=0, help='本次最多运行多少秒，0=不限')
    ap.add_argument('--status', action='store_true')
    ap.add_argument('--retry-failed', action='store_true')
    ap.add_argument('--dry-run', action='store_true', help='只打印将要提交什么')
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    goals = load_goals()
    state = load_state()
    items = state.setdefault('items', {})

    if args.status:
        if LOCK.exists():
            print('锁文件存在，pid=%s' % LOCK.read_text(encoding='utf-8').strip())
        done = [k for k, v in items.items() if v.get('status') == 'done']
        failed = [k for k, v in items.items() if v.get('status') == 'failed']
        print('提示词总数：%d' % len(goals))
        print('已完成：%d' % len(done))
        print('失败：%d' % len(failed))
        print('待生成：%d' % (len(goals) - len(done) - len(failed)))
        print('累计运行次数：%d' % state.get('runs', 0))
        running = [(v.get('title'), v.get('stage')) for v in items.values()
                   if v.get('status') == 'running']
        if running:
            print('进行中：%s' % running[:5])
        if failed:
            print('\n最近 5 个失败：')
            for k in failed[-5:]:
                print('  %s → %s' % (items[k].get('title', '')[:28], items[k].get('error', '')[:90]))
        return 0

    acquire_lock()
    state['runs'] = state.get('runs', 0) + 1
    save_state(state)
    started = time.monotonic()
    generated = 0

    for index, rec in enumerate(goals, 1):
        sid = rec['scoreId']
        entry = items.get(sid, {})
        if entry.get('status') == 'done':
            continue
        if entry.get('status') == 'failed' and not args.retry_failed:
            continue
        if args.max and generated >= args.max:
            log('达到本次 --max %d，停止' % args.max)
            break
        if args.stop_after and time.monotonic() - started > args.stop_after:
            log('达到本次时间上限 %d 秒，停止' % args.stop_after)
            break

        if args.dry_run:
            print('%4d. %s | %s | %d分钟 | goal %d 字'
                  % (index, rec['title'][:30], rec['theme'], rec['duration'], len(rec['goal'])))
            generated += 1
            continue

        log('提交 %d/%d 《%s》｜母题 %s｜%s %d 分钟'
            % (index, len(goals), rec['title'][:34], rec['theme'], rec['level'], rec['duration']))
        outcome = process_one(rec, items, state)
        generated += 1
        # 复用已完成课堂没有占用模型通道，无需喘息，立刻推进到下一首。
        if outcome != 'reused':
            time.sleep(GAP_BETWEEN)

    done = sum(1 for v in items.values() if v.get('status') == 'done')
    failed = sum(1 for v in items.values() if v.get('status') == 'failed')
    log('本次结束：新处理 %d 首；累计完成 %d / %d，失败 %d'
        % (generated, done, len(goals), failed))
    return 0


if __name__ == '__main__':
    sys.exit(main())
