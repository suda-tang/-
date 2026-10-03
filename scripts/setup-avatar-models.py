"""Download official SadTalker weights without touching speech/OMR environments."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json, time, urllib.request

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.sites-runtime' / 'SadTalker'
FILES = {
 'checkpoints/SadTalker_V0.0.2_256.safetensors': 'https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/SadTalker_V0.0.2_256.safetensors',
 'checkpoints/mapping_00229-model.pth.tar': 'https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/mapping_00229-model.pth.tar',
 'gfpgan/weights/alignment_WFLW_4HG.pth': 'https://github.com/xinntao/facexlib/releases/download/v0.1.0/alignment_WFLW_4HG.pth',
 'gfpgan/weights/detection_Resnet50_Final.pth': 'https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth',
}

def download(item):
 name, url = item
 dest = RUNTIME / name
 dest.parent.mkdir(parents=True, exist_ok=True)
 receipt = dest.with_suffix(dest.suffix + '.download.json')
 if dest.exists() and receipt.exists():
  expected = json.loads(receipt.read_text())['bytes']
  if dest.stat().st_size == expected:
   print(json.dumps({'file': name, 'status': 'cached', 'bytes': expected}), flush=True)
   return
 part = dest.with_suffix(dest.suffix + '.part')
 for attempt in range(4):
  try:
   offset = part.stat().st_size if part.exists() else 0
   headers = {'User-Agent': 'PianoResearchAvatar/1.0'}
   if offset: headers['Range'] = f'bytes={offset}-'
   with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=45) as response:
    if response.status != 206: offset = 0
    total = offset + int(response.headers.get('Content-Length', 0))
    done, last = offset, 0
    with part.open('ab' if offset else 'wb') as stream:
     while chunk := response.read(1024 * 1024):
      stream.write(chunk)
      done += len(chunk)
      if time.monotonic() - last > 10:
       print(json.dumps({'file': name, 'bytes': done, 'total': total}), flush=True)
       last = time.monotonic()
    if total and done != total: raise IOError(f'Incomplete download: {done}/{total}')
   part.replace(dest)
   receipt.write_text(json.dumps({'url': url, 'bytes': done}))
   print(json.dumps({'file': name, 'status': 'ready', 'bytes': done}), flush=True)
   return
  except Exception as exc:
   print(json.dumps({'file': name, 'attempt': attempt + 1, 'error': str(exc)}), flush=True)
   if attempt == 3: raise
   time.sleep(2)

if __name__ == '__main__':
 with ThreadPoolExecutor(max_workers=3) as pool:
  list(pool.map(download, FILES.items()))
