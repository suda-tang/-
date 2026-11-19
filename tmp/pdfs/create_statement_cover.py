import cv2,numpy as np,os
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor,Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from fontTools.ttLib import TTFont as FTFont
from fontTools.pens.basePen import BasePen
import fitz
ROOT=r'C:/Users/mail/Documents/ChatGPT/自动钢琴陪练系统'
OUT=ROOT+'/output/pdf/唐秋鸣情况说明2026-矢量封面.pdf'
W,H=1340,1888
c=canvas.Canvas(OUT,pagesize=(595.276,838.704),pageCompression=1)
c.setTitle('唐秋鳴情況說明2026');c.setAuthor('唐秋鸣');c.scale(595.276/W,838.704/H)
def col(v):return HexColor(v)
def rect(x,y,w,h,fill):
 c.setFillColor(col(fill));c.rect(x,H-y-h,w,h,stroke=0,fill=1)
def line(x1,y1,x2,y2,color,width):
 c.setStrokeColor(col(color));c.setLineWidth(width);c.line(x1,H-y1,x2,H-y2)
# Reusable all-vector background for the architectural refraction lenses.
c.beginForm('PrintedSurface',0,0,W,H)
# pearlescent substrate, all PDF vector shadings
c.linearGradient(0,H,W,0,[col('#fbf8fa'),col('#f2eff3'),col('#edf2f5')],[0,.52,1])
# original modular grid
xs=[3,191,380,570,761,953,1144,1336];ys=[3,189,378,567,756,945,1134,1323,1512,1701,1884]
for x in xs:line(x,3,x,1884,'#e3dfe3',6)
for y in ys:line(3,y,1336,y,'#e3dfe3',6)
cells=[(5,0,0),(1,1,1),(2,2,1),(4,2,1),(0,3,0),(5,3,0),(4,4,1),(1,5,1),(2,6,0),(0,7,0),(2,8,1),(5,8,0),(3,9,1)]
for ix,iy,vertical in cells:
 x0,x1=xs[ix]+4,xs[ix+1]-4;y0,y1=ys[iy]+4,ys[iy+1]-4
 if vertical:
  for x in np.arange(x0+5,x1,9):line(x,y0,x,y1,'#c9c5cd',.7)
 else:
  for y in np.arange(y0+5,y1,9):line(x0,y,x1,y,'#c9c5cd',.7)
for ix in range(1,7):
 for iy in range(1,10):
  if (ix+iy)%3!=0:
   x,y=xs[ix],ys[iy];line(x-23,y,x+23,y,'#d9bcc5',6);line(x,y-23,x,y+23,'#d9bcc5',6)
# vector typography clipped to pearlescent rose gradient
class PathPen(BasePen):
 def __init__(self,g,p,ox,oy,s):super().__init__(g);self.p=p;self.ox=ox;self.oy=oy;self.s=s
 def _moveTo(self,v):self.p.moveTo(self.ox+v[0]*self.s,self.oy+v[1]*self.s)
 def _lineTo(self,v):self.p.lineTo(self.ox+v[0]*self.s,self.oy+v[1]*self.s)
 def _curveToOne(self,a,b,d):self.p.curveTo(self.ox+a[0]*self.s,self.oy+a[1]*self.s,self.ox+b[0]*self.s,self.oy+b[1]*self.s,self.ox+d[0]*self.s,self.oy+d[1]*self.s)
 def _closePath(self):self.p.close()
fonts={}
def text(t,x,baseline,size,maxwidth=None,font='C:/Windows/Fonts/segoeuil.ttf'):
 if font not in fonts:fonts[font]=FTFont(font,fontNumber=0)
 f=fonts[font];g=f.getGlyphSet();cm=f.getBestCmap();units=f['head'].unitsPerEm
 wid=sum(f['hmtx'][cm[ord(ch)]][0] for ch in t)/units*size
 sx=min(1,maxwidth/wid) if maxwidth else 1
 c.saveState();c.translate(x,H-baseline);c.scale(sx,1);p=c.beginPath();px=0
 for ch in t:
  name=cm[ord(ch)];g[name].draw(PathPen(g,p,px,0,size/units));px+=f['hmtx'][name][0]*size/units
 c.clipPath(p,stroke=0,fill=0)
 c.linearGradient(0,size,wid,-size*.2,[col('#b67b8a'),col('#8f3c50'),col('#b48291'),col('#753247')],[0,.40,.64,1])
 c.restoreState()

