const {spawnSync}=require('child_process');
const code=String.raw`import json,subprocess
from pathlib import Path
from faster_whisper import WhisperModel
folder=Path('.sites-runtime/tour-synthesis');folder.mkdir(exist_ok=True,parents=True)
source=Path('dist/narration/mentor-preface.voxcpm.clean.m4a')
ff='C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe'
preview=folder/'cartoon-preface-start.wav'
subprocess.run([ff,'-v','error','-y','-i',str(source),'-t','28','-ar','16000','-ac','1',str(preview)],check=True)
model=WhisperModel('base',device='cpu',compute_type='int8',cpu_threads=4,local_files_only=True)
segments,_=model.transcribe(str(preview),language='zh',word_timestamps=True,beam_size=5,vad_filter=False,initial_prompt='辛苦您专门抽出时间来看唐秋鸣做的这套东西。我是苏大音乐学院的冒小瑛。秋鸣是我们学院二四级的硕士。')
rows=[{'start':s.start,'end':s.end,'text':s.text,'words':[{'word':w.word,'start':w.start,'end':w.end} for w in s.words or []]} for s in segments]
(folder/'cartoon-preface-words.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(rows,ensure_ascii=False),flush=True)
`;
const r=spawnSync('C:/Users/mail/AppData/Local/Programs/Python/Python312/python.exe',['-c',code],{encoding:'utf8',maxBuffer:2e6});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);
