"""Meter adapter and deterministic, sparse accompaniment constraints."""
from bisect import bisect_right
from copy import deepcopy
import xml.etree.ElementTree as ET

PROGRAMS={0:'钢琴',4:'电钢琴',8:'钢片琴',16:'管风琴',24:'尼龙吉他',26:'爵士吉他',29:'过载吉他',32:'原声贝斯',33:'指弹贝斯',40:'小提琴',41:'中提琴',42:'大提琴',43:'低音提琴',46:'竖琴',47:'定音鼓',48:'弦乐合奏',50:'合成弦乐',52:'合唱',55:'乐队齐奏',56:'小号',57:'长号',58:'大号',60:'圆号',61:'铜管合奏',64:'高音萨克斯',66:'次中音萨克斯',67:'上低音萨克斯',68:'双簧管',69:'英国管',70:'巴松',71:'单簧管',72:'短笛',80:'方波主奏',88:'氛围音色'}
PRESETS={'original':[], 'chamber':[40,41,42], 'orchestra':[48,72,71,60,42,46], 'strings':[40,41,42,43], 'woodwinds':[72,68,71,70], 'brass':[56,60,57,58]}
NAMES={'original':'原谱', 'chamber':'室内乐', 'orchestra':'管弦乐', 'strings':'弦乐四重奏', 'woodwinds':'木管四重奏', 'brass':'铜管四重奏', 'custom':'自选编制'}

def inferred_bars(score):
 """Compatibility for jobs enqueued before the server began storing meter bars."""
 total=float(score.get('totalBeats') or max((e['beat']+max((n['duration'] for n in e['notes']),default=0) for e in score.get('events',[])),default=4))
 measures=max(1,int(score.get('measures') or round(total/4)))
 starts={}
 for event in score.get('events',[]):
  measure=int(event.get('measure') or 0)
  if measure>0:starts[measure]=min(starts.get(measure,float(event['beat'])),float(event['beat'])-float(event.get('offset') or 0))
 if starts:
  ordered=sorted(starts.items());bars=[]
  for index,(_,start) in enumerate(ordered):
   end=ordered[index+1][1] if index+1<len(ordered) else total
   bars.append({'start':start,'length':max(.25,end-start),'beats':4,'unit':4,'pickup':index==0 and end-start<4})
  return bars
 return [{'start':i*4,'length':min(4,total-i*4),'beats':4,'unit':4,'pickup':False} for i in range(measures) if i*4<total]

def meter_bars(xml):
 root=ET.fromstring(xml)
 for node in root.iter():node.tag=node.tag.split('}')[-1]
 parts=root.findall('part')
 if not parts:raise ValueError('原谱缺少声部')
 part=max(parts,key=lambda p:len(p.findall('measure')))
 bars=[];base=0.;divisions=1.;beats=4;unit=4
 for measure in part.findall('measure'):
  cursor=end=last=0.
  for item in measure:
   if item.tag=='attributes':
    divisions=max(1.,float(item.findtext('divisions',str(divisions))))
    t=item.find('time')
    if t is not None:
     b=t.findtext('beats');u=t.findtext('beat-type')
     if b:beats=sum(int(x.strip()) for x in b.split('+'))
     if u:unit=int(u.strip())
   elif item.tag in ('backup','forward','note'):
    duration=float(item.findtext('duration','0'))/divisions
    if item.tag=='backup':cursor-=duration
    elif item.tag=='forward':cursor+=duration;end=max(end,cursor)
    elif item.find('grace') is None:
     onset=last if item.find('chord') is not None else cursor
     if item.find('chord') is None:last=onset;cursor+=duration
     end=max(end,onset+duration,cursor)
  if beats<=0 or unit<=0:raise ValueError('原谱拍号无效，请校对拍号')
  nominal=beats*4/unit
  length=(end or nominal) if measure.get('implicit')=='yes' else max(nominal,end)
  bars.append({'start':base,'length':length,'beats':beats,'unit':unit,'pickup':length<nominal})
  base+=length
 return bars

def warp(beat,bars,to_model=False):
 starts=[b['start'] for b in bars] if to_model else [i*4 for i in range(len(bars))]
 i=max(0,min(len(bars)-1,bisect_right(starts,beat+1e-8)-1));b=bars[i]
 return i*4+(beat-b['start'])*4/b['length'] if to_model else b['start']+(beat-i*4)*b['length']/4

def model_score(score,bars):
 result=deepcopy(score)
 for event in result['events']:
  onset=event['beat'];event['beat']=warp(onset,bars,True)
  for note in event['notes']:note['duration']=warp(onset+note['duration'],bars,True)-event['beat']
 return result

