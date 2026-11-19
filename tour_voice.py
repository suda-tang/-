"""Racing online narration providers; bounded ephemeral RAM, no audio disk cache."""
import asyncio,json,threading,time,os,socket,subprocess,re
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from concurrent.futures import ThreadPoolExecutor
import hashlib
VOICES={'zh':'zh-CN-YunxiNeural','en':'en-US-GuyNeural','fr':'fr-FR-HenriNeural','de':'de-DE-ConradNeural','es':'es-ES-AlvaroNeural','ja':'ja-JP-KeitaNeural','ko':'ko-KR-InJoonNeural','zh-Hant':'zh-TW-YunJheNeural','yue':'zh-HK-WanLungNeural','pt':'pt-BR-AntonioNeural'}

def key(text,locale='zh',role='teacher'):
 if role=='narrator':return hashlib.sha256((VOICES.get(locale,VOICES['zh'])+':guide-original-rate-4:'+text).encode()).hexdigest()[:32]
 if role!='teacher':return hashlib.sha256(('classroom-neural-v2:'+role+locale+text).encode()).hexdigest()[:32]
 if locale!='zh':return hashlib.sha256((VOICES.get(locale,VOICES['zh'])+':rate-4-v1:'+text).encode()).hexdigest()[:32]
 return hashlib.sha256(('classroom-neural-v1:'+text).encode()).hexdigest()[:32]
POOL=ThreadPoolExecutor(max_workers=4)
LOCK=threading.RLock()
CHANGED=threading.Condition(LOCK)
MEMORY={};ACTIVE=set();ERRORS={};STAGES={};EDGE_RETRY_AT=0
MEMORY_LIMIT=24*1024*1024
MAX_AUDIO=4*1024*1024

def routes():
 proxy=os.environ.get('TOUR_VOICE_PROXY')
 if not proxy:
  try:
   with socket.create_connection(('127.0.0.1',7897),timeout=.15):proxy='http://127.0.0.1:7897'
  except OSError:pass
 return [None,proxy] if proxy else [None]

