import os,json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
keys=['ELEVENLABS_API_KEY','ELEVEN_API_KEY','XI_API_KEY']
found=[name for name in keys if os.environ.get(name)]
configs=[]
for name in ['.env','.env.local','.env.production','.sites-runtime/elevenlabs.json','.sites-runtime/secrets/elevenlabs.json']:
 p=root/name
 if p.is_file():
  s=p.read_text(encoding='utf-8-sig',errors='replace')
  configs.append({'file':name,'hasElevenlabsKey':bool(re.search(r'(?:ELEVENLABS_API_KEY|ELEVEN_API_KEY|XI_API_KEY|"api_key")\s*[:=]\s*[^\s"\']+',s))})
rows=[]
for p in (root/'.sites-runtime/voice-reference').glob('*.json'):
 try:d=json.loads(p.read_text(encoding='utf-8'))
 except (OSError,ValueError):continue
 if d.get('role')!='mentor':continue
 ident=d.get('id','');raw=[f for f in p.parent.glob(ident+'.*') if f.suffix.lower() in ['.mp4','.mov','.m4a','.wav','.mp3','.ogg','.webm','.flac']]
 clean=p.parent/'processed'/ident/'reference-clean.wav'
 rows.append({'id':ident,'consentConfirmed':bool(d.get('consent',{}).get('confirmed')),'sourceFiles':len(raw),'sourceBytes':sum(f.stat().st_size for f in raw),'cleanedAvailable':clean.exists()})
print(json.dumps({'credentialEnvironmentVariablesPresent':found,'configurationChecks':configs,'mentorRecordings':rows},ensure_ascii=False))
