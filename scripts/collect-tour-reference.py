import concurrent.futures as cf
import json,re,time
from pathlib import Path
from urllib.parse import urljoin,urlparse,urldefrag
import requests
from bs4 import BeautifulSoup

ROOT=Path('audit/tour-writing-references');ROOT.mkdir(parents=True,exist_ok=True)
seeds=[('Audacity','https://manual.audacityteam.org/man/tutorials.html','/man/'),('Ableton','https://www.ableton.com/en/live-manual/12/welcome-to-live/','/en/live-manual/12/'),('Blender','https://docs.blender.org/manual/en/latest/getting_started/index.html','/manual/en/latest/'),('Inkscape','https://inkscape.org/learn/tutorials/','/doc/tutorials/'),('Krita','https://docs.krita.org/en/user_manual.html','/en/'),('GIMP','https://docs.gimp.org/2.10/en/','/2.10/en/'),('Godot','https://docs.godotengine.org/en/stable/getting_started/introduction/index.html','/en/stable/getting_started/'),('Git','https://git-scm.com/book/en/v2','/book/en/v2/'),('OBS','https://obsproject.com/kb/quick-start-guide','/kb/'),('Ardour','https://manual.ardour.org/','/')]
def fetch(url):
 try:
  r=requests.get(url,timeout=18,headers={'User-Agent':'Mozilla/5.0'});r.raise_for_status();s=BeautifulSoup(r.content,'html.parser')
  title=s.title.get_text(' ',strip=True) if s.title else ''
  links=[urldefrag(urljoin(r.url,a['href']))[0] for a in s.select('a[href]')]
  node=s.select_one('#main .sect1') or s.select_one('main,article,[role=main],.document,.mw-parser-output') or s.body
  if not node:return None
  for e in node.select('script,style,nav,header,footer'):e.decompose()
  text=node.get_text('\n',strip=True)
  if len(text)<700:return None
  return {'url':r.url,'title':title,'text':text,'links':links}
 except Exception:return None
records=json.loads((ROOT/'sources.json').read_text(encoding='utf-8')) if (ROOT/'sources.json').exists() else [];seen={r['url'] for r in records}
seeds=[('VS Code','https://code.visualstudio.com/docs','/docs/'),('Obsidian','https://help.obsidian.md/','/'),('Audacity4','https://www.audacityteam.org/manual/getting-started/','/manual/'),('Inkscape','https://inkscape.org/learn/tutorials/','/doc/tutorials/')]+seeds
for product,seed,prefix in seeds:
 first=fetch(seed)
 if not first:continue
 host=urlparse(seed).netloc
 candidates=list(dict.fromkeys([seed]+[u for u in first['links'] if urlparse(u).netloc==host and urlparse(u).path.startswith(prefix) and not re.search(r'\.(pdf|png|jpg|zip)$',u)]))[:90]
 with cf.ThreadPoolExecutor(max_workers=5) as pool:
  for item in pool.map(fetch,candidates):
   if not item or item['url'] in seen:continue
   seen.add(item['url']);item['product']=product;item.pop('links',None);records.append(item)
   if sum(x['product']==product for x in records)>=24:break
 print(product,len(records),flush=True)
 (ROOT/'sources.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print('TOTAL',len(records),flush=True)
