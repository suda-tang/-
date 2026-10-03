const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:844},reducedMotion:width===390?'reduce':'no-preference'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.sudaLanguage&&document.querySelector('.workspace-nav'));
   await page.waitForFunction(()=>!document.documentElement.classList.contains('booting'));
   await page.evaluate(()=>{window.controlsBefore=[...document.querySelectorAll('input,select,audio')];window.originalHeader=document.querySelector('.brand span');document.querySelector('#tempo').value='96';});
   await page.locator('#language-switch').click();await page.waitForFunction(()=>document.documentElement.lang==='en'&&!document.querySelector('#language-switch').disabled);
   assert.equal(await page.locator('#start-button').textContent(),'Start practice');
   assert.equal(await page.locator('#tempo').inputValue(),'96');
   assert.ok(await page.evaluate(()=>controlsBefore.every(e=>e.isConnected)&&originalHeader===document.querySelector('.brand span')));
   await page.evaluate(()=>document.querySelector('#play-status').textContent='琴谱已就绪');await page.waitForFunction(()=>document.querySelector('#play-status').textContent==='Score ready');
   await page.locator('#language-switch').click();await page.waitForFunction(()=>document.documentElement.lang==='zh-CN'&&!document.querySelector('#language-switch').disabled);
   assert.equal(await page.locator('#start-button').textContent(),'开始练习');assert.equal(await page.locator('#play-status').textContent(),'琴谱已就绪');
   assert.ok(await page.evaluate(()=>controlsBefore.every(e=>e.isConnected)));
   await page.evaluate(()=>window.sudaLanguage.set('en'));await page.reload();await page.waitForFunction(()=>document.documentElement.lang==='en'&&window.sudaLanguage);
   console.log(JSON.stringify({width,controlsPreserved:true,dynamicText:true,persisted:true,errors,untranslated:await page.evaluate(()=>window.sudaLanguage.missing())}));
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
