"""Private reference recordings for owner-authorized narration; no public audio URLs."""
import hashlib, hmac, json, secrets, threading, time, re, shutil
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT=Path(__file__).resolve().parent
STORE=ROOT/'.sites-runtime/voice-reference'
LOCK=threading.Lock()
MAX_BYTES=12*1024*1024

def key():
    with LOCK:
        STORE.mkdir(parents=True,exist_ok=True)
        p=STORE/'access-key'
        if not p.exists():p.write_text(secrets.token_urlsafe(32),encoding='utf-8')
        return p.read_text(encoding='utf-8').strip()

def authorized(handler):
    import upload_auth
    return upload_auth.authorized(handler)

def prompts():
    return json.loads((ROOT/'dist/voice-prompts.json').read_text(encoding='utf-8'))

def status():
    recordings=[]
    for p in STORE.glob('*.json'):
        try:recordings.append(json.loads(p.read_text(encoding='utf-8')))
        except (OSError,ValueError):pass
    personal=sorted([r for r in recordings if r.get('role')!='mentor'],key=lambda r:r['created'])
    for record in personal:
        record['trialReady']=(STORE/'processed'/record.get('id','')/'self-narration-trial.wav').is_file()
        folder=STORE/'processed'/record.get('id','')
        record['cosyTrialReady']=any((folder/name).is_file() for name in ('self-narration-cosy.m4a','self-narration-cosy.wav'))
        if record['trialReady']:
            record['status']='个人旁白试听已生成'
    mentors=sorted([r for r in recordings if r.get('role')=='mentor'],key=lambda r:r['created'])
    active_file=STORE/'active-mentor-reference'
    active_id=active_file.read_text(encoding='utf-8').strip() if active_file.exists() else ''
    for record in mentors:
        trial=STORE/'processed'/record.get('id','')/'mentor-preface-trial.wav'
        record['trialReady']=trial.is_file()
        record['hqTrialReady']=(STORE/'processed'/record.get('id','')/'mentor-preface-hq.wav').is_file()
        record['trainedTrialReady']=(STORE/'processed'/record.get('id','')/'mentor-preface-trained.wav').is_file()
        record['fullTrialReady']=(STORE/'processed'/record.get('id','')/'mentor-preface-full.wav').is_file()
        folder=STORE/'processed'/record.get('id','')
        record['cosyTrialReady']=any((folder/name).is_file() for name in ('mentor-preface-cosy.m4a','mentor-preface-cosy.wav'))
        record['activeTrial']=record.get('id')==active_id
        if record['trialReady']:
            record['status']='当前采用的试听版本' if record['activeTrial'] else '对比试听版本，尚未采用'
    training_file=ROOT/'dist/narration/mentor-full-training.json'
    if not training_file.exists():training_file=ROOT/'dist/narration/mentor-training.json'
    try: training=json.loads(training_file.read_text(encoding='utf-8'))
    except (OSError,ValueError): training=None
    return {'recordings':personal, 'mentorRecordings':mentors, 'activeMentorReference':active_id, 'synthesisReady':bool(active_id),'mentorTraining':training}

def serve_trial(handler):
    """Serve a synthesized trial only to the owner page using the access key."""
    parsed=urlparse(handler.path)
    match=re.fullmatch(r'/api/voice-reference/mentor/([a-f0-9]{32})/trial',parsed.path)
    if not match: raise ValueError('无效试听编号。')
    identifier=match.group(1)
    metadata=STORE/(identifier+'.json')
    variant=parse_qs(parsed.query).get('variant',[''])[0]
    folder=STORE/'processed'/identifier
    if variant=='cosy':
        trial=next((folder/name for name in ('mentor-preface-cosy.m4a','mentor-preface-cosy.wav') if (folder/name).is_file()),folder/'mentor-preface-cosy.m4a')
    elif variant=='full':
        trial=folder/'mentor-preface-full.wav'
    elif variant=='trained':
        trial=folder/'mentor-preface-trained.wav'
    else:
        trial=folder/('mentor-preface-hq.wav' if variant=='hq' else 'mentor-preface-trial.wav')
    if not metadata.exists() or not trial.is_file():
        return handler.json_response({'error':'试听仍在准备中。'},404)
    body=trial.read_bytes()
    handler.send_response(200)
    handler.send_header('Content-Type','audio/mp4' if trial.suffix.lower()=='.m4a' else 'audio/wav')
    handler.send_header('Content-Length',str(len(body)))
    handler.send_header('Cache-Control','private, no-store')
    handler.end_headers()
    handler.wfile.write(body)

