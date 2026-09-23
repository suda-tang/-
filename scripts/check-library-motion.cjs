const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:850}});
await page.route('**/api/scores',r=>r.fulfill({json:{scores:Array.from({length:16},(_,i)=>({id:String(i).padStart(64,'a'),title:'曲谱 '+i,ready:true}))}}));
await page.route('**/api/cover?**',r=>r.fulfill({json:{artwork:''}}));
await page.goto('http://127.0.0.1:5173');await page.locator('[data-panel=library]').click();await page.waitForTimeout(1200);
assert.ok((await page.locator('.edition img').getAttribute('src')).includes('suda-official.jpg'));
assert.equal(await page.locator('.library-cover').count(),16);
const arrow=page.getByRole('button',{name:'下一组',exact:true});await arrow.hover();await page.mouse.down();await page.waitForTimeout(550);const first=await page.locator('.library-list').evaluate(e=>e.scrollLeft);await page.waitForTimeout(550);const second=await page.locator('.library-list').evaluate(e=>e.scrollLeft);await page.mouse.up();assert.ok(second>first+100);
await page.getByRole('button',{name:'展开云曲库',exact:true}).click();await page.waitForTimeout(100);assert.ok(await page.locator('.library-browser').evaluate(e=>e.getAnimations().length>0));assert.equal(await page.locator('.library-score').first().evaluate(e=>e.style.opacity),'0');await page.waitForTimeout(1500);
await page.locator('.library-close').click();await page.waitForFunction(()=>!document.querySelector('.library-browser').open);
await page.getByRole('button',{name:'刷新云曲库',exact:true}).click();await page.waitForTimeout(70);assert.ok(await page.locator('.library-score').first().evaluate(e=>e.getAnimations().length>0));assert.ok(await page.locator('.cloud-library-notice').isVisible());await page.waitForTimeout(1500);assert.equal(await page.locator('.library-score').count(),16);
console.log('PASS: original logo, cover fallback, accelerating hold, dock transition, delayed card deal, refresh exit and toast');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
