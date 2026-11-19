"""Resolve teaching images without retaining downloaded originals."""
import base64,io,json,sys,concurrent.futures,re,html,time,unicodedata,math,hashlib
from urllib.parse import urlparse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from PIL import Image,ImageOps,ImageDraw,ImageFont
import requests
sys.stdout.reconfigure(encoding="utf-8")

def encode(image):
 image=ImageOps.exif_transpose(image).convert('RGB');image.thumbnail((1000,750));out=io.BytesIO();image.save(out,format='JPEG',quality=82,optimize=True)
 return 'data:image/jpeg;base64,'+base64.b64encode(out.getvalue()).decode()

def relevant_image(query,title):
 normalize=lambda value:''.join(c for c in unicodedata.normalize('NFKD',value).casefold() if not unicodedata.combining(c))
 query,title=normalize(query),normalize(title)
 if 'sheet music' in query or 'musical notation' in query:return bool(re.search('music|musical|notation|manuscript|partitur|score|partition|sheet|valse|waltz|polka|sonat|song|piano',title))
 if 'pianist' in query:return bool(re.search('piano|pianist|klavier|keyboard',title))
 for term,pattern in [('piano',r'piano|klavier|steinway'),('violin',r'violin|violino|geige'),('guitar',r'guitar|guitare|gitarre'),('drum',r'drum|percussion'),('flute',r'flute|flote'),('choir',r'choir|chorus|singing'),('orchestra',r'orchestra|symphony')]:
  if term in query:return bool(re.search(pattern,title))
 if 'portrait' in query:
  names=re.findall(r'[a-z]+',query.replace('portrait',''))
  return bool(names and names[-1] in title)
 return True

def commons(query,relaxed=False):
 params={'action':'query','format':'json','generator':'search','gsrsearch':query+' filetype:bitmap','gsrnamespace':6,'gsrlimit':5,'prop':'imageinfo','iiprop':'url|extmetadata|size','iiurlwidth':640,'iiextmetadatafilter':'LicenseShortName|Artist|AttributionRequired'}
 r=requests.get('https://commons.wikimedia.org/w/api.php',params=params,headers={'User-Agent':'SudaMusicClassroom/1.0 (educational lesson illustration)'},timeout=(4,9));r.raise_for_status()
 failures=[];deadline=time.monotonic()+25
 for page in sorted(r.json().get('query',{}).get('pages',{}).values(),key=lambda p:p.get('index',999)):
  try:
   if not relevant_image(query,page.get('title','')):continue
   info=(page.get('imageinfo') or [{}])[0];meta=info.get('extmetadata',{});license=meta.get('LicenseShortName',{}).get('value','')
   if not any(x in license.lower().replace('-', ' ') for x in ('cc by','cc0','public domain','pd')):continue
   # Commons also returns images on its official thumb.wikimedia.org host.
   # Use the API-provided official thumbnail, not a manually constructed URL.
   url=info.get('thumburl') or info.get('url','')
   parsed=urlparse(url)
   if parsed.scheme!='https' or parsed.hostname not in ('upload.wikimedia.org','thumb.wikimedia.org') or parsed.username:continue
   if time.monotonic()>=deadline:break
   response=requests.get(url.split('?')[0],headers={'User-Agent':'SudaMusicClassroom/1.0 (educational lesson illustration)'},timeout=(4,9),stream=True);response.raise_for_status();chunks=[];size=0
   for chunk in response.iter_content(32768):
    size+=len(chunk)
    if size>4*1024*1024:raise ValueError('图片过大')
    chunks.append(chunk)
   response.close()
   image=Image.open(io.BytesIO(b''.join(chunks)))
   if image.width*image.height>24000000:continue
   return {'src':encode(image),'sourceWidth':image.width,'sourceHeight':image.height,'credit':license+' / '+html.unescape(re.sub('<[^>]*>','',meta.get('Artist',{}).get('value','')))[:120]+' / '+page['title'],'sourceUrl':info.get('descriptionurl'),'alt':page['title'].removeprefix('File:')}
  except requests.HTTPError as error:
   if error.response is not None and error.response.status_code==429:raise ValueError('图片来源暂时限流，已停止重复请求') from error
   failures.append(str(error)[:160]);continue
  except Exception as error:failures.append(str(error)[:160]);continue
 if not relaxed:
  simpler=re.sub(r'\b(portrait|instruments?|keyboard)\b','',query,flags=re.I).strip()
  if simpler and simpler!=query:return commons(simpler,True)
 raise ValueError('联网图片候选均未取得：'+'；'.join(failures) if failures else '没有找到许可明确的相关图片')

