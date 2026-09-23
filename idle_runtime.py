"""Shared cooperative foreground priority, including inference subprocesses."""
import time
from pathlib import Path
from storage import write_json
import json
STATE=Path(__file__).resolve().parent/'.sites-runtime/foreground.json'

def touch(owner='',activity='页面操作'):
 STATE.parent.mkdir(exist_ok=True)
 write_json(STATE,{'until':time.time()+12,'owner':str(owner).strip()[:120],'activity':str(activity).strip()[:40]},optional=True)

def foreground():
 try:
  value=json.loads(STATE.read_text())
  return value if float(value.get('until',0))>time.time() else {}
 except (OSError,ValueError,TypeError):return {}

def busy():return bool(foreground())

def checkpoint():
 # Foreground state is retained for the task-center display only.  Expensive
 # recognition and generation must continue while the user browses or plays.
 return None
