"""Validate OCR header candidates against geometry, credit filters and a song catalogue."""
import re
from song_cover import lookup,normalized
FORBIDDEN=re.compile(r'作词|作曲|编曲|编配|制谱|排版|作者|演奏|改编|音乐工作室|虫虫|公众号|版权所有|扒谱|首调|原调|完整版|间奏|伴奏|独奏|版本|钢琴|https?://|www\.|@|\d{4,}',re.I)

def filename_title(name):
    name=re.split(r'[/\\]',str(name))[-1]
    name=re.sub(r'\.(mid|midi|musicxml|mxl|xml|pdf|png|jpe?g|webp|heic|mp3|m4a|wav|flac|mp4|mov|webm|ogg|aac)$','',name,flags=re.I)
    quoted=re.search(r'[《「](.+?)[》」]',name)
    if quoted and not FORBIDDEN.search(quoted[1]):return quoted[1].strip()
    name=re.sub(r'\.(mp3|wav|m4a)\s*\d*$','',name,flags=re.I)
    name=re.sub(r'[_ -]\d{4,}$','',name)
    name=re.split(r'\s*(?:作词|作曲|编曲|编配|制谱|排版|改编|原调|独奏|钢琴|简谱|五线谱|完整版|\[|【|（|\()',name)[0]
    parts=re.split(r'\s+[-–—]\s+',name)
    if len(parts)>1:name=parts[0]
    name=re.split(r'[-–—]',name,maxsplit=1)[0]
    name=re.sub(r'\.(mp3|wav|m4a)$','',name,flags=re.I)
    return name.strip(' _-')[:100] or '未命名曲谱'

def fallback_title(name,cache):
    title=filename_title(name);catalog=lookup(title,cache) if title!='未命名曲谱' else {}
    matched=bool(catalog.get('artwork')) and (normalized(catalog.get('matchedTitle',''))==normalized(title) or catalog.get('usedCore'))
    return {'title':catalog['matchedTitle'] if matched else title,'ocrTitle':'','titleVersion':'7','titleSource':'filename','titleVerification':'filename-catalogue' if matched else 'filename','cover':catalog.get('artwork','') if matched else ''}
def check(payload,cache):
    candidates=payload.get('candidates') or []
    valid=[]
    for candidate in candidates[:8]:
        title=re.split(r'[-–—－]',str(candidate.get('text','')),maxsplit=1)[0].strip('《》「」:：,，。 ')
        if not 2<=len(title)<=30 or FORBIDDEN.search(title):continue
        confidence=float(candidate.get('confidence') or 0)
        center=float(candidate.get('center',.5));size=float(candidate.get('size',0))
        if confidence<65 or abs(center-.5)>.24 or size<.08:continue
        valid.append((size*(1-abs(center-.5)),confidence,title))
    valid.sort(reverse=True)
    if not valid:return fallback_title(payload['filename'],cache) if payload.get('filename') else {'title':'','titleVersion':'7','titleVerification':'unresolved','retryTitleOcr':True}
    # A cover is accepted only when its catalogue track title equals one OCR
    # candidate. This makes a matched cover positive evidence for the title,
    # while a large composer/arranger line can never replace a song title.
    for _,confidence,title in valid:
        catalog=lookup(title,cache)
        matched=bool(catalog.get('artwork') and catalog.get('matchedTitle')) and (normalized(title)==normalized(catalog.get('matchedTitle','')) or catalog.get('usedCore'))
        if matched:
            return {'title':catalog.get('matchedTitle',title),'ocrTitle':catalog.get('matchedTitle',title),'titleVersion':'7','source':'OCR + catalogue','titleVerification':'catalogue','cover':catalog.get('artwork',''),'titleSourceUrl':catalog.get('source','')}
    return fallback_title(payload['filename'],cache) if payload.get('filename') else {'title':'','ocrTitle':'','titleVersion':'7','titleVerification':'unresolved','retryTitleOcr':True}


def resolved_import_title(title,name,metadata=None):
    metadata=metadata or {}
    if metadata.get('titleSource')=='user':return str(metadata.get('userTitle') or title).strip()
    text=str(title or '').strip()
    generic=re.fullmatch(r'acoustic grand piano|grand piano|piano|untitled(?: score)?|conductor|tempo(?: track)?|midi(?: score|乐谱)?|track\s*\d*|音轨\s*\d*|未命名.*|导入.*|钢琴|鼓组|violin|strings|flute|bass|drums?',text,re.I)
    instruments={p.get('name') for p in metadata.get('midiParts',[]) if isinstance(p,dict)}
    if not text or generic or '\ufffd' in text or (metadata.get('sourceType')=='midi' and text in instruments):return filename_title(name)
    return text