def museum_image(query):
 """Public-domain collection images, independently available from Commons."""
 subject=re.sub(r'\b(grand|classical|concert|keyboard|portrait|instrument)\b','',query,flags=re.I).strip()
 response=requests.get('https://api.artic.edu/api/v1/artworks/search',params={'q':subject,'fields':'id,title,image_id,is_public_domain','limit':6},timeout=(4,8));response.raise_for_status()
 for item in response.json().get('data',[]):
  ident=item.get('image_id') or ''
  if not item.get('is_public_domain') or not re.fullmatch('[a-f0-9-]+',ident) or not relevant_image(query,item.get('title','')):continue
  url='https://www.artic.edu/iiif/2/'+ident+'/full/843,/0/default.jpg'
  with requests.get(url,timeout=(4,9),stream=True) as image_response:
   image_response.raise_for_status();data=bytearray()
   for block in image_response.iter_content(32768):
    data.extend(block)
    if len(data)>4*1024*1024:raise ValueError('插图文件过大')
  image=Image.open(io.BytesIO(data))
  if image.width*image.height>24000000:continue
  return {'src':encode(image),'alt':item['title'],'sourceWidth':image.width,'sourceHeight':image.height,'sourceUrl':'https://www.artic.edu/artworks/'+str(item['id']),'credit':'Public domain / Art Institute of Chicago / '+item['title']}
 raise ValueError('备用馆藏未找到相关的公有领域插图')

def web_image(query):
 try:return commons(query)
 except (requests.RequestException,ValueError) as first:
  try:return museum_image(query)
  except (requests.RequestException,ValueError) as second:raise ValueError(str(first)+'；备用来源：'+str(second)) from second

