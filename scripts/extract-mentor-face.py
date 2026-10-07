"""CPU-only reference selection and landmark extraction. Sources never leave this PC."""
import json, pathlib, cv2, mediapipe as mp, numpy as np
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'.sites-runtime/avatar-source'
mesh=mp.solutions.face_mesh.FaceMesh(static_image_mode=True,max_num_faces=1,refine_landmarks=False,min_detection_confidence=.6)
def detect(image):
 r=mesh.process(cv2.cvtColor(image,cv2.COLOR_BGR2RGB))
 if not r.multi_face_landmarks:return None
 return np.array([[p.x,p.y,p.z] for p in r.multi_face_landmarks[0].landmark])
base=cv2.imdecode(np.fromfile(str(out/'base-face.png'),dtype=np.uint8),cv2.IMREAD_COLOR);basepts=detect(base)
if basepts is None:raise RuntimeError('Cannot find the base model face')
(out/'base-landmarks.json').write_text(json.dumps(basepts.tolist()))
# The labeled interview also contains B-roll with other people. Match the close-up
# shot geometry/background against the reviewed frame; never select arbitrary faces.
known=cv2.imdecode(np.fromfile(str(out/'uploaded-frame12.png'),dtype=np.uint8),cv2.IMREAD_COLOR)
known_pts=detect(known);known_area=np.prod(np.ptp(known_pts[:,:2],axis=0));known_center=known_pts[:,:2].mean(0)
def background(im):
 h,w=im.shape[:2];return cv2.resize(im[int(h*.15):int(h*.23),int(w*.43):int(w*.63)],(12,12)).astype(float)
known_background=background(known)
video=root/'.sites-runtime/voice-reference/f922ad0fa273a637876ad1b4d9ddbef3.mp4'
ascii_video=pathlib.Path.home()/'.cache/suda-face-project/.sites-runtime/voice-reference'/video.name
cap=cv2.VideoCapture(str(ascii_video));duration=cap.get(cv2.CAP_PROP_FRAME_COUNT)/cap.get(cv2.CAP_PROP_FPS)
candidates=[]
for seconds in np.arange(8,min(duration-1,17),.25):
 cap.set(cv2.CAP_PROP_POS_MSEC,float(seconds*1000));ok,image=cap.read()
 if not ok:continue
 points=detect(image)
 if points is None:continue
 if np.prod(np.ptp(points[:,:2],axis=0))<known_area*.72:continue
 if np.linalg.norm(points[:,:2].mean(0)-known_center)>.09:continue
 if np.mean(np.abs(background(image)-known_background))>24:continue
 h,w=image.shape[:2];xyz=points*np.array([w,h,w]);eye=xyz[263]-xyz[33]
 yaw=abs(eye[2])/max(1,np.linalg.norm(eye[:2]));pitch=abs((xyz[10]-xyz[152])[2])/max(1,np.linalg.norm((xyz[10]-xyz[152])[:2]))
 box=points[:,:2];left,top=np.maximum(0,box.min(0)*[w,h]).astype(int);right,bottom=np.minimum([w-1,h-1],box.max(0)*[w,h]).astype(int)
 sharp=cv2.Laplacian(cv2.cvtColor(image[top:bottom,left:right],cv2.COLOR_BGR2GRAY),cv2.CV_64F).var()
 mouth=np.linalg.norm(xyz[13,:2]-xyz[14,:2])/max(1,np.linalg.norm(xyz[263,:2]-xyz[33,:2]))
 eye_open=(np.linalg.norm(xyz[159,:2]-xyz[145,:2])+np.linalg.norm(xyz[386,:2]-xyz[374,:2]))/max(1,np.linalg.norm(xyz[263,:2]-xyz[33,:2]))
 score=yaw*2+pitch+mouth*4-max(0,min(eye_open,.12))*.8-min(sharp,400)/2000
 candidates.append((score,seconds,image,points,yaw,pitch,sharp,mouth))
if not candidates:raise RuntimeError('No suitable mentor face found in uploaded footage')
candidates.sort(key=lambda x:x[0]);best=candidates[0]
score,seconds,image,points,yaw,pitch,sharp,mouth=best
(out/'identity-reference.png').write_bytes(cv2.imencode('.png',image)[1].tobytes())
# Keep multiple independent estimates for quality checks and provenance, not just one short crop.
selected=[{'seconds':float(c[1]),'yaw':float(c[4]),'pitch':float(c[5]),'sharpness':float(c[6]),'mouthGap':float(c[7]),'landmarks':c[3].tolist()} for c in candidates[:12]]
(out/'identity-landmarks.json').write_text(json.dumps({'width':image.shape[1],'height':image.shape[0],'source':video.name,'selectedSeconds':float(seconds),'samples':selected,'landmarks':points.tolist()}))
print(json.dumps({'framesChecked':len(candidates),'selectedSeconds':seconds,'yaw':yaw,'sharpness':sharp,'mouth':mouth}),flush=True)
cap.release();mesh.close()
