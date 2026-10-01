"""Review-only introductions: never attribute unconfirmed praise to the speaker."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
folder=root/'application/2027申请材料'
rows=json.loads((folder/'优先联系名单.json').read_text(encoding='utf-8'))
prefaces=[]
for r in rows:
    text=f"{r['name']}老师，您好。谢谢您抽时间来看唐秋鸣的项目演示。他目前在苏州大学学习音乐教育，主项是钢琴，也在做异地 MIDI 合奏和钢琴学习网页。\n\n这次为您准备的演示，想把一个具体问题说清楚：{r['question']}网页会从一首作品开始，逐步展示谱面、声音和相关操作。这里展示的是研究原型，后面提出的比较与实验，还属于研究计划。\n\n您可以随时暂停，选一段自己关心的内容。接下来由秋鸣介绍他的做法和仍然卡住的地方，也希望有机会听到您的意见。"
    item={'name':r['name'],'institution':r['school'],'text':text,'source':r['paper'] or r['source'],'basis':r['basis'],'status':'待申请人与音色授权导师确认文稿','approved':False,'audioGenerated':False}
    prefaces.append(item)
    (folder/'优先联系'/(r['school']+'-'+r['name'])/'导师音色前言-待确认.md').write_text(f"# 致{r['name']}：前言文稿\n\n状态：待确认，尚未合成或启用。\n\n{text}\n\n---\n\n定制依据：{item['source']}\n\n核查程度：{r['basis']}\n\n此文仅引入申请人的研究问题，未替发声导师作学术评价或推荐承诺；音色授权不等于已确认本篇文稿。\n",encoding='utf-8')
(folder/'个性化前言待审.json').write_text(json.dumps(prefaces,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Prepared {len(prefaces)} review-only prefaces; no audio generated')
