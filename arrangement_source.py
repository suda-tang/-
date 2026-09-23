"""Recover original notation for jobs produced by older running servers."""
import json
from pathlib import Path

def original_xml(data, request, runtime=None):
 if data.get('xml'):return data['xml']
 runtime=Path(runtime or Path(__file__).parent/'.sites-runtime')
 request=Path(request)
 manifest=request.with_name(request.name.replace('.input.json','.manifest.json'))
 digest=data.get('digest')
 if manifest.exists():digest=json.loads(manifest.read_text(encoding='utf-8')).get('digest')
 if not digest:
  for candidate in (runtime/'analysis').glob('*.inspect.json'):
   try:
    cached=json.loads(candidate.read_text(encoding='utf-8'))
    if cached.get('score',{}).get('events')==data['score']['events']:
     digest=candidate.name.removesuffix('.inspect.json');break
   except (OSError,ValueError):continue
 if digest:
  cached=runtime/'score-cache'/f'{digest}.json'
  if cached.exists():
   xml=json.loads(cached.read_text(encoding='utf-8')).get('xml')
   if xml:return xml
 raise ValueError('无法找到原始分声部乐谱，请重新导入原谱后生成；为保留钢琴左右手，已停止重建简化谱。')
