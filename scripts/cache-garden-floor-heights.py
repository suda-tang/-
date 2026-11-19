"""Cache only horizontal source surfaces; reuse the completed solid-body masks."""
from pathlib import Path
builder=Path('scripts/build-garden-walk-surface.py').read_text(encoding='utf8')
scope={};exec(builder[:builder.index("exec(compile(s,")],scope)
s=scope['s'];start=s.index(' floors=[];architecture=');end=s.index(' ground=np.array(floorImage).T')
s=s[:start]+''' floors=[]
 for tris,water in surfaces:
  if water:continue
  lo=tris.min(axis=1);hi=tris.max(axis=1);flat=(hi[:,1]-lo[:,1])<.06
  for tri in tris[flat&(hi[:,1]>level-.60)&(hi[:,1]<level+.71)]:floors.append((float(tri[:,1].mean()),tri))
 for height,tri in sorted(floors,key=lambda q:q[0]):polygon(tri,fd,height)
 ground=np.array(floorImage).T
 np.save('.sites-runtime/'+garden+'-floor-heights.npy',ground)
 print('cached source heights',garden,flush=True)
'''+s[s.index("(base/'assets/arrival/garden-walking-paths.json')"):]
s=s[:s.index("(base/'assets/arrival/garden-walking-paths.json')")]
exec(compile(s,'floor-heights','exec'))
