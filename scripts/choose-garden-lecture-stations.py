import json,math
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation

base=Path('dist');entries=json.loads((base/'assets/arrival/garden-models.json').read_text(encoding='utf8'));out={}
kinds={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'};widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
for garden,cx,cz in [('yiyuan',-74,-174.5),('zhuozhengyuan',-75,-221.5)]:
 cell=.5;radius=25;size=int(radius*2/cell)+1;origin=np.array([cx-radius,cz-radius]);obstacles=np.zeros((size+1,size+1),np.int32);floor=np.zeros_like(obstacles);surfaces=[];heights={}
 def mark(diff,lo,hi):
  if not len(lo):return
  a=np.maximum(0,np.floor((lo-origin)/cell).astype(int));b=np.minimum(size-1,np.ceil((hi-origin)/cell).astype(int));valid=(a[:,0]<=b[:,0])&(a[:,1]<=b[:,1]);a=a[valid];b=b[valid]
  np.add.at(diff,(a[:,0],a[:,1]),1);np.add.at(diff,(b[:,0]+1,a[:,1]),-1);np.add.at(diff,(a[:,0],b[:,1]+1),-1);np.add.at(diff,(b[:,0]+1,b[:,1]+1),1)
 for entry in entries:
  if entry['garden']!=garden or abs(entry['position'][0]-cx)>45 or abs(entry['position'][2]-cz)>45:continue
  p=base/entry['url'].split('?')[0].lstrip('/');d=json.loads(p.read_text());blob=(p.parent/d['buffers'][0]['uri']).read_bytes();cache={}
  def arr(i):
   if i in cache:return cache[i]
   a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype(kinds[a['componentType']]);w=widths[a['type']];r=np.ndarray((a['count'],w),dt,buffer=blob,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*w),dt.itemsize));cache[i]=r;return r
  for n in d['nodes']:
   if 'mesh'not in n:continue
   ext=n.get('extensions',{}).get('EXT_mesh_gpu_instancing',{}).get('attributes');matrices=[np.eye(4)]
   if ext:
    ts=arr(ext['TRANSLATION']);rs=Rotation.from_quat(arr(ext['ROTATION'])).as_matrix();ss=arr(ext['SCALE']);matrices=[]
    for t,r,s in zip(ts,rs,ss):m=np.eye(4);m[:3,:3]=r*s;m[:3,3]=t;matrices.append(m)
   for q in d['meshes'][n['mesh']]['primitives']:
    pos=arr(q['attributes']['POSITION']);ids=arr(q['indices']).ravel().astype(int)if'indices'in q else np.arange(len(pos));ids=ids.reshape(-1,3);lo=pos.min(axis=0);hi=pos.max(axis=0);corners=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]]);color=d['materials'][q.get('material',0)].get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1]);water=color[3]<.94 or color[2]>color[0]*1.2 or(color[1]>color[0]*1.2 and color[1]>color[2]*1.1)
    for m in matrices:
     m=m.copy();m[:3,3]+=entry['position'];bounds=(corners@m.T)[:,:3];low=bounds.min(axis=0);high=bounds.max(axis=0)
     if low[0]>cx+radius or high[0]<cx-radius or low[2]>cz+radius or high[2]<cz-radius or low[1]>5:continue
     world=pos@m[:3,:3].T+m[:3,3];tris=world[ids];lo=tris.min(axis=1);hi=tris.max(axis=1);near=(lo[:,0]<cx+radius)&(hi[:,0]>cx-radius)&(lo[:,2]<cz+radius)&(hi[:,2]>cz-radius)
     surfaces.append((lo[near],hi[near],water))
     flat=near&(hi[:,1]<3)&(lo[:,1]>-.05)&((hi[:,1]-lo[:,1])<.035)
     if not water:
      for y,area in zip(np.round(hi[flat,1]/.05)*.05,(hi[flat,0]-lo[flat,0])*(hi[flat,2]-lo[flat,2])):heights[round(float(y),2)]=heights.get(round(float(y),2),0)+float(area)
 print('surfaces',garden,sorted(heights.items(),key=lambda x:-x[1])[:12],flush=True);level=1 if garden=='yiyuan' else 1.65;print('floor level',garden,level,flush=True)
 for lo,hi,water in surfaces:
  solid=(hi[:,1]>level+.18)&(lo[:,1]<level+4);mark(obstacles,lo[solid][:,[0,2]],hi[solid][:,[0,2]])
  walk=(hi[:,1]<level+.15)&(lo[:,1]>level-.15)&((hi[:,1]-lo[:,1])<.06)
  if not water:mark(floor,lo[walk][:,[0,2]],hi[walk][:,[0,2]])
 blocked=obstacles.cumsum(0).cumsum(1)[:size,:size]>0;walkable=floor.cumsum(0).cumsum(1)[:size,:size]>0
 from PIL import Image
 Image.fromarray(np.where(blocked.T,30,np.where(walkable.T,220,90)).astype('uint8')).resize((606,606)).save('.sites-runtime/'+garden+'-navigation.png')
 choices=[]
 for i in range(5,size-5):
  for j in range(5,size-5):
   feet=walkable[i-2:i+3,j-2:j+3]
   if feet.mean()<.8:continue
   for direction in [0,1,2,3]:
    bounds=[(i-3,i+4,j-2,j+17),(i-2,i+17,j-3,j+4),(i-3,i+4,j-17,j+3),(i-17,i+3,j-3,j+4)][direction]
    a,b,c,d=bounds
    if min(a,c)<0 or max(b,d)>=size:continue
    if not blocked[a:b,c:d].any():
     x,z=origin+np.array([i,j])*cell;choices.append((math.hypot(x-cx,z-cz),x,z,direction))
 if not choices:
  print('blocked',blocked.mean(),'floor',walkable.mean(),flush=True)
  raise RuntimeError('No clear lecture area found in '+garden)
 _,x,z,direction=min(choices);out[garden]=[round(float(x),2),level,round(float(z),2),direction];print(garden,out[garden],'candidates',len(choices),flush=True)
(base/'assets/arrival/garden-lecture-stations.json').write_text(json.dumps(out),encoding='utf8')
(base/'mentor-garden-stations.js').write_text('export const gardenStations='+json.dumps(out)+';\n',encoding='utf8')
