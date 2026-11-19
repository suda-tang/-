"""Search public score pages and enqueue validated direct PDF/audio imports."""
import hashlib,io,ipaddress,json,socket,time
from urllib.parse import urlparse, urlencode, urljoin
from bs4 import BeautifulSoup
import re
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parent

# 不带 UA 的请求会被多数站点直接当机器人打回（部分曲谱站会跳验证码）。
BROWSER_HEADERS={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                                '(KHTML, like Gecko) Chrome/122.0 Safari/537.36',
                 'Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8'}
# 前端 web_search 的 fetch 超时是 30 秒，几条腿加起来不能超过它，否则用户看到的是超时而不是结果。
SEARCH_BUDGET=24

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
SOURCE_NAMES=(('gangqinpu.com','虫虫钢琴'),('tan8.com','弹琴吧'),('everyonepiano.cn','SUPERTANG AI 智能找谱'),
              ('everyonepiano.com','SUPERTANG AI 智能找谱'),('book118.com','原创力文档'),('doc88.com','道客巴巴'),
              ('docin.com','豆丁网'),('wenku.so.com','360文库'),('qupu123.com','中国曲谱网'),
              ('imslp.org','IMSLP'),('musescore.com','MuseScore'),('mutopiaproject.org','Mutopia'))
def source_name(host):
 host=(host or '').lower()
 for domain,name in SOURCE_NAMES:
  if host==domain or host.endswith('.'+domain):return name
 return host or '网页'

# 搜索词后缀：钢琴类查询保持「钢琴谱」；提到其它乐器（大提琴 / 小提琴 …）改用「乐谱」，
# 否则「贝多芬 大提琴 钢琴谱」必然搜不到大提琴谱。录音类仍是「钢琴独奏 视频」。
_INSTRUMENTS=('大提琴','小提琴','中提琴','低音提琴','长笛','双簧管','单簧管','黑管','圆号','小号',
 '长号','大号','竖琴','吉他','琵琶','古筝','二胡','竹笛','唢呐','萨克斯','管风琴','手风琴','打击乐',
 '管乐','弦乐','铜管','木管','声乐','女高音','男高音')
def web_suffix(query,recording):
 if recording:return ' 钢琴独奏 视频'
 if any(inst in query for inst in _INSTRUMENTS):return ' 乐谱'
 return ' 钢琴谱'

# 从自然语言里抽出「检索核心词」（空格分隔的作曲家/乐器/曲名），用于喂给搜索引擎并做
# 相关性判断。以前把整句「找到有大提琴的贝多芬的曲子」原样丢给 360/搜狗，搜出来一堆
# 无关页面、title_matches 又全判不相关 → 结果为空。核心词「贝多芬 大提琴」才搜得准。
_COMPOSERS=('贝多芬','巴赫','莫扎特','海顿','舒伯特','肖邦','勃拉姆斯','柴可夫斯基','维瓦尔第',
 '亨德尔','德彪西','李斯特','舒曼','门德尔松','拉威尔','圣-桑','圣桑','马勒','柏辽兹','德沃夏克',
 '普罗科菲耶夫','肖斯塔科维奇','格里格','埃尔加','比才','德普西','古诺','威尔第','普契尼','唐尼采蒂',
 '舒伯特','克莱门蒂','巴赫','科雷利','帕赫贝尔','卡农','致爱丽丝','月光','命运','第四交响曲','第五交响曲',
 '第九交响曲','奏鸣曲','交响曲','协奏曲','练习曲','前奏曲','即兴曲','狂想曲')
def search_core(query):
 q=str(query or '')
 terms=[]
 m=re.search(r'[《「"]([^》」"]+)[》」"]',q)
 if m:terms.append(m.group(1).strip())
 for t in _COMPOSERS:
  if t in q:terms.append(t)
 for t in _INSTRUMENTS:
  if t in q:terms.append(t)
 for t in re.findall(r'[A-Za-z][A-Za-z0-9\-]{2,}',q):terms.append(t.strip())
 seen=set();uniq=[]
 for t in terms:
  if t and t not in seen:seen.add(t);uniq.append(t)
 if uniq:return ' '.join(uniq)
 # 兜底：白名单（作曲家/乐器）都没命中时，把「请求外壳」词整段剥掉，保留中间的曲名/作曲家。
 # 否则「我想找一份不在曲库里的久石让钢琴谱」会被原样丢给搜索引擎。
 _WRAP=('请','帮我','我要','我想','找到','搜索','查找','播放','听一下','听','一下','来一首',
        '一份','要一份','找一份','找','这份','到网上','去网上','网上','全网','外网','不在曲库里',
        '曲库里','的曲子','的乐谱','的','钢琴谱','曲子','乐谱','谱子','谱')
 for w in _WRAP:q=q.replace(w,'')
 return q.strip() or str(query or '').strip()

