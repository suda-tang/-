"""Publish the mentor report only once every new recording is finalized."""
import json,time,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'dist/narration'
for attempt in range(14400):
 candidate=out/'tour-voxcpm.json'
 if candidate.exists():
  tracks=json.loads(candidate.read_text(encoding='utf-8'))
  expected=json.loads((out/'mentor-script.revised.json').read_text(encoding='utf-8'))
  if len(tracks)==7 and [t['text'] for t in tracks]==[t['text'] for t in expected] and all((root/'dist'/t['url'].lstrip('/')).is_file() for t in tracks):
   for track in tracks:
    subprocess.run(['C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe','-v','error','-i',str(root/'dist'/track['url'].lstrip('/')),'-f','null','-'],check=True)
   for filename in ['tour.json','mentor-script.json']:
    original=out/filename
    backup=out/(filename+'.before-report')
    if not backup.exists():backup.write_bytes(original.read_bytes())
   tmp=out/'tour.publish.tmp';tmp.write_text(json.dumps(tracks,ensure_ascii=False),encoding='utf-8');tmp.replace(out/'tour.json')
   subprocess.run(['C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe',str(root/'scripts/build-mentor-track-list128.cjs')],cwd=root,check=True)
   (out/'mentor-script.json').write_bytes((out/'mentor-script.revised.json').read_bytes())
   (out/'report-publication.json').write_text(json.dumps({'status':'published','chapters':7,'time':time.time()}),encoding='utf-8')
   break
 time.sleep(10)
