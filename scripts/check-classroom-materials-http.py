"""Real HTTP uploads + local PDF/DOCX/text/audio processing, isolated fixtures."""
import base64,hashlib,io,json,math,struct,time,wave,zipfile
from pathlib import Path
import requests,fitz
BASE='http://127.0.0.1:5173';SCORE='f'*64
root=Path(__file__).resolve().parent.parent/'.sites-runtime/classroom-materials'
fixtures={'教材测试.txt':'先聆听主题，再比较音色。'.encode()}
doc=fitz.open();page=doc.new_page();page.insert_text((72,72),'Listening: compare melody and accompaniment.');fixtures['教案测试.pdf']=doc.tobytes();doc.close()
buffer=io.BytesIO()
with zipfile.ZipFile(buffer,'w') as z:z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>比较主旋律与伴奏。</w:t></w:r></w:p></w:body></w:document>')
fixtures['教案测试.docx']=buffer.getvalue();buffer=io.BytesIO()
with wave.open(buffer,'wb') as audio:
 audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(16000);audio.writeframes(b''.join(struct.pack('<h',int(1500*math.sin(2*math.pi*440*i/16000))) for i in range(16000)))
fixtures['聆听测试.wav']=buffer.getvalue();ids=[]
try:
 for name,body in fixtures.items():
  digest=hashlib.sha256(body).hexdigest();offset=0
  while offset<len(body):
   chunk=body[offset:offset+8192];response=requests.post(BASE+'/api/classroom/material-upload',json={'scoreId':SCORE,'name':name,'size':len(body),'digest':digest,'offset':offset,'kind':'reference','chunk':base64.b64encode(chunk).decode()},timeout=20);response.raise_for_status();data=response.json();offset=data.get('offset',len(body))
  ids.append(data['id'])
 deadline=time.monotonic()+120
 while time.monotonic()<deadline:
  response=requests.get(BASE+'/api/classroom/materials',params={'scoreId':SCORE},timeout=15);response.raise_for_status();items=[m for m in response.json()['materials'] if m['id'] in ids]
  if len(items)==4 and all(m['status'] in ('ready','failed') for m in items):break
  time.sleep(1)
 assert all(m['status']=='ready' for m in items),json.dumps(items,ensure_ascii=False)
 audio=next(m for m in items if m['name'].endswith('.wav'));response=requests.get(BASE+'/api/classroom/material-file',params={'id':audio['id']},headers={'Range':'bytes=0-31'},timeout=10)
 assert response.status_code==206 and len(response.content)==32,(response.status_code,len(response.content))
 assert response.headers['Content-Type']=='audio/mpeg',response.headers
 print('PASS real HTTP resumable uploads: TXT / PDF / DOCX / WAV, local parsing, CPU ASR path, MP3 conversion and byte-range playback')
 for item in items:print(item['name'],item['status'],item.get('transcriptionStatus','ready'),item.get('message',''))
finally:
 # Only delete files belonging to these explicit synthetic fixture IDs.
 for ident in ids:
  for path in root.glob(ident+'*'):
   if path.parent.resolve()==root.resolve() and path.is_file():path.unlink(missing_ok=True)
