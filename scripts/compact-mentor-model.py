"""Preserve rig/topology, retain used facial morphs and compact embedded textures."""
import json,struct,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parents[1];p=root/'dist/narration/models';raw=(p/'mentor-base.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:];keep={'jawOpen','eyeBlinkLeft','eyeBlinkRight','mouthSmileLeft','mouthSmileRight'}
for mi,m in enumerate(g['meshes']):
 names=m.get('extras',{}).get('targetNames',[])
 if not names:continue
 selected=[i for i,name in enumerate(names) if name in keep]
 m['extras']['targetNames']=[names[i] for i in selected]
 if 'weights' in m:m['weights']=[m['weights'][i] for i in selected]
 for primitive in m['primitives']:
  if selected:primitive['targets']=[primitive['targets'][i] for i in selected]
  else:primitive.pop('targets',None)
 for node in g['nodes']:
  if node.get('mesh')==mi and 'weights' in node:node['weights']=[node['weights'][i] for i in selected]
used=set()
for m in g['meshes']:
 for primitive in m['primitives']:
  used.update(primitive['attributes'].values());used.update([primitive['indices']] if 'indices' in primitive else [])
  for target in primitive.get('targets',[]):used.update(target.values())
for skin in g.get('skins',[]):
 if 'inverseBindMatrices' in skin:used.add(skin['inverseBindMatrices'])
for animation in g.get('animations',[]):
 for sample in animation['samplers']:used.update([sample['input'],sample['output']])
remap={old:new for new,old in enumerate(sorted(used))};accessors=[g['accessors'][old] for old in sorted(used)]
for m in g['meshes']:
 for primitive in m['primitives']:
  primitive['attributes']={k:remap[v] for k,v in primitive['attributes'].items()}
  if 'indices' in primitive:primitive['indices']=remap[primitive['indices']]
  for target in primitive.get('targets',[]):
   for k in target:target[k]=remap[target[k]]
for skin in g.get('skins',[]):
 if 'inverseBindMatrices' in skin:skin['inverseBindMatrices']=remap[skin['inverseBindMatrices']]
for animation in g.get('animations',[]):
 for sample in animation['samplers']:
  for k in ['input','output']:sample[k]=remap[sample[k]]
g['accessors']=accessors;views=g['bufferViews'];out_views=[];buffer=bytearray();mapped={};work=root/'.sites-runtime/avatar-source';ffmpeg='C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe'
def append_view(old,data=None):
 if old in mapped:return mapped[old]
 v=dict(views[old]);start=v.get('byteOffset',0);content=data if data is not None else binary[start:start+v['byteLength']]
 buffer.extend(b'\0'*((-len(buffer))%4));v['byteOffset']=len(buffer);v['byteLength']=len(content);buffer.extend(content);mapped[old]=len(out_views);out_views.append(v);return mapped[old]
for a in accessors:
 if 'bufferView' in a:a['bufferView']=append_view(a['bufferView'])
 if 'sparse' in a:
  for part in ['indices','values']:
   a['sparse'][part]['bufferView']=append_view(a['sparse'][part]['bufferView'])
for i,image in enumerate(g.get('images',[])):
 old=image['bufferView'];v=views[old];start=v.get('byteOffset',0);src=work/f'original-texture-{i}.png';dst=work/f'compact-texture-{i}.png';src.write_bytes(binary[start:start+v['byteLength']])
 subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(src),'-vf',"scale='min(1024,iw)':-1",'-frames:v','1',str(dst)],check=True)
 image['bufferView']=append_view(old,dst.read_bytes());image['mimeType']='image/png'
g['bufferViews']=out_views;g['buffers']=[{'byteLength':len(buffer)}];g['asset']['generator']='MPFB example; runtime compaction preserving topology'
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4);buffer.extend(b'\0'*((-len(buffer))%4));result=struct.pack('<III',0x46546c67,2,12+8+len(j)+8+len(buffer))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(buffer),0x004e4942)+buffer;(p/'mentor-runtime.glb').write_bytes(result);print('Runtime GLB bytes:',len(result))
