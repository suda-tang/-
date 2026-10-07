"""Password-only access to private reference upload pages."""
import hmac, json, os, secrets, threading, time
from http.cookies import SimpleCookie, CookieError
from urllib.parse import urlparse

PASSWORD=os.environ.get('PIANO_UPLOAD_PASSWORD','tqm')
SESSIONS={}
LOCK=threading.Lock()
COOKIE='suda_upload_session'
TTL=12*60*60

def authorized(handler):
    try:
        jar=SimpleCookie(handler.headers.get('Cookie',''))
        value=jar[COOKIE].value if COOKIE in jar else ''
    except CookieError:return False
    with LOCK:return SESSIONS.get(value,0)>time.time()

def handle(handler):
    route=urlparse(handler.path).path
    if route=='/api/upload/session' and handler.command=='GET':
        return handler.json_response({'authenticated':authorized(handler)})
    if route!='/api/upload/login' or handler.command!='POST':
        return handler.json_response({'error':'接口不存在'},404)
    try:
        size=int(handler.headers.get('Content-Length','0'))
        if not 0<size<=4096:raise ValueError('请求无效')
        data=json.loads(handler.rfile.read(size))
        password=data.get('password')
        if not isinstance(password,str) or not hmac.compare_digest(password.encode(),PASSWORD.encode()):
            return handler.json_response({'error':'密码不正确，请重新输入'},401)
        session=secrets.token_urlsafe(32)
        with LOCK:
            now=time.time()
            for old in list(SESSIONS):
                if SESSIONS[old]<now:del SESSIONS[old]
            SESSIONS[session]=now+TTL
        body=b'{"authenticated":true}'
        secure='; Secure' if handler.headers.get('X-Forwarded-Proto','').split(',')[0].strip()=='https' else ''
        handler.send_response(200)
        handler.send_header('Set-Cookie',f'{COOKIE}={session}; Path=/; HttpOnly; SameSite=Lax; Max-Age={TTL}{secure}')
        handler.send_header('Content-Type','application/json')
        handler.send_header('Content-Length',str(len(body)))
        handler.send_header('Cache-Control','no-store')
        handler.end_headers();handler.wfile.write(body)
    except (ValueError,TypeError):
        handler.close_connection=True
        return handler.json_response({'error':'请求无效'},400)
