import requests,bs4,urllib.parse,pathlib,concurrent.futures
from PIL import Image,ImageDraw
p=pathlib.Path(r'C:/Users/mail/Documents/ChatGPT/自动钢琴陪练系统/tmp/pdfs/shu-references')
u='https://alumni.shu.edu.cn/index/sdly.htm';r=requests.get(u,timeout=20);r.encoding='utf-8';s=bs4.BeautifulSoup(r.text,'html.parser')
refs={'gate':'https://alumni.shu.edu.cn/Portals/544/IMG_0107.JPG','weichang':'https://alumni.shu.edu.cn/Portals/544/DSC_5980.jpg','weichang2':'https://alumni.shu.edu.cn/Portals/544/IMG_8450.JPG','mainlib':'https://lib.shu.edu.cn/__local/1/B0/50/46EFC1FA9059827BC138CC3C815_15BADDE4_25D8.jpg?e=.jpg','qianlib':'https://lib.shu.edu.cn/__local/A/44/D3/A887BDBE9A573915844B184A5A0_D5ADED1F_18245.jpg?e=.jpg'}
for im in s.find_all('img'):
 if 'DSC_5808' in im.get('src',''):refs['panchi']=urllib.parse.urljoin(u,im['src'])
def get(kv):
 k,u=kv
 try:r=requests.get(u,timeout=20);r.raise_for_status();(p/(k+'.jpg')).write_bytes(r.content);print(k,len(r.content))
 except Exception as e:print(k,type(e).__name__)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:list(ex.map(get,refs.items()))
page=Image.new('RGB',(1400,1500),'white');d=ImageDraw.Draw(page)
for i,k in enumerate(refs):
 try:im=Image.open(p/(k+'.jpg'));im.thumbnail((680,460));x=i%2*700;y=i//2*500;page.paste(im,(x,y+25));d.text((x+8,y+5),k,fill='black')
 except:pass
page.save(p/'contact.png')
