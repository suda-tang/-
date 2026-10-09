"""把曲库里的作曲家交给 AI 归类到时期，缓存成 .sites-runtime/composer-periods.json。

为什么不用硬编码表
------------------
「巴洛克 / 古典 / 浪漫」这类判断是**音乐史语义**，不是谱面里能读出来的数据。
写死一张人名表必然漏人（曲库实测 186 个作曲家，从巴赫到周杰伦）。所以：
  · 谱面里能读出来的（声部/小节/音符/和弦）→ 本项目自己算（music_index）
  · 读不出来的语义（时期、色彩、和弦命名）→ **交给 AI**

用法：
    python scripts/build-composer-periods.py            # 只补没归类的
    python scripts/build-composer-periods.py --refresh  # 全部重新归类
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.sites-runtime' / 'composer-periods.json'
BROKER = 'http://127.0.0.1:8765/v1/chat/completions'
SITE = 'http://127.0.0.1:5173/api/scores'
LABELS = ('巴洛克', '古典', '浪漫', '印象', '现代', '流行', '民歌', '爵士', '影视', '未知')
BATCH = 40


def _opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def composers_from_library():
    """曲名形如 'BWV 1043 - 巴赫' / '... -Allegro - 舒伯特'，取最后一段当作曲家。"""
    data = json.loads(_opener().open(SITE, timeout=40).read())
    out = []
    for item in data.get('scores', []):
        title = str(item.get('title') or '')
        parts = [p.strip() for p in re.split(r'\s+-\s+|-\s*(?=[^-]{2,8}$)', title) if p.strip()]
        if len(parts) >= 2:
            last = parts[-1]
            if 1 <= len(last) <= 10 and not re.search(r'\d', last) and not re.search(r'\.(mp3|pdf)$', last, re.I):
                if last not in out:
                    out.append(last)
    return out


def ask_model(names):
    prompt = ('你是音乐史资料员。把下面每个作曲家/作者归入**一个**时期，只能从这些标签里选：'
              + ' / '.join(LABELS) + '。'
              '要求：只输出 JSON 对象，键与输入完全一致，值是标签，不要解释、不要 markdown 代码块。\n'
              + json.dumps(names, ensure_ascii=False))
    body = json.dumps({'model': 'suda-deepseek',
                       'messages': [{'role': 'user', 'content': prompt}],
                       'stream': False, 'max_tokens': 3000}).encode()
    req = urllib.request.Request(BROKER, data=body, headers={'Content-Type': 'application/json'})
    raw = _opener().open(req, timeout=300).read().decode('utf-8', 'replace')
    content = json.loads(raw)['choices'][0]['message']['content']
    start, end = content.find('{'), content.rfind('}')
    if start < 0 or end <= start:
        return {}
    try:
        data = json.loads(content[start:end + 1])
    except ValueError:
        return {}
    return {k: v for k, v in data.items() if isinstance(v, str)}


def main():
    refresh = '--refresh' in sys.argv
    names = composers_from_library()
    print('曲库作曲家 %d 个' % len(names), flush=True)
    cache = {}
    if OUT.exists() and not refresh:
        try:
            cache = json.loads(OUT.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            cache = {}
    todo = [n for n in names if n not in cache]
    if not todo:
        print('没有需要归类的（--refresh 可强制重来）')
        return
    print('需要归类 %d 个，分批交给 AI …' % len(todo), flush=True)
    done = 0
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        started = time.time()
        got = ask_model(chunk)
        for name in chunk:
            cache[name] = got.get(name) or '未知'
        done += len(chunk)
        print('  %d/%d  本批 %d 个用 %.1fs' % (done, len(todo), len(chunk), time.time() - started), flush=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding='utf-8')
    import collections
    print('已写入', OUT)
    print('分布:', collections.Counter(cache.values()).most_common())


if __name__ == '__main__':
    main()
