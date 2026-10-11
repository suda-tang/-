"""Server-owned OAuth credentials with per-browser PKCE and conversion jobs."""
import base64
import hashlib
import json
import os
import secrets
import socket
import threading
import time
import uuid
import xml.etree.ElementTree as ET
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import requests
from storage import write_json

ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT / '.sites-runtime' / 'scorestarling-private'
ENDPOINT = 'https://mcp.scorestarling.com/mcp'
ISSUER = 'https://sdvmzivddrrijtfogfcc.supabase.co/auth/v1'
LOCK = threading.RLock()
ACTIVE = set()


def network():
    s = requests.Session()
    proxy = os.environ.get('SCORESTARLING_PROXY')
    if proxy is None and not os.environ.get('HTTPS_PROXY'):
        # Reuse the machine's local proxy when available. Other deployments
        # remain direct, and an explicit empty override disables detection.
        try:
            with socket.create_connection(('127.0.0.1', 7897), timeout=.15):
                proxy = 'http://127.0.0.1:7897'
        except OSError:
            pass
    if proxy:
        s.proxies['https'] = proxy
    return s


def load(sid):
    try:
        return json.loads((PRIVATE / (sid + '.json')).read_text(encoding='utf8'))
    except (OSError, ValueError):
        return {}


def save(sid, data):
    PRIVATE.mkdir(parents=True, exist_ok=True)
    write_json(PRIVATE / (sid + '.json'), data)


def server_account():
    """Migrate an existing connection once; never copy tokens to a browser."""
    with LOCK:
        path = PRIVATE / 'server-account.json'
        if path.exists():
            return load('server-account')
        candidates = []
        for source in PRIVATE.glob('*.json'):
            if len(source.stem) != 64:
                continue
            data = load(source.stem)
            if data.get('client_id') and data.get('token', {}).get('access_token'):
                candidates.append(data)
        if not candidates:
            return {}
        newest = max(candidates, key=lambda d: d.get('expires', 0))
        account = {k: newest[k] for k in ('client_id', 'token', 'expires') if k in newest}
        save('server-account', account)
        return account


def browser_id(handler):
    jar = SimpleCookie()
    try:
        jar.load(handler.headers.get('Cookie', ''))
        sid = jar['scorestarling_session'].value
        if len(sid) == 64 and all(c in '0123456789abcdef' for c in sid):
            return sid
    except (KeyError, ValueError):
        pass
    return secrets.token_hex(32)


def origin(handler):
    # Never accept a caller-supplied callback URL or forwarded host.
    host = handler.headers.get('Host', '')
    if not host or any(c in host for c in '/\\@\r\n'):
        raise ValueError('访问地址无效')
    local = urlparse('http://' + host).hostname in ('localhost', '127.0.0.1', '::1')
    return ('http://' if local else 'https://') + host


def reply(handler, data, status=200, cookie=None):
    raw = json.dumps(data, ensure_ascii=False).encode()
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Cache-Control', 'no-store')
    handler.send_header('Content-Length', str(len(raw)))
    if cookie:
        secure = '; Secure' if origin(handler).startswith('https:') else ''
        handler.send_header('Set-Cookie', f'scorestarling_session={cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000{secure}')
    handler.end_headers()
    handler.wfile.write(raw)


def access_token(sid):
    with LOCK:
        data = server_account()
        token = data.get('token', {})
        if not token.get('access_token'):
            raise ValueError('请先连接 SUPERTANG AI智能转谱 账号')
        if data.get('expires', 0) < time.time() + 60:
            if not token.get('refresh_token'):
                raise ValueError('SUPERTANG AI智能转谱 授权已过期，请重新连接')
            r = network().post(ISSUER + '/oauth/token', data={
                'grant_type': 'refresh_token', 'refresh_token': token['refresh_token'],
                'client_id': data['client_id']}, timeout=25)
            if not r.ok:
                raise ValueError('SUPERTANG AI智能转谱 授权已过期，请重新连接')
            refreshed = r.json()
            data['token'] = {**token, **refreshed}
            data['expires'] = time.time() + refreshed.get('expires_in', 3600)
            save('server-account', data)
        return data['token']['access_token']


