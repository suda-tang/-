"""Fit personalized 3D vertex displacement and skin coordinates; keep the rig intact."""
import json,pathlib,numpy as np,cv2,subprocess,hashlib
from scipy.interpolate import RBFInterpolator,LinearNDInterpolator,NearestNDInterpolator
root=pathlib.Path(__file__).resolve().parents[1];source=root/'.sites-runtime/avatar-source';public=root/'dist/narration/models'
base=json.loads((source/'base-surface.json').read_text());ref=json.loads((source/'identity-landmarks.json').read_text());b2=np.array(json.loads((source/'base-landmarks.json').read_text()))[:,:2];b3=np.array(base['anchors']);t=np.array(ref['landmarks']);w,h=ref['width'],ref['height']
# Frontalize the detected three-dimensional face using its eye/forehead axes.
xyz=t*np.array([w,-h,-w]);right=xyz[263]-xyz[33];right/=np.linalg.norm(right);up=xyz[10]-xyz[152];front=np.cross(right,up);front/=np.linalg.norm(front);up=np.cross(front,right)
origin=(xyz[33]+xyz[263])/2;local=(xyz-origin)@np.stack([right,up,front],axis=1)
b_origin=(b3[33]+b3[263])/2;scale=np.linalg.norm(b3[263]-b3[33])/np.linalg.norm(xyz[263]-xyz[33]);target=local*scale+b_origin
# Use side portraits to regularize proportions after independently removing pose.
# Never average image-space landmarks from differently angled photographs.
if ref.get('source') and len(ref.get('samples',[]))==5:
 estimates=[];weights=[]
 for sample in ref['samples']:
  pts=np.array(sample['landmarks'])*np.array([1,-1,-1]);axis=pts[263]-pts[33];axis/=np.linalg.norm(axis);vertical=pts[10]-pts[152];normal=np.cross(axis,vertical);normal/=np.linalg.norm(normal);vertical=np.cross(normal,axis);center=(pts[33]+pts[263])/2
  canonical=(pts-center)@np.stack([axis,vertical,normal],axis=1);canonical*=np.linalg.norm(b3[263]-b3[33])/np.linalg.norm(pts[263]-pts[33]);canonical+=b_origin
  estimates.append(canonical);weights.append(1/(1+float(sample.get('yaw',0))**4))
 consensus=np.average(np.array(estimates),axis=0,weights=weights)
 target=target*.85+consensus*.15
# Weak-perspective depth is less reliable than x/y; temper it against the base.
target[:,2]=b3[:,2]*.65+target[:,2]*.35
deltas=target-b3
# Remove noisy near-duplicate samples, then fit a regularized 3D deformation.
stable=np.array([10,152,234,454,93,323,132,361,172,397,149,378,148,377,176,400,58,288,136,365,33,263,133,362,159,386,145,374,70,300,63,293,105,334,1,4,6,168,98,327,61,291,0,17,13,14])
# Regularize shared x/y field across skin and eyes instead of fitting noisy depths
# separately. This avoids folds and detached eyelids in a monocular estimate.
warp=RBFInterpolator(b3[stable,:2],deltas[stable],kernel='thin_plate_spline',smoothing=.00006)
uv_fit=LinearNDInterpolator(b2,t[:,:2],fill_value=np.nan)
uv_border=NearestNDInterpolator(b2,t[:,:2])
hull=cv2.convexHull(b2.astype(np.float32));left,top=t[:,:2].min(0);right_uv,bottom=t[:,:2].max(0)
x0=max(0,int(left*w)-12);y0=max(0,int(top*h)-12);x1=min(w,int(right_uv*w)+13);y1=min(h,int(bottom*h)+13)
# FFmpeg creates the cropped texture from the selected source frame. No source video is published.
ffmpeg=pathlib.Path('C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe')
subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-y','-i',str(source/'identity-reference.png'),'-vf',f'crop={x1-x0}:{y1-y0}:{x0}:{y0}','-frames:v','1',str(public/'mentor-face.png')],check=True)
result=[];max_delta=0
for m in base['meshes']:
 world=np.array(m['world']).reshape(-1,3);local_pos=np.array(m['positions']).reshape(-1,3);mat=np.array(m['matrix']).reshape(4,4).T;inv=np.linalg.inv(mat)
 screen=np.c_[world[:,0]/.34+.5,.5-(world[:,1]-base['eyeY'])/.34]
 inside=np.array([cv2.pointPolygonTest(hull,(float(p[0]),float(p[1])),True) for p in screen]);edge=np.clip((inside+.004)/.04,0,1)
 # Cheeks are behind the nose, but are still part of the visible face. A nose
 # depth threshold makes patchy masks on cheeks and around the eye sockets.
 frontness=np.clip((world[:,2]+.07)/.045,0,1);mask=edge*frontness
 # Stay on the head; keep neck, body and the back of the head unchanged.
 mask*=((world[:,1]>1.48)&(world[:,1]<1.72))
 selected=np.flatnonzero(mask>.0001)
 move=np.zeros_like(world);uv=np.zeros((len(world),2))
 if len(selected):
  change=warp(world[selected,:2]);change=.012*np.tanh(change/.012);move[selected]=change*mask[selected,None]
  raw_uv=uv_fit(screen[selected]);valid=np.isfinite(raw_uv).all(1)
  raw_uv[~valid]=uv_border(screen[selected[~valid]])
  uv[selected]=np.c_[(raw_uv[:,0]*w-x0)/(x1-x0),1-(raw_uv[:,1]*h-y0)/(y1-y0)]
 # Zero-weight vertices still participate in triangle UV interpolation. Give
 # them border coordinates, rather than (0,0), to prevent diagonal streaks.
 outside=np.flatnonzero(mask<=.0001)
 if len(outside):
  border=uv_border(screen[outside]);uv[outside]=np.c_[(border[:,0]*w-x0)/(x1-x0),1-(border[:,1]*h-y0)/(y1-y0)]
 changed=world+move;changed_local=np.c_[changed,np.ones(len(changed))]@inv.T
 delta_local=changed_local[:,:3]-local_pos
 # Eyelashes/eyebrows retain their actual geometry and original materials.
 if 'eyebrow' in m['name'] or 'eyelash' in m['name']:mask*=0
 if 'teeth' in m['name'] or 'tongue' in m['name']:mask*=0
 max_delta=max(max_delta,float(np.linalg.norm(move,axis=1).max()))
 result.append({'name':m['name'],'delta':np.round(delta_local,6).flatten().tolist(),'uv':np.round(uv,6).flatten().tolist(),'mask':np.round(mask,5).tolist()})
report={'method':'MediaPipe FaceMesh CPU + regularized 3D landmark fit','source':ref['source'],'sourceSeconds':ref.get('selectedSeconds'),'samplesChecked':len(ref['samples']),'landmarkCount':468,'maxDisplacementMeters':max_delta,'limitations':['Approximate monocular geometry, not a 3D scan','Back of head and body use the generic rig','Lip motion is amplitude-driven, not phoneme-aligned']}
texture_revision=hashlib.sha256((public/'mentor-face.png').read_bytes()).hexdigest()[:12]
(public/'mentor-identity.json').write_text(json.dumps({'version':2,'texture':'/narration/models/mentor-face.png?v='+texture_revision,'meshes':result,'report':report},separators=(',',':')))
(source/'face-fit-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
