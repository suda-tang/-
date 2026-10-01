"""Build a local review directory and public, contact-free presentation profiles."""
import csv,json,hashlib,html,collections
from pathlib import Path
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'application'/'research'
QUESTIONS=[
 ('音乐/声音','ensemble','声音分析与演奏','我想请教的是：在钢琴跟弹或异地合奏中，怎样区分音符识别的错误、网络造成的时间偏差和演奏者有意的处理？如果这些原因混在一起，后面的反馈很可能会给错。'),
 ('网络/同步','ensemble','网络条件与合奏同步','我想先做双人 MIDI 合奏，在可控网络抖动下比较补偿策略。除了降低时间误差，还想观察补偿是否改变两个人互相等待、带动和追赶的方式。这样的评价应该怎样设计？'),
 ('学习/教育','education','学习过程与反馈','我想比较逐音即时反馈和乐句结束后的反馈。练习时间相同的情况下，学生撤掉提示后是否还能改正，比提示开启时的分数更值得追踪。怎样把短期纠错和真正学会分开测量？'),
 ('心理/认知','education','注意、认知与音乐学习','我想知道，跟弹时不断看视觉提示，会不会占用学生原本用于倾听的注意？能否在反馈内容相同的情况下改变呈现时机，观察演奏表现和离开提示后的保持效果？'),
 ('交互/媒体','education','交互方式与音乐练习','我想比较不同反馈界面对同一段练习的影响。学生是因为理解了问题而停下来，还是被提示打断了？仅看点击和重弹次数难以判断，应该怎样结合演奏过程来研究？'),
 ('生成/智能','generation','生成方法与练习材料','我想把自动生成限定在可教学的练习素材上：保留原曲结构，改变织体和难度，再由教师盲评和学生试奏检验。哪些约束真正有用，能否通过逐项移除约束来判断？'),
]
def main():
 rows=json.loads((OUT/'profiles.json').read_text(encoding='utf-8'))
 retained=list({(r['institution'],r['name']):r for r in rows if r['status']=='方向有交集；招生待核'}.values())
 retained.sort(key=lambda r:(not bool(r.get('doctoral_evidence')), '音乐/声音' not in r.get('matches',''),r['institution'],r['name']))
 visits={};cards=[]
 for r in retained:
  identifier=hashlib.sha256((r['institution']+'|'+r['name']).encode()).hexdigest()[:16]
  match=next((q for q in QUESTIONS if q[0] in r.get('matches','')),QUESTIONS[-1]);_,direction,focus,question=match
  # Topics are proposed discussion angles, not a claim about a supervisor's endorsement.
  visits[identifier]={'name':r['name'],'institution':r['institution'],'direction':direction,'focus':focus,'question':question,'source':r['profile']}
  r=dict(r);r.update(visit_id=identifier,focus=focus,question=question,demo_url='https://suzhou.super-tang.com/?'+urlencode({'tour':1,'auto':1,'visit':identifier,'mentor':r['name'],'direction':direction}))
  cards.append(r)
 (ROOT/'dist'/'mentor-visits.json').write_text(json.dumps(visits,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 (OUT/'方向候选与专属链接.json').write_text(json.dumps(cards,ensure_ascii=False,indent=2),encoding='utf-8')
 keys=['name','institution','matches','rank_evidence','doctoral_evidence','evidence','profile','admission_2027','paper_status','demo_url','question','send_status']
 with (OUT/'方向候选与专属链接.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=keys,extrasaction='ignore');w.writeheader();w.writerows(cards)
 summary={'checked':len(rows),'retained':len(cards),'with_doctoral_phrase':sum(bool(r.get('doctoral_evidence')) for r in cards),'status_counts':dict(collections.Counter(r['status'] for r in rows)),'institutions':dict(collections.Counter(r['institution'] for r in cards)),'all_2027_admission_unverified':True,'sent':0}
 (OUT/'核查进度.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
 data=json.dumps(cards,ensure_ascii=False).replace('<','\\u003c')
 page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>唐秋鸣｜申请候选核查</title><style>body{font:14px/1.7 system-ui;margin:0;background:#f4f2ee;color:#333}main{max-width:1300px;margin:auto;padding:32px}h1{font-size:26px;font-weight:550}input,select,button{font:inherit;border:1px solid #d4c9bd;border-radius:8px;padding:9px;background:#fff}input{width:min(450px,80vw)}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;vertical-align:top;padding:16px;border-bottom:1px solid #eee}th{position:sticky;top:0;background:#eee9e2}small{display:block;color:#777}a{color:#8d453b}details{max-width:450px}p{max-width:900px}.table{overflow:auto}#pager{display:flex;gap:15px;margin:20px 0}mark{background:#f5e5bd}</style><main><h1>申请候选核查</h1><p>这是扩展检索池，按个人主页关键词初筛。方向有交集不等于具备招生资格；“博导”字样也需要核对属于本人。全部2027名额、跨专业条件和具体论文仍待核实。<strong>尚未发送任何邮件。</strong></p><input id="q" placeholder="搜索姓名、院校、方向或研究摘录"><select id="filter"><option value="all">全部方向候选</option><option value="doctoral">个人页有博导字样</option></select><p id="count"></p><div class="table"><table><thead><tr><th>姓名 / 院校</th><th>研究线索</th><th>证据与待核事项</th><th>专属展示</th></tr></thead><tbody id="rows"></tbody></table></div><div id="pager"><button id="prev">上一页</button><span id="page"></span><button id="next">下一页</button></div></main><script id="data" type="application/json">DATA</script><script>const data=JSON.parse(document.querySelector('#data').textContent);let page=0;const $=s=>document.querySelector(s);function el(t,text){const n=document.createElement(t);n.textContent=text;return n}function render(){const q=$('#q').value.trim().toLowerCase(),rows=data.filter(r=>(!q||[r.name,r.institution,r.matches,r.evidence].join(' ').toLowerCase().includes(q))&&($('#filter').value!=='doctoral'||r.doctoral_evidence));page=Math.min(page,Math.max(0,Math.ceil(rows.length/40)-1));$('#count').textContent=`共 ${data.length} 条方向候选；当前筛选 ${rows.length} 条。`;$('#rows').replaceChildren();for(const r of rows.slice(page*40,page*40+40)){const tr=el('tr',''),a=el('td',r.name),b=el('td',r.matches),c=el('td',''),d=el('td','');a.append(el('small',r.institution));const details=el('details','');details.append(el('summary','查看原页摘录'),el('p',r.evidence));b.append(details);const source=el('a','个人主页');source.href=r.profile;source.target='_blank';source.rel='noopener';c.append(source,el('small',r.doctoral_evidence||'未提取到博导说明'),el('small','2027招生与具体论文待核'));const visit=el('a','打开专属演示');visit.href=r.demo_url;visit.target='_blank';visit.rel='noopener';d.append(visit,el('small',r.focus));tr.append(a,b,c,d);$('#rows').append(tr);}$('#page').textContent=`${page+1} / ${Math.max(1,Math.ceil(rows.length/40))}`;$('#prev').disabled=page===0;$('#next').disabled=(page+1)*40>=rows.length;}$('#q').oninput=$('#filter').onchange=()=>{page=0;render()};$('#prev').onclick=()=>{page--;render();scrollTo(0,0)};$('#next').onclick=()=>{page++;render();scrollTo(0,0)};render();</script></html>'''.replace('DATA',data)
 (OUT/'申请候选核查.html').write_text(page,encoding='utf-8')
 print(json.dumps(summary,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
