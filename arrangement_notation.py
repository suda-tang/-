"""Keep the original piano engraving; append named, independent instrument parts."""
import copy
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from arrangement_music import PROGRAMS

def write_notation(source_xml,tracks,bars,tempo,target,title=None):
 from music21 import stream,note,chord,percussion,instrument,meter,clef,tie,duration
 root=ET.fromstring(source_xml)
 for node in root.iter():node.tag=node.tag.split('}')[-1]
 if title:
  work=root.find('work')
  if work is None:work=ET.Element('work');root.insert(0,work)
  heading=work.find('work-title')
  if heading is None:heading=ET.SubElement(work,'work-title')
  heading.text=title
  for heading in root.findall('movement-title'):heading.text=title
 part_list=root.find('part-list')
 positions={36:('F',4),38:('C',5),42:('G',5),43:('G',4),47:('D',5),49:('A',5)}
 for index,track in enumerate(tracks):
  if track.program==0 and track.name=='Piano':continue
  part=stream.Part(id=f'generated{index}');part.partName='鼓' if track.is_drum else PROGRAMS.get(track.program,track.name)
  part.partAbbreviation=part.partName
  inst=instrument.UnpitchedPercussion() if track.is_drum else instrument.instrumentFromMidiProgram(track.program)
  inst.instrumentName=part.partName;part.insert(0,inst)
  part.insert(0,clef.PercussionClef() if track.is_drum else clef.BassClef() if track.program in (42,43,58,70) else clef.TrebleClef())
  previous=None;measures=[]
  for bar in bars:
   signature=f"{bar['beats']}/{bar['unit']}"
   measure=stream.Measure(number=len(measures)+1)
   if signature!=previous:measure.insert(0,meter.TimeSignature(signature));previous=signature
   if bar['pickup']:measure.paddingLeft=bar['beats']*4/bar['unit']-bar['length']
   part.insert(bar['start'],measure);measures.append(measure)
  groups=defaultdict(list)
  for n in track.notes:groups[round(n.start*tempo/60,6)].append(n)
  for beat,notes in sorted(groups.items()):
   # Quantize generated accompaniment to standard sixteenth-note values so
   # MusicXML never receives an inexpressible floating-point duration.
   length=min(round((n.end-n.start)*tempo/60*16)/16 for n in notes)
   length=max(1/16,length)
   if track.is_drum:
    tones=[]
    for n in notes:
     tone=note.Unpitched();tone.displayStep,tone.displayOctave=positions.get(n.pitch,('C',5))
     drum=instrument.UnpitchedPercussion();drum.percMapPitch=n.pitch;drum.midiChannel=9
     tone.storedInstrument=drum
     if n.pitch in (42,49):tone.notehead='x'
     tones.append(tone)
    item=tones[0] if len(tones)==1 else percussion.PercussionChord(tones)
   else:item=note.Note(notes[0].pitch) if len(notes)==1 else chord.Chord([n.pitch for n in notes])
   # Explicit source bars prevent pickup/overfull OMR measures from shifting
   # every following bar. Never let makeMeasures infer a second timeline.
   from bisect import bisect_right
   bar_index=max(0,bisect_right([b['start'] for b in bars],beat+1e-6)-1)
   if bar_index>=len(bars):continue
   remaining=length;first=True
   while remaining>1e-6 and bar_index<len(bars):
    bar=bars[bar_index];offset=max(0,beat-bar['start'])
    segment=min(remaining,bar['length']-offset)
    segment=max(1/16,round(segment*16)/16)
    segment=min(segment,bar['length']-offset)
    if segment<=1e-6:break
    fragment=copy.deepcopy(item);fragment.quarterLength=segment
    if not track.is_drum and (not first or remaining>segment+1e-6):
     fragment.tie=tie.Tie('start' if first else 'continue' if remaining>segment+1e-6 else 'stop')
    measures[bar_index].insert(offset,fragment)
    remaining-=segment;beat+=segment;bar_index+=1;first=False
  for measure,bar in zip(measures,bars):
   measure.makeRests(fillGaps=True,timeRangeFromBarDuration=False,inPlace=True)
   if measure.highestTime<bar['length']-1e-6:
    restLength=max(1/16,round((bar['length']-measure.highestTime)*16)/16)
    rest=note.Rest(quarterLength=restLength);measure.insert(measure.highestTime,rest)
   for item in list(measure.notesAndRests):
    if item.duration.type!='complex':continue
    offset=item.offset;measure.remove(item)
    for fragment in item.splitAtDurations():
     measure.insert(offset,fragment);offset+=fragment.quarterLength
   for item in list(measure.notesAndRests):
    value=max(1/16,round(float(item.quarterLength)*16)/16)
    if abs(float(item.quarterLength)-value)>1e-9 or item.duration.type=='complex':
     # Assigning a fresh Duration also clears stale tuplet metadata left by
     # makeRests; changing only quarterLength can preserve an inexpressible
     # duration internally.
     item.duration=duration.Duration(value)
    if item.duration.type=='complex':
     # Some music21 versions retain tuplets after assignment. Replace the
     # residual object with representable rests so one malformed fragment
     # cannot abort the entire arrangement export.
     offset=item.offset;measure.remove(item)
     remaining=value
     while remaining>1e-9:
      part=min(1/16,remaining);measure.insert(offset,note.Rest(quarterLength=part));offset+=part;remaining-=part
  score=stream.Score();score.insert(0,part)
  temporary=Path(target).with_suffix(f'.part{index}.musicxml');score.write('musicxml',fp=str(temporary),makeNotation=False)
  generated=ET.parse(temporary).getroot();temporary.unlink()
  for measure,bar in zip(generated.findall('./part/measure'),bars):
   if bar['pickup']:measure.set('implicit','yes')
  if len(generated.findall('./part/measure'))!=len(bars):raise ValueError('生成声部小节数与原谱不一致')
  if not track.is_drum:
   channel=index+2 if index+2<10 else index+3
   for element in generated.findall('.//midi-channel'):element.text=str(channel)
  if track.is_drum:
   definition=generated.find('./part-list/score-part');body=generated.find('part')
   for element in list(definition):
    if element.tag in ('score-instrument','midi-instrument'):definition.remove(element)
   used=sorted({n.pitch for n in track.notes})
   for pitch in used:
    item=ET.SubElement(definition,'score-instrument',id=f'D{pitch}');ET.SubElement(item,'instrument-name').text=f'Drum {pitch}'
   for pitch in used:
    item=ET.SubElement(definition,'midi-instrument',id=f'D{pitch}');ET.SubElement(item,'midi-channel').text='10';ET.SubElement(item,'midi-unpitched').text=str(pitch+1)
   reverse={position:pitch for pitch,position in positions.items()}
   for element in body.findall('.//note'):
    unpitched=element.find('unpitched')
    if unpitched is None:continue
    pitch=reverse[(unpitched.findtext('display-step'),int(unpitched.findtext('display-octave')))]
    for old in element.findall('instrument'):element.remove(old)
    marker=ET.Element('instrument',id=f'D{pitch}');duration=element.find('duration');element.insert(list(element).index(duration)+1,marker)
  # Rename every id and reference to avoid collisions across independently written parts.
  for element in generated.iter():
   if element.get('id'):element.set('id',f'G{index}_'+element.get('id'))
  for definition in generated.findall('./part-list/score-part'):part_list.append(copy.deepcopy(definition))
  for body in generated.findall('part'):root.append(copy.deepcopy(body))
 ET.ElementTree(root).write(target,encoding='utf-8',xml_declaration=True)
