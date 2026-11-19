"""Read public curriculum indexes when general search engines are unavailable."""
import re
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup

CACHE = {}


def links(url):
    from classroom_references import checked_get
    cached = CACHE.get(url)
    if cached and time.time()-cached[0] < 3600:
        return cached[1]
    try:
        with checked_get(url, timeout=(3,5), stream=True) as r:
            r.raise_for_status()
            data = bytearray()
            for chunk in r.iter_content(65536):
                data.extend(chunk)
                if len(data)>2*1024*1024:return []
        soup=BeautifulSoup(bytes(data),'html.parser')
        result=list(dict.fromkeys((a.get_text(' ',strip=True),urljoin(url,a['href'])) for a in soup.select('a[href]') if urlparse(urljoin(url,a['href'])).hostname=='www.renjiaoshe.com'))
        if len(CACHE)>128:CACHE.pop(next(iter(CACHE)))
        CACHE[url]=(time.time(),result)
        return result
    except Exception:return []


def find(title,stage):
    from classroom_references import norm
    # The landing page already lists books across publishers. Senior books can
    # be called simply "音乐鉴赏", without a grade or the word "必修".
    index=links('https://www.renjiaoshe.com/yinyue/')
    wanted=re.compile('七年级|八年级|九年级' if stage=='初中' else '高中|必修|选修|音乐鉴赏|创作|歌唱|演奏|音乐与' if stage=='高中' else '[一二三四五六]年级')
    books=list(dict.fromkeys(u for text,u in index if '/jiaocai/' in u and wanted.search(text)))
    if not books:
        versions=list(dict.fromkeys(u for text,u in index if re.search(r'/yinyue/[^/]+/$',u)))
        with ThreadPoolExecutor(max_workers=4) as pool:
            books=list(dict.fromkeys(u for group in pool.map(links,versions[:12]) for text,u in group if '/jiaocai/' in u and wanted.search(text)))
    def scan(book_urls):
        works=[]
        with ThreadPoolExecutor(max_workers=6) as pool:
            for start in range(0,min(len(book_urls),96),12):
                for group in pool.map(links,book_urls[start:start+12]):
                    works.extend(u for text,u in group if norm(title) in norm(text) and '/kewen/' in u)
                works=list(dict.fromkeys(works))
                if len(works)>=4:break
        return works[:4]
    works=scan(books)
    reference_stage=stage
    if not works:
        # Mark cross-grade sources honestly so they can be adapted, not treated
        # as plans already written for the requested age group.
        secondary=[(text,u) for text,u in index if '/jiaocai/' in u and not wanted.search(text)]
        # Include senior repertoire before a long list of primary volumes; an
        # arbitrary prefix otherwise never reaches 黄河 or symphonic works.
        secondary.sort(key=lambda item: (not bool(re.search('音乐鉴赏|高中|必修|选修',item[0])),not bool(re.search('七年级|八年级|九年级',item[0]))))
        other=list(dict.fromkeys(u for text,u in secondary))
        works=scan(other[:60]);reference_stage='其他学段'
    with ThreadPoolExecutor(max_workers=4) as pool:
        lists=list(dict.fromkeys(u for group in pool.map(links,works) for text,u in group if '教案' in text and 'jiaoan.html' in u))
    with ThreadPoolExecutor(max_workers=4) as pool:
        articles=list(dict.fromkeys((text,u) for group in pool.map(links,lists) for text,u in group if '/p/' in u and norm(title) in norm(text) and re.search('教案|教学设计',text)))
    if articles:
        return [{'title':text,'url':u,'excerpt':text,'kind':'catalog_result','referenceStage':reference_stage} for text,u in articles[:6]]
    return [{'title':title+' 教学设计','url':u,'excerpt':'教材目录中的同名作品教学参考','kind':'catalog_result','referenceStage':reference_stage} for u in lists[:4]]
