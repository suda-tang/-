from pathlib import Path
from storage import write_json
import json,hashlib,subprocess,threading,time,math
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parent
CACHE=ROOT/'.sites-runtime/performance-cache'
PYTHON=ROOT/'.sites-runtime/performance-env/Scripts/python.exe'
POOL=ThreadPoolExecutor(max_workers=1);LOCK=threading.Lock();JOBS={}
def available():return (ROOT/'.sites-runtime/performance-ready.json').exists()
def start(payload):
 if not available():return {'status':'unavailable','error':'演奏模型尚未安装完成'},503
 events=payload.get('events',[])
 if not isinstance(events,list) or not events or len(events)>20000:raise ValueError('演奏事件数量无效')
 if not 30<=float(payload.get('bpm',80))<=240:raise ValueError('无效速度')
 for e in events:
  if not math.isfinite(e['beat']) or e['beat']<0:raise ValueError('无效时间')
  for n in e['notes']:
   if not 0<=n['midi']<=127 or not 0<n['duration']<=256:raise ValueError('无效音符')
 canonical={'bpm':float(payload.get('bpm',80)),'events':[{'beat':float(e['beat']),'notes':[{'midi':int(n['midi']),'duration':float(n['duration'])} for n in e['notes']]} for e in events]};key=hashlib.sha256(json.dumps(canonical,sort_keys=True).encode()).hexdigest();CACHE.mkdir(parents=True,exist_ok=True)
 result=CACHE/(key+'.json')
 if result.exists():return {'id':key,'status':'complete','result':json.loads(result.read_text())},200
 with LOCK:
  if key in JOBS and JOBS[key]['status'] in ('running','queued'):return {**JOBS[key],'id':key},202
  JOBS[key]={'id':key,'status':'queued','digest':payload.get('sourceId'),'created':time.time(),'kind':'expression','label':'演奏表情分析'}
 request=CACHE/(key+'.input.json');write_json(request,payload);POOL.submit(run,key,request,result)
 return {'id':key,'status':'queued'},202
def run(key,request,result):
 from idle_runtime import checkpoint
 checkpoint()
 with LOCK:JOBS[key]['status']='running'
 write_json(CACHE/(key+'.state.json'),JOBS[key])
 try:
  from idle_runtime import busy
  with (CACHE/(key+'.log')).open('w',encoding='utf-8') as log:
   process=subprocess.Popen([str(PYTHON),str(ROOT/'scripts/render-performance.py'),str(request),str(result)],stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW|subprocess.BELOW_NORMAL_PRIORITY_CLASS)
   elapsed=0;last=time.monotonic()
   while process.poll() is None:
    time.sleep(.5);now=time.monotonic()
    if not busy():elapsed+=now-last
    last=now
    if elapsed>1800:process.kill();process.wait();raise TimeoutError('表情生成超时')
   if process.returncode:raise RuntimeError('表情模型异常退出')
  with LOCK:JOBS[key]['status']='complete'
 except Exception as e:
  with LOCK:JOBS[key].update(status='failed',error='模型未完成生成，原演奏已保留；详情见服务日志')
 finally:
  write_json(CACHE/(key+'.state.json'),JOBS[key])
def status(key):
 if len(key)!=64 or any(c not in '0123456789abcdef' for c in key):return {'status':'failed','error':'无效任务'}
 with LOCK:job=JOBS.get(key,{'id':key,'status':'missing'}).copy()
 result=CACHE/(key+'.json');progress=CACHE/(key+'.progress.json')
 if result.exists():job.update(status='complete',result=json.loads(result.read_text()))
 elif progress.exists():
  try:job.update(json.loads(progress.read_text()))
  except ValueError:pass
 return job