# Match source-image ink boxes rather than nominal font metrics.
# English: one regular grotesk family, consistent with the source's stroke weight.
from fontTools.pens.boundsPen import BoundsPen
def fitted_text(t,x,top,width,height,font='C:/Windows/Fonts/arial.ttf'):
 if font not in fonts:fonts[font]=FTFont(font,fontNumber=0)
 f=fonts[font];g=f.getGlyphSet();cm=f.getBestCmap();pen=BoundsPen(g);px=0;bounds=[]
 p=c.beginPath()
 for ch in t:
  n=cm[ord(ch)];q=BoundsPen(g);g[n].draw(q)
  if q.bounds:
   x0,y0,x1,y1=q.bounds;bounds.append((x0+px,y0,x1+px,y1))
  g[n].draw(PathPen(g,p,px,0,1));px+=f['hmtx'][n][0]
 bx0=min(bb[0] for bb in bounds);by0=min(bb[1] for bb in bounds)
 bx1=max(bb[2] for bb in bounds);by1=max(bb[3] for bb in bounds)
 c.saveState();c.translate(x,H-top-height);c.scale(width/(bx1-bx0),height/(by1-by0));c.translate(-bx0,-by0)
 c.clipPath(p,stroke=0,fill=0)
 c.linearGradient(bx0,by1,bx1,by0,[col('#b67b8a'),col('#8f3c50'),col('#b48291'),col('#753247')],[0,.40,.64,1]);c.restoreState()
# Original six-row alignment and large type footprint.
fitted_text('SOOCHOW',33.14,23.09,1026.31,141.50)
fitted_text('UNIVERSITY',41.43,214.0,1038.14,141.50)
fitted_text('2026',34.33,405.54,403.07,141.50)
def natural_width(t,height,font='C:/Windows/Fonts/arial.ttf'):
 if font not in fonts:fonts[font]=FTFont(font,fontNumber=0)
 f=fonts[font];g=f.getGlyphSet();cm=f.getBestCmap();bb=[];x=0
 for ch in t:
  n=cm[ord(ch)];p=BoundsPen(g);g[n].draw(p)
  if p.bounds:bb.append((p.bounds[0]+x,p.bounds[1],p.bounds[2]+x,p.bounds[3]))
  x+=f['hmtx'][n][0]
 return (max(v[2] for v in bb)-min(v[0] for v in bb))/(max(v[3] for v in bb)-min(v[1] for v in bb))*height
CN_FONT='C:/Windows/Fonts/msjhbd.ttc'
cn_width=natural_width('唐秋鳴情況說明',141.5,CN_FONT)
fitted_text('唐秋鳴情況說明',1310-cn_width,965.02,cn_width,141.50,CN_FONT)
name_width=natural_width('TANG QIUMING',141.5)
fitted_text('TANG QIUMING',(1340-name_width)/2,1155.65,name_width,141.50)
for label,top in [('STATEMENT',1343.33),('OF FACTS',1533.33)]:
 width=natural_width(label,141.5)
 fitted_text(label,1310-width,top,width,141.5)
from reportlab.pdfbase import pdfdoc
surface_resources=pdfdoc.PDFResourceDictionary();surface_resources.basicFonts();surface_resources.setShading(c._shadingUsed);surface_resources.setColorSpace(c._colorsUsed)
c.endForm(Resources=surface_resources);c.doForm('PrintedSurface')
# Hand-built architectural paths, measured against the source drawing.
INK='#9b6075';DETAIL='#ad8091';LIGHT='#c4a1ae'
def L(x1,y1,x2,y2,w=.9,color=DETAIL):line(x1,y1,x2,y2,color,w)
def R(x,y,w,h,weight=.85,color=DETAIL):
 c.setStrokeColor(col(color));c.setLineWidth(weight);c.rect(x,H-y-h,w,h,stroke=1,fill=0)