class MCP:
    def __init__(self, sid):
        self.sid = sid
        self.session = network()
        self.headers = {'Accept': 'application/json, text/event-stream', 'Content-Type': 'application/json'}
        self.counter = 0
        initialized = self.rpc('initialize', {'protocolVersion': '2025-03-26', 'capabilities': {},
                                'clientInfo': {'name': 'SuDa Piano Teaching', 'version': '1.0'}})
        self.headers['MCP-Protocol-Version'] = initialized.get('protocolVersion', '2025-03-26')
        self.rpc('notifications/initialized', notification=True)
        self.tools = {}
        cursor = None
        for _ in range(20):
            page = self.rpc('tools/list', {'cursor': cursor} if cursor else {})
            self.tools.update({t['name']: t for t in page.get('tools', [])})
            cursor = page.get('nextCursor')
            if not cursor:
                break

    def rpc(self, method, params=None, notification=False):
        self.counter += 1
        payload = {'jsonrpc': '2.0', 'method': method}
        if not notification:
            payload['id'] = self.counter
        if params is not None:
            payload['params'] = params
        headers = {**self.headers, 'Authorization': 'Bearer ' + access_token(self.sid)}
        with self.session.post(ENDPOINT, json=payload, headers=headers, stream=True, timeout=(15, 75)) as r:
            if r.status_code == 401:
                raise ValueError('SUPERTANG AI智能转谱 需要重新登录授权')
            if not r.ok:
                raise ValueError(f'SUPERTANG AI智能转谱 服务返回 HTTP {r.status_code}')
            if r.headers.get('Mcp-Session-Id'):
                self.headers['Mcp-Session-Id'] = r.headers['Mcp-Session-Id']
            if notification:
                return {}
            if 'text/event-stream' in r.headers.get('Content-Type', ''):
                chunks = []
                for line in r.iter_lines(decode_unicode=True):
                    if isinstance(line, bytes):
                        line = line.decode('utf8')
                    if line.startswith('data:'):
                        chunks.append(line[5:].lstrip())
                    elif not line and chunks:
                        message = json.loads('\n'.join(chunks)); chunks = []
                        if message.get('id') == self.counter:
                            return self.result(message)
                raise ValueError('SUPERTANG AI智能转谱 响应中断，没有收到操作结果')
            return self.result(r.json())

    @staticmethod
    def result(message):
        if message.get('error'):
            raise ValueError('SUPERTANG AI智能转谱：' + str(message['error'].get('message', '操作失败'))[:400])
        return message.get('result', {})

    def call(self, name, **arguments):
        if name not in self.tools:
            raise ValueError('连接器未提供所需工具：' + name)
        schema = self.tools[name].get('inputSchema', {})
        properties = schema.get('properties', {})
        # Provider schema, rather than model prose, is the authority on arguments.
        values = {k: v for k, v in arguments.items() if k in properties and v is not None}
        missing = set(schema.get('required', [])) - values.keys()
        if missing:
            raise ValueError('连接器参数需要适配：' + name + ' 缺少 ' + ', '.join(sorted(missing)))
        raw = self.rpc('tools/call', {'name': name, 'arguments': values})
        result = raw.get('structuredContent')
        if not isinstance(result, dict):
            text = '\n'.join(c.get('text', '') for c in raw.get('content', []) if c.get('type') == 'text')
            try:
                result = json.loads(text)
            except ValueError:
                result = {'message': text[:3000]}
        if raw.get('isError') and not (find(result, 'locked') or find(result, 'status') == 'locked'):
            raise ValueError(str(result.get('message') or result.get('error') or result)[:500])
        return result


def find(data, key):
    if isinstance(data, dict):
        if data.get(key) is not None:
            return data[key]
        for value in data.values():
            hit = find(value, key)
            if hit is not None:
                return hit
    elif isinstance(data, list):
        for value in data:
            hit = find(value, key)
            if hit is not None:
                return hit
    return None


def report(ident, title, status, progress, detail, result=''):
    import ai_task_store
    with ai_task_store.LOCK:
        rows = ai_task_store.read()
        previous = next((r for r in rows if r['id'] == ident), {})
        rows = [r for r in rows if r['id'] != ident]
        rows.append({**previous, 'id': ident, 'label': title + ' 转谱', 'kind': 'ai',
                     'status': status, 'progress': progress, 'detail': detail,
                     'result': result, 'created': previous.get('created', time.time()*1000), 'updated': time.time()*1000})
        write_json(ai_task_store.PATH, rows[-200:])


