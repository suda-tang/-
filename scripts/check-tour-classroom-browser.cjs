const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1360,height:900}});
 await page.goto('http://127.0.0.1:5173');
 await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:90000});
 await page.locator('#sample-button').evaluate(el=>el.click());
 await page.waitForFunction(()=>!document.getElementById('start-button').disabled);
 const state=await page.evaluate(async()=>{
  const {runTourDemo}=await import('/tour-demonstrations.js');
  const receipt=await runTourDemo('classroom-configure');
  const state=await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-classroom-command',{detail:{value:{operation:'status'},resolve,reject}})));
  return {receipt,state};
 });
 assert.equal(state.state.settings.mode,'classroom');assert.equal(state.state.settings.schoolStage,'senior');
 assert.equal(state.state.settings.scope,'whole');assert.equal(state.state.settings.duration,40);
 assert.match(state.state.settings.goal,/音乐鉴赏/);assert.match(state.receipt,/尚未|没有假装/);
 console.log('PASS real sample score → guide demonstration → classroom settings and status; no course generation requested');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
