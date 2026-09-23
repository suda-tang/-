"""Exercise the new HTTP routes and real video transcription using isolated storage."""
import sys,json,tempfile,threading,subprocess
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import quote
ROOT=Path(__file__).resolve().parents[1];sys.path[:0]=[str(ROOT),str(ROOT/'.sites-runtime/transcription-vendor')]
import server,media_import,background_jobs,imageio_ffmpeg
from unittest.mock import patch

with tempfile.TemporaryDirectory() as temporary:
 folder=Path(temporary);video=folder/'piano.mp4';audio=next((ROOT/'.sites-runtime/verification/media').glob('*.source'))
 subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-y','-f','lavfi','-i','color=c=black:s=32x32:r=5','-i',str(audio),'-shortest','-c:v','libx264','-c:a','aac',str(video)],check=True)
 with patch.object(server,'CACHE_DIR',folder),patch.object(media_import,'CACHE',folder),patch.object(background_jobs,'CACHE',folder),patch.object(background_jobs,'DB',folder/'jobs.db'):
  http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
  try:
   base=f'http://127.0.0.1:{http.server_address[1]}'
   request=Request(base+'/api/media',data=video.read_bytes(),headers={'Content-Type':'application/octet-stream','X-Score-Name':quote('视频转录验证.mp4')})
   with urlopen(request) as response:result=json.load(response);assert response.status==202
   with background_jobs.connection() as db:job=dict(db.execute('SELECT * FROM jobs WHERE id=?',(result['jobId'],)).fetchone())
   assert job['status']=='queued'
   background_jobs.run_job(job,server)
   with urlopen(base+'/api/scores/'+result['id']) as response:score=json.load(response)
   assert '视频转录验证' in score['xml'];assert '<pitch>' in score['xml']
   with urlopen(base+'/api/scores') as response:library=json.load(response)
   assert any(s['id']==result['id'] and s['ready'] for s in library['scores'])
   print('HTTP media upload -> queue -> MP4 audio extraction -> Transkun -> MusicXML -> cloud library passed')
  finally:http.shutdown();http.server_close();thread.join()
