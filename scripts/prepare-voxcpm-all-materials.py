"""Audit all mentor uploads, transcribe them, build a traceable multi-source reference."""
import json,subprocess,time
from pathlib import Path
import numpy as np,soundfile as sf
from faster_whisper import WhisperModel
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'.sites-runtime/voice-reference';OUT=SRC/'voxcpm-all-materials';OUT.mkdir(exist_ok=True)
FF='C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe'
def status(**x):(OUT/'progress.json').write_text(json.dumps(dict(updated=time.time(),**x),ensure_ascii=False),encoding='utf-8')
try:
 model=WhisperModel('base',device='cpu',compute_type='int8',cpu_threads=4,local_files_only=True)
 sources=[];parts=[];texts=[]
 for meta in sorted(SRC.glob('*.json')):
  d=json.loads(meta.read_text(encoding='utf-8-sig'))
  if d.get('role')!='mentor':continue
  key=d['id'];video=SRC/(key+'.mp4');clean=OUT/(key+'.wav')
  status(stage='preparing',source=key)
  subprocess.run([FF,'-v','error','-y','-i',str(video),'-vn','-ac','1','-ar','16000','-af','highpass=f=90,lowpass=f=7600,afftdn=nf=-25',str(clean)],check=True)
  wav,sr=sf.read(clean,dtype='float32');status(stage='transcribing',source=key,seconds=len(wav)/sr)
  segments,_=model.transcribe(str(clean),language='zh',beam_size=5,vad_filter=True,word_timestamps=True)
  rows=[dict(start=s.start,end=s.end,text=s.text,logprob=s.avg_logprob,noSpeech=s.no_speech_prob) for s in segments]
  (OUT/(key+'.transcript.json')).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
  candidates=[]
  for i in range(len(rows)):
   chosen=[]
   for row in rows[i:]:
    if row['end']-rows[i]['start']>12:break
    chosen.append(row)
   if not chosen:continue
   a=chosen[0]['start'];b=chosen[-1]['end'];piece=wav[int(a*sr):int(b*sr)];text=''.join(r['text'] for r in chosen)
   if not 5<=b-a<=12 or len(text)<15 or not len(piece):continue
   rms=float(np.sqrt(np.mean(piece**2)));clip=float(np.mean(np.abs(piece)>.98));quality=float(np.mean([r['logprob'] for r in chosen]))-float(np.mean([r['noSpeech'] for r in chosen]))-clip*10
   if rms<.008:continue
   candidates.append(dict(start=a,end=b,text=text,quality=quality,rms=rms,clipping=clip))
  if not candidates:raise RuntimeError('No usable speech candidate in '+key)
  best=max(candidates,key=lambda x:x['quality']);piece=wav[int(best['start']*sr):int(best['end']*sr)];peak=np.max(np.abs(piece));piece=piece*(.75/max(.75,peak));parts.extend([piece,np.zeros(int(.18*sr),dtype='float32')]);texts.append(best['text'])
  sources.append(dict(id=key,sourceSeconds=len(wav)/sr,segments=len(rows),selected=best,review='automatic selection; transcript and voice identity need listening verification'))
  status(stage='source_complete',completed=len(sources),source=key)
 reference=OUT/'reference-multisource.wav';sf.write(reference,np.concatenate(parts),16000,subtype='PCM_16')
 profile=dict(mode='multi-source zero-shot conditioning; no weight training',sources=sources,sourceCount=len(sources),sourceSeconds=sum(x['sourceSeconds'] for x in sources),referenceSeconds=sum(len(x) for x in parts)/16000,reference=str(reference),text=''.join(texts))
 (OUT/'profile.json').write_text(json.dumps(profile,ensure_ascii=False,indent=2),encoding='utf-8');status(stage='complete',**{k:profile[k] for k in ['sourceCount','sourceSeconds','referenceSeconds']})
except Exception as e:status(stage='failed',error=str(e));raise
