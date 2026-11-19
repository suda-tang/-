import sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from share_metadata import render
path=root/'dist/index.html'
path.write_text(render(path.read_text(encoding='utf8'),'/', 'https://suzhou.super-tang.com'),encoding='utf8')
print('Default share metadata added to static entry')
