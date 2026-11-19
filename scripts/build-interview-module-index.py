"""Build a source-only interview index; never exports private runtime material."""
from pathlib import Path
import ast,csv,hashlib,json,re

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/doctoral-2027'
files=sorted(set(list(ROOT.glob('*.py'))+list((ROOT/'dist').glob('*.js'))+list((ROOT/'services/openmaic').glob('*.mjs'))+[
 ROOT/'scripts'/name for name in ['prepare_voice_dataset.py','train-mentor-acoustic-adapter.py','train-mentor-full-acoustic.py','train-voxcpm-mentor-lora.py','render-performance.py','transcribe-media.py']
 if (ROOT/'scripts'/name).exists()
]))
rows=[]
for p in files:
 raw=p.read_bytes();text=raw.decode('utf-8-sig',errors='replace');symbols=[];imports=[]
 if p.suffix=='.py':
  try:
   tree=ast.parse(text)
   for n in tree.body:
    if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef)):symbols.append(f'{n.name}:{n.lineno}')
    elif isinstance(n,ast.Import):imports.extend(x.name for x in n.names)
    elif isinstance(n,ast.ImportFrom):imports.append(n.module or '')
  except SyntaxError: symbols=['AST_PARSE_FAILED']
 else:
  for i,line in enumerate(text.splitlines(),1):
   for m in re.finditer(r'\b(?:async\s+)?function\s+([\w$]+)|\bclass\s+([\w$]+)',line):symbols.append(f'{m.group(1) or m.group(2)}:{i}')
  imports=re.findall(r'''\bfrom\s*['"]([^'"]+)['"]''',text)
 rows.append(dict(file=p.relative_to(ROOT).as_posix(),lines=len(text.splitlines()),bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),symbols='; '.join(symbols),imports='; '.join(dict.fromkeys(imports))))
with (OUT/'面试核查-模块函数与文件指纹.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
md=['# 面试技术核查：源码入口索引','','自动生成于2026-10-24。范围为根目录Python、dist顶层JS、课堂集成MJS及选定训练脚本。列出符号不代表已逐行审计或通过运行测试。CSV保留完整SHA-256与导入信息；此索引不读取或发布原始私人素材。','',f'共 {len(rows)} 个源码文件，{sum(r["lines"] for r in rows):,} 行。','']
for r in rows:
 md += [f'## {r["file"]}', '',f'{r["lines"]} 行；SHA-256：`{r["sha256"][:16]}`。','',r['symbols'] or '未提取到命名函数；可能使用箭头函数、类字段或导入式组织。','']
(OUT/'面试核查-模块函数索引.md').write_text('\n'.join(md),encoding='utf-8')
main=OUT/'面试技术底稿-全系统拓扑及逐层技术机制.md'
s=main.read_text(encoding='utf-8')
print(json.dumps({'indexedFiles':len(rows),'sourceLines':sum(r['lines'] for r in rows),'mainCharacters':len(s),'mainChineseCharacters':len(re.findall(r'[\u4e00-\u9fff]',s)),'mermaidDiagrams':s.count('```mermaid'),'mainSections':len(re.findall(r'^## ',s,re.M))},ensure_ascii=False))