def glass_material(p,bounds):
 x0,y0,x1,y1=bounds;ww=x1-x0;hh=y1-y0;cx=(x0+x1)/2;cy=H-(y0+y1)/2
 # Vector shadows under a raised transparent lens.
 c.saveState();c.setLineJoin(1);c.translate(2.0,-5)
 for sw,alpha in [(20,.010),(14,.016),(9,.025),(5,.035)]:
  c.setStrokeColor(Color(.26,.17,.23,alpha=alpha));c.setLineWidth(sw);c.drawPath(p,stroke=1,fill=0)
 c.restoreState()
 c.saveState();c.clipPath(p,stroke=0,fill=0,fillMode=0)
 # Replace the surface inside the lens with a magnified, displaced vector copy.
 # Equal X/Y scale preserves all background letter shapes.
 c.saveState();c.translate(cx,cy);c.scale(1.055,1.055);c.translate(-cx-3.5,-cy+2.5);c.doForm('PrintedSurface');c.restoreState()
 # Very light milky transmission, with the original typography still visible.
 c.setFillColor(Color(.99,.99,1,alpha=.22));c.rect(x0,H-y1,ww,hh,stroke=0,fill=1)
 c.saveState();c.setFillAlpha(.10)
 c.linearGradient(x0,H-y0,x1,H-y1,[col('#ffffff'),col('#dce9f5'),col('#b68b9e'),col('#ffffff')],[0,.3,.72,1]);c.restoreState()
 # Rolled inner edge: deep colour pickup, cold refractive ridge, white wet edge.
 c.setLineJoin(1)
 for sw,color in [(18,Color(.52,.39,.49,alpha=.055)),(12,Color(.78,.86,.95,alpha=.20)),(8,Color(1,1,1,alpha=.36)),(4.5,Color(1,1,1,alpha=.87)),(1.3,Color(.62,.50,.61,alpha=.45))]:
  c.setStrokeColor(color);c.setLineWidth(sw);c.drawPath(p,stroke=1,fill=0)
 # Directional specular rim: brightest upper-left, rose caustic lower-right.
 c.saveState();c.translate(-1.8,2.0);c.setStrokeColor(Color(1,1,1,alpha=.98));c.setLineWidth(2.1);c.drawPath(p,stroke=1,fill=0);c.restoreState()
 c.saveState();c.translate(1.7,-2.0);c.setStrokeColor(Color(.54,.34,.46,alpha=.18));c.setLineWidth(1.1);c.drawPath(p,stroke=1,fill=0);c.restoreState()
 # Thin, gently curved glints avoid the broad opaque bands of frosted glass.
 for pos,alpha in [(.17,.16),(.66,.10)]:
  xx=x0+ww*pos;q=c.beginPath();q.moveTo(xx-ww*.07,H-y0+1)
  q.curveTo(xx+ww*.08,H-y0-hh*.35,xx-ww*.08,H-y0-hh*.65,xx+ww*.16,H-y1-1)
  q.lineTo(xx+ww*.19,H-y1-1);q.curveTo(xx-ww*.04,H-y0-hh*.64,xx+ww*.10,H-y0-hh*.32,xx-ww*.04,H-y0+1);q.close()
  c.setFillColor(Color(1,1,1,alpha=alpha));c.drawPath(q,fill=1,stroke=0)
 c.restoreState()

def P(cmds,fill=True,width=1.4,color=INK):
 p=c.beginPath()
 for op,v in cmds:
  if op=='M':p.moveTo(v[0],H-v[1])
  elif op=='L':p.lineTo(v[0],H-v[1])
  elif op=='C':p.curveTo(v[0],H-v[1],v[2],H-v[3],v[4],H-v[5])
  elif op=='Z':p.close()
 if fill:
  coords=[(v[i],v[i+1]) for op,v in cmds for i in range(0,len(v),2)]
  glass_material(p,(min(v[0] for v in coords),min(v[1] for v in coords),max(v[0] for v in coords),max(v[1] for v in coords)))
 c.setStrokeColor(col(color));c.setLineWidth(width*.65 if fill else width);c.drawPath(p,stroke=1,fill=0)
 return p
def CIRCLE(x,y,r,w=1,color=DETAIL):
 c.setLineWidth(w);c.setStrokeColor(col(color));c.circle(x,H-y,r,stroke=1,fill=0)
