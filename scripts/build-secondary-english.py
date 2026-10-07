from pathlib import Path
import json,urllib.request,urllib.parse,time
texts=json.loads(Path('.sites-runtime/ui-secondary-missing.json').read_text(encoding='utf-8'));extra=json.loads(Path('dist/translations-extra.js').read_text(encoding='utf-8').split('=',1)[1].strip().rstrip(';'))
def call(q):
 for attempt in range(4):
  try:
   u='https://translate.googleapis.com/translate_a/single?'+urllib.parse.urlencode({'client':'gtx','sl':'zh-CN','tl':'en','dt':'t','q':q});r=json.load(urllib.request.urlopen(u,timeout=12));return ''.join(x[0] for x in r[0])
  except Exception:
   if attempt==3:raise
   time.sleep(.5)
for start in range(0,len(texts),15):
 batch=texts[start:start+15];translated=call('\n'.join(batch)).split('\n')
 if len(translated)!=len(batch):translated=[call(t) for t in batch]
 for source,value in zip(batch,translated):extra[source]=value.strip().replace('Suzhou University','Soochow University')
 Path('dist/translations-extra.js').write_text('export const extraDictionary='+json.dumps(extra,ensure_ascii=False)+';\n',encoding='utf-8');print('extra',min(start+15,len(texts)),'/',len(texts),flush=True)
