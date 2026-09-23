from pathlib import Path
from urllib.request import urlopen
import concurrent.futures
root=Path('.sites-runtime/PianistTransformer/models/sft');root.mkdir(parents=True,exist_ok=True)
def download(name):
    target=root/name
    if target.exists():return name+' cached'
    url='https://modelscope.cn/models/yhj137/pianist-transformer-rendering/resolve/master/'+name
    with urlopen(url,timeout=60) as source,target.with_suffix('.download').open('wb') as dest:
        while True:
            data=source.read(1024*1024)
            if not data:break
            dest.write(data)
    target.with_suffix('.download').replace(target);return name+' ready'
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    for result in pool.map(download,['config.json','generation_config.json','model.safetensors']):print(result,flush=True)

