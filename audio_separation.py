"""Local six-stem preview, explicit consent and cached piano extraction."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parent
# Reuse the CPU PyTorch runtime already installed for expressive performance
# analysis.  Keeping one shared runtime avoids a second 240 MB download.
import sys
PERFORMANCE_PACKAGES=ROOT/'.sites-runtime'/'performance-env'/'Lib'/'site-packages'
if PERFORMANCE_PACKAGES.exists():sys.path.insert(0,str(PERFORMANCE_PACKAGES))

def piano_input(samples,rate,cache,key,choice,progress):
 if choice=='original':return samples,False
 import numpy as np
 if choice=='separate' and len(samples)/max(rate,1)>300:
  raise RuntimeError('当前服务端为 CPU 模式，长音视频分离预计耗时过长；请先选择“直接转录”，或将音视频裁剪到 5 分钟以内后再分离')
 # Automatic inspection must stay interactive on CPU-only hosts.  The
 # BS-RoFormer separator can take hours for a long recording (and reports
 # 5% for the whole duration), so never start it merely to decide whether
 # to ask the user.  Explicit "separate" still uses the cached model below.
 if choice!='separate':
  progress(5,'音轨检查完成，可直接转录；需要分离时请手动选择')
  write_json(cache/(key+'.audio-analysis.json'),{'suspectedMixture':False,'model':'deferred'})
  return samples,False
 import torch,soundfile as sf,yaml
 from ml_collections import ConfigDict
 from bs_roformer import DEFAULT_MODEL,ensure_model_assets,get_model_from_config,demix_track
 from bs_roformer.inference import SafeLoaderWithTuple
 from idle_runtime import checkpoint
 from storage import write_json
 target=cache/(key+'.piano.wav');analysis=cache/(key+'.audio-analysis.json')
 if target.exists():return sf.read(target,dtype='float32')[0],False
 if analysis.exists() and choice!='separate':
  known=json.loads(analysis.read_text(encoding='utf-8'))
  return samples,bool(known.get('suspectedMixture'))
 progress(3,'载入音轨分离模型')
 weights,config_path=ensure_model_assets(DEFAULT_MODEL,models_dir=ROOT/'.sites-runtime/separation-models',download_missing=False)
 with open(config_path,encoding='utf-8') as handle:config=ConfigDict(yaml.load(handle,Loader=SafeLoaderWithTuple))
 config.model.flash_attn=False
 model=get_model_from_config('bs_roformer',config)
 model.load_state_dict(torch.load(weights,map_location='cpu',weights_only=True));model.eval()
 config.inference.num_overlap=2
 def split(audio):
  checkpoint();wave=torch.from_numpy(np.stack([audio,audio])).float()
  def before_chunk(module,args):checkpoint()
  hook=model.register_forward_pre_hook(before_chunk)
  try:
   with torch.inference_mode():result,_=demix_track(config,model,wave,torch.device('cpu'))
  finally:hook.remove()
  return result
 if choice!='separate':
  progress(4,'检查音轨是否含其他乐器')
  # Sample the energetic region, avoiding silent introductions.
  size=min(len(samples),rate*8);starts=range(0,max(1,len(samples)-size+1),max(1,rate*8))
  start=max(starts,key=lambda i:float(np.mean(samples[i:i+size]**2)))
  stems=split(samples[start:start+size]);energies={name:float(np.mean(value**2)) for name,value in stems.items()}
  total=sum(energies.values());ratio=1-energies.get('piano',0)/max(total,1e-12)
  mixed=ratio>.35 and total>1e-7
  write_json(analysis,{'suspectedMixture':mixed,'nonPianoRatio':ratio,'model':DEFAULT_MODEL})
  if mixed:return samples,True
  return samples,False
 progress(5,'分离钢琴音轨')
 stems=split(samples)
 if 'piano' not in stems:raise ValueError('分离模型没有输出钢琴声部')
 piano=np.mean(stems['piano'],axis=0).astype(np.float32)
 sf.write(target,piano,rate,subtype='FLOAT')
 return piano,False
