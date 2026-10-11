"""量化「精简 XML」的空间：把 18MB 的曲谱 XML 拆开，统计各类元素占比。"""
import urllib.request, json, pathlib, re, collections

DIGEST = '291e591bee825433f1b9960df9ffe77a099bd58acfc2fe4404fc49070c7059d3'
CACHE = pathlib.Path('/tmp/score-xml.txt') if pathlib.Path('/tmp').exists() else pathlib.Path('_score-xml.txt')
if not CACHE.exists():
    url = 'http://127.0.0.1:5173/api/scores/' + DIGEST
    data = json.loads(urllib.request.urlopen(url, timeout=300).read())
    CACHE.write_text(data['xml'], encoding='utf-8')
xml = CACHE.read_text(encoding='utf-8')
tot = len(xml)
print(f'XML 总长 {tot/1048576:.2f} MB')

# 用 split 一次性切出 note 元素（比 re.findall 快得多）
parts = xml.split('<note')
print(f'<note 出现 {len(parts)-1} 次')
rest_bytes = pitch_bytes = 0
rests = pitched = 0
for chunk in parts[1:]:
    end = chunk.find('</note>')
    body = chunk if end < 0 else chunk[:end]
    n = len(body) + 5
    if '<rest' in body:
        rests += 1; rest_bytes += n
    elif '<pitch' in body:
        pitched += 1; pitch_bytes += n
print(f'  休止符 {rests} 个，占 {rest_bytes/1048576:.2f} MB（{rest_bytes/tot*100:.0f}%）')
print(f'  有音高 {pitched} 个，占 {pitch_bytes/1048576:.2f} MB（{pitch_bytes/tot*100:.0f}%）')

# 其它元素用 count 统计出现次数，再抽样估长度
for tag in ['direction', 'print', 'defaults', 'lyric', 'slur', 'tied', 'tie', 'beam', 'notations', 'backup', 'forward', 'attributes', 'measure']:
    c = xml.count('<' + tag)
    print(f'  <{tag}> 出现 {c} 次')

# 一个「只保留必要信息」的粗估：有音高 note + measure 骨架 + 声部头
print(f'\n粗估：若只保留有音高音符（{pitch_bytes/1048576:.1f} MB）+ 小节/声部骨架，'
      f'文档可望从 {tot/1048576:.1f} MB 降到约 {(pitch_bytes + 45724*60 + 28*200)/1048576:.1f} MB')
