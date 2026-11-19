from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
folder=root/'docs/doctoral-2027'
names=['面试技术底稿-全系统拓扑及逐层技术机制.md','面试技术附录-算法推演数据及验证设计.md','面试核查-模块函数索引.md']
stats=[]
for name in names:
 text=(folder/name).read_text(encoding='utf-8')
 assert '\ufffd' not in text,name
 assert text.count('```')%2==0,name
 stats.append({'name':name,'characters':len(text),'headings':len(re.findall(r'^#{1,3} ',text,re.M)),'diagrams':text.count('```mermaid')})
main=(folder/names[0]).read_text(encoding='utf-8')
required=['云曲库','分类','联网','OCR','OMR','透视','摩尔纹','光照','页弯','低分辨率','歪斜','符杠','临时记号','LoRA','半监督','声部','数字人','WebAssembly','人声','指法','任务','272.06','production=False']
assert all(x in main for x in required),[x for x in required if x not in main]
manifest=folder/'面试材料阅读顺序-20261024.md'
manifest.write_text('''# 面试材料阅读顺序

更新：2026年10月24日。用于2026年10月27日上海大学面试准备。

1. [全系统拓扑及逐层技术机制](面试技术底稿-全系统拓扑及逐层技术机制.md)：本次新写的主底稿，先读系统图，再按需要深入模块。
2. [算法推演、数据及验证设计](面试技术附录-算法推演数据及验证设计.md)：拍号空拍、OCR标题、音乐事实检索、语音训练、内存预算及教育实验的推演。
3. [模块函数索引](面试核查-模块函数索引.md)：查源码入口和行号；[CSV文件指纹](面试核查-模块函数与文件指纹.csv)供版本核对。
4. [此前面试准备稿](上海大学邹宗峰面试准备-20261027.md)：保留原有开场、汇报安排及导师信息；技术深度以本次两份底稿为准。

本次材料没有替换历史申请信、论文或六万字技术说明，也没有改变网站功能。当前实现、基础模型机理、设计推导和研究扩展已分开标记；尚无证据的训练、实验及新算法不写成既成成果。
''',encoding='utf-8')
old=folder/'上海大学邹宗峰面试准备-20261027.md'
if old.exists():
 text=old.read_text(encoding='utf-8')
 notice='> 2026-10-24补充：技术详解请先阅读[新版全系统技术底稿](面试技术底稿-全系统拓扑及逐层技术机制.md)及[算法附录](面试技术附录-算法推演数据及验证设计.md)。本文件保留口头汇报安排。\n\n'
 if notice not in text:old.write_text(notice+text,encoding='utf-8')
print(json.dumps({'verified':True,'documents':stats,'totalTechnicalCharacters':sum(x['characters'] for x in stats[:2])},ensure_ascii=False))
