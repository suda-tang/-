"""Match numbered classical works without conflating No.9 and No.94."""
import re

def numbered_work(text):
    genre=r'(交响曲|协奏曲|奏鸣曲|symphony|concerto|sonata)'
    numbers=r'([0-9一二三四五六七八九十百]+)'
    m=re.search(r'第?'+numbers+r'\s*'+genre,text,re.I)
    if m:number,kind=m[1],m[2]
    else:
        m=re.search(genre+r'\s*(?:no\.?|number|第)?\s*'+numbers+r'(?![0-9])',text,re.I)
        if not m:return None
        kind,number=m[1],m[2]
    from ai_workspace import chinese_number
    number=int(number) if number.isdigit() else chinese_number(number)
    kind={'交响曲':'symphony','协奏曲':'concerto','奏鸣曲':'sonata'}.get(kind.lower(),kind.lower())
    return kind,number

def numbered_title_matches(query,title):
    work=numbered_work(query)
    if not work or work!=numbered_work(title):return False
    for zh,en in [('贝多芬','beethoven'),('德沃夏克','dvorak'),('马勒','mahler'),('舒伯特','schubert'),('海顿','haydn'),('莫扎特','mozart'),('肖斯塔科维奇','shostakovich')]:
        if (zh in query or en in query.lower()) and not (zh in title or en in title.lower()):return False
    return True
