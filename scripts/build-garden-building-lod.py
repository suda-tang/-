import json, numpy as np, gzip
from pathlib import Path
from scipy.spatial.transform import Rotation
root=Path('dist/assets/garden-buildings');catalog=json.loads((root/'catalog.json').read_text())
kinds={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'};widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
for entry in catalog:
 p=root/entry['id']/'tile-0-0.gltf';d=json.loads(p.read_text());binary=(p.parent/d['buffers'][0]['uri']).read_bytes()
 def arr(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype(kinds[a['componentType']]);w=widths[a['type']];return np.ndarray((a['count'],w),dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*w),dt.itemsize)).copy()
 batches={}
 for n in d['nodes']:
  if 'mesh'not in n:continue
  ext=n.get('extensions',{}).get('EXT_mesh_gpu_instancing',{}).get('attributes')
  matrices=[np.eye(4)]
  if ext:
   ts=arr(ext['TRANSLATION']);qs=arr(ext['ROTATION']);ss=arr(ext['SCALE']);rs=Rotation.from_quat(qs).as_matrix();matrices=[]
   for t,r,s in zip(ts,rs,ss):
    m=np.eye(4);m[:3,:3]=r*s;m[:3,3]=t;matrices.append(m)
  for q in d['meshes'][n['mesh']]['primitives']:
   attrs={k:arr(v) for k,v in q['attributes'].items() if k in ['POSITION','NORMAL','TEXCOORD_0']};idx=arr(q['indices']).ravel().astype(int) if 'indices'in q else np.arange(len(attrs['POSITION']))
   for m in matrices:
    pos=attrs['POSITION']@m[:3,:3].T+m[:3,3];norm=attrs.get('NORMAL',np.zeros_like(pos))@np.linalg.inv(m[:3,:3]);norm/=np.maximum(np.linalg.norm(norm,axis=1,keepdims=True),1e-10)
    uv=attrs.get('TEXCOORD_0',np.zeros((len(pos),2)));ids=idx.reshape(-1,3).copy()
    if np.linalg.det(m[:3,:3])<0:ids=ids[:,[0,2,1]]
    batches.setdefault(q.get('material',0),[]).append((pos,norm,uv,ids))
 allpos=np.concatenate([x[0]for parts in batches.values()for x in parts]);size=allpos.max(axis=0)-allpos.min(axis=0);entry['bounds']=size.tolist()
 for i,material in enumerate(d['materials']):material['name']=entry['sourceGarden']+'-material-'+str(i)
 for mode,grid in [('near',None),('far',.55)]:
  out={'asset':{'version':'2.0','generator':'Original garden component extraction / shared LOD'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],'meshes':[{'primitives':[]}],'materials':d['materials'],'images':d.get('images',[]),'textures':d.get('textures',[]),'samplers':d.get('samplers',[]),'accessors':[],'bufferViews':[]};raw=bytearray();triangles=0
  def add(a,typ,component=5126):
   a=np.asarray(a,dtype=kinds[component]);raw.extend(b'\0'*((-len(raw))%4));off=len(raw);raw.extend(a.tobytes());vi=len(out['bufferViews']);out['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':a.nbytes});v={'bufferView':vi,'componentType':component,'count':len(a),'type':typ}
   if typ=='VEC3':v.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
   i=len(out['accessors']);out['accessors'].append(v);return i
  for mat,parts in batches.items():
   pos=np.concatenate([x[0]for x in parts]);norm=np.concatenate([x[1]for x in parts]);uv=np.concatenate([x[2]for x in parts]);inds=[];offset=0
   for a,b,c,idx in parts:inds.append(idx+offset);offset+=len(a)
   ids=np.concatenate(inds)
   if grid:
    keys=np.round(pos/grid).astype(np.int32);_,inv=np.unique(keys,axis=0,return_inverse=True);count=np.bincount(inv);new=[]
    for values in [pos,norm,uv]:new.append(np.column_stack([np.bincount(inv,weights=values[:,j])/count for j in range(values.shape[1])]))
    pos,norm,uv=new;norm/=np.maximum(np.linalg.norm(norm,axis=1,keepdims=True),1e-8);ids=inv[ids];ids=ids[(ids[:,0]!=ids[:,1])&(ids[:,1]!=ids[:,2])&(ids[:,0]!=ids[:,2])];ids=np.unique(ids,axis=0)
   if not len(ids):continue
   q={'attributes':{'POSITION':add(pos,'VEC3'),'NORMAL':add(norm,'VEC3'),'TEXCOORD_0':add(uv,'VEC2')},'indices':add(ids.ravel(),'SCALAR',5125),'material':mat};out['meshes'][0]['primitives'].append(q);triangles+=len(ids)
  out['buffers']=[{'uri':mode+'.bin','byteLength':len(raw)}];(p.parent/(mode+'.bin')).write_bytes(raw);(p.parent/(mode+'.gltf')).write_text(json.dumps(out,separators=(',',':')));print(entry['id'],mode,triangles,len(raw),flush=True)
 entry['near']=entry['url'].replace('tile-0-0.gltf','near.gltf');entry['far']=entry['url'].replace('tile-0-0.gltf','far.gltf')
(root/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False))
