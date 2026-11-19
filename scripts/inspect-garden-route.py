from pathlib import Path
s=Path('scripts/choose-garden-lecture-stations.py').read_text(encoding='utf8')
s=s.replace('radius=25','radius=65').replace("abs(entry['position'][0]-cx)>45 or abs(entry['position'][2]-cz)>45","abs(entry['position'][0]-cx)>90 or abs(entry['position'][2]-cz)>90")
s=s.replace('lo[:,1]<level+4','lo[:,1]<level+1.8')
start=s.index(' choices=[]')
s=s[:start]+''' from scipy.ndimage import binary_erosion
 from collections import deque
 valid=binary_erosion(walkable & ~blocked,iterations=1)
 at=tuple(np.round((np.array([cx,cz])-origin)/cell).astype(int))
 available=[(abs(i-at[0])+abs(j-at[1]),i,j)for i,j in np.argwhere(valid)if abs(i-at[0])+abs(j-at[1])<8]
 _,i,j=min(available);first=(i,j);parents={first:None};dist={first:0};queue=deque([first])
 while queue:
  node=queue.popleft()
  for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
   q=(node[0]+dx,node[1]+dz)
   if not(0<=q[0]<size and 0<=q[1]<size)or not valid[q]or q in parents:continue
   parents[q]=node;dist[q]=dist[node]+1;queue.append(q)
 print(garden,'reachable',len(dist),'max metres',max(dist.values())*cell,flush=True)
 pixels=np.zeros((size,size,3),dtype=np.uint8);pixels[:]=[80,90,80];pixels[walkable]=[200,200,180];pixels[blocked]=[45,40,40]
 for q in dist:pixels[q]=[80,160,90]
 pixels[first]=[255,30,20]
 Image.fromarray(pixels.transpose(1,0,2)).resize((1044,1044)).save('.sites-runtime/'+garden+'-full-navigation.png')
'''
exec(compile(s,'garden-inspection','exec'))
