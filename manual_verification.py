"""Short-lived, same-session user assistance for public image challenges."""
import base64
import secrets
import threading
import time
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
import requests

LOCK = threading.Lock()
PENDING = {}


def prepare(response, session):
    from search_verification import SEARCH_HOSTS
    origin = urlparse(response.url)
    if origin.hostname not in SEARCH_HOSTS:
        return None
    soup = BeautifulSoup(response.text, 'html.parser')
    for form in soup.select('form'):
        fields = form.select('input[name]')
        if any(n.get('type') == 'password' for n in fields):
            continue
        import re
        code = next((n for n in fields if re.search('captcha|verifycode|vcode|validatecode|验证码', str(n), re.I) and n.get('type', 'text') not in ('hidden', 'password')), None)
        image = form.select_one('img[src*="captcha" i],img[src*="vcode" i],img[src*="verify" i],img[alt*="验证码"]')
        if code is None or image is None:
            continue
        action = urljoin(response.url, form.get('action') or response.url)
        src = urljoin(response.url, image.get('src', ''))
        if any((urlparse(u).scheme, urlparse(u).netloc) != (origin.scheme, origin.netloc) for u in (action, src)):
            continue
        method = form.get('method', 'get').lower()
        if method not in ('get', 'post'):
            continue
        with session.get(src, timeout=(3, 6), stream=True, allow_redirects=False) as r:
            r.raise_for_status()
            data = bytearray()
            for chunk in r.iter_content(16384):
                data.extend(chunk)
                if len(data) > 1024 * 1024:
                    return None
        from PIL import Image
        import io
        with Image.open(io.BytesIO(data)) as img:
            if img.width > 2048 or img.height > 2048:
                return None
            out = io.BytesIO();img.convert('RGB').save(out, format='PNG')
        token = secrets.token_urlsafe(24)
        with LOCK:
            now = time.time()
            for key in list(PENDING):
                if PENDING[key]['expires'] < now:
                    del PENDING[key]
            if len(PENDING) >= 32:
                del PENDING[next(iter(PENDING))]
            PENDING[token] = dict(expires=now+600, cookies=session.cookies.copy(), headers=dict(session.headers), action=action, method=method, field=code['name'], payload={n['name']:n.get('value', '') for n in fields if n.get('type', 'text') in ('text', 'hidden', 'submit')}, host=origin.hostname)
        return {'id':token, 'image':'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode(), 'status':'waiting_user', 'detail':'请输入图片中的验证码，验证通过后继续检索'}
    return None


def complete(token, code):
    from search_verification import is_challenge
    with LOCK:
        entry = PENDING.pop(token, None)
    if not entry or entry['expires'] < time.time():
        raise ValueError('验证已过期，请重新检索获取新的验证码')
    if not code or len(code) > 20:
        raise ValueError('请输入有效的验证码')
    with requests.Session() as session:
        session.cookies.update(entry['cookies']);session.headers.update(entry['headers'])
        payload = {**entry['payload'], entry['field']:code}
        r = getattr(session, entry['method'])(entry['action'], **({'data':payload} if entry['method']=='post' else {'params':payload}), timeout=(3, 8), allow_redirects=False)
        r.raise_for_status()
        if r.is_redirect:
            target = urljoin(entry['action'], r.headers.get('Location', ''))
            if (urlparse(target).scheme,urlparse(target).netloc) != (urlparse(entry['action']).scheme,urlparse(entry['action']).netloc):
                raise ValueError('验证跳转到了其他网站，尚未确认通过')
            r = session.get(target, timeout=(3,8), allow_redirects=False);r.raise_for_status()
        r.encoding = r.apparent_encoding or 'utf-8'
        if r.is_redirect or is_challenge(r):
            raise ValueError('网站尚未确认验证通过，请重新检索获取新的验证码')
        import classroom_references as refs
        with refs.COOKIE_LOCK:
            refs.SEARCH_COOKIES[entry['host']] = session.cookies.copy()
            refs.ENGINE_COOLDOWN.pop(entry['host'], None)
    return {'status':'passed'}
