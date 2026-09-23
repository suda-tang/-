"""Durable JSON writes tolerant of Windows readers briefly holding the destination."""
import json,os,time,uuid
from pathlib import Path
def write_json(path,value,optional=False):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8')
 try:
  for attempt in range(8):
   try:os.replace(tmp,path);return True
   except PermissionError:
    if optional:return False
    time.sleep(.025*(attempt+1))
  if not optional:raise OSError('无法保存任务结果：'+str(path))
 finally:tmp.unlink(missing_ok=True)
 return False
