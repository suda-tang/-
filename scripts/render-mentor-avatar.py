"""Render and validate SadTalker chapters using an isolated CPU environment.

Run with .sites-runtime/avatar-env/Scripts/python.exe.
Default is a short, explicitly labelled preview; --full publishes complete chapters.
"""
import argparse, hashlib, json, os, runpy, sys, time, subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MODEL=ROOT/'.sites-runtime/SadTalker'
WORK=ROOT/'.sites-runtime/avatar-render'
OUT=ROOT/'dist/narration'
FFMPEG=Path('C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe')
FFPROBE=Path('C:/Users/mail/AppData/Local/Programs/nascab/libs/ffprobe/bin/win/x64/ffprobe.exe')
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')

def save_json(path, data):
 payload=json.dumps(data,ensure_ascii=False,indent=2)
 temp=path.with_suffix('.tmp')
 for attempt in range(10):
  try:
   temp.write_text(payload,encoding='utf-8');temp.replace(path);return
  except PermissionError:
   time.sleep(.2)
 raise IOError(f'Could not update {path}')

def report(state, message, **extra):
 save_json(OUT/'avatar-status.json',dict(state=state,message=message,updated=time.time(),**extra))
 print(message,flush=True)

def run(*args):
 subprocess.run([str(a) for a in args],check=True,stdin=subprocess.DEVNULL)

def probe(path):
 return json.loads(subprocess.check_output([str(FFPROBE),'-v','error','-show_streams','-show_format','-of','json',str(path)]))

def main():
 parser=argparse.ArgumentParser()
 parser.add_argument('--full',action='store_true')
 parser.add_argument('--seconds',type=float,default=5)
 parser.add_argument('--chapter',default='mentor-preface')
 args=parser.parse_args()
 if args.chapter not in {'mentor-preface','mentor-context','mentor-material'}:raise ValueError('Unknown chapter')
 source=ROOT/'.sites-runtime/avatar-source/uploaded-frame12.png'
 audio=OUT/(args.chapter+'.m4a')
 if not source.exists():raise FileNotFoundError('Missing reviewed portrait frame')
 WORK.mkdir(parents=True,exist_ok=True)
 duration=float(probe(audio)['format']['duration'])
 length=duration if args.full else min(duration,max(1,args.seconds))
 digest=hashlib.sha256(source.read_bytes()+audio.read_bytes()+str(length).encode()).hexdigest()[:16]
 job=WORK/digest;job.mkdir(exist_ok=True)
 target=OUT/(args.chapter+'-avatar-'+digest+'.mp4')
 report('preparing','正在准备导师数字人画面与讲解音轨',chapter=args.chapter,seconds=length)
 wav=job/'speech.wav'
 run(FFMPEG,'-y','-hide_banner','-loglevel','error','-i',audio,'-t',length,'-ar','16000','-ac','1',wav)
 os.environ['PATH']=str(FFMPEG.parent)+os.pathsep+os.environ.get('PATH','')
 os.environ['OMP_NUM_THREADS']='4';os.environ['MKL_NUM_THREADS']='4'
 import torch
 torch.set_num_threads(4);torch.set_num_interop_threads(1);torch.manual_seed(42)
 # Report actual completed frames, never an invented loading percentage.
 import tqdm as progress_module
 original_progress=progress_module.tqdm
 class ReportProgress(original_progress):
  def __iter__(self):
   for item in super().__iter__():
    yield item
    if self.desc=='Face Renderer:' and self.total:
     completed=int(item)+1
     report('rendering',f'正在生成导师画面：{completed}/{self.total} 帧',chapter=args.chapter,completedFrames=completed,totalFrames=int(self.total),percent=round(100*completed/self.total,1),seconds=length)
 progress_module.tqdm=ReportProgress
 # BasicSR 1.4.2 uses the old torchvision module name.
 import torchvision.transforms._functional_tensor as functional_tensor
 sys.modules['torchvision.transforms.functional_tensor']=functional_tensor
 sys.path.insert(0,str(MODEL));os.chdir(MODEL)
 results=job/'results';results.mkdir(exist_ok=True)
 # OpenCV's Windows image loader cannot read Chinese absolute paths.
 # All model-facing paths are ASCII relative to its working directory.
 sys.argv=['inference.py','--source_image',os.path.relpath(source,MODEL),'--driven_audio',os.path.relpath(wav,MODEL),'--result_dir',os.path.relpath(results,MODEL),'--checkpoint_dir','checkpoints','--cpu','--size','256','--batch_size','1','--preprocess','crop','--still']
 report('rendering','正在用 CPU 生成嘴形与头部动作；这一步需要逐帧渲染',chapter=args.chapter,seconds=length)
 runpy.run_path(str(MODEL/'inference.py'),run_name='__main__')
 generated=sorted(results.glob('*.mp4'),key=lambda p:p.stat().st_mtime)
 if not generated:raise RuntimeError('The model did not produce a video')
 temp=job/'verified.mp4'
 report('validating','正在检查视频解码和音画时长',chapter=args.chapter)
 run(FFMPEG,'-y','-hide_banner','-loglevel','error','-i',generated[-1],'-i',wav,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-shortest',temp)
 info=probe(temp)
 actual=float(info['format']['duration'])
 if abs(actual-length)>.35:raise RuntimeError(f'Video length mismatch: {actual} vs {length}')
 run(FFMPEG,'-v','error','-i',temp,'-f','null','-')
 target.write_bytes(temp.read_bytes())
 path=OUT/'avatar-manifest.json'
 manifest=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'version':1,'chapters':[]}
 item={'audio':'/narration/'+audio.name,'video':'/narration/'+target.name,'complete':args.full,'duration':actual,'source':'authorized-mentor-upload','model':'SadTalker 0.0.2','sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
 if args.full:
  manifest['chapters']=[c for c in manifest['chapters'] if c['audio']!=item['audio']]+[item]
 else:manifest['preview']=item
 save_json(path,manifest)
 report('ready','导师数字人片段已生成并通过解码检查' if not args.full else '导师数字人完整章节已生成',chapter=args.chapter,video=item['video'],complete=args.full)

if __name__=='__main__':
 try:main()
 except Exception as exc:
  report('failed','数字人生成失败：'+str(exc));raise
