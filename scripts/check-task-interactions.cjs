const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/tasks',route=>route.fulfill({json:{tasks:[]}}));
 let prioritized='';await page.route('**/api/processing/priority',route=>{prioritized=route.request().postDataJSON().id;return route.fulfill({json:{ok:true}});});
 await page.goto('http://127.0.0.1:5173/');await page.waitForSelector('.nav-lens');
 const play=await page.locator('[data-panel=play]').boundingBox();await page.mouse.move(play.x+play.width/2,play.y+play.height/2);await page.mouse.down();await page.mouse.move(play.x+play.width*1.5,play.y+play.height/2,{steps:10});await page.mouse.up();
 await page.waitForTimeout(600);assert.equal(await page.locator('body').getAttribute('data-workspace'),'arrange');
 await page.evaluate(async()=>{const {reportTask}=await import('/task-center.js');reportTask('active',{scoreTitle:'可惜不是你',kind:'arrangement',status:'running',progress:42,detail:'配器 4 / 10 段'});reportTask('queued',{jobId:'test-job',scoreTitle:'零距离的思念',kind:'expression',status:'queued',progress:0,canPrioritize:true});});
 await page.locator('[data-panel=tasks]').click();assert.ok(await page.locator('.task-row[data-status=running]').innerText().then(t=>t.includes('可惜不是你')&&t.includes('42%')&&t.includes('当前处理')));
 await page.getByRole('button',{name:'优先处理'}).click();await page.waitForTimeout(150);assert.equal(prioritized,'test-job');
 assert.ok(await page.locator('.task-list').innerText().then(t=>t.includes('已设为下一项')));
 assert.deepEqual(errors,[]);console.log('Swipe navigation, task title/progress/current status and priority action passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