def download_xml(url):
    from ai_web_import import public_url
    for _ in range(5):
        public_url(url)
        with network().get(url, stream=True, allow_redirects=False, timeout=(15, 45)) as r:
            if 300 <= r.status_code < 400:
                from urllib.parse import urljoin
                url = urljoin(url, r.headers['Location'])
                continue
            r.raise_for_status()
            data = bytearray()
            for chunk in r.iter_content(65536):
                data.extend(chunk)
                if len(data) > 20*1024*1024:
                    raise ValueError('导出的 MusicXML 超过 20 MB')
            text = bytes(data).decode('utf-8-sig')
            if '<!DOCTYPE' in text or '<!ENTITY' in text:
                # Standard external MusicXML doctypes aren't needed for rendering.
                import re
                text = re.sub(r'<!DOCTYPE[^>]*>', '', text)
                if '<!ENTITY' in text:
                    raise ValueError('MusicXML 含不支持的实体定义')
            root = ET.fromstring(text)
            if root.tag != 'score-partwise':
                raise ValueError('连接器没有返回有效的分声部 MusicXML')
            return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding='unicode')
    raise ValueError('MusicXML 下载重定向过多')


def run(sid, ident, server):
    data = load(sid); job = data['jobs'][ident]; title = job['title']
    def progress(value, detail):
        report(ident, title, 'running', value, detail)
    try:
        progress(5, '连接 SUPERTANG AI智能转谱，读取工具能力')
        mcp = MCP(sid)
        score_id = job.get('remoteScore')
        if not score_id:
            remote_job = job.get('remoteJob')
            if not remote_job:
                progress(12, '检查音视频链接是否可读取')
                checked = mcp.call('check_link', url=job['url'], link=job['url'], instrument='piano')
                if find(checked, 'recording_error'):
                    raise ValueError(str(find(checked, 'recording_error')))
                progress(20, '提交钢琴转录')
                started = mcp.call('transcribe_link', url=job['url'], link=job['url'], provider='piano', title=title)
                remote_job = find(started, 'job_id')
                score_id = find(started, 'score_id')
                with LOCK:
                    data = load(sid); data['jobs'][ident].update(remoteJob=remote_job, remoteScore=score_id); save(sid, data)
            if remote_job:
                deadline = time.monotonic() + 1800
                while time.monotonic() < deadline:
                    state = mcp.call('get_upload_status', job_id=remote_job, wait_seconds=20)
                    status = find(state, 'status')
                    if status in ('failed', 'error', 'cancelled'):
                        raise ValueError(str(find(state, 'error') or find(state, 'message') or '云端转录失败'))
                    if status == 'needs_review':
                        raise ValueError(str(find(state, 'next_step') or '云端需要确认转录方式，请在 SUPERTANG AI智能转谱 中查看；本地未执行扣费'))
                    if find(state, 'product_quote') and find(state, 'phase') == 'pending':
                        raise ValueError('该链接需要付费转录；尚未扣费，请在 SUPERTANG AI智能转谱 中确认后重新导入')
                    score_id = find(state, 'score_id') or score_id
                    p = find(state, 'progress')
                    progress(min(85, max(22, float(p or 22))), str(find(state, 'stage') or 'SUPERTANG AI智能转谱 正在解析音高、节奏和声部')[:300])
                    if status in ('complete', 'completed', 'done', 'ready', 'succeeded'):
                        break
                    time.sleep(2)
                else:
                    raise ValueError('云端转录超过 30 分钟；结果可能仍在 SUPERTANG AI智能转谱 中处理')
            if not score_id:
                raise ValueError('连接器没有返回曲谱编号，无法导入；请在 SUPERTANG AI智能转谱 中检查任务')
            with LOCK:
                data = load(sid); data['jobs'][ident]['remoteScore'] = score_id; save(sid, data)
        progress(88, '获取 MusicXML 总谱')
        exported = mcp.call('export_score', score_id=score_id, format='musicxml')
        if find(exported, 'locked') or find(exported, 'status') == 'locked':
            credits = find(exported, 'unlock_credits')
            if not job.get('consent'):
                with LOCK:
                    data = load(sid); data['jobs'][ident]['credits'] = credits; save(sid, data)
                report(ident, title, 'queued', 88, f'等待确认：导出 MusicXML 需要 {credits} 积分，尚未扣费')
                return
            if credits is None or credits != job.get('credits'):
                raise ValueError('导出费用已变化，请重新确认；尚未扣费')
            mcp.call('unlock_score', score_id=score_id, credits=credits, consent=True)
            exported = mcp.call('export_score', score_id=score_id, format='musicxml')
        url = find(exported, 'download_url') or find(exported, 'url')
        if not url:
            raise ValueError('连接器未返回 MusicXML 下载地址')
        progress(94, '下载总谱并保存到云曲库')
        xml = download_xml(url)
        digest = hashlib.sha256(('scorestarling:' + str(score_id)).encode()).hexdigest()
        server.write_cached_score(digest, xml, {'title': title, 'userTitle': title, 'sourceType': 'scorestarling',
                                              'sourceUrl': job['url'], 'remoteScoreId': score_id}, parts=server.omr_normalize.REVISION)
        (server.CACHE_DIR / (digest + '.name')).write_text(title, encoding='utf8')
        with LOCK:
            data = load(sid); data['jobs'][ident]['digest'] = digest; save(sid, data)
        report(ident, title, 'complete', 100, '已导入云曲库', digest)
    except Exception as exc:
        detail = str(exc)[:500] if isinstance(exc, ValueError) else '连接器网络或服务异常：' + type(exc).__name__ + '；可重试，不会重复创建已取得的曲谱'
        import ai_task_store
        old = next((r for r in ai_task_store.read() if r['id'] == ident), {})
        report(ident, title, 'failed', old.get('progress', 0), detail)
    finally:
        with LOCK:
            ACTIVE.discard(ident)


