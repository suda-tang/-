import cv2,numpy as np,os
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor,Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from fontTools.ttLib import TTFont as FTFont
from fontTools.pens.basePen import BasePen
import fitz
ROOT=r'C:/Users/mail/Documents/ChatGPT/自动钢琴陪练系统'
OUT=ROOT+'/output/pdf/唐秋鳴博士面試-同濟大學-29OCT-矢量封面.pdf'
W,H=1340,1888
c=canvas.Canvas(OUT,pagesize=(595.276,838.704),pageCompression=1)
c.setTitle('唐秋鳴博士面試｜同濟大學｜29OCT');c.setAuthor('唐秋鸣');c.scale(595.276/W,838.704/H)
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

def natural_width(t,height,font='C:/Windows/Fonts/arial.ttf'):
 if font not in fonts:fonts[font]=FTFont(font,fontNumber=0)
 f=fonts[font];g=f.getGlyphSet();cm=f.getBestCmap();bb=[];x=0
 for ch in t:
  n=cm[ord(ch)];p=BoundsPen(g);g[n].draw(p)
  if p.bounds:bb.append((p.bounds[0]+x,p.bounds[1],p.bounds[2]+x,p.bounds[3]))
  x+=f['hmtx'][n][0]
 return (max(v[2] for v in bb)-min(v[0] for v in bb))/(max(v[3] for v in bb)-min(v[1] for v in bb))*height
# A single point size for every English/date run, without independent X/Y scaling.
ENGLISH_SIZE=175.0
ENGLISH_FONT='C:/Windows/Fonts/arial.ttf'
def english_metrics(label):
 if ENGLISH_FONT not in fonts:fonts[ENGLISH_FONT]=FTFont(ENGLISH_FONT)
 f=fonts[ENGLISH_FONT];g=f.getGlyphSet();cm=f.getBestCmap();bb=[];xx=0
 for ch in label:
  n=cm[ord(ch)];q=BoundsPen(g);g[n].draw(q)
  if q.bounds:bb.append((q.bounds[0]+xx,q.bounds[1],q.bounds[2]+xx,q.bounds[3]))
  xx+=f['hmtx'][n][0]
 k=ENGLISH_SIZE/f['head'].unitsPerEm
 return ((max(v[2] for v in bb)-min(v[0] for v in bb))*k,(max(v[3] for v in bb)-min(v[1] for v in bb))*k)
def english(label,x,top,right=None,center=False):
 w,h=english_metrics(label)
 if right is not None:x=right-w
 if center:x=(W-w)/2
 assert x>=0 and x+w<=W,(label,x,w)
 fitted_text(label,x,top,w,h,ENGLISH_FONT)
english('TONGJI',33.14,23.09)
english('DOCTOR',41.43,214.0)
english('LIUGUANHONG',0,405.54,center=True)
CN_FONT='C:/Windows/Fonts/msjhbd.ttc'
cn_width=natural_width('唐秋鳴博士面試',141.5,CN_FONT)
fitted_text('唐秋鳴博士面試',1310-cn_width,965.02,cn_width,141.50,CN_FONT)
english('TANG QIUMING',0,1155.65,center=True)
for label,top in [('DOCTORAL',1343.33),('INTERVIEW',1533.33),('29OCT',1723.33)]:
 english(label,0,top,right=1310)
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
# 01 Tongji Siping Road main gate: stone frame, three portals and four piers.
gate=P([('M',(138,238)),('L',(138,111)),('L',(130,111)),('L',(130,99)),('L',(158,99)),('L',(158,84)),('L',(618,84)),('L',(618,99)),('L',(640,99)),('L',(640,112)),('L',(616,112)),('L',(616,238)),('Z',()),('M',(215,145)),('L',(215,238)),('L',(275,238)),('L',(275,145)),('Z',()),('M',(312,145)),('L',(312,238)),('L',(488,238)),('L',(488,145)),('Z',()),('M',(526,145)),('L',(526,238)),('L',(578,238)),('L',(578,145)),('Z',())],True,2)
L(132,104,637,104,1);L(140,113,615,113,.8);L(140,141,615,141,.9)
for x in [166,248,410,532,606]:L(x,85,x,99,.7)
for x0,x1 in [(142,210),(279,308),(491,522),(582,612)]:
 for yy in [164,185,209,233]:L(x0,yy,x1,yy,.65)
 L(x0+4,145,x0+4,236,.65)
