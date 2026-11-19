"""Personalised preview metadata in the original HTTP response, without JS."""
import hashlib
import html
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT=Path(__file__).resolve().parent

def render(source, request_path, origin):
    params=parse_qs(urlparse(request_path).query)
    clean=lambda value,limit:re.sub(r'[\x00-\x1f]', '', value).strip()[:limit]
    mentor=clean(params.get('mentor',[''])[0],50)
    institution=clean(params.get('institution',[''])[0],100)
    title='唐秋鸣课题设计实例'
    description='｜'.join(filter(None,[institution,mentor+'老师' if mentor else '', '苏州大学钢琴演奏教学辅助系统']))
    image='/assets/suda-share-20261021.jpg'
    digest=hashlib.sha256(re.sub(r'\s+','',institution).encode()).hexdigest()[:24]
    try:
        record=json.loads((ROOT/'dist/institution-logos'/ (digest+'.json')).read_text(encoding='utf-8'))
        candidate=record.get('url','').split('?')[0]
        if record.get('institution')==institution and candidate.startswith('/institution-logos/') and (ROOT/'dist'/candidate.lstrip('/')).is_file():image=candidate
    except (OSError,ValueError):pass
    escape=lambda value:html.escape(value,quote=True)
    # Remove defaults before adding personalised tags. Crawlers commonly keep
    # the first image tag, which must not override a visitor's school emblem.
    source=re.sub(r'<meta\b[^>]*(?:property|name)=["\'](?:og:|twitter:)[^"\']*["\'][^>]*>','',source,flags=re.I)
    source=re.sub(r'<link\b[^>]*rel=["\']image_src["\'][^>]*>','',source,flags=re.I)
    tags={'og:type':'website','og:title':title,'og:description':description,'og:image':origin+image,'og:image:alt':'校徽','og:url':origin+request_path,'og:site_name':'苏州大学钢琴演奏教学辅助系统'}
    if image.endswith('.jpg'):tags['og:image:type']='image/jpeg'
    if image=='/assets/suda-share-20261021.jpg':tags.update({'og:image:width':'360','og:image:height':'360'})
    metadata=''.join(f'<meta property="{key}" content="{escape(value)}">' for key,value in tags.items())
    metadata+=f'<meta name="twitter:card" content="summary"><meta name="twitter:title" content="{escape(title)}"><meta name="twitter:description" content="{escape(description)}"><meta name="twitter:image" content="{escape(origin+image)}"><link rel="image_src" href="{escape(origin+image)}">'
    source=re.sub(r'<meta name="description"[^>]*>',f'<meta name="description" content="{escape(description)}">',source,count=1)
    charset='<meta charset="utf-8">'
    return source.replace(charset,charset+metadata,1) if charset in source else source.replace('</head>',metadata+'</head>',1)