def generate(text,ident,locale='zh',role='teacher'):
 global EDGE_RETRY_AT
 stop=threading.Event();winner=[None];failures=[];threads=[]
 def emit(name,chunk):
  if stop.is_set():return False
  if not chunk:return True
  with CHANGED:
   if winner[0] is None:winner[0]=name
   if winner[0]!=name:return False
   item=MEMORY[ident]
   if len(item['audio'])+len(chunk)>MAX_AUDIO:raise RuntimeError('讲解音频超过内存上限，请缩短讲解段落')
   item['provider']=name;item['audio'].extend(chunk);CHANGED.notify_all()
  return True
 def worker(name,route,edge=False):
  global EDGE_RETRY_AT
  proc=None
  try:
   if name=='kokoro-cpu':
    from classroom_voice import stream
    for chunk in stream(text,role):
     if not emit(name,chunk):return
   elif edge:
    import edge_tts
    async def stream():
     async for packet in edge_tts.Communicate(text,('zh-CN-XiaoxiaoNeural' if locale=='zh' and role=='classroom-teacher' else VOICES[locale]),rate=('-4%' if role=='narrator' else '+0%'),proxy=route).stream():
      if packet['type']=='audio' and not emit(name,packet['data']):return
    asyncio.run(asyncio.wait_for(stream(),timeout=180))
   else:
    project=Path(__file__).resolve().parent
    python=project/'.sites-runtime/tts-fallback-env/Scripts/python.exe'
    if not python.exists():python=project/'.sites-runtime/tts-fallback-env/bin/python'
    env=os.environ.copy()
    for k in ('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'):env.pop(k,None)
    if route:env.update(HTTPS_PROXY=route,HTTP_PROXY=route)
    proc=subprocess.Popen([str(python),'-u',str(project/'scripts/synthesize-tour-fallback.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    proc.stdin.write(json.dumps({'text':text,'locale':locale}).encode());proc.stdin.close()
    deadline=time.monotonic()+180
    def cancel_loser():
     while proc.poll() is None:
      if stop.wait(.1) or (winner[0] is not None and winner[0]!=name) or time.monotonic()>deadline:
       proc.terminate();return
    threading.Thread(target=cancel_loser,daemon=True).start()
    while True:
     chunk=proc.stdout.read1(4096)
     if not chunk:break
     if not emit(name,chunk):return
    if proc.wait(timeout=3)!=0:raise RuntimeError('在线服务未返回完整音频：'+proc.stderr.read().decode('utf-8',errors='replace')[-600:])
   with CHANGED:
    if winner[0]==name:
     item=MEMORY[ident]
     if len(item['audio'])<1000:raise RuntimeError('在线服务返回的音频过短')
     item['done']=True;CHANGED.notify_all();stop.set()
  except Exception as error:
   with CHANGED:
    failures.append(name+': '+type(error).__name__+': '+str(error).split('url=')[0][:240])
    if edge:EDGE_RETRY_AT=time.time()+60
    if winner[0]==name:
     MEMORY[ident]['error']='音频传输中断：'+failures[-1];MEMORY[ident]['done']=True;stop.set()
    CHANGED.notify_all()
  finally:
   if proc:
    if proc.poll() is None:proc.terminate()
    try:proc.wait(timeout=3)
    except subprocess.TimeoutExpired:proc.kill();proc.wait()
    proc.stdout.close();proc.stderr.close()
 def launch(name,route,edge=False):
  t=threading.Thread(target=worker,args=(name,route,edge),daemon=True);threads.append(t);t.start()
 try:
  with CHANGED:
   now=time.time()
   for k in list(MEMORY):
    if k not in ACTIVE and now-MEMORY[k]['createdAt']>900:MEMORY.pop(k,None)
   while sum(len(v['audio']) for v in MEMORY.values())>MEMORY_LIMIT-MAX_AUDIO:
    victim=next((k for k in MEMORY if k not in ACTIVE),None)
    if victim is None:break
    MEMORY.pop(victim,None)
   MEMORY[ident]={'audio':bytearray(),'createdAt':now,'done':False,'error':None,'provider':None}
   STAGES[ident]='正在连接在线语音通道'
  available=routes()
  from classroom_voice import available as natural_available
  classroom=role in ('classroom-teacher','student')
  edge_started=False
  if role=='narrator':
   launch('edge',None,True)
   if len(available)>1:launch('edge-proxy',available[1],True)
   edge_started=True
   preferred=time.monotonic()+.8
   with CHANGED:
    while winner[0] is None and any(t.is_alive() for t in threads) and time.monotonic()<preferred:CHANGED.wait(.05)
   if winner[0] is None:
    STAGES[ident]='微软语音未及时返回，正在连接备用在线语音'
    launch('google-direct',None)
    if len(available)>1:launch('google-proxy',available[1])
  if classroom and time.time()>=EDGE_RETRY_AT:
   launch('edge',None,True)
   if len(available)>1:launch('edge-proxy',available[1],True)
   edge_started=True
   preferred=time.monotonic()+.8
   with CHANGED:
    while winner[0] is None and threads[-1].is_alive() and time.monotonic()<preferred:CHANGED.wait(.05)
  if role!='narrator' and winner[0] is None and natural_available(locale):
   STAGES[ident]='正在准备自然语音'
   launch('kokoro-cpu',None)
   preferred=time.monotonic()+(.4 if classroom else 20)
   with CHANGED:
    while winner[0] is None and threads[-1].is_alive() and time.monotonic()<preferred:CHANGED.wait(.1)
  if role!='narrator' and winner[0] is None:
   if not edge_started and time.time()>=EDGE_RETRY_AT:
    launch('edge',None,True)
    preferred=time.monotonic()+3
    with CHANGED:
     while winner[0] is None and threads[-1].is_alive() and time.monotonic()<preferred:CHANGED.wait(.1)
   if winner[0] is None:
    STAGES[ident]='自然语音暂未返回，正在启用备用朗读'
    launch('google-direct',None)
    if len(available)>1:launch('google-proxy',available[1])
  deadline=time.monotonic()+185
  with CHANGED:
   while not stop.is_set() and time.monotonic()<deadline:
    if not any(t.is_alive() for t in threads):break
    CHANGED.wait(.15)
   item=MEMORY[ident]
   if not item['done']:
    item['error']='在线语音未能完成：'+'；'.join(failures) if failures else '在线语音连接超时'
    item['done']=True
   if item['error']:ERRORS[ident]=(time.time(),item['error'])
   else:ERRORS.pop(ident,None)
   CHANGED.notify_all()
 finally:
  stop.set()
  for t in threads:t.join(timeout=2)
  with CHANGED:ACTIVE.discard(ident);STAGES.pop(ident,None);CHANGED.notify_all()

def serve_audio(handler,ident):
 with CHANGED:
  item=MEMORY.get(ident)
  if not item:return handler.json_response({'error':'音频已释放，请重新合成'},404)
  if item['error']:return handler.json_response({'error':item['error']},502)
  done=item['done'];data=bytes(item['audio']) if done else None
 if not done:
  # Close-delimited MP3 lets HTMLAudio decode frames before synthesis has finished.
  handler.send_response(200);handler.send_header('Content-Type','audio/mpeg');handler.send_header('Cache-Control','no-store');handler.send_header('Accept-Ranges','none');handler.send_header('Connection','close');handler.send_header('X-Accel-Buffering','no');handler.end_headers();handler.close_connection=True
  offset=0;deadline=time.monotonic()+190
  try:
   while time.monotonic()<deadline:
    with CHANGED:
     if offset==len(item['audio']) and not item['done']:CHANGED.wait(1)
     chunk=bytes(item['audio'][offset:]);offset+=len(chunk);finished=item['done']
    if chunk:handler.wfile.write(chunk);handler.wfile.flush()
    if finished:break
  except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
  return
 start=0;end=len(data)-1;status=200;requested=handler.headers.get('Range','')
 if requested:
  m=re.fullmatch(r'bytes=(\d*)-(\d*)',requested)
  if not m or not any(m.groups()):return handler.json_response({'error':'无效音频范围'},416)
  if m[1]:start=int(m[1]);end=min(int(m[2]) if m[2] else end,end)
  else:start=max(0,len(data)-int(m[2]))
  if start>end or start>=len(data):
   handler.send_response(416);handler.send_header('Content-Range',f'bytes */{len(data)}');handler.send_header('Content-Length','0');handler.end_headers();return
  status=206
 body=data[start:end+1];handler.send_response(status);handler.send_header('Content-Type','audio/mpeg');handler.send_header('Cache-Control','no-store');handler.send_header('Accept-Ranges','bytes')
 if status==206:handler.send_header('Content-Range',f'bytes {start}-{end}/{len(data)}')
 handler.send_header('Content-Length',str(len(body)));handler.end_headers();handler.wfile.write(body)

def handle(handler):
 query=parse_qs(urlparse(handler.path).query)
 if query.get('audio'):return serve_audio(handler,query['audio'][0])
 text=query.get('text',[''])[0].strip();locale=query.get('locale',['zh'])[0]
 if not text or len(text)>3000:return handler.json_response({'error':'讲解文本长度无效'},400)
 if locale not in VOICES:return handler.json_response({'error':'不支持的朗读语言'},400)
 role=query.get('role',['teacher'])[0]
 if role not in ('teacher','classroom-teacher','student','assistant','narrator'):return handler.json_response({'error':'朗读角色无效'},400)
 ident=key(text,locale,role)
 with CHANGED:
  item=MEMORY.get(ident)
  error=ERRORS.get(ident)
  if error and time.time()-error[0]<15:return handler.json_response({'status':'failed','message':error[1]})
  if item and not item['error'] and len(item['audio'])>=1000 and time.time()-item['createdAt']<900:
   return handler.json_response({'status':'complete','streaming':not item['done'],'url':'/api/tour-voice?audio='+ident,'provider':item['provider'],'voice':('Kokoro '+role if item['provider']=='kokoro-cpu' else VOICES[locale] if item['provider'].startswith('edge') else 'Google online '+locale)})
  if ident not in ACTIVE:ACTIVE.add(ident);POOL.submit(generate,text,ident,locale,role)
  stage=STAGES.get(ident,'等待在线语音合成')
 return handler.json_response({'status':'generating','message':stage})
