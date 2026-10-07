"""Search public score pages and enqueue validated direct PDF/audio imports."""
import hashlib,io,ipaddress,json,socket,time
from urllib.parse import urlparse, urlencode, urljoin
from bs4 import BeautifulSoup
import re
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parent

# 不带 UA 的请求会被多数站点直接当机器人打回（Everyone Piano 就是跳验证码）。
BROWSER_HEADERS={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                                '(KHTML, like Gecko) Chrome/122.0 Safari/537.36',
                 'Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8'}
# 前端 web_search 的 fetch 超时是 30 秒，几条腿加起来不能超过它，否则用户看到的是超时而不是结果。
SEARCH_BUDGET=20

def public_url(url):
 p=urlparse(url)
 if p.scheme not in ('http','https') or not p.hostname or p.username or p.port not in (None,80,443):raise ValueError('仅接受公网网页地址')
 for record in socket.getaddrinfo(p.hostname,p.port or 443):
  if not ipaddress.ip_address(record[4][0]).is_global:raise ValueError('不能下载内网地址')

def query_tokens(query):
 return [t for t in re.split(r'[\s,，、/]+',query) if len(t)>=2]

def title_matches(query,title):
 """标题和曲名对得上才算数。整串命中最好；否则任意一个词命中即可
 （「贝多芬 月光奏鸣曲」的结果标题常常只写「月光奏鸣曲 钢琴谱」）。"""
 hay=title.replace(' ','').casefold();need=query.replace(' ','').casefold()
 if need and need in hay:return True
 return any(t.replace(' ','').casefold() in hay for t in query_tokens(query))

# 一眼看出「这是曲谱页」的线索。没有它，「bogus song xyz」这种查询会把
# Bogus Records 之类的无关站点当成结果推给用户。
SCORE_HINT=re.compile(r'谱|钢琴|乐谱|曲谱|五线|简谱|琴谱|piano|sheet|score|pdf',re.I)
# 图片/智图之类的结果不是曲谱页，点进去只有一张图，纯浪费点击。
NOISE_TITLE=re.compile(r'图片|智图|壁纸|头像|表情包')
def looks_like_score(title):
 return bool(SCORE_HINT.search(title or ''))
def is_noise(title=''):
 return bool(NOISE_TITLE.search(title or ''))
def host_is_noise(url):
 """解析之后的地址如果落在搜索站自己的图片/错误页上，同样要丢掉。"""
 p=urlparse(url);host=(p.hostname or '').lower()
 return host.startswith('image.') or '/error/' in p.path

def remaining(deadline):
 left=deadline-time.monotonic()
 return max(2,min(8,left))

# 常见乐谱站的显示名。搜索结果里给「360 搜索」这种来源没意义，
# 用户想知道的是「这是虫虫钢琴还是弹琴吧」。
SOURCE_NAMES=(('gangqinpu.com','虫虫钢琴'),('tan8.com','弹琴吧'),('everyonepiano.cn','Everyone Piano'),
              ('everyonepiano.com','Everyone Piano'),('book118.com','原创力文档'),('doc88.com','道客巴巴'),
              ('docin.com','豆丁网'),('wenku.so.com','360文库'),('qupu123.com','中国曲谱网'))
def source_name(host):
 host=(host or '').lower()
 for domain,name in SOURCE_NAMES:
  if host==domain or host.endswith('.'+domain):return name
 return host or '网页'

def resolve_target(url):
 """把搜索结果的跳转链解析成真实地址。
 360 的 /link?m=… 返回的是 200 + meta refresh（不是 302），所以两条路都要试。
 ★ 只认真正的跳转页（带 meta refresh），别在正常页面里瞎匹配 URL= ——
 否则会把正文里任意一个链接当成目标，越跳越偏。
 解析失败就原样返回：那个跳转链在浏览器里照样点得开，别把它弄丢。"""
 try:
  for _ in range(3):
   r=requests.get(url,timeout=6,headers=BROWSER_HEADERS,allow_redirects=False)
   loc=r.headers.get('Location')
   if loc and 300<=r.status_code<400:
    url=urljoin(url,loc);continue
   if r.status_code==200 and re.search(r'http-equiv=["\']?refresh',r.text[:4000],re.I):
    # ★ 目标地址可能被单引号或双引号包着（360 就是 content="0;URL='https://…'"），
    # 正则必须把引号剥掉，否则匹配不到、解析必然失败。
    m=re.search(r'URL=\s*["\']?([^"\'\s>]+)',r.text[:4000],re.I)
    if m:
     url=urljoin(url,m.group(1).strip().rstrip(';'));continue
   break
 except requests.RequestException:
  pass
 return url

