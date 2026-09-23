"""Vendor five original Salamander velocity layers, verifying Git blob hashes."""
import concurrent.futures, hashlib, json, re, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
target=root/'dist/assets/piano/salamander';target.mkdir(parents=True,exist_ok=True)
catalog=json.loads((root/'.sites-runtime/piano-audio-list.json').read_text(encoding='utf-8-sig'))
files=[x for x in catalog if re.fullmatch(r'(?:A|C|Ds|Fs)\dv(?:2|5|8|11|15)\.mp3',x['name'])]
def fetch(item):
    path=target/item['name']
    def valid():
        if not path.exists():return False
        data=path.read_bytes()
        return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==item['sha']
    if not valid():subprocess.run(['curl.exe','-sS','-L','--fail','--retry','5','--retry-all-errors',item['download_url'],'-o',str(path)],check=True)
    assert valid(),item['name']
    return item['name']
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for i,name in enumerate(pool.map(fetch,files),1):
        if i%15==0:print(f'{i}/{len(files)} verified',flush=True)
assert len(files)==150
print('All 150 piano samples verified',flush=True)
