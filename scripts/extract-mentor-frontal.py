import pathlib,cv2,json,numpy as np,mediapipe as mp
root=pathlib.Path(__file__).resolve().parents[1];out=root/'.sites-runtime/avatar-source';video=pathlib.Path.home()/'.cache/suda-face-project/.sites-runtime/voice-reference/1a25e89d017f79ff971997a8df699e41.mp4'
cap=cv2.VideoCapture(str(video));mesh=mp.solutions.face_mesh.FaceMesh(static_image_mode=True,max_num_faces=1,min_detection_confidence=.6);candidates=[]
for second in np.arange(1,31,.5):
 cap.set(cv2.CAP_PROP_POS_MSEC,float(second*1000));ok,image=cap.read()
 if not ok:continue
 h,w=image.shape[:2];x0,x1=int(w*.3),int(w*.69);y0,y1=int(h*.39),int(h*.64);crop=image[y0:y1,x0:x1]
 r=mesh.process(cv2.cvtColor(crop,cv2.COLOR_BGR2RGB))
 if not r.multi_face_landmarks:continue
 lm=np.array([[l.x,l.y,l.z] for l in r.multi_face_landmarks[0].landmark]);lm[:,0]=(lm[:,0]*(x1-x0)+x0)/w;lm[:,1]=(lm[:,1]*(y1-y0)+y0)/h;lm[:,2]*=(x1-x0)/w
 xyz=lm*np.array([w,h,w]);eye=np.linalg.norm(xyz[263,:2]-xyz[33,:2]);mouth=np.linalg.norm(xyz[13,:2]-xyz[14,:2])/eye;blink=(np.linalg.norm(xyz[159,:2]-xyz[145,:2])+np.linalg.norm(xyz[386,:2]-xyz[374,:2]))/eye
 yaw=abs(xyz[263,2]-xyz[33,2])/eye;points=lm[:,:2];left,top=(points.min(0)*[w,h]).astype(int);right,bottom=(points.max(0)*[w,h]).astype(int);sharp=cv2.Laplacian(cv2.cvtColor(image[top:bottom,left:right],cv2.COLOR_BGR2GRAY),cv2.CV_64F).var();score=mouth*4+yaw*2-min(blink,.13)-min(sharp,400)/2000
 candidates.append((score,float(second),image,lm))
if not candidates:raise RuntimeError('No usable frontal face was detected')
candidates.sort(key=lambda c:c[0]);score,second,image,lm=candidates[0];(out/'identity-frontal-reference.png').write_bytes(cv2.imencode('.png',image)[1].tobytes());d={'width':w,'height':h,'source':video.name,'selectedSeconds':second,'landmarks':lm.tolist(),'samples':[{'seconds':c[1],'landmarks':c[3].tolist()} for c in candidates[:12]]};(out/'identity-frontal-landmarks.json').write_text(json.dumps(d));print(json.dumps({'matchingFrames':len(candidates),'selectedSeconds':second,'facePixels':(np.ptp(lm[:,:2],axis=0)*[w,h]).tolist()}));cap.release();mesh.close()
