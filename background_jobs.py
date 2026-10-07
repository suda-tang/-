"""Persistent, low-priority cloud processing queue. No browser session is required."""
import hashlib,json,sqlite3,threading,time,subprocess,os,shutil
from pathlib import Path
from storage import write_json
from idle_runtime import foreground as foreground_state,checkpoint
ROOT=Path(__file__).resolve().parent;RUNTIME=ROOT/'.sites-runtime';DB=RUNTIME/'processing.sqlite3';CACHE=RUNTIME/'score-cache';ARTIFACTS=RUNTIME/'analysis';_thread=None
KINDS={'metadata':'标题校验与封面','expression':'演奏表情分析','pdf':'PDF 后台预览','arrangement':'配器与鼓伴奏','transcription':'音视频转录','photos':'照片整理与识谱'}

class QueueConnection(sqlite3.Connection):
 def __exit__(self,*args):
  try:return super().__exit__(*args)
  finally:self.close()
def connection():
 RUNTIME.mkdir(exist_ok=True);db=sqlite3.connect(DB,timeout=15,factory=QueueConnection);db.row_factory=sqlite3.Row;db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY,digest TEXT,kind TEXT,version TEXT,params TEXT,status TEXT,progress REAL,detail TEXT,created REAL,updated REAL,priority INTEGER,result TEXT)');return db
def enqueue(digest,kind,version,params=None,priority=20):
 params=params or {};key=hashlib.sha256(json.dumps([digest,kind,version,params],sort_keys=True).encode()).hexdigest()
 with connection() as db:db.execute('INSERT OR IGNORE INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',(key,digest,kind,version,json.dumps(params),'queued',0,'等待空闲处理',time.time(),time.time(),priority,None))
 return key
def update(key,**fields):
 fields['updated']=time.time()
 with connection() as db:db.execute('UPDATE jobs SET '+','.join(k+'=?' for k in fields)+' WHERE id=?',list(fields.values())+[key])
def friendly_error(kind,error):
 raw=str(error)
 if kind=='expression' and ('inspect-score' in raw or 'returned non-zero exit status' in raw or 'Command [' in raw):
  return '解析节奏与声部时后台分析器异常退出。原谱和电子谱已保留，可在任务中心重试表情分析。'
 if kind=='expression' and 'timeout' in raw.lower():
  return '解析节奏与声部超时。任务已停止，不会阻塞其他曲谱；可在任务中心重新处理。'
 return raw[:300] or '后台任务未完成，请稍后重试。'

def prioritize(key):
 """Move a waiting job to the front without discarding a running inference."""
 with connection() as db:
  db.execute('BEGIN IMMEDIATE')
  row=db.execute('SELECT status FROM jobs WHERE id=?',(key,)).fetchone()
  if not row:raise ValueError('任务不存在')
  if row['status'] not in ('queued','failed','needs_review'):raise ValueError('只能调整等待或未完成的任务；正在处理的分段会先完成')
  minimum=db.execute("SELECT MIN(priority) FROM jobs WHERE status='queued'").fetchone()[0] or 0
  db.execute("UPDATE jobs SET status='queued',priority=?,detail='已设为下一项，当前任务完成后开始',updated=? WHERE id=?",(minimum-1,time.time(),key))

def score_title(digest):
 if not digest:return '未关联曲谱'
 meta={}
 for suffix in ('.json','.metadata.json'):
  try:
   data=json.loads((CACHE/(digest+suffix)).read_text(encoding='utf-8'));meta.update(data.get('metadata',{}) if suffix=='.json' else data)
  except (OSError,ValueError):pass
 title=meta.get('userTitle') or meta.get('ocrTitle') or meta.get('title')
 if title:return title
 from title_validation import filename_title
 try:return filename_title((CACHE/(digest+'.name')).read_text(encoding='utf-8'))
 except OSError:return '待校对曲谱 '+digest[:8]
def tasks():
 foreground=foreground_state()
 now=time.time()
 with connection() as db:
  # A worker can be interrupted by a process crash.  Keep the row visible and
  # turn it into an actionable message instead of leaving an orphaned 38%.
  stale=db.execute("SELECT id,kind,detail,updated FROM jobs WHERE status='running' AND ?-updated>180",(now,)).fetchall()
  for row in stale:
   stage=row['detail'] or KINDS.get(row['kind'],'处理')
   db.execute("UPDATE jobs SET status='failed',detail=?,updated=? WHERE id=?",(f"任务停在“{stage}”超过 3 分钟，后台进程可能已中断；可在任务中心重新处理。",now,row['id']))
  rows=db.execute("SELECT * FROM jobs ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,updated DESC LIMIT 120").fetchall()
 result=[]
 for row in rows:
  item=dict(row);title=''
  try:
   meta=json.loads((CACHE/(item['digest']+'.metadata.json')).read_text(encoding='utf-8'));title=meta.get('userTitle') or meta.get('ocrTitle') or meta.get('title') or ''
  except (OSError,ValueError):pass
  item['scoreTitle']=score_title(item['digest']);item['label']=item['scoreTitle']+'　'+KINDS.get(item['kind'],item['kind'])
  if item['status']=='failed' and ('inspect-score' in (item['detail'] or '') or 'Command [' in (item['detail'] or '')):
   item['detail']=friendly_error(item['kind'],item['detail'])
  item['canPrioritize']=item['status']=='queued'
  # Browser interaction is informational only.  It must never gate this
  # persistent worker: queued work continues while a score is being viewed.
  item['stage']=item['detail']
  if foreground:item['foregroundOwner']=foreground.get('owner','')
  result.append(item)
 return result
