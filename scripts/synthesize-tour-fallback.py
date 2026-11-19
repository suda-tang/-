"""Isolated fallback worker. Input via stdin avoids putting lesson text in process arguments."""
import json,sys,time
from gtts import gTTS

data=json.load(sys.stdin)
languages={'zh':'zh-CN','zh-Hant':'zh-TW','yue':'yue'}
tts=gTTS(data['text'],lang=languages.get(data['locale'],data['locale']),timeout=(8,20))
if data.get('target'):tts.save(data['target'])
else:
 # Retry only the current phrase; already played phrases are never repeated.
 for phrase in tts._tokenize(tts.text):
  for attempt in range(3):
   try:
    chunk=b''.join(gTTS(phrase,lang=tts.lang,timeout=(5,12)).stream())
    if not chunk:raise RuntimeError('Empty online audio')
    break
   except Exception:
    if attempt==2:raise
    time.sleep(.2*(attempt+1))
  sys.stdout.buffer.write(chunk);sys.stdout.buffer.flush()