def serve_self_trial(handler):
    parsed=urlparse(handler.path)
    match=re.fullmatch(r'/api/voice-reference/self/([a-f0-9]{32})/trial',parsed.path)
    if not match: raise ValueError('无效个人试听编号。')
    identifier=match.group(1)
    variant=parse_qs(parsed.query).get('variant',[''])[0]
    folder=STORE/'processed'/identifier
    if variant=='cosy':
        trial=next((folder/name for name in ('self-narration-cosy.m4a','self-narration-cosy.wav') if (folder/name).is_file()),folder/'self-narration-cosy.m4a')
    else:
        trial=folder/'self-narration-trial.wav'
    if not (STORE/(identifier+'.json')).exists() or not trial.is_file():
        return handler.json_response({'error':'个人旁白试听仍在准备中。'},404)
    body=trial.read_bytes()
    handler.send_response(200)
    handler.send_header('Content-Type','audio/mp4' if trial.suffix.lower()=='.m4a' else 'audio/wav')
    handler.send_header('Content-Length',str(len(body)))
    handler.send_header('Cache-Control','private, no-store')
    handler.end_headers()
    handler.wfile.write(body)

def mentor_upload(handler):
    size=int(handler.headers.get('Content-Length','0'))
    if not 0<size<=2*1024*1024:
        handler.close_connection=True
        return handler.json_response({'error':'上传分段过大，请重新选择文件。'},413)
    body=handler.rfile.read(size)
    if len(body)!=size:raise ValueError('上传中断，请重试。')
    identifier=handler.headers.get('X-Voice-Upload','')
    if not re.fullmatch(r'[a-f0-9]{32}',identifier):raise ValueError('无效上传标识。')
    folder=STORE/'uploads'/identifier
    if handler.path.endswith('/chunk'):
        index=int(handler.headers.get('X-Voice-Chunk','-1'))
        if not 0<=index<200:raise ValueError('素材不得超过200MB。')
        folder.mkdir(parents=True,exist_ok=True)
        # Every chunk is replaceable so network retries never append duplicates.
        with LOCK:
            target=folder/f'{index:04d}.part';tmp=target.with_suffix('.tmp')
            tmp.write_bytes(body);tmp.replace(target)
        return handler.json_response({'received':index},201)
    if not handler.path.endswith('/complete'):raise ValueError('未知上传操作。')
    data=json.loads(body)
    if data.get('consent') is not True:raise ValueError('请确认导师已授权音色复刻及前言用途。')
    name=str(data.get('name',''))[:200];text=str(data.get('text','')).strip()
    if len(text)>3000:raise ValueError('前言补充要求请控制在3000字以内，也可以留空。')
    total=int(data.get('chunks',0))
    if not 1<=total<=200:raise ValueError('上传分段数不正确。')
    ext=Path(name).suffix.lower()
    if ext not in {'.mp3','.wav','.m4a','.mp4','.mov','.webm','.ogg','.flac'}:raise ValueError('请上传常见音频或视频格式。')
    with LOCK:
        existing=STORE/(identifier+'.json')
        if existing.exists():return handler.json_response(json.loads(existing.read_text(encoding='utf-8')),200)
        parts=[folder/f'{i:04d}.part' for i in range(total)]
        if not all(p.is_file() for p in parts):raise ValueError('素材还没有传完整，请重试。')
        count=sum(p.stat().st_size for p in parts)
        if not 1000<=count<=200*1024*1024:raise ValueError('素材大小需在1KB至200MB之间。')
        with parts[0].open('rb') as f:head=f.read(32)
        valid=(ext in {'.mp4','.m4a','.mov'} and head[4:8]==b'ftyp') or (ext=='.wav' and head[:4]==b'RIFF' and head[8:12]==b'WAVE') or (ext=='.webm' and head.startswith(b'\x1aE\xdf\xa3')) or (ext=='.ogg' and head.startswith(b'OggS')) or (ext=='.flac' and head.startswith(b'fLaC')) or (ext=='.mp3' and (head.startswith(b'ID3') or (len(head)>1 and head[0]==255 and head[1]&224==224)))
        if not valid:raise ValueError('文件格式与内容不符，请导出为MP3、M4A或MP4后重试。')
        target=STORE/(identifier+ext);tmp=target.with_suffix(ext+'.tmp');digest=hashlib.sha256()
        with tmp.open('wb') as out:
            for part in parts:
                content=part.read_bytes();out.write(content);digest.update(content)
        tmp.replace(target)
        metadata={'id':identifier,'role':'mentor','name':name,'title':'导师前言','text':text,'created':time.time(),'bytes':count,'sha256':digest.hexdigest(),'consent':{'confirmed':True,'scope':'导师音色复刻及本项目演示前言','confirmedAt':time.time()},'status':'素材与前言已保存，待音轨检查及音色试听','synthesisReady':False}
        metadata.update(prefaceMode='per-mentor',prefaceNotes=text,text='',backgroundMusic='待检查与分离',status='素材已保存，待音轨检查；个性化前言待确认')
        existing.write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
        shutil.rmtree(folder)
    return handler.json_response(metadata,201)

