import sys,json,subprocess,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path[:0]=[str(ROOT),str(ROOT/'.sites-runtime/transcription-vendor')]
from PIL import Image
folder=ROOT/'.sites-runtime/verification/media';folder.mkdir(parents=True,exist_ok=True)
pages=[]
for color in ('red','blue'):
 key=hashlib.sha256(color.encode()).hexdigest();Image.new('RGB',(320,480),color).save(folder/(key+'.photo'),'JPEG');pages.append(key)
key=hashlib.sha256(b'photo-book-fixture').hexdigest();(folder/(key+'.photo-book.json')).write_text(json.dumps({'pages':pages}),encoding='utf-8')
request=folder/'photos-request.json';request.write_text(json.dumps({'mode':'photos','digest':key,'cacheDir':str(folder)}),encoding='utf-8')
subprocess.run([str(ROOT/'.sites-runtime/performance-env/Scripts/python.exe'),str(ROOT/'scripts/transcribe-media.py'),str(request)],check=True)
import fitz
with fitz.open(folder/(key+'.pdf')) as pdf:
 assert len(pdf)==2
 first=pdf[0].get_pixmap().pixel(10,10);second=pdf[1].get_pixmap().pixel(10,10)
 assert first[0]>200 and first[2]<20 and second[2]>200 and second[0]<20
print('Ordered photos assembled into two PDF pages correctly')
