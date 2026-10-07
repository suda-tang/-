"""Find official university emblems off-thread, validate and persist local images."""
import hashlib,io,json,re,threading,time,unicodedata
from institution_discovery import discover,matches,HEADERS,directory_logo
from pathlib import Path
from urllib.parse import urlparse,urljoin,parse_qs
import requests
import numpy as np
from PIL import Image,ImageOps
ROOT=Path(__file__).resolve().parent
CACHE=ROOT/'dist/institution-logos'
ACTIVE=set();LOCK=threading.Lock()
SESSION=requests.Session();SESSION.headers.update(HEADERS)
def registry_revision():
 p=ROOT/"dist/institution-websites.json"
 return hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.exists() else ""

def official(url):
 p=urlparse(url);return p.scheme in ('http','https') and bool(p.hostname) and p.hostname.endswith('.edu.cn') and not p.username

def fetch(url,trusted_hosts=()):
 def allowed(value):
  parsed=urlparse(value)
  return official(value) or parsed.scheme=='https' and parsed.hostname in trusted_hosts and not parsed.username
 if not allowed(url):raise ValueError('仅使用院校官网资源')
 response=SESSION.get(url,timeout=(4,7),allow_redirects=False,stream=True)
 for _ in range(3):
  if response.status_code not in (301,302,303,307,308):break
  url=urljoin(url,response.headers.get('Location',''));response.close()
  if not allowed(url):raise ValueError('官网资源跳转至其他站点')
  response=SESSION.get(url,timeout=(4,7),allow_redirects=False,stream=True)
 response.raise_for_status();data=bytearray()
 for block in response.iter_content(32768):
  data.extend(block)
  if len(data)>4*1024*1024:raise ValueError('图片或页面过大')
 response.close();return bytes(data)

def emblem_region(image):
    """Keep square emblems; extract a separated top/left emblem from a wordmark."""
    rgba=image.convert('RGBA');white=Image.new('RGBA',rgba.size,'white');white.alpha_composite(rgba)
    pixels=np.array(rgba);mask=(pixels[:,:,3]>32) if np.any(pixels[:,:,3]<250) else np.min(np.array(white.convert('RGB')),axis=2)<220
    w,h=image.size
    if .78<=w/h<=1.28:return rgba
    # Official identity sheets commonly put the seal above the handwritten name.
    rows=np.flatnonzero(np.sum(mask,axis=1)>max(2,w*.015))
    if not len(rows):return None
    splits=np.flatnonzero(np.diff(rows)>7)
    if len(splits) and w<h*1.3:
        band=rows[:splits[0]+1];top,bottom=int(band[0]),int(band[-1])+1
        xs=np.flatnonzero(np.any(mask[top:bottom],axis=0))
        if len(xs):
            left,right=int(xs[0]),int(xs[-1])+1
            if min(right-left,bottom-top)>=60 and .78<=(right-left)/(bottom-top)<=1.28:return rgba.crop((left,top,right,bottom))
    # Split only across a sustained blank separator, never between letters.
    if w>h*2 and h>=32:
        columns=np.sum(mask,axis=0);occupied=np.flatnonzero(columns>2)
        if len(occupied):
            start=int(occupied[0]);gaps=np.flatnonzero(np.diff(occupied)>8)
            if len(gaps):
                end=int(occupied[gaps[0]])+1
                ys=np.flatnonzero(np.any(mask[:,start:end],axis=1))
                if len(ys):
                    top,bottom=int(ys[0]),int(ys[-1])+1
                    if bottom-top>=h*.55 and min(end-start,bottom-top)>=32 and .55<=(end-start)/(bottom-top)<=1.45:
                        return rgba.crop((start,top,end,bottom))
        # An official wordmark is preferable to an invented crop of its first letter.
        return rgba
    return None

