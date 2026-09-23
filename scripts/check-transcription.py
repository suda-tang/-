import sys,json,subprocess,wave,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path[:0]=[str(ROOT),str(ROOT/'.sites-runtime/transcription-vendor')]
import numpy as np,imageio_ffmpeg
folder=ROOT/'.sites-runtime/verification/media';folder.mkdir(parents=True,exist_ok=True)
samples=[]
for pitch in ('C3','C4','C5'):
 result=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(ROOT/f'dist/assets/piano/{pitch}.mp3'),'-f','s16le','-ac','1','-ar','44100','-t','1.5','-'],capture_output=True,check=True)
 samples.append(np.frombuffer(result.stdout,dtype=np.int16))
audio=np.zeros(44100*7,dtype=np.float32)
for i,sample in enumerate(samples):audio[i*88200:i*88200+len(sample)]+=sample.astype(np.float32)*.7
key=hashlib.sha256(b'transkun-integration-fixture').hexdigest()
with wave.open(str(folder/(key+'.source')),'wb') as output:output.setnchannels(1);output.setsampwidth(2);output.setframerate(44100);output.writeframes(audio.astype(np.int16).tobytes())
request=folder/'request.json';request.write_text(json.dumps({'mode':'transcription','digest':key,'title':'钢琴转录验证','cacheDir':str(folder)}),encoding='utf-8')
subprocess.run([sys.executable,str(ROOT/'scripts/transcribe-media.py'),str(request)],check=True,cwd=ROOT)
import pretty_midi,xml.etree.ElementTree as ET
midi=pretty_midi.PrettyMIDI(str(folder/(key+'.mid')));notes=[n for t in midi.instruments for n in t.notes]
assert notes,'No notes transcribed'
assert {48,60,72}.issubset({n.pitch for n in notes}),[(n.pitch,n.start) for n in notes]
root=ET.parse(folder/(key+'.transcribed.musicxml')).getroot();assert root.findtext('./work/work-title')=='钢琴转录验证'
assert root.find('.//staves') is not None or len(root.findall('part'))==2
print(json.dumps({'notes':len(notes),'pitches':sorted({n.pitch for n in notes}),'musicxml':True}))
