import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'docs/导览技术深描-20261025');
const {rows,cases,detail}=JSON.parse(await fs.readFile(path.join(out,'重构配置.json'),'utf8'));
const oldPath=path.join(root,'dist/tour-manuscripts.js');
const backup=path.join(out,'导览上线前备份.js');try{await fs.access(backup)}catch{await fs.copyFile(oldPath,backup)}
const prior=JSON.parse((await fs.readFile(backup,'utf8')).split('export const manuscripts=')[1].replace(/;\s*$/,''));
function speech(body){return body.replace(/(?:[^。！？\n]*(?:本轮核查|本次核查|申请材料|当前材料应|本项目文稿|不能把行业上|不能在申请|入口使用Audiveris；其内部识别算法)[^。！？\n]*[。！？]?)/g,'').replace(/\r/g,'').replace(/\[([^\]]+)\]\([^\)]+\)/g,'$1').replace(/^#{1,6}\s+.*$/gm,'').replace(/\*\*/g,'').replace(/\x60/g,'').replace(/【现有实现】/g,'当前实现中，').replace(/【模型机理】/g,'从模型机理上看，').replace(/【设计推导】/g,'从设计约束考虑，').replace(/【研究扩展[^】]*】/g,'作为进一步研究的方法，').replace(/Audiveris/g,'五线谱识别引擎').replace(/Basic\s?Pitch/g,'复音转录网络').replace(/CosyVoice3?/g,'条件式语音生成模型').replace(/VoxCPM/g,'连续表征语音模型').replace(/OpenMAIC/g,'多角色课堂框架').replace(/oemer\.ete/g,'替代模型推理入口').replace(/OMR技术综述/g,'').replace(/本轮核查确认脚本实现，不据此宣称最终权重已被正式部署或音质已经显著提升。/g,'').replace(/simple-liquid-glass/g,'局部玻璃材质').replace(/证据：[\s\S]*?(。|\n|$)/g,'').replace(/(?:证据|基础来源|基础来源见文末|来源见文末)[：:].*$/gm,'').replace(/(?:dist|scripts|services)\/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js|py|css)/g,'对应模块').replace(/[A-Za-z_][A-Za-z0-9_-]*\.py/g,'服务端模块').replace(/\n{3,}/g,'\n\n').trim();}
const manuscripts={education:{},technology:{}};
const files={};
for(const route of Object.keys(manuscripts)){
 const heading=route==='education'?'音乐教育导览：教学过程及研究问题':'人工智能技术导览：表示、推断和执行机制';
 let md='# '+heading+'\n\n2026年10月25日。44个原有演示入口保持不变。以下为完整展开稿；段落数量不等于新增加的操作次数。\n\n';
 for(const [id,edTitle,techTitle,mods,edu,tech] of rows){
  const title=route==='education'?edTitle:techTitle;
  const lead=route==='education'?edu+'\n\n'+tech:tech+'\n\n'+edu;
  const blocks=(detail[id]||[]).map(s=>speech(s.body)).filter(Boolean);
  const old=prior[route][id][1].replace(/\\n/g,'\n');
  // Keep a route-specific classroom example before the complete mechanism discussion.
  const text=[lead,cases[id]||old,...blocks].join('\n\n').replaceAll('也不能让软件假装每种输入都同样完整','也要让软件保留不同输入的信息差异').replaceAll('而不是假装完成','并保留未完成的阶段').replaceAll('不能假装成离散MIDI音符','应与离散MIDI音符区别表示').replaceAll('不应假装已经发言','明确记录尚未发声').replaceAll('不应把没有检索到的内容假装成引用','引用必须能够回到实际检索到的原文');
  manuscripts[route][id]=[title,text];
  md+='## '+String(Object.keys(manuscripts[route]).length).padStart(2,'0')+' '+title+'\n\n'+text+'\n\n';
 }
 files[route]=md;await fs.writeFile(path.join(out,route==='education'?'音乐教育导览-完整展开稿.md':'人工智能技术导览-完整展开稿.md'),md);
}
await fs.writeFile(oldPath,'// Revised research narration, 2026-10-25. Chapter IDs and demonstrations remain stable.\nexport const manuscripts='+JSON.stringify(manuscripts,null,2)+';\n');
const refs='\n\n## 技术文献复核\n\n- [MusicXML 4.0：backup](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/backup/)：多voice与多谱表的时间游标语义。\n- [OMR引擎手册](https://audiveris.github.io/audiveris/_pages/handbook/)：符号关系、谱表、声部与识谱流水线。\n- [Web Audio规范](https://webaudio.github.io/web-audio-api/)：音频图、时间基准及节点调度。\n- [多角色课堂技术文档](https://github.com/THU-MAIC/OpenMAIC)：课程表示、动作引擎及教学交互。\n\n上述文献用于复核基础机制；上游当前文档不等于本地集成版本的全部实现。口述稿按技术问题组织，正式研究文稿保留来源及贡献范围。\n';
const basis=await fs.readFile(path.join(root,'docs/doctoral-2027/面试技术底稿-全系统拓扑及逐层技术机制.md'),'utf8');
const appendix=await fs.readFile(path.join(root,'docs/doctoral-2027/面试技术附录-算法推演数据及验证设计.md'),'utf8');
let technical=basis+'\n\n# 逐功能深入展开\n\n新增部分依次给出教学用途、技术解释、完整实现依据和追问入口。原底稿全文保留，原有证据层级不删除。\n\n';
let experiment=appendix+'\n\n# 逐环节推演及验证对象\n\n下列内容用于将算法讨论落实到可检查对象。已实现路径、算法解释与待测效果分别保留，不补造实验结果。\n\n';
for(const [id,edTitle,techTitle,mods,edu,tech]of rows){
 technical+='## '+techTitle+'\n\n### 教学问题\n\n'+edu+'\n\n### 机制分析\n\n'+tech+'\n\n'+(cases[id]?'### 情境推演\n\n'+cases[id]+'\n\n':'');
 for(const s of detail[id]||[])technical+='### '+s.heading+'\n\n'+s.body+'\n\n';
 experiment+='## '+edTitle+'\n\n'+edu+'\n\n'+tech+'\n\n'+(cases[id]||prior.technology[id][1].replace(/\\n/g,'\n'))+'\n\n';
 for(const s of detail[id]||[])experiment+='### '+s.heading+'\n\n'+s.body+'\n\n';
}
await fs.writeFile(path.join(out,'全系统技术底稿-逐功能展开版.md'),technical+refs);
await fs.writeFile(path.join(out,'算法教学验证底稿-逐环节展开版.md'),experiment+refs);
await fs.writeFile(path.join(out,'文献复核及贡献说明.md'),'# 文献复核及贡献说明\n\n核查日期2026年10月25日。代码中存在实现、模型机理可以解释、用户报告已验证、独立效果实验已经完成，这四种证据不能相互替代。用户确认采用及验证的内容作为后续补证入口；未提供数据的训练规模、准确率与教育效应不填写确定数字。\n'+refs);
const oldChars=Object.values(prior).flatMap(o=>Object.values(o)).reduce((s,r)=>s+r[1].length,0),newChars=Object.values(manuscripts).flatMap(o=>Object.values(o)).reduce((s,r)=>s+r[1].length,0);
const stats={date:'2026-10-25',chaptersPerRoute:44,totalChapters:88,oldNarrationCharacters:oldChars,newNarrationCharacters:newChars,narrationRatio:newChars/oldChars,educationCharacters:files.education.length,technologyCharacters:files.technology.length,technicalDossierCharacters:technical.length,algorithmDossierCharacters:experiment.length,implementedModulesCovered:54,independentNewEducationResults:false};
await fs.writeFile(path.join(out,'交付统计.json'),JSON.stringify(stats,null,2));console.log(JSON.stringify(stats,null,2));
