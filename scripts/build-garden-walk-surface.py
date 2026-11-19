"""Extract a garden outline and connected, multi-level paths from source geometry."""
from pathlib import Path
s=Path('scripts/choose-garden-lecture-stations.py').read_text(encoding='utf8')
s=s.replace('radius=25','radius=85').replace('cell=.5','cell=.25').replace("abs(entry['position'][0]-cx)>45 or abs(entry['position'][2]-cz)>45","abs(entry['position'][0]-cx)>110 or abs(entry['position'][2]-cz)>110")
s=s.replace('surfaces.append((lo[near],hi[near],water))','surfaces.append((tris[near],water))')
s=s.replace("water=color[3]<.94 or color[2]>color[0]*1.2 or(color[1]>color[0]*1.2 and color[1]>color[2]*1.1)", "water=color[3]<.75 or(color[2]>color[0]*1.2 and color[2]>=color[1]*.9)")
s=s.replace("pos=arr(q['attributes']['POSITION']);", "material=d['materials'][q.get('material',0)].get('name','');number=int(material.rsplit('-',1)[-1])if material.rsplit('-',1)[-1].isdigit()else -1\n    if garden=='yiyuan'and number in (55,56)or garden=='zhuozhengyuan'and 143<=number<=150:continue\n    pos=arr(q['attributes']['POSITION']);")
start=s.index(' for lo,hi,water in surfaces:')
s=s[:start]+'''
 from PIL import Image,ImageDraw
 from scipy.ndimage import binary_dilation,binary_closing,binary_fill_holes,label
 from collections import deque
 floorImage=Image.new('F',(size,size));fd=ImageDraw.Draw(floorImage)
 def polygon(poly,draw,value=1):
  points=[tuple((p[[0,2]]-origin)/cell)for p in poly]
  if len(points)>=3:draw.polygon(points,fill=value)
  if len(points)>=2:draw.line(points+[points[0]],fill=value,width=1)
 def clip(poly,y,above):
  result=[]
  for a,b in zip(poly,poly[1:]+poly[:1]):
   ina=a[1]>=y if above else a[1]<=y;inb=b[1]>=y if above else b[1]<=y
   if ina:result.append(a)
   if ina!=inb:result.append(a+(b-a)*(y-a[1])/(b[1]-a[1]))
  return result
 floors=[];architecture=Image.new('1',(size,size));ad=ImageDraw.Draw(architecture)
 layers=np.arange(level+.25,level+2.55,.2);images=[Image.new('1',(size,size))for _ in layers];draws=[ImageDraw.Draw(im)for im in images]
 for tris,water in surfaces:
  lo=tris.min(axis=1);hi=tris.max(axis=1)
  flat=(hi[:,1]-lo[:,1])<.06
  if not water:
   for tri in tris[flat&(hi[:,1]>level-.16)&(hi[:,1]<level+.71)]:floors.append((float(tri[:,1].mean()),tri))
  structure=(hi[:,1]>level+.45)&(lo[:,1]<level+3.5)
  for tri in tris[structure]:
   poly=clip(list(tri),level+.45,True)
   if poly:poly=clip(poly,level+3.5,False)
   if poly:polygon(poly,ad)
  for height,draw in zip(layers,draws):
   for tri in tris[(hi[:,1]>=height-.1)&(lo[:,1]<=height+.1)]:
    poly=clip(list(tri),height-.1,True)
    if poly:poly=clip(poly,height+.1,False)
    if poly:polygon(poly,draw)
 for height,tri in sorted(floors,key=lambda q:q[0]):polygon(tri,fd,height)
 ground=np.array(floorImage).T
 structure=np.array(architecture).T
 outline=binary_fill_holes(binary_closing(structure,iterations=7))
 components,count=label(outline);sizes=np.bincount(components.ravel());sizes[0]=0
 outline=components==int(sizes.argmax())
 # The outer white plinth is not part of the walkable garden.
 outline=binary_dilation(outline,iterations=1)
 blocked=np.zeros_like(outline)
 for height,image in zip(layers,images):blocked |= np.array(image).T&(height+.1>ground+.24)&(height-.1<ground+1.72)
 valid=(ground>0)&outline&~binary_dilation(blocked,iterations=1)
 desired=np.array([-80.,-160.])if garden=='yiyuan'else np.array([-75.,-242.])
 components,count=label(valid);sizes=np.bincount(components.ravel());sizes[0]=0
 eligible=valid&(sizes[components]>=max(50,min(500,int(sizes.max()))))
 candidates=sorted(np.argwhere(eligible if eligible.any()else valid),key=lambda q:np.linalg.norm(origin+q*cell-desired))
 first=tuple(candidates[0]);parents={first:None};queue=deque([first])
 def adjacent(node):
  for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
   q=(node[0]+dx,node[1]+dz)
   if 0<=q[0]<size and 0<=q[1]<size and valid[q] and abs(float(ground[q])-float(ground[node]))<.19:yield q
 while queue:
  node=queue.popleft()
  for q in adjacent(node):
   if q not in parents:parents[q]=node;queue.append(q)
 nodes=list(parents);route=[first];current=first;stops=[]
 targets=[(-104,-164),(-106,-153),(-91,-145),(-74,-148),(-58,-159),(-69,-168),tuple(desired)]if garden=='yiyuan'else[(-110,-237),(-118,-258),(-91,-267),(-65,-262),(-43,-242),(-58,-220),(-87,-223),tuple(desired)]
 for target in targets:
  goal=min(nodes,key=lambda q:np.linalg.norm(origin+np.array(q)*cell-target));prev={current:None};queue=deque([current])
  while queue and goal not in prev:
   n=queue.popleft()
   for q in adjacent(n):
    if q in parents and q not in prev:prev[q]=n;queue.append(q)
  part=[];n=goal
  while n!=current:part.append(n);n=prev[n]
  if part:route+=part[::-1];stops.append(len(route)-1)
  current=goal
 points=[[round(float(origin[0]+q[0]*cell),2),round(float(ground[q]),3),round(float(origin[1]+q[1]*cell),2)]for q in route]
 out[garden]=points
 folder=base/'assets/arrival';Image.fromarray((valid.T*255).astype('uint8')).save(folder/(garden+'-walkable.png'))
 (folder/(garden+'-walkable.json')).write_text(json.dumps({'origin':origin.tolist(),'cell':cell,'floor':level}),encoding='utf8')
 Image.fromarray((outline.T*255).astype('uint8')).save(folder/(garden+'-outline.png'))
 (folder/(garden+'-outline.json')).write_text(json.dumps({'origin':origin.tolist(),'cell':cell,'size':size,'floor':level,'stops':stops}),encoding='utf8')
 pixels=np.zeros((size,size,3),dtype=np.uint8);pixels[:]=[80,90,80];pixels[outline]=[195,190,170];pixels[blocked&outline]=[45,40,40]
 for q in parents:pixels[q]=[80,160,90]
 for q in route:pixels[q]=[230,180,40]
 pixels[first]=[255,20,20];Image.fromarray(pixels.transpose(1,0,2)).resize((1020,1020)).save('.sites-runtime/'+garden+'-walk-surface.png')
 print(garden,'connected',len(nodes),'metres',round((len(points)-1)*cell,1),'start',points[0],flush=True)
(base/'assets/arrival/garden-walking-paths.json').write_text(json.dumps(out),encoding='utf8')
(base/'mentor-garden-stations.js').write_text('export const gardenStations='+json.dumps({name:[*points[0],0]for name,points in out.items()})+';\\n',encoding='utf8')
'''
exec(compile(s,'garden-walk-surface','exec'))
import runpy
runpy.run_path('scripts/refine-garden-walks.py')
