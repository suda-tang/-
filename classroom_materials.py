"""Resumable classroom materials; parsing stays off the HTTP/UI thread."""
import base64,hashlib,json,re,threading,time,zipfile,subprocess,os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from xml.etree import ElementTree as ET
from storage import write_json
ROOT=Path(__file__).resolve().parent/'.sites-runtime/classroom-materials'
POOL=ThreadPoolExecutor(max_workers=2);LOCK=threading.RLock();ASR_LOCK=threading.Lock();ACTIVE=set()
EXTENSIONS={'.pdf','.docx','.txt','.md','.png','.jpg','.jpeg','.webp','.wav','.mp3','.m4a','.aac','.ogg','.flac','.mp4','.mov','.webm'}
def read(ident):
 if not re.fullmatch('[a-f0-9]{64}',ident):raise ValueError('材料编号无效')
 return json.loads((ROOT/(ident+'.json')).read_text(encoding='utf-8'))
def save(item):
 item['updatedAt']=time.time();ROOT.mkdir(parents=True,exist_ok=True);write_json(ROOT/(item['id']+'.json'),item)
def public(item):return {k:v for k,v in item.items() if k not in ('path','playbackPath','text','segments')}
def upload(data):
 score=str(data.get('scoreId',''))
 if not re.fullmatch('[a-f0-9]{64}',score):raise ValueError('请先打开一首云曲谱')
 name=Path(str(data.get('name','')).replace('\\','/')).name[:180];ext=Path(name).suffix.lower()
 if ext not in EXTENSIONS:raise ValueError('不支持此课堂材料格式')
 total=int(data.get('size',0));offset=int(data.get('offset',0))
 if not 0<total<=200*1024*1024:raise ValueError('单份材料须小于200 MB')
 digest=str(data.get('digest',''))
 if not re.fullmatch('[a-f0-9]{64}',digest):raise ValueError('材料校验信息无效')
 ident=hashlib.sha256((score+digest).encode()).hexdigest()
 chunk=base64.b64decode(data.get('chunk',''),validate=True)
 if len(chunk)>512*1024 or not chunk:raise ValueError('上传分片大小无效')
 with LOCK:
  try:item=read(ident)
  except FileNotFoundError:item={'id':ident,'scoreId':score,'name':name,'size':total,'digest':digest,'path':str(ROOT/(ident+ext)),'kind':str(data.get('kind','reference'))[:30],'status':'uploading','progress':0,'createdAt':time.time()}
  if item['status']!='uploading':return public(item)
  path=Path(item['path']);ROOT.mkdir(parents=True,exist_ok=True);position=path.stat().st_size if path.exists() else 0
  if offset!=position:return {**public(item),'offset':position}
  if offset+len(chunk)>total:raise ValueError('上传数据超过材料长度')
  with path.open('ab') as out:out.write(chunk)
  position+=len(chunk);item.update(progress=round(position/total*35,1),message='正在上传',offset=position);save(item)
  if position==total:
   with path.open('rb') as uploaded:actual=hashlib.file_digest(uploaded,'sha256').hexdigest()
   if actual!=digest:item.update(status='failed',message='材料校验失败，请重新选择文件');save(item)
   else:item.update(status='queued',message='等待解析材料');save(item);ACTIVE.add(ident);POOL.submit(parse,ident)
  return public(item)
