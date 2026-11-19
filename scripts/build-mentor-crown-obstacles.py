"""Prepare crown bounds before streamed garden meshes arrive."""
from pathlib import Path
import json
import numpy as np
from scipy.spatial.transform import Rotation
base=Path('dist');boxes=[]
for entry in json.loads((base/'assets/arrival/garden-models.json').read_text(encoding='utf8')):
 p=base/entry['url'].split('?')[0].lstrip('/');doc=json.loads(p.read_text());blob=(p.parent/doc['buffers'][0]['uri']).read_bytes()
 def arr(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);w={'VEC3':3,'VEC4':4,'SCALAR':1}[a['type']]
  return np.ndarray((a['count'],w),dtype,buffer=blob,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dtype.itemsize*w),dtype.itemsize))
 for node in doc['nodes']:
  if 'mesh' not in node:continue
  for q in doc['meshes'][node['mesh']]['primitives']:
   name=doc['materials'][q.get('material',0)].get('name','')
   if name!=('yiyuan-material-56' if entry['garden']=='yiyuan' else 'zhuozhengyuan-material-146'):continue
   pos=arr(q['attributes']['POSITION']);lo=pos.min(0);hi=pos.max(0);corners=np.array([[x,y,z]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])
   attrs=node.get('extensions',{}).get('EXT_mesh_gpu_instancing',{}).get('attributes')
   instances=zip(arr(attrs['TRANSLATION']),Rotation.from_quat(arr(attrs['ROTATION'])).as_matrix(),arr(attrs['SCALE']))if attrs else [(np.zeros(3),np.eye(3),np.ones(3))]
   for translation,rotation,scale in instances:
    points=(corners*scale)@rotation.T+translation+entry['position'];low=points.min(0);high=points.max(0);height=high[1]-low[1]
    if not 1<height<20:continue
    size=min(3.5,height/3.15);center=(high+low)/2
    boxes.append([round(float(center[0]-size*1.9),3),round(float(low[1]+size*.55),3),round(float(center[2]-size*1.9),3),round(float(center[0]+size*1.9),3),round(float(low[1]+size*3.4),3),round(float(center[2]+size*1.9),3)])
(base/'assets/arrival/garden-crown-obstacles.json').write_text(json.dumps(boxes,separators=(',',':')),encoding='utf8');print('precomputed crowns',len(boxes))