def ARCH(x,y,w,h,panes=True):
 r=w/2
 P([('M',(x,y+h)),('L',(x,y+r)),('C',(x,y-r*.30,x+w,y-r*.30,x+w,y+r)),('L',(x+w,y+h)),('Z',())],False,.9)
 if panes:
  L(x+w/2,y+2,x+w/2,y+h,.65);L(x,y+h*.57,x+w,y+h*.57,.65)
# 01 Historic entrance pavilion
P([('M',(138,236)),('L',(138,153)),('L',(208,153)),('L',(208,121)),('L',(272,121)),('L',(272,82)),('L',(472,82)),('L',(472,121)),('L',(538,121)),('L',(538,153)),('L',(608,153)),('L',(608,195)),('L',(640,195)),('L',(640,237)),('Z',())],True,2)
for q in [(142,157,62,75),(212,125,57,108),(276,86,192,145),(476,125,58,108),(542,157,62,35),(609,199,27,34)]:R(*q,.65,LIGHT)
P([('M',(210,161)),('L',(372,101)),('L',(534,161)),('L',(531,167)),('L',(372,109)),('L',(214,167)),('Z',())],True,1.4)
P([('M',(246,160)),('L',(246,231)),('L',(255,231)),('L',(255,156))],False,.85)
P([('M',(489,157)),('L',(489,231)),('L',(499,231)),('L',(499,160))],False,.85)
for x in [244,253,488,497]:
 for yy in [176,197,216]:R(x-2,yy,7,4,.65)
R(258,144,227,81,.7)
L(258,152,485,152,.7);L(258,227,485,227,.75)
P([('M',(318,123)),('L',(318,144)),('L',(369,144)),('L',(369,106))],False,.8)
P([('M',(376,106)),('L',(376,144)),('L',(425,144)),('L',(425,123))],False,.8)
for x in [280,454]:
 R(x,93,11,13,.7)
 for dx in [3.7,7.3]:L(x+dx,93,x+dx,106,.5)
 for dy in [4.3,8.6]:L(x,93+dy,x+11,93+dy,.5)
for xa,xb in [(214,245),(500,531)]:
 R(xa,210,xb-xa,20,.7)
 for xx in np.arange(xa+3,xb,3):L(xx,211,xx,229,.5)
# 02 Clock hall facade, stepped roof, rose window and three window registers
P([('M',(129,822)),('L',(129,648)),('L',(123,646)),('L',(199,626)),('L',(337,626)),('L',(337,545)),('L',(361,545)),('L',(361,498)),('L',(391,498)),('L',(391,525)),('L',(369,525)),('L',(369,545)),('L',(402,545)),('L',(402,626)),('L',(541,626)),('L',(615,646)),('L',(610,650)),('L',(610,755)),('L',(567,755)),('L',(567,822)),('Z',())],True,2)
R(135,653,468,162,.8)
L(127,646,612,646,1.2);L(142,641,596,641,.8);L(198,623,543,623,1.4)
L(201,629,539,629,.8);R(342,550,54,72,.8);R(346,555,46,44,.7)
CIRCLE(369,578,10,1);L(369,578,369,570,.7);L(369,578,375,582,.7)
for x in [345,361,377]:ARCH(x,608,10,15,False)
R(366,503,19,15,.7);L(369,503,369,518,.6)
for xx in [177,289,447]:L(xx,653,xx,815,1)
for yy in [747,754,808]:L(134,yy,568 if yy>750 else 604,yy,1)
# stained-glass circular window, concentric rings and radial mullions
cx,cy,rr=210,685,29
CIRCLE(cx,cy,rr,1.2);CIRCLE(cx,cy,rr-4,.75);CIRCLE(cx,cy,10,.75)
for ang in np.linspace(0,2*np.pi,16,endpoint=False):
 L(cx+10*np.cos(ang),cy+10*np.sin(ang),cx+25*np.cos(ang),cy+25*np.sin(ang),.65)
R(180,655,60,86,.7)
for x in [152,251]:ARCH(x,683,16,52)
for yy,hh in [(661,35),(710,32),(766,38)]:
 for x in [298,327,356,385,414]:
  ARCH(x,yy,21,hh)
  L(x+5,yy+12,x+5,yy+hh,.5);L(x+16,yy+12,x+16,yy+hh,.5)
