"""Keep tours on dry source paving and remove repeated excursions between stops."""
import json, math
from pathlib import Path
from collections import deque

folder=Path('dist/assets/arrival')
paths=json.loads((folder/'garden-walking-paths.json').read_text(encoding='utf8'))
for name,points in paths.items():
    meta=json.loads((folder/(name+'-outline.json')).read_text())
    floor=meta['floor'];cell=meta['cell']
    key=lambda p:(round(p[0]/cell),round(p[2]/cell))
    heights={key(p):p[1] for p in points if floor-.16<=p[1]<=floor+.71}
    cache=Path('.sites-runtime')/(name+'-floor-heights.npy')
    if cache.exists():
        import numpy as np
        from PIL import Image
        ground=np.load(cache);mask=np.array(Image.open(folder/(name+'-walkable.png'))).T>200
        dry=mask&(ground>=floor-.16)&(ground<=floor+.71)
        heights={key([meta['origin'][0]+i*cell,0,meta['origin'][1]+j*cell]):float(ground[i,j]) for i,j in np.argwhere(dry)}
    start=key(points[0])
    def neighbors(n):
        for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
            q=(n[0]+dx,n[1]+dz)
            if q in heights and abs(heights[q]-heights[n])<.19:yield q
    connected={start};queue=deque([start])
    while queue:
        for q in neighbors(queue.popleft()):
            if q not in connected:connected.add(q);queue.append(q)
    def shortest(source):
        prev={source:None};queue=deque([source]);dist={source:0}
        while queue:
            n=queue.popleft()
            for q in neighbors(n):
                if q in connected and q not in prev:prev[q]=n;dist[q]=dist[n]+1;queue.append(q)
        return prev,dist
    # Visit distinct dry viewpoints, without walking back to the starting point
    # after every distant target. The recording remains the timing reference.
    goals=set()
    targets=[(-104,-164),(-106,-153),(-91,-145),(-74,-148),(-58,-159),(-69,-168)]if name=='yiyuan'else[(-110,-237),(-118,-258),(-91,-267),(-65,-262),(-43,-242),(-58,-220),(-87,-223)]
    for x,z in targets:
        p=key([x,0,z]);q=min(connected,key=lambda n:math.dist(n,p))
        if math.dist(start,q)>2:goals.add(q)
    route=[start];visited={start};current=start;budget=72 if name=='yiyuan'else 63
    while goals:
        prev,dist=shortest(current)
        goal=min(goals,key=lambda q:dist[q]);goals.remove(goal)
        part=[];q=goal
        while q!=current:part.append(q);q=prev[q]
        if (len(route)+len(part)-1)*cell>budget:continue
        route.extend(reversed(part));visited.update(part);current=goal
    # Use remaining narration time to reach an unvisited dry corner.
    prev,dist=shortest(current)
    choices=[q for q in connected if q not in visited and (len(route)+dist[q]-1)*cell<=budget]
    if choices:
        q=max(choices,key=lambda n:dist[n]);part=[]
        while q!=current:part.append(q);q=prev[q]
        route.extend(reversed(part))
    result=[[round(q[0]*cell,3),round(heights[q],3),round(q[1]*cell,3)]for q in route]
    # Round small grid corners only where the interpolated foot remains on
    # verified dry cells. Never smooth a corner across a pond or rock.
    for _ in range(2):
        rounded=[result[0]]
        for i,p in enumerate(result[1:-1],1):
            a,b=result[i-1],result[i+1];q=[(a[j]+2*p[j]+b[j])/4 for j in range(3)]
            safe=key(q) in connected and abs(heights[key(q)]-q[1])<.1
            rounded.append(q if safe else p)
        result=rounded+[result[-1]]
    paths[name]=result
    print(name,{'metres':round(sum(math.dist(a,b)for a,b in zip(result,result[1:])),1),'dryCells':len(connected),'floorRange':[min(p[1]for p in result),max(p[1]for p in result)]})
(folder/'garden-walking-paths.json').write_text(json.dumps(paths),encoding='utf8')
Path('dist/mentor-garden-stations.js').write_text('export const gardenStations='+json.dumps({name:[*path[0],0]for name,path in paths.items()})+';\n',encoding='utf8')
