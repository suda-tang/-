"""Package explicitly authorised personal project assets, excluding authentication data."""
import hashlib,json,pathlib,re,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'.sites-runtime/personal-release'
SOURCES=['.sites-runtime/voice-reference','.sites-runtime/portrait-reference','.sites-runtime/avatar-source',
 '.sites-runtime/avatar-render','.sites-runtime/book-originals','.sites-runtime/score-cache',
 '.sites-runtime/score-profiles','.sites-runtime/arrangements','.sites-runtime/performance-cache',
 '.sites-runtime/jobs','dist/narration/models']
DENY_NAMES={'access-key','access_key','password','credentials','credentials.json','embedded_credentials.py'}
DENY_SUFFIX={'.log','.tmp','.pyc','.pid','.part','.heartbeat'}
LIMIT=650*1024**2
AUTH_KEYS=re.compile(r'^(?:password|passwd|authorization|cookie|cookies|api[_-]?key|access[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)$',re.I)

def sha256_file(path):
 digest=hashlib.sha256()
 with pathlib.Path(path).open('rb') as source:
  while True:
   chunk=source.read(1024**2)
   if not chunk:break
   digest.update(chunk)
 return digest.hexdigest()

def clean_json(value):
 if isinstance(value,dict):return {key:clean_json(v) for key,v in value.items() if not AUTH_KEYS.fullmatch(str(key))}
 if isinstance(value,list):return [clean_json(v) for v in value]
 return value

def eligible(path):
 parts=path.relative_to(ROOT).parts
 return (path.is_file() and not path.is_symlink() and not any(p in DENY_NAMES or p in {'.git','__pycache__'} or p.startswith(('.env','.browser-profile','.wvpn')) for p in parts)
         and path.suffix.lower() not in DENY_SUFFIX and not path.name.startswith('pagefile-'))

def build():
 OUTPUT.mkdir(parents=True,exist_ok=True)
 manifest={'version':2,'release':'authorised-project-data-2026-10-08','assets':[],'fragments':[],
 'notice':'Personal project assets explicitly authorised for publication. University credentials, access keys, cookies and browser sessions are excluded.'}
 inventory=[];archive=None;number=0;current=0;target=None
 def finish():
  nonlocal archive,current
  if archive is None:return
  archive.close()
  digest=sha256_file(target)
  name=target.name
  manifest['assets'].append({'name':name,'size':target.stat().st_size,'sha256':digest,
    'url':f"https://github.com/suda-tang/-/releases/download/{manifest['release']}/{name}"})
  print(name,round(target.stat().st_size/1024**2,1),'MiB',flush=True)
  archive=None;current=0
 def ensure(size):
  nonlocal archive,number,target
  if archive and current+size>LIMIT:finish()
  if archive is None:
   number+=1;target=OUTPUT/f'project-data-{number:02d}.zip'
   archive=zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True)
 for folder in SOURCES:
  for path in sorted((ROOT/folder).rglob('*')):
   if not eligible(path):continue
   name=path.relative_to(ROOT).as_posix();size=path.stat().st_size
   if folder=='.sites-runtime/jobs' and path.suffix.lower() not in {'.pdf','.mxl','.musicxml','.omr','.png','.jpg','.jpeg','.mp4','.wav','.m4a','.mp3','.mid'}:continue
   inventory.append({'path':name,'size':size})
   if size>LIMIT:
    fragments=[];digest=hashlib.sha256()
    with path.open('rb') as source:
     index=0
     while source.tell()<size:
      length=min(LIMIT,size-source.tell());ensure(length)
      part_name=name+f'.restore-parts/{index:04d}';fragments.append(part_name)
      with archive.open(part_name,'w',force_zip64=True) as output:
       remaining=length
       while remaining:
        chunk=source.read(min(1024**2,remaining))
        if not chunk:raise RuntimeError('Source changed during packaging: '+name)
        output.write(chunk);digest.update(chunk);remaining-=len(chunk)
      current+=length;index+=1;finish()
    manifest['fragments'].append({'path':name,'sha256':digest.hexdigest(),'parts':fragments,'size':size})
   else:
    ensure(size)
    if path.suffix.lower()=='.json':
     raw=path.read_bytes()
     try:data=json.dumps(clean_json(json.loads(raw.decode('utf-8-sig'))),ensure_ascii=False).encode('utf-8')
     except (ValueError,UnicodeDecodeError):raise RuntimeError('Review invalid JSON before publication: '+name)
     archive.writestr(name,data)
    else:archive.write(path,name)
    current+=size
 finish()
 for name,data in [('runtime-manifest.json',manifest),('runtime-inventory.json',inventory)]:
  (OUTPUT/name).write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf-8')
 print('Personal assets packaged:',len(inventory),'files in',number,'archives',flush=True)

if __name__=='__main__':build()
