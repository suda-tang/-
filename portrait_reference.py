"""Authorized facial reference photos. Originals remain outside the public folder."""
import io, json, secrets, threading, time, re
from pathlib import Path
from urllib.parse import urlparse, unquote
import upload_auth

STORE=Path(__file__).resolve().parent/'.sites-runtime/portrait-reference'
LOCK=threading.Lock()
ANGLES={'front':'正面','left45':'左侧 45°','right45':'右侧 45°','left':'左侧面','right':'右侧面'}

def records():
    result=[]
    for path in STORE.glob('*.json'):
        try:result.append(json.loads(path.read_text(encoding='utf-8')))
        except (OSError,ValueError):pass
    return sorted(result,key=lambda r:r['created'],reverse=True)

def handle(handler):
    if not upload_auth.authorized(handler):
        handler.close_connection=True
        return handler.json_response({'error':'请先输入上传密码'},401)
    route=urlparse(handler.path).path
    if handler.command=='GET':
        if route=='/api/portrait-reference':
            latest={}
            for item in records():latest.setdefault(item['angle'],item)
            return handler.json_response({'photos':list(latest.values()),'savedAngles':len(latest),'totalAngles':5})
        match=re.fullmatch(r'/api/portrait-reference/([a-f0-9]{32})/image',route)
        if not match:return handler.json_response({'error':'照片不存在'},404)
        path=STORE/(match.group(1)+'.jpg')
        if not path.is_file():return handler.json_response({'error':'照片不存在'},404)
        body=path.read_bytes();handler.send_response(200);handler.send_header('Content-Type','image/jpeg');handler.send_header('Content-Length',str(len(body)));handler.send_header('Cache-Control','private, no-store');handler.end_headers();handler.wfile.write(body);return
    try:
        from PIL import Image,ImageOps,UnidentifiedImageError
        size=int(handler.headers.get('Content-Length','0'))
        if not 0<size<=20*1024*1024:
            handler.close_connection=True
            return handler.json_response({'error':'每张照片最大 20MB'},413)
        angle=handler.headers.get('X-Photo-Angle','')
        if angle not in ANGLES:raise ValueError('请选择照片角度')
        body=handler.rfile.read(size)
        if len(body)!=size:raise ValueError('上传中断，请重试')
        try:
            image=Image.open(io.BytesIO(body))
            if image.format not in {'JPEG','PNG','WEBP'}:raise ValueError('请上传 JPG、PNG 或 WebP 原图')
            if image.width*image.height>45000000:raise ValueError('照片尺寸过大，请控制在 4500 万像素以内')
            image=ImageOps.exif_transpose(image);image.load();image=image.convert('RGB')
        except (UnidentifiedImageError,OSError):raise ValueError('图片无法读取，请重新选择 JPG 或 PNG 原图')
        identifier=secrets.token_hex(16)
        meta={'id':identifier,'angle':angle,'angleLabel':ANGLES[angle],'name':unquote(handler.headers.get('X-Photo-Name','照片'))[:200],'width':image.width,'height':image.height,'bytes':size,'created':time.time(),'preview':f'/api/portrait-reference/{identifier}/image','status':'照片已保存，待面部重建'}
        with LOCK:
            STORE.mkdir(parents=True,exist_ok=True)
            (STORE/(identifier+'.original')).write_bytes(body)
            image.save(STORE/(identifier+'.jpg'),'JPEG',quality=97,subsampling=0)
            (STORE/(identifier+'.json')).write_text(json.dumps(meta,ensure_ascii=False),encoding='utf-8')
        return handler.json_response(meta,201)
    except (ValueError,Image.DecompressionBombError) as error:
        return handler.json_response({'error':str(error)},400)
