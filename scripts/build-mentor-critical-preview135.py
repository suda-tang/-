import json,gzip
from pathlib import Path
import numpy as np
from PIL import Image
root=Path('dist/assets/gardens')
types={5126:'<f4',5125:'<u4',5123:'<u2',5122:'<i2',5121:'u1'};widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
report=[]
for garden in ['yiyuan','zhuozhengyuan']:
 for tile in ['tile-0-0','tile-0--1']:
  path=root/garden/(tile+'.gltf');doc=json.loads(path.read_text());raw=(path.parent/doc['buffers'][0]['uri']).read_bytes();arrays=[]
  for a in doc['accessors']:
   v=doc['bufferViews'][a['bufferView']];dt=np.dtype(types[a['componentType']]);w=widths[a['type']];arrays.append(np.ndarray((a['count'],w),dt,buffer=raw,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*w),dt.itemsize)).copy())
  before=after=0
  for mesh in doc['meshes']:
   for p in mesh['primitives']:
    if p.get('mode',4)!=4:continue
    pos=arrays[p['attributes']['POSITION']];before+=len(pos);keys=[np.floor(pos/.35).astype('<i4')]
    if 'TEXCOORD_0'in p['attributes']:keys.append(np.round(arrays[p['attributes']['TEXCOORD_0']]*1).astype('<i4'))
    _,select,inverse=np.unique(np.concatenate(keys,axis=1),axis=0,return_index=True,return_inverse=True);count=len(select);after+=count
    for key,old in list(p['attributes'].items()):
     a=dict(doc['accessors'][old]);values=arrays[old][select].copy()
     if key in ['POSITION','NORMAL']:
      values=np.zeros((count,3),dtype='<f4');np.add.at(values,inverse,arrays[old]);values/=np.bincount(inverse)[:,None]
      if key=='NORMAL':values/=np.maximum(1e-8,np.linalg.norm(values,axis=1))[:,None]
     a['count']=count;a.pop('min',None);a.pop('max',None)
     if key=='POSITION':a['min']=values.min(axis=0).tolist();a['max']=values.max(axis=0).tolist()
     p['attributes'][key]=len(arrays);doc['accessors'].append(a);arrays.append(values)
    oldindices=arrays[p['indices']].ravel() if 'indices'in p else np.arange(len(pos));indices=inverse[oldindices].reshape(-1,3);indices=indices[(indices[:,0]!=indices[:,1])&(indices[:,0]!=indices[:,2])&(indices[:,1]!=indices[:,2])].astype('<u4').reshape(-1,1)
    p['indices']=len(arrays);doc['accessors'].append({'componentType':5125,'count':len(indices),'type':'SCALAR'});arrays.append(indices)
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
   ext=n.get('extensions',{}).get('EXT_mesh_gpu_instancing')
   if ext:ext['attributes']={k:mapping[v] for k,v in ext['attributes'].items()}
  for img in doc.get('images',[]):
   if 'uri' not in img:continue
   src=path.parent/img['uri'];out=src.with_name('preview-'+src.name)
   if not out.exists():
    im=Image.open(src);im.thumbnail((256,256));im.save(out,optimize=True)
   img['uri']=out.name
  uri=tile+'.preview.bin';(path.parent/uri).write_bytes(binary)
  with gzip.open(path.parent/(uri+'.gz'),'wb',compresslevel=6) as f:f.write(binary)
  doc['accessors']=accessors;doc['bufferViews']=views;doc['buffers']=[{'uri':uri,'byteLength':len(binary)}];(path.parent/(tile+'.preview.gltf')).write_text(json.dumps(doc,separators=(',',':')))
  row={'garden':garden,'tile':tile,'before':before,'after':after,'bytes':len(binary),'gzip':(path.parent/(uri+'.gz')).stat().st_size};report.append(row);print(json.dumps(row),flush=True)
Path('output/mentor-flow135').mkdir(parents=True,exist_ok=True);Path('output/mentor-flow135/preview-build.json').write_text(json.dumps(report,indent=2))
