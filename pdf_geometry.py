"""Detect staff rectangles and barlines in the original PDF raster."""
import json
import xml.etree.ElementTree as ET
import fitz
from statistics import mean, median

def groups(values, gap=2):
    out=[]
    for value in values:
        if not out or value-out[-1][-1]>gap: out.append([int(value)])
        else: out[-1].append(int(value))
    return out

def _staff_groups(staffs, ink, width):
    """Group detected staves into systems.

    The left system bar joins the staves of one system but does not run through
    the white space between systems, so a vertical run of ink between two staves
    is what separates them.
    """
    chunks=[]
    for staff in staffs:
        connected=False
        if chunks:
            a,b=chunks[-1][-1][-1],staff[0]
            connected=any(sum(ink[y][x] for y in range(a,b+1))/(b-a+1)>.75
                          for x in range(width//30,width-10) if ink[a][x] and ink[b][x])
        if connected:chunks[-1].append(staff)
        else:chunks.append([staff])
    return chunks

def _barlines(chunk, ink, width):
    """X positions of the bars in one system, plus the system's vertical extent."""
    top,bottom=chunk[0][0],chunk[-1][-1]
    evidence=[0]*width
    for staff in chunk:
        a,b=staff[0],staff[-1]
        for x in range(width):
            if sum(ink[y][x] for y in range(a,b+1))/(b-a+1)>.82:evidence[x]+=1
    if len(chunk)>1:
        a,b=chunk[-2][-1],chunk[-1][0]
        for x in range(width):
            if sum(ink[y][x] for y in range(a,b+1))/(b-a+1)<.75:evidence[x]=0
    spacing=max(2,int(median([b-a for a,b in zip(chunk[0],chunk[0][1:])])*.5))
    candidates=[int(mean(g)) for g in groups([x for x in range(width) if evidence[x]>=len(chunk)],spacing)]
    xs=[x for x in range(width) if ink[top][x]]
    if xs:candidates=[x for x in candidates if xs[0]-3<=x<=xs[-1]+3]
    return candidates,top,bottom

def _page_measures(part,page_number):
    """Measure numbers that belong to a page, in order.

    The recognizer stamps new-page="yes" on the first measure of every page, so
    this is the one page mapping that can be trusted; the engine's own
    new-system markers are not reliable enough to divide a page into systems.
    """
    page=1
    rows=[]
    current=[]
    for number,measure in enumerate(part.findall('measure'),1):
        marker=measure.find('print')
        if marker is not None and marker.get('new-page')=='yes' and number>1:
            if page==page_number:rows.append(current)
            current=[]
            page+=1
        current.append(number)
    if page==page_number and current:rows.append(current)
    return [number for row in rows for number in row]

def detect(pdf_path,page_number,cache_dir):
    # v7 assigns bars proportionally instead of discarding a page whose system
    # grouping cannot be matched exactly; the older revision returned no boxes at
    # all for most pages after the first, so a click could not be located.
    cache=cache_dir/f'{pdf_path.stem}.bounds-v7-{page_number}.json'
    if cache.exists(): return json.loads(cache.read_text(encoding='utf-8'))
    with fitz.open(pdf_path) as doc:
        page=doc[page_number-1]
        pix=page.get_pixmap(matrix=fitz.Matrix(1500/page.rect.width,1500/page.rect.width),colorspace=fitz.csGRAY,alpha=False)
    h,w=pix.height,pix.width
    raw=pix.samples
    ink=[bytes(1 if value<170 else 0 for value in raw[y*w:(y+1)*w]) for y in range(h)]
    ys=[int(mean(group)) for group in groups([y for y in range(h) if sum(ink[y])>w*.45],3)]
    staffs=[];i=0
    while i+4<len(ys):
        five=ys[i:i+5];spacing=[b-a for a,b in zip(five,five[1:])]
        if min(spacing)>2 and max(spacing)/min(spacing)<1.4:
            staffs.append(five);i+=5
        else:i+=1
    chunks=_staff_groups(staffs,ink,w)
    saved=json.loads((cache_dir/(pdf_path.stem+'.json')).read_text(encoding='utf-8'))
    root=ET.fromstring(saved['xml'])
    parts=root.findall('part')
    # MusicXML print markers describe systems; use the part with the most
    # coordinate-bearing notes, rather than a mostly silent first part.
    part=max(parts,key=lambda p:(len(p.findall('measure')),len(p.findall('.//note[@default-x]'))))
    measures_on_page=_page_measures(part,page_number)
    bands=[];measures={}
    if chunks and measures_on_page:
        detected=[]
        for chunk in chunks:
            candidates,top,bottom=_barlines(chunk,ink,w)
            detected.append({'candidates':candidates,'top':top,'bottom':bottom})
        total_bars=sum(max(1,len(item['candidates'])-1) for item in detected)
        running=0
        used=0
        for row,item in enumerate(detected,1):
            share=max(1,len(item['candidates'])-1)
            running+=share
            # Cumulative rounding keeps the running total honest, so the last
            # system always ends on the page's final measure.
            upto=round(len(measures_on_page)*running/total_bars)
            assigned=measures_on_page[used:upto]
            used=upto
            if not assigned:continue
            top,bottom=item['top'],item['bottom']
            candidates=item['candidates']
            bands.append({'top':top/h*100,'bottom':bottom/h*100})
            edges=candidates if len(candidates)==len(assigned)+1 else None
            for index,number in enumerate(assigned):
                if edges:
                    left,right=edges[index]/w*100,edges[index+1]/w*100
                else:
                    # Share the system's printed width evenly when the bar count
                    # does not match; still inside the real system, never a
                    # guess from page thirds.
                    start=candidates[0] if candidates else 0
                    end=candidates[-1] if candidates else w
                    span=(end-start)/len(assigned)
                    left,right=(start+span*index)/w*100,(start+span*(index+1))/w*100
                measures[str(number)]={'left':left,'right':right,'top':top/h*100,'bottom':bottom/h*100,'row':row}
    result={'width':w,'height':h,'bands':bands,'measures':measures,'staffCount':len(staffs),
            'systemCount':len(chunks),'detectedSystems':[len(c) for c in chunks],'source':'detected-barlines'}
    result['mappingIncomplete']=len(measures)!=len(measures_on_page) or not measures_on_page
    if measures:cache.write_text(json.dumps(result),encoding='utf-8')
    return result