for yy in [661,713]:
 for x in [466,495,524,553,582]:
  R(x,yy,16,25,.85);L(x+8,yy,x+8,yy+25,.6);L(x,yy+8,x+16,yy+8,.6)
for x in [153,184,215,247,466,496,526,552]:
 R(x,770,16,25,.85);L(x+8,770,x+8,795,.6);L(x,778,x+16,778,.6)
L(289,703,446,703,.9);L(289,758,446,758,.9)
# 03 Three-arch ceremonial gate, negative openings stay transparent.
P([('M',(480,1007)),('L',(480,852)),('C',(510,855,544,849,551,826)),('L',(563,823)),('L',(563,771)),('L',(556,765)),('L',(556,754)),('L',(773,754)),('L',(773,766)),('L',(767,773)),('L',(767,823)),('L',(780,825)),('C',(788,847,820,854,852,851)),('L',(852,1007)),('L',(813,1007)),('L',(813,927)),('C',(813,881,766,882,766,927)),('L',(766,1007)),('L',(720,1007)),('L',(720,904)),('C',(720,822,609,822,609,904)),('L',(609,1007)),('L',(562,1007)),('L',(562,927)),('C',(562,881,516,882,516,927)),('L',(516,1007)),('Z',())],True,2.1)
# 04 Curved contemporary library: clipped meridians and horizontal glazing bands
lib=P([('M',(859,1297)),('C',(851,1261,855,1235,865,1202)),('L',(922,1202)),('L',(927,1181)),('L',(1005,1181)),('L',(1000,1204)),('L',(1108,1204)),('L',(1102,1183)),('L',(1164,1186)),('L',(1173,1204)),('L',(1227,1204)),('C',(1250,1270,1237,1345,1185,1405)),('L',(900,1405)),('C',(881,1374,865,1333,859,1297)),('Z',())],True,1.7)
c.saveState();c.clipPath(lib,stroke=0,fill=0)
for yy in [1215,1230,1250,1276,1300,1325,1350,1377,1400]:
 P([('M',(850,yy)),('C',(976,yy+7,1110,yy+6,1240,yy))],False,.8)
for xx in np.arange(865,1231,22):
 shift=(1043-xx)*.15
 P([('M',(xx,1202)),('C',(xx-15+shift,1260,xx+shift,1345,xx+shift,1410))],False,.8)
for a,b in [(869,919),(935,995),(1116,1158),(1182,1224)]:
 for yy in np.arange(1206,1230,3):L(a,yy,b,yy,.55)
c.restoreState()
# Figures are isolated from their dark original outlines before contour fitting.
im=cv2.imread('J:/3/image.jpeg');hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV);sx=W/im.shape[1];sy=H/im.shape[0]
figure_boxes=[(233,174,359,376),(876,500,1023,657),(777,1337,933,1460),(230,1488,318,1684),(312,1488,399,1684),(402,1488,496,1684),(490,1488,584,1684)]
def contour_path(contours,dx,dy):
 p=c.beginPath()
 for cnt in contours:
  aa=cv2.approxPolyDP(cnt,.45,True).reshape(-1,2)
  if len(aa)<3:continue
  pts=[((float(a[0])+dx)*sx,H-(float(a[1])+dy)*sy) for a in aa]
  p.moveTo(*pts[0])
  for v in pts[1:]:p.lineTo(*v)
  p.close()
 return p
