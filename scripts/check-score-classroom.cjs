const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:920}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.workspace-nav',{timeout:90000});
  await page.evaluate(()=>document.querySelector('.workspace-nav [data-panel="play"]').click());
  await page.locator('.score-classroom > summary').click();
  await page.waitForSelector('.classroom-setup');
  await page.locator('.classroom-setup button').click();
  await page.waitForFunction(()=>document.querySelector('.classroom-status').textContent.includes('请先'));
  await page.evaluate(()=>new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id:'031257641a9b44d10b5ace547e0a9818f90dd83408c7e4f84426559c8fe9d254',resolve,reject}}))));
  await page.evaluate(()=>document.querySelector('.workspace-nav [data-panel="play"]').click());
  await page.locator('.classroom-setup [name="end"]').fill('4');
  await page.locator('.classroom-setup button').click();
  await page.waitForFunction(()=>document.querySelector('.classroom-status').textContent.includes('晴'),{},{timeout:25000});
  await page.screenshot({path:'audit/classroom-desktop.png',fullPage:false});
  await page.setViewportSize({width:390,height:844});
  await page.locator('.score-classroom').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.score-classroom').evaluate(e=>e.scrollWidth<=e.clientWidth+2),true,'mobile overflow');
  await page.screenshot({path:'audit/classroom-mobile.png',fullPage:false});
  fs.writeFileSync('audit/classroom-browser.json',JSON.stringify({errors,status:await page.locator('.classroom-status').textContent()},null,2));
  assert.equal(errors.filter(x=>!/ResizeObserver|Load failed|Failed to fetch/.test(x)).length,0,errors.join('\n'));
  console.log('PASS: actual cloud score, native classroom entry, generation submission, mobile layout');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
