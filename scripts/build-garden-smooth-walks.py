"""Build a continuous paved stroll, rather than a grid tour with repeated reversals."""
import json, math
from pathlib import Path
from collections import deque
import numpy as np
from PIL import Image

base=Path('dist/assets/arrival');old=json.loads((base/'garden-walking-paths.json').read_text())
output={}
for name,path in old.items():
    meta=json.loads((base/(name+'-outline.json')).read_text());cell=meta['cell'];origin=np.array(meta['origin']);level=meta['floor']
    ground=np.load(Path('.sites-runtime')/(name+'-floor-heights.npy'))
    valid=(np.array(Image.open(base/(name+'-walkable.png'))).T>200)&(ground>=level-.16)&(ground<=level+.16)
    def node(p):return tuple(np.floor((np.array(p)-origin)/cell+.5).astype(int))
    def pos(q):return origin+np.array(q)*cell
    start=node([path[0][0],path[0][2]]);queue=deque([start]);parents={start:None};dist={start:0}
    while queue:
        n=queue.popleft()
        for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
            q=(n[0]+dx,n[1]+dz)
            if q in parents or not(0<=q[0]<valid.shape[0] and 0<=q[1]<valid.shape[1])or not valid[q]or abs(float(ground[q]-ground[n]))>=.19:continue
            parents[q]=n;dist[q]=dist[n]+cell;queue.append(q)
    end=max(parents,key=lambda q:dist[q]+np.linalg.norm(pos(q)-pos(start))*.35)
    route=[];n=end
    while n is not None:route.append(pos(n));n=parents[n]
    route.reverse()
    def safe(points,margin=True):
        previous=None
        for p in points:
            q=node(p)
            if not(0<=q[0]<valid.shape[0]and 0<=q[1]<valid.shape[1])or not valid[q]:return False
            for d in ([(-.035,0),(.035,0),(0,-.035),(0,.035)]if margin else []):
                edge=node(p+np.array(d))
                if not valid[edge]:return False
            if previous is not None and abs(float(ground[q]-ground[previous]))>=.19:return False
            previous=q
        return True
    def line(a,b):return [a+(b-a)*t for t in np.linspace(0,1,max(2,math.ceil(np.linalg.norm(b-a)/.01)+1))]
    simple=[route[0]];i=0
    while i<len(route)-1:
        j=len(route)-1
        while j>i+1 and not safe(line(route[i],route[j])):j-=1
        simple.append(route[j]);i=j
    rounded=[simple[0]]
    for i,p in enumerate(simple[1:-1],1):
        a,b=simple[i-1],simple[i+1];radius=min(.9,np.linalg.norm(a-p)*.35,np.linalg.norm(b-p)*.35)
        for _ in range(10):
            enter=p+(a-p)*radius/np.linalg.norm(a-p);leave=p+(b-p)*radius/np.linalg.norm(b-p)
            curve=[(1-t)**2*enter+2*(1-t)*t*p+t*t*leave for t in np.linspace(0,1,max(8,math.ceil(radius/.008)))]
            if safe(curve):break
            radius*=.6
        if not safe(curve):enter=p;leave=p;curve=[p]
        rounded.extend(line(rounded[-1],enter)[1:]);rounded.extend(curve[1:])
    rounded.extend(line(rounded[-1],simple[-1])[1:])
    # Uniform spatial samples keep the runtime independent of grid corners.
    lengths=[0.]
    for a,b in zip(rounded,rounded[1:]):lengths.append(lengths[-1]+float(np.linalg.norm(b-a)))
    result=[];i=0
    for d in np.linspace(0,lengths[-1],max(2,math.ceil(lengths[-1]/.08)+1)):
        while i<len(rounded)-2 and lengths[i+1]<d:i+=1
        t=(d-lengths[i])/max(1e-8,lengths[i+1]-lengths[i]);p=rounded[i]*(1-t)+rounded[i+1]*t;q=node(p)
        result.append([round(float(p[0]),5),round(float(ground[q]),5),round(float(p[1]),5)])
    assert all(valid[node([p[0],p[2]])]for p in result)
    output[name]=result
    print(name,{'metres':round(lengths[-1],2),'corners':len(simple)-2,'samples':len(result),'start':result[0],'end':result[-1]})
(base/'garden-walking-corridors.json').write_text(json.dumps(output,separators=(',',':')),encoding='utf8')
Path('dist/mentor-garden-stations.js').write_text('export const gardenStations='+json.dumps({name:[*path[0],0]for name,path in output.items()})+';\n',encoding='utf8')
