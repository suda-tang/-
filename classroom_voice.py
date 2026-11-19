"""Keep one bounded CPU voice model resident; no synthesized audio disk cache."""
import atexit,base64,json,queue,subprocess,threading,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent
LOCK=threading.Lock();PROCESS=None;RESPONSES=None


def available(locale):
    return locale in ('zh','zh-Hant') and (ROOT/'.sites-runtime/kokoro-env/Scripts/python.exe').exists() and (ROOT/'.sites-runtime/voice-models/kokoro/kokoro-v1.1-zh.onnx').exists()


def close():
    global PROCESS
    if PROCESS and PROCESS.poll() is None:PROCESS.terminate()
    PROCESS=None
atexit.register(close)


def segment(text,role):
    global PROCESS,RESPONSES
    with LOCK:
        if PROCESS is None or PROCESS.poll() is not None:
            RESPONSES=queue.Queue()
            PROCESS=subprocess.Popen([str(ROOT/'.sites-runtime/kokoro-env/Scripts/python.exe'),str(ROOT/'scripts/classroom-voice-worker.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)|getattr(subprocess,'BELOW_NORMAL_PRIORITY_CLASS',0))
            proc=PROCESS;responses=RESPONSES
            def receive():
                for line in proc.stdout:responses.put(line)
                responses.put(b'')
            threading.Thread(target=receive,daemon=True).start()
        PROCESS.stdin.write((json.dumps({'text':text,'role':role})+'\n').encode());PROCESS.stdin.flush()
        try:line=RESPONSES.get(timeout=40)
        except queue.Empty:close();raise RuntimeError('自然语音通道等待超过40秒')
        if not line:close();raise RuntimeError('自然语音引擎未能启动')
        result=json.loads(line)
        if result.get('error'):raise RuntimeError(result['error'])
        return base64.b64decode(result['audio'])


def stream(text,role='teacher'):
    # Sentence chunks shorten time to first audio and keep natural phrase ends.
    pieces=re.findall(r'[^。！？!?；;，,]+[。！？!?；;，,]?',text)
    for piece in pieces:
        for start in range(0,len(piece),70):
            yield segment(piece[start:start+70],role)