def parse(ident):
 item=read(ident);path=Path(item['path']);ext=path.suffix.lower()
 try:
  item.update(status='processing',progress=40,message='正在读取材料');save(item);text='';segments=[]
  if ext in ('.txt','.md'):text=path.read_text(encoding='utf-8-sig',errors='replace')
  elif ext=='.docx':
   with zipfile.ZipFile(path) as z:
    info=z.getinfo('word/document.xml')
    if info.file_size>16*1024*1024:raise ValueError('文档解压后过大')
    root=ET.fromstring(z.read(info));text='\n'.join(''.join(p.itertext()) for p in root.iter() if p.tag.endswith('}p'))
  elif ext=='.pdf':
   import fitz
   from jianpu import ocr_items
   with fitz.open(path) as doc:
    parts=[]
    for i,page in enumerate(doc):
     page_text=page.get_text()
     if len(page_text.strip())<20:
      import numpy as np
      pix=page.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False);image=np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.height,pix.width,pix.n)
      page_text='\n'.join(x['text'] for x in ocr_items(image))
     parts.append(f'第{i+1}页\n'+page_text);item.update(progress=40+55*(i+1)/max(1,len(doc)),message=f'正在解析第{i+1}/{len(doc)}页');save(item)
    text='\n\n'.join(parts)
  elif ext in ('.png','.jpg','.jpeg','.webp'):
   from jianpu import ocr_items
   from PIL import Image,ImageOps
   import numpy as np
   image=ImageOps.exif_transpose(Image.open(path)).convert('RGB');image.thumbnail((2400,2400));text='\n'.join(x['text'] for x in ocr_items(np.array(image)))
  else:
   import imageio_ffmpeg
   playback=path.with_name(path.stem+'.playback.mp3')
   result=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-i',str(path),'-vn','-ac','2','-ar','44100','-b:a','160k',str(playback)],capture_output=True,timeout=180,creationflags=getattr(os,'CREATE_NO_WINDOW',0))
   if result.returncode:raise ValueError('音频无法解码：'+result.stderr.decode('utf-8',errors='replace')[-600:])
   item['playbackPath']=str(playback)
   item.update(message='等待本机语音转录',progress=45);save(item)
   with ASR_LOCK:
    from faster_whisper import WhisperModel
    item.update(message='正在转录音频，原文件已保存供课堂播放',progress=50);save(item)
    model=WhisperModel('base',device='cpu',compute_type='int8',cpu_threads=4,local_files_only=True)
    stream,info=model.transcribe(str(path),vad_filter=True,beam_size=5)
    for segment in stream:
     segments.append({'start':segment.start,'end':segment.end,'text':segment.text});item.update(progress=min(96,50+46*segment.end/max(info.duration,1)),message=f'已转录至{segment.end:.0f}秒');save(item)
    text='\n'.join(s['text'] for s in segments)
  if not text.strip() and item.get('playbackPath'):
   item.update(status='ready',progress=100,text='',segments=[],transcriptionStatus='empty',message='聆听素材已就绪，未检测到可用讲述文字');save(item);return
  if not text.strip():raise ValueError('未取得可用文字；原材料已保存，可先补充文字摘要')
  item.update(status='ready',progress=100,text=text[:150000],segments=segments,message='材料已可用于课程');save(item)
 except Exception as error:
  if item.get('playbackPath'):item.update(status='ready',progress=100,text='',segments=[],transcriptionStatus='failed',transcriptionError=str(error)[:1000],message='聆听素材已就绪；文字转录未完成：'+str(error)[:600])
  else:item.update(status='failed',message='材料解析未完成：'+str(error)[:1200])
  save(item)
 finally:
  with LOCK:ACTIVE.discard(ident)
def list_for(score):
 result=[]
 for path in ROOT.glob('*.json'):
  try:
   item=read(path.stem)
   with LOCK:
    if item['status'] in ('queued','processing') and item['id'] not in ACTIVE:ACTIVE.add(item['id']);POOL.submit(parse,item['id'])
   if item['scoreId']==score:result.append(public(item))
  except (OSError,ValueError,KeyError):continue
 return sorted(result,key=lambda x:x['createdAt'])
def selected(score,ids):
 if not isinstance(ids,list) or len(ids)>30:raise ValueError('课堂材料最多选择30份')
 result=[];remaining=60000
 for ident in dict.fromkeys(ids):
  item=read(str(ident))
  if item['scoreId']!=score:raise ValueError('课堂材料不属于当前作品')
  if item['status']!='ready':raise ValueError('请等材料解析完成，或取消选中尚未完成的材料')
  text=item.get('text','')[:min(24000,remaining)];remaining-=len(text)
  result.append({'id':item['id'],'name':item['name'],'kind':item['kind'],'text':text,'truncated':len(text)<len(item.get('text','')),'playable':bool(item.get('playbackPath')),'transcriptionStatus':item.get('transcriptionStatus','ready'),'segments':item.get('segments',[])[:20]})
 return result

def tasks():
 result=[]
 for path in sorted(ROOT.glob('*.json'),key=lambda p:p.stat().st_mtime,reverse=True)[:100]:
  try:
   item=read(path.stem)
   interrupted=item['status']=='uploading' and time.time()-item.get('updatedAt',item['createdAt'])>120
   result.append({'id':'classroom-material-'+item['id'],'kind':'classroom','scoreTitle':item['name'],'created':item['createdAt'],'status':'failed' if interrupted else {'ready':'complete','processing':'running','uploading':'running'}.get(item['status'],item['status']),'progress':item['progress'],'stage':'上传连接已中断；重新选择同一文件可继续上传' if interrupted else item.get('message',''),'label':'课堂材料'})
  except (OSError,ValueError,KeyError):continue
 return result
