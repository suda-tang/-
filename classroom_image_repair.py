"""Supplement saved PPTs independently of long-running course generation."""
import concurrent.futures,json,re,subprocess,os,threading,time,tempfile
from pathlib import Path
from storage import write_json
ROOT=Path(__file__).resolve().parent
STORE=ROOT/'.sites-runtime/classrooms'
POOL=concurrent.futures.ThreadPoolExecutor(max_workers=2)
LOCK=threading.Lock()
ACTIVE=set()

def repair(ident):
    target=STORE/(ident+'.json')
    course=json.loads(target.read_text(encoding='utf-8'))
    if course.get('status') in ('queued','generating'):return course
    if not course.get('scenes'):raise ValueError('请先生成课件')
    source=json.loads((STORE/(ident+'.input.json')).read_text(encoding='utf-8'))
    baseline={s['id']:json.dumps(s,sort_keys=True) for s in course['scenes']}
    handle=tempfile.NamedTemporaryFile(mode='w',suffix='.json',dir=STORE,encoding='utf-8',delete=False)
    try:
        json.dump({**source,**course,'imagesOnly':True},handle,ensure_ascii=False);handle.close()
        executable=str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
        process=subprocess.Popen([executable,str(ROOT/'services/openmaic/illustrate-course.mjs'),handle.name],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,encoding='utf-8',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        timeout=threading.Timer(210,process.kill);timeout.start();events=[];last_progress=0
        try:
            for line in process.stdout:
                if not line.startswith('{'):continue
                event=json.loads(line);events.append(event)
                if event.get('type')=='progress' and time.monotonic()-last_progress>1:
                    latest=json.loads(target.read_text(encoding='utf-8'))
                    latest.update(imagesMessage=event.get('message','正在取得联网插图'),updatedAt=time.time());write_json(target,latest);last_progress=time.monotonic()
            process.wait()
            if process.returncode and not any(e.get('type')=='error' for e in events):raise RuntimeError('联网配图进程未完成，可保留现有课件后重试')
        finally:
            timeout.cancel();process.stdout.close()
        updated=json.loads(target.read_text(encoding='utf-8'));count=0
        for event in events:
            if event.get('type')=='outline':updated['outlines']=event['outlines']
            if event.get('type')=='visual-report':updated['visuals']=event['visuals'];updated['imagesDesignVersion']=event.get('version','legacy')
            if event.get('type')!='scene':continue
            scene=event['scene']
            if scene.get('imageSupplement') and scene['id'] not in baseline:
                updated['scenes'].append(scene);count+=1;continue
            for i,current in enumerate(updated['scenes']):
                if current['id']==scene['id'] and json.dumps(current,sort_keys=True)==baseline.get(scene['id']):
                    updated['scenes'][i]=scene;count+=1
        errors=[e.get('message','') for e in events if e.get('type')=='error']
        web_count=len({e.get('sourceUrl') for scene in updated['scenes'] for e in scene.get('content',{}).get('canvas',{}).get('elements',[]) if e.get('type')=='image' and e.get('sourceUrl')})
        updated.update(imagesStatus='complete' if web_count>=20 else 'failed',imagesMessage=('已补充 '+str(web_count)+' 幅联网插图') if web_count>=20 else ('目前取得 '+str(web_count)+'/20 张联网插图；'+('；'.join(errors) or '未取得联网插图，现有课件保留，可以重试补图')),updatedAt=time.time())
        write_json(target,updated)
        return updated
    finally:
        handle.close();Path(handle.name).unlink(missing_ok=True)

def start(ident):
    if not re.fullmatch('[a-f0-9]{32}',ident):raise ValueError('无效课堂编号')
    course=json.loads((STORE/(ident+'.json')).read_text(encoding='utf-8'))
    if course.get('status') in ('queued','generating'):return course
    with LOCK:
        if ident in ACTIVE:return course
        ACTIVE.add(ident)
    course.update(imagesStatus='running',imagesMessage='正在联网补充课件插图',updatedAt=time.time());write_json(STORE/(ident+'.json'),course)
    def run():
        try:repair(ident)
        except Exception as error:
            latest=json.loads((STORE/(ident+'.json')).read_text(encoding='utf-8'));latest.update(imagesStatus='failed',imagesMessage=str(error),updatedAt=time.time());write_json(STORE/(ident+'.json'),latest)
        finally:
            with LOCK:ACTIVE.discard(ident)
    POOL.submit(run)
    return course