for x0,y0,x1,y1 in figure_boxes:
 x0,y0,x1,y1=int(x0/sx),int(y0/sy),int(x1/sx),int(y1/sy)
 hh=hsv[y0:y1,x0:x1];dark=((hh[:,:,0]>45)&(hh[:,:,0]<89)&(hh[:,:,1]>85)).astype('uint8')*255
 dark=cv2.morphologyEx(dark,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
 if x0==int(490/sx):
  yy=int(1635/sy)-y0
  cv2.line(dark,(int(518/sx)-x0,yy),(int(570/sx)-x0,yy),255,3)
 cs,_=cv2.findContours(dark,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
 cs=[q for q in cs if cv2.contourArea(q)>250]
 silhouette=np.zeros_like(dark);cv2.drawContours(silhouette,cs,-1,255,-1)
 body=((hh[:,:,1]>85)&(silhouette>0)).astype('uint8')*255
 if x0==int(490/sx):
  gy,gx=np.indices(hh.shape[:2]);gx=gx+x0;gy=gy+y0
  extra=((hh[:,:,1]>85)&(hh[:,:,0]>30)&(gy>int(1534/sy))&((gy<int(1634/sy))|(gx<int(511/sx))))
  body=np.where(extra|(body>0),255,0).astype('uint8')
 cs,_=cv2.findContours(body,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
 cs=[q for q in cs if cv2.contourArea(q)>16]
 p=contour_path(cs,x0,y0)
 c.saveState();c.clipPath(p,stroke=0,fill=0,fillMode=0);c.linearGradient(0,H,1340,0,[col('#e8cbd5'),col('#bf92a4'),col('#ead6df')],[0,.5,1]);c.restoreState()
 cs,_=cv2.findContours(dark,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
 cs=[q for q in cs if cv2.contourArea(q)>10]
 p=contour_path(cs,x0,y0);c.setFillColor(col('#87485f'));c.drawPath(p,stroke=0,fill=1,fillMode=0)
# Rebuild rectangular campus building from original facade proportions
bx,by=511,1635
outline=[(0,0),(502,0),(502,7),(495,7),(495,24),(502,24),(502,57),(493,57),(493,68),(502,68),(502,79),(495,79),(495,95),(502,95),(502,105),(495,105),(495,119),(502,119),(502,130),(499,130),(499,157),(0,157),(0,126),(-4,126),(-4,118),(2,118),(2,104),(-4,104),(-4,95),(2,95),(2,79),(-4,79),(-4,69),(2,69),(2,55),(-4,55),(-4,47),(2,47),(2,32),(-4,32),(-4,24),(2,24),(2,7),(-4,7),(-4,0)]
p=c.beginPath();p.moveTo(bx+outline[0][0],H-by-outline[0][1])
for xx,yy in outline[1:]:p.lineTo(bx+xx,H-by-yy)
p.close()
glass_material(p,(bx-4,by,bx+502,by+157))
c.setStrokeColor(col('#a57385'));c.setLineWidth(1.8);c.drawPath(p,fill=0,stroke=1)
def bl(x1,y1,x2,y2,width=.65,color='#ae8997'):line(bx+x1,by+y1,bx+x2,by+y2,color,width)
def pane(x,y,w,h,spacing):
 for xx,yy,xx2,yy2 in [(x,y,x+w,y),(x,y+h,x+w,y+h),(x,y,x,y+h),(x+w,y,x+w,y+h)]:bl(xx,yy,xx2,yy2)
 for xx in np.arange(x+spacing,x+w-.5,spacing):
  bl(xx,y,xx,y+h,.55);bl(xx+1.2,y,xx+1.2,y+h,.35,'#c7acb7')
for yy in [0,24,47,69,95,118]:
 bl(-2,yy+2,500,yy+2,.85);bl(-2,yy+5,500,yy+5,.55,'#c1a3ae')
pane(5,7,212,16,7);pane(270,7,223,16,7)
pane(5,32,212,14,7);pane(270,32,152,14,8);pane(425,30,69,17,100)
pane(5,56,120,12,8);pane(167,56,326,12,8)
pane(5,80,324,14,7);pane(351,80,142,14,8)
pane(5,105,155,12,7);pane(220,105,273,12,8)
pane(3,131,157,25,23);pane(220,131,276,25,24)
for yy in [7,17,24,32,40,46]:bl(221,yy,266,yy,.7)
bl(219,6,219,47,.9);bl(268,6,268,47,.9)
for yy in [56,61,68]:bl(129,yy,163,yy,.7)
bl(127,54,127,69,.9);bl(165,54,165,69,.9)
bl(333,80,347,80);bl(333,87,347,87);bl(333,94,347,94);bl(332,79,332,95);bl(349,79,349,95)
pane(166,105,49,51,12)
bl(166,114,215,114,.9);bl(166,135,215,135,.9)
for yy in [1,25,48,70,96,119]:bl(-1,yy,500,yy,.45,'#ffffff')

c.showPage();c.save()
doc=fitz.open(OUT);pg=doc[0];pg.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False).save(ROOT+'/output/pdf/情况说明封面预览.png')
print({'images':len(pg.get_images()),'paths':len(pg.get_drawings()),'bytes':os.path.getsize(OUT)})
