"""导师访问行为采集与聚合（本地 JSONL + 口令保护的后台报表）。

采集：前端 visit-telemetry.js 在带 ?visit= / ?mentor= 的会话里，用 sendBeacon
      向 POST /api/visit 发送 start / heartbeat / event / end，这里追加到
      .sites-runtime/mentor-events.jsonl。
聚合：GET /api/mentor-report?key=... 读取 JSONL，按老师 / 会话汇总出
      打开时间、次数、停留时长、各面板/视图/曲谱停留、功能使用次数。

隐私：只落本地文件；报表接口必须带口令（环境变量 MENTOR_REPORT_KEY，
      或首次自动生成到 .sites-runtime/mentor-report.key）。
"""
import json
import os
import secrets
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EVENTS = ROOT / '.sites-runtime' / 'mentor-events.jsonl'
KEY_FILE = ROOT / '.sites-runtime' / 'mentor-report.key'
MAX_BYTES = 16 * 1024 * 1024
_VISITS = {'stamp': None, 'data': None}


def admin_key():
    key = os.environ.get('MENTOR_REPORT_KEY', '').strip()
    if key:
        return key
    try:
        key = KEY_FILE.read_text(encoding='utf-8').strip()
        if key:
            return key
    except OSError:
        pass
    key = secrets.token_urlsafe(18)
    try:
        KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        KEY_FILE.write_text(key, encoding='utf-8')
    except OSError:
        pass
    return key


def _reply(handler, data, status=200):
    raw = json.dumps(data, ensure_ascii=False).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Cache-Control', 'no-store')
    handler.send_header('Content-Length', str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


def visits():
    """令牌 -> 老师 的映射（dist/mentor-visits.json），按 mtime 缓存。"""
    path = ROOT / 'dist' / 'mentor-visits.json'
    try:
        stamp = path.stat().st_mtime
    except OSError:
        return {}
    if _VISITS['stamp'] == stamp and _VISITS['data'] is not None:
        return _VISITS['data']
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}
    _VISITS['stamp'], _VISITS['data'] = stamp, data
    return data


def _num(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _dict_of_int(value):
    if not isinstance(value, dict):
        return {}
    out = {}
    for key, item in value.items():
        out[str(key)[:120]] = _num(item)
    return out


def client_ip(handler):
    """优先用代理转发头里的真实 IP；都没有才退回 socket 地址。"""
    for name in ('X-Forwarded-For', 'X-Real-IP', 'CF-Connecting-IP', 'True-Client-IP'):
        value = handler.headers.get(name)
        if value:
            return value.split(',')[0].strip()[:64]
    return handler.client_address[0] if handler.client_address else ''


def record(handler):
    """POST /api/visit：接收前端行为事件，落盘。"""
    try:
        length = int(handler.headers.get('Content-Length', '0'))
    except ValueError:
        length = 0
    if not 0 < length <= 32768:
        return _reply(handler, {'error': '请求体无效'}, 400)
    try:
        payload = json.loads(handler.rfile.read(length).decode('utf-8', errors='replace'))
    except (ValueError, OSError):
        return _reply(handler, {'error': 'JSON 无效'}, 400)
    if not isinstance(payload, dict):
        return _reply(handler, {'error': 'JSON 无效'}, 400)
    kind = str(payload.get('kind') or '')
    if kind not in ('start', 'heartbeat', 'event', 'end'):
        return _reply(handler, {'error': '未知事件类型'}, 400)
    token = str(payload.get('token') or '')[:80]
    mentor = str(payload.get('mentor') or '')[:60]
    # 匿名访客也收：name 留空，聚合时按公网 IP 归类。
    person = visits().get(token) or {}
    row = {
        'ts': int(time.time() * 1000),
        'at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'kind': kind,
        'token': token,
        'name': person.get('name') or mentor,
        'institution': person.get('institution', ''),
        'session': str(payload.get('session') or '')[:64],
        'panel': str(payload.get('panel') or '')[:40],
        'view': str(payload.get('view') or '')[:24],
        'score': str(payload.get('score') or '')[:100],
        'action': str(payload.get('action') or '')[:100],
        'detail': payload.get('detail'),
        'visibleMs': _num(payload.get('visibleMs')),
        'activeMs': _num(payload.get('activeMs')),
        'sectionMs': _dict_of_int(payload.get('sectionMs')),
        'tourMs': _dict_of_int(payload.get('tourMs')),
        'features': _dict_of_int(payload.get('features')),
        'device': payload.get('device') if isinstance(payload.get('device'), dict) else None,
        'screen': str(payload.get('screen') or '')[:24],
        'lang': str(payload.get('lang') or '')[:20],
        'referer': str(payload.get('referer') or handler.headers.get('Referer') or '')[:300],
        'ua': str(payload.get('ua') or handler.headers.get('User-Agent') or '')[:300],
        'ip': client_ip(handler),
        'publicIp': str(payload.get('publicIp') or '')[:64],
        'publicGeo': str(payload.get('publicGeo') or '')[:120],
    }
    try:
        EVENTS.parent.mkdir(parents=True, exist_ok=True)
        try:
            if EVENTS.stat().st_size > MAX_BYTES:
                os.replace(EVENTS, EVENTS.with_suffix('.jsonl.1'))
        except OSError:
            pass
        with EVENTS.open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(row, ensure_ascii=False) + '\n')
    except OSError:
        return _reply(handler, {'error': '写入失败'}, 500)
    return _reply(handler, {'ok': True})


