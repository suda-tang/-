const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage();await page.route('**/api/scores',r=>r.fulfill({json:{scores:[{id:'a'.repeat(64),title:'过渡检查',ready:false,hasPdf:false}]}}));await page.route('**/api/cover?**',r=>r.fulfill({json:{artwork:''}}));
await page.goto('http://127.0.0.1:5173');
for(const full of [false,true]){
await page.locator('[data-panel=library]').click();await page.waitForTimeout(1000);
if(full){await page.locator('.library-expand').click();await page.waitForTimeout(1800);}
await page.locator('.library-score').first().click();await page.waitForTimeout(100);assert.equal(await page.locator('.record-flight').count(),1);assert.ok(await page.locator('.record-flight').evaluate(e=>e.getAnimations().length>0));
await page.waitForFunction(()=>!document.querySelector('.score-loading-overlay').hidden);assert.equal(await page.locator('.record-flight').count(),0);
await page.waitForFunction(()=>document.querySelector('.score-loading-overlay').hidden);assert.equal(await page.locator('.library-score[aria-busy]').count(),0);assert.equal(await page.locator('.library-browser').evaluate(e=>e.open),false);
}console.log('PASS: deck and fullscreen card lift, loader entrance/exit, cleanup');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