for xx in [224,535]:
 R(xx,117,43,22,.6)
 for j in range(6):
  P([('M',(xx+3+j*6,133)),('C',(xx+6+j*6,119,xx+9+j*6,140,xx+12+j*6,124))],False,.5)
fitted_text('同濟大學',338,118,117,19,'C:/Windows/Fonts/msjhbd.ttc')
# Facade grids preserve the perspective of each planar architectural surface.
def quad_grid(corners,nx,ny,weight=.55):
 a,b,cc,d=[np.array(v,dtype=float) for v in corners]
 for u in np.linspace(0,1,nx+1):
  p=a*(1-u)+b*u;q=d*(1-u)+cc*u;L(*p,*q,weight)
 for v in np.linspace(0,1,ny+1):
  p=a*(1-v)+d*v;q=b*(1-v)+cc*v;L(*p,*q,weight)
def quad(coords,fill=True,w=1.3):return P([('M',coords[0])]+[('L',v) for v in coords[1:]]+[('Z',())],fill,w)
def mapq(q,u,v):
 a,b,cc,d=[np.array(z,dtype=float) for z in q];return tuple((a*(1-u)+b*u)*(1-v)+(d*(1-u)+cc*u)*v)
# 02 Siping campus library: opposed towers, recessed glazed link, low podium.
left=[(220,505),(365,560),(365,731),(220,676)]
right=[(375,560),(520,505),(520,676),(375,731)]
for q in [left,right]:
 quad(q);quad_grid(q,10,8,.65)
 for u in np.linspace(0,1,11):
  p=mapq(q,u,0);z=mapq(q,u,1);L(p[0]+2,p[1],z[0]+2,z[1],.4)
 for j in range(8):
  for i in range(10):
   a=mapq(q,(i+.14)/10,(j+.16)/8);b=mapq(q,(i+.84)/10,(j+.16)/8);cc=mapq(q,(i+.84)/10,(j+.76)/8);d=mapq(q,(i+.14)/10,(j+.76)/8)
   quad([a,b,cc,d],False,.45)
for q in [[(199,522),(220,505),(220,676),(199,694)],[(520,505),(542,523),(542,694),(520,676)]]:
 quad(q);quad_grid(q,2,8,.55)
quad([(365,586),(375,586),(375,731),(365,731)]);quad_grid([(365,586),(375,586),(375,731),(365,731)],2,8,.4)
podium=quad([(126,731),(615,731),(615,823),(126,823)])
L(122,730,619,730,1.6);L(126,739,615,739,.85);L(126,775,615,775,.9)
for x in np.arange(138,615,17):
 if 316<x<421:continue
 R(x,743,11,70,.65);L(x+5.5,743,x+5.5,813,.4);L(x,777,x+11,777,.4)
R(319,740,102,80,.75);quad_grid([(319,740),(421,740),(421,820),(319,820)],6,3,.5)
L(307,771,432,771,1.4)
fitted_text('同濟大學圖書館',332,748,77,9,'C:/Windows/Fonts/msjh.ttc')
# 03 University Auditorium: longitudinal barrel vault, arched front and concrete canopy.
hall=P([('M',(480,1007)),('L',(480,854)),('C',(492,806,567,777,642,763)),('C',(718,726,821,750,852,824)),('L',(852,1007)),('Z',())],True,1.8)
P([('M',(640,1007)),('L',(640,825)),('C',(640,744,852,744,852,825)),('L',(852,1007))],False,1)
P([('M',(480,854)),('C',(530,826,583,809,640,825))],False,.9)
for u in np.linspace(0,1,14):
 xx=640+212*u;yy=825-60*np.sqrt(max(0,1-(2*u-1)**2))
 L(xx,yy,xx,1005,.6)
