"""Server-side artwork lookup with persistent, high-resolution results."""
import json, re, hashlib, time, html
from urllib.request import urlopen, Request
from urllib.parse import urlencode

def normalized(value):
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", str(value).lower())

def _candidates(title):
    """Return exact OCR text first, then the core before separators."""
    raw=re.sub(r"\s+"," ",str(title).strip())[:100]
    if not raw:return []
    core=re.split(r"\s+|[-–—－]",raw,1)[0].strip("《》「」【】()（）[]:：,，。_")
    values=[]
    for value in (raw,core):
        if value and value not in values:values.append(value)
    return values

def _high_resolution(url):
    """iTunes returns a 100px thumbnail; its CDN accepts a larger rendition."""
    return re.sub(r"\d{2,4}x\d{2,4}(?:bb)?", "1200x1200bb", str(url or ""))

def _bing_image(query):
    """Fallback when a song catalogue has no exact hit.

    This remains server-side, is deliberately conservative, and is only used
    with the score title (never an arbitrary browser-provided image URL).
    """
    url="https://www.bing.com/images/search?"+urlencode({"q":query+" 歌曲 封面", "form":"HDRSC2"})
    request=Request(url,headers={"User-Agent":"Mozilla/5.0 PianoScoreCover/1.0","Accept-Language":"zh-CN,zh;q=0.9"})
    with urlopen(request,timeout=12) as response: page=html.unescape(response.read().decode("utf-8","ignore"))
    match=re.search(r'"murl"\s*:\s*"(https?[^"\\]+)',page)
    if not match:return ""
    return html.unescape(match.group(1).replace('\\/','/'))

def lookup(title, directory):
    values=_candidates(title)
    if not values:return {"artwork":""}
    directory.mkdir(parents=True,exist_ok=True)
    last={"artwork":"","title":values[0],"saved":time.time()}
    for query in values:
        path=directory/("cover-"+hashlib.sha256(query.encode()).hexdigest()+".json")
        try:
            if path.exists():
                cached=json.loads(path.read_text(encoding="utf-8"))
                if cached.get("artwork") and time.time()-cached.get("saved",0)<604800:
                    upgraded=_high_resolution(cached["artwork"])
                    if upgraded!=cached["artwork"]:
                        cached["artwork"]=upgraded
                        path.write_text(json.dumps(cached,ensure_ascii=False),encoding="utf-8")
                    return cached
                last=cached
            matches=[]
            for country in ("cn","us"):
                url="https://itunes.apple.com/search?"+urlencode({"term":query,"entity":"song","country":country,"limit":25})
                try:
                    with urlopen(Request(url,headers={"User-Agent":"PianoScore/1.0"}),timeout=8) as response:data=json.load(response)
                except Exception:continue
                matches=[x for x in data.get("results",[]) if normalized(x.get("trackName",""))==normalized(query)]
                if matches:break
            result={"artwork":"","title":query,"saved":time.time()}
            if matches:
                item=matches[0]
                result.update(artwork=_high_resolution(item.get("artworkUrl100","")),source=item.get("trackViewUrl",""),matchedTitle=item.get("trackName",""),artist=item.get("artistName",""),matchedQuery=query,usedCore=(query!=values[0]),provider="iTunes")
            else:
                artwork=_bing_image(query)
                if artwork:result.update(artwork=artwork,matchedQuery=query,usedCore=False,provider="Bing Images")
            path.write_text(json.dumps(result,ensure_ascii=False),encoding="utf-8");last=result
            if result.get("artwork"):return result
        except Exception:
            last["retry"]=True
    return last
