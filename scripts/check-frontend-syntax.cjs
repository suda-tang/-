// 前端脚本语法体检。
// 为什么需要它：dist/*.js 是 ES module，任何一个文件语法错，都会让整条 import 链
// 静默失败 —— 表现不是报错弹窗，而是工作区永远不初始化（workspace-ready 不来），
// 启动进度条停在 creep 的上限 92% 不动，看着像"服务挂了"。
// 2026-10-02 就是这个原因（narration-opening.js 少写一个 }）导致整站打不开。
// 这个脚本几秒出结果，比启浏览器快得多，建议在跑浏览器类 check 之前先跑它。
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..','dist');
const targets=[];
for(const name of fs.readdirSync(root)){
  if(/\.(js|mjs)$/.test(name))targets.push(path.join(root,name));
}
const vendor=path.join(root,'vendor');
if(fs.existsSync(vendor))for(const name of fs.readdirSync(vendor)){
  if(/\.(js|mjs)$/.test(name))targets.push(path.join(vendor,name));
}

const bad=[];
for(const file of targets.sort()){
  try{
    execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
  }catch(error){
    const out=(error.stderr||Buffer.from('')).toString().split('\n').slice(0,4).join('\n');
    bad.push(path.relative(root,file)+'\n'+out);
  }
}

if(bad.length){
  console.error('✗ 语法错误（会导致整站无法初始化）：\n\n'+bad.join('\n\n'));
  process.exitCode=1;
}else{
  console.log('PASS 前端脚本语法检查（'+targets.length+' 个文件）');
}
