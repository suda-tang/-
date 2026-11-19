"""Prepare the authorized mentor sources and user text locally; no external calls."""
from pathlib import Path
import json,re,hashlib,shutil
import soundfile as sf

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'docs/导师数字人讲稿人工修改-20261025/导师数字人七段讲稿-用户定稿.md'
OUT=ROOT/'.sites-runtime/elevenlabs-mentor-20261025'
OUT.mkdir(parents=True,exist_ok=True)
text=SOURCE.read_text(encoding='utf-8-sig')
matches=list(re.finditer(r'<!-- segment:([^\s]+) -->\s*\n## (\d+)｜([^\n]+)\n\n([\s\S]*?)(?=\n<!-- segment:|$)',text))
expected=['mentor-preface','mentor-context','mentor-material','mentor-listening','mentor-arrangement','mentor-learning','mentor-handoff']
assert [m[1] for m in matches]==expected
segments=[dict(id=m[1],number=int(m[2]),title=m[3],text=m[4].strip()) for m in matches]
samples=[]
store=ROOT/'.sites-runtime/voice-reference'
for p in sorted(store.glob('*.json')):
 try:meta=json.loads(p.read_text(encoding='utf-8'))
 except (OSError,ValueError):continue
 if meta.get('role')!='mentor' or not meta.get('consent',{}).get('confirmed'):continue
 original=store/'processed'/meta['id']/'reference-clean.wav'
 if not original.is_file():raise RuntimeError('Missing cleaned authorized source '+meta['id'])
 info=sf.info(original)
 target=OUT/f'mentor-source-{len(samples)+1:02d}.wav'
 if not target.exists() or hashlib.sha256(target.read_bytes()).digest()!=hashlib.sha256(original.read_bytes()).digest():shutil.copyfile(original,target)
 samples.append(dict(sourceId=meta['id'],file=target.name,seconds=round(info.duration,3),sampleRate=info.samplerate,channels=info.channels,sha256=hashlib.sha256(original.read_bytes()).hexdigest(),consentConfirmed=True))
assert len(samples)==3
manifest={'provider':'ElevenLabs','status':'awaiting-account-connection','createdOn':'2026-10-25','scope':'mentor-only','sourceScript':str(SOURCE.relative_to(ROOT)),'sourceScriptSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'segments':segments,'referenceSources':samples,'referenceSeconds':round(sum(s['seconds'] for s in samples),3),'published':False,'notes':['All three authorized mentor sources included for quality review; no Tang Qiuming recordings included.','No files have been sent to ElevenLabs. Text is verbatim user copy; do not silently rewrite.','Select consistent speech from all sources after quality review; do not include music or other speakers.','Use existing account credits only; do not purchase a subscription or enable additional billing.']}
(OUT/'preparation.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
for row in segments:(OUT/(row['id']+'.txt')).write_text(row['text'],encoding='utf-8')
print(json.dumps({'segments':len(segments),'textCharacters':sum(len(r['text']) for r in segments),'mentorSources':len(samples),'sourceSeconds':[s['seconds'] for s in samples],'totalReferenceSeconds':manifest['referenceSeconds'],'status':manifest['status'],'uploaded':False},ensure_ascii=False))
