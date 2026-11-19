from pathlib import Path
from PIL import Image,ImageOps
root=Path(__file__).resolve().parents[1]
image=Image.open(root/'dist/suda-emblem.jpg').convert('RGB')
image=ImageOps.contain(image,(320,320),Image.Resampling.LANCZOS)
canvas=Image.new('RGB',(360,360),'white');canvas.paste(image,((360-image.width)//2,(360-image.height)//2))
target=root/'dist/assets/suda-share-20261021.jpg'
for quality in (88,82,76,70):
 canvas.save(target,'JPEG',quality=quality,optimize=True,progressive=False)
 if target.stat().st_size<32000:break
print(target.name,canvas.size,target.stat().st_size)
