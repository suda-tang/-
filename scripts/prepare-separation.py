"""Provision verified model assets separately from user upload requests."""
import sys
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
PERFORMANCE_PACKAGES=ROOT/'.sites-runtime'/'performance-env'/'Lib'/'site-packages'
if PERFORMANCE_PACKAGES.exists():sys.path.insert(0,str(PERFORMANCE_PACKAGES))
sys.path[:0]=[str(ROOT),str(ROOT/'.sites-runtime/transcription-vendor')]
from bs_roformer import DEFAULT_MODEL,ensure_model_assets
weights,config=ensure_model_assets(DEFAULT_MODEL,models_dir=ROOT/'.sites-runtime/separation-models')
if not weights.is_file() or weights.stat().st_size < 100*1024*1024:
    raise RuntimeError(f'invalid model checkpoint: {weights}')
ready=ROOT/'.sites-runtime'/'separation-ready.json'
ready.write_text(json.dumps({'model':DEFAULT_MODEL,'weights':str(weights),'config':str(config),'runtime':'performance-env','status':'ready'},ensure_ascii=False),encoding='utf-8')
print(ready)
