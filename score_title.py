"""Update MusicXML display titles without reserializing the musical content."""
import re
from xml.sax.saxutils import escape

def with_title(xml,title):
    root=re.search(r'<(?P<prefix>[A-Za-z_][\w.-]*:)?score-partwise\b[^>]*>',xml)
    if not root:raise ValueError('缺少有效 MusicXML 根元素')
    prefix=root.group('prefix') or ''
    text=escape(str(title))
    tag=re.escape(prefix+'work-title')
    pattern=rf'<{tag}\b[^>]*>.*?</{tag}\s*>|<{tag}\b[^>]*/>'
    replacement=f'<{prefix}work-title>{text}</{prefix}work-title>'
    xml,count=re.subn(pattern,lambda match:replacement,xml,count=1,flags=re.S)
    if not count:
        work=re.search(rf'<{re.escape(prefix+"work")}(?=[\s>])[^>]*?(?<!/)>',xml)
        if work:
            end=xml.find(f'</{prefix}work>',work.end())
            number=re.search(rf'<{re.escape(prefix+"work-number")}(?=[\s/>])(?:[^>]*?/>|[^>]*>.*?</{re.escape(prefix+"work-number")}\s*>)',xml[work.end():end],re.S)
            position=work.end()+(number.end() if number else 0)
            xml=xml[:position]+replacement+xml[position:]
        else:
            empty=rf'<{re.escape(prefix+"work")}\b[^>]*/>'
            block=f'<{prefix}work>{replacement}</{prefix}work>'
            xml,count=re.subn(empty,lambda match:block,xml,count=1)
            if not count:xml=xml[:root.end()]+block+xml[root.end():]
    movement=re.escape(prefix+'movement-title')
    return re.sub(rf'<{movement}\b[^>]*>.*?</{movement}\s*>|<{movement}\b[^>]*/>',lambda match:f'<{prefix}movement-title>{text}</{prefix}movement-title>',xml,flags=re.S)
