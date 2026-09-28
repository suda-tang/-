"""Collect public university faculty leads with provenance; never send email.

This is a discovery list, not a declaration of doctoral admission eligibility.
Use profile evidence before preparing any application.
"""
import concurrent.futures as cf
import csv, hashlib, json, re, time
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'application'/'research'
CACHE=OUT/'sources'
CACHE.mkdir(parents=True,exist_ok=True)
SEEDS=[
 ('清华大学','计算机与交互','https://www.cs.tsinghua.edu.cn/szzk/jzgml.htm'),
 ('北京大学','计算机与交互','https://cs.pku.edu.cn/szdw/jyxl/amz/Z.htm'),
 ('上海交通大学','计算机与交互','https://www.cs.sjtu.edu.cn/jiaoshiml.html'),
 ('复旦大学','计算机与智能','https://cs.fudan.edu.cn/53161/list.htm'),
 ('南京大学','计算机与智能','https://cs.nju.edu.cn/2639/list.htm'),
 ('南京大学','计算机与智能','https://cs.nju.edu.cn/2640/list.htm'),
 ('中国科学技术大学','计算机与智能','https://cs.ustc.edu.cn/js_23235/list.htm'),
 ('中国科学技术大学','计算机与智能','https://cs.ustc.edu.cn/fjs_23239/list.htm'),
 ('中国科学技术大学','计算机与智能','https://cs.ustc.edu.cn/trjs/list.htm'),
 ('哈尔滨工业大学','计算机与交互','https://cs.hit.edu.cn/jsml/list.htm'),
 ('浙江大学','计算机与交互','https://www.cs.zju.edu.cn/'),
 ('北京师范大学','心理与学习','https://psych.bnu.edu.cn/szdw/zrjs/'),
 ('北京师范大学','教育','https://fe.bnu.edu.cn/pc/cms1info/list/1/50'),
 ('华东师范大学','教育','https://ed.ecnu.edu.cn/45880/list.htm'),
 ('华东师范大学','心理与学习','https://psy.ecnu.edu.cn/rgznyrygcxwcw/list.htm'),
 ('华中师范大学','智能教育','https://foaie.ccnu.edu.cn/Home/Faculty___Research/Our_Faculty.htm'),
 ('华中师范大学','智能教育','https://nerc-ebd.ccnu.edu.cn/rcdw/szdw.htm'),
 ('华南师范大学','心理与学习','https://psy.scnu.edu.cn/shiziduiwu/shizililiang/'),
 ('西南大学','心理与学习','https://psy.swu.edu.cn/szdw/zrjs/js.htm'),
 ('西南大学','教师教育','https://cte.swu.edu.cn/szdw/szgk.htm'),
]
BAD=set('首页 教授 副教授 研究员 副研究员 助理教授 更多 下一页 上一页 尾页 返回 学院概况 师资队伍 人才培养 科学研究 合作交流 招生就业 教师名录 人才招聘 在职教师 兼职教师 专任教师 实验中心 科研成果 学院新闻 学术动态 通知公告 党群工作 研究方向 联系我们 管理团队 讲师 职称 姓名 邮箱 教师姓名 博士生 硕士生 实验员 行政人员 正高级 副高级 计算机系 中文版 繁体版 英文版 研究生院 学生工作 党建工作 学术报告 人工智能 心理学部 服务指南 教职员工 计算机学 网络安全 教学科研 研究中心'.split())
def fetch(url):
 key=hashlib.sha256(url.encode()).hexdigest()[:20];path=CACHE/(key+'.html')
 if path.exists():return path.read_text(encoding='utf-8')
 r=requests.get(url,timeout=15,headers={'User-Agent':'FacultyResearch/1.0 (academic application research)'})
 r.raise_for_status()
 try:text=r.content.decode('utf-8')
 except UnicodeDecodeError:text=r.content.decode('gb18030',errors='replace')
 path.write_text(text,encoding='utf-8');(CACHE/(key+'.url')).write_text(url,encoding='utf-8');return text
def soup(url):return BeautifulSoup(fetch(url),'html.parser')
def name_of(a):
 name=re.sub(r'\s+','',a.get_text(' ',strip=True)).replace('博士','').replace('教授','').strip('*＊')
 name=re.sub(r'（[^）]*）|\([^)]*\)','',name)
 if name in BAD or re.search('退休|管理|学院|专业|新闻|讲座|首页|学术|链接|更多|硕士|博士后|人才|名单|学科|教学|下载|通知|研究|招生|委员会|实验|平台|中心|办公|教育|副高|正高|期刊|英语|数学|物理|化学',name):return ''
 if re.fullmatch(r'[\u4e00-\u9fff]{2,4}',name):return name
 return ''
def discover(seed):
 uni,field,url=seed;rows=[];more=[]
 try:
  doc=soup(url)
  for a in doc.select('a[href]'):
   href=urljoin(url,a['href']);label=a.get_text(' ',strip=True)
   if not href.startswith(('https://','http://')):continue
   if re.search('退休|行政|博士后|学生|新闻|人才招聘|兼职',label):continue
   if (re.search('师资|教师名录|专任教师|在职教师|教授|按拼音|正高|副高',label) or re.fullmatch('[A-Z]',label) or re.fullmatch(r'[1-9]\d?|下一页',label)) and urlparse(href).netloc==urlparse(url).netloc and len(label)<24:more.append((uni,field,href))
   name=name_of(a)
   if not name or href==url or a['href'].startswith(('#','javascript:','mailto:')):continue
   if re.search(r'/list(?:\d+)?\.htm|/szdw/[^/]+\.htm$',href) and not re.search('/info/',href):continue
   if not (re.search(r'/info/|/page\.htm|/faculty|/teacher|/szdw/zrjs/|/people|/jzg|/staff|/szll|[?&]id=',href,re.I)):continue
   rows.append(dict(name=name,institution=uni,field=field,profile=href,directory=url))
  return rows,more,''
 except Exception as e:return [],[],f'{url}: {type(e).__name__}'
def main():
 pending=SEEDS[:];seen=set();people={};errors=[]
 extra=OUT/'extra-seeds.json'
 if extra.exists():pending+=json.loads(extra.read_text(encoding='utf-8'))
 for depth in range(3):
  batch=[s for s in pending if s[2] not in seen];pending=[];seen.update(s[2] for s in batch)
  with cf.ThreadPoolExecutor(max_workers=6) as pool:
   for seed,(rows,more,error) in zip(batch,pool.map(discover,batch)):
    for row in rows:people.setdefault((row['institution'],row['name']),row)
    pending.extend(more)
    if error:errors.append(error)
  print(json.dumps({'depth':depth,'pages':len(seen),'people':len(people)},ensure_ascii=False),flush=True)
 data=sorted(people.values(),key=lambda r:(r['institution'],r['name']))
 (OUT/'leads.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
 (OUT/'discovery-errors.json').write_text(json.dumps(errors,ensure_ascii=False,indent=2),encoding='utf-8')
 with (OUT/'导师线索.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=['name','institution','field','profile','directory']);w.writeheader();w.writerows(data)
 print('saved',len(data),flush=True)
if __name__=='__main__':main()
