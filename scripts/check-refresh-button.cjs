// Bug1 回归探针：「刷新云曲库」按钮（.library-refresh）连点两次后必须能复位（disabled 回 false）。
// 死锁根因：reload() 早期把 `await transfer` 写在 try 之外，transfer 抛错则异常冲出函数、
// finally 永不执行 → reloading/refresh.disabled 永久卡 true → 按钮失灵只能整页刷新。
// 修复：await transfer 纳入 try 保护，finally + 外层 catch 双兜底复位。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const waitDisabledFalse=async(page,label,timeout=40000)=>{
  const start=Date.now();
  while(Date.now()-start<timeout){
    const disabled=await page.evaluate(()=>document.querySelector('.library-refresh')?.disabled);
    if(disabled===false)return;
    await page.waitForTimeout(300);
  }
  throw Error(label+': 刷新按钮 40s 内未复位（disabled 仍为 true，疑似死锁）');
};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:1360,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('.library-refresh',{timeout:15000});
  // 第一次刷新
  await page.click('.library-refresh');
  await waitDisabledFalse(page,'第一次刷新');
  const after1=await page.evaluate(()=>({disabled:document.querySelector('.library-refresh').disabled,ariaBusy:document.querySelector('#library-list')?.getAttribute('aria-busy')}));
  console.log('第一次刷新后：',after1);
  assert.equal(after1.disabled,false,'第一次刷新后按钮仍 disabled（死锁）');
  // 第二次刷新（连点）—— 死锁时 reloading 卡 true，这里会直接 early-return 且 disabled 不复位
  await page.waitForTimeout(300);
  await page.click('.library-refresh');
  await waitDisabledFalse(page,'第二次刷新');
  const after2=await page.evaluate(()=>document.querySelector('.library-refresh').disabled);
  console.log('第二次刷新后 disabled =',after2);
  assert.equal(after2,false,'第二次刷新后按钮仍 disabled（死锁复发）');
  assert.deepEqual(errors,[],'页面有 JS 报错: '+errors.join(' | '));
  console.log('PASS: Bug1 已修复 —— 刷新按钮连点后正常复位，不再死锁');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
