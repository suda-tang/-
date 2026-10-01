"""Dependency-free localhost server. PDF recognition uses an external Audiveris executable."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
import ipaddress
from concurrent.futures import ThreadPoolExecutor
import os, json, subprocess, uuid, zipfile, io, gzip, threading, time, shutil, hashlib, socket, re, sys
from score_book import join_scores
import omr_normalize
from storage import write_json

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'dist'
JOBS_DIR = ROOT / '.sites-runtime' / 'jobs'
CACHE_DIR = ROOT / '.sites-runtime' / 'score-cache'
POOL = ThreadPoolExecutor(max_workers=1)
JOBS = {}
LOCK = threading.Lock()
PORT = int(os.environ.get('PIANO_PORT', '5173'))
# 额外放行的主机名白名单（本机 127.0.0.1/localhost 之外），用于通过内网穿透
# 域名访问；逗号分隔。真实域名不写进仓库（仓库是公开的），部署时用环境变量
# PIANO_ALLOWED_HOSTS 注入 —— 见部署侧的 frp/launch.py。
ALLOWED_HOSTS = {h.strip().lower() for h in os.environ.get('PIANO_ALLOWED_HOSTS', '').split(',') if h.strip()}

def persist_queue():
    path=ROOT/'.sites-runtime/queue.json';path.parent.mkdir(parents=True,exist_ok=True)
    keys=('id','digest','status','created','progress','completedPages','totalPages','error')
    write_json(path,[{k:j[k] for k in keys if k in j} for j in JOBS.values()])

def enqueue_recognition(data,digest,force=False,fine=False):
    cached=None if force else read_cached_score(digest)
    with LOCK:
        for job in JOBS.values():
            if job.get('digest')==digest and job.get('status') in ('running','queued'):
                return {'id':job['id'],'status':job['status'],'resumed':True}
        job_id=str(uuid.uuid4())
        JOBS[job_id]={'id':job_id,'digest':digest,'created':time.time(),'status':'complete' if cached else 'queued','progress':100 if cached else 0,'stage':'精细识谱排队中' if fine and not cached else ''}
        if cached:JOBS[job_id].update(xml=cached['xml'],metadata=cached.get('metadata',{}),cached=True)
        persist_queue()
    if not cached:POOL.submit(recognize,job_id,data,digest,fine)
    return {'id':job_id,'status':'complete' if cached else 'queued','cached':bool(cached)}

def recover_queue():
    path=ROOT/'.sites-runtime/queue.json'
    if not path.exists():return
    try:previous=json.loads(path.read_text(encoding='utf-8'))
    except (OSError,ValueError):return
    resume=[]
    for job in previous:
        digest=job.get('digest','')
        if not re.fullmatch(r'[a-f0-9]{64}',digest):continue
        pdf=CACHE_DIR/(digest+'.pdf')
        if job.get('status') in ('queued','running') and pdf.exists():
            job['status']='queued';JOBS[job['id']]=job;resume.append((job['id'],pdf,digest))
        else:JOBS[job['id']]=job
    for job_id,pdf,digest in resume:POOL.submit(recognize,job_id,pdf.read_bytes(),digest)

def audiveris_path():
    configured = os.environ.get('AUDIVERIS_PATH')
    candidates = [Path(configured)] if configured else []
    candidates += [ROOT / '.sites-runtime/omr/Audiveris/Audiveris.exe', Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Audiveris/Audiveris.exe']
    extracted = ROOT / '.sites-runtime/omr/extracted'
    if extracted.exists(): candidates.extend(extracted.rglob('Audiveris.exe'))
    if shutil.which('Audiveris'): candidates.append(Path(shutil.which('Audiveris')))
    return next((str(p.resolve()) for p in candidates if p.is_file()), None)

def cache_path(digest):
    if not re.fullmatch(r'[a-f0-9]{64}', digest): raise ValueError('无效琴谱编号')
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f'{digest}.json'

def read_cached_score(digest, repair=True):
    path = cache_path(digest)
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError, TypeError):
        return None
    if not (isinstance(value.get('xml'), str) and value['xml'].startswith('<?xml')):
        return None
    metadata_file=CACHE_DIR/(digest+'.metadata.json')
    if metadata_file.exists():
        try:value['metadata']={**value.get('metadata',{}),**json.loads(metadata_file.read_text(encoding='utf-8'))}
        except (OSError, ValueError):pass
    # Scores recognized before the part-structure repair carry the OMR engine's
    # stray staves: a two-staff piano solo rendered as three, with a phantom
    # "Voice" part and a bass clef printed above a treble one. Repairing on read
    # fixes every existing score without re-running a multi-minute OMR pass.
    if repair and value.get('parts')!=omr_normalize.REVISION:
        try:
            repaired=omr_normalize.normalize(value['xml'])
            if repaired!=value['xml']:value['xml']=repaired
            value['parts']=omr_normalize.REVISION
            store_cached_score(path,value)
        except Exception:
            pass
        value['parts']=omr_normalize.REVISION
    return value

def looks_like_filename(value):
    text=str(value or '').strip()
    return (not text or '\ufffd' in text or text.lower().endswith('.pdf') or
            bool(re.search(r'[_ -]\d{4,}$', text)))

def ocr_title(metadata):
    metadata=metadata or {}
    candidate=str(metadata.get('ocrTitle') or '').strip()
    return '' if looks_like_filename(candidate) or str(metadata.get('titleVersion','')) not in ('4','6','7') else candidate

def store_cached_score(path, payload):
    temporary = path.with_suffix('.'+uuid.uuid4().hex+'.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    temporary.replace(path)

def write_cached_score(digest, xml, metadata=None, parts=None):
    path = cache_path(digest)
    previous = read_cached_score(digest, repair=False) or {}
    payload = {'version': 1, 'xml': xml, 'metadata': metadata or previous.get('metadata', {}), 'saved': previous.get('saved', time.time())}
    # Metadata-only rewrites must not throw away the part-structure revision, or
    # every later read would redo the repair.
    marker = previous.get('parts') if parts is None else parts
    if marker is not None: payload['parts'] = marker
    store_cached_score(path, payload)

# --- Recognition variants -------------------------------------------------
# 同一份 PDF 可能被识别两次（标准 Audiveris 与“精细/替代模型”高分辨率那一遍）。
# 两版结果都保留，让用户在前端切换。只有在确实存在两版时才写 variants 文件，
# 普通识谱流程完全不受影响。
VARIANT_LABELS = {'standard': '标准识谱', 'fine': '精细识谱'}

def variants_path(digest):
    if not re.fullmatch(r'[a-f0-9]{64}', digest): raise ValueError('无效琴谱编号')
    return CACHE_DIR / (digest + '.variants.json')

def read_variants(digest):
    try: value = json.loads(variants_path(digest).read_text(encoding='utf-8'))
    except (OSError, ValueError, TypeError): return None
    entries = value.get('entries') if isinstance(value, dict) else None
    if not isinstance(entries, dict) or not entries: return None
    return value

def store_variant(digest, name, xml, active=True):
    value = read_variants(digest) or {'active': name, 'entries': {}}
    value['entries'][name] = {'xml': xml, 'saved': time.time()}
    if active or value.get('active') not in value['entries']: value['active'] = name
    path = variants_path(digest); temporary = path.with_suffix('.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8'); temporary.replace(path)
    return value

def variants_summary(digest):
    value = read_variants(digest)
    if not value or len(value['entries']) < 2: return None
    return {'active': value['active'], 'available': [
        {'id': key, 'name': VARIANT_LABELS.get(key, key), 'saved': entry.get('saved')}
        for key, entry in value['entries'].items()]}

def activate_variant(digest, name):
    value = read_variants(digest)
    if not value or len(value['entries']) < 2: raise ValueError('该曲谱还没有可切换的识谱版本')
    if name not in value['entries']: raise ValueError('没有这个识谱版本')
    value['active'] = name
    path = variants_path(digest); temporary = path.with_suffix('.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8'); temporary.replace(path)
    # Mirror the chosen version into the main cache so every reader agrees.
    cached = read_cached_score(digest) or {}
    write_cached_score(digest, value['entries'][name]['xml'], cached.get('metadata', {}))
    return value

def unpack_musicxml(data):
    from xml.etree import ElementTree as ET
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if sum(i.file_size for i in archive.infolist()) > 30 * 1024 * 1024:
            raise ValueError('解压后的 MusicXML 超过限制')
        if 'META-INF/container.xml' in archive.namelist():
            root = ET.fromstring(archive.read('META-INF/container.xml'))
            candidates = [n.attrib['full-path'] for n in root.iter() if n.tag.split('}')[-1] == 'rootfile' and 'full-path' in n.attrib]
        else:
            candidates = [n for n in archive.namelist() if n.endswith(('.xml', '.musicxml')) and not n.startswith('META-INF/')]
        if not candidates: raise ValueError('压缩包中没有 MusicXML')
        return archive.read(candidates[0]).decode('utf-8-sig')

def prepare_score(data, destination, fine=False):
    # Audiveris rasterizes PDFs at 300 DPI and rejects pages over 20M pixels.
    # Resize only oversized pages, preserving aspect ratio and vector content.
    import fitz
    with fitz.open(stream=data, filetype='pdf') as source:
        if source.needs_pass:
            raise ValueError('PDF 已加密，请先解除密码')
        factor = (400 if fine else 300) / 72
        lower,upper=(9000000,16000000) if fine else (6000000,18000000)
        if all(lower <= page.rect.width * page.rect.height * factor**2 <= upper for page in source):
            destination.write_bytes(data)
            return
        with fitz.open() as output:
            for page in source:
                area = page.rect.width * page.rect.height * factor**2
                scale = (12000000 / area)**0.5 if area < lower else min(1, (14000000 / area)**0.5)
                target = output.new_page(width=page.rect.width * scale, height=page.rect.height * scale)
                target.show_pdf_page(target.rect, source, page.number)
            output.save(destination, garbage=3, deflate=True)

def recognition_error(log_text, returncode):
    if 'Comparison method violates its general contract' in log_text:
        return '识谱引擎在密集音符或连线页面的排序阶段异常；已启用兼容排序重试。若仍失败，请将该页单独导出为 300 DPI 图片后重试。诊断日志已保存在服务端'
    # Audiveris exits with code 1 when the page reaches GRID but no
    # five-line system can be built.  This is a document/scan problem, not
    # a missing server dependency; expose that distinction to the client.
    if 'No system found' in log_text or 'Created scores: []' in log_text:
        return '未检测到可识别的五线谱系统；请上传包含清晰五线谱的页面，裁掉封面、歌词和空白页后重试。诊断日志已保存在服务端'
    if 'No parts found' in log_text or 'No music symbols' in log_text:
        return '页面中未检测到音乐符号；请检查扫描清晰度、对比度和页面方向后重试。诊断日志已保存在服务端'
    if 'too low interline' in log_text:
        return '五线谱线间距过小，识谱引擎无法辨认；需要更清晰的扫描件或按谱面裁切'
    if 'OutOfMemoryError' in log_text:
        return '识谱引擎内存不足，请减少本次上传页数后重试'
    if 'UnsupportedClassVersionError' in log_text:
        return '识谱引擎的 Java 版本不兼容，需要修复服务端运行环境'
    if 'AccessDeniedException' in log_text or 'Permission denied' in log_text:
        return '识谱引擎无法读写临时文件，需要检查服务端目录权限'
    if 'UnsatisfiedLinkError' in log_text or 'NoClassDefFoundError' in log_text:
        return '识谱引擎依赖加载失败，需要修复服务端安装'
    return f'识谱引擎异常退出（代码 {returncode}），诊断日志已保存在服务端'

def job_progress(job):
    if job.get("totalPages") and job.get("status")=="running":
        job.update(progress=round(job.get("completedPages",0)/job["totalPages"]*100),stage=f'已识别 {job.get("completedPages",0)} / {job["totalPages"]} 页')
        return job
    if job.get('status') != 'running': return job
    path=JOBS_DIR/job['id']/'recognition.log'
    try:
        log=path.read_text(encoding='utf-8',errors='replace')
        total=re.search(r'(\d+) sheets in ',log)
        pages=re.findall(r'\[score#(\d+)\]',log)
        if total and pages:
            count=int(total.group(1));page=min(count,int(pages[-1]))
            job.update(page=page,pages=count,progress=round((page-1)/count*100),stage=f'正在识别第 {page} / {count} 页')
    except OSError: pass
    return job

def detect_pdf_bands(pdf_path, page_number, rows):
    """Find the vertical bands occupied by grand-staff systems in a page.

    MusicXML gives us reliable horizontal measure positions but many OMR
    exports omit note y coordinates. A low-resolution staff-line projection
    gives a much closer vertical overlay than dividing the page into equal
    thirds, especially on title pages.
    """
    import fitz
    rows=max(1,min(12,int(rows or 1)))
    cache=CACHE_DIR/f'{pdf_path.stem}.geometry{page_number}.{rows}.json'
    def normalize(value):
        bands=value.get('bands') if isinstance(value,dict) else None
        if not isinstance(bands,list): return value
        for index in range(len(bands)-1):
            current,next_band=bands[index],bands[index+1]
            if current.get('bottom',0)>next_band.get('top',100):
                boundary=round((current['bottom']+next_band['top'])/2,3)
                current['bottom']=boundary;next_band['top']=boundary
        return value
    try:
        value=json.loads(cache.read_text(encoding='utf-8'))
        if isinstance(value.get('bands'),list): return normalize(value)
    except (OSError,ValueError,TypeError): pass
    with fitz.open(pdf_path) as document:
        if page_number<1 or page_number>document.page_count: raise ValueError('页码超出范围')
        page=document.load_page(page_number-1)
        pix=page.get_pixmap(matrix=fitz.Matrix(1,1),colorspace=fitz.csGRAY,alpha=False)
        width,height=pix.width,pix.height;raw=memoryview(pix.samples);stride=pix.stride
        peaks=[]
        for y in range(height):
            row=raw[y*stride:(y+1)*stride]
            dark=sum(1 for value in row if value<145)
            if dark>width*.22: peaks.append(y)
    runs=[]
    for y in peaks:
        if not runs or y-runs[-1][-1]>3: runs.append([y])
        else: runs[-1].append(y)
    bands=[]
    if len(runs)>=rows:
        for index in range(rows):
            start=round(index*len(runs)/rows);end=round((index+1)*len(runs)/rows)
            chunk=runs[start:max(start+1,end)]
            top=max(0,chunk[0][0]-24);bottom=min(height,chunk[-1][-1]+28)
            bands.append({'top':round(top/height*100,3),'bottom':round(bottom/height*100,3)})
    if len(bands)!=rows:
        bands=[{'top':round(7+index/rows*86,3),'bottom':round(7+(index+1)/rows*86,3)} for index in range(rows)]
    value=normalize({'width':width,'height':height,'bands':bands})
    try:
        temporary=cache.with_suffix('.tmp');temporary.write_text(json.dumps(value),encoding='utf-8');temporary.replace(cache)
    except OSError: pass
    return value

def recognize(job_id, data, digest, fine=False):
    with LOCK:
        JOBS[job_id]['status']='running';persist_queue()
    folder = JOBS_DIR / job_id
    folder.mkdir(parents=True, exist_ok=True)
    try:
        score = folder / 'score.pdf'
        prepare_score(data, score, fine=fine)
        name_file=CACHE_DIR/(digest+'.name')
        numbered=name_file.exists() and name_file.read_text(encoding='utf-8',errors='ignore').startswith('简谱·')
        if numbered:
            # 简谱（numbered notation）识别走本地 OCR 方案（jianpu.py），
            # 与 Audiveris 五线谱 OMR 完全隔离，互不影响；不需要任何外部引擎。
            import jianpu
            title = Path(name_file.read_text(encoding='utf-8')).stem.replace('简谱·', '')

            def _numbered_progress(pct, message):
                with LOCK:
                    JOBS[job_id].update(progress=max(0, min(100, int(pct))),
                                       stage=message, status='running')
                persist_queue()

            result = jianpu.recognize(score, progress=_numbered_progress, title=title or '简谱识别结果')
            first_xml = result['xml']
            meta = result.get('meta', {})
            write_cached_score(digest, first_xml, {
                'title': title, 'ocrTitle': title, 'notationType': 'numbered',
                'beats': meta.get('beats'), 'beatType': meta.get('beatType'),
                'tonic': meta.get('tonic'), 'keyName': meta.get('keyName'),
            })
            with LOCK:
                JOBS[job_id].update(status='complete', xml=first_xml,
                                    metadata={'notationType': 'numbered', 'title': title,
                                              'beats': meta.get('beats'), 'beatType': meta.get('beatType'),
                                              'tonic': meta.get('tonic'), 'keyName': meta.get('keyName')},
                                    digest=digest, cached=False, progress=100)
            return
        executable = audiveris_path()
        if not executable: raise ValueError('尚未安装或配置 Audiveris')
        import fitz
        inputs=[]
        if score.exists():
            with fitz.open(score) as source:
                for index in range(source.page_count):
                    page_file=folder/f'page-{index+1}.pdf'
                    with fitz.open() as page_doc:
                        page_doc.insert_pdf(source,from_page=index,to_page=index);page_doc.save(page_file)
                    inputs.append(page_file)
        else: inputs=[score]
        xmls=[];page_results=[]
        for index,page_file in enumerate(inputs):
            from idle_runtime import checkpoint
            checkpoint()
            output=folder/f'output-{index+1}'
            # A cancelled/retried Windows job can leave its private output
            # directory behind. Clear only this job's temporary folder before
            # starting the page so WinError 183 cannot abort at 0%.
            if output.exists(): shutil.rmtree(output,ignore_errors=True)
            output.mkdir(parents=True,exist_ok=True)
            with LOCK:JOBS[job_id].update(completedPages=index,totalPages=len(inputs))
            with (folder / 'recognition.log').open('w',encoding='utf-8') as log:
                # Audiveris 5.11 can throw Java's comparator-contract error
                # while sorting stems on dense scanned pages.  Legacy merge
                # sort is stable and lets those pages finish instead of
                # returning the generic exit-code 1.
                environment=os.environ.copy();environment.setdefault('JAVA_TOOL_OPTIONS','-Djava.util.Arrays.useLegacyMergeSort=true')
                process=subprocess.run([executable,'-batch','-transcribe','-export','-output',str(output),'--',str(page_file)],stdout=log,stderr=subprocess.STDOUT,timeout=900,env=environment,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            log_text=(folder/'recognition.log').read_text(encoding='utf-8',errors='replace')
            if process.returncode:raise ValueError(recognition_error(log_text,process.returncode))
            files=sorted(list(output.rglob('*.mxl'))+list(output.rglob('*.musicxml')),key=lambda p:[int(x) if x.isdigit() else x for x in re.split(r'(\d+)',p.name)])
            if not files:raise ValueError(f'第 {index+1} 页未生成可用音符')
            page_xmls=[]
            for result in files:
                xml=unpack_musicxml(result.read_bytes()) if result.suffix=='.mxl' else result.read_text(encoding='utf-8-sig')
                if xmls:
                    from xml.etree import ElementTree as ET
                    root=ET.fromstring(xml)
                    for part in root.findall('part'):
                        measure=part.find('measure')
                        if measure is not None:
                            pr=measure.find('print')
                            if pr is None:pr=ET.SubElement(measure,'print')
                            pr.set('new-page','yes')
                    xml='<?xml version="1.0"?>'+ET.tostring(root,encoding='unicode')
                xmls.append(xml);page_xmls.append(xml)
            partial=omr_normalize.normalize(join_scores(xmls,'') if len(xmls)>1 else xmls[0])
            page_results.append(omr_normalize.normalize(join_scores(page_xmls,'') if len(page_xmls)>1 else page_xmls[0]))
            with LOCK:JOBS[job_id].update(partialXml=partial,partialPages=list(page_results),revision=index+1,completedPages=index+1)
        name_file=CACHE_DIR/(digest+'.name')
        title=Path(name_file.read_text(encoding='utf-8')).stem if name_file.exists() else '导入琴谱'
        first_xml=omr_normalize.normalize(join_scores(xmls,title) if len(xmls)>1 else xmls[0])
        # A "精细 / 替代模型" pass re-reads the same PDF at higher resolution.
        # Keep the version it is about to replace so the two can be switched.
        if fine:
            previous=read_cached_score(digest)
            if previous and previous.get('xml') and previous.get('xml')!=first_xml:
                store_variant(digest,'standard',previous['xml'],active=False)
            store_variant(digest,'fine',first_xml,active=True)
        elif read_variants(digest):
            store_variant(digest,'standard',first_xml,active=True)
        # The filename is only an internal fallback. It must never be exposed
        # as the cloud library's OCR title.
        metadata={'title':'','ocrTitle':'','source':'recognition','joined':'true'} if len(xmls)>1 else {}
        write_cached_score(digest,first_xml,metadata,parts=omr_normalize.REVISION)
        with LOCK: JOBS[job_id].update(status='complete', xml=first_xml, metadata=metadata, digest=digest, cached=False)
    except subprocess.TimeoutExpired:
        with LOCK: JOBS[job_id].update(status='failed', error='识谱超过 15 分钟，请按单首曲目拆分 PDF 后重试')
    except Exception as error:
        with LOCK: JOBS[job_id].update(status='failed', error=str(error))
    finally:
        with LOCK:persist_queue()
        log_path=folder/'recognition.log'
        if log_path.exists():
            diagnostics=ROOT/'.sites-runtime'/'diagnostics'
            diagnostics.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(log_path,diagnostics/(digest+'.log'))
        # Temporary scores stay only for the running job; preserve no uploaded PDF.
        shutil.rmtree(folder, ignore_errors=True)

# 文本类资源 gzip 后通常只剩三成左右，而首屏要拉 20 多个 js/css，
# 不压缩在公网（尤其手机）上会明显变慢。
GZIP_TYPES = {'.html', '.js', '.mjs', '.css', '.svg', '.json', '.xml', '.txt', '.map'}
_GZIP_CACHE = {}
# 合并输出的样式表，顺序必须与 index.html 里 <link> 的先后顺序一致，
# 否则层叠结果会变。这里写死而不从 index.html 动态读：改过之后页面里
# 只剩 bundle.css 自己一条，动态提取会把自己也读进去，成死循环。
# 以后在 index.html 里增删样式表，记得同步改这里。
BUNDLE_CSS = ['style.css', 'player.css', 'progress.css', 'library.css', 'desktop.css',
              'campus.css', 'refinement.css', 'editing.css', 'mobile.css', 'workspace.css',
              'glass.css', 'media-import.css', 'polish.css']
_BUNDLE_CACHE = {}

def gzip_cached(path):
    """压缩后按 mtime 缓存一份，免得每个请求都重压一遍大文件。"""
    try:
        mtime = os.path.getmtime(path)
        raw = open(path, 'rb').read()
    except OSError:
        return None
    if len(raw) < 512:
        return None                      # 太小，压了也省不出什么
    hit = _GZIP_CACHE.get(path)
    if hit and hit[0] == mtime and hit[1] == len(raw):
        return hit[2]
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6, mtime=0) as stream:
        stream.write(raw)
    data = buf.getvalue()
    _GZIP_CACHE[path] = (mtime, len(raw), data)
    return data

class Handler(SimpleHTTPRequestHandler):
    # 默认 HTTP/1.0：那样每个资源都要重新握手一次，首屏四十几个请求就是四十几
    # 次 TCP（HTTPS 下还要 TLS）握手 —— 手机上每次上百毫秒，累积起来好几秒。
    # 改 1.1 后连接可复用，握手只做一次，这一项对首屏的影响最大。
    protocol_version = 'HTTP/1.1'
    # 连接复用会占住线程，给个读超时，免得空闲连接一直挂着不释放。
    timeout = 30
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(PUBLIC), **kwargs)
    def send_head(self):
        """文本资源走 gzip；音频 / PDF / 位图等照原样交给父类。"""
        if 'gzip' not in (self.headers.get('Accept-Encoding') or '').lower():
            return super().send_head()
        path = self.translate_path(self.path)
        # 目录请求（比如 "/"）在父类里会去找 index.html —— 这个入口同样值得压缩。
        target = os.path.join(path, 'index.html') if os.path.isdir(path) else path
        if not os.path.isfile(target):
            return super().send_head()
        if os.path.splitext(target)[1].lower() not in GZIP_TYPES:
            return super().send_head()
        body = gzip_cached(target)
        if body is None:
            return super().send_head()
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(target))
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Vary', 'Accept-Encoding')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        return io.BytesIO(body)
    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        immutable_page=self.path.startswith('/api/scores/') and '/page/' in self.path
        # vendor 下的第三方库版本稳定，可以长期缓存；dist 自身还在迭代，
        # 保持 no-store，免得改了前端却因为缓存不生效。
        long_lived=self.path.startswith('/assets/piano/salamander/') or immutable_page or self.path.startswith('/vendor/')
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if long_lived else 'no-store')
        super().end_headers()
    def json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def allowed(self):
        host = self.headers.get('Host', '').rsplit(':', 1)[0].strip('[]')
        if host.lower() not in {'127.0.0.1', 'localhost'} and host.lower() not in ALLOWED_HOSTS:
            try:
                # Host 必须是 IP 字面量（IPv4/IPv6 均可，含外网 IPv6 直连）。
                # 其余域名 Host 一律拒绝 —— DNS rebinding 攻击时 Host 是域名，照常拦截。
                # 例外：显式写进 ALLOWED_HOSTS 的域名（内网穿透用途）。
                ipaddress.ip_address(host)
            except ValueError:
                return False
        origin = self.headers.get('Origin')
        return not origin or (urlparse(origin).hostname or '').strip('[]').lower() == host.lower()
    def send_bundle(self):
        """把十来份样式表拼成一份返回。

        内容一字不改、拼接顺序与 index.html 里原来的 <link> 顺序完全一致，
        所以层叠结果不变 —— 只是把十几个请求压成 1 个。加载页（含进度条）
        要等样式表下载完才画得出来，这是让它尽快露面的关键一步。
        """
        parts, stamps = [], []
        for name in BUNDLE_CSS:
            source = PUBLIC / name
            try:
                stamps.append(source.stat().st_mtime)
                parts.append(source.read_text(encoding='utf-8'))
            except OSError:
                continue
        raw = '\n'.join(parts).encode('utf-8')
        want_gzip = 'gzip' in (self.headers.get('Accept-Encoding') or '').lower()
        body, encoding = raw, None
        if want_gzip:
            key = max(stamps) if stamps else 0
            hit = _BUNDLE_CACHE.get('css')
            if hit and hit[0] == key:
                body = hit[1]
            else:
                buf = io.BytesIO()
                with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6, mtime=0) as stream:
                    stream.write(raw)
                body = buf.getvalue()
                _BUNDLE_CACHE['css'] = (key, body)
            encoding = 'gzip'
        self.send_response(200)
        self.send_header('Content-Type', 'text/css; charset=utf-8')
        if encoding:
            self.send_header('Content-Encoding', encoding)
            self.send_header('Vary', 'Accept-Encoding')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if not self.allowed(): return self.json_response({'error':'仅接受本机同源请求'},403)
        if urlparse(self.path).path=='/api/voice-reference' or urlparse(self.path).path.startswith('/api/voice-reference/mentor/') or urlparse(self.path).path.startswith('/api/voice-reference/self/'):
            import voice_capture
            return voice_capture.handle(self)
        if urlparse(self.path).path=='/bundle.css': return self.send_bundle()
        if self.path=='/api/import-capabilities':
            return self.json_response({'pdf':True,'photos':True,'media':(ROOT/'.sites-runtime/transcription-vendor/transkun/pretrained/2.0.pt').exists(),'engine':'Transkun V2','maxMediaMB':200,'maxMinutes':30,'maxPhotoPages':40})
        if self.path=='/api/arrangement-capabilities':
            from arrangement_music import PROGRAMS,PRESETS,NAMES
            return self.json_response({'styles':[{'id':key,'name':name} for key,name in NAMES.items()],'programs':[{'id':key,'name':name} for key,name in PROGRAMS.items()],'presets':PRESETS,'meterAdapter':True})
        path = urlparse(self.path).path
        if path.startswith('/api/arrangements/'):
            import arrangement_service
            key=path.split('/')[-1]
            if not re.fullmatch(r'[a-f0-9]{64}',key):return self.json_response({'error':'无效作品'},400)
            target=arrangement_service.CACHE/(key+'.json');xml=target.with_suffix('.musicxml')
            if not target.exists() or not xml.exists():return self.json_response({'error':'总谱尚未生成'},404)
            data=json.loads(target.read_text(encoding='utf-8'));manifest=target.with_suffix('.manifest.json')
            if manifest.exists():
                import background_jobs
                source=json.loads(manifest.read_text(encoding='utf-8'));data['title']=background_jobs.score_title(source.get('digest'))
            return self.json_response({**data,'xml':xml.read_text(encoding='utf-8'),'key':key})
        if path=='/api/tasks':
            with LOCK:jobs=[job_progress({k:v for k,v in j.items() if k not in ('xml','partialXml','partialPages','diagnostic')}) for j in JOBS.values()]
            import background_jobs,performance_service
            jobs+=background_jobs.tasks()
            with performance_service.LOCK:perf_keys=list(performance_service.JOBS)
            jobs+=[{k:v for k,v in performance_service.status(key).items() if k!='result'} for key in perf_keys]
            for job in jobs:
                job['scoreTitle']=background_jobs.score_title(job.get('digest'))
            from idle_runtime import foreground
            return self.json_response({'tasks':sorted(jobs,key=lambda j:(j.get('status') not in ('queued','running'),-j.get('created',0)))[:150],'foreground':foreground()})
        if path=='/api/performance':
            import performance_service
            return self.json_response({'available':performance_service.available()})
        if path.startswith('/api/performance/'):
            import performance_service
            return self.json_response(performance_service.status(path.split('/')[-1]))
        if path == '/api/cover':
            from song_cover import lookup
            query=parse_qs(urlparse(self.path).query)
            result=lookup(query.get('title',[''])[0], CACHE_DIR)
            digest=query.get('digest',[''])[0]
            if re.fullmatch(r'[a-f0-9]{64}',digest) and result.get('artwork'):
                cached=read_cached_score(digest) or {}
                meta={**cached.get('metadata',{}),'cover':result['artwork'],'coverSource':result.get('provider',''), 'coverTitle':result.get('matchedTitle') or result.get('title','')}
                (CACHE_DIR/(digest+'.metadata.json')).write_text(json.dumps(meta,ensure_ascii=False),encoding='utf-8')
                if cached.get('xml'):write_cached_score(digest,cached['xml'],meta)
            return self.json_response(result)
        if path == '/api/scores':
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            ids = {p.stem for p in CACHE_DIR.glob('*.json')} | {p.stem for p in CACHE_DIR.glob('*.pdf')} | {p.stem for p in CACHE_DIR.glob('*.source')} | {p.name.removesuffix('.photo-book.json') for p in CACHE_DIR.glob('*.photo-book.json')}
            items = []
            for digest in ids:
                if not re.fullmatch(r'[a-f0-9]{64}', digest): continue
                item = read_cached_score(digest) or {}
                meta = item.get('metadata', {})
                sidecar=CACHE_DIR/(digest+'.metadata.json')
                if sidecar.exists():meta={**meta,**json.loads(sidecar.read_text(encoding='utf-8'))}
                if meta.get('hiddenFromLibrary'): continue
                label = CACHE_DIR / (digest+'.name')
                name = label.read_text(encoding='utf-8') if label.exists() else ''
                active=None
                with LOCK:
                    for candidate in JOBS.values():
                        if candidate.get('digest')==digest and (active is None or candidate.get('created',0)>active.get('created',0)):
                            active=job_progress(candidate.copy())
                import background_jobs
                background_active=background_jobs.latest_for_digest(digest)
                # Recognition stays in memory as a completed record.  A newer
                # persistent analysis failure must still be visible on its card.
                if background_active and (active is None or active.get('status')=='complete'):
                    active=background_active
                cloud_title=ocr_title(meta);user_title=str(meta.get('userTitle') or '').strip() if meta.get('titleSource')=='user' else ''
                from title_validation import filename_title
                title=user_title or cloud_title or meta.get('title') or filename_title(name)
                state=active.get('status') if active else ('complete' if item.get('xml') else 'queued');progress=100 if state=='complete' else (active.get('progress',0) if active else 0)
                items.append({'id':digest,'title':title,'cover':meta.get('cover',''),'titleVersion':str(meta.get('titleVersion','')),'titleVerification':meta.get('titleVerification',''),'titleSource':'ocr' if cloud_title else ('user' if user_title else 'pending'),'jobId':active.get('id') if active else None,'ready':bool(item.get('xml')), 'hasPdf':(CACHE_DIR/(digest+'.pdf')).exists(), 'status':state, 'progress':progress, 'stage':active.get('stage',active.get('detail','')) if active else '', 'error':active.get('error','') if active else ('任务已停止，请在任务中心重新处理' if state=='failed' else ''), 'saved':item.get('saved',label.stat().st_mtime if label.exists() else 0)})
            return self.json_response({'scores':sorted(items,key=lambda x:x['saved'],reverse=True)})
        if path.startswith('/api/scores/'):
            parts = path.split('/')
            digest = parts[3]
            if not re.fullmatch(r'[a-f0-9]{64}', digest): return self.json_response({'error':'无效琴谱编号'},400)
            if len(parts)==5 and parts[4]=='cover-fallback':
                from html import escape
                import background_jobs
                title=background_jobs.score_title(digest);hue=int(digest[:6],16)%360
                lines=[title[i:i+9] for i in range(0,min(len(title),36),9)]
                text=''.join(f'<text x="90" y="{650+i*75}" font-size="58" fill="white" font-family="sans-serif">{escape(line)}</text>' for i,line in enumerate(lines))
                body=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl({hue},38%,32%)"/><stop offset="1" stop-color="hsl({(hue+50)%360},38%,12%)"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1200v1200H0z"/><circle cx="860" cy="300" r="350" fill="none" stroke="#ffffff20" stroke-width="100"/><path d="M90 400h700M90 430h700M90 460h700M90 490h700M90 520h700" stroke="#ffffff50" stroke-width="3"/>{text}<text x="90" y="1080" fill="#ffffff90" font-size="25" font-family="sans-serif">SUPERTANG CLOUD</text></svg>').encode('utf-8')
                self.send_response(200);self.send_header('Content-Type','image/svg+xml');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
            if len(parts)==5 and parts[4]=='performance':
                pointer=ROOT/'.sites-runtime/analysis'/(digest+'.performance.json')
                if not pointer.exists():return self.json_response({'status':'pending'},202)
                import performance_service
                saved=json.loads(pointer.read_text(encoding='utf-8'))
                current=read_cached_score(digest) or {}
                if saved.get('xmlHash')!=hashlib.sha256(current.get('xml','').encode()).hexdigest():return self.json_response({'status':'pending'},202)
                return self.json_response(performance_service.status(saved['cacheKey']))
            if len(parts)==5 and parts[4]=='pdf':
                pdf = CACHE_DIR/(digest+'.pdf')
                if not pdf.exists(): return self.json_response({'error':'历史记录未保存原始 PDF'},404)
                body=pdf.read_bytes()
                self.send_response(200); self.send_header('Content-Type','application/pdf'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body); return
            if len(parts)==5 and parts[4]=='vocal':
                vocal=CACHE_DIR/(digest+'.vocal')
                item=read_cached_score(digest) or {}
                if not vocal.exists(): return self.json_response({'error':'这份曲谱尚未绑定演唱音频'},404)
                body=vocal.read_bytes();mime=str(item.get('metadata',{}).get('vocal',{}).get('mime') or 'audio/mpeg')
                self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Accept-Ranges','bytes');self.end_headers();self.wfile.write(body);return
            if len(parts)==5 and parts[4]=='variants':
                return self.json_response(variants_summary(digest) or {'active':None,'available':[]})
            if len(parts)==5 and parts[4]=='info':
                pdf = CACHE_DIR/(digest+'.pdf')
                if not pdf.exists(): return self.json_response({'error':'历史记录未保存原始 PDF'},404)
                try:
                    import fitz
                    with fitz.open(pdf) as document: pages=document.page_count
                    return self.json_response({'pages':pages})
                except Exception as error: return self.json_response({'error':f'无法读取 PDF 页数：{error}'},422)
            if len(parts)==6 and parts[4]=='page' and parts[5].isdigit():
                pdf = CACHE_DIR/(digest+'.pdf'); page_number=int(parts[5])
                if not pdf.exists(): return self.json_response({'error':'历史记录未保存原始 PDF'},404)
                try:
                    raster=CACHE_DIR/f'{digest}.page{page_number}.png'
                    if raster.exists():
                        body=raster.read_bytes()
                    else:
                        import fitz
                        with fitz.open(pdf) as document:
                            if page_number<1 or page_number>min(document.page_count,30): return self.json_response({'error':'页码超出范围'},404)
                            page=document.load_page(page_number-1); scale=min(2.2,max(1.2,1600/max(page.rect.width,page.rect.height)))
                            body=page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False).tobytes('png')
                        temporary=raster.with_suffix('.tmp')
                        try: temporary.write_bytes(body);temporary.replace(raster)
                        except OSError: temporary.unlink(missing_ok=True)
                    self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
                except Exception as error: return self.json_response({'error':f'PDF 页面渲染失败：{error}'},422)
            if len(parts)==6 and parts[4]=='geometry' and parts[5].isdigit():
                pdf=CACHE_DIR/(digest+'.pdf');page_number=int(parts[5])
                if not pdf.exists(): return self.json_response({'error':'历史记录未保存原始 PDF'},404)
                try:
                    from pdf_geometry import detect
                    return self.json_response(detect(pdf,page_number,CACHE_DIR))
                except Exception as error: return self.json_response({'error':f'PDF 谱表定位失败：{error}'},422)
            item=read_cached_score(digest)
            if item:
                value=read_variants(digest);summary=variants_summary(digest)
                if summary:
                    # The variants file is the source of truth for which reading
                    # is shown, so the active one wins over a stale cache entry.
                    active=(value['entries'].get(value['active']) or {}).get('xml')
                    item={**item,'variants':summary,**({'xml':active} if active else {})}
            return self.json_response(item or {'error':'尚未完成识谱'},200 if item else 404)
        if path == '/api/health': return self.json_response({'omr':bool(audiveris_path()),'version':'0.1','audio':'experimental-harmonic-fitting'})
        if path.startswith('/api/jobs/'):
            key=path.split('/')[-1]
            with LOCK: job = JOBS.get(key, {}).copy()
            job=job_progress(job)
            if job.get('status')=='complete' and not job.get('xml'):
                cached=read_cached_score(job.get('digest',''))
                if cached:job.update(xml=cached['xml'],metadata=cached.get('metadata',{}))
            if not job:
                # Arrangement and other queue tasks live in the SQLite queue, not
                # in the in-memory recognition registry. Polling used to answer
                # 404 here, so a finished arrangement was never opened.
                import background_jobs
                with background_jobs.connection() as db:
                    row=db.execute('SELECT * FROM jobs WHERE id=?',(key,)).fetchone()
                if row:
                    job=dict(row);job['stage']=job.get('detail','')
                    if job.get('status')=='failed':job['error']=job.get('detail','')
            return self.json_response(job or {'error':'任务不存在或已过期'},200 if job else 404)
        return super().do_GET()
    def do_POST(self):
        if not self.allowed(): return self.json_response({'error':'仅接受本机同源请求'},403)
        if urlparse(self.path).path=='/api/voice-reference' or urlparse(self.path).path.startswith('/api/voice-reference/mentor/') or urlparse(self.path).path.startswith('/api/voice-reference/self/'):
            import voice_capture
            return voice_capture.handle(self)
        try:
            length = int(self.headers.get('Content-Length','0'))
            if self.path in ('/api/media','/api/photos'):
                maximum=20*1024*1024 if self.path=='/api/photos' else 200*1024*1024
                if not 0<length<=maximum:return self.json_response({'error':'文件大小超出限制'},413)
                from media_import import receive
                from urllib.parse import unquote
                return self.json_response(receive(self.rfile,length,unquote(self.headers.get('X-Score-Name','未命名曲谱')),self.path=='/api/photos',self.headers.get('X-Media-Type','')),202)
            if not 0 < length <= 100*1024*1024: return self.json_response({'error':'文件为空或超过 100 MB'},413)
            chunks=[];remaining=length
            while remaining:
                chunk=self.rfile.read(min(1024*1024,remaining))
                if not chunk:break
                chunks.append(chunk);remaining-=len(chunk)
            body=b''.join(chunks)
            if len(body)!=length:return self.json_response({'error':'上传未完成'},400)
            if self.path=='/api/scores/chunk':
                upload_id=re.sub(r'[^a-fA-F0-9-]','',self.headers.get('X-Upload-Id',''))[:80]
                index=int(self.headers.get('X-Chunk-Index','-1'));total=int(self.headers.get('X-Chunk-Total','0'))
                if not upload_id or index<0 or total<1 or index>=total:return self.json_response({'error':'分块参数无效'},400)
                chunk_dir=ROOT/'.sites-runtime'/'uploads'/upload_id;chunk_dir.mkdir(parents=True,exist_ok=True)
                (chunk_dir/f'{index:06d}.part').write_bytes(body)
                if index+1<total:return self.json_response({'received':index+1,'total':total},202)
                parts=[chunk_dir/f'{i:06d}.part' for i in range(total)]
                if not all(p.exists() for p in parts):return self.json_response({'error':'分块尚未全部到达'},409)
                merged=bytearray()
                for part in parts:merged.extend(part.read_bytes())
                if not merged.startswith(b'%PDF-'):return self.json_response({'error':'不是有效 PDF'},400)
                digest=hashlib.sha256(merged).hexdigest();cache_path(digest);(CACHE_DIR/(digest+'.pdf')).write_bytes(merged)
                from urllib.parse import unquote
                (CACHE_DIR/(digest+'.name')).write_text(unquote(self.headers.get('X-Score-Name','未命名琴谱')),encoding='utf-8')
                shutil.rmtree(chunk_dir,ignore_errors=True)
                return self.json_response({'id':digest})
            if self.path=='/api/photo-books':
                from media_import import photo_book
                return self.json_response(photo_book(json.loads(body)),202)
            if self.path=='/api/activity':
                from idle_runtime import touch
                payload=json.loads(body or b'{}')
                touch(payload.get('title',''),payload.get('activity','页面操作'))
                return self.json_response({'ok':True})
            if self.path=='/api/processing/priority':
                import background_jobs
                background_jobs.prioritize(str(json.loads(body).get('id','')))
                return self.json_response({'ok':True,'detail':'已设为下一项，当前任务完成后开始'})
            if self.path=='/api/processing/retry':
                import background_jobs
                task_id=str(json.loads(body).get('id',''));background_jobs.update(task_id,status='queued',detail='等待重试',priority=0)
                return self.json_response({'ok':True})
            if self.path=='/api/media/choice':
                payload=json.loads(body);digest=str(payload.get('digest',''));cache_path(digest)
                choice=payload.get('choice')
                if choice not in ('original','separate'):raise ValueError('无效转录方式')
                if not (CACHE_DIR/(digest+'.source')).exists():raise ValueError('音视频不存在')
                import background_jobs
                with background_jobs.connection() as db:
                    waiting=db.execute("SELECT id FROM jobs WHERE digest=? AND kind='transcription' AND status='needs_review'",(digest,)).fetchall()
                if not waiting:return self.json_response({'error':'该任务无需选择'},409)
                for task in waiting:background_jobs.update(task['id'],status='cancelled',detail='已选择转录方式')
                key=background_jobs.enqueue(digest,'transcription','transkun-2.0.1-choice',{'audioChoice':choice},priority=0)
                return self.json_response({'id':key,'status':'queued'},202)
            if self.path.startswith('/api/scores/') and self.path.endswith('/vocal'):
                digest=self.path.split('/')[-2];cached=read_cached_score(digest)
                if not cached:return self.json_response({'error':'请先打开并保存一份电子谱'},404)
                mime=self.headers.get('Content-Type','').split(';',1)[0].strip().lower()
                if not mime.startswith('audio/'):
                    return self.json_response({'error':'请导入音频文件'},415)
                name=unquote(self.headers.get('X-Vocal-Name','演唱音频'))[:250]
                (CACHE_DIR/(digest+'.vocal')).write_bytes(body)
                metadata={**cached.get('metadata',{}),'vocal':{'name':name,'mime':mime,'bytes':len(body),'saved':time.time(),'offsetSeconds':0}}
                write_cached_score(digest,cached['xml'],metadata)
                (CACHE_DIR/(digest+'.metadata.json')).write_text(json.dumps(metadata,ensure_ascii=False),encoding='utf-8')
                return self.json_response({'ok':True,'vocal':metadata['vocal']})
            if self.path.startswith('/api/scores/') and self.path.endswith('/arrange'):
                digest=self.path.split('/')[-2];cache_path(digest)
                import background_jobs
                current=read_cached_score(digest)
                if not current:return self.json_response({'error':'请先完成识谱'},409)
                import arrangement_service
                params=arrangement_service.validate(json.loads(body));version=hashlib.sha256(current['xml'].encode()).hexdigest()
                # v9 regenerates every cached arrangement: each generated voice
                # is folded into its instrument's playable range and then thinned
                # to a playable texture, so the inner parts stop doubling the
                # melody and the low strings stop playing sixteenths.
                task_id=background_jobs.enqueue(digest,'arrangement','12:'+version,params,priority=0)
                return self.json_response({'id':task_id,'status':'queued'},202)
            if self.path.startswith('/api/scores/') and self.path.endswith('/recognize'):
                digest=self.path.split('/')[-2];cache_path(digest)
                pdf=CACHE_DIR/(digest+'.pdf')
                if not pdf.exists():return self.json_response({'error':'原始 PDF 不存在'},404)
                name_file=CACHE_DIR/(digest+'.name')
                numbered=name_file.exists() and name_file.read_text(encoding='utf-8',errors='ignore').startswith('简谱·')
                if not numbered and not audiveris_path():return self.json_response({'error':'识谱引擎未配置'},503)
                options=json.loads(body or b'{}') if body else {}
                alternative=options.get('engine')=='alternative'
                return self.json_response(enqueue_recognition(pdf.read_bytes(),digest,force=bool(options.get('force') or alternative),fine=alternative),202)
            if self.path=='/api/performance':
                import performance_service
                result,code=performance_service.start(json.loads(body))
                return self.json_response(result,code)
            if self.path=='/api/title/check':
                from title_validation import check
                return self.json_response(check(json.loads(body),CACHE_DIR))
            if self.path.startswith('/api/scores/') and self.path.endswith('/metadata'):
                digest=self.path.split('/')[-2];cached=read_cached_score(digest)
                if not cached and not (CACHE_DIR/(digest+'.pdf')).exists(): return self.json_response({'error':'琴谱不存在'},404)
                cached=cached or {}
                payload=json.loads(body.decode('utf-8'))
                candidate=str(payload.get('ocrTitle') or payload.get('title') or '').strip()
                if not candidate or looks_like_filename(candidate): return self.json_response({'error':'OCR 未读到有效标题'},422)
                metadata={**cached.get('metadata',{}),'title':candidate,'ocrTitle':candidate,'titleSource':'ocr','source':'OCR','titleVersion':'4','titleVerification':payload.get('titleVerification','header')}
                (CACHE_DIR/(digest+'.metadata.json')).write_text(json.dumps(metadata,ensure_ascii=False),encoding='utf-8')
                if cached.get('xml'):write_cached_score(digest,cached['xml'],metadata)
                return self.json_response({'metadata':metadata})
            if self.path.startswith('/api/scores/') and self.path.endswith('/refresh-metadata'):
                digest=self.path.split('/')[-2];cache_path(digest)
                cached=read_cached_score(digest)
                if not cached and not (CACHE_DIR/(digest+'.pdf')).exists():return self.json_response({'error':'琴谱不存在'},404)
                import background_jobs
                mode=str(json.loads(body or b'{}').get('mode','ocr'))
                if mode=='deep':
                    pdf=CACHE_DIR/(digest+'.pdf')
                    if not pdf.exists():return self.json_response({'error':'原始 PDF 不存在'},404)
                    return self.json_response(enqueue_recognition(pdf.read_bytes(),digest,force=True,fine=True),202)
                job=background_jobs.enqueue(digest,'metadata','refresh-'+mode+'-'+str(int(time.time()*1000)),{'force':mode=='ocr'},priority=0)
                return self.json_response({'id':job,'status':'queued'},202)
            if self.path.startswith('/api/scores/') and self.path.endswith('/variant'):
                digest=self.path.split('/')[-2];cache_path(digest)
                name=str(json.loads(body or b'{}').get('variant','')).strip()
                activate_variant(digest,name)
                item=read_cached_score(digest) or {}
                summary=variants_summary(digest)
                if summary:item={**item,'variants':summary}
                return self.json_response(item)
            if self.path.startswith('/api/scores/') and self.path.endswith('/title'):
                digest=self.path.split('/')[-2]
                cached=read_cached_score(digest)
                if not cached: return self.json_response({'error':'琴谱不存在'},404)
                title=str(json.loads(body).get('title','')).strip()
                if not title or len(title)>120: raise ValueError('曲名应为 1–120 个字符')
                metadata={**cached.get('metadata',{}),'title':title,'ocrTitle':'','userTitle':title,'titleSource':'user'}
                write_cached_score(digest,cached['xml'],metadata)
                # The library merges this sidecar after the cached score. Keep
                # both copies in step or an earlier OCR title wins after save.
                (CACHE_DIR/(digest+'.metadata.json')).write_text(json.dumps(metadata,ensure_ascii=False),encoding='utf-8')
                return self.json_response({'metadata':metadata})
            if self.path == '/api/scores':
                if not body.startswith(b'%PDF-'): raise ValueError('不是有效 PDF')
                from urllib.parse import unquote
                digest=hashlib.sha256(body).hexdigest()
                cache_path(digest)
                (CACHE_DIR/(digest+'.pdf')).write_bytes(body)
                name=unquote(self.headers.get('X-Score-Name','未命名琴谱'))[:250]
                (CACHE_DIR/(digest+'.name')).write_text(name,encoding='utf-8')
                return self.json_response({'id':digest})
            if self.path == '/api/scores/midi':
                try:
                    payload=json.loads(body.decode('utf-8'))
                    xml=str(payload.get('xml',''))
                    metadata=payload.get('metadata') or {}
                    name=str(payload.get('name') or 'MIDI 乐谱').strip()[:250]
                except (UnicodeDecodeError, ValueError, TypeError):
                    raise ValueError('MIDI 乐谱数据格式不正确')
                if not xml.startswith('<?xml') or '<score-partwise' not in xml:
                    raise ValueError('MIDI 乐谱缺少有效 MusicXML')
                digest=hashlib.sha256((xml+'\n'+json.dumps(metadata,ensure_ascii=False,sort_keys=True)).encode('utf-8')).hexdigest()
                cache_path(digest)
                metadata={**metadata,'sourceType':'midi','title':str(metadata.get('title') or name)}
                write_cached_score(digest,xml,metadata,parts=omr_normalize.REVISION)
                (CACHE_DIR/(digest+'.name')).write_text(name,encoding='utf-8')
                return self.json_response({'id':digest,'saved':True})
            if self.path == '/api/scores/image':
                # Camera uploads are normalised into a clean, portrait PDF
                # before entering the existing OMR pipeline. PIL is optional;
                # when unavailable the client receives a precise setup error.
                from PIL import Image, ImageOps, ImageFilter
                from urllib.parse import unquote
                image=Image.open(io.BytesIO(body)).convert('RGB')
                image=ImageOps.exif_transpose(image)
                image.thumbnail((2600,3600),Image.Resampling.LANCZOS)
                gray=ImageOps.grayscale(image).filter(ImageFilter.GaussianBlur(1.1))
                import numpy as np
                arr=np.asarray(gray); mask=arr<245
                ys,xs=np.where(mask)
                if len(xs)>40:
                    pad=round(min(image.size)*.025); left=max(0,int(xs.min())-pad); right=min(image.width,int(xs.max())+pad); top=max(0,int(ys.min())-pad); bottom=min(image.height,int(ys.max())+pad)
                    image=image.crop((left,top,right,bottom))
                if image.width>image.height:
                    image=image.rotate(90,expand=True)
                out=io.BytesIO();image.save(out,format='PDF',resolution=220.0)
                pdf=out.getvalue();digest=hashlib.sha256(pdf).hexdigest();cache_path(digest);(CACHE_DIR/(digest+'.pdf')).write_bytes(pdf)
                name=unquote(self.headers.get('X-Score-Name','照片琴谱'))[:250];(CACHE_DIR/(digest+'.name')).write_text(name,encoding='utf-8')
                return self.json_response({'id':digest,'scanned':True})
            if self.path == '/api/unpack': return self.json_response({'xml':unpack_musicxml(body)})
            if self.path.startswith('/api/jobs/') and self.path.endswith('/metadata'):
                job_id = self.path.split('/')[-2]
                metadata = json.loads(body.decode('utf-8'))
                if not isinstance(metadata, dict): raise ValueError('元数据格式不正确')
                with LOCK:
                    job = JOBS.get(job_id)
                    if not job: return self.json_response({'error':'任务不存在或已过期'},404)
                    job['metadata'] = {k: str(v)[:200] for k, v in metadata.items() if v is not None}
                    digest = job.get('digest')
                    xml = job.get('xml')
                if digest and xml: write_cached_score(digest, xml, job.get('metadata'), parts=omr_normalize.REVISION)
                return self.json_response({'ok': True})
            if self.path != '/api/recognize': return self.json_response({'error':'接口不存在'},404)
            if not body.startswith(b'%PDF-'): return self.json_response({'error':'不是有效 PDF'},400)
            if not audiveris_path(): return self.json_response({'error':'尚未配置 Audiveris 识谱引擎'},503)
            digest = hashlib.sha256(body).hexdigest()
            cache_path(digest)
            (CACHE_DIR/(digest+'.pdf')).write_bytes(body)
            return self.json_response(enqueue_recognition(body,digest),202)
        except Exception as error: return self.json_response({'error':str(error)},400)

HEAVY_BACKGROUND=('arrangement','transcription')

def sources_busy():
    """True while work worth preserving is in flight.

    Foreground OMR and performance inference are user-driven and cannot be
    resumed, so a reload always waits for them. Among background queue jobs the
    heavy ones (arrangement, transcription) are also worth not restarting;
    the cheap ones (metadata, pdf) just redo quickly and may be interrupted --
    background_jobs.start() re-queues anything left 'running' regardless.
    """
    with LOCK:
        if any(j.get('status')=='running' for j in JOBS.values()): return True
    import performance_service
    with performance_service.LOCK:
        if any(j['status']=='running' for j in performance_service.JOBS.values()): return True
    try:
        import background_jobs
        with background_jobs.connection() as db:
            marks=','.join('?'*len(HEAVY_BACKGROUND))
            row=db.execute(f"SELECT COUNT(*) FROM jobs WHERE status='running' AND kind IN ({marks})",HEAVY_BACKGROUND).fetchone()
        if row and row[0]: return True
    except Exception: pass
    return False

if __name__ == '__main__':
    print(f'Piano Lab: http://127.0.0.1:{PORT}', flush=True)
    print('Audiveris: '+('ready' if audiveris_path() else 'not configured; PDF preview and sample practice remain available'), flush=True)
    # Listen on the local network so classmates can test from another device.
    # "::" + IPV6_V6ONLY=0 → 同一端口同时接受 IPv4 与 IPv6（含外网 IPv6 直连）。
    class DualStackServer(ThreadingHTTPServer):
        address_family = socket.AF_INET6
        def server_bind(self):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            super().server_bind()
    # A reloading predecessor may still be releasing the socket, so retry bind.
    for attempt in range(20):
        try:
            server = DualStackServer(('::', PORT), Handler); break
        except OSError:
            if attempt==19: raise
            time.sleep(0.25)
    recover_queue()
    import background_jobs,sys
    background_jobs.start(sys.modules[__name__])
    # Python imports a module once per process, so edits to *.py stay invisible
    # until the process is replaced -- every newly written route used to answer
    # "接口不存在" until someone restarted by hand. Watch the sources and, once
    # nothing is running, hand over to a fresh process automatically.
    reload_requested=threading.Event()
    def watch_sources():
        def snapshot():
            # Re-glob every tick so freshly added modules are noticed too.
            state={}
            for path in sorted(ROOT.glob('*.py'))+sorted((ROOT/'scripts').glob('*.py')):
                try: state[path]=path.stat().st_mtime
                except OSError: pass
            return state
        previous=snapshot()
        while not reload_requested.is_set():
            time.sleep(2.5)
            current=snapshot()
            changed=[path for path,stamp in current.items() if previous.get(path)!=stamp]
            if not changed: continue
            # Let an edit settle first, or a half-written file would be imported.
            if time.time()-max(current[path] for path in changed)<1.5: continue
            # Keep the change pending while a job runs; retry on a later tick.
            if sources_busy(): continue
            print('检测到源码变更，交由重启器重建进程：'+', '.join(sorted(p.name for p in changed)), flush=True)
            reload_requested.set()
            # Delegate to scripts/restart-server.py rather than replacing this
            # process in place: on Windows a self-spawned successor inherits the
            # listening socket handle and ends up bound but never serving. The
            # restarter stops us and starts a clean process once the port frees.
            flags=(getattr(subprocess,'DETACHED_PROCESS',0)|getattr(subprocess,'CREATE_NEW_PROCESS_GROUP',0)|getattr(subprocess,'CREATE_NO_WINDOW',0)) if os.name=='nt' else 0
            try:
                subprocess.Popen([sys.executable,str(ROOT/'scripts'/'restart-server.py')],cwd=str(ROOT),creationflags=flags,close_fds=True)
            except Exception as error:
                print('自动重启失败：'+str(error),flush=True)
            return
    if os.environ.get('PIANO_AUTORELOAD','1')!='0':
        threading.Thread(target=watch_sources,name='source-watcher',daemon=True).start()
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close(); POOL.shutdown(wait=False, cancel_futures=True)