# 旧的 western_query（中译英词典）已移除：IMSLP / MuseScore 站内抓取因反爬被去掉后，
# 它已无任何调用点；现在检索词由模型直接给出（已是干净中文），search_core 仅做轻量清洗。

def site_search(search_url,selector,source,query,deadline,skip=None,require_match=True):
 """在单个乐谱站站内搜索，返回结果列表（空也行）。单站失败只记一笔，不拖累其它站。
 require_match=False 时信任站点自身搜索、不再做中文标题匹配（用于英文站，标题是英文）。"""
 try:
  r=requests.get(search_url,timeout=remaining(deadline),headers=BROWSER_HEADERS);r.raise_for_status()
  r.encoding=r.apparent_encoding or 'utf8'
  soup=BeautifulSoup(r.text,'html.parser');out=[];seen=set()
  for a in soup.select(selector):
   title=a.get_text(' ',strip=True);href=urljoin(search_url,a.get('href',''))
   if not href.startswith('http') or len(title)<4 or href in seen:continue
   if skip and skip(href):continue
   if require_match and not title_matches(query,title):continue
   seen.add(href);out.append({'title':title[:120],'url':href,'directPdf':False,'source':source})
   if len(out)>=8:break
  return out
 except requests.RequestException:return []

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
  if payload.get('mode')=='verification':
   from manual_verification import complete
   return handler.json_response(complete(str(payload.get('id','')),str(payload.get('code','')).strip()))
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
   recording=payload.get('kind')=='recording'
   items=[];blocked=[]
   core=search_core(query) or query
   search_url='https://www.everyonepiano.cn/Music-search?'+urlencode({'word':core})
   # ① 该曲谱站站内搜索最权威（结果就是可直接打开的曲谱页），但它对自动化请求
   #    直接 302 到验证码页，所以这条腿经常拿不到东西，只作为第一优先尝试。
   #    ★ IMSLP / MuseScore 曾试过并行站内抓取：IMSLP 会 302 到 friendlytest.html 反爬
   #      页、MuseScore 直接 403 —— 两者都拿不到结果、还白白吃掉 8 秒时间预算，已移除。
   #      「多个乐谱库」改由 ② 的通用搜索承担：实测「贝多芬 大提琴」在 360/搜狗 能搜到
   #      道客巴巴 / 豆丁网 / 虫虫钢琴等多个真实来源的分谱（见 SOURCE_NAMES 归类）。
   try:
    if recording:raise requests.RequestException('recording search')
    r=requests.get(search_url,timeout=remaining(deadline),headers=BROWSER_HEADERS);r.raise_for_status();r.encoding='utf8'
    if 'captcha' in (r.url or '').lower():blocked.append('该曲谱站要求人机验证')
    else:
     soup=BeautifulSoup(r.text,'html.parser');seen=set()
     for link in soup.select('a[href]'):
      title=link.get_text(' ',strip=True);url=urljoin(search_url,link['href'])
      if re.search(r'/Music-\d+',urlparse(url).path) and title_matches(core,title) and url not in seen:
       seen.add(url);items.append({'title':title,'url':url,'directPdf':False,'source':'SUPERTANG AI 智能找谱'})
      if len(items)>=8:break
   except requests.RequestException:blocked.append('该曲谱站连不上')
   # ② 兜底换成中文搜索（360 / 搜狗）。
   #    ★ 以前这里用的是 Bing 的 site: 语法，但 cn.bing.com **会忽略 site:，
   #    并把「卡农 钢琴谱 pdf」当成单字查询**，返回一堆汉语字典页，再被 host 过滤掉 ——
   #    等于白等 15 秒还必然为空（这就是 directPdf 恒为 false 的真因）。
   #    实测 360 / 搜狗 都能返回真实相关结果，且它们的跳转链在浏览器里点得开。
   from concurrent.futures import ThreadPoolExecutor
   jobs=[('360 搜索','https://www.so.com/s',{'q':core+(' 钢琴独奏 视频' if recording else web_suffix(core,recording)+' PDF')},'.res-list h3 a[href],.res-list h2 a[href]'),
         ('搜狗','https://www.sogou.com/web',{'query':core+(' 钢琴独奏 视频' if recording else web_suffix(core,recording)+' PDF')},'.vrwrap h3 a[href],.rb h3 a[href]'),
         ('Bing','https://cn.bing.com/search',{'q':core+(' piano performance video' if recording else web_suffix(core,recording)+' PDF')},'li.b_algo h2 a[href]')]
   if not recording:jobs.append(('Mutopia','https://www.mutopiaproject.org/cgibin/make-table.cgi',{'searchingfor':core},'table.result-table'))
   def search_engine(job):
    engine,url,params,selector=job
    try:
     r=requests.get(url,params=params,timeout=remaining(deadline),headers=BROWSER_HEADERS);r.raise_for_status()
     r.encoding=r.apparent_encoding or 'utf8';soup=BeautifulSoup(r.text,'html.parser');found=[]
     if engine=='Mutopia':
      for table in soup.select('table.result-table')[:4]:
       first=table.select_one('tr');title=first.get_text(' ',strip=True) if first else ''
       if not title:continue
       link=table.select_one('a[href$="-a4.pdf"]')
       if link:found.append({'title':title[:120],'url':urljoin(url,link['href']),'directPdf':True,'source':'Mutopia'})
      return found,None
     for link in soup.select(selector):
      title=link.get_text(' ',strip=True);href=urljoin(url,link.get('href',''))
      if len(title)<4 or not title_matches(core,title) or (not recording and not looks_like_score(title)) or is_noise(title):continue
      if not href.startswith('http'):continue
      from classroom_references import direct_link
      href=direct_link(href)
      found.append({'title':title[:120],'url':href,'directPdf':urlparse(href).path.lower().endswith('.pdf'),'source':engine})
      if len(found)>=5:break
     return found,None
    except requests.RequestException:return [],engine+' 连不上'
   if time.monotonic()<deadline-2:
    with ThreadPoolExecutor(max_workers=3) as pool:
     for found,error in pool.map(search_engine,jobs):
      items.extend(found)
      if error:blocked.append(error)
   # ③ 把跳转链解析成真实地址：来源才看得懂（虫虫钢琴 / 弹琴吧 / 原创力文档…），
   #    链接也更稳定（/link?m=… 可能是会话相关的）。并行解析，别串行拖慢。
   #    解析不出来就保留跳转链 —— 浏览器里照样点得开。
   if items and time.monotonic()<deadline-3:
    from concurrent.futures import ThreadPoolExecutor
    targets=items[:12]
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
   if recording:
    supported=('youtube.com','youtu.be','bilibili.com','b23.tv','soundcloud.com')
    items=[x for x in items if any((urlparse(x['url']).hostname or '').lower()==h or (urlparse(x['url']).hostname or '').lower().endswith('.'+h) for h in supported)]
    return handler.json_response({'results':items[:8],'notice':'' if items else '没有找到可验证的演奏链接。可以粘贴歌曲或视频地址进行转谱。'})
   # ④ 一条都没找到时，至少留一个站内搜索入口，别让用户对着空气。
   if not items:items=[{'title':'在 SUPERTANG AI 智能找谱 搜索《'+query+'》','url':search_url,'directPdf':False,'source':'SUPERTANG AI 智能找谱'}]
   # ⑤ 说清楚现状（报告 #7）：这些站点基本都要登录或 VIP，别让用户以为点一下就能自动下载。
   notice=('本次自动检索受限（'+'；'.join(blocked)+'）。') if blocked else ''
   from score_web_download import everyone_page
   for item in items:item['autoImport']=True
   notice+='可点击下载并识谱，程序会自动读取可下载的 PDF；如来源要求登录或 VIP，会显示具体原因。'
   return handler.json_response({'results':items[:8],'notice':notice})
  # 非法 mode 以前会掉到最后那句 URL 校验上，于是「mode 写错」的报错是
  # 「仅接受公网网页地址」—— 文案和原因完全对不上（报告 C2）。
  if payload.get('mode') not in (None,'','import'):raise ValueError('未知的请求类型：'+str(payload.get('mode'))[:40])
  url=str(payload.get('url',''))
  if not url:raise ValueError('请提供要下载的文件地址')
  from score_web_download import download
  data,content_type,final_url=download(url,public_url,BROWSER_HEADERS)
  name=str(payload.get('title') or '网络曲谱')[:120]
  if bytes(data).startswith(b'%PDF-'):
   if server is None:raise ValueError("识谱服务没有连接，文件尚未提交")
   digest=hashlib.sha256(data).hexdigest();server.CACHE_DIR.mkdir(parents=True,exist_ok=True)
   (server.CACHE_DIR/(digest+'.pdf')).write_bytes(data)
   (server.CACHE_DIR/(digest+'.name')).write_text(name,encoding='utf8')
   result=server.enqueue_recognition(bytes(data),digest)
   return handler.json_response({'id':digest,'task':result,'status':'queued'},202)
  if content_type.startswith(('audio/','video/')):
   from media_import import receive
   return handler.json_response(receive(io.BytesIO(data),len(data),name,media_type=content_type),202)
  raise ValueError('此链接是网页，不是可下载的 PDF 或音视频文件，请打开网页取得文件地址')
 except Exception as e:return handler.json_response({'error':str(e)[:300]},422)
