import sys,json,subprocess
from pathlib import Path
ROOT=Path(r'C:/Users/mail/Documents/ChatGPT/自动钢琴陪练系统');OUT=ROOT/'output/audio/mentor-v4-release-20261026';sys.path.insert(0,str(ROOT/'.sites-runtime/voice-isolation-packages'))
from faster_whisper import WhisperModel
preview=OUT/'preface-first-18s.wav';subprocess.run([r'C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe','-v','error','-y','-i',str(OUT/'mentor-preface.mp3'),'-t','18','-ar','16000',str(preview)],check=True)
m=WhisperModel('base',device='cpu',compute_type='int8',cpu_threads=3,local_files_only=True)
segments,_=m.transcribe(str(preview),language='zh',word_timestamps=True,beam_size=5,vad_filter=False)
words=[{'text':w.word,'start':w.start,'end':w.end} for s in segments for w in s.words or []]
(OUT/'preface-alignment.json').write_text(json.dumps(words,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(words,ensure_ascii=False))
