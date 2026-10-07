"""Sequential CPU queue for the three currently available mentor audio chapters."""
import json, subprocess, sys, time, hashlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.sites-runtime/avatar-render'
WORK.mkdir(parents=True,exist_ok=True)
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
for chapter in ('mentor-preface','mentor-context','mentor-material'):
 manifest=json.loads((ROOT/'dist/narration/avatar-manifest.json').read_text(encoding='utf-8'))
 ready=next((c for c in manifest['chapters'] if c['audio']==f'/narration/{chapter}.m4a' and c.get('complete')),None)
 digest=hashlib.sha256((ROOT/'dist/narration'/(chapter+'.m4a')).read_bytes()).hexdigest()
 if ready and ready.get('audioSha256')==digest and (ROOT/'dist'/ready['video'].lstrip('/')).is_file():
  print(chapter+' 已有完整视频，跳过',flush=True);continue
 print(chapter+' 开始生成',flush=True)
 with (WORK/(chapter+'.out.log')).open('ab') as out,(WORK/(chapter+'.err.log')).open('ab') as err:
  result=subprocess.run([sys.executable,'-u',str(ROOT/'scripts/render-mentor-avatar.py'),'--full','--chapter',chapter],cwd=ROOT,stdout=out,stderr=err)
 if result.returncode:
  print(chapter+f' 生成停止，退出码 {result.returncode}；已保存的帧可续算。',flush=True)
  sys.exit(result.returncode)
 print(chapter+' 已完成',flush=True)
 time.sleep(2)
