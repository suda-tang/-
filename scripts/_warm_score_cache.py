"""离线预热曲库列表缓存：读一遍全部谱面文件，把列表项存进
.sites-runtime/score-list-cache.json。这样服务重启后首次 /api/scores 直接命中磁盘缓存，
不用重新读 4.4 GB 的大文件（否则 40~60s 把请求拖到超时）。
"""
import time, re, importlib.util, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server
from server import CACHE_DIR
import background_jobs

t0=time.time()
ids={p.stem for p in CACHE_DIR.glob('*.json')} | {p.stem for p in CACHE_DIR.glob('*.pdf')} \
    | {p.stem for p in CACHE_DIR.glob('*.source')} \
    | {p.name.removesuffix('.photo-book.json') for p in CACHE_DIR.glob('*.photo-book.json')}
digests=[d for d in ids if re.fullmatch(r'[a-f0-9]{64}', d)]
print('待预热 digest 数:', len(digests), flush=True)

job_by_digest=background_jobs.latest_jobs_by_digest()
n=0; ok=0; hidden=0
for d in digests:
    try:
        it=server._score_list_item(d, job_by_digest.get(d))
        n+=1
        if it is None: hidden+=1
        else: ok+=1
    except Exception as e:
        print('  ERR', d[:8], repr(e)[:80], flush=True)
print('构建完成: 总=%d 有项=%d 隐藏=%d 耗时 %.1fs'%(n, ok, hidden, time.time()-t0), flush=True)
server._score_list_cache_save()
print('缓存已落盘:', server.SCORE_LIST_CACHE_PATH, '大小 %.2f MB'%(
    server.SCORE_LIST_CACHE_PATH.stat().st_size/1024/1024), flush=True)
