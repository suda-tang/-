"""Cached, serialized CPU generation of personalized mentor introductions."""
import hashlib,json,threading,subprocess,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
ROOT=Path(__file__).resolve().parent
LOCK=threading.Lock()
PYTHON=Path('C:/Users/mail/AppData/Local/Programs/Python/Python312/python.exe')
def handle(handler):
    name=parse_qs(urlparse(handler.path).query).get('name',[''])[0].strip()[:50]
    if not name or any(ord(c)<32 for c in name):return handler.json_response({'error':'请提供来访教师姓名'},400)
    digest=hashlib.sha256(('zipvoice-short-v2:'+name).encode()).hexdigest()[:24]
    folder=ROOT/'dist/narration/greetings';folder.mkdir(parents=True,exist_ok=True)
    request=folder/(digest+'.json');audio=folder/(digest+'.m4a')
    with LOCK:
        if request.exists() and parse_qs(urlparse(handler.path).query).get('retry')==['1'] and json.loads(request.read_text(encoding='utf-8')).get('status')=='failed':request.unlink()
        if not request.exists():
            tracks=json.loads((ROOT/'dist/narration/tour.json').read_text(encoding='utf-8'))
            text=tracks[0]['text'].replace('老师您好，谢谢您抽出时间来看唐秋鸣的项目。',name+'老师您好，谢谢您抽出时间来看唐秋鸣的项目。',1)
            request.write_text(json.dumps({'name':name,'text':text,'greeting':name+'老师您好。','status':'queued','model':'ZipVoice distill INT8'},ensure_ascii=False),encoding='utf-8')
            threading.Thread(target=generate,args=(request,),daemon=True).start()
    state=json.loads(request.read_text(encoding='utf-8'));state['progress']={'queued':0,'loading':20,'synthesizing':60,'joining':90,'complete':100}.get(state.get('status'),0);state['lastUpdateSeconds']=max(0,round(time.time()-request.stat().st_mtime));state['url']='/narration/greetings/'+audio.name+'?v='+str(int(audio.stat().st_mtime)) if audio.exists() else None
    return handler.json_response(state)
GENERATION_LOCK=threading.Lock()
def generate(request):
    with GENERATION_LOCK:
        result=subprocess.run([str(PYTHON),str(ROOT/'scripts/synthesize-greeting.py'),str(request)],cwd=str(ROOT),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,creationflags=0x08000000)
        if result.returncode:
            state=json.loads(request.read_text(encoding='utf-8'));state.update(status='failed',error=result.stdout.decode('utf-8',errors='replace')[-2000:]);request.write_text(json.dumps(state,ensure_ascii=False),encoding='utf-8')
