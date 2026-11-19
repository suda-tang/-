import subprocess,json,hashlib,concurrent.futures,zipfile
from pathlib import Path
ROOT=Path(r'C:/Users/mail/Documents/ChatGPT/自动钢琴陪练系统');OUT=ROOT/'output/audio/mentor-v4-release-20261026';D=ROOT/'dist';TMP=OUT/'http-verification';TMP.mkdir(exist_ok=True);BASE='https://suzhou.super-tang.com'
def get(path):return subprocess.check_output(['curl.exe','--fail','--silent','--show-error','--max-time','25',BASE+path])
normal=get('/narration/tour.json');cartoon=get('/narration/tour.cartoon.json');assert normal==(D/'narration/tour.json').read_bytes();assert cartoon==(D/'narration/tour.cartoon.json').read_bytes()
tracks=json.loads(normal);ct=json.loads(cartoon);urls=list(dict.fromkeys([t['url'] for t in tracks]+[ct[0]['url']]))
def check(pair):
 i,url=pair;head=TMP/f'{i}.headers';body=TMP/f'{i}.bin';subprocess.run(['curl.exe','--fail','--silent','--show-error','--max-time','25','--range','0-1023','-D',str(head),'-o',str(body),BASE+url],check=True);h=head.read_text(encoding='utf8');data=body.read_bytes();assert '206' in h.splitlines()[0] and len(data)==1024,(url,h,len(data));assert b'ftyp' in data[:32],url
 if 'eleven-v4' in url:
  e=json.loads(get(url.replace('.m4a','.mouth.json')));assert e['fps']==25 and len(e['values'])>50
 return {'url':url,'rangeStatus':206,'bytes':len(data)}
with concurrent.futures.ThreadPoolExecutor(3) as pool:results=list(pool.map(check,enumerate(urls)))
release=json.loads(get('/narration/v4-release.json'));assert release['published'] and release['completed']==6
assert b'eleven-v4-20261027' in get('/mentor-preload.js')
deploy=json.loads((OUT/'deployment.json').read_text(encoding='utf8'));archive=Path(deploy['archive'])
with zipfile.ZipFile(archive) as z:assert z.testzip() is None;assert 'narration/tour.json' in z.namelist()
old=Path(deploy['backup'])/'narration/mentor-learning.voxcpm.clean.m4a';live=D/'narration/mentor-learning.voxcpm.clean.m4a';assert hashlib.sha256(old.read_bytes()).digest()==hashlib.sha256(live.read_bytes()).digest()
report={'publicManifestMatchesLocal':True,'normalAndCartoon':True,'media':results,'mouthEnvelopes':True,'oldBackupVerified':True,'pendingAudioUnchanged':True,'release':release}
(OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'publicTracks':len(results),'sixV4AndOldLearningAvailable':True,'rangeAndEnvelopeChecks':'passed','backup':'passed'}))