def handle(handler,server=None):
 try:
  n=int(handler.headers.get('Content-Length','0'))
  if not 0<n<12000:raise ValueError('请求长度无效')
  payload=json.loads(handler.rfile.read(n))
  if payload.get('mode')=='skills':
   query=str(payload.get('query','')).strip()[:120]
   # 空 query 以前会拿去搜 GitHub 的 " skill"，返回一堆和音乐毫无关系的热门项目（报告 C3）。
   if not query:raise ValueError('请先说明想要什么能力，例如「五线谱识别」「音频转 MIDI」，我再去搜开源方案。')
   terms=[t for t in re.split(r'[\s,，、/]+',query) if t]
   r=requests.get('https://api.github.com/search/repositories',params={'q':query+' skill','sort':'stars','order':'desc','per_page':20},headers={'Accept':'application/vnd.github+json'},timeout=20);r.raise_for_status()
   items=[]
   for x in r.json().get('items',[]):
    haystack=((x.get('full_name') or '')+' '+(x.get('description') or '')+' '+' '.join(x.get('topics') or [])).casefold()
    # 至少命中一个关键词才算相关。以前是「搜到什么就推什么」，用户拿到的全是无关项目。
    if not any(t.casefold() in haystack for t in terms):continue
    items.append({'title':x['full_name'],'url':x['html_url'],'description':x.get('description') or '','license':(x.get('license') or {}).get('spdx_id','未声明'),'updated':x['updated_at'],'stars':x.get('stargazers_count',0)})
    if len(items)>=5:break
   notice='仅发现候选，尚未安装或验证兼容性。'
   if not items:notice='没有找到和「'+query+'」直接相关的开源项目。可以换个更技术的英文说法，例如把「自动配伴奏」说成「automatic accompaniment generation」。'
   return handler.json_response({'results':items,'notice':notice})
  if payload.get('mode')=='search':
   query=str(payload.get('query','')).strip()[:150]
   if not query:raise ValueError('请提供曲名')
   deadline=time.monotonic()+SEARCH_BUDGET
   search_url='https://www.everyonepiano.cn/Music-search?'+urlencode({'word':query})
   items=[];blocked=[]
   # ① Everyone Piano 站内搜索最权威（结果就是可直接打开的曲谱页），但它对自动化请求
   #    直接 302 到验证码页，所以这条腿经常拿不到东西，只作为第一优先尝试。
   try:
    r=requests.get(search_url,timeout=remaining(deadline),headers=BROWSER_HEADERS);r.raise_for_status();r.encoding='utf8'
    if 'captcha' in (r.url or '').lower():blocked.append('Everyone Piano 要求人机验证')
    else:
     soup=BeautifulSoup(r.text,'html.parser');seen=set()
     for link in soup.select('a[href]'):
      title=link.get_text(' ',strip=True);url=urljoin(search_url,link['href'])
      if re.search(r'/Music-\d+',urlparse(url).path) and title_matches(query,title) and url not in seen:
       seen.add(url);items.append({'title':title,'url':url,'directPdf':False,'source':'Everyone Piano'})
      if len(items)>=8:break
   except requests.RequestException:blocked.append('Everyone Piano 连不上')
   # ② 兜底换成中文搜索（360 / 搜狗）。
   #    ★ 以前这里用的是 Bing 的 site: 语法，但 cn.bing.com **会忽略 site:，
   #    并把「卡农 钢琴谱 pdf」当成单字查询**，返回一堆汉语字典页，再被 host 过滤掉 ——
   #    等于白等 15 秒还必然为空（这就是 directPdf 恒为 false 的真因）。
   #    实测 360 / 搜狗 都能返回真实相关结果，且它们的跳转链在浏览器里点得开。
   for engine,url,params,selector in (
    ('360 搜索','https://www.so.com/s',{'q':query+' 钢琴谱'},'.res-list a[href]'),
    ('搜狗','https://www.sogou.com/web',{'query':query+' 钢琴谱'},'.vrwrap a[href], .rb a[href]'),
   ):
    if items or time.monotonic()>=deadline:break
    try:
     r=requests.get(url,params=params,timeout=remaining(deadline),headers=BROWSER_HEADERS);r.raise_for_status()
     r.encoding=r.apparent_encoding or 'utf8'
     soup=BeautifulSoup(r.text,'html.parser');seen={x['url'] for x in items}
     for a in soup.select(selector):
      title=a.get_text(' ',strip=True)
      if len(title)<6 or not title_matches(query,title):continue
      # ★ 噪声和「像不像曲谱页」必须在**收集阶段**就判掉：
      #   之前放在收集之后，于是「致爱丽丝」这种 360 只给图片结果的查询，
      #   收集时算有结果 → 不再试搜狗 → 过滤后变空 → 只剩兜底链接。
      if not looks_like_score(title) or is_noise(title):continue
      href=urljoin(url,a.get('href',''))
      if not href.startswith('http') or href in seen:continue
      seen.add(href);items.append({'title':title[:120],'url':href,'directPdf':False,'source':engine})
      if len(items)>=8:break
    except requests.RequestException:blocked.append(engine+' 连不上')
   # ③ 把跳转链解析成真实地址：来源才看得懂（虫虫钢琴 / 弹琴吧 / 原创力文档…），
   #    链接也更稳定（/link?m=… 可能是会话相关的）。并行解析，别串行拖慢。
   #    解析不出来就保留跳转链 —— 浏览器里照样点得开。
   if items and time.monotonic()<deadline-3:
    from concurrent.futures import ThreadPoolExecutor
    targets=items[:8]
    with ThreadPoolExecutor(max_workers=6) as pool:
     for item,final in zip(targets,pool.map(lambda x:resolve_target(x['url']),targets)):
      host=urlparse(final).hostname or ''
      # 解析失败时会停在搜索引擎自己的域名上，这时保留「360 搜索」比显示 so.com 更有用。
      item['source']=item['source'] if host.endswith(('so.com','sogou.com','bing.com')) else source_name(host)
      item['url']=final
      item['directPdf']=urlparse(final).path.lower().endswith('.pdf')
   # 按真实地址去重（360 上同一首曲子常挂两三条），并丢掉解析后才发现是
   # 搜索站图片/错误页的条目。
   deduped=[];seen=set()
   for item in items:
    if host_is_noise(item['url']) or is_noise(item['title']):continue
    if item['url'] in seen:continue
    seen.add(item['url']);deduped.append(item)
   items=deduped
   # ④ 一条都没找到时，至少留一个站内搜索入口，别让用户对着空气。
   if not items:items=[{'title':'在 Everyone Piano 搜索《'+query+'》','url':search_url,'directPdf':False,'source':'Everyone Piano'}]
   # ⑤ 说清楚现状（报告 #7）：这些站点基本都要登录或 VIP，别让用户以为点一下就能自动下载。
   notice=('本次自动检索受限（'+'；'.join(blocked)+'）。') if blocked else ''
   notice+='这些页面多数需要登录或 VIP 才能下载：打开页面把 PDF 下载下来，拖进曲库就能自动识谱；也可以把文件地址发给我，我帮你导入。'
   return handler.json_response({'results':items[:8],'notice':notice})
  # 非法 mode 以前会掉到最后那句 URL 校验上，于是「mode 写错」的报错是
  # 「仅接受公网网页地址」—— 文案和原因完全对不上（报告 C2）。
  if payload.get('mode') not in (None,'','import'):raise ValueError('未知的请求类型：'+str(payload.get('mode'))[:40])
  url=str(payload.get('url',''))
  if not url:raise ValueError('请提供要下载的文件地址')
  public_url(url)
  r=requests.get(url,timeout=(8,40),stream=True,allow_redirects=False)
  if 300<=r.status_code<400:raise ValueError('下载地址发生跳转，请使用最终文件地址')
  r.raise_for_status();data=bytearray()
  for chunk in r.iter_content(65536):
   data.extend(chunk)
   if len(data)>50*1024*1024:raise ValueError('网络文件超过 50 MB，请手动上传')
  name=str(payload.get('title') or '网络曲谱')[:120]
  if bytes(data).startswith(b'%PDF-'):
   if server is None:raise ValueError("识谱服务没有连接，文件尚未提交")
   digest=hashlib.sha256(data).hexdigest();server.CACHE_DIR.mkdir(parents=True,exist_ok=True)
   (server.CACHE_DIR/(digest+'.pdf')).write_bytes(data)
   (server.CACHE_DIR/(digest+'.name')).write_text(name,encoding='utf8')
   result=server.enqueue_recognition(bytes(data),digest)
   return handler.json_response({'id':digest,'task':result,'status':'queued'},202)
  content_type=r.headers.get('Content-Type','')
  if content_type.startswith(('audio/','video/')):
   from media_import import receive
   return handler.json_response(receive(io.BytesIO(data),len(data),name,media_type=content_type),202)
  raise ValueError('此链接是网页，不是可下载的 PDF 或音视频文件，请打开网页取得文件地址')
 except Exception as e:return handler.json_response({'error':str(e)[:300]},422)
