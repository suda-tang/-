from pathlib import Path
import ast,json
root=Path(__file__).resolve().parents[1]
for name,a,b in [('server.py',350,378),('server.py',472,612),('music_index.py',246,364),('jianpu.py',1,120),('audio_separation.py',1,95),('media_import.py',1,90)]:
 p=root/name
 print('\nFILE',name)
 print('\n'.join(f'{i+1}: {s}' for i,s in enumerate(p.read_text(encoding='utf-8-sig').splitlines()) if a<=i+1<=b))
for p in (root/'.sites-runtime/voice-reference/training').glob('*/progress.json'):
 try:
  d=json.loads(p.read_text(encoding='utf-8'));print('TRAINING',p.parent.name,{k:v for k,v in d.items() if k in ['status','step','totalSteps','trainSamples','validationSamples','trainSeconds','validationLoss','production','weightAbsoluteDelta']})
 except Exception:pass
