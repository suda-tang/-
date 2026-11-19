"""Server-side song search -> audio download -> remote transcription -> library."""
import hashlib
import json
import re
import threading
import time
import uuid
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs
import requests
from storage import write_json

PRIVATE=Path(__file__).resolve().parent/'.sites-runtime/music-transcription-private'
BASE='http://159.75.42.46'
SEARCH_BASE='https://musicjx.com/'
LOCK=threading.RLock()
POOL=ThreadPoolExecutor(max_workers=2)
SEARCH_POOL=ThreadPoolExecutor(max_workers=6)
ACTIVE=set()


def read(name,default=None):
    try:return json.loads((PRIVATE/name).read_text(encoding='utf-8'))
    except (OSError,ValueError):return default if default is not None else {}


def session():
    s=requests.Session();s.cookies.update(read('session.json'))
    r=s.get(BASE+'/api/auth/me',timeout=(5,15))
    if r.status_code==401:
        account=read('account.json')
        if not account:raise ValueError('联网转谱账号尚未配置')
        r=s.post(BASE+'/api/auth/login',json=account,timeout=(5,15));r.raise_for_status()
        write_json(PRIVATE/'session.json',s.cookies.get_dict())
    else:r.raise_for_status()
    return s


# ── 酷我音乐：第二个真实音源（搜索 / 完整 mp3 直链 / 封面 / 歌词）─────────────
# 2026-11-15：聚合站 musicjx 首页已变成 SPA（旧接口返 HTML），QQ 匿名取 vkey 返回空 purl，
# 于是「平台分类」永远只有网易云一组。实测酷我还能匿名拿到完整 mp3（HEAD 200 audio/mpeg）
# 和逐行歌词，所以把它接成第二路 —— 分类里出现的两组都是真能播、能转谱的。
KUWO_SEARCH='http://search.kuwo.cn/r.s'
KUWO_ANTI='http://antiserver.kuwo.cn/anti.s'
KUWO_LYRIC='http://m.kuwo.cn/newh5/singles/songinfoandlrc'
KUWO_HEADERS={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)','Referer':'http://www.kuwo.cn/'}
_KUWO_URLS={}
_KUWO_URL_TTL=1800
_KUWO_FETCH=ThreadPoolExecutor(max_workers=8)


def _kuwo_text(value):
    # 酷我返回的是「单引号伪 JSON」，艺人名里常见 周也\\u0026丞磊 / A&nbsp;B 这类转义，
    # 解析后可能残留一层反斜杠，统一清掉。
    text=(str(value or '').replace('\\u0026','&').replace('\\&','&')
          .replace('&nbsp;',' ').replace('&amp;','&'))
    return re.sub(r'\s+',' ',text).strip()


def _kuwo_rid(value):
    rid=str(value or '').strip()
    if rid.startswith('MUSIC_'):return rid
    return 'MUSIC_'+rid if rid.isdigit() else ''


def _kuwo_audio(rid):
    """anti.s 把 rid 换成 CDN 上的完整 mp3；无版权/需付费时返回空串。"""
    hit=_KUWO_URLS.get(rid)
    if hit and time.time()-hit[0]<_KUWO_URL_TTL:return hit[1]
    try:
        r=requests.get(KUWO_ANTI,params={'type':'convert_url','format':'mp3','response':'url','rid':rid},
                       headers=KUWO_HEADERS,timeout=(4,12))
        r.raise_for_status()
        url=r.text.strip()
        if not url.startswith('http'):return ''
        if len(_KUWO_URLS)>400:_KUWO_URLS.clear()
        _KUWO_URLS[rid]=(time.time(),url)
        return url
    except requests.RequestException:
        return ''


def _kuwo_cover(short):
    short=str(short or '').strip()
    if not short:return ''
    # 酷我给的相对路径自带尺寸段（120/s4s26/…），而 CDN 的尺寸要写在 albumcover 后面，
    # 直接拼成 500/120/… 会 404（2026-11-15 实测）。
    return 'https://img2.kuwo.cn/star/albumcover/500/'+re.sub(r'^\d+/','',short)


