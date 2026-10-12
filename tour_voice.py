"""Cached natural male narration, generated without blocking request threads."""
import asyncio,hashlib,json,threading,time,os,subprocess,socket,tempfile
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parent/'dist/narration/tour-male'
POOL=ThreadPoolExecutor(max_workers=2)
LOCK=threading.Lock();ACTIVE=set();ERRORS={};EDGE_RETRY_AT=0
STAGES={}
VOICES={'zh':'zh-CN-YunxiNeural','en':'en-US-GuyNeural','fr':'fr-FR-HenriNeural','de':'de-DE-ConradNeural','es':'es-ES-AlvaroNeural','ja':'ja-JP-KeitaNeural','ko':'ko-KR-InJoonNeural','zh-Hant':'zh-TW-YunJheNeural','yue':'zh-HK-WanLungNeural','pt':'pt-BR-AntonioNeural'}

def key(text,locale='zh'):
 if locale!='zh':return hashlib.sha256((VOICES.get(locale,VOICES['zh'])+':rate-4-v1:'+text).encode()).hexdigest()[:32]
 return hashlib.sha256(('YunxiNeural-rate-4-v1:'+text).encode()).hexdigest()[:32]
def local_narration(text,target,locale):
 if os.name!='nt' or locale not in ('zh','en'):return False
 import imageio_ffmpeg
 with tempfile.TemporaryDirectory(prefix='classroom-voice-') as folder:
  folder=Path(folder);source=folder/'text.txt';wav=folder/'speech.wav';script=folder/'speak.ps1'
  source.write_text(text,encoding='utf-8')
  script.write_text("Add-Type -AssemblyName System.Speech\n$speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer\ntry {$speaker.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::NotSet,[System.Speech.Synthesis.VoiceAge]::NotSet,0,[System.Globalization.CultureInfo]::GetCultureInfo($env:LESSON_LOCALE));$speaker.SetOutputToWaveFile($env:LESSON_WAV);$speaker.Speak([System.IO.File]::ReadAllText($env:LESSON_TEXT,[System.Text.Encoding]::UTF8))} finally {$speaker.Dispose()}",encoding='utf-8-sig')
  env=os.environ.copy();env.update(LESSON_LOCALE='zh-CN' if locale=='zh' else 'en-US',LESSON_TEXT=str(source),LESSON_WAV=str(wav))
  subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(script)],env=env,capture_output=True,timeout=40,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
  subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-i',str(wav),'-codec:a','libmp3lame','-b:a','128k','-f','mp3',str(target)],capture_output=True,timeout=20,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
 return target.exists() and target.stat().st_size>=1000

def fallback(text,target,locale):
 try:
  if local_narration(text,target,locale):return
 except Exception:pass
 project=Path(__file__).resolve().parent
 python=Path(os.environ.get('TOUR_FALLBACK_PYTHON') or project/'.sites-runtime/tts-fallback-env/Scripts/python.exe')
 if not python.exists():python=project/'.sites-runtime/tts-fallback-env/bin/python'
 if not python.exists():raise RuntimeError('备用朗读环境尚未安装')
 env=os.environ.copy();proxy=env.get('TOUR_VOICE_PROXY')
 if not proxy:
  try:
   with socket.create_connection(('127.0.0.1',7897),timeout=.3):proxy='http://127.0.0.1:7897'
  except OSError:pass
 routes=[proxy,None] if proxy else [None]
 errors=[]
 for route in routes:
  local_env=env.copy();local_env.update(PYTHONUTF8="1",PYTHONIOENCODING="utf-8")
  for name in ('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'):local_env.pop(name,None)
  if route:local_env.update(HTTPS_PROXY=route,HTTP_PROXY=route)
  try:
   result=subprocess.run([str(python),str(project/'scripts/synthesize-tour-fallback.py')],input=json.dumps({'text':text,'locale':locale,'target':str(target)},ensure_ascii=False),encoding='utf-8',capture_output=True,errors='replace',env=local_env,timeout=90,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
   if result.returncode==0 and target.exists() and target.stat().st_size>=1000:return
   errors.append('代理连接失败' if route else '直连失败')
  except subprocess.TimeoutExpired:errors.append('代理连接超时' if route else '直连超时')
 raise RuntimeError('备用朗读未能生成音频：'+'、'.join(errors))

def generate(text,ident,locale='zh'):
 global EDGE_RETRY_AT
 target=ROOT/(ident+'.mp3');tmp=ROOT/(ident+'.tmp');provider='edge'
 try:
  import edge_tts
  with LOCK:edge_available=time.time()>=EDGE_RETRY_AT;STAGES[ident]='正在合成讲解'
  if edge_available:
   try:
    proxy=os.environ.get('TOUR_VOICE_PROXY')
    if not proxy:
     try:
      with socket.create_connection(('127.0.0.1',7897),timeout=.3):proxy='http://127.0.0.1:7897'
     except OSError:pass
    routes=[proxy,None] if proxy else [None]
    for route_index,route in enumerate(routes):
     try:
      asyncio.run(asyncio.wait_for(edge_tts.Communicate(text,VOICES.get(locale,VOICES['zh']),rate='-4%',proxy=route).save(str(tmp)),timeout=20))
      break
     except Exception:
      tmp.unlink(missing_ok=True)
      if route_index==len(routes)-1:raise
    if tmp.stat().st_size<1000:raise ValueError('合成未返回有效音频')
   except Exception as error:
    # A rejected handshake is not repaired by repeating it for every sentence.
    with LOCK:EDGE_RETRY_AT=time.time()+600;STAGES[ident]='首选语音连接失败，正在切换备用朗读'
    provider='fallback';fallback(text,tmp,locale)
  else:
   with LOCK:STAGES[ident]='正在通过备用通道合成讲解'
   provider='fallback';fallback(text,tmp,locale)
  tmp.replace(target)
  (ROOT/(ident+'.json')).write_text(json.dumps({'provider':provider,'voice':VOICES[locale] if provider=='edge' else '备用朗读','createdAt':time.time()}),encoding='utf-8')
  with LOCK:ERRORS.pop(ident,None)
 except Exception as e:
  tmp.unlink(missing_ok=True)
  with LOCK:ERRORS[ident]=(time.time(),'讲解语音暂不可用：'+str(e))
 finally:
  with LOCK:ACTIVE.discard(ident);STAGES.pop(ident,None)

def handle(handler):
 text=parse_qs(urlparse(handler.path).query).get('text',[''])[0].strip()
 if not text or len(text)>3000:return handler.json_response({'error':'讲解文本长度无效'},400)
 locale=parse_qs(urlparse(handler.path).query).get('locale',['zh'])[0]
 if locale not in VOICES:return handler.json_response({'error':'不支持的朗读语言'},400)
 ROOT.mkdir(parents=True,exist_ok=True);ident=key(text,locale)
 if (ROOT/(ident+'.mp3')).exists():
  metadata={}
  try:metadata=json.loads((ROOT/(ident+'.json')).read_text(encoding='utf-8'))
  except (OSError,ValueError):pass
  return handler.json_response({'status':'complete','url':'/narration/tour-male/'+ident+'.mp3','voice':metadata.get('voice',VOICES[locale]),'provider':metadata.get('provider','edge')})
 with LOCK:
  error=ERRORS.get(ident)
  if error and time.time()-error[0]<30:return handler.json_response({'status':'failed','message':error[1]})
  if ident not in ACTIVE:ACTIVE.add(ident);POOL.submit(generate,text,ident,locale)
 return handler.json_response({'status':'generating','message':STAGES.get(ident,'等待语音合成')})