for i in range(7):
 x=482+i*22;y=862-i*6
 L(x,y,x+20,y-6,1);L(x,y+43,x+20,y+37,.8)
 L(x+20,y-6,x-7,1002,1.5)
R(685,852,124,151,.8)
for x in [697,741,785]:R(x,873,15,122,.8)
P([('M',(676,851)),('L',(822,851)),('L',(837,860)),('L',(691,863)),('Z',())],True,1)
for yy in [1000,1003,1006]:L(671,yy,830,yy,.6)
# 04 Zonghe / Zhonghe tower: its asymmetric curtain wall fields and patterned fins.
towerq=[(977,1090),(1118,1090),(1160,1405),(936,1405)]
tower=quad(towerq,True,1.9)
quad_grid(towerq,18,22,.45)
for j in range(22):
 for i in range(18):
  glazed=(5<=j<=8 and i<12) or (9<=j<=12 and 5<=i<=17) or j>=19
  if not glazed and (i+j*3)%4!=0:
   a=mapq(towerq,(i+.19)/18,(j+.1)/22);b=mapq(towerq,(i+.40)/18,(j+.1)/22);cc=mapq(towerq,(i+.40)/18,(j+.89)/22);d=mapq(towerq,(i+.19)/18,(j+.89)/22)
   quad([a,b,cc,d],False,.6)
for v in [5/22,9/22,13/22,17/22,19/22]:
 p=mapq(towerq,0,v);q=mapq(towerq,1,v);L(*p,*q,1.7)
for u0,u1,v0,v1 in [(0,.67,5/22,9/22),(.28,1,9/22,13/22)]:
 for u in np.arange(u0,u1,.035):
  a=mapq(towerq,u,v0);b=mapq(towerq,u,v1);L(*a,*b,.45)
for yy in [1407,1410]:L(930,yy,1165,yy,.7)
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
# 05 Wenyuan Hall: flat roofs, asymmetric stair volume, steel-framed ribbon windows.
wen=P([('M',(511,1792)),('L',(511,1635)),('L',(835,1635)),('L',(835,1585)),('L',(1013,1602)),('L',(1013,1792)),('Z',())],True,1.7)
L(511,1641,834,1641,1);L(835,1585,835,1792,1.1);L(987,1601,987,1792,.8)
for yy in [1669,1712,1755]:
 R(521,yy-24,305,29,.9)
 for x in np.arange(527,824,16):
  L(x,yy-24,x,yy+5,.6);L(x+4,yy-24,x+4,yy+5,.4)
 L(521,yy-10,826,yy-10,.6)
 L(511,yy+10,834,yy+10,.6)
R(865,1608,101,115,.85)
for x in [897,930]:L(x,1608,x,1723,.8)
for yy in np.arange(1627,1720,23):L(865,yy,966,yy,.65)
quad([(855,1738),(975,1738),(987,1746),(856,1752)],True,1)
for x in [865,900,935,966]:L(x,1750,x,1791,1.2)
for yy in [1646,1669,1692,1715,1738,1761]:L(988,yy,1011,yy+2,.55)
for yy in [1787,1790]:L(508,yy,1015,yy,.6)
fitted_text('文遠樓',846,1620,14,43,'C:/Windows/Fonts/msjh.ttc')

c.showPage();c.save()
doc=fitz.open(OUT);pg=doc[0];pg.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False).save(ROOT+'/output/pdf/同濟博士面試封面預覽.png')
print({'images':len(pg.get_images()),'paths':len(pg.get_drawings()),'bytes':os.path.getsize(OUT)})