def drum_pattern(score,bars):
 """A metrical groove, independent of the number of piano attacks."""
 hits=[]
 for index,b in enumerate(bars):
  start,end=b['start'],b['start']+b['length']
  if not any(e['beat']<end and any(e['beat']+n['duration']>start for n in e['notes']) for e in score['events']):continue
  compound=b['unit']==8 and b['beats']>=6 and b['beats']%3==0
  pulse=1.5 if compound else 4/b['unit'];subdivision=.5 if compound else pulse/2
  count=max(1,round(b['length']/pulse))
  def hit(pitch,offset,velocity,length=.25):
   if offset<b['length']-1e-6:hits.append({'midi':pitch,'beat':start+offset,'duration':min(length,b['length']-offset),'velocity':velocity})
  for k in range(count):
   offset=k*pulse
   if k==0 or (count>=4 and k==count//2):hit(36,offset,78 if k==0 else 66)
   elif (compound and k%2==1) or (not compound and (k%2==1 or count==3 and k==2)):hit(38,offset,65)
  phrase=index%8
  lift=(0,1,3,2,4,6,8,3)[phrase]
  for k in range(max(1,round(b['length']/subdivision))):hit(42,k*subdivision,(42 if k%2==0 else 29)+lift)
  # Add a restrained human-style layer: off-beat open hats and ghost snares
  # create forward motion without tying a hit to every piano note.
  if not compound and b['length']>=3:
   for offset in (pulse*.5,pulse*1.5,pulse*2.5,pulse*3.5):
    if offset<b['length']:hit(46,offset,24+lift//3,.16)
   if count>=4:
    for offset in (1.5,3.5):
     if offset<b['length']:hit(38,offset,25+lift//4,.12)
  # A little forward motion in the second half of a phrase without copying
  # piano attacks. The downbeat/backbeat remain unchanged.
  if phrase in (4,5,6) and count>=4:hit(36,2.5*pulse,53+lift)
  # Restrained four-bar turnarounds; never fill a pickup or a final incomplete bar.
  if index%4==3 and not b['pickup'] and b['length']>=3:
   fill=start+b['length']-pulse
   hits=[n for n in hits if not(fill<=n['beat']<end and n['midi'] in (38,42))]
   # Duple fills in simple meter; triplets only in compound meter. Snare/hat
   # gestures avoid fixed-pitch tom samples clashing with the song's key.
   steps=3 if compound else (4 if phrase==7 else 2)
   for k in range(steps):hit(38 if k%2==0 or k==steps-1 else 42,b['length']-pulse+k*pulse/steps,36+k*5,pulse/steps)
  if index%8==0 and not b['pickup']:hit(49,0,49,1)
 return sorted(hits,key=lambda n:(n['beat'],n['midi']))

def voice_leading(score,bars,proposals,program,companions=()):
 """One legato line per instrument, with chord tones and bounded motion."""
 ranges={40:(60,84),41:(48,72),42:(36,59),43:(28,48),48:(55,76),46:(55,84),72:(72,91),68:(60,84),69:(53,76),70:(36,62),71:(55,79),56:(58,79),57:(40,65),58:(28,52),60:(43,67)}
 low,high=ranges.get(program,(48,79));previous=(low+high)//2;previous_melody=None;output=[]
 windows=[]
 for b in bars:
  # Re-evaluate harmony at each metrical pulse, including compound beats.
  # A single triad sustained across an entire bar clashes with chord changes.
  pulse=1.5 if b['unit']==8 and b['beats']%3==0 else 4/b['unit']
  offset=0
  while offset<b['length']-1e-6:
   windows.append((b['start']+offset,min(b['start']+b['length'],b['start']+offset+pulse)));offset+=pulse
 for start,end in windows:
  weights=[0.]*12
  sounding=[]
  for event in score['events']:
   for n in event['notes']:
    overlap=max(0,min(end,event['beat']+n['duration'])-max(start,event['beat']))
    if overlap and not n.get('percussion'):weights[n['midi']%12]+=overlap;sounding.append(n['midi'])
  if not sounding:continue
  # Use pitches actually supported by this window, not an invented major/minor
  # triad (which also erased sevenths and minor-key inflections).
  pcs={pc for pc,w in enumerate(weights) if w>=max(weights)*.45}
  melody=max(sounding)
  positions=[0]
  for offset in positions:
   beat=start+offset
   proposal=min(proposals,key=lambda n:abs(n['beat']-beat),default=None)
   preferred=proposal['midi'] if proposal else previous
   occupied=[n['midi'] for n in companions if n['beat']<end-1e-6 and n['beat']+n['duration']>start+1e-6]
   strong={pc for pc,w in enumerate(weights) if w>=max(weights)*.65}
   candidates=[p for p in range(low,high+1) if p%12 in pcs and (melody-p)%12 not in (1,11)
    and all((p-pc)%12 not in (1,11,6) for pc in strong)
    and all(abs(p-q)>=(7 if min(p,q)<48 else 3) and (p-q)%12 not in (1,11,6) for q in occupied)]
   if not candidates:continue
   def cost(p):
    parallel=previous_melody is not None and (p-previous)*(melody-previous_melody)>0 and (melody-p)%12 in (0,7) and (previous_melody-previous)%12==(melody-p)%12
    return abs(p-previous)*2+abs(p-preferred)*.15+(20 if parallel else 0)+(7 if p%12==melody%12 else 0)+(12 if any(p%12==q%12 for q in occupied) else 0)-weights[p%12]
   chosen=min(candidates,key=cost);duration=end-start
   if output and output[-1]['midi']==chosen and abs(output[-1]['beat']+output[-1]['duration']-beat)<1e-6:
    output[-1]['duration']+=duration
   else:output.append({'midi':chosen,'beat':beat,'duration':duration,'velocity':42 if program in (42,43,58) else 38})
   previous=chosen;previous_melody=melody
 return output
