"""Persistent media/photo uploads and background transcription integration."""
import hashlib,json,re,subprocess,time,uuid
from pathlib import Path
from storage import write_json
ROOT=Path(__file__).resolve().parent
CACHE=ROOT/'.sites-runtime/score-cache'
PYTHON=ROOT/'.sites-runtime/performance-env/Scripts/python.exe'

def media_title(kind):
 prefix='视频转录' if kind=='video' else '音频转录'
 used=0
 for path in CACHE.glob('*.metadata.json'):
  try:
   meta=json.loads(path.read_text(encoding='utf-8'))
   if meta.get('sourceType')==kind:used+=1
  except (OSError,ValueError):pass
 return f'{prefix} {used+1:03d}'

def receive(stream,length,name,photo=False,media_type=''):
 CACHE.mkdir(parents=True,exist_ok=True);temporary=CACHE/(uuid.uuid4().hex+'.uploading');digest=hashlib.sha256()
 try:
  with temporary.open('wb') as output:
   remaining=length
   while remaining:
    chunk=stream.read(min(1024*1024,remaining))
    if not chunk:raise ValueError('上传未完成')
    output.write(chunk);digest.update(chunk);remaining-=len(chunk)
  key=digest.hexdigest();target=CACHE/(key+('.photo' if photo else '.source'));temporary.replace(target)
  if not photo:
   (CACHE/(key+'.name')).write_text(name[:250],encoding='utf-8')
   kind='video' if str(media_type).lower().startswith('video/') else 'audio'
   write_json(CACHE/(key+'.metadata.json'),{'title':media_title(kind),'titleSource':'generated','sourceType':kind,'originalName':name[:250]})
   import background_jobs
   job=background_jobs.enqueue(key,'transcription','transkun-2.0.1',priority=0)
   return {'id':key,'jobId':job,'status':'queued','hasPdf':False}
  return {'id':key}
 finally:temporary.unlink(missing_ok=True)

def photo_book(payload):
 pages=payload.get('pages',[])
 if not isinstance(pages,list) or not 1<=len(pages)<=40:raise ValueError('请选择 1–40 张照片')
 for key in pages:
  if not isinstance(key,str) or not re.fullmatch('[a-f0-9]{64}',key) or not (CACHE/(key+'.photo')).exists():raise ValueError('照片尚未上传完成')
 digest=hashlib.sha256(json.dumps(pages).encode()).hexdigest();name=str(payload.get('name') or '照片曲谱')[:120]
 write_json(CACHE/(digest+'.photo-book.json'),{'pages':pages,'title':name})
 (CACHE/(digest+'.name')).write_text(name,encoding='utf-8')
 write_json(CACHE/(digest+'.metadata.json'),{'title':name,'titleSource':'filename','sourceType':'photos'})
 import background_jobs
 job=background_jobs.enqueue(digest,'photos','1',priority=0)
 return {'id':digest,'jobId':job,'status':'queued','hasPdf':True}

def run(job,server,progress):
 digest=job['digest'];mode=job['kind'];target=CACHE/(digest+'.transcribed.musicxml');status=CACHE/(digest+'.import-progress.json')
 request=CACHE/(digest+'.media-request.json')
 from title_validation import filename_title
 name=(CACHE/(digest+'.name')).read_text(encoding='utf-8')
 params=json.loads(job.get('params') or '{}')
 write_json(request,{'mode':mode,'digest':digest,'title':filename_title(name),'cacheDir':str(CACHE),'analyzeAudio':mode=='transcription','audioChoice':params.get('audioChoice')})
 status.unlink(missing_ok=True)
 with (CACHE/(digest+'.media.log')).open('w',encoding='utf-8') as log:
  process=subprocess.Popen([str(PYTHON),str(ROOT/'scripts/transcribe-media.py'),str(request)],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)|getattr(subprocess,'BELOW_NORMAL_PRIORITY_CLASS',0))
  started=time.monotonic()
  while process.poll() is None:
   if time.monotonic()-started>10800:process.kill();process.wait();raise TimeoutError('媒体处理超时')
   try:
    state=json.loads(status.read_text(encoding='utf-8'));progress(state['progress'],state['detail'])
   except (OSError,ValueError,KeyError):pass
   time.sleep(1)
  if process.returncode:
   try:error=json.loads(status.read_text(encoding='utf-8')).get('error')
   except (OSError,ValueError):error=None
   raise ValueError(error or '媒体处理失败，详情已保存到服务器日志')
 if status.exists() and json.loads(status.read_text(encoding='utf-8')).get('needsChoice'):
  return {'digest':digest,'needsChoice':True,'detail':json.loads(status.read_text(encoding='utf-8')).get('detail','请选择转录方式')}
 if mode=='photos':server.enqueue_recognition((CACHE/(digest+'.pdf')).read_bytes(),digest)
 else:
  meta=json.loads((CACHE/(digest+'.metadata.json')).read_text(encoding='utf-8'))
  server.write_cached_score(digest,target.read_text(encoding='utf-8'),meta)
 return {'digest':digest}
