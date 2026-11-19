import cv2,numpy as np,os
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor,Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from fontTools.ttLib import TTFont as FTFont
from fontTools.pens.basePen import BasePen
import fitz
ROOT=r'C:/Users/mail/Documents/ChatGPT/自动钢琴陪练系统'
OUT=ROOT+'/output/pdf/唐秋鸣课题实例2026-矢量封面.pdf'
W,H=1340,1888
c=canvas.Canvas(OUT,pagesize=(595.276,838.704),pageCompression=1)
c.setTitle('唐秋鸣课题实例2026');c.setAuthor('唐秋鸣');c.scale(595.276/W,838.704/H)
def col(v):return HexColor(v)
def rect(x,y,w,h,fill):
 c.setFillColor(col(fill));c.rect(x,H-y-h,w,h,stroke=0,fill=1)
def line(x1,y1,x2,y2,color,width):
 c.setStrokeColor(col(color));c.setLineWidth(width);c.line(x1,H-y1,x2,H-y2)
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
# Every text run uses the same 110-unit type size with no horizontal scaling.
TYPE_SIZE=110
text('SOOCHOW',655,161,TYPE_SIZE)
text('UNIVERSITY',655,351,TYPE_SIZE)
text('2026',23,542,TYPE_SIZE)
text('唐秋鸣',263,1120,TYPE_SIZE,font='C:/Windows/Fonts/msyhl.ttc')
text('Tang Qiuming',620,1120,TYPE_SIZE)
text('课题实例',263,1288,TYPE_SIZE,font='C:/Windows/Fonts/msyhl.ttc')
text('Research Project',10,1482,TYPE_SIZE)
# Original drawings traced from JPEG colour separations, no bitmap embedding
im=cv2.imread('J:/3/image.jpeg');hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
mask=((hsv[:,:,0]>=39)&(hsv[:,:,0]<90)&(hsv[:,:,1]>35)&(hsv[:,:,2]>65)).astype('uint8')*255
mask=cv2.medianBlur(mask,3)
n,labels,stats,centroids=cv2.connectedComponentsWithStats(mask)
mask=np.where(np.isin(labels,[i for i in range(1,n) if stats[i,cv2.CC_STAT_AREA]>65]),255,0).astype('uint8')
# original-position regions enclosing buildings and figures
regions=[(125,75,650,380),(115,490,1025,1020),(770,1170,1250,1495),(225,1490,1020,1800)]
sx=W/im.shape[1];sy=H/im.shape[0]
def pathFor(cs):
 p=c.beginPath()
 for cnt in cs:
  a=cv2.approxPolyDP(cnt,.60,True).reshape(-1,2)
  if len(a)<3:continue
  p.moveTo(float(a[0,0])*sx,H-float(a[0,1])*sy)
  for pt in a[1:]:p.lineTo(float(pt[0])*sx,H-float(pt[1])*sy)
  p.close()
 return p
# Separate islands; close JPEG gaps for silhouettes, retain detailed linework
keep=np.zeros_like(mask)
for x0,y0,x1,y1 in regions:
 keep[int(y0/sy):int(y1/sy),int(x0/sx):int(x1/sx)]=mask[int(y0/sy):int(y1/sy),int(x0/sx):int(x1/sx)]
keep[int(1633/sy):,int(508/sx):]=0
closed=cv2.morphologyEx(keep,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
cs,_=cv2.findContours(closed,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
large=[a for a in cs if cv2.contourArea(a)>1200]
# frosted interiors, delicate offset refraction
p=pathFor(large)
c.saveState();c.translate(2,-3);c.setFillColor(Color(.35,.20,.28,alpha=.09));c.drawPath(p,fill=1,stroke=0);c.restoreState()
c.saveState();c.clipPath(p,stroke=0,fill=0);c.linearGradient(100,H-100,1100,H-1750,[col('#f9f7fa'),col('#e4dbe3'),col('#f6f9fb')],[0,.5,1]);c.restoreState()
# filled contour paths with even-odd holes retain original drawing strokes
cs,_=cv2.findContours(keep,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
cs=[a for a in cs if cv2.contourArea(a)>2.5]
p=pathFor(cs)
c.saveState();c.clipPath(p,stroke=0,fill=0,fillMode=0);c.linearGradient(0,H,W,0,[col('#9e6275'),col('#ac7b8b'),col('#79394c')],[0,.5,1]);c.restoreState()
# quiet glass edge highlights following original silhouettes
c.setStrokeColor(Color(1,1,1,alpha=.65));c.setLineWidth(.65)
c.saveState();c.translate(-.8,.8);c.drawPath(pathFor(large),fill=0,stroke=1);c.restoreState()
# Rebuild rectangular campus building from original facade proportions
bx,by=511,1635
outline=[(0,0),(502,0),(502,7),(495,7),(495,24),(502,24),(502,57),(493,57),(493,68),(502,68),(502,79),(495,79),(495,95),(502,95),(502,105),(495,105),(495,119),(502,119),(502,130),(499,130),(499,157),(0,157),(0,126),(-4,126),(-4,118),(2,118),(2,104),(-4,104),(-4,95),(2,95),(2,79),(-4,79),(-4,69),(2,69),(2,55),(-4,55),(-4,47),(2,47),(2,32),(-4,32),(-4,24),(2,24),(2,7),(-4,7),(-4,0)]
p=c.beginPath();p.moveTo(bx+outline[0][0],H-by-outline[0][1])
for xx,yy in outline[1:]:p.lineTo(bx+xx,H-by-yy)
p.close()
c.saveState();c.clipPath(p,stroke=0,fill=0);c.linearGradient(bx,H-by,bx+502,H-by-157,[col('#fcfafc'),col('#e5dbe3'),col('#f8fafc')],[0,.55,1]);c.restoreState()
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
doc=fitz.open(OUT);pg=doc[0];pg.get_pixmap(matrix=fitz.Matrix(1.7,1.7),alpha=False).save(ROOT+'/output/pdf/封面预览.png')
print({'output':OUT,'images':len(pg.get_images()),'paths':len(pg.get_drawings()),'bytes':os.path.getsize(OUT)})