def _rows():
    out = []
    for path in (EVENTS.with_suffix('.jsonl.1'), EVENTS):
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


def aggregate():
    rows = _rows()
    sessions = {}
    for row in rows:
        sid = row.get('session') or ('anon-' + str(row.get('ts')))
        session = sessions.setdefault(sid, {
            'session': sid, 'token': row.get('token', ''), 'name': row.get('name', ''),
            'institution': row.get('institution', ''), 'ua': row.get('ua', ''),
            'referer': row.get('referer', ''), 'screen': row.get('screen', ''), 'lang': row.get('lang', ''),
            'first': row.get('ts', 0), 'last': row.get('ts', 0),
            'visibleMs': 0, 'activeMs': 0, 'ip': row.get('ip', ''), 'publicIp': '', 'publicGeo': '',
            'sectionMs': {}, 'tourMs': {}, 'features': {}, 'scores': [], 'timeline': [], 'events': 0,
            'device': None, 'aiChat': [], 'classroom': [], 'tourSteps': [],
        })
        session['first'] = min(session['first'], row.get('ts', 0))
        session['last'] = max(session['last'], row.get('ts', 0))
        # 客户端发的是累计值：取 max，丢一两个心跳也不会少算。
        session['visibleMs'] = max(session['visibleMs'], _num(row.get('visibleMs')))
        session['activeMs'] = max(session['activeMs'], _num(row.get('activeMs')))
        for key, value in (row.get('sectionMs') or {}).items():
            session['sectionMs'][key] = max(session['sectionMs'].get(key, 0), _num(value))
        for key, value in (row.get('tourMs') or {}).items():
            session['tourMs'][key] = max(session['tourMs'].get(key, 0), _num(value))
        if row.get('device') and not session['device']:
            session['device'] = row['device']
        if row.get('publicIp'):
            session['publicIp'] = row['publicIp']
        if row.get('publicGeo'):
            session['publicGeo'] = row['publicGeo']
        for key, value in (row.get('features') or {}).items():
            session['features'][key] = max(session['features'].get(key, 0), _num(value))
        if row.get('score') and row['score'] not in session['scores']:
            session['scores'].append(row['score'])
        if row.get('kind') == 'event':
            session['events'] += 1
            action = row.get('action') or ''
            detail = row.get('detail')
            if len(session['timeline']) < 3000:
                session['timeline'].append({'ts': row.get('ts', 0), 'action': action, 'detail': detail})
            if action == 'ai_chat' and isinstance(detail, dict) and len(session['aiChat']) < 1000:
                session['aiChat'].append({'ts': row.get('ts', 0),
                                          'role': str(detail.get('role') or '')[:16],
                                          'text': str(detail.get('text') or '')[:4000]})
            elif action in ('classroom', 'classroom_reply') and len(session['classroom']) < 1000:
                session['classroom'].append({'ts': row.get('ts', 0), 'action': action, 'detail': detail})
            elif action == 'tour_step' and isinstance(detail, dict) and len(session['tourSteps']) < 500:
                session['tourSteps'].append({'ts': row.get('ts', 0),
                                             'id': str(detail.get('id') or '')[:40],
                                             'title': str(detail.get('title') or '')[:80],
                                             'index': detail.get('index'), 'total': detail.get('total')})

    teachers = {}
    for session in sessions.values():
        # 有导师令牌就按老师；没有就按公网 IP 归类匿名访客。
        # 拿不到公网 IP 时用会话号单独成组，避免所有匿名访客挤进 127.0.0.1。
        socket_ip = session.get('ip') or ''
        usable_ip = session.get('publicIp') or ('' if socket_ip in ('127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost') else socket_ip)
        key = session['name'] or usable_ip or ('anon-' + session['session'])
        display = session['name'] or ('访客 ' + (usable_ip or session['session'][:8]))
        teacher = teachers.setdefault(key, {
            'name': display, 'token': session['token'],
            'anonymous': not bool(session['name']),
            'institution': session['institution'] or session.get('publicGeo', ''),
            'visits': 0, 'first': session['first'], 'last': session['last'],
            'totalVisibleMs': 0, 'totalActiveMs': 0,
            'features': {}, 'sectionMs': {}, 'tourMs': {}, 'scores': [], 'sessions': [],
        })
        teacher['visits'] += 1
        teacher['first'] = min(teacher['first'], session['first'])
        teacher['last'] = max(teacher['last'], session['last'])
        teacher['totalVisibleMs'] += session['visibleMs']
        teacher['totalActiveMs'] += session['activeMs']
        for key2, value in session['features'].items():
            teacher['features'][key2] = teacher['features'].get(key2, 0) + value
        for key2, value in session['sectionMs'].items():
            teacher['sectionMs'][key2] = teacher['sectionMs'].get(key2, 0) + value
        for key2, value in session['tourMs'].items():
            teacher['tourMs'][key2] = teacher['tourMs'].get(key2, 0) + value
        for score in session['scores']:
            if score not in teacher['scores']:
                teacher['scores'].append(score)
        teacher['sessions'].append({
            'session': session['session'], 'first': session['first'], 'last': session['last'],
            'visibleMs': session['visibleMs'], 'activeMs': session['activeMs'],
            'features': session['features'], 'sectionMs': session['sectionMs'],
            'tourMs': session['tourMs'], 'device': session['device'],
            'aiChat': session['aiChat'], 'classroom': session['classroom'],
            'tourSteps': session['tourSteps'],
            'scores': session['scores'], 'ua': session['ua'], 'referer': session['referer'],
            'screen': session['screen'], 'lang': session['lang'], 'ip': session['ip'],
            'publicIp': session['publicIp'], 'publicGeo': session['publicGeo'],
            'events': session['events'], 'timeline': session['timeline'][-2000:],
        })

    for teacher in teachers.values():
        teacher['sessions'].sort(key=lambda item: item['first'], reverse=True)
        teacher['avgActiveMs'] = int(teacher['totalActiveMs'] / teacher['visits']) if teacher['visits'] else 0

    ordered = sorted(teachers.values(), key=lambda item: item['last'], reverse=True)
    total_visits = len(sessions)
    total_active = sum(teacher['totalActiveMs'] for teacher in teachers.values())
    return {
        'generated': int(time.time() * 1000),
        'totals': {
            'teachers': len(teachers),
            'visits': total_visits,
            'activeMs': total_active,
            'avgActiveMs': int(total_active / total_visits) if total_visits else 0,
        },
        'teachers': ordered,
    }


def report(handler):
    """GET /api/mentor-report?key=...：口令保护的行为报表。"""
    from urllib.parse import parse_qs, urlparse
    query = parse_qs(urlparse(handler.path).query)
    supplied = (query.get('key') or [''])[0] or handler.headers.get('X-Mentor-Key', '')
    expected = admin_key()
    if not supplied or not secrets.compare_digest(supplied, expected):
        return _reply(handler, {'error': '口令不正确', 'hint': '口令见 .sites-runtime/mentor-report.key'}, 403)
    return _reply(handler, aggregate())
