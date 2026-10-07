"""Build a pose-normalized portrait surface from the supplied reference landmarks."""
import json, pathlib
import numpy as np
from PIL import Image

def triangulate(points):
    # Bowyer-Watson avoids adding a compiled SciPy dependency to the server.
    vertices = [tuple(p) for p in points] + [(-10,-10),(10,-10),(0,10)]
    n = len(points); faces = [(n,n+1,n+2)]
    def inside(t,p):
        a,b,c = [vertices[i] for i in t]
        d = 2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]))
        if abs(d)<1e-12: return False
        aa,bb,cc = [x*x+y*y for x,y in [a,b,c]]
        x=(aa*(b[1]-c[1])+bb*(c[1]-a[1])+cc*(a[1]-b[1]))/d
        y=(aa*(c[0]-b[0])+bb*(a[0]-c[0])+cc*(b[0]-a[0]))/d
        return (p[0]-x)**2+(p[1]-y)**2 <= (a[0]-x)**2+(a[1]-y)**2+1e-12
    for i,p in enumerate(vertices[:n]):
        bad = [t for t in faces if inside(t,p)]; edges = {}
        for a,b,c in bad:
            for edge in [(a,b),(b,c),(c,a)]:
                edge=tuple(sorted(edge)); edges[edge]=edges.get(edge,0)+1
        faces=[t for t in faces if t not in bad]
        faces.extend((a,b,i) for (a,b),count in edges.items() if count==1)
    return np.array([t for t in faces if max(t)<n])

root = pathlib.Path(__file__).resolve().parents[1]
source = root / '.sites-runtime/avatar-source'
public = root / 'dist/narration/models'
ref = json.loads((source / 'identity-landmarks.json').read_text())
p = np.array(ref['landmarks'])[:468]
w, h = ref['width'], ref['height']
xyz = p * [w, -h, -w]
right = xyz[263] - xyz[33]; right /= np.linalg.norm(right)
up = xyz[10] - xyz[152]
front = np.cross(right, up); front /= np.linalg.norm(front)
up = np.cross(front, right)
center = (xyz[10] + xyz[152]) / 2
points = (xyz - center) @ np.stack([right, up, front], axis=1)
points *= .38 / (points[10, 1] - points[152, 1])
# Keep the measured frontal proportions; monocular depth remains approximate.
points[:, 2] -= np.median(points[:, 2])
points[:, 2] *= .55
points[:, 2] += .095
uv = p[:, :2].copy()
triangles = triangulate(points[:, :2])
for t in triangles:
    a,b,c = points[t]
    if np.cross(b-a,c-a)[2] < 0: t[1],t[2] = t[2],t[1]
image = Image.open(source / 'identity-reference.png').convert('RGB')
x0,y0 = np.maximum(0, np.floor(uv.min(axis=0)*[w,h]-8).astype(int))
x1,y1 = np.minimum([w,h], np.ceil(uv.max(axis=0)*[w,h]+8).astype(int))
image.crop((x0,y0,x1,y1)).save(public/'mentor-reference-face.png')
uv = (uv*[w,h]-[x0,y0])/[x1-x0,y1-y0]; uv[:,1] = 1-uv[:,1]
# Two subdivisions preserve the source surface and produce smooth normals.
vertices = points.tolist(); coords = uv.tolist(); faces = triangles.tolist()
for _ in range(2):
    mids = {}; next_faces = []
    def midpoint(a,b):
        key = tuple(sorted((a,b)))
        if key not in mids:
            mids[key] = len(vertices)
            vertices.append(((np.array(vertices[a])+vertices[b])/2).tolist())
            coords.append(((np.array(coords[a])+coords[b])/2).tolist())
        return mids[key]
    for a,b,c in faces:
        ab,bc,ca = midpoint(a,b),midpoint(b,c),midpoint(c,a)
        next_faces.extend([[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]])
    faces = next_faces
data = {'positions':np.round(vertices,6).flatten().tolist(),
        'uv':np.round(coords,6).flatten().tolist(),'indices':np.array(faces).flatten().tolist(),
        'source':ref['source'],'referencesReviewed':len(ref['samples']),
        'limitations':'Photo-guided approximate geometry; not a measured 3D scan.'}
(public/'mentor-portrait-surface.json').write_text(json.dumps(data,separators=(',',':')))
print(json.dumps({'vertices':len(vertices),'triangles':len(faces),'source':ref['source']}))
