"""Conservative pitch-class alignment. Never apply an ambiguous match."""
import json, subprocess, xml.etree.ElementTree as ET
import numpy as np

def score_features(xml):
    root=ET.fromstring(xml)
    for node in root.iter():node.tag=node.tag.split('}')[-1]
    notes=[];tempos={0.:80.}
    for part_index,part in enumerate(root.findall('part')):
        start=0.;division=1.;beats=4.;unit=4.
        for measure in part.findall('measure'):
            attributes=measure.find('attributes')
            if attributes is not None:
                division=float(attributes.findtext('divisions',str(division)))
                beats=float(attributes.findtext('time/beats',str(beats)));unit=float(attributes.findtext('time/beat-type',str(unit)))
            cursor=0.;end=0.;last=0.
            for child in measure:
                duration=float(child.findtext('duration','0'))/division
                if child.tag=='backup':cursor-=duration
                elif child.tag=='forward':cursor+=duration;end=max(end,cursor)
                elif child.tag=='direction' and part_index==0:
                    sound=child.find('sound')
                    if sound is not None and sound.get('tempo'):tempos[start+cursor+float(child.findtext('offset','0'))/division]=float(sound.get('tempo'))
                elif child.tag=='note':
                    chord=child.find('chord') is not None;position=last if chord else cursor
                    pitch=child.find('pitch')
                    if pitch is not None and duration>0:
                        midi=(int(pitch.findtext('octave'))+1)*12+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[pitch.findtext('step')]+float(pitch.findtext('alter','0'))
                        notes.append((start+position,duration,int(midi)))
                    if not chord:last=cursor;cursor+=duration
                    end=max(end,position+duration,cursor)
            start+=end if measure.get('implicit')=='yes' else max(end,beats*4/unit)
    changes=sorted(tempos.items())
    def seconds(beat):
        result=0.;last=0.;bpm=changes[0][1]
        for position,value in changes:
            if position>beat:break
            result+=(position-last)*60/bpm;last=position;bpm=value
        return result+(beat-last)*60/bpm
    length=min(180.,max((seconds(t+d) for t,d,p in notes),default=0))
    features=np.zeros((int(length*5)+1,12),dtype=np.float32);highest=np.full(len(features),-1)
    for beat,duration,pitch in notes:
        a=max(0,int(seconds(beat)*5));b=min(len(features),int(seconds(beat+duration)*5))
        # Melody candidates dominate, rather than low accompaniment bass notes.
        for i in range(a,b):
            if pitch>highest[i]:features[i]=0;features[i,pitch%12]=1;highest[i]=pitch
    return features

def analyze(path,xml):
    import imageio_ffmpeg
    result=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-nostdin','-i',str(path),'-t','240','-ac','1','-ar','11025','-f','f32le','pipe:1'],capture_output=True,timeout=90)
    if result.returncode:raise ValueError('人声解码失败')
    audio=np.frombuffer(result.stdout,dtype='<f4');sr=11025;hop=2205;size=4096
    if len(audio)<size:return {'status':'needs_review','reason':'录音太短，无法匹配'}
    frames=np.lib.stride_tricks.sliding_window_view(audio,size)[::hop]
    frequencies=np.fft.rfftfreq(size,1/sr);valid=(frequencies>90)&(frequencies<1400)
    classes=np.rint(69+12*np.log2(frequencies[valid]/440)).astype(int)%12
    chroma=np.zeros((len(frames),12),dtype=np.float32)
    for begin in range(0,len(frames),128):
        spectrum=np.abs(np.fft.rfft(frames[begin:begin+128]*np.hanning(size),axis=1))[:,valid]
        for pitch in range(12):chroma[begin:begin+128,pitch]=spectrum[:,classes==pitch].sum(axis=1)
    norm=np.linalg.norm(chroma,axis=1,keepdims=True);chroma/=np.maximum(norm,1e-8)
    score=score_features(xml);active=np.flatnonzero(score.sum(axis=1)>0)
    if len(active)<100:return {'status':'needs_review','reason':'可用旋律太短，无法可靠匹配'}
    # Skip near-constant/repeated pitch material, which cannot identify an offset.
    active=active[::2];times=active/5.;reference=score[active]
    candidates=[]
    for ratio in np.linspace(.9,1.1,41):
        for offset in np.arange(-40.,40.01,.2):
            index=np.rint((times*ratio+offset-size/(2*sr))*5).astype(int);usable=(index>=0)&(index<len(chroma))
            if usable.mean()<.7:continue
            similarity=float(np.mean(np.sum(reference[usable]*chroma[index[usable]],axis=1)))
            candidates.append((similarity,float(offset),float(ratio)))
    if not candidates:return {'status':'needs_review','reason':'人声与乐谱没有足够的重叠范围'}
    candidates.sort(reverse=True);best=candidates[0]
    alternative=next((c for c in candidates if abs(c[1]-best[1])>2 or abs(c[2]-best[2])>.015),candidates[-1])
    confidence=best[0]-alternative[0]
    accepted=best[0]>.46 and confidence>.035
    return {'status':'matched' if accepted else 'needs_review','offsetSeconds':round(best[1],3),'timeScale':round(best[2],5),'similarity':round(best[0],4),'margin':round(confidence,4),'method':'pitch-class-v1','reason':'' if accepted else '旋律匹配不够明确，保留原时间，不自动移动人声'}
