// 把 _musician-result.jsonl 汇总成 Markdown 报告（按 id 取最后一次 = 重试后的结果）。
// 用法：node scripts/ai-musician-report.cjs
const fs=require('node:fs');
const path=require('node:path');
const CASES=require('./ai-musician-cases.cjs');
const OUT=path.join(__dirname,'_musician-result.jsonl');
const MD=path.join(__dirname,'..','TEST-REPORT-MUSICIAN.md');

const byId=new Map();
for(const line of fs.readFileSync(OUT,'utf8').trim().split('\n')){
  if(!line.trim())continue;
  try{const r=JSON.parse(line);byId.set(r.id,r);}catch(e){}
}
const rows=[...byId.values()].sort((a,b)=>a.id-b.id);
const stat={PASS:0,FAIL:0,ERROR:0};
const tier={};
const fails=[];
for(const r of rows){
  stat[r.status]=(stat[r.status]||0)+1;
  const c=CASES.find(x=>x.id===r.id)||{};
  const t=c.tier||'?';
  tier[t]=tier[t]||{PASS:0,total:0};tier[t].total++;if(r.status==='PASS')tier[t].PASS++;
  if(r.status!=='PASS')fails.push({r,c});
}
let md='# 音乐家级 100 条复杂任务 · AI 闭环能力测试报告\n\n';
md+='> 执行器：`scripts/check-ai-longflow.cjs --cases ./ai-musician-cases.cjs --retry 2`（真实浏览器链路，失败自动重跑 2 次隔离上游噪声）\n';
md+='> 用例集：`scripts/ai-musician-cases.cjs`（100 条）\n\n';
md+='## 总览\n\n';
md+=`- 通过 **${stat.PASS}/${rows.length}**（FAIL ${stat.FAIL||0} / ERROR ${stat.ERROR||0}）\n`;
md+='- 分档：'+Object.entries(tier).map(([k,v])=>`${k} ${v.PASS}/${v.total}`).join('、')+'\n\n';
if(fails.length){
  md+='## 未通过用例\n\n';
  for(const {r,c} of fails){
    md+=`### [${r.id}] ${c.name||''}（${c.tier||''}）\n`;
    md+=`- 指令：\`${Array.isArray(c.say)?c.say.join(' → '):c.say}\`\n`;
    md+=`- 结果：**${r.status}**\n`;
    for(const f of (r.fails||[]))md+=`  - ${f}\n`;
    if(r.reply)md+=`- 回复：${String(r.reply).replace(/\n/g,' ').slice(0,200)}\n`;
    md+='\n';
  }
}
md+='## 全部用例结果\n\n| # | 结果 | 名称 | 档 | 耗时 |\n|---|---|---|---|---|\n';
for(const r of rows){const c=CASES.find(x=>x.id===r.id)||{};md+=`| ${r.id} | ${r.status} | ${(c.name||'').replace(/\|/g,'/')} | ${c.tier||''} | ${((r.ms||0)/1000).toFixed(0)}s |\n`;}
fs.writeFileSync(MD,md,{encoding:'utf-8'});
console.log('报告已写出：'+MD);
console.log(`通过 ${stat.PASS}/${rows.length}  FAIL ${stat.FAIL||0}  ERROR ${stat.ERROR||0}`);
