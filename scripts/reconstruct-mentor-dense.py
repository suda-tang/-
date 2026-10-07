"""Offline CPU 3DDFA candidate. Never overwrites the published avatar."""
import pathlib,sys,argparse,json,pickle,numpy as np
root=pathlib.Path(__file__).resolve().parents[1];repo=root/'.sites-runtime/3ddfa/3DDFA_V2-master';out=root/'.sites-runtime/avatar-source'
if '--export' in sys.argv:
 import torch
 torch.set_num_threads(1);sys.path.insert(0,str(repo));import models
 model=models.mobilenet(num_classes=62,widen_factor=1.0,size=120,mode='small')
 checkpoint=torch.load(str(repo/'weights/mb1_120x120.pth'),map_location='cpu',weights_only=True)['state_dict'];weights=model.state_dict()
 for k,v in checkpoint.items():
  key=k.replace('module.','').replace('fc_param.','fc.')
  if key in weights:weights[key]=v
 model.load_state_dict(weights);model.eval()
 torch.onnx.export(model,torch.zeros(1,3,120,120),str(repo/'weights/mentor-mb1.onnx'),input_names=['input'],output_names=['output'],opset_version=12,do_constant_folding=True)
 print('CPU inference graph exported');raise SystemExit()
import cv2,onnxruntime as ort
prefix='identity-frontal' if '--frontal' in sys.argv else 'identity'
reference=json.loads((out/(prefix+'-landmarks.json')).read_text());image=cv2.imdecode(np.fromfile(str(out/(prefix+'-reference.png')),dtype=np.uint8),cv2.IMREAD_COLOR);h,w=image.shape[:2];landmarks=np.array(reference['landmarks'])
# The verified mentor close-up provides the detection box; no arbitrary-face selection.
left,top=landmarks[:,:2].min(0)*[w,h];right,bottom=landmarks[:,:2].max(0)*[w,h];oldsize=(right-left+bottom-top)/2;cx=(left+right)/2;cy=(top+bottom)/2+oldsize*.14;size=int(oldsize*1.58);sx,sy=int(cx-size/2),int(cy-size/2)
crop=np.zeros((size,size,3),dtype=np.uint8);a,b=max(0,sx),max(0,sy);c,d=min(w,sx+size),min(h,sy+size);crop[b-sy:d-sy,a-sx:c-sx]=image[b:d,a:c]
input_data=(cv2.resize(crop,(120,120)).astype(np.float32).transpose(2,0,1)[None]-127.5)/128
options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
session=ort.InferenceSession(str(repo/'weights/mentor-mb1.onnx'),sess_options=options,providers=['CPUExecutionProvider']);param=session.run(None,{'input':input_data})[0].flatten()
with open(repo/'configs/param_mean_std_62d_120x120.pkl','rb') as f:stats=pickle.load(f,encoding='latin1')
param=param*stats['std']+stats['mean'];pose=param[:12].reshape(3,4);shape=param[12:52];expression=param[52:62]
with open(repo/'configs/bfm_noneck_v3.pkl','rb') as f:bfm=pickle.load(f,encoding='latin1')
with open(repo/'configs/tri.pkl','rb') as f:tri=pickle.load(f,encoding='latin1')
u=np.asarray(bfm['u']).reshape(-1);shp=np.asarray(bfm['w_shp'])[:,:40];exp=np.asarray(bfm['w_exp'])[:,:10]
neutral=(u+shp@shape).reshape(-1,3);posed_shape=(u+shp@shape+exp@expression).reshape(-1,3)
projected=posed_shape@pose[:,:3].T+pose[:,3];projected[:,0]=(projected[:,0]-1)*size/120+sx;projected[:,1]=(120-projected[:,1])*size/120+sy
uv=np.c_[projected[:,0]/w,1-projected[:,1]/h]
key=np.asarray(bfm['keypoints'],dtype=np.int64).reshape(-1);keypoints=(u[key]+shp[key]@shape).reshape(-1,3)
if tri.shape[0]==3:tri=tri.T
report={'method':'3DDFA_V2 MobileNet + BFM shape regression, ONNX CPU','vertexCount':len(neutral),'sourceSeconds':reference['selectedSeconds'],'stage':'offline candidate, not published','limits':'Face-only reconstruction; hair and rear skull are not reconstructed'}
(out/('mentor-dense-frontal-candidate.json' if '--frontal' in sys.argv else 'mentor-dense-candidate.json')).write_text(json.dumps({'positions':neutral.flatten().tolist(),'uv':uv.flatten().tolist(),'indices':np.asarray(tri,dtype=int).flatten().tolist(),'keypoints':keypoints.tolist(),'report':report},separators=(',',':')))
print(json.dumps(report))
