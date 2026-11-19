import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createTourCopy} from '../dist/tour-copy.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'docs','导览文案人工修改-20261024');
fs.mkdirSync(out,{recursive:true});
const baseline={exportedAt:new Date().toISOString(),source:'dist/tour-manuscripts.js',sourceHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist/tour-manuscripts.js'))).digest('hex'),routes:{}};
for(const [route,label] of [['education','音乐教育导向'],['technology','AI技术计算机导向']]){
 const steps=createTourCopy(route);
 if(steps.length!==44||new Set(steps.map(s=>s.id)).size!==44)throw Error('Expected 44 unique chapters: '+route);
 baseline.routes[route]=steps.map((s,i)=>({number:i+1,id:s.id,title:s[2],text:s[3]}));
 const intro=`# ${label}｜44个环节修改稿\n\n这是当前网页实际使用的中文标题和正文，按本路线播放顺序导出，不含前面的导师数字人讲稿。\n\n请直接修改各节标题和正文。保留编号和“<!-- chapter:… -->”这一行，便于准确导入；不需要修改的段落保持原样。两条路线可以分别修改。\n\n`;
 const content=baseline.routes[route].map(s=>`<!-- chapter:${s.id} -->\n## ${String(s.number).padStart(2,'0')}｜${s.title}\n\n${s.text.trimEnd()}\n`).join('\n');
 fs.writeFileSync(path.join(out,`${label}-44环节.md`),'\ufeff'+intro+content,'utf8');
 fs.writeFileSync(path.join(out,`${label}-44环节.txt`),'\ufeff'+intro+content,'utf8');
 const reread=fs.readFileSync(path.join(out,`${label}-44环节.md`),'utf8');
 const parsed=[...reread.matchAll(/<!-- chapter:([^\s]+) -->\s*\n## (\d+)｜([^\n]+)\n\n([\s\S]*?)(?=\n<!-- chapter:|$)/g)];
 if(parsed.length!==44)throw Error('Round-trip count mismatch: '+route);
 parsed.forEach((m,i)=>{const row=baseline.routes[route][i];if(m[1]!==row.id||Number(m[2])!==row.number||m[3]!==row.title||m[4].trimEnd()!==row.text.trimEnd())throw Error('Round-trip mismatch: '+route+'/'+row.id);});
}
fs.writeFileSync(path.join(out,'导出原始数据-请勿修改.json'),JSON.stringify(baseline,null,2)+'\n');
fs.writeFileSync(path.join(out,'修改说明.txt'),'\ufeff你只需修改对应路线的 .md 或 .txt，二选一，不必两个都改。\n标题和正文都可以重写，可增减段落；请保留每节编号及 chapter 标识，不新增或删除环节。\n两条路线各44节，顺序不同，内容也不同；想改两条就分别改。\n改好后把文件发回，我会按固定ID导入，不改动按钮、演示动作及页面布局。\n本次仅导出，网站上的文案没有改变。\n原始JSON用于备份、核对和防止覆盖后续修改，请勿修改。\n');
console.log(JSON.stringify({directory:out,routes:Object.fromEntries(Object.entries(baseline.routes).map(([k,v])=>[k,v.length]))}));
