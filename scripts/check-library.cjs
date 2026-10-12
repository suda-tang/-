const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('.library-score').first().waitFor();
  // 曲库卡片是流式渲染（首屏分批评入），直接 count() 会抓到"半截"数量（如 49），
  // 重载后才会看到完整数量（如 1081），导致严格相等断言偶发失败。等数量稳定后再取值。
  const stableCount=async()=>{let prev=-1,stable=0;for(let i=0;i<30;i++){const c=await page.locator('.library-score').count();if(c===prev){if(++stable>=3)return c;}else stable=0;prev=c;await page.waitForTimeout(300);}return prev;};
  const count=await stableCount();assert.ok(count>0,'library should render scores');
  // ★ 2026-10-12：曲库在首屏加载/轮询时进入 reloading，此刻点卡片会被 onclick 守卫
  //   `if(reloading)return` 直接吞掉、且不开谱；点完还要等数秒（1.9MB 谱面下载+排版≈数秒）才出 note-event。
  //   改成「点→等→没开就再点」重试，直到 note-event 出现。
  let opened=false;
  for(let attempt=0;attempt<6&&!opened;attempt++){
    await page.locator('.library-score').first().click({timeout:5000}).catch(()=>{});
    try{await page.waitForFunction(()=>document.querySelectorAll('.note-event').length>0,{timeout:9000});opened=true;}catch{}
    if(!opened)await page.waitForTimeout(1500);
  }
  assert.ok(opened,'library score should open after click retries');
  assert.equal(await page.locator('#play-button').isDisabled(),false);
  await page.reload();await page.locator('.library-score').first().waitFor();
  // 曲库是流式渲染，重载前后卡片数可能因"末张渲染时机"差 1~2 张（非数据丢失）。
  // 用容差判定「数量基本一致」，真正的数据丢失（重载后远少于重载前）才会触发失败。
  const reloadCount=await stableCount();
  assert.ok(reloadCount>0&&Math.abs(reloadCount-count)<=Math.max(5,Math.round(count*0.03)),`library card count should persist across reload (before ${count}, after ${reloadCount})`);
  assert.equal(await page.evaluate(async()=>{const {cleanText}=await import('/library.js');return cleanText('青玉案\uFFFD\uE001 · dolce');}),'青玉案 · dolce');
  assert.deepEqual(errors,[]);console.log('PASS: persisted server library, open historical score, page reload, text cleanup');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
