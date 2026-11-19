"""CPU acoustic LoRA pilot; writes real optimizer-updated candidate weights, never publishes automatically."""
import json,time,random,hashlib
from pathlib import Path
import numpy as np,soundfile as sf,torch
from voxcpm.model.voxcpm import VoxCPMModel,LoRAConfig
from voxcpm.training.data import BatchProcessor,HFVoxCPMDataset
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'.sites-runtime/voice-reference/voxcpm-all-materials';OUT=ROOT/'.sites-runtime/voice-reference/training/voxcpm-mentor-lora-v1';OUT.mkdir(parents=True,exist_ok=True)
state={}
def report(**d):
 state.update(d,updated=time.time());(OUT/'progress.json').write_text(json.dumps(state,ensure_ascii=False),encoding='utf-8');print(json.dumps(state,ensure_ascii=False),flush=True)
def main():
 torch.set_num_threads(4);torch.manual_seed(42);random.seed(42)
 rows=[];rejected=[]
 for p in sorted(DATA.glob('*.transcript.json')):
  source=p.name.split('.')[0];wav,sr=sf.read(DATA/(source+'.wav'),dtype='float32')
  for k,r in enumerate(json.loads(p.read_text(encoding='utf-8'))):
   seconds=r['end']-r['start']
   if not 1.5<=seconds<=8 or r['logprob']<-.65 or r['noSpeech']>.3 or len(r['text'].strip())<5:
    rejected.append(dict(source=source,index=k,reason='duration or ASR confidence'));continue
   a=wav[int(r['start']*sr):int(r['end']*sr)]
   if len(a)==0 or np.max(np.abs(a))>.999 or np.sqrt(np.mean(a*a))<.008:continue
   rows.append(dict(source=source,start=r['start'],end=r['end'],text=r['text'],audio=a))
 if len(rows)<8:raise RuntimeError('Insufficient usable automatic transcripts for a training pilot')
 # Hold out a contiguous recording region to avoid adjacent-context leakage.
 validation=[r for r in rows if r['source'].startswith('62eb') and r['start']<45]
 train=[r for r in rows if r not in validation] if False else [r for r in rows if not(r['source'].startswith('62eb') and r['start']<45)]
 manifest=dict(scope='acoustic DiT LoRA pilot; automatic transcripts not human verified',train=[{k:v for k,v in r.items() if k!='audio'} for r in train],validation=[{k:v for k,v in r.items() if k!='audio'} for r in validation],rejected=rejected)
 (OUT/'dataset.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 report(status='loading',trainSamples=len(train),validationSamples=len(validation),trainSeconds=sum(r['end']-r['start'] for r in train))
 cfg=LoRAConfig(enable_lm=False,enable_dit=True,enable_proj=False,r=4,alpha=8)
 model=VoxCPMModel.from_local('D:/PianoCoachRuntime/voxcpm/model-0.5b',training=True,optimize=False,device='cpu',lora_config=cfg);model.config.dtype='float32';model.float();model.train()
 processor=BatchProcessor(config=model.config,audio_vae=model.audio_vae,dataset_cnt=1,device=torch.device('cpu'))
 params=[p for p in model.parameters() if p.requires_grad];report(trainableParameters=sum(p.numel() for p in params))
 optimizer=torch.optim.AdamW(params,lr=1e-5)
 def batch(row):
  ids=model.text_tokenizer(row['text'])
  raw=HFVoxCPMDataset.collate_fn([dict(text_ids=ids,audio_array=row['audio'],audio_sampling_rate=16000,dataset_id=0,is_prompt=False)])
  return processor(raw)
 def loss(row):
  b=batch(row);result=model(**{k:b[k] for k in ['text_tokens','text_mask','audio_feats','audio_mask','loss_mask','position_ids','labels']});return sum(v for k,v in result.items() if k.startswith('loss/'))
 model.eval()
 with torch.no_grad():baseline=float(torch.stack([loss(r) for r in validation[:3]]).mean()) if validation else None
 report(status='training',baselineValidationLoss=baseline,step=0,totalSteps=len(train))
 model.train();before={n:p.detach().clone() for n,p in model.named_parameters() if p.requires_grad}
 random.shuffle(train)
 for i,row in enumerate(train):
  started=time.time();optimizer.zero_grad(set_to_none=True);v=loss(row)
  if not torch.isfinite(v):raise RuntimeError('Non-finite loss')
  v.backward();torch.nn.utils.clip_grad_norm_(params,1.0);optimizer.step()
  weights={n:p.detach().cpu() for n,p in model.named_parameters() if p.requires_grad}
  torch.save({'state_dict':weights,'step':i+1,'lora_config':cfg.model_dump()},OUT/'lora_weights.ckpt')
  report(step=i+1,loss=float(v.detach()),stepSeconds=time.time()-started,source=row['source'])
 model.eval()
 with torch.no_grad():after=float(torch.stack([loss(r) for r in validation[:3]]).mean()) if validation else None
 delta=sum(float((p.detach()-before[n]).abs().sum()) for n,p in model.named_parameters() if p.requires_grad)
 (OUT/'lora_config.json').write_text(json.dumps(cfg.model_dump()),encoding='utf-8')
 report(status='complete',validationLoss=after,weightAbsoluteDelta=delta,production=False)
if __name__=='__main__':
 try:main()
 except Exception as e:report(status='failed',error=str(e));raise
