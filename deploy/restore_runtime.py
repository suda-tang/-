"""Download checksum-verified public runtime resources from GitHub Releases."""
import argparse, hashlib, json, os, pathlib, time, urllib.request, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]

def sha256_file(path):
 digest=hashlib.sha256()
 with pathlib.Path(path).open('rb') as source:
  while True:
   chunk=source.read(1024*1024)
   if not chunk:break
   digest.update(chunk)
 return digest.hexdigest()

def safe_members(archive,root):
 for member in archive.infolist():
  name=member.filename.replace('\\','/')
  parts=pathlib.PurePosixPath(name).parts
  if name.startswith('/') or '..' in parts or ':' in name or '.git' in parts:
   raise ValueError('Unsafe archive path: '+name)
  if not (name.startswith('.sites-runtime/') or name.startswith('dist/narration/')):
   raise ValueError('Unexpected runtime path: '+name)
  if (member.external_attr>>16)&0o170000==0o120000:
   raise ValueError('Archive symlink is not allowed: '+name)
  target=(root/name).resolve()
  if not target.is_relative_to(root.resolve()):raise ValueError('Archive path escapes project')
  yield member

def restore(manifest,root=ROOT,proxy=None):
 data=json.loads(pathlib.Path(manifest).read_text(encoding='utf-8-sig'))
 cache=root/'.sites-runtime/downloads';cache.mkdir(parents=True,exist_ok=True)
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({'https':proxy} if proxy else urllib.request.getproxies()))
 for asset in data['assets']:
  name=asset['name']
  if pathlib.Path(name).name!=name:raise ValueError('Invalid asset name')
  target=cache/name
  def valid():
   if not target.exists() or target.stat().st_size!=asset['size']:return False
   return sha256_file(target)==asset['sha256']
  if not valid():
   temporary=target.with_suffix('.download')
   for attempt in range(4):
    try:
     with opener.open(asset['url'],timeout=60) as response, temporary.open('wb') as output:
      done=0;last=0
      while chunk:=response.read(1024*1024):
       output.write(chunk);done+=len(chunk)
       if time.monotonic()-last>2:
        print(f'{name}: {done/max(1,asset["size"])*100:.1f}%',flush=True);last=time.monotonic()
     temporary.replace(target)
     if not valid():raise ValueError('Checksum mismatch: '+name)
     break
    except (OSError,ValueError):
     if attempt==3:raise
     time.sleep(2*(attempt+1))
  print('Extracting',name,flush=True)
  with zipfile.ZipFile(target) as archive:
   members=list(safe_members(archive,root))
   archive.extractall(root,members=members)
 for fragment in data.get('fragments',[]):
  name=fragment['path'];destination=(root/name).resolve()
  if '..' in pathlib.PurePosixPath(name).parts or ':' in name or not destination.is_relative_to(root.resolve()) or not name.startswith(('.sites-runtime/','dist/narration/')):raise ValueError('Invalid fragment target')
  temporary=destination.with_name(destination.name+'.restoring');digest=hashlib.sha256();size=0
  destination.parent.mkdir(parents=True,exist_ok=True)
  parts=[]
  with temporary.open('wb') as output:
   for part_name in fragment['parts']:
    part=(root/part_name).resolve()
    if not part_name.startswith(name+'.restore-parts/') or not part.is_relative_to(root.resolve()):raise ValueError('Invalid fragment path')
    parts.append(part)
    with part.open('rb') as source:
     while chunk:=source.read(1024*1024):output.write(chunk);digest.update(chunk);size+=len(chunk)
  if digest.hexdigest()!=fragment['sha256'] or size!=fragment['size']:raise ValueError('Reassembled checkpoint checksum mismatch')
  temporary.replace(destination)
  for part in parts:part.unlink()
  if parts:parts[0].parent.rmdir()
  print('Reassembled and verified',name,flush=True)
 print('Selected project resources restored.',flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--group',choices=['all','core','cosy','personal'],default='all');parser.add_argument('--proxy')
 args=parser.parse_args()
 for group in (['core','cosy'] if args.group=='all' else [args.group]):
  restore(ROOT/'deploy'/f'runtime-{group}-manifest.json',proxy=args.proxy)
