import json,time,requests,subprocess
from pathlib import Path
ROOT=Path(r'C:/Users/mail/Documents/ChatGPT/自动钢琴陪练系统');OUT=ROOT/'output/audio/mentor-v4-release-20261026';URL='http://127.0.0.1:5173/api/mentor-greeting';result=None
for _ in range(50):
 r=requests.get(URL,params={'name':'访客','avatar':'cartoon'},timeout=12);r.raise_for_status();result=r.json()
 if result.get('status')=='failed':raise RuntimeError(result.get('error'))
 if result.get('url'):break
 time.sleep(1)
else:raise RuntimeError('Greeting still processing after verification deadline')
assert 'mentor-preface.cartoon.eleven-v4-20261027.m4a' in result['bodyUrl'],result
assert result['text'].startswith('访客老师您好。辛苦您专门抽出时间')
assert '我是苏大音乐学院的冒小瑛' not in result['text']
path=ROOT/'dist'/result['url'].split('?')[0].lstrip('/');subprocess.run([r'C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe','-v','error','-i',str(path),'-f','null','-'],check=True)
report={k:result.get(k) for k in ['status','bodyUrl','model','synthesisSeconds']};report['newBodyJoined']=True;report['nameOnlyLightweightModelUnchanged']=True;(OUT/'greeting-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False))