def roots(institution):
 visits=ROOT/'dist/mentor-visits.json'
 records=json.loads(visits.read_text(encoding='utf-8')) if visits.exists() else {}
 registry=ROOT/'dist/institution-websites.json'
 urls=list(json.loads(registry.read_text(encoding='utf-8')).get(institution,[])) if registry.exists() else []
 for record in records.values():
  if record.get('institution')==institution and official(record.get('source','')):
   source=record['source'];host=urlparse(source).hostname;main='.'.join(host.split('.')[-3:]);urls.extend(['https://www.'+main+'/',source])
 return list(dict.fromkeys(urls))[:6]

def lookup(institution,receipt):
 previous=None
 try:
  if receipt.exists():
   saved=json.loads(receipt.read_text(encoding='utf-8'))
   if saved.get('institution')==institution and saved.get('status')=='complete' and not re.search(r'loader|loading|spinner|timing',saved.get('source',''),re.I) and (ROOT/'dist'/saved.get('url','').split('?')[0].lstrip('/')).is_file():previous=saved
 except (ValueError,OSError):pass
 try:
  if institution=='苏州大学':
   result={'status':'complete','url':'/suda-seal.svg?v=round19','source':'https://www.suda.edu.cn/','institution':institution}
  else:
   pages=roots(institution)
   discovered=discover(institution) if not pages else []
   pages=list(dict.fromkeys(pages+discovered))
   best=None;seen=set();deadline=time.monotonic()+80;discovery_done=False;errors=[];verified_pages=[]
   for page in pages:
    if time.monotonic()>deadline:break
    try:html=fetch(page).decode('utf-8',errors='replace')
    except Exception as error:
     errors.append(page+': '+str(error))
     if not discovery_done:
      discovery_done=True;pages.extend(url for url in discover(institution,use_directory=False) if url not in pages)
     continue
    if not matches(institution,html):
     errors.append(page+': 页面名称不符')
     continue
    verified_pages.append(page)
    images=[];trusted_hosts=set()
    for image_index,tag in enumerate(re.findall(r'<img\b[^>]*>',html,re.I)):
     match=re.search(r'(?:src|data-src)\s*=\s*[\"\']([^\"\']+)',tag,re.I)
     if match and not re.search(r'loader|loading|spinner|timing|auth-failed|captcha',match.group(1),re.I) and (image_index<4 or re.search(r'logo|seal|emblem|校徽|校标',tag,re.I) or ('校徽' in html and 'img_vsb_content' in tag)):
      image_url=urljoin(page,match.group(1))
      # CDN candidates must be linked directly by the verified university page.
      host=urlparse(image_url).hostname
      if urlparse(image_url).scheme=='https' and host:trusted_hosts.add(host)
      images.append((image_url,tag))
    # Many university themes keep the round emblem in a CSS background.
    for match in re.finditer(r'url\([\"\']?([^\)\"\']+)',html,re.I):
     if re.search(r'logo|seal|emblem|xiaohui',match.group(1),re.I):images.append((urljoin(page,match.group(1)),match.group(1)))
    from bs4 import BeautifulSoup
    soup=BeautifulSoup(html,'html.parser')
    for link in soup.select('a[href]'):
     if re.search(r'校徽|视觉识别|学校标识',link.get_text()):
      target=urljoin(page,link['href'])
      if official(target) and target not in pages and len(pages)<9:pages.append(target)
    for link in soup.select('link[rel="stylesheet"]')[:4]:
     css_url=urljoin(page,link.get('href',''))
     if not official(css_url):continue
     try:
      css=fetch(css_url).decode('utf-8',errors='replace')
      for value in re.findall(r'url\([\"\']?([^\)\"\']+)',css,re.I):
       if re.search(r'logo|seal|emblem|xiaohui',value,re.I):images.append((urljoin(css_url,value),value))
     except Exception:pass
    for url,tag in images[:16]:
     if url in seen or not (official(url) or urlparse(url).hostname in trusted_hosts) or time.monotonic()>deadline:continue
     seen.add(url)
     try:
      image=Image.open(io.BytesIO(fetch(url,trusted_hosts)));image.load()
      identified=bool(re.search(r'logo|seal|emblem|校徽|校标|xiaohui',tag,re.I))
      if not identified and image.width<image.height*2:continue
      # Official WHCM header embeds its seal above the wordmark on a red plaque.
      if institution=='武汉音乐学院' and url=='https://www.whcm.edu.cn/images/logo.png' and image.size==(267,177):
       image=image.convert('RGBA').crop((101,22,165,86))
       pixels=np.array(image);red=(pixels[:,:,0]>pixels[:,:,1]*1.4)&(pixels[:,:,0]>pixels[:,:,2]*1.4);pixels[red,3]=0;image=Image.fromarray(pixels)
      else:image=emblem_region(image)
      if image is None:continue
      w,h=image.size
      if min(w,h)<32:continue
      white=Image.new('RGBA',image.size,'white');white.alpha_composite(image);mask=np.min(np.array(white.convert('RGB')),axis=2)<220;k=max(1,int(min(w,h)*.2));corners=np.mean([mask[:k,:k].mean(),mask[:k,-k:].mean(),mask[-k:,:k].mean(),mask[-k:,-k:].mean()])
      if corners>.18 and .78<=w/h<=1.28:continue
      score=min(512,min(w,h))+(2000 if re.search(r'seal|emblem|校徽|xiaohui',tag,re.I) else 1000 if identified else 0)
      if best is None or score>best[0]:best=(score,image.convert('RGBA'),url)
     except Exception:continue
   if not best:
    fallback=directory_logo(institution)
    if fallback:
     try:
      image=Image.open(io.BytesIO(fetch(fallback,{'www.shanghairanking.cn'})));image.load()
      if min(image.size)>=32:best=(0,image.convert('RGBA'),fallback)
     except Exception:pass
   if best:
    image=ImageOps.contain(best[1],(1024,1024));canvas=Image.new('RGBA',(1024,1024));canvas.alpha_composite(image,((1024-image.width)//2,(1024-image.height)//2));target=receipt.with_suffix('.png');temporary=target.with_suffix('.tmp');canvas.save(temporary,format='PNG');temporary.replace(target)
    result={'status':'complete','url':'/institution-logos/'+target.name+'?v=7','source':best[2],'institution':institution}
   else:result={'status':'unavailable','institution':institution,'message':'已查找官网但尚未取得可用校徽' if verified_pages else '未找到能核对院校名称的可访问官网','attemptedPages':pages,'diagnostics':errors[-6:],'retryAfter':time.time()+60}
 except Exception as error:result={'status':'unavailable','institution':institution,'message':'校徽查找未完成：'+str(error),'retryAfter':time.time()+300}
 finally:
  if 'result' in locals():
   if result.get('status')=='unavailable' and previous:
    result={**previous,'lastLookupError':result.get('message',''),'retryAfter':time.time()+300}
   result['schema']=7
   result['registryRevision']=registry_revision()
   tmp=receipt.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8');tmp.replace(receipt)
  with LOCK:ACTIVE.discard(str(receipt))

def handle(handler):
 institution=re.sub(r'\s+','',parse_qs(urlparse(handler.path).query).get('institution',[''])[0])[:100]
 institution=unicodedata.normalize('NFKC',institution)
 if not institution:return handler.json_response({'error':'缺少院校名称'},400)
 CACHE.mkdir(parents=True,exist_ok=True);receipt=CACHE/(hashlib.sha256(institution.encode()).hexdigest()[:24]+'.json')
 with LOCK:
  state=json.loads(receipt.read_text(encoding='utf-8')) if receipt.exists() else None
  if state and state.get('status')=='complete' and state.get('url','').startswith('/institution-logos/') and not (ROOT/'dist'/state['url'].split('?')[0].lstrip('/')).is_file():state=None
  if state and state.get('institution')==institution and (state.get('status')=='complete' and state.get('schema')==7 and state.get('registryRevision')==registry_revision() or state.get('schema')==7 and state.get('registryRevision')==registry_revision() and state.get('retryAfter',0)>time.time()):return handler.json_response(state)
  if str(receipt) not in ACTIVE:
   ACTIVE.add(str(receipt));threading.Thread(target=lookup,args=(institution,receipt),daemon=True).start()
 return handler.json_response({'status':'searching','institution':institution})
