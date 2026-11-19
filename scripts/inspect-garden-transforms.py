import json
from pathlib import Path
for garden,tile in [('yiyuan','tile-0-0'),('zhuozhengyuan','tile-0-0')]:
 d=json.loads(Path('dist/assets/gardens',garden,tile+'.gltf').read_text())
 print(garden,len(d['nodes']))
 for n in d['nodes'][:8]:print({k:v for k,v in n.items()if k!='extensions'},n.get('extensions',{}).keys())
