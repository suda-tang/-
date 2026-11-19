import requests,pathlib,concurrent.futures
from PIL import Image,ImageDraw
p=pathlib.Path(r'C:/Users/mail/Documents/ChatGPT/自动钢琴陪练系统/tmp/pdfs/tongji-references');p.mkdir(exist_ok=True)
refs={'gate':'https://ggw.tongji.edu.cn/themes/59/userfiles/images/2018/1/27/650/bfrlewfxhkn6i8f.jpg','library':'https://ggw.tongji.edu.cn/themes/59/userfiles/images/2018/1/27/650/kdj3wyfa0vylx96.jpg','tower':'https://ggw.tongji.edu.cn/themes/59/userfiles/images/2018/1/26/650/vvqiujntk7mql0t.jpg','wenyuan':'https://ggw.tongji.edu.cn/themes/59/userfiles/images/2018/1/27/650/njkm3id9icmnoca.jpg','auditorium':'https://ggw.tongji.edu.cn/themes/59/userfiles/images/2018/1/27/650/zpdvuwloqlbdi8w.jpg'}
def get(v):
 k,u=v
 try:
  r=requests.get(u,timeout=20);r.raise_for_status();(p/(k+'.jpg')).write_bytes(r.content);print(k,len(r.content))
 except Exception as e:print(k,type(e).__name__)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:list(ex.map(get,refs.items()))
page=Image.new('RGB',(1400,1500),'white');d=ImageDraw.Draw(page)
for i,k in enumerate(refs):
 f=p/(k+'.jpg')
 if not f.exists():continue
 im=Image.open(f);im.thumbnail((680,460));x=(i%2)*700;y=(i//2)*500;page.paste(im,(x,y+25));d.text((x+8,y+5),k,fill='black')
page.save(p/'contact.png')