def latest_for_digest(digest):
 """Expose background work in the library, not only in the task centre."""
 with connection() as db:
  row=db.execute("SELECT * FROM jobs WHERE digest=? AND status IN ('running','queued','failed','needs_review') ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,updated DESC LIMIT 1",(digest,)).fetchone()
 item=dict(row) if row else None
 if item and item['status']=='failed' and ('inspect-score' in (item.get('detail') or '') or 'Command [' in (item.get('detail') or '')):
  item['detail']=friendly_error(item['kind'],item['detail'])
 return item
def latest_jobs_by_digest():
 """一次性返回每个 digest 的最新后台任务，供曲库列表批量使用。

 曲库列表原来对每首都调一次 latest_for_digest（每次重开 SQLite 连接），80 首就要
 2~3s。这里只开一次连接、一次查询，再在内存里按 (状态优先级, updated) 取每 digest 最新。
 """
 with connection() as db:
  rows=db.execute("SELECT * FROM jobs WHERE status IN ('running','queued','failed','needs_review')").fetchall()
 def prio(s):return 0 if s=='running' else (1 if s=='queued' else 2)
 result={}
 for row in rows:
  item=dict(row);d=item['digest'];cur=result.get(d)
  if cur is None or (prio(item['status']),item['updated'])>(prio(cur['status']),cur['updated']):
   result[d]=item
 for item in result.values():
  if item['status']=='failed' and ('inspect-score' in (item.get('detail') or '') or 'Command [' in (item.get('detail') or '')):
   item['detail']=friendly_error(item['kind'],item['detail'])
 return result
def inspect(digest,xml='',ocr=False):
 ARTIFACTS.mkdir(exist_ok=True);request=ARTIFACTS/(digest+'.inspect-input.json');output=ARTIFACTS/(digest+'.inspect.json');write_json(request,{'digest':digest,'xml':xml,'ocr':ocr})
 node=shutil.which('node') or str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
 if not Path(node).is_file():raise RuntimeError('后台解析运行环境缺失：Node.js')
 subprocess.run([node,str(ROOT/'scripts/inspect-score.cjs'),str(request),str(output)],check=True,timeout=180,cwd=ROOT,creationflags=(subprocess.CREATE_NO_WINDOW|subprocess.BELOW_NORMAL_PRIORITY_CLASS) if os.name=='nt' else 0)
 return json.loads(output.read_text(encoding='utf-8'))
