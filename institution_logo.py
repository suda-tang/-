"""Find official university emblems off-thread, validate and persist local images."""
import hashlib,io,json,re,threading,time
from pathlib import Path
from urllib.parse import urlparse,urljoin,parse_qs
import requests
import numpy as np
from PIL import Image,ImageOps
ROOT=Path(__file__).resolve().parent
CACHE=ROOT/'dist/institution-logos'
ACTIVE=set();LOCK=threading.Lock()
SESSION=requests.Session();SESSION.headers['User-Agent']='Mozilla/5.0'
def registry_revision():
 p=ROOT/"dist/institution-websites.json"
 return hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.exists() else ""

def official(url):
 p=urlparse(url);return p.scheme in ('http','https') and bool(p.hostname) and p.hostname.endswith('.edu.cn') and not p.username

def fetch(url):
 if not official(url):raise ValueError('仅使用院校官网资源')
 response=SESSION.get(url,timeout=(4,7),allow_redirects=False,stream=True)
 for _ in range(3):
  if response.status_code not in (301,302,303,307,308):break
  url=urljoin(url,response.headers.get('Location',''));response.close()
  if not official(url):raise ValueError('官网资源跳转至其他站点')
  response=SESSION.get(url,timeout=(4,7),allow_redirects=False,stream=True)
 response.raise_for_status();data=bytearray()
 for block in response.iter_content(32768):
  data.extend(block)
  if len(data)>4*1024*1024:raise ValueError('图片或页面过大')
 response.close();return bytes(data)

