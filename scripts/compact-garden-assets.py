import json,gzip,time
from pathlib import Path
import numpy as np
root=Path('dist/assets/gardens');types={5126:'<f4',5125:'<u4',5123:'<u2',5122:'<i2',5121:'u1'};widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
for path in root.glob('*/*.gltf'):
 doc=json.loads(path.read_text());old_uri=doc['buffers'][0]['uri'];raw=(path.parent/old_uri).read_bytes();arrays=[]
 for a in doc['accessors']:
  v=doc['bufferViews'][a['bufferView']];dt=np.dtype(types[a['componentType']]);w=widths[a['type']];arrays.append(np.ndarray((a['count'],w),dt,buffer=raw,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*w),dt.itemsize)).copy())
 for mesh in doc['meshes']:
  for p in mesh['primitives']:
   if 'indices'in p:continue
   semantic=list(p['attributes']);ids=[p['attributes'][s] for s in semantic];values=[arrays[i] for i in ids];packed=np.ascontiguousarray(np.concatenate(values,axis=1));keys=packed.view(np.dtype((np.void,packed.dtype.itemsize*packed.shape[1]))).ravel();_,select,inverse=np.unique(keys,return_index=True,return_inverse=True)
   if len(select)>.9*len(packed):continue
   for key,old,values in zip(semantic,ids,values):
    a=dict(doc['accessors'][old]);a['count']=len(select);p['attributes'][key]=len(arrays);doc['accessors'].append(a);arrays.append(values[select])
   p['indices']=len(arrays);doc['accessors'].append({'componentType':5125,'count':len(inverse),'type':'SCALAR'});arrays.append(inverse.astype('<u4').reshape(-1,1))
 used=set()
 for mesh in doc['meshes']:
  for p in mesh['primitives']:used.update(p['attributes'].values());used.update([p['indices']] if 'indices'in p else [])
 for n in doc['nodes']:used.update(n.get('extensions',{}).get('EXT_mesh_gpu_instancing',{}).get('attributes',{}).values())
 binary=bytearray();accessors=[];views=[];mapping={}
 for old in sorted(used):
  a=dict(doc['accessors'][old]);a.pop('byteOffset',None);v=arrays[old];binary.extend(b'\0'*((-len(binary))%4));start=len(binary);binary.extend(v.tobytes());a['bufferView']=len(views);views.append({'buffer':0,'byteOffset':start,'byteLength':v.nbytes});mapping[old]=len(accessors);accessors.append(a)
 for mesh in doc['meshes']:
  for p in mesh['primitives']:
   p['attributes']={k:mapping[v] for k,v in p['attributes'].items()}
   if 'indices'in p:p['indices']=mapping[p['indices']]
 for n in doc['nodes']:
  ext=n.get('extensions',{}).get('EXT_mesh_gpu_instancing');
  if ext:ext['attributes']={k:mapping[v] for k,v in ext['attributes'].items()}
 uri=path.stem+'.compact.bin';(path.parent/uri).write_bytes(binary)
 with gzip.open(path.parent/(uri+'.gz'),'wb',compresslevel=6) as f:f.write(binary)
 doc['accessors']=accessors;doc['bufferViews']=views;doc['buffers']=[{'uri':uri,'byteLength':len(binary)}];path.write_text(json.dumps(doc,separators=(',',':')));print(path.parent.name,path.stem,len(raw),'->',len(binary),'gzip',(path.parent/(uri+'.gz')).stat().st_size,flush=True)
