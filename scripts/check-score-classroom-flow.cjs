const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const id=process.env.CLASSROOM_ID||'02b4f00efd453ed3127d8bb79c745f9f';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required'],proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});
 try{
  const page=await browser.newPage({viewport:{width:1360,height:950}});
  await page.addInitScript(id=>localStorage.setItem('classroom-last',JSON.stringify(id)),id);
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});await page.waitForSelector('.workspace-nav',{timeout:90000});
  await page.evaluate(()=>new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id:'031257641a9b44d10b5ace547e0a9818f90dd83408c7e4f84426559c8fe9d254',resolve,reject}}))));
  await page.evaluate(()=>document.querySelector('.workspace-nav [data-panel="play"]').click());await page.locator('.score-classroom > summary').click();
  await page.waitForSelector('.classroom-chapters button',{timeout:20000});
  await page.locator('.classroom-expand').click();await page.waitForSelector('.classroom-fullscreen');
  await page.locator('[data-act="demo"]').click();
  await page.waitForFunction(async()=>{const {livePlayer}=await import('/capability-host.js');return livePlayer()?.playing;},{},{timeout:25000});
  await page.locator('[data-act="demo"]').click();
  assert.equal(await page.evaluate(async()=>{const {livePlayer}=await import('/capability-host.js');return livePlayer().playing}),false);
  await page.locator('.classroom-chapters button').last().click();
  await page.waitForSelector('.classroom-sheet fieldset button');await page.locator('.classroom-sheet fieldset button').first().click();
  assert.match(await page.locator('.classroom-sheet fieldset p').first().textContent(),/答对|再对照/);
  await page.locator('.classroom-question summary').click();await page.locator('.classroom-question input').fill('请解释为什么左手太响会盖住旋律，只说两句话。');await page.locator('.classroom-question form button').click();
  await page.waitForFunction(()=>document.querySelector('.classroom-dialogue p:last-child')?.textContent.length>30,{},{timeout:100000});
  await page.waitForFunction(()=>!document.querySelector('.classroom-question form button').disabled,{},{timeout:100000});
  assert.doesNotMatch(await page.locator('.classroom-dialogue p').last().textContent(),/HTTP|Traceback|timed out/);
  await page.locator('[data-act="practice"]').click();
  assert.match(await page.locator('.classroom-status').textContent(),/小节范围已设好/);
  const state=await page.evaluate(()=>new Promise(resolve=>document.dispatchEvent(new CustomEvent('ai-workspace-context',{detail:{resolve}}))));assert.deepEqual(state.practiceRange,{start:1,end:4});
  await page.locator('.classroom-chapters button').first().click();
  if(!await page.locator('.classroom-fullscreen').count())await page.locator('.classroom-expand').click();
  await page.screenshot({path:'audit/classroom-course-desktop.png',fullPage:false});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('.classroom-fullscreen').evaluate(e=>e.scrollWidth<=e.clientWidth+2),true);
  await page.screenshot({path:'audit/classroom-course-mobile.png',fullPage:false});
  await page.locator('.classroom-expand').click();assert.equal(await page.locator('.classroom-fullscreen').count(),0);
  console.log('PASS: saved real OpenMAIC lesson, actual score demo/pause, quiz feedback, streaming question, real practice configuration, fullscreen/mobile');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