def save(body,mime,prompt_id,duration):
    prompt=next((p for p in prompts() if p['id']==prompt_id),None)
    if not prompt:raise ValueError('朗读段落不存在，请刷新页面。')
    ext={'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg'}.get(mime.split(';')[0].strip())
    if not ext:raise ValueError('录音格式暂不支持，请换用 Safari、Edge 或 Chrome。')
    if not 1000<=len(body)<=MAX_BYTES:raise ValueError('录音为空或超过12MB，请重新录制。')
    if not 8<=duration<=95:raise ValueError('每段请录制8至90秒，并完整读完文字。')
    valid=(ext=='webm' and body.startswith(b'\x1aE\xdf\xa3')) or (ext=='ogg' and body.startswith(b'OggS')) or (ext=='m4a' and body[4:8]==b'ftyp')
    if not valid:raise ValueError('录音文件不完整，请重录后再保存。')
    identifier=secrets.token_hex(16)
    metadata={'id':identifier,'promptId':prompt_id,'text':prompt['text'],'title':prompt['title'],'duration':round(duration,2),'mime':mime,'bytes':len(body),'created':time.time(),'sha256':hashlib.sha256(body).hexdigest(),'status':'待试听与音色生成验证'}
    with LOCK:
        STORE.mkdir(parents=True,exist_ok=True)
        (STORE/(identifier+'.'+ext)).write_bytes(body)
        (STORE/(identifier+'.json')).write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    return metadata

def handle(handler):
    if not authorized(handler):
        handler.close_connection=True
        return handler.json_response({'error':'请先输入上传密码'},401)
    if handler.command=='GET':
        route=urlparse(handler.path).path
        if '/mentor/' in route and route.rstrip('/').endswith('/trial'):
            return serve_trial(handler)
        if '/self/' in route and route.rstrip('/').endswith('/trial'):
            return serve_self_trial(handler)
        return handler.json_response(status())
    try:
        if handler.path.startswith('/api/voice-reference/mentor/'):return mentor_upload(handler)
        size=int(handler.headers.get('Content-Length','0'))
        if not 1000<=size<=MAX_BYTES:
            handler.close_connection=True
            return handler.json_response({'error':'录音大小不合适，请分段录制。'},413)
        body=handler.rfile.read(size)
        if len(body)!=size:raise ValueError('上传没有完成，请重试。')
        return handler.json_response(save(body,handler.headers.get('Content-Type',''),handler.headers.get('X-Voice-Prompt',''),float(handler.headers.get('X-Voice-Duration','0'))),201)
    except (ValueError,OverflowError) as e:return handler.json_response({'error':str(e)},400)
