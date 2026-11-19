from pathlib import Path
from PIL import Image
root=Path('dist')
for p in root.glob('suda*'):
 print(p.name,p.stat().st_size)
 if p.suffix=='.svg': print(p.read_text(encoding='utf8')[:250])
for p in root.rglob('*'):
 if p.is_file() and 'seal' in p.name and p.suffix in ('.png','.webp','.jpg'):
  try:
   image=Image.open(p)
   print(p,image.size,p.stat().st_size)
  except OSError:pass
