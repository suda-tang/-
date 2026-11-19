import cv2,numpy as np,os
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor,Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from fontTools.ttLib import TTFont as FTFont
from fontTools.pens.basePen import BasePen
import fitz
ROOT=r'C:/Users/mail/Documents/ChatGPT/自动钢琴陪练系统'
OUT=ROOT+'/output/pdf/唐秋鳴博士面試-上海大學-鄒宗峰教授-矢量封面.pdf'
W,H=1340,1888
c=canvas.Canvas(OUT,pagesize=(595.276,838.704),pageCompression=1)
c.setTitle('唐秋鳴博士面試｜上海大學｜鄒宗峰教授');c.setAuthor('唐秋鸣');c.scale(595.276/W,838.704/H)
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
ENGLISH_SIZE=160.0
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
english('SHANGHAI',33.14,23.09)
english('UNIVERSITY',41.43,214.0)
english('PROFESSOR',41.43,405.54)
english('ZOU ZONGFENG',0,595.54,center=True)
CN_FONT='C:/Windows/Fonts/msjhbd.ttc'
cn_width=natural_width('唐秋鳴博士面試',141.5,CN_FONT)
fitted_text('唐秋鳴博士面試',1310-cn_width,965.02,cn_width,141.50,CN_FONT)
english('TANG QIUMING',0,1155.65,center=True)
for label,top in [('DOCTORAL',1343.33),('INTERVIEW',1533.33),('27OCT',1723.33)]:
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
# Shanghai University reference landmarks, redrawn as optical vector plates.
def quad(coords,fill=True,w=1.3):return P([('M',coords[0])]+[('L',v) for v in coords[1:]]+[('Z',())],fill,w)
# 01 Baoshan main entrance: receding stone name wall.
quad([(138,90),(586,129),(640,237),(138,195)],True,1.8)
quad([(138,90),(154,83),(598,120),(586,129)],True,1)
L(138,182,632,226,.8)
for x in [223,307,391,475,559]:
 yy=90+(x-138)*39/448;L(x,yy,x+10,195+(x-138)*42/502,.55)
fitted_text('上海大學',196,119,278,40,'C:/Windows/Fonts/msjhbd.ttc')
fitted_text('SHANGHAI UNIVERSITY',463,162,114,11,'C:/Windows/Fonts/arial.ttf')
# 02 Main campus library: tall end piers and inward-tapering central glazing.
lib=P([('M',(129,823)),('L',(129,508)),('L',(204,508)),('L',(204,526)),('L',(534,526)),('L',(534,508)),('L',(608,508)),('L',(608,823)),('Z',())],True,1.8)
for x in [133,539]:R(x,513,65,303,.85)
for x in [175,559]:
 for yy in np.arange(544,793,31):R(x,yy,11,19,.6)
L(202,532,535,532,1);L(202,544,535,544,.7)
glazing=quad([(211,549),(526,549),(478,768),(260,768)],True,1)
for j in range(9):
 t=j/8;y=549+219*t;x0=211+49*t;x1=526-48*t;L(x0,y,x1,y,.7)
for t in np.linspace(0,1,17):L(211+315*t,549,260+218*t,768,.65)
for yy in [779,787,795,804,813,820]:L(202,yy,534,yy,.65)
for x in np.arange(210,532,18):R(x,780,11,30,.6)
CIRCLE(161,535,7,.7);CIRCLE(577,535,7,.7)
L(148,493,148,508,.65);L(586,493,586,508,.65)
# 03 Weichang Hall: flying wedge roof, broad glazed entrance and stairs.
hall=P([('M',(523,1007)),('L',(523,825)),('L',(549,789)),('L',(837,844)),('L',(862,864)),('L',(862,1007)),('Z',())],True,1.6)
roof=quad([(480,829),(550,741),(876,834),(858,847),(546,775),(497,840)],True,1.9)
L(488,829,548,755,1);L(548,755,866,838,.9)
quad([(535,830),(625,847),(625,996),(535,996)],True,1)
for yy in np.arange(852,994,24):L(536,yy,625,yy+9,.5)
R(632,862,194,125,.8)
for x in np.arange(638,824,17):L(x,862,x,986,.7)
for yy in [891,922,953]:L(633,yy,826,yy,.6)
for x in [631,685,739,793,830]:R(x,850,6,145,.8)
quad([(620,923),(825,923),(843,930),(630,933)],True,.9)
for i in range(7):L(588-i*7,994+i*2,841+i*3,994+i*2,.65)
fitted_text('偉長樓',557,850,21,79,'C:/Windows/Fonts/msjh.ttc')
# 04 Qian Weichang Library: seven-storey cylindrical rotunda.
rotunda=P([('M',(879,1200)),('C',(879,1144,1230,1144,1230,1200)),('L',(1230,1373)),('C',(1230,1424,879,1424,879,1373)),('Z',())],True,1.8)
P([('M',(879,1200)),('C',(879,1248,1230,1248,1230,1200))],False,.9)
for y in [1226,1253,1280,1307,1334,1361,1388]:
 P([('M',(879,y)),('C',(925,y+40,1184,y+40,1230,y))],False,.8)
for t in np.linspace(-1,1,25):
 x=1054.5+175.5*t;d=33*np.sqrt(max(0,1-t*t))
 L(x,1200+d,x,1373+d,.7)
for j in range(6):
 for t in np.linspace(-.96,.96,23):
  x=1054.5+175.5*t;d=33*np.sqrt(max(0,1-t*t));yy=1210+j*27+d
  ww=5+3*(1-abs(t));R(x,yy,ww,15,.45)
for yy in [1404,1409]:L(902,yy,1207,yy,.7)
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
# 05 Teaching buildings along Panchi, with the water edge below.
panchi=P([('M',(511,1792)),('L',(511,1635)),('L',(612,1635)),('L',(612,1652)),('L',(675,1652)),('L',(675,1635)),('L',(840,1635)),('L',(840,1652)),('L',(904,1652)),('L',(904,1635)),('L',(1013,1635)),('L',(1013,1792)),('Z',())],True,1.6)
for x0,w in [(517,92),(681,153),(910,97)]:
 for yy in [1645,1680,1715,1750]:
  R(x0,yy,w,22,.8)
  for x in np.arange(x0+10,x0+w-3,13):L(x,yy,x,yy+22,.55)
for x in [615,842]:
 for yy in [1667,1701,1735]:
  R(x,yy,54,18,.7);L(x+27,yy,x+27,yy+18,.55)
 for xx in [x+3,x+26,x+49]:L(xx,1767,xx,1791,.8)
for x in [510,611,674,839,903,1013]:L(x,1653,x,1792,.75)
for yy in [1672,1707,1742,1777]:L(511,yy,1013,yy,.55)
P([('M',(492,1808)),('C',(603,1797,865,1796,1034,1805))],False,.8)
for offset in [7,13,19]:
 P([('M',(525,1804+offset)),('C',(662,1799+offset,875,1805+offset,999,1802+offset))],False,.4)

c.showPage();c.save()
doc=fitz.open(OUT);pg=doc[0];pg.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False).save(ROOT+'/output/pdf/上海大學鄒宗峰教授封面預覽.png')
print({'images':len(pg.get_images()),'paths':len(pg.get_drawings()),'bytes':os.path.getsize(OUT)})