def web_gallery(queries,minimum=20):
 """Download distinct licensed assets once; keep only compressed course images."""
 candidates=[]
 headers={'User-Agent':'SudaMusicClassroom/1.0 (educational lesson illustration)'}
 def discover(query):
  found=[]
  try:
   r=requests.get('https://commons.wikimedia.org/w/api.php',params={'action':'query','format':'json','generator':'search','gsrsearch':query+' filetype:bitmap','gsrnamespace':6,'gsrlimit':20,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':640,'iiextmetadatafilter':'LicenseShortName|Artist|AttributionRequired'},headers=headers,timeout=(4,8));r.raise_for_status()
   for page in r.json().get('query',{}).get('pages',{}).values():
    info=(page.get('imageinfo') or [{}])[0];meta=info.get('extmetadata',{});license=meta.get('LicenseShortName',{}).get('value','');url=info.get('thumburl') or info.get('url','')
    if relevant_image(query,page.get('title','')) and any(x in license.lower().replace('-',' ') for x in ('cc by','cc0','public domain','pd')) and urlparse(url).hostname in ('upload.wikimedia.org','thumb.wikimedia.org'):
     found.append({'url':url,'sourceUrl':info.get('descriptionurl'),'alt':page.get('title','').removeprefix('File:'),'credit':license+' / '+html.unescape(re.sub('<[^>]*>','',meta.get('Artist',{}).get('value','')))[:120]})
  except (requests.RequestException,ValueError):pass
  try:
   subject=re.sub(r'\b(grand|classical|concert|keyboard|portrait|instrument)\b','',query,flags=re.I).strip()
   r=requests.get('https://api.artic.edu/api/v1/artworks/search',params={'q':subject,'fields':'id,title,image_id,is_public_domain','limit':100},timeout=(4,8));r.raise_for_status()
   for item in r.json().get('data',[]):
    ident=item.get('image_id') or ''
    if item.get('is_public_domain') and re.fullmatch('[a-f0-9-]+',ident) and relevant_image(query,item.get('title','')):
     found.append({'url':'https://www.artic.edu/iiif/2/'+ident+'/full/640,/0/default.jpg','sourceUrl':'https://www.artic.edu/artworks/'+str(item['id']),'alt':item['title'],'credit':'Public domain / Art Institute of Chicago / '+item['title']})
  except (requests.RequestException,ValueError):pass
  print('IMAGE_CANDIDATES '+query+' '+str(len(found)),file=sys.stderr,flush=True)
  return found
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  groups=list(pool.map(discover,list(dict.fromkeys(queries))[:8]))
 # Interleave subjects rather than filling an entire lesson with one portrait.
 for index in range(max((len(g) for g in groups),default=0)):
  for group in groups:
   if index<len(group):candidates.append(group[index])
 candidates=list({a['sourceUrl']:a for a in candidates if a.get('sourceUrl')}.values())
 def download(asset):
  try:
   with requests.get(asset['url'],headers=headers,timeout=(3,7),stream=True) as response:
    response.raise_for_status();data=bytearray()
    for block in response.iter_content(32768):
     data.extend(block)
     if len(data)>4*1024*1024:raise ValueError('图片过大')
   image=Image.open(io.BytesIO(data))
   if image.width*image.height>24000000:return None
   return {k:v for k,v in asset.items() if k!='url'}|{'src':encode(image),'sourceWidth':image.width,'sourceHeight':image.height}
  except (requests.RequestException,ValueError,OSError):return None
 assets=[];seen=set()
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  for start in range(0,min(100,len(candidates)),5):
   for asset in pool.map(download,candidates[start:start+5]):
    if not asset:continue
    digest=hashlib.sha256(asset['src'].encode()).hexdigest()
    if digest in seen:continue
    seen.add(digest);assets.append(asset)
    print('IMAGE_PROGRESS '+str(len(assets))+'/'+str(minimum),file=sys.stderr,flush=True)
    if len(assets)>=minimum:return assets
 return assets

def diagram(kind,evidence):
 image=Image.new('RGB',(960,600),'#faf7f2');draw=ImageDraw.Draw(image)
 if kind=='activity':
  font_path=next((p for p in ['C:/Windows/Fonts/msyh.ttc','C:/Windows/Fonts/simhei.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'] if Path(p).exists()),None)
  font=ImageFont.truetype(font_path,28) if font_path else ImageFont.load_default()
  steps=evidence.get('activitySteps') or ['聆听与记录','比较与讨论','说明音乐依据']
  for i,label in enumerate(steps[:3]):
   x=45+i*300;draw.rounded_rectangle((x,205,x+265,365),radius=14,fill=['#f0e4df','#e5ebe8','#eee9df'][i],outline='#c8b6af',width=2)
   draw.text((x+25,220),str(i+1).zfill(2),font=font,fill='#922c32')
   value=str(label)[:30];lines=[value[j:j+8] for j in range(0,len(value),8)][:3]
   for row,line in enumerate(lines):draw.text((x+25,265+row*30),line,font=font,fill='#332b2a')
   if i<2:draw.line((x+272,285,x+292,285),fill='#922c32',width=3);draw.polygon([(x+292,285),(x+283,280),(x+283,290)],fill='#922c32')
  image=image.crop((0,175,960,405))
  return {'src':encode(image),'sourceWidth':image.width,'sourceHeight':image.height,'alt':'课堂活动过程图','credit':'根据当前课堂环节绘制的教学活动示意'}
 if kind in ('rhythm','parts'):
  notes=[n for n in evidence.get('notes',[]) if n.get('pitch') and not n.get('rest') and isinstance(n.get('beat'),(int,float)) and float(n.get('duration',0))>0]
  if not notes:return diagram('contour',evidence)
  font_path=next((p for p in ['C:/Windows/Fonts/msyh.ttc','C:/Windows/Fonts/simhei.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'] if Path(p).exists()),None)
  font=ImageFont.truetype(font_path,22) if font_path else ImageFont.load_default()
  parts=list(dict.fromkeys(n['part'] for n in notes))[:5 if kind=='parts' else 1]
  start=math.floor(min(n['beat'] for n in notes));end=min(start+16,max(n['beat']+float(n['duration']) for n in notes));span=max(1,end-start)
  labels={str(p.get('id') or p.get('value')):p.get('name',p.get('id') or p.get('value')) for p in evidence.get('parts',[]) if isinstance(p,dict)}
  chart_bottom=135+len(parts)*78
  for beat in range(int(start),int(end)+1):
   x=180+(beat-start)/span*720;draw.line((x,95,x,chart_bottom),fill='#ded5cf',width=2);draw.text((x-8,chart_bottom+18),str(beat-start+1),fill='#8a7772',font=font)
  colors=['#874357','#b16e4e','#657f86','#8c8654','#736989']
  for row,part in enumerate(parts):
   y=125+row*78;draw.text((24,y+10),str(labels.get(part,part))[:9],fill='#624950',font=font)
   # Separate polyphonic pitches vertically; their lengths use original beats.
   selected=[n for n in notes if n['part']==part and start<=n['beat']<end]
   pitch=lambda n:12*(int(n['pitch'].get('octave',4))+1)+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[n['pitch']['step']]+int(n['pitch'].get('alter',0))
   low=min((pitch(n) for n in selected),default=0);high=max((pitch(n) for n in selected),default=1)
   for n in selected[:250]:
    x=180+(n['beat']-start)/span*720;right=180+(min(end,n['beat']+float(n['duration']))-start)/span*720
    yy=y+(high-pitch(n))/max(1,high-low)*44
    draw.rounded_rectangle((x,yy,max(x+3,right-2),yy+8),radius=3,fill=colors[row])
  image=image.crop((0,70,960,min(600,chart_bottom+70)))
  return {'src':encode(image),'sourceWidth':image.width,'sourceHeight':image.height,'alt':'原谱声部与时值图解' if kind=='parts' else '原谱节奏时值图解','credit':f'由当前作品逐音数据绘制，横轴为四分音符拍数，显示原谱起点后的 {span:g} 拍'}
 if kind=='keyboard':
  for i in range(14):draw.rounded_rectangle((40+i*62,170,40+(i+1)*62,455),radius=4,fill='white',outline='#75696a',width=2)
  for i in range(13):
   if i%7 not in (2,6):draw.rounded_rectangle((80+i*62,170,116+i*62,350),radius=3,fill='#3a3439')
  return {'src':encode(image),'sourceWidth':image.width,'sourceHeight':image.height,'alt':'钢琴键盘结构示意图','credit':'课堂绘制的键盘示意图'}
 notes=[n for n in evidence.get('notes',[]) if n.get('pitch') and not n.get('rest')]
 if not notes:raise ValueError('没有可以绘制的逐音数据')
 part=notes[0]['part'];staff=notes[0].get('staff');voice=notes[0].get('voice');notes=[n for n in notes if n['part']==part and n.get('staff')==staff and n.get('voice')==voice and not n.get('chord')][:90]
 if not notes:raise ValueError('没有独立旋律音可用于绘图')
 def pitch(n):
  p=n['pitch'];return 12*(int(p.get('octave',4))+1)+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[p['step']]+int(p.get('alter',0))
 values=[pitch(n) for n in notes];low=min(values)-2;high=max(values)+2
 for y in range(100,501,80):draw.line((50,y,915,y),fill='#dfd4cf',width=2)
 for i,(n,v) in enumerate(zip(notes,values)):
  x=55+i*850/max(1,len(notes)-1);y=490-(v-low)*380/max(1,high-low)
  draw.ellipse((x-5,y-5,x+5,y+5),fill='#874357')
  if i:draw.line((last_x,last_y,x,y),fill='#874357',width=3)
  last_x,last_y=x,y
 return {'src':encode(image),'sourceWidth':image.width,'sourceHeight':image.height,'alt':'原谱单声部逐音音高顺序示意','credit':f'原谱数据：{part}，谱表 {staff}，声部 {voice or '1'}，前 {len(notes)} 个非休止音；横轴为音符顺序，不表示时值'}

def resolve(plan,data):
 try:
  if plan.get('kind')=='upload':
   import classroom_materials
   ident=plan.get('materialId');allowed={m['id'] for m in data.get('materials',[])}
   if ident not in allowed:raise ValueError('图片未绑定至本课堂')
   item=classroom_materials.read(ident)
   if item['scoreId']!=data['scoreId']:raise ValueError('图片不属于当前曲谱')
   if Path(item['path']).suffix.lower() not in ('.jpg','.jpeg','.png','.webp'):raise ValueError('所选材料不是图片')
   image={'src':encode(Image.open(item['path'])),'alt':item['name'],'credit':'上传材料：'+item['name']}
  elif plan.get('kind')=='comparison':
   ranges=plan.get('measureRanges',[])[:2]
   if len(ranges)!=2:raise ValueError('比较图缺少两个真实小节范围')
   children=[]
   for span in ranges:
    child=resolve({'outlineId':'segment','kind':'rhythm','measureRange':span},data)
    if not child.get('image'):raise ValueError(child.get('error','没有取得片段数据'))
    children.append(Image.open(io.BytesIO(base64.b64decode(child['image']['src'].split(',',1)[1]))).convert('RGB'))
   image=Image.new('RGB',(1920,max(im.height for im in children)+90),'#faf7f2');draw=ImageDraw.Draw(image)
   font_path=next((p for p in ['C:/Windows/Fonts/msyh.ttc','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'] if Path(p).exists()),None);font=ImageFont.truetype(font_path,34) if font_path else ImageFont.load_default()
   for index,(child,span) in enumerate(zip(children,ranges)):
    draw.text((index*960+40,18),'片段 '+('A' if index==0 else 'B')+'：第'+str(span[0])+'—'+str(span[1])+'小节（节选）',font=font,fill='#922c32');image.paste(child,(index*960,80))
   image={'src':encode(image),'sourceWidth':image.width,'sourceHeight':image.height,'alt':'原谱两个片段的节奏与声部对照（节选）','credit':'根据原谱所选小节分别绘制，不根据题名推断音乐结构'}
  elif plan.get('kind') in ('keyboard','contour','rhythm','parts','activity'):
   evidence=dict(data.get('evidence',{}));evidence['activitySteps']=plan.get('steps',[]);notes=evidence.get('notes',[])
   if plan.get('measureRange'):notes=[n for n in notes if plan['measureRange'][0]<=int(n.get('measure',1))<=plan['measureRange'][1]]
   measures=sorted({int(n.get('measure',1)) for n in notes})[:4]
   if measures:
    selected=[dict(n) for n in notes if int(n.get('measure',1)) in measures]
    lengths={m:max((float(n.get('beat',0))+float(n.get('duration',0)) for n in selected if int(n.get('measure',1))==m),default=0) for m in measures}
    offset=0;starts={}
    for measure in measures:starts[measure]=offset;offset+=max(1,lengths[measure])
    for note in selected:note['beat']=float(note.get('beat',0))+starts[int(note.get('measure',1))]
    evidence['notes']=selected
   image=diagram(plan['kind'],evidence)
  else:image=web_image(str(plan.get('query',''))[:140])
  return {'outlineId':plan['outlineId'],'image':image}
 except Exception as error:return {'outlineId':plan.get('outlineId'),'error':str(error)}

if __name__=='__main__':
 data=json.loads(sys.stdin.buffer.read().decode("utf-8"));plans=data.get('plans',[])[:40]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(lambda p:resolve(p,data),plans))
 if data.get('galleryQueries'):
  slide_ids=data.get('gallerySlideIds',[])
  for i,asset in enumerate(web_gallery(data['galleryQueries'],int(data.get('galleryMinimum',20)))):
   results.append({'outlineId':slide_ids[i%len(slide_ids)]+'::web-'+str(i),'image':asset})
 print(json.dumps(results,ensure_ascii=False))
