"""Cached natural male narration, generated without blocking request threads."""
import asyncio,hashlib,json,threading,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parent/'dist/narration/tour-male'
POOL=ThreadPoolExecutor(max_workers=2)
LOCK=threading.Lock();ACTIVE=set();ERRORS={}
VOICES={'zh':'zh-CN-YunxiNeural','en':'en-US-GuyNeural','fr':'fr-FR-HenriNeural','de':'de-DE-ConradNeural','es':'es-ES-AlvaroNeural','ja':'ja-JP-KeitaNeural','ko':'ko-KR-InJoonNeural','zh-Hant':'zh-TW-YunJheNeural','yue':'zh-HK-WanLungNeural','pt':'pt-BR-AntonioNeural'}

def key(text,locale='zh'):
 if locale!='zh':return hashlib.sha256((VOICES.get(locale,VOICES['zh'])+':rate-4-v1:'+text).encode()).hexdigest()[:32]
 return hashlib.sha256(('YunxiNeural-rate-4-v1:'+text).encode()).hexdigest()[:32]
def generate(text,ident,locale='zh'):
 try:
  import edge_tts
  target=ROOT/(ident+'.mp3');tmp=ROOT/(ident+'.tmp')
  asyncio.run(asyncio.wait_for(edge_tts.Communicate(text,VOICES.get(locale,VOICES['zh']),rate='-4%').save(str(tmp)),timeout=70))
  if tmp.stat().st_size<1000:raise ValueError('合成未返回有效音频')
  tmp.replace(target)
 except Exception as e:
  with LOCK:ERRORS[ident]=(time.time(),str(e))
 finally:
  with LOCK:ACTIVE.discard(ident)
def handle(handler):
 text=parse_qs(urlparse(handler.path).query).get('text',[''])[0].strip()
 if not text or len(text)>3000:return handler.json_response({'error':'讲解文本长度无效'},400)
 locale=parse_qs(urlparse(handler.path).query).get('locale',['zh'])[0]
 if locale not in VOICES:return handler.json_response({'error':'不支持的朗读语言'},400)
 ROOT.mkdir(parents=True,exist_ok=True);ident=key(text,locale)
 if (ROOT/(ident+'.mp3')).exists():return handler.json_response({'status':'complete','url':'/narration/tour-male/'+ident+'.mp3','voice':VOICES[locale]})
 with LOCK:
  error=ERRORS.get(ident)
  if error and time.time()-error[0]<30:return handler.json_response({'status':'failed','message':error[1]})
  if ident not in ACTIVE:ACTIVE.add(ident);POOL.submit(generate,text,ident,locale)
 return handler.json_response({'status':'generating'})
