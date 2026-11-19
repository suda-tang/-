"""Bounded OCR for simple search-engine image verification forms."""
import json,re,subprocess,sys
from pathlib import Path
from urllib.parse import urlparse,urljoin
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parent
SEARCH_HOSTS={'www.so.com','www.sogou.com','www.bing.com','cn.bing.com'}

def is_challenge(response):
 soup=BeautifulSoup(response.text,'html.parser');heading=soup.title.get_text() if soup.title else ''
 return bool(re.search('访问异常|验证码|安全验证|captcha|unusual traffic',heading+' '+soup.get_text(' ',strip=True)[:500],re.I))

def recognize(image):
 python=ROOT/'.sites-runtime/captcha-env/Scripts/python.exe'
 if not python.exists():raise RuntimeError('验证码识别模型尚未安装')
 result=subprocess.run([str(python),str(ROOT/'scripts/captcha-ocr.py')],input=image,capture_output=True,timeout=15,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 try:data=json.loads(result.stdout.decode('utf-8').strip().splitlines()[-1])
 except (ValueError,IndexError):raise RuntimeError('验证码模型未返回识别结果')
 if result.returncode or data.get('error'):raise RuntimeError(data.get('error','验证码识别失败'))
 text=str(data.get('text','')).strip()
 if not re.fullmatch(r'[A-Za-z0-9\u4e00-\u9fff]{3,10}',text):raise RuntimeError('验证码识别结果无法确认')
 return text

def attempt_image_challenge(response,session,ocr=recognize):
 origin=urlparse(response.url);soup=BeautifulSoup(response.text,'html.parser')
 if origin.hostname not in SEARCH_HOSTS:return response,{'status':'unsupported','detail':'该站点未接入自动验证'}
 base={'url':response.url,'status':'manual','detail':'搜索服务要求交互验证，可打开搜索页处理；已继续尝试其他来源'}
 for form in soup.select('form'):
  fields=form.select('input[name]')
  if any(n.get('type','').lower()=='password' for n in fields):continue
  code=next((n for n in fields if re.search('captcha|verifycode|vcode|validatecode|验证码',' '.join(str(n.get(k,'')) for k in ['name','id','placeholder']),re.I) and n.get('type','text') not in ('hidden','password')),None)
  image=form.select_one('img[src*="captcha" i],img[src*="vcode" i],img[src*="verify" i],img[id*="captcha" i],img[alt*="验证码"]')
  if code is None or image is None:continue
  action=urljoin(response.url,form.get('action') or response.url);src=urljoin(response.url,image.get('src',''))
  # Form tokens and session cookies are kept together; no arbitrary destinations.
  if any((urlparse(u).scheme,urlparse(u).netloc)!=(origin.scheme,origin.netloc) for u in (action,src)):continue
  try:
   r=session.get(src,timeout=(2,4),stream=True,allow_redirects=False);r.raise_for_status()
   try:
    data=bytearray()
    for chunk in r.iter_content(16384):
     data.extend(chunk)
     if len(data)>1024*1024:raise RuntimeError('验证码图片超过1MB')
   finally:r.close()
   text=ocr(bytes(data));payload={n['name']:n.get('value','') for n in fields if n.get('type','text') in ('hidden','text','submit')};payload[code['name']]=text
   method=form.get('method','get').lower()
   if method not in ('get','post'):continue
   result=getattr(session,method)(action,**({'data':payload} if method=='post' else {'params':payload}),timeout=(2,5),allow_redirects=False)
   result.raise_for_status()
   if result.is_redirect:
    target=urljoin(action,result.headers.get('Location',''))
    if (urlparse(target).scheme,urlparse(target).netloc)!=(origin.scheme,origin.netloc):return response,base
    result=session.get(target,timeout=(2,5),allow_redirects=False);result.raise_for_status()
   result.encoding=result.apparent_encoding or 'utf-8'
   if not is_challenge(result):return result,{'status':'passed','detail':'图片验证码已识别并通过校验'}
   return response,{**base,'status':'failed','detail':'图片验证码校验未通过，已切换其他搜索来源'}
  except (RuntimeError,subprocess.TimeoutExpired,ValueError) as e:return response,{**base,'status':'failed','detail':str(e)+'，已切换其他搜索来源'}
  except Exception as e:return response,{**base,'status':'failed','detail':'验证码请求未完成：'+type(e).__name__}
 return response,base
