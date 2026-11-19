import requests,pathlib,concurrent.futures
from PIL import Image,ImageDraw
p=pathlib.Path(r'C:/Users/mail/Documents/ChatGPT/自动钢琴陪练系统/tmp/pdfs/tongji-references');p.mkdir(exist_ok=True)
refs={'libfront':'https://photo.tongji.edu.cn/xyjz/images/tsg_3.png','libbanner':'https://photo.tongji.edu.cn/xyjz/css/5-tsgbanner.jpg','hallfront':'https://photo.tongji.edu.cn/xyjz/images/dlt_0.png','hallbanner':'https://photo.tongji.edu.cn/xyjz/css/1-dltbanner.JPG','wenbanner':'https://photo.tongji.edu.cn/xyjz/css/6-wylbanner.JPG'}
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
page.save(p/'contact-front.png')