def run_job(job,server):
 checkpoint()
 key=job['id'];digest=job['digest'];kind=job['kind'];cached=server.read_cached_score(digest) or {};meta=cached.get('metadata',{});version=hashlib.sha256(cached.get('xml','').encode()).hexdigest()
 if kind in ('transcription','photos'):
  import media_import
  result=media_import.run(job,server,lambda value,detail:update(key,progress=value,detail=detail))
  update(key,result=json.dumps(result))
  if result.get('needsChoice'):
   update(key,status='needs_review',detail=result.get('detail','等待选择转录方式'));return
 elif kind=='metadata':
  force=bool(json.loads(job.get('params') or '{}').get('force'))
  if meta.get('userTitle') and not force:
   from song_cover import lookup
   artwork=lookup(meta['userTitle'],CACHE)
   if artwork.get('artwork'):
    meta['cover']=artwork['artwork'];write_json(CACHE/(digest+'.metadata.json'),meta)
   update(key,status='complete',progress=100,detail='沿用已设置曲名');return
  from title_validation import check
  update(key,detail='读取原谱标题区域',progress=5)
  try:data=inspect(digest,ocr=True) if (CACHE/(digest+'.pdf')).exists() else {}
  except Exception:data={}
  name_path=CACHE/(digest+'.name');filename=name_path.read_text(encoding='utf-8') if name_path.exists() else ''
  write_json(ARTIFACTS/(digest+'.ocr.json'),data.get('metadata',{}));update(key,detail='核验标题与封面',progress=65);verified=check({**data.get('metadata',{}),'filename':filename},CACHE)
  if not verified.get('cover'):
   from song_cover import lookup
   from title_validation import filename_title
   for candidate in dict.fromkeys([verified.get('title'),meta.get('title'),filename_title(filename)]):
    if not candidate:continue
    artwork=lookup(candidate,CACHE)
    if artwork.get('artwork'):
     verified['cover']=artwork['artwork'];break
  if not verified.get('title'):update(key,status='needs_review',progress=100,detail='标题证据不足，保留待校验状态');return
  existing=({key:value for key,value in meta.items() if key!='userTitle'} if force else dict(meta));existing={**existing,**verified};write_json(CACHE/(digest+'.metadata.json'),existing)
  if cached.get('xml'):server.write_cached_score(digest,cached['xml'],existing)
 elif kind=='expression':
  import performance_service
  if not cached.get('xml'):raise ValueError('尚未完成识谱')
  update(key,detail='读取节奏与声部',progress=1);data=inspect(digest,xml=cached['xml']);write_json(ARTIFACTS/(digest+'.score.json'),{'xmlHash':version,**data['score']})
  payload={'sourceId':digest,'bpm':data['score']['tempo'],'events':[{'beat':e['beat'],'notes':[{'midi':n['midi'],'duration':n['duration']} for n in e['notes']]} for e in data['score']['events']]}
  result,code=performance_service.start(payload)
  if code>=400:raise ValueError(result.get('error','模型不可用'))
  while result['status'] in ('running','queued'):
   update(key,detail='生成演奏表情',progress=result.get('progress',2));time.sleep(1);result=performance_service.status(result['id'])
  if result['status']!='complete':raise ValueError(result.get('error','模型未完成'))
  write_json(ARTIFACTS/(digest+'.performance.json'),{'xmlHash':version,'cacheKey':result['id']})
 elif kind=='pdf':
  import fitz
  with fitz.open(CACHE/(digest+'.pdf')) as doc:
   for i,page in enumerate(doc):
    checkpoint()
    target=CACHE/f'{digest}.page{i+1}.png'
    if not target.exists():
     scale=min(2.2,max(1.2,1600/max(page.rect.width,page.rect.height)));temp=target.with_suffix('.rendering');temp.write_bytes(page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False).tobytes('png'));temp.replace(target)
    update(key,detail=f'预览 {i+1} / {len(doc)} 页',progress=(i+1)/len(doc)*100)
 elif kind=='arrangement':
  import arrangement_service
  result=arrangement_service.generate(digest,json.loads(job['params']),lambda p,t:update(key,progress=p,detail=t),server)
  update(key,result=json.dumps(result))
 update(key,status='complete',progress=100,detail='已完成，结果已缓存')
def scan(server):
 for pdf in CACHE.glob('*.pdf'):
  digest=pdf.stem
  if len(digest)!=64:continue
  cached=server.read_cached_score(digest) or {};meta=cached.get('metadata',{})
  if meta.get('hiddenFromLibrary'):continue
  if not cached.get('xml'):
   with server.LOCK:existing=any(j.get('digest')==digest for j in server.JOBS.values())
   if not existing and server.audiveris_path():server.enqueue_recognition(pdf.read_bytes(),digest)
  if meta.get('sourceType') not in ('audio','video') and (not meta.get('cover') or (meta.get('titleSource')!='user' and str(meta.get('titleVersion'))!='7')):enqueue(digest,'metadata','title-cover-9',priority=10)
  enqueue(digest,'pdf','1',priority=40)
  if cached.get('xml'):
   xmlhash=hashlib.sha256(cached['xml'].encode()).hexdigest();enqueue(digest,'expression','2:'+xmlhash,priority=30)
def start(server):
 global _thread
 if _thread and _thread.is_alive():return
 with connection() as db:
  db.execute("UPDATE jobs SET status='queued',detail='服务重启，等待继续' WHERE status='running'")
  db.execute("UPDATE jobs SET status='queued',detail='运行环境已修复，等待重试' WHERE status='failed' AND detail LIKE '[WinError 2]%'")
 def work():
  last_scan=0
  while True:
   try:
    if time.time()-last_scan>45:scan(server);last_scan=time.time()
    with server.LOCK:busy=any(j.get('status') in ('running','queued') for j in server.JOBS.values())
    import performance_service
    with performance_service.LOCK:busy=busy or any(j['status'] in ('running','queued') for j in performance_service.JOBS.values())
    if not busy:
     with connection() as db:
      row=db.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY priority,created LIMIT 1").fetchone()
      if row:db.execute("UPDATE jobs SET status='running',detail='准备处理' WHERE id=?",(row['id'],))
     if row:
      try:run_job(dict(row),server)
      except Exception as error:update(row['id'],status='failed',detail=friendly_error(row['kind'],error))
   except Exception as error:print('Background queue:',str(error),flush=True)
   time.sleep(2)
 _thread=threading.Thread(target=work,name='cloud-idle-worker',daemon=True);_thread.start()
