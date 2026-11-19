"""CPU review sample using the authorised mentor reference, isolated from live audio."""
import json,time,os
from pathlib import Path
root=Path(__file__).resolve().parents[1]
statefile=root/'.sites-runtime/voxcpm-trial-state.json'
def status(**kw):statefile.write_text(json.dumps(dict(updated=time.time(),**kw),ensure_ascii=False),encoding='utf-8')
try:
 status(status='loading_dependencies')
 import torch,soundfile as sf,numpy as np

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
 torch.set_num_threads(4)
 status(status='downloading_model',model='D:/PianoCoachRuntime/voxcpm/model-0.5b')
 model=VoxCPM.from_pretrained('D:/PianoCoachRuntime/voxcpm/model-0.5b',device='cpu',load_denoiser=False,optimize=False,cache_dir='D:/PianoCoachRuntime/voxcpm/models')
 status(status='synthesizing')
 ref=root/'.sites-runtime/voice-reference/processed/f922ad0fa273a637876ad1b4d9ddbef3/reference-clip.wav'
 text='辛苦您专门抽出时间来看唐秋鸣做的这套东西。我是苏大音乐学院的冒小瑛。'
 wav=model.generate(text=text,prompt_wav_path=str(ref),prompt_text='今年已经是我从教的第二十七个年头了。我一直是在苏州大学从事音乐教育的工作。',inference_timesteps=10,cfg_value=2.0,normalize=False)
 if not np.isfinite(wav).all() or len(wav)<model.tts_model.sample_rate:raise ValueError('Invalid generated audio')
 target=root/'dist/narration/mentor-voxcpm-trial.wav';sf.write(target,wav,model.tts_model.sample_rate,subtype='PCM_16')
 status(status='complete',url='/narration/mentor-voxcpm-trial.wav',seconds=len(wav)/model.tts_model.sample_rate)
except Exception as e:
 status(status='failed',error=str(e));raise
