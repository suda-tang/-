"""Write the runtime readiness record as soon as an in-progress model download completes."""
import json,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
packages=ROOT/'.sites-runtime'/'performance-env'/'Lib'/'site-packages'
if packages.exists():sys.path.insert(0,str(packages))
sys.path[:0]=[str(ROOT),str(ROOT/'.sites-runtime/transcription-vendor')]
from bs_roformer import DEFAULT_MODEL,ensure_model_assets
models=ROOT/'.sites-runtime/separation-models'
while True:
 try:
  weights,config=ensure_model_assets(DEFAULT_MODEL,models_dir=models,download_missing=False)
  if not weights.is_file() or weights.stat().st_size < 100*1024*1024: raise RuntimeError('checkpoint incomplete')
  record={'model':DEFAULT_MODEL,'weights':str(weights),'config':str(config),'runtime':'performance-env','status':'ready'}
  (ROOT/'.sites-runtime/separation-ready.json').write_text(json.dumps(record,ensure_ascii=False),encoding='utf-8')
  print('ready',flush=True)
  break
 except Exception:
  time.sleep(12)
