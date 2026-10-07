"""Versioned evidence shared by teaching, analysis, and score checks.
No generative changes to notes, timing, or the original score.
"""
import hashlib,json,os,re,threading,time
from collections import Counter,defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET
ROOT=Path(__file__).resolve().parent
CACHE=ROOT/'.sites-runtime/score-cache'
STORE=ROOT/'.sites-runtime/score-profiles'
VERSION=1
_LOCKS=[threading.Lock() for _ in range(32)]

def number(value,default=0):
 try:return float(value)
 except (TypeError,ValueError):return default

def build(xml,metadata=None):
 md=metadata or {};root=ET.fromstring(xml)
 # Support the optional MusicXML default namespace.
 for node in root.iter():node.tag=node.tag.rsplit('}',1)[-1]
 names={p.get('id'):p.findtext('part-name','') for p in root.findall('part-list/score-part')}
 parts=[];issues=[];meters={};keys={};tempos={};measures=defaultdict(lambda:{'notes':0,'rests':0,'parts':set(),'pitchClasses':set(),'words':[],'chords':[]});dynamics=0;onsets=set();patterns=defaultdict(list)
 for part in root.findall('part'):
  pid=part.get('id');divisions=1;beats=4;beat_type=4;count=0;rests=0;pitches=[];staves=set();voices=set();ranges=[]
  part_measures=part.findall('measure')
  for order,measure in enumerate(part_measures,1):
   a=measure.find('attributes')
   if a is not None:
    raw=a.findtext('divisions')
    if raw is not None:
     if number(raw)<=0:issues.append({'measure':order,'part':pid,'code':'divisions','message':'节拍精度无效，需要对照原稿核对。'})
     else:divisions=number(raw)
    t=a.find('time')
    if t is not None:
     beats=sum(number(x) for x in t.findtext('beats','4').split('+'));beat_type=number(t.findtext('beat-type','4'),4);meters[order]=str(t.findtext('beats','4'))+'/'+str(t.findtext('beat-type','4'))
    k=a.findtext('key/fifths')
    if k is not None:keys[order]=k
   m=measures[order];m['parts'].add(pid);m['words'].extend(x.text for x in measure.findall('.//words') if x.text)
   for sound in measure.findall('.//sound'):
    if number(sound.get('tempo'))>0:tempos[order]=number(sound.get('tempo'))
   dynamics+=len(measure.findall('.//dynamics'))
   cursor=0;last_start=0;end=0;fingerprint=[]
   for node in measure:
    if node.tag=='backup':cursor-=number(node.findtext('duration'))/divisions;continue
    if node.tag=='forward':cursor+=number(node.findtext('duration'))/divisions;end=max(end,cursor);continue
    if node.tag!='note':continue
    if node.find('grace') is not None:continue
    duration=number(node.findtext('duration'))/divisions
    if duration<=0:issues.append({'measure':order,'part':pid,'code':'duration','message':'存在无效音符时值，需要对照原稿核对。'})
    start=last_start if node.find('chord') is not None else cursor
    if node.find('chord') is None:last_start=start;cursor+=duration
    end=max(end,start+duration);staves.add(node.findtext('staff','1'));voices.add(node.findtext('voice','1'))
    if node.find('rest') is not None:rests+=1;m['rests']+=1;continue
    pitch=node.find('pitch');percussion=node.find('unpitched') is not None
    if pitch is None and not percussion:continue
    count+=1;m['notes']+=1
    if node.get('dynamics') is not None:dynamics+=1
    if not any(t.get('type')=='stop' for t in node.findall('tie')):onsets.add((order,round(start,6)))
    if pitch is not None:
     midi=12*(int(number(pitch.findtext('octave'),4))+1)+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}.get(pitch.findtext('step'),0)+number(pitch.findtext('alter'))
     pitches.append(midi);m['pitchClasses'].add(int(midi)%12);fingerprint.append((round(start,4),midi,round(duration,4)))
   nominal=beats*4/beat_type if beat_type>0 else 0
   if nominal>0 and end>nominal+.02:issues.append({'measure':order,'part':pid,'code':'overfull','message':'本声部时值超过拍号容量；可能存在拍号、连音或声部识别问题。','expectedBeats':nominal,'writtenBeats':round(end,4)})
   if nominal>0 and 0<end<nominal-.02 and measure.get('implicit')!='yes' and order!=len(part_measures):issues.append({'measure':order,'part':pid,'code':'underfull','message':'本声部记谱时值未填满小节，可能是省略休止或识别遗漏，不能直接删除空拍。','expectedBeats':nominal,'writtenBeats':round(end,4)})
   if nominal==8 and 0<end<=4.25:issues.append({'measure':order,'part':pid,'code':'meter-review','message':'谱面拍号为 4/2，但时值接近四个四分音符；请核对原稿，不能据此直接认定是 4/4。'})
   if fingerprint:patterns[(pid,tuple(fingerprint))].append(order)
   for h in measure.findall('harmony'):
    m['chords'].append({'root':h.findtext('root/root-step'),'alter':h.findtext('root/root-alter','0'),'kind':h.findtext('kind','major'),'source':'谱面标注'})
  parts.append({'value':pid,'name':names.get(pid) or pid,'notes':count,'rests':rests,'staves':sorted(staves),'voices':sorted(voices),'pitchRange':[min(pitches),max(pitches)] if pitches else None,'percussion':bool(part.findall('.//unpitched'))})
 written_tempos=[{'measure':m,'bpm':v} for m,v in sorted(tempos.items())]
 rows=[{'measure':order,**{**v,'parts':sorted(v['parts']),'pitchClasses':sorted(v['pitchClasses'])}} for order,v in sorted(measures.items())]
 return {'version':VERSION,'title':md.get('userTitle') or md.get('title') or root.findtext('work/work-title') or root.findtext('movement-title') or '', 'parts':parts,'measureCount':len(rows),'onsetGroups':len(onsets),'noteCount':sum(p['notes'] for p in parts),'tempo':md.get('tempo') or (written_tempos[0]['bpm'] if written_tempos else None),'tempoChanges':written_tempos,'timeSignatures':[{'measure':m,'value':v} for m,v in sorted(meters.items())],'keys':[{'measure':m,'fifths':v} for m,v in sorted(keys.items())],'writtenDynamics':dynamics,'measures':rows,'issues':issues,'repeatedMeasures':[{'part':pid,'measures':orders} for (pid,_),orders in patterns.items() if len(orders)>1], 'limits':['重复音型不等于曲式段落；和弦标注不等于已验证的和声分析。','时值检查仅提供疑点，不自动改写原谱。']}

