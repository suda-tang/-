"""Resume mentor manuscript synthesis with VoxCPM on CPU; publish finalized chapters."""
import json,time,hashlib,re,subprocess
from pathlib import Path
import torch,numpy as np,soundfile as sf

# Reference files are PCM WAV; soundfile avoids the optional TorchCodec/FFmpeg DLL chain on Windows.
import torchaudio
def load_pcm(path, frame_offset=0, num_frames=-1, normalize=True, channels_first=True, **kwargs):
 with sf.SoundFile(path) as f:
  rate=f.samplerate
  f.seek(frame_offset)
  data=f.read(frames=num_frames,dtype='float32',always_2d=True)
 tensor=torch.from_numpy(data.T.copy() if channels_first else data.copy())
 return tensor,rate
torchaudio.load=load_pcm

from voxcpm import VoxCPM
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist/narration';WORK=ROOT/'.sites-runtime/voxcpm-report';WORK.mkdir(parents=True,exist_ok=True)
FF='C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe'
def report(**d):(WORK/'progress.json').write_text(json.dumps(dict(updated=time.time(),**d),ensure_ascii=False),encoding='utf-8')
def main():
 torch.set_num_threads(4);report(status='loading')
 model=VoxCPM.from_pretrained('D:/PianoCoachRuntime/voxcpm/model-0.5b',device='cpu',load_denoiser=False,optimize=False,cache_dir='D:/PianoCoachRuntime/voxcpm/models')
 chapters=json.loads((OUT/'mentor-script.revised.json').read_text(encoding='utf-8'));manifest=[]
 ref=ROOT/'.sites-runtime/voice-reference/processed/f922ad0fa273a637876ad1b4d9ddbef3/reference-clip.wav'
 for i,ch in enumerate(chapters):
  sentences=re.findall(r'[^。！？]+[。！？]?',ch['text']);waves=[]
  for j,text in enumerate(sentences):
   digest=hashlib.sha256(text.encode()).hexdigest()[:20];part=WORK/(digest+'.wav')
   report(status='synthesizing',chapter=i+1,totalChapters=len(chapters),sentence=j+1,totalSentences=len(sentences),title=ch['title'])
   if not part.exists():
    wav=model.generate(text=text,prompt_wav_path=str(ref),prompt_text='今年已经是我从教的第二十七个年头了。我一直是在苏州大学从事音乐教育的工作。',inference_timesteps=10,cfg_value=2.0,normalize=False)
    if not np.isfinite(wav).all() or len(wav)<model.tts_model.sample_rate*.3:raise RuntimeError('Invalid audio: '+text)
    sf.write(part,wav,model.tts_model.sample_rate,subtype='PCM_16')
   wav,sr=sf.read(part);waves.append(wav)
  raw=WORK/(ch['id']+'.wav');sf.write(raw,np.concatenate(waves),sr,subtype='PCM_16')
  final=OUT/(ch['id']+'.voxcpm.m4a');tmp=final.with_suffix('.pending.m4a')
  subprocess.run([FF,'-v','error','-y','-i',str(raw),'-c:a','aac','-b:a','128k','-movflags','+faststart',str(tmp)],check=True)
  subprocess.run([FF,'-v','error','-i',str(tmp),'-f','null','-'],check=True);tmp.replace(final)
  manifest.append(dict(id=ch['id'],role='mentor',text=ch['text'],url='/narration/'+final.name))
  (OUT/'tour-voxcpm.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
 report(status='complete',chapters=len(manifest))
if __name__=='__main__':
 try:main()
 except Exception as e:report(status='failed',error=str(e));raise
