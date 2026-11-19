"""Conservative voxel occupancy of the actual garden triangles, in scene coordinates."""
import gzip,json
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation

base=Path(__file__).resolve().parents[1]/'dist';origin=np.array([-260.,0.,-355.]);cell=.5;shape=np.array([840,48,840]);diff=np.zeros(tuple(shape+1),np.int32);precise=np.zeros(tuple(shape),bool)
kinds={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'};widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
for entry in json.loads((base/'assets/arrival/garden-models.json').read_text(encoding='utf8')):
 p=base/entry['url'].split('?')[0].lstrip('/');d=json.loads(p.read_text());blob=(p.parent/d['buffers'][0]['uri']).read_bytes();cache={}
 def arr(i):
  if i in cache:return cache[i]
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype(kinds[a['componentType']]);w=widths[a['type']];r=np.ndarray((a['count'],w),dt,buffer=blob,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*w),dt.itemsize));cache[i]=r;return r
 for n in d['nodes']:
  if 'mesh'not in n:continue
  ext=n.get('extensions',{}).get('EXT_mesh_gpu_instancing',{}).get('attributes');matrices=[np.eye(4)]
  if ext:
   matrices=[]
   for t,r,s in zip(arr(ext['TRANSLATION']),Rotation.from_quat(arr(ext['ROTATION'])).as_matrix(),arr(ext['SCALE'])):
    m=np.eye(4);m[:3,:3]=r*s;m[:3,3]=t;matrices.append(m)
  for q in d['meshes'][n['mesh']]['primitives']:
   material=d['materials'][q.get('material',0)].get('name','')
   number=int(material.rsplit('-',1)[-1])if material.rsplit('-',1)[-1].isdigit()else -1
   if entry['garden']=='yiyuan'and number in (55,56)or entry['garden']=='zhuozhengyuan'and 143<=number<=150:continue
   pos=arr(q['attributes']['POSITION']);ids=arr(q['indices']).ravel().astype(int)if'indices'in q else np.arange(len(pos));ids=ids.reshape(-1,3)
   for matrix in matrices:
    m=matrix.copy();m[:3,3]+=entry['position'];tris=(pos@m[:3,:3].T+m[:3,3])[ids];lo=tris.min(1);hi=tris.max(1)
    # Walkable paving and pond surfaces below eye height must not become one-metre-high walls.
    keep=~(((hi[:,1]-lo[:,1])<.025)&(hi[:,1]<2.2));tris=tris[keep];lo=lo[keep];hi=hi[keep]
    a=np.maximum(0,np.floor((lo-origin-.08)/cell).astype(int));b=np.minimum(shape-1,np.floor((hi-origin+.08)/cell).astype(int));valid=(a<=b).all(1);a=a[valid];b=b[valid]
    tris=tris[valid];large=np.prod(b-a+1,axis=1)>8
    for tri,low,high in zip(tris[large],a[large],b[large]):
     cells=np.stack(np.meshgrid(*[np.arange(low[i],high[i]+1)for i in range(3)],indexing='ij'),axis=-1).reshape(-1,3)
     centers=origin+(cells+.5)*cell;inside=np.ones(len(cells),bool);edges=np.roll(tri,-1,axis=0)-tri
     axes=[np.cross(edges[0],edges[1])]+[np.cross(edge,unit)for edge in edges for unit in np.eye(3)]
     # Triangle/box separating-axis test preserves courtyard holes and diagonal
     # roof edges; filling each triangle's bounding box creates invisible walls.
     for axis in axes:
      if np.linalg.norm(axis)<1e-10:continue
      projected=tri@axis;middle=centers@axis;radius=(cell/2+.08)*np.abs(axis).sum()
      inside &= (middle+radius>=projected.min())&(middle-radius<=projected.max())
     hit=cells[inside];precise[tuple(hit.T)]=True
    a=a[~large];b=b[~large]
    for mask in range(8):
     coords=[b[:,axis]+1 if mask&(1<<axis) else a[:,axis] for axis in range(3)];np.add.at(diff,tuple(coords),-1 if mask.bit_count()%2 else 1)
 print(entry['id'],flush=True)
for axis in range(3):np.cumsum(diff,axis=axis,out=diff)
occupied=(diff[:shape[0],:shape[1],:shape[2]]>0)|precise
bits=np.packbits(occupied.reshape(-1),bitorder='little').tobytes();folder=base/'assets/arrival';(folder/'flight-obstacles.bin').write_bytes(bits)
with gzip.open(folder/'flight-obstacles.bin.gz','wb')as f:f.write(bits)
(folder/'flight-obstacles.json').write_text(json.dumps({'origin':origin.tolist(),'shape':shape.tolist(),'cell':cell,'url':'/assets/arrival/flight-obstacles.bin?v=interior102','occupied':int(occupied.sum())}),encoding='utf8')
print('bytes',len(bits),'occupied',int(occupied.sum()),flush=True)
