"""Extract evidence from public profiles. Unknown eligibility remains unknown."""
import concurrent.futures as cf
import csv,json,re,time,hashlib
from pathlib import Path
from urllib.parse import urlencode
from bs4 import BeautifulSoup
from importlib.util import spec_from_file_location,module_from_spec
spec=spec_from_file_location('discovery',Path(__file__).with_name('research-faculty.py'));m=module_from_spec(spec);spec.loader.exec_module(m)
OUT=m.OUT
GROUPS={
 '音乐/声音':['音乐','音频','语音','声学','乐器','music','audio','speech','acoustic'],
 '交互/媒体':['人机交互','多模态','多媒体','虚拟现实','交互设计','interactive','multimodal','multimedia','human-computer'],
 '学习/教育':['教育','教学','学习科学','学习分析','课程','learning analytics','education','pedagog'],
 '心理/认知':['心理','认知','脑科学','情绪','情感','cognit','psycholog','affect'],
 '生成/智能':['人工智能','机器学习','深度学习','生成','模式识别','machine learning','artificial intelligence','generative'],
 '网络/同步':['计算机网络','分布式','实时系统','网络通信','wireless','distributed','real-time'],
}
def enrich(row):
 record=dict(row);record.update(checked='2026-09-28',admission_2027='未核实',paper_status='尚未逐篇精读',send_status='未发送')
 try:
  doc=m.soup(row['profile'])
  for tag in doc.select('script,style,nav,header,footer'):tag.decompose()
  title=doc.title.get_text(' ',strip=True) if doc.title else ''
  content=doc.select_one('.v_news_content,.wp_articlecontent,.article-content,.article_content,#vsb_content,.teacher-info,.teacher_content')
  text=(content or doc).get_text(' ',strip=True);text=re.sub(r'\s+',' ',text)
  record['profile_title']=title
  if re.search('txjzg|c44296|c2644|c2645|ltx|tuixiu',row['profile'],re.I) or re.search('永远怀念|退休教师|离退休教师|已退休|因病逝世|不幸逝世',title+' '+text[:1200]):
   record.update(status='排除：退休或纪念页',matches='',evidence='');return record
  if row['name'] not in title+' '+text[:12000]:
   record.update(status='待核：页面未匹配姓名',matches='',evidence='');return record
  if re.search('404|页面不存在|页面未找到|找不到该页面',title):raise ValueError('profile unavailable')
  rank=re.search('博士研究生导师|博士生导师|博导|硕士生导师|副教授|教授|副研究员|研究员|讲师|助理教授',text)
  record['rank_evidence']=rank.group() if rank else '未提取到职称'
  doctoral=re.search(r'.{0,35}(?:博士研究生导师|博士生导师|博导).{0,65}',text)
  record['doctoral_evidence']=doctoral.group() if doctoral else ''
  # Prefer research sections, avoiding navigation and unrelated page links.
  marker=re.search('研究方向|研究领域|研究兴趣|科研方向|Research Interests|Research Areas',text,re.I)
  relevant=text[marker.start():marker.start()+2400] if marker else text[:6000]
  groups=[g for g,words in GROUPS.items() if any(w in relevant.lower() for w in words)]
  record['matches']='；'.join(groups)
  snippets=[]
  for g in groups:
   for w in GROUPS[g]:
    match=re.search('.{0,35}'+re.escape(w)+'.{0,80}',relevant,re.I)
    if match:snippets.append(match.group());break
  record['evidence']=' | '.join(snippets)[:500]
  record['status']='方向有交集；招生待核' if groups and rank else '院系线索；需人工核对'
  record['direction']='ensemble' if '音乐/声音' in groups or '网络/同步' in groups else 'education' if '学习/教育' in groups or '心理/认知' in groups else 'generation'
  record['demo_url']='https://example.com/?'+urlencode({'tour':'1','auto':'1','mentor':row['name'],'direction':record['direction']})
  # Public university professional contact only; do not infer or guess emails.
  record['public_email']='；'.join(sorted(set(re.findall(r'[A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',text[:12000]))))[:300]
 except Exception as e:record.update(status='待核：个人页读取失败',matches='',evidence=type(e).__name__)
 return record
def save(data):
 (OUT/'profiles.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
 keys=['name','institution','field','status','rank_evidence','doctoral_evidence','matches','evidence','profile','directory','public_email','admission_2027','paper_status','demo_url','send_status','checked']
 with (OUT/'导师检索与核查.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=keys,extrasaction='ignore');w.writeheader();w.writerows(data)
def main():
 rows=json.loads((OUT/'leads.json').read_text(encoding='utf-8'));data=[]
 existing=OUT/'profiles.json'
 previous={r['profile']:r for r in json.loads(existing.read_text(encoding='utf-8'))} if existing.exists() else {}
 def resume(row):return previous.get(row['profile']) or enrich(row)
 with cf.ThreadPoolExecutor(max_workers=8) as pool:
  for i,row in enumerate(pool.map(resume,rows)):
   data.append(row)
   if (i+1)%50==0:save(data);print('checked',i+1,'/',len(rows),flush=True)
 save(data);print('complete',len(data),flush=True)
if __name__=='__main__':main()