def _kuwo_lyric(rid):
    """酷我逐行歌词 → LRC 文本；失败返回空串（交给网易云同名兜底）。"""
    try:
        r=requests.get(KUWO_LYRIC,params={'musicId':rid.replace('MUSIC_','')},
                       headers={**KUWO_HEADERS,'Referer':'http://m.kuwo.cn/'},timeout=(4,12))
        r.raise_for_status()
        rows=(r.json().get('data') or {}).get('lrclist') or []
    except (requests.RequestException,ValueError):
        return ''
    lines=[]
    for row in rows:
        if not isinstance(row,dict):continue
        text=str(row.get('lineLyric') or '').strip()
        try:seconds=float(row.get('time') or 0)
        except (TypeError,ValueError):continue
        if not text:continue
        lines.append('[%02d:%05.2f]%s'%(int(seconds//60),seconds%60,text))
    return '\n'.join(lines)


def _kuwo_rid_of(entry):
    for field in ('source','audio'):
        m=re.search(r'play_detail/(\d+)',str(entry.get(field) or ''))
        if m:return 'MUSIC_'+m.group(1)
    return ''


def _kuwo_search(query,page=1):
    r=requests.get(KUWO_SEARCH,params={'all':query,'ft':'music','itemset':'web_2013','client':'kt',
        'pn':max(0,page-1),'rn':30,'rformat':'json','encoding':'utf8'},headers=KUWO_HEADERS,timeout=(4,15))
    r.raise_for_status()
    body=r.text
    try:
        data=json.loads(body)
    except ValueError:
        data=json.loads(body.replace("'",'"'))
    rows=data.get('abslist') or []
    if not isinstance(rows,list) or not rows:raise ValueError('酷我暂未返回可用结果')
    def build(row):
        if not isinstance(row,dict):return None
        rid=_kuwo_rid(row.get('MUSICRID'));title=_kuwo_text(row.get('SONGNAME'))
        if not rid or not title:return None
        url=_kuwo_audio(rid)
        if not url:return None
        key=hashlib.sha256(('kuwo'+rid+url).encode()).hexdigest()
        return key,{'id':key,'title':title[:150],'artist':_kuwo_text(row.get('ARTIST'))[:120],
                    'platform':'kuwo','audio':url,
                    'source':'https://www.kuwo.cn/play_detail/'+rid.replace('MUSIC_',''),
                    'cover':_kuwo_cover(row.get('web_albumpic_short')),'created':time.time(),'query':query}
    entries={}
    for built in _KUWO_FETCH.map(build,rows):
        if built:entries[built[0]]=built[1]
    try:total=int(data.get('TOTAL') or 0)
    except (TypeError,ValueError):total=0
    with LOCK:
        catalog=read('catalog.json');catalog={k:v for k,v in catalog.items() if time.time()-v.get('created',0)<3600};catalog.update(entries);PRIVATE.mkdir(parents=True,exist_ok=True);write_json(PRIVATE/'catalog.json',catalog)
    items=[{k:e.get(k,'') for k in ('id','title','artist','platform','cover')} for e in entries.values()]
    return {'results':items,'provider':'kuwo','page':page,'hasMore':page*30<total,
            'requestedPlatform':'kuwo','fallback':False,'notice':''}


def search(query,platform='netease',provider=None,page=1):
    if platform not in ('netease','qq','kugou','kuwo','migu'):raise ValueError('不支持的音乐平台')
    query=str(query).strip()[:100]
    if not query:raise ValueError('请输入歌名')
    page=max(1,int(page));fallback=False;requested_platform=platform;has_more=False
    if platform=='kuwo':return _kuwo_search(query,page)
    try:
        if provider=='netease':raise ValueError('使用并行快速检索')
        r=requests.post(SEARCH_BASE,data={'input':query,'filter':'name','type':platform,'page':page},headers={'X-Requested-With':'XMLHttpRequest','Referer':SEARCH_BASE,'User-Agent':'Mozilla/5.0'},timeout=(3,15));r.raise_for_status()
        data=r.json()
        if data.get('code',200)!=200:raise ValueError(str(data.get('error') or data.get('msg') or '音乐搜索没有返回结果')[:200])
        if not isinstance(data.get('data'),list):raise ValueError('搜索站未返回歌曲列表')
        has_more=len(data['data'])>=10
    except (requests.RequestException,ValueError) as error:
        if provider=='musicjx':raise
        try:
            r=requests.get('https://music.163.com/api/search/get/web',params={'s':query,'type':1,'limit':30,'offset':(page-1)*30},headers={'User-Agent':'Mozilla/5.0','Referer':'https://music.163.com/'},timeout=(3,10));r.raise_for_status()
            response=r.json()
            if response.get('code')!=200:raise ValueError('备用搜索服务没有返回有效结果')
            result=response.get('result',{});has_more=(page-1)*30+len(result.get('songs',[]))<result.get('songCount',0) if 'songCount' in result else len(result.get('songs',[]))>=30
            data={'data':[{'songid':song['id'],'title':song['name'],'author':' / '.join(a.get('name','') for a in song.get('artists',[])),'url':'https://music.163.com/song/media/outer/url?id='+str(song['id'])+'.mp3','link':'https://music.163.com/song?id='+str(song['id']),'cover':((song.get('album') or {}).get('picUrl') or '')} for song in response.get('result',{}).get('songs',[]) if song.get('id') and song.get('name')]}
            fallback=True;platform='netease'
        except (requests.RequestException,ValueError) as secondary:
            raise ValueError('找歌主通道连接失败，网易云备用搜索也未响应。尚未创建转谱任务，请稍后重试。') from secondary
    items=[];entries={}
    for item in (data.get('data') or []):
        if not item.get('url') or not item.get('title'):continue
        url=item['url']
        if url.startswith('http://music.163.com/'):url='https://'+url[7:]
        key=hashlib.sha256((platform+str(item.get('songid'))+url).encode()).hexdigest()
        entry={'id':key,'title':str(item['title'])[:150],'artist':str(item.get('author',''))[:120],'platform':platform,'audio':url,'source':item.get('link',''),'cover':str(item.get('cover') or ''),'created':time.time(),'query':query}
        entries[key]=entry
    # 主通道（聚合搜索）不给封面，按音频 URL 里的网易云 id 批量补一次。
    missing=[e for e in entries.values() if not e.get('cover')]
    if missing:
        ids=[]
        for e in missing:
            m=re.search(r'[?&]id=(\d+)',str(e.get('audio') or '')+' '+str(e.get('source') or ''))
            ids.append(m.group(1) if m else '')
        covers=_netease_covers([i for i in ids if i])
        for e,i in zip(missing,ids):
            if i and covers.get(i):e['cover']=covers[i]
    for e in entries.values():
        items.append({k:e.get(k,'') for k in ('id','title','artist','platform','cover')})
    with LOCK:
        catalog=read('catalog.json');catalog={k:v for k,v in catalog.items() if time.time()-v.get('created',0)<3600};catalog.update(entries);PRIVATE.mkdir(parents=True,exist_ok=True);write_json(PRIVATE/'catalog.json',catalog)
    return {'results':items,'provider':'netease-public' if fallback else 'musicjx','page':page,'hasMore':has_more,'requestedPlatform':requested_platform,'fallback':fallback,'notice':'所选平台暂未返回可用结果，已改用网易云备用搜索。转谱前会核验该版本能否获取完整音频。' if fallback else ''}


def stream_search(handler,query,platform,pages=None):
    query=str(query).strip()[:100]
    if not query or platform not in ('netease','qq','kugou','kuwo','migu'):raise ValueError('请输入歌名并选择音乐平台')
    initial=pages is None
    # 一路只查一个真实音源：netease / kuwo。聚合站 musicjx 已下线，不再空转一路超时。
    default_pages={'kuwo':1} if platform=='kuwo' else {'netease':1}
    pages=default_pages if initial else {key:max(1,int(value)) for key,value in pages.items() if key in ('musicjx','netease','kuwo')}
    if not pages:pages=default_pages
    handler.send_response(200);handler.send_header('Content-Type','application/x-ndjson; charset=utf-8')
    handler.send_header('X-Accel-Buffering','no');handler.send_header('Connection','close');handler.end_headers();handler.close_connection=True
    def emit(event):
        handler.wfile.write((json.dumps(event,ensure_ascii=False)+'\n').encode());handler.wfile.flush()
    seen=set();futures={}
    try:
        label={'netease':'网易云音乐','kuwo':'酷我音乐','musicjx':'聚合搜索'}
        emit({'type':'progress','text':'正在查询 '+label.get(platform,'音乐来源'),'completed':0,'total':len(pages)})
        # Previously found versions are usable immediately; fresh channels append.
        for entry in list(read('catalog.json').values()) if initial else []:
            if entry.get('query')==query and entry.get('platform')==platform and time.time()-entry.get('created',0)<300:
                seen.add(entry['id']);emit({'type':'song','item':{k:entry.get(k,'') for k in ('id','title','artist','platform','cover')}})
        futures={SEARCH_POOL.submit(search,query,platform,provider,page):provider for provider,page in pages.items()}
        completed=0;next_pages={}
        for future in as_completed(futures):
            completed+=1
            try:
                data=future.result()
                provider=futures[future]
                if data.get('hasMore'):next_pages[provider]=pages[provider]+1
                emit({'type':'page','provider':provider,'page':pages[provider],'ids':[item['id'] for item in data['results']]})
                for item in data['results']:
                    if item['id'] not in seen:
                        seen.add(item['id']);emit({'type':'song','item':item})
            except Exception:
                emit({'type':'warning','text':label.get(futures[future],'该通道')+'暂未返回结果，其他结果仍可使用'})
            emit({'type':'progress','text':'已找到 '+str(len(seen))+' 个版本'+('，继续补充' if completed<len(pages) else ''),'completed':completed,'total':len(pages)})
        emit({'type':'done','count':len(seen),'nextPages':next_pages})
    except (BrokenPipeError,ConnectionError,OSError):
        for future in futures:future.cancel()


# ── 全屏动态歌词（同源代理） ──────────────────────────────────────────────────
# 浏览器直连 music.163.com 的歌词接口没有 Access-Control-Allow-Origin，会被 CORS 拦，
# 故由本服务端代取。只接受 catalog.json 里已存在的试听 id，不接受任意 URL（防 SSRF）。
# 实测（2026-11-13，songId=185694）：
#   /api/song/lyric?id=..&lv=1&kv=1&tv=-1        → lrc 逐行
#   再加 &yv=1&ytv=1&yrv=1                        → yrc 毫秒级逐字
#   yrc 行格式：[start,duration](wordStart,wordDuration,0)字(wordStart,...)字
_LYRIC_CACHE = {}
_LYRIC_TTL = 600
_LYRIC_HEADERS = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/'}


def _cached(key):
    hit = _LYRIC_CACHE.get(key)
    if hit and time.time() - hit[0] < _LYRIC_TTL:
        return hit[1]
    return None


def _netease_cover(song_id):
    """封面：Folia 的「莫奈」模式右侧会放一张专辑卡，没有 coverUrl 就是一块空白。

    lyric 接口不带封面，得单独问 song/detail。失败就当没有，绝不影响歌词主流程。
    """
    if not song_id:
        return ''
    try:
        r = requests.get('https://music.163.com/api/song/detail',
                         params={'ids': '[%s]' % song_id},
                         headers=_LYRIC_HEADERS, timeout=(4, 10))
        r.raise_for_status()
        songs = r.json().get('songs') or []
        if songs:
            album = songs[0].get('album') or {}
            return str(album.get('picUrl') or '')
    except Exception:
        pass
    return ''


def _netease_covers(song_ids):
    """一次请求批量取封面：搜索主通道（聚合）不带图，按网易云 id 补一遍。"""
    ids = [str(i) for i in song_ids if i][:50]
    if not ids:
        return {}
    try:
        r = requests.get('https://music.163.com/api/song/detail',
                         params={'ids': '[' + ','.join(ids) + ']'},
                         headers=_LYRIC_HEADERS, timeout=(4, 12))
        r.raise_for_status()
        out = {}
        for song in r.json().get('songs') or []:
            album = song.get('album') or {}
            out[str(song.get('id'))] = str(album.get('picUrl') or '')
        return out
    except Exception:
        return {}


def _netease_lyric(song_id):
    params = {'id': song_id, 'lv': 1, 'kv': 1, 'tv': -1, 'yv': 1, 'ytv': 1, 'yrv': 1}
    r = requests.get('https://music.163.com/api/song/lyric', params=params,
                     headers=_LYRIC_HEADERS, timeout=(5, 15))
    r.raise_for_status()
    d = r.json()
    return {
        'lrc': (d.get('lrc') or {}).get('lyric') or '',
        'yrc': (d.get('yrc') or {}).get('lyric') or '',
        'tlyric': (d.get('tlyric') or {}).get('lyric') or '',
        'pureMusic': bool(d.get('pureMusic')),
    }


def _netease_song_id(entry):
    for field in ('source', 'audio'):
        m = re.search(r'[?&]id=(\d+)', str(entry.get(field) or ''))
        if m:
            return m.group(1)
    return ''


def _netease_candidates(title, artist):
    """非网易云音源的歌词兜底：按曲名在网易云取若干候选，按艺术家相关度排序。

    实测踩过：只取「最像的一首」经常命中 beat / 钢琴版等纯音乐，歌词为空。
    因此返回多个候选，由 lyrics() 逐个试到有歌词为止。
    """
    query = re.sub(r'\s*[（(【\[].*?[）)】\]]\s*', ' ', str(title or '')).strip()
    if not query:
        return []
    r = requests.get('https://music.163.com/api/search/get/web',
                     params={'s': query, 'type': 1, 'limit': 10, 'offset': 0},
                     headers=_LYRIC_HEADERS, timeout=(5, 15))
    r.raise_for_status()
    songs = ((r.json().get('result') or {}).get('songs') or [])
    wanted = str(artist or '').lower()
    scored = []
    for song in songs:
        sid = str(song.get('id') or '')
        if not sid:
            continue
        names = ' / '.join(a.get('name', '') for a in (song.get('artists') or []))
        score = (2 if wanted and wanted in names.lower() else 0) + (1 if song.get('name') else 0)
        scored.append((score, sid, song.get('name') or ''))
    scored.sort(key=lambda item: -item[0])
    return [(sid, name) for _, sid, name in scored[:5]]


def lyrics(handler):
    """GET /api/online-music/lyric?id=<catalogId> → 逐行/逐字歌词 JSON。"""
    ident = parse_qs(urlparse(handler.path).query).get('id', [''])[0]
    entry = read('catalog.json').get(ident)
    if not entry:
        return handler.json_response({'ok': False, 'reason': '试听版本已过期，请重新搜索'}, 422)
    key = (entry.get('platform') or '', ident)
    cached = _cached(key)
    if cached:
        return handler.json_response(cached)

    platform = entry.get('platform') or ''
    if platform == 'kuwo':
        # 酷我自带逐行歌词，比按曲名去网易云碰运气准；拿不到再落到下面的同名兜底。
        krid = _kuwo_rid_of(entry)
        klrc = _kuwo_lyric(krid) if krid else ''
        if klrc:
            payload = {'ok': True, 'platform': platform, 'songId': krid,
                       'title': entry.get('title') or '', 'artist': entry.get('artist') or '',
                       'lrc': klrc, 'yrc': '', 'tlyric': '',
                       'coverUrl': str(entry.get('cover') or ''),
                       'matchMode': 'kuwoRid', 'matchedTitle': '', 'note': ''}
            _LYRIC_CACHE[key] = (time.time(), payload)
            return handler.json_response(payload)
    exact_id = _netease_song_id(entry) if platform == 'netease' else ''
    match_mode = 'songId' if exact_id else 'title'
    try:
        candidates = ([(exact_id, '')] if exact_id
                      else _netease_candidates(entry.get('title'), entry.get('artist')))
    except (requests.RequestException, ValueError) as error:
        return handler.json_response({'ok': False, 'reason': '歌词检索暂时不可用：' + str(error)[:100]}, 422)
    if not candidates:
        return handler.json_response(
            {'ok': False, 'reason': '未找到可用的歌词来源（该平台歌词源尚未接入）', 'platform': platform})

    # 精确 songId 只试一次（避免张冠李戴）；曲名兜底则逐个候选试到有歌词为止
    data = None
    song_id = ''
    matched_title = ''
    last_error = None
    for candidate_id, candidate_title in candidates:
        try:
            attempt = _netease_lyric(candidate_id)
        except (requests.RequestException, ValueError) as error:
            last_error = error
            continue
        if attempt['lrc'] or attempt['yrc']:
            song_id, matched_title, data = candidate_id, candidate_title, attempt
            break
        if data is None:
            song_id, matched_title, data = candidate_id, candidate_title, attempt
    if data is None:
        return handler.json_response(
            {'ok': False, 'reason': '歌词服务暂时不可用：' + str(last_error or '无可用候选')[:100]}, 422)

    if not data['lrc'] and not data['yrc']:
        return handler.json_response(
            {'ok': False, 'platform': platform, 'songId': song_id,
             'reason': '这首是纯音乐或平台未收录歌词', 'pureMusic': data['pureMusic']})

    # 封面：优先用 catalog 里搜索时抓到的，没有才去 song/detail 补一次。
    cover = str(entry.get('cover') or entry.get('coverUrl') or '')
    if not cover:
        cover = _netease_cover(song_id)

    payload = {
        'ok': True, 'platform': platform, 'songId': song_id,
        'title': entry.get('title') or '', 'artist': entry.get('artist') or '',
        # 曲名兜底匹配（matchMode='title'）说明歌词是别的版本的：它的逐字时间轴
        # 与本曲的咬字位置完全对不上，一句里会越唱越歪。这种情况只给整行 LRC，
        # 由前端整句同步高亮；本曲/本平台匹配（songId / kuwoRid）才保留逐字。
        'lrc': data['lrc'],
        'yrc': '' if match_mode == 'title' else data['yrc'],
        'tlyric': data['tlyric'],
        'coverUrl': cover,
        'matchMode': match_mode, 'matchedTitle': matched_title,
        'note': '歌词按曲名匹配，可能与该试听版本不完全对应' if match_mode == 'title' else '',
    }
    _LYRIC_CACHE[key] = (time.time(), payload)
    return handler.json_response(payload)


def preview(handler):
    """Proxy public audio with range support, never the transcription account."""
    sent=False;response=None
    try:
        ident=parse_qs(urlparse(handler.path).query).get('id',[''])[0]
        entry=read('catalog.json').get(ident)
        if not entry:raise ValueError('试听版本已过期，请重新搜索')
        from ai_web_import import public_url,BROWSER_HEADERS
        url=entry['audio'];headers={**BROWSER_HEADERS,'Referer':entry.get('source') or SEARCH_BASE}
        if handler.headers.get('Range'):headers['Range']=handler.headers['Range']
        for _ in range(6):
            public_url(url)
            response=requests.get(url,headers=headers,stream=True,allow_redirects=False,timeout=(5,15))
            if response.is_redirect:
                target=response.headers.get('Location');response.close()
                if not target:raise ValueError('音频跳转缺少地址')
                url=urljoin(url,target);continue
            break
        else:raise ValueError('音频跳转次数过多')
        response.raise_for_status()
        kind=response.headers.get('Content-Type','').lower()
        if not kind.startswith('audio/'):
            raise ValueError('该版本未提供可试听音频，可能需要平台授权，请换一个版本')
        size=int(response.headers.get('Content-Length') or 0)
        if size>50*1024*1024:raise ValueError('试听文件超过50 MB')
        handler.send_response(response.status_code);handler.send_header('Content-Type',kind)
        for name in ('Content-Length','Content-Range','Accept-Ranges'):
            if response.headers.get(name):handler.send_header(name,response.headers[name])
        handler.send_header('Connection','close');handler.end_headers();handler.close_connection=True;sent=True
        count=0
        for chunk in response.iter_content(32768):
            count+=len(chunk)
            if count>50*1024*1024:break
            handler.wfile.write(chunk)
    except (BrokenPipeError,ConnectionError,OSError,ValueError,requests.RequestException) as error:
        if not sent:return handler.json_response({'error':str(error)[:200]},422)
    finally:
        if response is not None:response.close()


def state(ident,**fields):
    with LOCK:
        jobs=read('jobs.json');job=jobs.get(ident)
        if job is None:raise ValueError('转谱任务不存在')
        job.update(fields,updated=time.time());jobs[ident]=job;write_json(PRIVATE/'jobs.json',jobs)
    from scorestarling import report
    report(ident,job['title'],job['status'],job.get('progress',0),job.get('detail',''),job.get('scoreId',''))
    return job


def get_job(ident):
    job=read('jobs.json').get(ident)
    if not job:raise ValueError('转谱任务不存在')
    return {k:v for k,v in job.items() if k not in ('item','remoteId')}


def remote_file(s,path,limit=30*1024*1024):
    url=urljoin(BASE,path)
    # Never forward this account's cookies to a download host chosen by data.
    if urlparse(url).netloc!=urlparse(BASE).netloc:raise ValueError('转谱下载地址不属于已连接的服务')
    with s.get(url,stream=True,allow_redirects=False,timeout=(5,40)) as r:
        r.raise_for_status()
        if r.is_redirect:raise ValueError('转谱文件下载发生站外跳转，尚未导入')
        result=bytearray()
        for chunk in r.iter_content(65536):
            result.extend(chunk)
            if len(result)>limit:raise ValueError('转谱结果文件超过允许大小')
        return bytes(result)


def run(ident,server):
    try:
        job=read('jobs.json')[ident];item=job['item']
        with session() as s:
            if not job.get('remoteId'):
                state(ident,status='running',progress=3,detail='正在下载选定版本的音频')
                from score_web_download import download
                from ai_web_import import public_url,BROWSER_HEADERS
                try:audio,kind,_=download(item['audio'],public_url,BROWSER_HEADERS)
                except Exception as error:
                    raise ValueError('已找到《'+item['title']+'》，但该版本的公开音频无法下载（可能需要平台登录、会员或来源已失效）。尚未提交云端转谱，请换一个版本，或上传已取得的音频。原因：'+str(error)[:120]) from error
                if not kind.startswith('audio/'):raise ValueError('来源未返回可用音频，尚未提交转谱')
                if len(audio)>30*1024*1024:raise ValueError('音频超过转谱站的 30 MB 限制')
                state(ident,progress=12,detail='音频已取得，正在上传到转谱服务')
                r=s.post(BASE+'/api/transcribe',data={'mode':job['mode'],'recording':job['recording']},files={'audio':(item['title']+'.mp3',audio,kind)},timeout=(8,120))
                if not r.ok:raise ValueError('转谱服务未接收文件：'+str(r.json().get('detail') or r.status_code)[:200])
                remote=r.json()['job'];job=state(ident,remoteId=remote['id'],progress=20,detail='上传完成，云端识谱已排队')
                del audio
            deadline=time.time()+1800
            while time.time()<deadline:
                r=s.get(BASE+'/api/jobs/'+job['remoteId'],timeout=(5,20));r.raise_for_status();remote=r.json()['job']
                status=remote.get('status')
                if status in ('failed','error'):
                    state(ident,remoteFailed=True)
                    raise ValueError(remote.get('error_message') or '云端识谱失败')
                if status in ('completed','complete'):break
                progress=max(20,min(94,20+74*float(remote.get('progress') or 0)))
                labels={'queued':'等待云端转谱','separating':'分离人声与伴奏','transcribing':'识别音符、节拍与和弦','notating':'生成乐谱','engraving':'排版电子谱与 PDF'}
                state(ident,status='running',progress=progress,detail=labels.get(remote.get('stage'),'云端正在处理乐谱'))
                time.sleep(3)
            else:raise ValueError('云端处理超过 30 分钟，任务编号已保留，可重试继续查询')
            state(ident,progress=96,detail='正在导入 MusicXML 与 PDF')
            files=remote.get('downloads') or {}
            if not files.get('musicxml'):raise ValueError('云端任务已结束，但没有提供 MusicXML 文件')
            raw=remote_file(s,files['musicxml']);xml=raw.decode('utf-8-sig');root=ET.fromstring(xml)
            if root.tag!='score-partwise' or not root.findall('part/measure'):raise ValueError('云端返回的文件不是有效的 MusicXML 乐谱')
            title=item['title'];work=root.find('work')
            if work is None:work=ET.SubElement(root,'work')
            heading=work.find('work-title')
            if heading is None:heading=ET.SubElement(work,'work-title')
            heading.text=title
            xml=ET.tostring(root,encoding='unicode',xml_declaration=True)
            digest=hashlib.sha256((item['id']+job['mode']+job['recording']).encode()).hexdigest()
            server.CACHE_DIR.mkdir(parents=True,exist_ok=True)
            warning=''
            if files.get('pdf'):
                try:
                    pdf=remote_file(s,files['pdf'])
                    if not pdf.startswith(b'%PDF-'):raise ValueError('PDF 文件无效')
                    (server.CACHE_DIR/(digest+'.pdf')).write_bytes(pdf)
                except Exception:warning='；PDF 尚未下载，电子谱已保留'
            server.write_cached_score(digest,xml,{'title':title,'userTitle':title,'artist':item.get('artist',''),'sourceType':'online-transcription','musicSource':item.get('source',''),'transcriptionSource':BASE,'remoteJobId':job['remoteId']})
            (server.CACHE_DIR/(digest+'.name')).write_text(title,encoding='utf-8')
            state(ident,status='complete',progress=100,detail='已加入云曲库'+warning,scoreId=digest)
    except Exception as error:
        state(ident,status='failed',detail=str(error)[:350])
    finally:
        with LOCK:ACTIVE.discard(ident)


def dispatch(ident,server):
    with LOCK:
        if ident in ACTIVE:return
        ACTIVE.add(ident)
    POOL.submit(run,ident,server)


def start(item_id,mode,recording,server):
    item=read('catalog.json').get(item_id)
    if not item:raise ValueError('搜索结果已过期，请重新搜索')
    if recording not in ('','piano','voice','guitar','ukulele','bass','melody','with_piano','other'):raise ValueError('音频类型无效')
    catalog=requests.get(BASE+'/api/modes',timeout=(5,15)).json()
    if mode not in {s['id'] for g in catalog['instruments'] for s in g['styles']}:raise ValueError('请选择服务支持的乐谱类型')
    with LOCK:
        jobs=read('jobs.json')
        old=next((j for j in jobs.values() if j['item']['id']==item_id and j['mode']==mode and j['recording']==recording),None)
        if old:
            ident=old['id']
            if old['status']=='failed':
                fields={'status':'queued','detail':'正在继续之前的任务'}
                if old.get('remoteFailed'):fields.update(remoteId=None,remoteFailed=False,progress=0)
                state(ident,**fields)
            elif old['status']=='complete':return get_job(ident)
        else:
            ident='ai-online-'+uuid.uuid4().hex
            jobs[ident]={'id':ident,'title':item['title'],'item':item,'mode':mode,'recording':recording,'status':'queued','progress':0,'detail':'等待下载音频','created':time.time()};write_json(PRIVATE/'jobs.json',jobs)
    state(ident)
    dispatch(ident,server);return get_job(ident)


def handle(handler,server):
    try:
        length=int(handler.headers.get('Content-Length','0'))
        if not 0<length<12000:raise ValueError('请求长度无效')
        payload=json.loads(handler.rfile.read(length));action=payload.get('action')
        if action=='search':
            if payload.get('stream'):return stream_search(handler,payload.get('query',''),payload.get('platform','netease'),payload.get('pages'))
            return handler.json_response(search(payload.get('query',''),payload.get('platform','netease')))
        if action=='start':return handler.json_response(start(payload.get('itemId'),payload.get('mode','piano.full'),payload.get('recording',''),server),202)
        if action=='status':return handler.json_response(get_job(payload.get('id')))
        if action=='modes':
            r=requests.get(BASE+'/api/modes',timeout=(5,15));r.raise_for_status();return handler.json_response(r.json())
        raise ValueError('未知的联网转谱操作')
    except Exception as error:return handler.json_response({'error':str(error)[:350]},422)


def resume(server):
    for job in read('jobs.json').values():
        if job['status'] in ('running','queued'):
            if job.get('remoteId'):dispatch(job['id'],server)
            else:state(job['id'],status='failed',detail='服务在提交期间重启，尚未确认云端是否收到文件；请先检查转谱站的我的乐谱，避免重复提交')
