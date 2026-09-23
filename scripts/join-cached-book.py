import sys,hashlib,shutil
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from score_book import join_scores

digest='5fc04bdf322b6d852b8ee68cab4c794152b8bfea37ca39f49ccf3d7374e5e68b'
ids=[digest]+[hashlib.sha256(f'{digest}:movement:{i}'.encode()).hexdigest() for i in range(2,8)]
items=[server.read_cached_score(i) for i in ids]
if items[0].get('metadata',{}).get('joined'):print('Already joined');sys.exit(0)
assert all(items),'Missing a movement; refusing partial join'
backup=server.ROOT/'.sites-runtime'/'book-originals'/digest;backup.mkdir(parents=True,exist_ok=True)
for i in ids:shutil.copy2(server.cache_path(i),backup/(i+'.json'))
title='被遗忘的六首抒情曲上半场'
xml=join_scores([x['xml'] for x in items],title)
server.write_cached_score(digest,xml,{'title':title,'ocrTitle':title,'joined':'true','source':'recognition'})
for i,item in zip(ids[1:],items[1:]):server.write_cached_score(i,item['xml'],{**item['metadata'],'hiddenFromLibrary':True})
print('Joined seven movements; original files backed up')
