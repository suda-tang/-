const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.route('**/api/tasks',route=>route.fulfill({json:{tasks:Array.from({length:25},(_,i)=>({id:'test-'+i,kind:'arrangement',status:i===0?'failed':'queued',created:Date.now()/1000,progress:0,label:'测试曲谱 '+i}))}}));
 await page.goto('http://127.0.0.1:5173/');await page.waitForSelector('.nav-lens');await page.locator('[data-panel=tasks]').click();await page.waitForTimeout(650);
 assert.ok(await page.getByRole('button',{name:'优先处理',exact:true}).count()>0);assert.ok(await page.getByRole('button',{name:'优先重试',exact:true}).count()>0);
 const client=await page.context().newCDPSession(page);
 async function swipe(x,y,dx,dy){await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=12;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/12,y:y+dy*i/12}]});await page.waitForTimeout(18);}await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(650);}
 const bounds=await page.locator('.setup').boundingBox();await swipe(bounds.x+bounds.width/2,bounds.y+bounds.height-30,0,-160);
 assert.ok(await page.locator('.setup').evaluate(el=>el.scrollTop>50),'task pane scrolls with touch');
 await page.evaluate(()=>{window.touchLog=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>touchLog.push([type,e.target.className,e.button,e.clientX,e.clientY]),true);});
 const tasks=await page.locator('[data-panel=tasks]').boundingBox(),arrange=await page.locator('[data-panel=arrange]').boundingBox();
 await swipe(tasks.x+tasks.width/2,tasks.y+tasks.height/2,arrange.x-tasks.x,0);
 assert.equal(await page.locator('body').getAttribute('data-workspace'),'arrange',JSON.stringify(await page.evaluate(()=>touchLog)));
 await page.locator('.setup').evaluate(el=>el.scrollTop=0);await page.locator('[data-style=custom]').click();await page.waitForTimeout(200);
 const arrangementBox=await page.locator('.setup').boundingBox();await swipe(arrangementBox.x+15,arrangementBox.y+arrangementBox.height-25,0,-150);
 assert.ok(await page.locator('.setup').evaluate(el=>el.scrollTop>0),'arrangement pane scrolls');
 await page.locator('.score-loading-overlay').evaluate(el=>el.hidden=false);
 const aligned=await page.evaluate(()=>{const a=document.querySelector('.score-loading-dialog').getBoundingClientRect(),b=document.querySelector('.score-loading-seal').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<1&&getComputedStyle(document.querySelector('.score-loading-seal')).backgroundImage.includes('suda-seal.svg');});assert.ok(aligned,'round seal centered');
 await page.screenshot({path:'.sites-runtime/verification/centered-seal.png'});
 console.log('Touch: task scrolling, navigation swipe, instrument scrolling, priority buttons and seal centering passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
