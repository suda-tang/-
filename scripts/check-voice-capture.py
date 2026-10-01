import sys,tempfile,threading,subprocess,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server,voice_capture
from http.server import ThreadingHTTPServer
with tempfile.TemporaryDirectory() as folder:
    voice_capture.STORE=Path(folder)
    token=voice_capture.key()
    http=ThreadingHTTPServer(('127.0.0.1',5189),server.Handler)
    threading.Thread(target=http.serve_forever,daemon=True).start()
    try:
        subprocess.run(['node','scripts/check-voice-capture.cjs',token],check=True,cwd=server.ROOT)
        items=list(Path(folder).glob('*.json'))
        assert len(items)==2
        entries=[json.loads(p.read_text(encoding='utf-8')) for p in items]
        data=next(r for r in entries if r.get('role')!='mentor')
        assert data['promptId']=='introduction' and len(data['text'])>30
        mentor=next(r for r in entries if r.get('role')=='mentor')
        assert mentor['consent']['confirmed'] and mentor['bytes']>2*1024*1024 and mentor['synthesisReady'] is False
        assert len(voice_capture.status()['mentorRecordings'])==1
        assert len(voice_capture.status()['recordings'])==1
        print('PASS: recording persisted with authoritative transcript in private storage')
    finally:http.shutdown();http.server_close()