def get_profile(ident):
 if not re.fullmatch('[a-f0-9]{64}',str(ident)):raise ValueError('无效琴谱编号')
 source=CACHE/(ident+'.json');sidecar=CACHE/(ident+'.metadata.json')
 if not source.exists():raise FileNotFoundError('该作品尚无可分析的电子谱')
 def stamp(p):
  try:s=p.stat();return [s.st_mtime_ns,s.st_size]
  except OSError:return None
 signature={'version':VERSION,'score':stamp(source),'metadata':stamp(sidecar)}
 destination=STORE/(ident+'.json')
 with _LOCKS[int(ident[:2],16)%len(_LOCKS)]:
  try:
   cached=json.loads(destination.read_text(encoding='utf-8'))
   if cached.get('signature')==signature:return {**cached['profile'],'cached':True}
  except (OSError,ValueError,KeyError):pass
  data=json.loads(source.read_text(encoding='utf-8'));md=dict(data.get('metadata') or {})
  if sidecar.exists():md.update(json.loads(sidecar.read_text(encoding='utf-8')))
  profile=build(data.get('xml',''),md);profile.update(id=ident,generatedAt=time.time(),source='实际乐谱')
  STORE.mkdir(parents=True,exist_ok=True);tmp=destination.with_suffix('.tmp');tmp.write_text(json.dumps({'signature':signature,'profile':profile},ensure_ascii=False),encoding='utf-8');os.replace(tmp,destination)
  return {**profile,'cached':False}
