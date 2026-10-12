from pathlib import Path
p=Path('scripts/audit-ai-live-dialogue.cjs')
s=p.read_text(encoding='utf-8')
start=s.index('const turns=');end=s.index('if(process.env.AUDIT_TURNS)')
s=s[:start]+'''const turns=[
 ['帮我找一首巴洛克时期的德国作曲家的音乐，找出这个曲子的所有减七和弦。',{}],
 ['先列出符合条件的本地作品，不要播放。',{}],
 ['打开第一首，先不要播放。',{}],
 ['找出这首曲子所有减七和弦，给出小节和拍的位置。',{}],
 ['只分析钢琴声部，半减七不要混进来。',{}],
 ['刚才的减七和弦和半减七有什么区别？',{}],
 ['列出这首曲子实际有哪些乐器，先不要播放。',{}],
 ['只分析前四小节的减七和弦。',{}],
 ['先暂停，保持当前位置。',{playing:false}],
 ['联网找一下《卡农》的钢琴谱，只展示候选链接，不要导入。',{}]];
'''+s[end:]
s=s.replace("proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}",'')
s=s.replace('ai-musician-live-2026-10-11.jsonl','ai-contextual-2026-10-11.jsonl')
Path('scripts/audit-ai-contextual.cjs').write_text(s,encoding='utf-8')
