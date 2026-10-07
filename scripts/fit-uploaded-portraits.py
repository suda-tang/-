"""Review five uploaded portraits with CPU landmarks and pick the clearest frontal fit."""
import json,pathlib,cv2,numpy as np,mediapipe as mp
root=pathlib.Path(__file__).resolve().parents[1];store=root/'.sites-runtime/portrait-reference';out=root/'.sites-runtime/avatar-source'
detector=mp.solutions.face_mesh.FaceMesh(static_image_mode=True,max_num_faces=1,min_detection_confidence=.45)
candidates=[]
for path in store.glob('*.json'):
 meta=json.loads(path.read_text(encoding='utf-8'));image=cv2.imdecode(np.fromfile(str(path.with_suffix('.jpg')),dtype=np.uint8),cv2.IMREAD_COLOR)
 result=detector.process(cv2.cvtColor(image,cv2.COLOR_BGR2RGB))
 if not result.multi_face_landmarks:continue
 points=np.array([[p.x,p.y,p.z] for p in result.multi_face_landmarks[0].landmark]);h,w=image.shape[:2];xyz=points*[w,h,w];eye=xyz[263]-xyz[33];yaw=abs(eye[2])/max(1,np.linalg.norm(eye[:2]));pixels=np.ptp(points[:,:2],axis=0)*[w,h]
 candidates.append((yaw,meta,image,points,pixels))
if not candidates:raise RuntimeError('No usable face found')
candidates.sort(key=lambda c:c[0]);yaw,meta,image,points,pixels=candidates[0]
(out/'identity-reference.png').write_bytes(cv2.imencode('.png',image)[1].tobytes())
samples=[{'source':m['id'],'angle':m['angle'],'yaw':float(y),'facePixels':px.tolist(),'landmarks':p.tolist()} for y,m,im,p,px in candidates]
(out/'identity-landmarks.json').write_text(json.dumps({'width':image.shape[1],'height':image.shape[0],'source':meta['id'],'samples':samples,'landmarks':points.tolist()}))
(out/'uploaded-photo-assessment.json').write_text(json.dumps({'photosDetected':len(samples),'selected':meta['id'],'yaw':float(yaw),'facePixels':pixels.tolist(),'samples':[{k:v for k,v in s.items() if k!='landmarks'} for s in samples]},indent=2))
print(json.dumps({'photosDetected':len(samples),'selected':meta['id'],'facePixels':pixels.tolist()}));detector.close()
