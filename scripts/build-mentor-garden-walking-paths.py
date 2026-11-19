from pathlib import Path
s=Path('scripts/choose-garden-lecture-stations.py').read_text(encoding='utf8')
s=s.replace("[('yiyuan',-48,-172),('zhuozhengyuan',-75,-242)]","[('yiyuan',-74,-174.5),('zhuozhengyuan',-75,-221.5)]")
s=s.replace('radius=25','radius=22').replace('level=max(heights,key=heights.get)',"level=1 if garden=='yiyuan' else 1.65")
start=s.index(' choices=[]')
end=s.index("(base/'assets/arrival/garden-lecture-stations.json')")
s=s[:start]+''' from scipy.ndimage import binary_erosion
 from collections import deque
 valid=binary_erosion(walkable & ~blocked,iterations=1)
 at=tuple(np.round((np.array([cx,cz])-origin)/cell).astype(int))
 available=[(abs(i-at[0])+abs(j-at[1]),i,j)for i,j in np.argwhere(valid)if abs(i-at[0])+abs(j-at[1])<8]
 if not available:raise RuntimeError('No walkable start '+garden)
 _,i,j=min(available);first=(i,j);parents={first:None};dist={first:0};queue=deque([first])
 while queue:
  node=queue.popleft()
  for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
   q=(node[0]+dx,node[1]+dz)
   if not(0<=q[0]<size and 0<=q[1]<size)or not valid[q]or q in parents:continue
   if np.linalg.norm((np.array(q)-at)*cell)>11 or dist[node]>=32:continue
   parents[q]=node;dist[q]=dist[node]+1;queue.append(q)
 far=max(dist,key=dist.get);route=[]
 while far is not None:route.append([round(float(origin[0]+far[0]*cell),2),level,round(float(origin[1]+far[1]*cell),2)]);far=parents[far]
 route.reverse();out[garden]=route;print(garden,'walk metres',(len(route)-1)*cell,route[0],route[-1],flush=True)
(base/'assets/arrival/garden-walking-paths.json').write_text(json.dumps(out),encoding='utf8')
'''
exec(compile(s,'garden-walking','exec'))
