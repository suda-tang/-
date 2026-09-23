"""Rebuild a saved adapter result from its source; retain model proposals and backups."""
import json,sys,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import xml.etree.ElementTree as ET
import pretty_midi
from arrangement_source import original_xml
from arrangement_music import meter_bars,voice_leading,drum_pattern,PROGRAMS
from arrangement_notation import write_notation

def repair(key,install=False):
 cache=ROOT/'.sites-runtime/arrangements';request=cache/(key+'.input.json')
 data=json.loads(request.read_text(encoding='utf-8'));old=json.loads((cache/(key+'.json')).read_text(encoding='utf-8'))
 xml=original_xml(data,request);bars=meter_bars(xml);score=data['score'];tempo=old['tempo']
 output=ROOT/'.sites-runtime/verification'/key;output.parent.mkdir(exist_ok=True)
 midi=pretty_midi.PrettyMIDI(initial_tempo=tempo);planned=[]
 for index,t in enumerate(old['tracks']):
  if index==0 and not t['drums']:
   notes=[{'midi':n['midi'],'beat':e['beat'],'duration':n['duration'],'velocity':84} for e in score['events'] for n in e['notes']]
  elif t['drums']:notes=drum_pattern(score,bars)
  else:notes=voice_leading(score,bars,t['notes'],t['program'],planned);planned.extend(notes)
  name='Piano' if index==0 else '鼓' if t['drums'] else PROGRAMS.get(t['program'],t['name'])
  track=pretty_midi.Instrument(t['program'],is_drum=t['drums'],name=name)
  track.notes=[pretty_midi.Note(n['velocity'],n['midi'],n['beat']*60/tempo,(n['beat']+n['duration'])*60/tempo) for n in notes]
  midi.instruments.append(track)
 write_notation(xml,midi.instruments,bars,tempo,output.with_suffix('.musicxml'))
 source=ET.fromstring(xml);result=ET.parse(output.with_suffix('.musicxml')).getroot()
 for node in source.iter():node.tag=node.tag.split('}')[-1]
 for original in source.findall('part'):
  restored=result.find(f"part[@id='{original.get('id')}']")
  assert ET.tostring(original)==ET.tostring(restored),'Original piano part changed'
 for part in result.findall('part')[len(source.findall('part')):]:
  assert len(part.findall('measure'))==len(bars),'Measure count changed'
 tracks=[{'name':t.name,'program':t.program,'drums':t.is_drum,'notes':[{'midi':n.pitch,'beat':n.start*tempo/60,'duration':(n.end-n.start)*tempo/60,'velocity':n.velocity/127} for n in t.notes]} for t in midi.instruments]
 output.with_suffix('.json').write_text(json.dumps({**old,'tracks':tracks,'adapterVersion':12},ensure_ascii=False),encoding='utf-8')
 for t in midi.instruments:t.name='Drums' if t.is_drum else pretty_midi.program_to_instrument_name(t.program)
 midi.write(str(output.with_suffix('.mid')))
 if install:
  for suffix in ('.musicxml','.mid','.json'):
   destination=cache/(key+suffix);backup=destination.with_name(destination.name+'.pre-v12')
   if not backup.exists():shutil.copy2(destination,backup)
   temporary=destination.with_name(destination.name+'.repair');shutil.copy2(output.with_suffix(suffix),temporary);temporary.replace(destination)
 print(json.dumps({'key':key[:8],'originalParts':len(source.findall('part')),'parts':len(result.findall('part')),'measures':len(bars),'installed':install}))

if __name__=='__main__':repair(sys.argv[1],'--install' in sys.argv)
