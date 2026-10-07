"""Prepare private, reviewable utterances; never pretend unverified ASR is truth."""
import json,hashlib
from pathlib import Path
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parents[1]
STORE=ROOT/'.sites-runtime/voice-reference'
OUT=STORE/'training/mentor-full-v1';OUT.mkdir(parents=True,exist_ok=True)
rows=[];sources=[];seen=set()
for meta in sorted(STORE.glob('*.json')):
    info=json.loads(meta.read_text(encoding='utf-8'))
    if info.get('role')!='mentor' or not info.get('consent',{}).get('confirmed'):continue
    source=STORE/'processed'/info['id']/'reference-clean.wav'
    audio,sr=sf.read(source,dtype='float32');audio=audio.mean(1) if audio.ndim>1 else audio
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    if digest in seen:continue
    seen.add(digest);sources.append({'id':info['id'],'seconds':len(audio)/sr,'sha256':digest})
    hop=round(sr*.02);count=len(audio)//hop
    rms=np.sqrt(np.mean(audio[:count*hop].reshape(count,hop)**2,axis=1))
    threshold=min(.025,max(.004,float(np.percentile(rms,15))*1.5))
    silence=rms<threshold;boundaries=[0];i=0
    while i<count:
        if not silence[i]:i+=1;continue
        begin=i
        while i<count and silence[i]:i+=1
        if i-begin>=18:boundaries.append((begin+i)//2*hop)
    boundaries.append(len(audio));groups=[];start=0
    for end in sorted(set(boundaries[1:])):
        if (end-start)/sr<2 and end<len(audio):continue
        while (end-start)/sr>14:
            # Split continuous speech at the quietest point near the end of
            # a manageable sentence window, rather than fixed 4.5s cuts.
            a=round((start/sr+9)/.02);b=min(count,round((start/sr+13)/.02))
            split=int(a+np.argmin(rms[a:b]))*hop;groups.append((start,split));start=split
        groups.append((start,end));start=end
    for index,(start,end) in enumerate(groups):
        clip=audio[start:end];length=len(clip)/sr
        if length<1.5 or float(np.sqrt(np.mean(clip**2)))<threshold:continue
        # Keep brief lead/trail silence; preserve natural articulation.
        active=np.flatnonzero(np.abs(clip)>.008)
        if not len(active):continue
        a=max(0,int(active[0])-.15*sr);b=min(len(clip),int(active[-1])+.2*sr)
        a=int(a);b=int(b);clip=clip[a:b]
        item={'id':info['id']+'-'+str(index),'sourceId':info['id'],'start':round((start+a)/sr,3),'end':round((start+b)/sr,3),'seconds':round(len(clip)/sr,3),'text':'','textVerified':False,'audioQualityReviewed':False,'review':'需检查背景音乐、口齿、句子完整性及逐字转写'}
        path=OUT/'utterances'/(item['id']+'.wav');path.parent.mkdir(exist_ok=True);sf.write(path,clip,sr,subtype='PCM_16');item['file']=str(path.relative_to(OUT));rows.append(item)
manifest={'sources':sources,'utterances':rows,'candidateSeconds':round(sum(r['seconds'] for r in rows),2),'readyForFullTraining':False,'reason':'自动筛选仅排除静音并按停顿分段，不等于已通过听审；完整文本模型微调需逐段核对文字。'}
(OUT/'utterances.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'sources':len(sources),'utterances':len(rows),'candidateSeconds':manifest['candidateSeconds'],'readyForFullTraining':False},ensure_ascii=False))