def handle(handler, server):
    sid = browser_id(handler); path = urlparse(handler.path).path; query = parse_qs(urlparse(handler.path).query)
    try:
        if path.endswith('/callback'):
            with LOCK:
                data = load(sid); pending = data.get('pending', {})
                if not pending or pending.get('expires', 0) < time.time() or not secrets.compare_digest(pending['state'], query.get('state', [''])[0]):
                    raise ValueError('授权验证失效，请重新连接')
                data.pop('pending', None); save(sid, data)
            code = query.get('code', [''])[0]
            if not code:
                raise ValueError('未完成账号授权')
            r = network().post(ISSUER + '/oauth/token', data={'grant_type': 'authorization_code', 'code': code,
                'client_id': data['client_id'], 'redirect_uri': pending['redirect'], 'code_verifier': pending['verifier']}, timeout=25)
            if not r.ok:
                raise ValueError('授权换取失败，请重新连接')
            with LOCK:
                token = r.json()
                save('server-account', {'client_id': data['client_id'], 'token': token,
                                      'expires': time.time() + token.get('expires_in', 3600)})
                data.pop('token', None); data.pop('expires', None); save(sid, data)
            handler.send_response(302); handler.send_header('Location', '/scorestarling.html?connected=1'); handler.send_header('Cache-Control', 'no-store'); handler.end_headers(); return
        if handler.command == 'GET':
            data = load(sid)
            ident = query.get('id', [''])[0]
            if ident:
                if ident not in data.get('jobs', {}):
                    return reply(handler, {'error': '任务不存在'}, 404)
                import ai_task_store
                row = next((r for r in ai_task_store.read() if r['id'] == ident), {})
                with LOCK:
                    job = data['jobs'][ident]
                    if row.get('status') in ('running', 'queued') and not job.get('digest') and job.get('credits') is None and ident not in ACTIVE:
                        ACTIVE.add(ident)
                        threading.Thread(target=run, args=(sid, ident, server), daemon=True).start()
                return reply(handler, {**row, 'digest': data['jobs'][ident].get('digest'), 'credits': data['jobs'][ident].get('credits')})
            account = server_account()
            connected = bool(account.get('token', {}).get('access_token'))
            error = ''
            if connected:
                try:
                    access_token(sid)
                except (ValueError, requests.RequestException) as exc:
                    connected = False
                    error = str(exc) if isinstance(exc, ValueError) else '暂时无法刷新服务器授权，请稍后重试'
            return reply(handler, {'connected': connected, 'scope': 'server', 'endpoint': ENDPOINT, 'error': error}, cookie=sid)
        n = int(handler.headers.get('Content-Length', '0'))
        if not 0 < n < 16000:
            raise ValueError('请求内容无效')
        payload = json.loads(handler.rfile.read(n))
        if path.endswith('/connect'):
            redirect = origin(handler) + '/api/scorestarling/callback'
            r = network().post(ISSUER + '/oauth/clients/register', json={'client_name': 'SuDa Piano Teaching',
                'redirect_uris': [redirect], 'grant_types': ['authorization_code', 'refresh_token'],
                'response_types': ['code'], 'token_endpoint_auth_method': 'none'}, timeout=25)
            if not r.ok:
                raise ValueError('SUPERTANG AI智能转谱 账号连接注册失败：HTTP ' + str(r.status_code))
            client = r.json(); verifier = secrets.token_urlsafe(48); state = secrets.token_urlsafe(32)
            challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
            with LOCK:
                data = load(sid); data.update(client_id=client['client_id'], pending={'verifier': verifier, 'state': state, 'redirect': redirect, 'expires': time.time()+600}); save(sid, data)
            url = ISSUER + '/oauth/authorize?' + urlencode({'client_id': client['client_id'], 'redirect_uri': redirect,
                'response_type': 'code', 'scope': 'openid email profile offline_access', 'state': state,
                'code_challenge': challenge, 'code_challenge_method': 'S256', 'resource': ENDPOINT})
            return reply(handler, {'url': url}, cookie=sid)
        if path.endswith('/disconnect'):
            with LOCK:
                # A saved empty record prevents migrating an old browser token
                # back into use after an intentional server disconnect.
                save('server-account', {})
            return reply(handler, {'connected': False})
        access_token(sid)
        ident = str(payload.get('id') or '')
        with LOCK:
            data = load(sid)
            if ident:
                job = data.get('jobs', {}).get(ident)
                if not job:
                    raise ValueError('任务不存在')
                if payload.get('consent') is True and payload.get('credits') == job.get('credits') and job.get('credits') is not None:
                    job['consent'] = True
            else:
                from ai_web_import import public_url
                url = str(payload.get('url', '')); public_url(url)
                title = str(payload.get('title') or '网络转录曲谱')[:150]
                ident = 'ai-' + str(uuid.uuid4()); data.setdefault('jobs', {})[ident] = {'url': url, 'title': title}
                report(ident, title, 'queued', 0, '等待连接器处理')
            save(sid, data)
            if ident not in ACTIVE:
                ACTIVE.add(ident); threading.Thread(target=run, args=(sid, ident, server), daemon=True).start()
        return reply(handler, {'id': ident, 'status': 'queued'}, 202)
    except Exception as exc:
        message = str(exc)[:500] if isinstance(exc, ValueError) else '连接 SUPERTANG AI智能转谱 失败：' + type(exc).__name__
        return reply(handler, {'error': message}, 422)


def resume(server):
    """Recover known remote work after a local server restart, without reposting."""
    import ai_task_store
    rows = {r['id']: r for r in ai_task_store.read()}
    for path in PRIVATE.glob('*.json'):
        sid = path.stem
        if len(sid) != 64 or any(c not in '0123456789abcdef' for c in sid):
            continue
        data = load(sid)
        for ident, job in data.get('jobs', {}).items():
            if rows.get(ident, {}).get('status') not in ('running', 'queued') or job.get('digest') or job.get('credits') is not None:
                continue
            if not (job.get('remoteJob') or job.get('remoteScore')):
                report(ident, job['title'], 'failed', 0, '本地服务重启时尚未取得云端任务编号；请检查 SUPERTANG AI智能转谱 是否已收到，避免重复转录')
                continue
            with LOCK:
                if ident not in ACTIVE:
                    ACTIVE.add(ident)
                    threading.Thread(target=run, args=(sid, ident, server), daemon=True).start()
