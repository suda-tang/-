"""Build footpaths from clipped source triangles, not mesh bounding rectangles."""
from pathlib import Path
s=Path('scripts/choose-garden-lecture-stations.py').read_text(encoding='utf8')
s=s.replace('radius=25','radius=65').replace("abs(entry['position'][0]-cx)>45 or abs(entry['position'][2]-cz)>45","abs(entry['position'][0]-cx)>90 or abs(entry['position'][2]-cz)>90")
s=s.replace('cell=.5','cell=.25')
s=s.replace('surfaces.append((lo[near],hi[near],water))','surfaces.append((tris[near],water))')
s=s.replace("pos=arr(q['attributes']['POSITION']);", "material=d['materials'][q.get('material',0)].get('name','');number=int(material.rsplit('-',1)[-1])if material.rsplit('-',1)[-1].isdigit()else -1\n    if garden=='yiyuan'and number in (55,56)or garden=='zhuozhengyuan'and 143<=number<=150:continue\n    pos=arr(q['attributes']['POSITION']);")
start=s.index(' for lo,hi,water in surfaces:')
s=s[:start]+'''
 from PIL import Image,ImageDraw
 from scipy.ndimage import binary_dilation,label
 from collections import deque
 obstacleImage=Image.new('1',(size,size));floorImage=Image.new('1',(size,size))
 od=ImageDraw.Draw(obstacleImage);fd=ImageDraw.Draw(floorImage)
 def polygon(tri,draw):
  xy=[tuple((p[[0,2]]-origin)/cell)for p in tri]
  if len(xy)>=3:draw.polygon(xy,fill=1)
  if len(xy)>=2:draw.line(xy+[xy[0]],fill=1,width=1)
 def clip(poly,y,above):
  result=[]
  for a,b in zip(poly,poly[1:]+poly[:1]):
   ina=a[1]>=y if above else a[1]<=y;inb=b[1]>=y if above else b[1]<=y
   if ina:result.append(a)
   if ina!=inb:result.append(a+(b-a)*(y-a[1])/(b[1]-a[1]))
  return result
 for tris,water in surfaces:
  lo=tris.min(axis=1);hi=tris.max(axis=1)
  if not water:
   for tri in tris[(hi[:,1]<level+.15)&(lo[:,1]>level-.15)&((hi[:,1]-lo[:,1])<.06)]:polygon(tri,fd)
  for tri in tris[(hi[:,1]>level+.22)&(lo[:,1]<level+1.8)]:
   poly=clip(list(tri),level+.22,True)
   if poly:poly=clip(poly,level+1.8,False)
   if poly:polygon(poly,od)
 blocked=np.array(obstacleImage).T;walkable=np.array(floorImage).T
 valid=walkable & ~binary_dilation(blocked,iterations=1)
 # Keep the walk inside the model boundary; a surrounding base slab is not a path.
 bounds=[-115,-43,-174,-140]if garden=='yiyuan'else[-140,-10,-275,-205]
 xx=origin[0]+np.arange(size)*cell;zz=origin[1]+np.arange(size)*cell
 valid &= (xx[:,None]>bounds[0])&(xx[:,None]<bounds[1])&(zz[None,:]>bounds[2])&(zz[None,:]<bounds[3])
 # Courtyard starts face into the garden, rather than standing outside its rear wall.
 desired=(-80,-160)if garden=='yiyuan'else(-75,-242)
 components,count=label(valid);sizes=np.bincount(components.ravel());eligible=valid & (sizes[components]>=max(80,min(400,max(sizes[1:],default=0))))
 candidates=sorted(np.argwhere(eligible if eligible.any()else valid),key=lambda q:np.linalg.norm(origin+q*cell-desired))
 first=tuple(candidates[0]);parents={first:None};queue=deque([first]);distance={first:0}
 while queue:
  node=queue.popleft()
  for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
   q=(node[0]+dx,node[1]+dz)
   if not(0<=q[0]<size and 0<=q[1]<size)or not valid[q]or q in parents:continue
   parents[q]=node;distance[q]=distance[node]+cell;queue.append(q)
 # A connected interior tour with stops in different parts of the grounds.
 nodes=list(parents);route=[first];current=first;visited={first}
 for target in ([( -95,-160),(-91,-146),(-68,-146),(-60,-160),desired]if garden=='yiyuan'else[(-93,-240),(-93,-257),(-69,-257),(-56,-240),desired]):
  goal=min(nodes,key=lambda q:np.linalg.norm(origin+np.array(q)*cell-target))
  prev={current:None};queue=deque([current])
  while queue and goal not in prev:
   n=queue.popleft()
   for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
    q=(n[0]+dx,n[1]+dz)
    if q in parents and q not in prev:prev[q]=n;queue.append(q)
  part=[];n=goal
  while n!=current:part.append(n);n=prev[n]
  route+=part[::-1];current=goal
 points=[[round(float(origin[0]+q[0]*cell),2),level,round(float(origin[1]+q[1]*cell),2)]for q in route]
 Image.fromarray((valid.T*255).astype('uint8')).save(base/('assets/arrival/'+garden+'-walkable.png'))
 (base/('assets/arrival/'+garden+'-walkable.json')).write_text(json.dumps({'origin':origin.tolist(),'cell':cell,'floor':level}),encoding='utf8')
 out[garden]=points
 print(garden,'connected cells',len(nodes),'tour metres',(len(route)-1)*cell,'start',points[0],flush=True)
 pixels=np.zeros((size,size,3),dtype=np.uint8);pixels[:]=[80,90,80];pixels[walkable]=[200,200,180];pixels[blocked]=[45,40,40]
 for q in parents:pixels[q]=[80,160,90]
 for q in route:pixels[q]=[230,180,40]
 pixels[first]=[255,20,20]
 Image.fromarray(pixels.transpose(1,0,2)).resize((1044,1044)).save('.sites-runtime/'+garden+'-interior-tour.png')
(base/'assets/arrival/garden-walking-paths.json').write_text(json.dumps(out),encoding='utf8')
stations={name:[*points[0],0]for name,points in out.items()}
(base/'mentor-garden-stations.js').write_text('export const gardenStations='+json.dumps(stations)+';\\n',encoding='utf8')
'''
exec(compile(s,'interior-tours','exec'))
