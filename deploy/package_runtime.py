"""Build public runtime archives from an explicit allowlist; never scan user data."""
import argparse, hashlib, json, pathlib, zipfile, os
ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = [
 '.sites-runtime/3ddfa/3DDFA_V2-master', '.sites-runtime/GrooveTransformer',
 '.sites-runtime/omr/extracted', '.sites-runtime/PianistTransformer',
 '.sites-runtime/Structured-Arrangement', '.sites-runtime/SadTalker',
 '.sites-runtime/voice-models', '.sites-runtime/separation-models',
 '.sites-runtime/translation', '.sites-runtime/transcription-vendor', '.sites-runtime/package',
 'dist/narration/tour-male', 'dist/narration/background',
]
EXTERNAL = pathlib.Path(os.getenv('PIANO_COSY_RUNTIME', 'C:/PianoCoachRuntime/cosyvoice'))
COSY_ONLY = False

def archive_path(path):
 try:return path.relative_to(ROOT).as_posix()
 except ValueError:return '.sites-runtime/cosyvoice/'+path.relative_to(EXTERNAL).as_posix()

SKIP_PARTS = {'.git','__pycache__','.pytest_cache','.cache','.ipynb_checkpoints'}
SKIP_SUFFIXES = {'.log','.pyc','.pyo','.tmp','.part','.zip','.bz2','.gz'}

def public_files():
 for source in ([EXTERNAL/'CosyVoice-main', EXTERNAL/'pretrained_models'] if COSY_ONLY else SOURCES):
  folder=ROOT/source
  if not folder.exists(): continue
  for path in sorted(folder.rglob('*')):
   relative=pathlib.PurePosixPath(archive_path(path))
   if not path.is_file() or path.is_symlink(): continue
   if SKIP_PARTS.intersection(relative.parts) or path.suffix.lower() in SKIP_SUFFIXES: continue
   yield path

def build(output):
 output.mkdir(parents=True,exist_ok=True)
 manifest={'version':1,'release':'runtime-cosy-2026-10-08' if COSY_ONLY else 'runtime-2026-10-08','assets':[],
 'excluded':['University credentials and sessions','Original uploads and score library','Personal voice datasets and fine-tuned voice weights','Portrait references and identity models','Application materials','Virtual environments, logs, duplicate downloads and Git history']}
 batch=[];size=0;number=0
 def flush():
  nonlocal batch,size,number
  if not batch:return
  number+=1;name=f'public-{'cosy' if COSY_ONLY else 'runtime'}-{number:02d}.zip';target=output/name
  with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as archive:
   for path in batch:archive.write(path,archive_path(path))
  digest=hashlib.file_digest(target.open('rb'),'sha256').hexdigest()
  manifest['assets'].append({'name':name,'size':target.stat().st_size,'sha256':digest,'files':len(batch),
   'url':f"https://github.com/suda-tang/-/releases/download/{manifest['release']}/{name}"})
  print(f'{name}: {target.stat().st_size/1024**2:.1f} MiB, {len(batch)} files',flush=True)
  batch=[];size=0
 inventory=[]
 for path in public_files():
  length=path.stat().st_size
  if batch and size+length>700*1024**2:flush()
  batch.append(path);size+=length
  inventory.append({'path':archive_path(path),'size':length})
 flush()
 (output/'runtime-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
 (output/'runtime-inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
 print(f'Finished: {len(inventory)} files in {number} archives',flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=pathlib.Path,default=ROOT/'.sites-runtime/public-release')
 parser.add_argument('--cosy-only',action='store_true')
 args=parser.parse_args();COSY_ONLY=args.cosy_only
 build(args.output)
