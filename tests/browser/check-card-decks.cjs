const {chromium}=require(process.env.PIANO_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{for(const width of [1280,390]){
const page=await browser.newPage({viewport:{width,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const scores=Array.from({length:12},(_,i)=>({id:(i+1).toString(16).padStart(64,'0'),title:'测试曲目'+i,ready:i<7,hasPdf:true}));
await page.route('**/api/scores',r=>r.fulfill({json:{scores}}));await page.route('**/api/scores/classify',r=>r.fulfill({json:{categories:Object.fromEntries(scores.slice(0,7).map((s,i)=>[s.id,i<4?'流行歌曲':'古典作品']))}}));
await page.route('**/api/tasks',r=>r.fulfill({json:{tasks:[{id:'test-job',digest:scores[0].id,scoreTitle:'测试曲目',kind:'metadata',status:'running',progress:32,stage:'校对标题',created:Date.now()/1000}],foreground:{}}}));
await page.route('**/api/ai-tasks',r=>r.fulfill({json:{tasks:[{id:'test-ai',scoreTitle:'测试曲目',kind:'ai',status:'complete',progress:100,result:'测试结果'}]}}));
await page.route('**/api/cover?**',r=>r.fulfill({json:{artwork:''}}));
await page.goto('http://127.0.0.1:5173/');await page.locator('[data-panel=library]').click();await page.locator('.library-pending-group .library-score').first().waitFor({state:'attached'});await page.waitForTimeout(1500);
assert.equal(await page.locator('.library-pending-group .library-score').count(),5);assert.equal(await page.locator('.library-pending-toggle').getAttribute('aria-expanded'),'false');
await page.locator('.library-pending-toggle').click();await page.waitForFunction(()=>document.querySelector('.library-pending-toggle').getAttribute('aria-expanded')==='true');await page.waitForTimeout(700);assert.equal(await page.locator('.library-pending-group .library-score[inert]').count(),0);await page.locator('.library-pending-toggle').click();await page.locator('.library-close').click();await page.waitForTimeout(1500);
await page.locator('.library-classify').click();await page.locator('.library-category-stack').first().waitFor();await page.waitForTimeout(1100);assert.equal(await page.locator('.library-browser').evaluate(e=>e.open),true);assert.equal(await page.locator('.library-category-stack').count(),2);await page.screenshot({path:'.sites-runtime/decks-'+width+'.png'});
await page.locator('.library-category-stack .card-stack-toggle').first().click();await page.waitForTimeout(700);assert.equal(await page.locator('.library-category-stack.is-expanded .library-score').count(),4);
await page.locator('.library-close').click();await page.waitForTimeout(1500);assert.equal(await page.locator('.library-category-stack').count(),0);assert.equal(await page.locator('.library-list > .library-score').count(),7);
await page.locator('[data-panel=tasks]').click();await page.locator('.task-group-toggle').first().waitFor({state:'attached'});await page.locator('.task-center').evaluate(e=>e.open=true);
assert.equal(await page.locator('.task-group-toggle[aria-expanded=false]').count(),2);await page.locator('.task-group-toggle').first().click();await page.waitForTimeout(2800);assert.equal(await page.locator('.task-group-toggle').first().getAttribute('aria-expanded'),'true');
assert.deepEqual(errors,[]);console.log('PASS',width,'stack, categorized full-screen, close, collapsed tasks, polling state');await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
