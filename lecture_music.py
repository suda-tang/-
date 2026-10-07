import json,secrets,subprocess,threading
from urllib.parse import urlparse,parse_qs
JOBS={}
from pathlib import Path
import upload_auth
ROOT=Path(__file__).resolve().parent
STORE=ROOT/'dist/narration/background';LOCK=threading.Lock()
FF='C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe'
def handle(handler):
 config=STORE/'current.json'
 if handler.command=='GET' and parse_qs(urlparse(handler.path).query).get('job'):
  return handler.json_response(JOBS.get(parse_qs(urlparse(handler.path).query)['job'][0],{'status':'failed','error':'处理任务已中断，请重新上传'}))
 if handler.command=='GET':return handler.json_response(json.loads(config.read_text(encoding='utf-8')) if config.exists() else {'url':None,'volume':.12})
 if not upload_auth.authorized(handler):handler.close_connection=True;return handler.json_response({'error':'请先输入上传密码'},401)
 try:
  size=int(handler.headers.get('Content-Length','0'))
  if not 1000<=size<=50*1024*1024:handler.close_connection=True;return handler.json_response({'error':'请选择 50MB 以内的音频'},413)
  body=handler.rfile.read(size)
  if len(body)!=size:raise ValueError('上传中断，请重试')
  STORE.mkdir(parents=True,exist_ok=True);ident=secrets.token_hex(12);source=STORE/(ident+'.upload');target=STORE/(ident+'.m4a');source.write_bytes(body)
  volume=max(0,min(.5,float(handler.headers.get('X-Music-Volume','.12'))))
  JOBS[ident]={'status':'processing','progress':20,'detail':'上传完成，准备处理'}
  threading.Thread(target=convert,args=(ident,source,target,volume),daemon=True).start()
  return handler.json_response({'status':'processing','job':ident,'progress':20},202)
 except Exception as error:return handler.json_response({'error':str(error)},400)

def convert(ident,source,target,volume):
 config=STORE/"current.json"
 try:
   JOBS[ident]={'status':'processing','progress':40,'detail':'正在转换音频格式'}
   try:
    result=subprocess.run([FF,'-v','error','-y','-i',str(source),'-vn','-t','1800','-ac','2','-ar','44100','-c:a','aac','-b:a','160k','-movflags','+faststart',str(target)],capture_output=True,timeout=120)
    if result.returncode or not target.exists():raise ValueError('音频无法解码，请换一个音频文件')
   finally:source.unlink(missing_ok=True)
   JOBS[ident]={'status':'processing','progress':75,'detail':'正在调整背景音乐音量'}
   mixed=STORE/(ident+'-gain.m4a')
   subprocess.run([FF,'-v','error','-y','-i',str(target),'-af','volume='+str(volume),'-c:a','aac','-b:a','160k','-movflags','+faststart',str(mixed)],capture_output=True,timeout=120,check=True)
   data={'url':'/narration/background/'+mixed.name,'sourceUrl':'/narration/background/'+target.name,'volume':volume,'renderedVolume':volume}
   with LOCK:
    tmp=config.with_suffix('.tmp');tmp.write_text(json.dumps(data),encoding='utf-8');tmp.replace(config)
   JOBS[ident]={'status':'complete',**data,'progress':100}
 except Exception as error:
  JOBS[ident]={'status':'failed','error':'背景音乐处理失败：'+str(error),'progress':0}
