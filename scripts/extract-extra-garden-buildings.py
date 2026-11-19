import json,struct,copy,math,time
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist/assets/garden-buildings';OUT.mkdir(parents=True,exist_ok=True)
def convert(name,span,anchor):
 started=time.time();raw=(ROOT/'.sites-runtime/garden-model-research'/f'{SOURCE}.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);off=20+length;blen=struct.unpack_from('<I',raw,off)[0];blob=memoryview(raw)[off+8:off+8+blen];folder=OUT/name;folder.mkdir(exist_ok=True)
 kinds={5126:'<f4',5125:'<u4',5123:'<u2',5122:'<i2',5121:'u1',5120:'i1'};widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
 def arr(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dtype=np.dtype(kinds[a['componentType']]);w=widths[a['type']];return np.ndarray((a['count'],w),dtype,buffer=blob,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dtype.itemsize*w),dtype.itemsize))
 def local(n):
  if 'matrix'in n:return np.array(n['matrix'],float).reshape(4,4).T
  x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];m[:3,:3]*=n.get('scale',[1,1,1]);m[:3,3]=n.get('translation',[0,0,0]);return m
 def walk():
  stack=[(i,np.eye(4)) for i in doc['scenes'][doc.get('scene',0)]['nodes']]
  while stack:
   i,parent=stack.pop();n=doc['nodes'][i];world=parent@local(n)
   if 'mesh'in n:yield n['mesh'],world
   stack.extend((c,world) for c in n.get('children',[]))
 # Keep the selected component in its original world orientation, including ancestors.
 stack=[(i,np.eye(4)) for i in doc['scenes'][doc.get('scene',0)]['nodes']]
 while stack:
  i,parent=stack.pop();node=doc['nodes'][i];m=parent@local(node)
  if i==SELECT:
   node['matrix']=m.T.flatten().tolist()
   for field in ['translation','rotation','scale']:node.pop(field,None)
   doc['scenes'][doc.get('scene',0)]['nodes']=[i];break
  stack.extend((j,m) for j in node.get('children',[]))
 bounds={}
 for i,m in enumerate(doc['meshes']):
  pts=[]
  for p in m['primitives']:
   if p.get('mode',4)!=4:continue
   a=arr(p['attributes']['POSITION']);lo=a.min(axis=0);hi=a.max(axis=0);pts.extend([[x,y,z,1] for x in [lo[0],hi[0]] for y in [lo[1],hi[1]] for z in [lo[2],hi[2]]])
  if pts:bounds[i]=np.array(pts)
 lo=np.full(3,np.inf);hi=-lo;count=0
 for mesh,m in walk():
  if mesh not in bounds:continue
  pts=bounds[mesh]@m.T;lo=np.minimum(lo,pts[:,:3].min(axis=0));hi=np.maximum(hi,pts[:,:3].max(axis=0));count+=1
 scale=span/max(hi[0]-lo[0],hi[2]-lo[2]);center=(lo+hi)/2;center[1]=lo[1];chunks={}
 for mesh,m in walk():
  if mesh not in bounds:continue
  m=m.copy();m[:3,3]=(m[:3,3]-center)*scale;m[:3,:3]*=scale
  c=(bounds[mesh].mean(axis=0)@m.T)[:3];key=(0,0);chunks.setdefault(key,{}).setdefault(mesh,[]).append(m)
 print(name,'instances',count,'chunks',len(chunks),'bounds',(hi-lo).tolist(),flush=True)
 # Extract each original texture once; every tile references the same URL.
 images=[]
 for i,image in enumerate(doc.get('images',[])):
  image=copy.deepcopy(image)
  if 'bufferView'in image:
   v=doc['bufferViews'][image.pop('bufferView')];ext='png' if image.get('mimeType')=='image/png' else 'jpg';fn=f'texture-{i}.{ext}';image['uri']=f'/assets/gardens/{SOURCE}/{fn}'
  images.append(image)
 entries=[]
 from scipy.spatial.transform import Rotation
 for ci,(key,meshes) in enumerate(chunks.items()):
  out={'asset':{'version':'2.0','generator':'PianoCoach garden repair / GPU instancing'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'buffers':[],'bufferViews':[],'accessors':[],'materials':copy.deepcopy(doc.get('materials',[])),'textures':copy.deepcopy(doc.get('textures',[])),'samplers':copy.deepcopy(doc.get('samplers',[])),'images':images,'extensionsUsed':['EXT_mesh_gpu_instancing'],'extensionsRequired':['EXT_mesh_gpu_instancing']};binary=bytearray();cache={};tile_origin=np.array([key[0]*20,0,key[1]*20])
  for material_index,material in enumerate(out['materials']):material['name']=name+'-material-'+str(material_index)
  def add(values,component=5126,typ=None):
   values=np.asarray(values);values=values.astype(kinds[component],copy=False);binary.extend(b'\0'*((-len(binary))%4));start=len(binary);binary.extend(values.tobytes());vi=len(out['bufferViews']);out['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':values.nbytes});ai=len(out['accessors']);item={'bufferView':vi,'componentType':component,'count':len(values),'type':typ or {1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[values.shape[1]]};
   if item['type']=='VEC3':item.update(min=values.min(axis=0).tolist(),max=values.max(axis=0).tolist())
   out['accessors'].append(item);return ai
  def accessor(old,normal=False):
   if old in cache:return cache[old]
   a=doc['accessors'][old];v=arr(old).copy()
   if normal:
    norm=np.linalg.norm(v,axis=1,keepdims=True);v=v/np.maximum(norm,1e-12);v[norm[:,0]<1e-12]=[0,1,0]
   ai=add(v,a['componentType'],a['type']);cache[old]=ai;return ai
  single_batches={}
  for mesh,matrices in meshes.items():
   if len(matrices)==1:
    transform=matrices[0];normal_transform=np.linalg.pinv(transform[:3,:3]).T
    for p in doc['meshes'][mesh]['primitives']:
     if p.get('mode',4)!=4:continue
     indices=arr(p['indices']).ravel().astype(int) if 'indices'in p else np.arange(len(arr(p['attributes']['POSITION'])))
     if np.linalg.det(transform[:3,:3])<0:indices=indices.reshape(-1,3)[:,::-1].ravel()
     attrs={}
     for semantic,access in p['attributes'].items():
      a=doc['accessors'][access];values=arr(access)[indices].astype(np.float32)
      if a.get('normalized') and np.issubdtype(arr(access).dtype,np.integer):values/=np.iinfo(arr(access).dtype).max
      if semantic=='POSITION':values=values@transform[:3,:3].T+transform[:3,3]-tile_origin
      elif semantic=='NORMAL':
       values=values@normal_transform.T;norm=np.linalg.norm(values,axis=1,keepdims=True);values/=np.maximum(norm,1e-12);values[norm[:,0]<1e-12]=[0,1,0]
      elif semantic=='TANGENT':continue
      attrs[semantic]=values
     batch_key=(p.get('material',0),tuple(sorted(attrs)));batch=single_batches.setdefault(batch_key,{k:[] for k in attrs})
     for k,v in attrs.items():batch[k].append(v)
    continue
   primitives=[]
   for p in doc['meshes'][mesh]['primitives']:
    if p.get('mode',4)!=4:continue
    q=copy.deepcopy(p);q['attributes']={k:accessor(v,k=='NORMAL') for k,v in p['attributes'].items()}
    if 'indices'in p:q['indices']=accessor(p['indices'])
    primitives.append(q)
   mi=len(out['meshes']);out['meshes'].append({'primitives':primitives});m=np.array(matrices);scales=np.linalg.norm(m[:,:3,:3],axis=1);neg=np.linalg.det(m[:,:3,:3])<0;scales[neg,0]*=-1;rotation=m[:,:3,:3]/np.where(abs(scales[:,None,:])>1e-12,scales[:,None,:],1);quat=Rotation.from_matrix(rotation).as_quat();attributes={'TRANSLATION':add(m[:,:3,3]-tile_origin),'ROTATION':add(quat),'SCALE':add(scales)};ni=len(out['nodes']);out['nodes'].append({'mesh':mi,'extensions':{'EXT_mesh_gpu_instancing':{'attributes':attributes}}});out['scenes'][0]['nodes'].append(ni)
  for (material,semantics),attrs in single_batches.items():
   mi=len(out['meshes']);out['meshes'].append({'primitives':[{'attributes':{k:add(np.concatenate(v)) for k,v in attrs.items()},'material':material}]});out['scenes'][0]['nodes'].append(len(out['nodes']));out['nodes'].append({'mesh':mi})
  stem=f'tile-{key[0]}-{key[1]}';(folder/(stem+'.bin')).write_bytes(binary);out['buffers']=[{'uri':stem+'.bin','byteLength':len(binary)}];(folder/(stem+'.gltf')).write_text(json.dumps(out,separators=(',',':')),encoding='utf-8');entries.append({'id':name+'-'+stem,'status':'ready','license':'User-confirmed research authorization; model by F. L., 3D Warehouse','url':f'/assets/gardens/{name}/{stem}.gltf','position':[float(anchor[0]+tile_origin[0]),0,float(anchor[1]+tile_origin[2])],'scale':1,'radius':35,'loadDistance':100,'garden':name})
  if ci%8==0:print(name,'written',ci+1,'/',len(chunks),flush=True)
 (folder/'conversion.json').write_text(json.dumps({'instances':count,'chunks':len(chunks),'originalBounds':[lo.tolist(),hi.tolist()],'scale':scale,'seconds':time.time()-started}));return entries


for SOURCE,SELECT,name,span in [('yiyuan',235,'yiyuan-main-hall',16.75),('zhuozhengyuan',374763,'zhuo-pavilion-large',13.05),('zhuozhengyuan',373618,'zhuo-large-hall',17.3)]:
 convert(name,span,[0,0])
