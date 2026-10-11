"""Photo-registered 3D hair surface; source pixels are copied without synthesis.
The measured frontal silhouette is retained. Hidden hair volume is approximate.
"""
import json, pathlib, shutil
import numpy as np
from scipy.spatial import Delaunay
root=pathlib.Path(__file__).resolve().parents[1]
source=root/'.sites-runtime/avatar-source'; public=source/'reference-hair-candidate';public.mkdir(parents=True,exist_ok=True)
ref=json.loads((source/'identity-landmarks.json').read_text())
if ref['source']!='ca9132db79bc4a07bce26242888d2329':
    raise RuntimeError('This reviewed silhouette belongs to a different reference; recalibration required')
w,h=ref['width'],ref['height']
p=np.array(ref['landmarks'])[:468];xyz=p*[w,-h,-w]
right=xyz[263]-xyz[33];right/=np.linalg.norm(right)
up=xyz[10]-xyz[152];front=np.cross(right,up);front/=np.linalg.norm(front);up=np.cross(front,right)
basis=np.stack([right,up,front],axis=1);center=(xyz[10]+xyz[152])/2
local=(xyz-center)@basis;scale=.38/(local[10,1]-local[152,1])
outline=np.array([[401,194],[461,128],[532,109],[592,107],[650,125],[716,170],[752,230],[776,309],[795,378],[811,470],[818,584],[832,658],[815,751],[781,822],[747,873],[702,879],[678,855],[675,812],[647,770],[634,708],[651,654],[672,605],[694,551],[711,492],[725,431],[706,362],[678,301],[631,258],[571,230],[520,242],[463,262],[429,294],[407,333],[401,368],[397,418],[376,461],[340,487],[304,509],[276,533],[238,558],[183,580],[122,610],[85,622],[70,595],[82,563],[122,529],[187,498],[258,477],[311,448],[339,405],[351,350],[368,288]],dtype=float)
def inside(points):
    x,y=points[:,0],points[:,1];mask=np.zeros(len(points),bool)
    for a,b in zip(outline,np.roll(outline,-1,axis=0)):
        mask^=((a[1]>y)!=(b[1]>y))&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1]+1e-12)+a[0])
    return mask
# Dense boundary sampling prevents triangles bridging the open face region.
border=[]
for a,b in zip(outline,np.roll(outline,-1,axis=0)):
    border.extend(a+(b-a)*t for t in np.linspace(0,1,max(2,int(np.linalg.norm(b-a)/12)),endpoint=False))
x,y=np.meshgrid(np.arange(70,834,14),np.arange(107,880,14));grid=np.c_[x.ravel(),y.ravel()]
pixels=np.vstack([border,grid[inside(grid)]])
tri=Delaunay(pixels).simplices
valid=inside(pixels[tri].mean(1))
for a,b in [(0,1),(1,2),(2,0)]:valid &= inside(pixels[tri[:,a]]*.49+pixels[tri[:,b]]*.51)
tri=tri[valid]
# Reproject the photo through the same pose basis used for the face.
# Crown recedes, temples sit beside the face, and the ends form a curled volume.
height=(pixels[:,1]-107)/772
z=.11-.075*np.exp(-((height-.08)/.18)**2)-.045*np.clip((height-.55)/.45,0,1)
z+=.009*np.sin(height*18+pixels[:,0]*.012)*np.clip(height,0,1)
rawz=(z-.095)/.55/scale+np.median(local[:,2])
imagexy=np.c_[pixels[:,0],-pixels[:,1]]-center[:2]
xy=(imagexy-rawz[:,None]*basis[:2,2])@np.linalg.inv(basis[:2,:2]).T
vertices=np.c_[xy*scale,z]
for t in tri:
    a,b,c=vertices[t]
    if np.cross(b-a,c-a)[2]<0:t[1],t[2]=t[2],t[1]
uv=pixels/[w,h];uv[:,1]=1-uv[:,1]
asset={'positions':vertices.round(6).ravel().tolist(),'uv':uv.round(6).ravel().tolist(),'indices':tri.ravel().tolist(),'source':ref['source'],'method':'Reference silhouette with photo-registered UVs and approximate depth','limitations':'Not a 3D scan; unseen volume remains estimated.'}
(public/'mentor-reference-hair.json').write_text(json.dumps(asset,separators=(',',':')))
shutil.copyfile(root/'.sites-runtime/portrait-reference'/f"{ref['source']}.jpg",public/'mentor-reference-hair.jpg')
print(json.dumps({'vertices':len(vertices),'triangles':len(tri),'source':ref['source']}))
