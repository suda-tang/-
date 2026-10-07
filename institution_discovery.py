"""Discover university websites from live search; verify names before using assets."""
import re,time,json,hashlib
from pathlib import Path
CACHE=Path(__file__).resolve().parent/'.sites-runtime/institution-sites'
from urllib.parse import urljoin,urlparse
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
import requests
HEADERS={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36','Accept-Language':'zh-CN,zh;q=0.9'}
def normalize(value):return re.sub(r"\s+",'',value or '').casefold()
def decode_page(response):
 response.encoding=response.apparent_encoding or 'utf-8'
 return response.text

def resolve_search_link(url):
 for _ in range(3):
  host=urlparse(url).hostname or ''
  if host.endswith('.edu.cn'):return url
  if host not in ('www.so.com','www.sogou.com','www.bing.com','cn.bing.com'):return None
  r=requests.get(url,headers=HEADERS,timeout=(3,5),allow_redirects=False)
  if r.is_redirect:url=urljoin(url,r.headers.get('Location',''));continue
  match=re.search(r"URL=\s*[\"']?([^\"'\s>]+)",r.text[:8000],re.I)
  if match:url=urljoin(url,match.group(1).rstrip(';'));continue
  break
 return None

def directory_sites(institution):
 """Refresh public university-domain data automatically, then verify on the actual site."""
 CACHE.mkdir(parents=True,exist_ok=True);path=CACHE/'directory.json'
 try:
  data=json.loads(path.read_text(encoding='utf-8'))
  if time.time()-data.get('saved',0)<86400*30:return data.get('sites',{}).get(normalize(institution),[])
 except (ValueError,OSError):data={'sites':{}}
 sites=data.get('sites',{})
 try:
  index=requests.get('https://api.github.com/repos/FitchCode/AllShoolData/contents',headers=HEADERS,timeout=(3,7));index.raise_for_status()
  url=next(item['download_url'] for item in index.json() if item['name'].endswith('.json'))
  response=requests.get(url,headers=HEADERS,timeout=(3,10));response.raise_for_status()
  # The source has a trailing comma. Parse each independent record without evaluating code.
  for match in re.finditer(r'\{[^{}]+\}',response.text):
   try:record=json.loads(match.group())
   except ValueError:continue
   name=normalize(record.get('name'));website=record.get('website','').strip()
   if name and (urlparse(website).hostname or '').endswith('.edu.cn'):
    secure=website.replace('http://','https://',1);sites[name]=list(dict.fromkeys([secure,website]))
  if sites:
   temp=path.with_suffix('.tmp');temp.write_text(json.dumps({'saved':time.time(),'source':url,'sites':sites},ensure_ascii=False),encoding='utf-8');temp.replace(path)
 except (requests.RequestException,ValueError,StopIteration):pass
 return sites.get(normalize(institution),[])

def directory_logo(institution):
 path=CACHE/'logo-directory.json'
 try:
  saved=json.loads(path.read_text(encoding='utf-8'))
  if time.time()-saved.get('saved',0)<86400*30:return saved.get('logos',{}).get(normalize(institution))
 except (ValueError,OSError):pass
 try:
  url='https://raw.githubusercontent.com/xioajiumi/Chinese_Universities/main/Chinese_Universities.json'
  r=requests.get(url,headers=HEADERS,timeout=(3,10));r.raise_for_status();logos={}
  for match in re.finditer(r'\{[^{}]+\}',r.text):
   try:record=json.loads(match.group())
   except ValueError:continue
   name=normalize(record.get('name'));logo=record.get('logo','')
   if name and urlparse(logo).hostname=='www.shanghairanking.cn':logos[name]=logo
  CACHE.mkdir(parents=True,exist_ok=True)
  tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps({'saved':time.time(),'source':url,'logos':logos},ensure_ascii=False),encoding='utf-8');tmp.replace(path)
  return logos.get(normalize(institution))
 except (requests.RequestException,ValueError):return None

def discover(institution,use_directory=True):
 directory=directory_sites(institution) if use_directory else []
 if directory:return directory
 CACHE.mkdir(parents=True,exist_ok=True)
 receipt=CACHE/(hashlib.sha256(institution.encode()).hexdigest()+'.json')
 try:
  saved=json.loads(receipt.read_text(encoding='utf-8'))
  if saved.get('institution')==institution and time.time()-saved.get('saved',0)<86400*30:return saved['urls']
 except (OSError,ValueError,KeyError):pass
 def engine(args):
  url,params=args;result=[]
  try:
   r=requests.get(url,params=params,headers=HEADERS,timeout=(3,7));r.raise_for_status()
   soup=BeautifulSoup(decode_page(r),'html.parser')
   for a in soup.select('h3 a, .res-title a, .b_algo h2 a'):
    if normalize(institution) not in normalize(a.get_text(' ',strip=True)):continue
    href=urljoin(url,a.get('href',''))
    if href not in result:result.append(href)
    if len(result)>=3:break
  except requests.RequestException:pass
  return result
 with ThreadPoolExecutor(max_workers=2) as pool:
  batches=list(pool.map(engine,[('https://www.so.com/s',{'q':institution+' 官网'}),('https://www.sogou.com/web',{'query':institution+' 官网'})]))
 links=list(dict.fromkeys(link for batch in batches for link in batch))[:5]
 def resolve(link):
  try:return resolve_search_link(link)
  except requests.RequestException:return None
 with ThreadPoolExecutor(max_workers=4) as pool:urls=[url for url in pool.map(resolve,links) if url]
 result=sorted(dict.fromkeys(urls),key=lambda url:(not (urlparse(url).hostname or '').startswith('www.'),len(urlparse(url).path)))[:5]
 if result:
  temp=receipt.with_suffix('.tmp');temp.write_text(json.dumps({'institution':institution,'urls':result,'saved':time.time()},ensure_ascii=False),encoding='utf-8');temp.replace(receipt)
 return result

def matches(institution,html):
 soup=BeautifulSoup(html,'html.parser');name=normalize(institution)
 title=normalize(soup.title.get_text() if soup.title else '')
 if name in title:return True
 return any(name in normalize(tag.get('alt','')) for tag in soup.select('header img, .logo img, img[alt]'))
