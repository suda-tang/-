"""Follow public score download pages without treating HTML as a score."""
import re
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

LIMIT = 50 * 1024 * 1024


def everyone_page(url):
    p = urlparse(url)
    host = (p.hostname or '').lower()
    return (host == 'everyonepiano.cn' or host.endswith('.everyonepiano.cn') or
            host == 'everyonepiano.com' or host.endswith('.everyonepiano.com')) and bool(
                re.match(r'^/(?:Music|Piano|PDF)-\d+', p.path, re.I))


def download(url, validate, headers, session=None):
    """Return verified bytes, media type and final URL; validate every redirect."""
    own = session is None
    session = session or requests.Session()
    deadline = time.monotonic() + 70
    visited = set()
    referer = None
    try:
        for _ in range(10):
            validate(url)
            if url in visited:
                raise ValueError('下载地址循环跳转，未提交识谱')
            visited.add(url)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ValueError('曲谱下载超时，未提交识谱，请稍后重试')
            request_headers = dict(headers)
            if referer:
                request_headers['Referer'] = referer
            with session.get(url, headers=request_headers, timeout=(8, min(20, remaining)),
                             stream=True, allow_redirects=False) as response:
                if response.status_code in (301, 302, 303, 307, 308):
                    target = response.headers.get('Location')
                    if not target:
                        raise ValueError('下载跳转缺少目标地址')
                    referer, url = url, urljoin(url, target)
                    continue
                response.raise_for_status()
                kind = response.headers.get('Content-Type', '').lower()
                data = bytearray()
                # Download pages must not consume the file-size allowance.
                limit = 2 * 1024 * 1024 if 'text/html' in kind else LIMIT
                for chunk in response.iter_content(65536):
                    data.extend(chunk)
                    if len(data) > limit:
                        raise ValueError('下载内容超过允许大小，未提交识谱')
                    if time.monotonic() > deadline:
                        raise ValueError('曲谱下载超时，未提交识谱，请稍后重试')
                if data.startswith(b'%PDF-'):
                    return bytes(data), 'application/pdf', url
                if kind.startswith(('audio/', 'video/')):
                    return bytes(data), kind, url
                soup = BeautifulSoup(bytes(data), 'html.parser')
                candidates = []
                for element in soup.select('a[href], iframe[src], embed[src], object[data]'):
                    target = urljoin(url, element.get('href') or element.get('src') or element.get('data'))
                    path = urlparse(target).path
                    if path.lower().endswith('.pdf') or (everyone_page(target) and re.match(r'^/PDF-\d+', path, re.I)):
                        if target not in visited:
                            candidates.append(target)
                if candidates:
                    candidates.sort(key=lambda x: not urlparse(x).path.lower().endswith('.pdf'))
                    referer, url = url, candidates[0]
                    continue
                text = soup.get_text(' ', strip=True)
                source = 'Everyone Piano' if everyone_page(url) else (urlparse(url).hostname or '来源网站')
                if re.search(r'验证码|人机验证|安全验证', text[:4000]):
                    raise ValueError(source+' 要求网站验证，尚未取得 PDF；请在来源页面完成验证后上传文件')
                if re.search(r'VIP用户|VIP会员|购买VIP|登录后.*下载|请先登录', text, re.I):
                    raise ValueError(source+' 此谱的 PDF 需要登录或 VIP 下载权限；服务器尚未取得文件，请在来源页授权下载后上传 PDF')
                raise ValueError(source+' 页面没有提供可访问的 PDF 文件，未提交识谱')
        raise ValueError('曲谱下载跳转次数过多，未提交识谱')
    finally:
        if own:
            session.close()
