"""Render and validate SadTalker chapters using an isolated CPU environment.

Run with .sites-runtime/avatar-env/Scripts/python.exe.
Default is a short, explicitly labelled preview; --full publishes complete chapters.
"""
import argparse, hashlib, json, os, sys, time, subprocess, random, gc, shutil, struct
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
 save_json(OUT/'avatar-status.json',dict(state=state,message=message,updated=time.time(),pid=os.getpid(),**extra))
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
 # Held for the complete run; released by the OS even on interruption.
 import msvcrt
 lock=(WORK/'render.lock').open('a+b');lock.seek(0)
 try:msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
 except OSError:raise SystemExit('Another avatar renderer is already running')
 duration=float(probe(audio)['format']['duration'])
 length=duration if args.full else min(duration,max(1,args.seconds))
 digest=hashlib.sha256(source.read_bytes()+audio.read_bytes()+str(length).encode()).hexdigest()[:16]
 job=WORK/digest;job.mkdir(exist_ok=True)
 target=OUT/(args.chapter+'-avatar-'+digest+'-cpu.mp4')
 report('preparing','正在准备导师数字人画面与讲解音轨',chapter=args.chapter,seconds=length)
 wav=job/'speech.wav'
 run(FFMPEG,'-y','-hide_banner','-loglevel','error','-i',audio,'-t',length,'-ar','16000','-ac','1',wav)
 os.environ['PATH']=str(FFMPEG.parent)+os.pathsep+os.environ.get('PATH','')
 os.environ['OMP_NUM_THREADS']='4';os.environ['MKL_NUM_THREADS']='4'
 import torch
 torch.set_num_threads(4);torch.set_num_interop_threads(1);torch.manual_seed(42)
 import numpy as np
 np.random.seed(42);random.seed(42)
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
 # Read one tensor at a time instead of mapping the entire 725 MB checkpoint
 # once for every submodel (Windows commit limits can reject those mappings).
 import safetensors.torch
 class StreamingWeights:
  def __init__(self,path):self.path=path
  def items(self,prefix=None):
   types={'F32':torch.float32,'F16':torch.float16,'BF16':torch.bfloat16,'I64':torch.int64,'I32':torch.int32,'U8':torch.uint8,'BOOL':torch.bool}
   with open(self.path,'rb') as stream:
    size=struct.unpack('<Q',stream.read(8))[0]
    header=json.loads(stream.read(size));base=8+size
    for name,meta in header.items():
     if name=='__metadata__' or (prefix and not name.startswith(prefix)):continue
     first,last=meta['data_offsets'];stream.seek(base+first)
     data=bytearray(stream.read(last-first))
     if len(data)!=last-first:raise IOError('Incomplete model tensor: '+name)
     yield name,torch.frombuffer(data,dtype=types[meta['dtype']]).reshape(meta['shape'])
 safetensors.torch.load_file=lambda path,*a,**kw:StreamingWeights(path)
 # The upstream renderer only saves after all frames finish. Cache each
 # prediction atomically so an interrupted CPU run can resume exactly.
 from src.facerender.modules.generator import OcclusionAwareSPADEGenerator
 original_forward=OcclusionAwareSPADEGenerator.forward
 frames=job/'frames';frames.mkdir(exist_ok=True)
 counter=0
 def cached_forward(model,*values,**options):
  nonlocal counter
  file=frames/f'{counter:06d}.npy';counter+=1
  if file.exists():
   saved=np.load(file,allow_pickle=False)
   if saved.shape==(1,3,256,256) and np.isfinite(saved).all():
    return {'prediction':torch.from_numpy(saved)}
  result=original_forward(model,*values,**options)
  temp=file.with_suffix('.tmp')
  with temp.open('wb') as stream:np.save(stream,result['prediction'].detach().cpu().numpy(),allow_pickle=False)
  temp.replace(file)
  return result
 OcclusionAwareSPADEGenerator.forward=cached_forward
 results=job/'results';results.mkdir(exist_ok=True)
 # Use the same upstream stages sequentially, releasing their models between
 # stages. ASCII relative paths also avoid OpenCV's Windows Unicode-path bug.
 from src.utils.init_path import init_path
 from src.utils.preprocess import CropAndExtract
 from src.test_audio2coeff import Audio2Coeff
 from src.facerender.animate import AnimateFromCoeff
 import src.facerender.animate as animation
 # This upstream head estimator is never used by its animation function.
 animation.HEEstimator=lambda **kw:torch.nn.Identity()
 def load_render_weights(self,path,generator=None,kp_detector=None,he_estimator=None,device='cpu'):
  for prefix,model in [('generator.',generator),('kp_extractor.',kp_detector)]:
   if model is None:continue
   state=model.state_dict();seen=set()
   with torch.no_grad():
    for key,tensor in StreamingWeights(path).items(prefix):
     name=key[len(prefix):]
     if name not in state or state[name].shape!=tensor.shape:raise ValueError('Unexpected model weight: '+key)
     state[name].copy_(tensor);seen.add(name)
   if seen!=set(state):raise ValueError('Missing model weights for '+prefix)
 AnimateFromCoeff.load_cpk_facevid2vid_safetensor=load_render_weights
 from src.generate_batch import get_data
 from src.generate_facerender_batch import get_facerender_data
 model_paths=init_path('checkpoints','src/config',256,False,'crop')
 relative_source=os.path.relpath(source,MODEL);relative_wav=os.path.relpath(wav,MODEL)
 stage=os.path.relpath(results/'stages',MODEL);Path(stage).mkdir(exist_ok=True)
 first_stage=Path(stage)/'source';first_stage.mkdir(exist_ok=True)
 report('preparing','正在提取导师面部与三维表情参数',chapter=args.chapter)
 extractor=CropAndExtract(model_paths,'cpu')
 first,crop,crop_info=extractor.generate(relative_source,str(first_stage),'crop',source_image_flag=True,pic_size=256)
 del extractor;gc.collect()
 if first is None:raise RuntimeError('No usable face was detected in the source frame')
 expression=Audio2Coeff(model_paths,'cpu')
 batch=get_data(first,relative_wav,'cpu',None,still=True)
 coefficients=expression.generate(batch,stage,0,None)
 del expression,batch;gc.collect()
 report('rendering','正在用 CPU 生成嘴形与头部动作；这一步需要逐帧渲染',chapter=args.chapter,seconds=length)
 renderer=AnimateFromCoeff(model_paths,'cpu')
 # A single portrait is used for the whole chapter. These source-encoding
 # layers have identical inputs on every frame; reuse their exact outputs.
 def reuse_source(module):
  forward=module.forward;cached=[]
  def once(*values,**options):
   if not cached:cached.append(forward(*values,**options))
   return cached[0]
  module.forward=once
 for layer in [renderer.generator.first,*renderer.generator.down_blocks,renderer.generator.second,renderer.generator.resblocks_3d]:reuse_source(layer)
 data=get_facerender_data(coefficients,crop,first,relative_wav,1,expression_scale=1.,still_mode=True,preprocess='crop',size=256)
 # Stream frames directly into FFmpeg. The upstream method stacks every
 # float32 frame twice before encoding, which can exhaust Windows commit.
 from src.facerender.modules.make_animation import keypoint_transformation
 result=results/'result.mp4'
 encode_log=(job/'encode.log').open('wb')
 encoder=subprocess.Popen([str(FFMPEG),'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s','256x256','-r','12.5','-i','pipe:0','-i',str(wav),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-threads','1','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-shortest',str(result)],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=encode_log)
 try:
  with torch.no_grad():
   source_image=data['source_image'].float()
   canonical=renderer.kp_extractor(source_image)
   source_pose=renderer.mapping(data['source_semantics'].float())
   source_points=keypoint_transformation(canonical,source_pose)
   total=int(data['frame_num'])
   indices=list(range(0,total,2))
   for position,frame in enumerate(indices):
    counter=frame
    pose=renderer.mapping(data['target_semantics_list'][:,frame].float())
    points=keypoint_transformation(canonical,pose)
    prediction=renderer.generator(source_image,kp_driving=points,kp_source=source_points)['prediction']
    pixels=np.rint(np.clip(prediction[0].permute(1,2,0).numpy(),0,1)*255).astype(np.uint8)
    encoder.stdin.write(pixels.tobytes())
    del prediction,pixels
    report('rendering',f'正在生成导师画面：{position+1}/{len(indices)} 帧',chapter=args.chapter,completedFrames=position+1,totalFrames=len(indices),percent=round(100*(position+1)/len(indices),1),seconds=length)
  encoder.stdin.close()
  if encoder.wait()!=0:raise RuntimeError('Video encoding failed; see '+str(job/'encode.log'))
 finally:
  if encoder.poll() is None:encoder.kill();encoder.wait()
  encode_log.close()
 del renderer,data;gc.collect()
 generated=sorted(results.glob('*.mp4'),key=lambda p:p.stat().st_mtime)
 if not generated:raise RuntimeError('The model did not produce a video')
 temp=job/'verified.mp4'
 report('validating','正在检查视频解码和音画时长',chapter=args.chapter)
 run(FFMPEG,'-y','-hide_banner','-loglevel','error','-i',generated[-1],'-i',wav,'-map','0:v:0','-map','1:a:0','-vf','tpad=stop_mode=clone:stop_duration=0.24,minterpolate=fps=25:mi_mode=mci','-t',length,'-c:v','libx264','-threads','1','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-shortest',temp)
 info=probe(temp)
 actual=float(info['format']['duration'])
 if abs(actual-length)>.35:raise RuntimeError(f'Video length mismatch: {actual} vs {length}')
 run(FFMPEG,'-v','error','-i',temp,'-f','null','-')
 pending_target=target.with_suffix('.pending.mp4');shutil.copyfile(temp,pending_target)
 for attempt in range(10):
  try:pending_target.replace(target);break
  except PermissionError:
   if attempt==9:raise
   time.sleep(.2)
 path=OUT/'avatar-manifest.json'
 manifest=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'version':1,'chapters':[]}
 item={'audio':'/narration/'+audio.name,'audioSha256':hashlib.sha256(audio.read_bytes()).hexdigest(),'video':'/narration/'+target.name,'complete':args.full,'duration':actual,'source':'authorized-mentor-upload','model':'SadTalker 0.0.2','renderFps':12.5,'displayFps':25,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
 if args.full:
  manifest['chapters']=[c for c in manifest['chapters'] if c['audio']!=item['audio']]+[item]
 else:manifest['preview']=item
 save_json(path,manifest)
 report('ready','导师数字人片段已生成并通过解码检查' if not args.full else '导师数字人完整章节已生成',chapter=args.chapter,video=item['video'],complete=args.full)

if __name__=='__main__':
 try:main()
 except Exception as exc:
  detail=str(exc) or type(exc).__name__
  if isinstance(exc,MemoryError):detail='可用内存不足。已保留完成的画面帧，释放内存后可以继续生成。'
  if '1455' in detail or '页面文件太小' in detail:
   detail='Windows 可用提交内存不足（1455）。已保留完成的画面帧，释放内存后可以继续生成。'
  report('failed','数字人生成失败：'+detail);raise
