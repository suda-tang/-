import json,numpy as np
from pathlib import Path
base=Path('dist');entries=json.loads((base/'assets/arrival/garden-models.json').read_text())
for e in entries:
 p=base/e['url'].split('?')[0].lstrip('/');d=json.loads(p.read_text());found=[]
 for m in d['meshes']:
  for q in m['primitives']:
   a=d['accessors'][q['attributes']['POSITION']];lo=a.get('min');hi=a.get('max')
   if lo and hi and hi[1]-lo[1]<.12 and (hi[0]-lo[0])*(hi[2]-lo[2])>250:found.append([m.get('name'),lo,hi])
 if found:print(e['id'],found,flush=True)
