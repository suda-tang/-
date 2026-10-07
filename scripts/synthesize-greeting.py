"""Generate only the salutation, splice it into the unchanged recorded introduction."""
import json,sys,time,subprocess,os
from pathlib import Path
import numpy as np,soundfile as sf,sherpa_onnx
from generate_voice_trial import create_tts
ROOT=Path(__file__).resolve().parents[1];request=Path(sys.argv[1]);state=json.loads(request.read_text(encoding='utf-8'))
FF='C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe'
def report(**fields):
 state.update(fields,updated=time.time());tmp=request.with_suffix('.tmp');tmp.write_text(json.dumps(state,ensure_ascii=False),encoding='utf-8');tmp.replace(request)
report(status='loading',started=time.time())
greeting=request.with_suffix('.greeting.wav')
if greeting.exists():
 from types import SimpleNamespace
 samples,rate=sf.read(greeting,dtype='float32');generated=SimpleNamespace(samples=samples,sample_rate=rate);start=time.monotonic()
else:
 tts=create_tts();ref=ROOT/'.sites-runtime/voice-reference/processed/f922ad0fa273a637876ad1b4d9ddbef3/reference-clip.wav';samples,rate=sf.read(ref,dtype='float32')
 config=sherpa_onnx.GenerationConfig();config.reference_audio=samples;config.reference_sample_rate=rate;config.reference_text='今年已经是我从教的第二十七个年头了。我一直是在苏州大学从事音乐教育的工作。';config.num_steps=4
 report(status='synthesizing',audioSeconds=0)
 start=time.monotonic();generated=tts.generate(state['greeting'],config)
 if not len(generated.samples):raise RuntimeError('称呼没有生成有效声音')
 greeting=request.with_suffix('.greeting.wav');sf.write(greeting,generated.samples,generated.sample_rate,subtype='PCM_16')
report(status='joining',audioSeconds=len(generated.samples)/generated.sample_rate,synthesisSeconds=round(time.monotonic()-start,2))
original=ROOT/'dist/narration/mentor-preface.m4a';boundary=ROOT/'.sites-runtime/tour-synthesis/preface-greeting-boundary.json'
if boundary.exists():cut=json.loads(boundary.read_text())['cut']
else:
 # Detect the start of the existing 谢谢, rather than guessing a fixed trim time.
 from faster_whisper import WhisperModel
 model=WhisperModel('base',device='cpu',compute_type='int8',cpu_threads=4,local_files_only=True)
 preview=ROOT/'.sites-runtime/tour-synthesis/preface-start.wav'
 subprocess.run([FF,'-v','error','-y','-i',str(original),'-t','10','-ar','16000',str(preview)],check=True)
 segments,_=model.transcribe(str(preview),language='zh',word_timestamps=True,beam_size=5,vad_filter=False)
 words=[w for seg in segments for w in (seg.words or [])]
 match=next((w for w in words if '谢' in w.word),None)
 if not match or not .3<match.start<4:raise RuntimeError('未能定位原前言称呼边界，停止拼接以避免重复问候')
 cut=max(0,match.start-.015)
 boundary.write_text(json.dumps({'cut':cut,'word':match.word if match else '', 'preserveOriginal':cut==0}),encoding='utf-8')
pending=request.with_suffix('.pending.m4a')
subprocess.run([FF,'-v','error','-y','-i',str(greeting),'-i',str(original),'-filter_complex',f'[0:a]aresample=24000,afade=t=out:st={max(0,len(generated.samples)/generated.sample_rate-.025)}:d=0.025[a];[1:a]atrim=start={cut},asetpts=PTS-STARTPTS,aresample=24000,afade=t=in:d=0.025[b];[a][b]concat=n=2:v=0:a=1[out]','-map','[out]','-c:a','aac','-b:a','128k','-movflags','+faststart',str(pending)],check=True)
subprocess.run([FF,'-v','error','-i',str(pending),'-f','null','-'],check=True);pending.replace(request.with_suffix('.m4a'))
from narration_envelope import envelope
envelope(request.with_suffix('.m4a'));report(status='complete')
