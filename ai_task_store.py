"""Persist assistant requests and their actual execution results."""
import json,re,threading,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from storage import write_json
PATH=Path(__file__).resolve().parent/'.sites-runtime/ai-tasks.json'
LOCK=threading.Lock()
IDENT=re.compile(r'ai-[a-zA-Z0-9-]{8,80}')
# 僵尸任务：浏览器关掉/页面崩了的时候 finally 不会执行，taskReport({status:'complete'})
# 永远发不出来，那条任务就永远挂在「进行中」（测试报告 #8，实测积了 8 条）。
# 后端兜一道：超过 STALE_MS 没有再收到更新，就自己判失败。
STALE_MS=10*60*1000
STALE_DETAIL='中断：超过 10 分钟没有收到完成回报（多半是页面被关闭或网络断开）。'
def read():
 try:return json.loads(PATH.read_text(encoding='utf8'))
 except (OSError,ValueError):return []
def sweep(items):
 """把长时间没更新的 running/queued 判为失败。返回 (新列表, 是否改动过)。"""
 now=time.time()*1000;changed=False
 for item in items:
  if item.get('status') not in ('running','queued'):continue
  try:age=now-float(item.get('updated') or 0)
  except (TypeError,ValueError):age=STALE_MS
  if age<=STALE_MS:continue
  item['status']='failed';item['detail']=STALE_DETAIL
  # updated 故意不动：那是「最后一次真的收到回报」的时刻，改了就把中断时间点抹掉了。
  changed=True
 return items,changed
def requested_id(handler):
    """任务编号既接受请求体里的 {"id": ...}，也接受 ?id=... —— 删一条记录不该强迫调用方发 body。"""
    try:
        n=int(handler.headers.get('Content-Length','0') or 0)
        if n>0:return str(json.loads(handler.rfile.read(n)).get('id',''))
    except (ValueError,TypeError):pass
    return (parse_qs(urlparse(getattr(handler,'path','') or '').query).get('id') or [''])[0]
def handle(handler):
 with LOCK:
  items=read()
  # 每次读写都顺手扫一遍僵尸任务 —— 前端打开任务中心时会 GET，那时就会看到它们已判失败。
  items,changed=sweep(items)
  if changed:
   PATH.parent.mkdir(parents=True,exist_ok=True);write_json(PATH,items)
  if handler.command=='GET':return handler.json_response({'tasks':items})
  # 误产生的任务记录以前只能改状态、不能清除（测试报告 #16）。
  if handler.command=='DELETE':
   ident=requested_id(handler)
   if not IDENT.fullmatch(ident):return handler.json_response({'error':'任务编号无效'},400)
   remaining=[x for x in items if x.get('id')!=ident]
   if len(remaining)==len(items):return handler.json_response({'error':'没有找到这个任务'},404)
   write_json(PATH,remaining)
   return handler.json_response({'deleted':ident,'remaining':len(remaining)})
  try:
   n=int(handler.headers.get('Content-Length','0'))
   if not 0<n<=80000:raise ValueError('任务内容过长')
   item=json.loads(handler.rfile.read(n));ident=str(item.get('id',''))
   if not IDENT.fullmatch(ident):raise ValueError('任务编号无效')
   if item.get('status') not in ('running','complete','failed','queued','cancelled'):raise ValueError('任务状态无效')
   previous=next((x for x in items if x['id']==ident),{})
   entry={**previous,**{k:item[k] for k in ('id','label','detail','status','progress','created','result') if k in item},'kind':'ai','updated':time.time()*1000}
   for key,limit in [('label',500),('detail',1000),('result',30000)]:entry[key]=str(entry.get(key,''))[:limit]
   items=[x for x in items if x['id']!=ident]+[entry]
   PATH.parent.mkdir(parents=True,exist_ok=True);write_json(PATH,items[-200:])
   return handler.json_response(entry)
  except Exception as e:return handler.json_response({'error':str(e)},400)
