"""Join recognized movements in sequence without overlapping their measures."""
import copy
import xml.etree.ElementTree as ET
from fractions import Fraction
JOIN_REVISION = 2

def join_scores(xmls, title):
    roots=[ET.fromstring(x) for x in xmls]
    result=ET.Element('score-partwise',version='4.0')
    ET.SubElement(ET.SubElement(result,'work'),'work-title').text=title
    part_list=ET.SubElement(result,'part-list')
    count=max(len(r.findall('part')) for r in roots)
    outputs=[]
    for i in range(count):
        definition=next((r.find('part-list').findall('score-part')[i] for r in roots if len(r.find('part-list').findall('score-part'))>i),None)
        definition=copy.deepcopy(definition);definition.set('id',f'P{i+1}');part_list.append(definition)
        outputs.append(ET.SubElement(result,'part',id=f'P{i+1}'))
    order=0
    # Page fragments may omit an unchanged time signature. It remains in force
    # across page boundaries, just as it does across measures.
    meter=[Fraction(4) for _ in outputs]
    for root in roots:
        parts=root.findall('part')
        # Audiveris may omit measures from one part; align by original number.
        keys=[]
        for part in parts:
            for measure in part.findall('measure'):
                if measure.get('number') not in keys: keys.append(measure.get('number'))
        if all(k and k.isdigit() for k in keys):keys.sort(key=int)
        maps=[{m.get('number'):m for m in p.findall('measure')} for p in parts]
        divisions=[Fraction(1) for _ in outputs]
        for position,key in enumerate(keys):
            measures=[];lengths=[]
            for i in range(count):
                source=maps[i].get(key) if i<len(maps) else None
                measure=copy.deepcopy(source) if source is not None else ET.Element('measure')
                cursor=Fraction(0);end=Fraction(0)
                for item in measure:
                    if item.tag=='attributes':
                        d=item.find('divisions')
                        if d is not None:divisions[i]=Fraction(d.text);d.text='480'
                        time=item.find('time')
                        if time is not None:meter[i]=sum(Fraction(b) for b in time.findtext('beats','4').split('+'))*4/Fraction(time.findtext('beat-type','4'))
                    offset=item.find('offset')
                    if offset is not None:offset.text=str(round(Fraction(offset.text)/divisions[i]*480))
                    duration=item.find('duration')
                    if duration is not None:
                        beats=Fraction(duration.text)/divisions[i];duration.text=str(round(beats*480))
                        if item.tag=='backup':cursor-=beats
                        elif item.tag=='forward' or (item.tag=='note' and item.find('chord') is None):cursor+=beats
                        end=max(end,cursor)
                attrs=measure.find('attributes')
                if attrs is None:attrs=ET.Element('attributes');measure.insert(0,attrs)
                d=attrs.find('divisions')
                if d is None:d=ET.Element('divisions');attrs.insert(0,d)
                d.text='480'
                lengths.append(max(end,meter[i]) if measure.get('implicit')!='yes' else end)
                measures.append((measure,cursor))
            length=max(lengths)
            order+=1
            for i,(measure,cursor) in enumerate(measures):
                measure.set('number',str(order))
                if cursor<length:ET.SubElement(ET.SubElement(measure,'forward'),'duration').text=str(round((length-cursor)*480))
                outputs[i].append(measure)
    return ET.tostring(result,encoding='unicode',xml_declaration=True)


def repair_legacy_page_padding(xml):
    """Undo only the old joiner's terminal padding after meter-less page starts.

    Caller must establish that this is a legacy, joined OMR export. Preserve
    explicit rests, all notes, and intentional forwards carrying voice/staff.
    """
    root=ET.fromstring(xml);changed=0
    for part in root.findall('part'):
        meter=Fraction(4);divisions=Fraction(1);missing_page_time=False
        for measure in part.findall('measure'):
            if any(p.get('new-page')=='yes' for p in measure.findall('print')):
                missing_page_time=True
            for attrs in measure.findall('attributes'):
                if attrs.findtext('divisions'):divisions=Fraction(attrs.findtext('divisions'))
                time=attrs.find('time')
                if time is not None:
                    meter=sum(Fraction(b) for b in time.findtext('beats','4').split('+'))*4/Fraction(time.findtext('beat-type','4'))
                    missing_page_time=False
            items=list(measure)
            if not missing_page_time or not 0<meter<4 or not items:continue
            padding=items[-1]
            if padding.tag!='forward' or padding.attrib or [n.tag for n in padding]!=['duration']:continue
            cursor=end=last=Fraction(0)
            for item in items[:-1]:
                duration=Fraction(item.findtext('duration','0'))/divisions
                if item.tag=='backup':cursor-=duration
                elif item.tag=='forward':cursor+=duration;end=max(end,cursor)
                elif item.tag=='note' and item.find('grace') is None:
                    start=last if item.find('chord') is not None else cursor
                    if item.find('chord') is None:last=start;cursor+=duration
                    end=max(end,start+duration,cursor)
            old=Fraction(padding.findtext('duration','0'))/divisions
            if cursor+old!=4:continue
            target=max(end,meter) if measure.get('implicit')!='yes' else end
            remaining=max(Fraction(0),target-cursor)
            if remaining>=old:continue
            if remaining:padding.find('duration').text=str(round(remaining*divisions))
            else:measure.remove(padding)
            changed+=1
    return (ET.tostring(root,encoding='unicode',xml_declaration=True) if changed else xml),changed