def emblem_region(image):
    """Keep square emblems; extract a separated top/left emblem from a wordmark."""
    rgba=image.convert('RGBA');white=Image.new('RGBA',rgba.size,'white');white.alpha_composite(rgba)
    mask=np.min(np.array(white.convert('RGB')),axis=2)<220
    w,h=image.size
    if .78<=w/h<=1.28:return rgba
    # Official identity sheets commonly put the seal above the handwritten name.
    rows=np.flatnonzero(np.sum(mask,axis=1)>max(2,w*.015))
    if not len(rows):return None
    splits=np.flatnonzero(np.diff(rows)>7)
    if len(splits):
        band=rows[:splits[0]+1];top,bottom=int(band[0]),int(band[-1])+1
        xs=np.flatnonzero(np.any(mask[top:bottom],axis=0))
        if len(xs):
            left,right=int(xs[0]),int(xs[-1])+1
            if min(right-left,bottom-top)>=60 and .78<=(right-left)/(bottom-top)<=1.28:return rgba.crop((left,top,right,bottom))
    # A circular seal at the left of a horizontal header has an empty separator.
    if w>h*2 and h>=60:
        columns=np.sum(mask,axis=0);start=int(np.flatnonzero(columns>2)[0]);end=min(w,start+h)
        if np.mean(columns[max(start,end-3):min(w,end+8)])<max(4,h*.08):return rgba.crop((start,0,end,h))
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
 try:
  if institution=='苏州大学':
   result={'status':'complete','url':'/suda-seal.svg?v=round19','source':'https://www.suda.edu.cn/','institution':institution}
  else:
   pages=roots(institution)
   if not pages:
    # Search resolves the university website; images still come exclusively from .edu.cn.
    html=SESSION.get('https://www.bing.com/search',params={'q':institution+' 校徽 site:edu.cn'},timeout=(4,7)).text
    from html import unescape
    pages=list(dict.fromkeys(unescape(u) for u in re.findall(r'https?://[^"<>\s]+',html) if official(unescape(u))))[:4]
   best=None;seen=set();deadline=time.monotonic()+55
   for page in pages:
    if time.monotonic()>deadline:break
    try:html=fetch(page).decode('utf-8',errors='replace')
    except Exception:continue
    images=[]
    for tag in re.findall(r'<img\b[^>]*>',html,re.I):
     match=re.search(r'(?:src|data-src)\s*=\s*[\"\']([^\"\']+)',tag,re.I)
     if match and (re.search(r'logo|seal|emblem|校徽|校标',tag,re.I) or ('校徽' in html and 'img_vsb_content' in tag)):images.append((urljoin(page,match.group(1)),tag))
    # Many university themes keep the round emblem in a CSS background.
    for match in re.finditer(r'url\([\"\']?([^\)\"\']+)',html,re.I):
     if re.search(r'logo|seal|emblem|xiaohui',match.group(1),re.I):images.append((urljoin(page,match.group(1)),match.group(1)))
    for url,tag in images[:12]:
     if url in seen or not official(url) or time.monotonic()>deadline:continue
     seen.add(url)
     try:
      image=Image.open(io.BytesIO(fetch(url)));image.load()
      # Official WHCM header embeds its seal above the wordmark on a red plaque.
      if institution=='武汉音乐学院' and url=='https://www.whcm.edu.cn/images/logo.png' and image.size==(267,177):
       image=image.convert('RGBA').crop((101,22,165,86))
       pixels=np.array(image);red=(pixels[:,:,0]>pixels[:,:,1]*1.4)&(pixels[:,:,0]>pixels[:,:,2]*1.4);pixels[red,3]=0;image=Image.fromarray(pixels)
      else:image=emblem_region(image)
      if image is None:continue
      w,h=image.size
      if min(w,h)<60:continue
      white=Image.new('RGBA',image.size,'white');white.alpha_composite(image);mask=np.min(np.array(white.convert('RGB')),axis=2)<220;k=max(1,int(min(w,h)*.2));corners=np.mean([mask[:k,:k].mean(),mask[:k,-k:].mean(),mask[-k:,:k].mean(),mask[-k:,-k:].mean()])
      if corners>.18:continue
      score=min(w,h)+ (1000 if re.search(r'seal|emblem|校徽|xiaohui',tag,re.I) else 0)
      if best is None or score>best[0]:best=(score,image.convert('RGBA'),url)
     except Exception:continue
   if best:
    image=ImageOps.contain(best[1],(1024,1024));canvas=Image.new('RGBA',(1024,1024));canvas.alpha_composite(image,((1024-image.width)//2,(1024-image.height)//2));target=receipt.with_suffix('.png');temporary=target.with_suffix('.tmp');canvas.save(temporary,format='PNG');temporary.replace(target)
    result={'status':'complete','url':'/institution-logos/'+target.name+'?v=4','source':best[2],'institution':institution}
   else:result={'status':'unavailable','institution':institution,'message':'院校官网暂未找到可验证的独立校徽，保留院校名称','retryAfter':time.time()+3600}
 except Exception as error:result={'status':'unavailable','institution':institution,'message':'校徽查找未完成：'+str(error),'retryAfter':time.time()+300}
 finally:
  if 'result' in locals():
   result['schema']=5
   result['registryRevision']=registry_revision()
   tmp=receipt.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8');tmp.replace(receipt)
  with LOCK:ACTIVE.discard(str(receipt))

def handle(handler):
 institution=re.sub(r'\s+','',parse_qs(urlparse(handler.path).query).get('institution',[''])[0])[:100]
 if not institution:return handler.json_response({'error':'缺少院校名称'},400)
 CACHE.mkdir(parents=True,exist_ok=True);receipt=CACHE/(hashlib.sha256(institution.encode()).hexdigest()[:24]+'.json')
 with LOCK:
  state=json.loads(receipt.read_text(encoding='utf-8')) if receipt.exists() else None
  if state and (state.get('status')=='complete' and state.get('schema')==5 and state.get('registryRevision')==registry_revision() or state.get('schema')==5 and state.get('registryRevision')==registry_revision() and state.get('retryAfter',0)>time.time()):return handler.json_response(state)
  if str(receipt) not in ACTIVE:
   ACTIVE.add(str(receipt));threading.Thread(target=lookup,args=(institution,receipt),daemon=True).start()
 return handler.json_response({'status':'searching','institution':institution})
