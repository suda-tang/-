import json,subprocess
from pathlib import Path
import numpy as np
FF='C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe'
def envelope(path):
 data=subprocess.check_output([FF,'-v','error','-i',str(path),'-f','f32le','-ac','1','-ar','16000','-'])
 samples=np.frombuffer(data,dtype=np.float32);frames=[float(np.sqrt(np.mean(samples[i:i+640]**2))) for i in range(0,len(samples),640)];top=max(.01,float(np.percentile(frames,95)));values=[round(min(1,v/top),3) if v>.003 else 0 for v in frames]
 path.with_suffix('.mouth.json').write_text(json.dumps({'fps':25,'values':values}),encoding='utf-8')
if __name__=='__main__':
 import sys
 for name in sys.argv[1:]:envelope(Path(name))
