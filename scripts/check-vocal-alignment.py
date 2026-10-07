import sys,tempfile,wave,random
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import numpy as np
from vocal_alignment import analyze
rng=random.Random(31);sr=11025;notes=[];samples=[np.zeros(round(sr*1.2))]
for i in range(80):
    pitch=rng.choice([60,62,64,65,67,69,71,72]);duration=rng.choice([.4,.6,.8]);t=np.arange(round(sr*duration))/sr
    envelope=np.minimum(1,t*100)*np.minimum(1,(duration-t)*100);samples.append(np.sin(2*np.pi*440*2**((pitch-69)/12)*t)*envelope*.3)
    step=['C','C','D','D','E','F','F','G','G','A','A','B'][pitch%12];notes.append(f'<measure implicit="yes"><note><pitch><step>{step}</step><octave>{pitch//12-1}</octave></pitch><duration>{int(duration*200)}</duration></note></measure>')
xml='<score-partwise><part id="P1"><measure implicit="yes"><attributes><divisions>100</divisions></attributes><direction><sound tempo="120"/></direction></measure>'+''.join(notes)+'</part></score-partwise>'
with tempfile.TemporaryDirectory() as folder:
    path=Path(folder)/'test.wav'
    with wave.open(str(path),'wb') as f:f.setparams((1,2,sr,0,'NONE','not compressed'));f.writeframes((np.concatenate(samples)*32767).astype('<i2').tobytes())
    result=analyze(path,xml);print(result);assert result['status']=='matched',result;assert abs(result['offsetSeconds']-1.2)<.21;assert abs(result['timeScale']-1)<.006
