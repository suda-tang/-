"""Content-based catalog queries; never substitute titles for score evidence."""
import json,re,xml.etree.ElementTree as ET
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parent
CACHE={}
NAMES=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
TEMPLATES=[('',[0,4,7]),('m',[0,3,7]),('7',[0,4,7,10]),('maj7',[0,4,7,11]),('m7',[0,3,7,10]),('dim',[0,3,6]),('dim7',[0,3,6,9]),('aug',[0,4,8]),('sus2',[0,2,7]),('sus4',[0,5,7]),('m7b5',[0,3,6,10])]
KINDS={'major':'','minor':'m','dominant':'7','major-seventh':'maj7','minor-seventh':'m7','diminished':'dim','diminished-seventh':'dim7','augmented':'aug','suspended-second':'sus2','suspended-fourth':'sus4','half-diminished':'m7b5'}
def normalize(v):
 v=str(v).replace('♭','b').replace('♯','#')
 m=re.fullmatch(r'([A-Ga-g])([#b]?)(.*)',v)
 if not m:return v
 pc=({'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[m[1].upper()]+({'#':1,'b':-1}.get(m[2],0)))%12
 return NAMES[pc]+m[3]
def index(ident):
 if not re.fullmatch('[a-f0-9]{64}',ident):return None
 p=ROOT/'.sites-runtime/score-cache'/(ident+'.json')
 if not p.exists():return None
 stat=p.stat();stamp=(stat.st_mtime_ns,stat.st_size)
 if ident in CACHE and CACHE[ident][0]==stamp:return CACHE[ident][1]
 data=json.loads(p.read_text(encoding='utf8'));root=ET.fromstring(data['xml']);parts=[];drums=set();chords=defaultdict(set)
 for x in root.findall('part-list/score-part'):
  name=x.findtext('part-name','');pid=x.get('id');parts.append({'id':pid,'name':name})
  if re.search('鼓|drum|percussion',name,re.I) or x.findtext('midi-instrument/midi-channel')=='10':drums.add(pid)
 groups=defaultdict(list)
 for part in root.findall('part'):
  if part.get('id') in drums:continue
  for m in part.findall('measure'):
   number=m.get('number','')
   for h in m.findall('harmony'):
    step=h.findtext('root/root-step');kind=h.findtext('kind','major')
    if step and kind in KINDS:
     alter=int(float(h.findtext('root/root-alter','0')));name=normalize(step+('#' if alter==1 else 'b' if alter==-1 else '')+KINDS[kind]);chords[name].add((number,'谱面标注'))
   for n in m.findall('note'):
    step=n.findtext('pitch/step')
    if step:groups[number].append(12*(int(n.findtext('pitch/octave','4'))+1)+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[step]+int(float(n.findtext('pitch/alter','0'))))
 playback=data.get('metadata',{}).get('midiPlayback',{}).get('events',[])
 if playback:
  groups=defaultdict(list)
  for event in playback:
   for note in event.get('notes',[]):
    if note.get('part') not in drums and not note.get('percussion') and isinstance(note.get('midi'),(int,float)):groups[str(event.get('measure',1))].append(int(note['midi']))
 for number,notes in groups.items():
  pcs={n%12 for n in notes};bass=min(notes)%12;best=None
  for rt in range(12):
   for suffix,intervals in TEMPLATES:
    tones={(rt+x)%12 for x in intervals}
    if not tones<=pcs or len(tones)/len(pcs)<.75:continue
    quality=len(tones)*2-(len(pcs)-len(tones))*2+(.25 if rt==bass else 0)
    if best is None or quality>best[0]:best=(quality,NAMES[rt]+suffix)
  if best:chords[best[1]].add((number,'音符推测，需核对'))
 out={'parts':parts,'chords':dict(chords)};CACHE[ident]=(stamp,out)
 if len(CACHE)>200:CACHE.pop(next(iter(CACHE)))
 return out
ALIASES={'钢琴':'钢琴|piano','吉他':'吉他|guitar','弦乐':'弦|violin|viola|cello|string','鼓':'鼓|drum|percussion','贝司':'贝司|贝斯|bass','人声':'人声|vocal','木管':'flute|clarinet|oboe|bassoon|笛|单簧|双簧|木管'}

# ── 声部/打击乐器「最早出现在哪」 ───────────────────────────────────────────
# ★ 关键认识：鼓组是**一个声部**，但「通鼓」「军鼓」是它里面的**单个音高**。
#   所以「通鼓最早出现的地方」不能按声部名查，必须按 GM 打击乐音高去查。
#   （实测《知足》：鼓组声部从第 1 小节就在响，但中低音通鼓第一次出现是第 72 小节。）
DRUM_NOTES={35:'底鼓',36:'底鼓 1',37:'边击',38:'军鼓',39:'拍手',40:'电子军鼓',
 41:'低音落地鼓',42:'闭合踩镲',43:'高音落地鼓',44:'踏板踩镲',45:'低音通鼓',
 46:'开踩镲',47:'中低音通鼓',48:'中高音通鼓',49:'吊镲 1',50:'高音通鼓',
 51:'叮叮镲 1',52:'中国镲',53:'叮叮镲铃',54:'铃鼓',55:'水镲',56:'牛铃',
 57:'吊镲 2',58:'响板',59:'叮叮镲 2'}
DRUM_GROUPS={
 '底鼓':{35,36},'大鼓':{35,36},'kick':{35,36},
 '军鼓':{38,40},'小鼓':{38,40},'snare':{38,40},
 '边击':{37},'侧击':{37},'拍手':{39},
 '通鼓':{41,43,45,47,48,50},'嗵鼓':{41,43,45,47,48,50},'桶鼓':{41,43,45,47,48,50},'tom':{41,43,45,47,48,50},
 '落地鼓':{41,43},'地鼓':{41,43},'低音通鼓':{41,43},'中音通鼓':{45,47},'高音通鼓':{48,50},
 '踩镲':{42,44,46},'踏镲':{42,44,46},'hihat':{42,44,46},'hi-hat':{42,44,46},
 '闭合踩镲':{42},'开镲':{46},'开踩镲':{46},'踏板踩镲':{44},
 '吊镲':{49,57},'强音镲':{49,57},'crash':{49,57},
 '叮叮镲':{51,59},'ride':{51,59},'点镲':{53},
 '中国镲':{52},'水镲':{55},'牛铃':{56},'铃鼓':{54},
}
# 声部名匹配。「鼓组」放最后 —— 任何鼓类词（含「通鼓」）都会命中「鼓」，
# 必须先按 DRUM_GROUPS 判掉，才轮到它。
PART_PATTERNS=(
 ('钢琴',r'钢琴|piano'),('吉他',r'吉他|guitar'),('贝司',r'贝司|贝斯|bass'),
 ('弦乐',r'弦乐|string|violin|viola|cello|contrabass'),('人声',r'人声|vocal'),
 ('长笛',r'长笛|flute'),('双簧管',r'双簧管|oboe'),('单簧管',r'单簧管|clarinet'),
 ('大管',r'大管|bassoon'),('萨克斯',r'萨克斯|sax'),('小号',r'小号|trumpet'),
 ('长号',r'长号|trombone'),('圆号',r'圆号|french.?horn'),('小提琴',r'小提琴|violin'),
 ('中提琴',r'中提琴|viola'),('大提琴',r'大提琴|cello'),('低音提琴',r'低音提琴|contrabass'),
 ('竖琴',r'竖琴|harp'),('管风琴',r'管风琴|organ'),('手风琴',r'手风琴|accordion'),
 ('合成器',r'合成|synth'),('鼓组',r'鼓|drum|percussion'),
)

def _num(value):
 try:return float(value)
 except (TypeError,ValueError):return 0.0

def playback(item):
 """读一份曲谱的可播放数据（声部名 + 逐音符事件）。没有就返回 None。"""
 ident=str(item.get('id',''))
 if not re.fullmatch('[a-f0-9]{64}',ident):return None
 p=ROOT/'.sites-runtime/score-cache'/(ident+'.json')
 if not p.exists():return None
 try:data=json.loads(p.read_text(encoding='utf8'))
 except (OSError,ValueError):return None
 md=data.get('metadata') or {}
 events=(md.get('midiPlayback') or {}).get('events') or []
 return {'parts':{str(x.get('id')):str(x.get('name') or '') for x in md.get('midiParts') or []},
         'events':events,
         'measureCount':max([_num(e.get('measure')) for e in events] or [0])}

def locate(item,target):
 """找 target 指向的声部 / 打击乐器在**这份曲谱里最早出现**的位置。

    返回 {'measure','beat','offset','partId','partName','label','kind',...}；
    查不到时返回 {'error':'no-cache'|'no-playback'|'absent','label':…}，
    调用方据此说清楚「为什么查不到」，而不是笼统说「做不到」。
    """
 text=str(target or '')
 info=playback(item)
 if not info:return {'error':'no-cache'}
 if not info['events']:return {'error':'no-playback'}
 keys=[k for k in DRUM_GROUPS if k in text]
 if keys:
  wanted=set().union(*[DRUM_GROUPS[k] for k in keys])
  best=None
  for event in info['events']:
   for note in event.get('notes',[]):
    if not note.get('percussion'):continue
    try:midi=int(note.get('midi'))
    except (TypeError,ValueError):continue
    if midi not in wanted:continue
    key=(_num(event.get('measure')),_num(event.get('beat')))
    if best is None or key<best[0]:best=(key,event,note,midi)
  if not best:return {'error':'absent','label':'／'.join(keys)}
  _,event,note,midi=best
  part=str(note.get('part'))
  return {'measure':event.get('measure'),'beat':event.get('beat'),'offset':event.get('offset'),
          'partId':part,'partName':info['parts'].get(part,'打击乐'),
          'label':DRUM_NOTES.get(midi,'打击乐'),'kind':'drum','midi':midi,
          'measureCount':info['measureCount']}
 for label,pattern in PART_PATTERNS:
  if not (label in text or re.search(pattern,text,re.I)):continue
  ids={pid for pid,name in info['parts'].items() if re.search(pattern,name,re.I)}
  if not ids:continue
  best=None
  for event in info['events']:
   for note in event.get('notes',[]):
    if str(note.get('part')) not in ids:continue
    key=(_num(event.get('measure')),_num(event.get('beat')))
    if best is None or key<best[0]:best=(key,event,note)
  if best:
   _,event,note=best;part=str(note.get('part'))
   return {'measure':event.get('measure'),'beat':event.get('beat'),'offset':event.get('offset'),
           'partId':part,'partName':info['parts'].get(part,label),'label':info['parts'].get(part,label),
           'kind':'part','measureCount':info['measureCount']}
  return {'error':'absent','label':'／'.join(sorted(info['parts'].get(x,x) for x in ids))}
 return {'error':'absent','label':text}


def query(text,items,progress=lambda x:None):
 library=bool(re.search('云曲库|云曲谱|整个曲库|所有.*谱|曲库里|曲库中',text))
 if not library:return None
 chord=re.search(r'(?<![A-Za-z])([A-Ga-g][#b♯♭]?(?:maj7|m7b5|m7|dim7|dim|aug|sus2|sus4|m|7)?)(?![A-Za-z0-9])',text) if '和弦' in text else None
 instrument=next((k for k in ALIASES if k in text),None)
 if not chord and not ('声部' in text or instrument):return None
 hits=[];details=[];skipped=0
 for i,item in enumerate(items):
  progress('检查曲库 '+str(i+1)+'/'+str(len(items))+'：《'+str(item.get('title','未命名'))+'》')
  try:entry=index(str(item.get('id','')))
  except (ValueError,KeyError,ET.ParseError,OSError):entry=None
  if not entry:skipped+=1;continue
  if chord:
   matches=entry['chords'].get(normalize(chord[1]),[])
   ok=bool(matches);evidence='、'.join('第 '+n+' 小节（'+source+'）' for n,source in sorted(matches,key=lambda x: int(x[0]) if x[0].isdigit() else 0)[:12])
  else:
   matched=[p['name'] for p in entry['parts'] if re.search(ALIASES[instrument],p['name'],re.I)] if instrument and instrument!='人声' else [p['name'] for p in entry['parts'] if not re.search('钢琴|piano',p['name'],re.I)]
   if instrument=='人声':
    d=json.loads((ROOT/'.sites-runtime/score-cache'/(item['id']+'.json')).read_text(encoding='utf8'));matched=['人声'] if d.get('metadata',{}).get('vocal') else []
   ok=bool(matched);evidence='声部：'+'、'.join(matched)
  if ok:hits.append({**item,'evidence':evidence});details.append('《'+item.get('title','未命名')+'》 '+evidence)
 reply='找到 '+str(len(hits))+' 份曲谱。'+(' 和弦结果区分谱面标注与音符推测，后者需要核对。' if chord else '')+'\n'+'\n'.join(details)
 if skipped:reply+='\n另有 '+str(skipped)+' 份尚无可检索的电子谱，未计入结果。'
 return {'reply':reply,'actions':[{'type':'choose_scores','value':json.dumps(hits,ensure_ascii=False)}] if hits else []}
