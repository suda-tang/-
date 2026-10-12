const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/scores',r=>r.fulfill({json:{scores:[]}}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForSelector('#language-trigger');
  await page.locator('#language-trigger').click();
  await page.waitForTimeout(150);
  const opening=await page.evaluate(()=>{const t=document.querySelector('#language-trigger').getBoundingClientRect(),m=document.querySelector('.language-mist'),w=document.querySelector('#language-wheel').getBoundingClientRect();return {clip:getComputedStyle(m).clipPath,x:parseFloat(m.style.getPropertyValue('--mist-x')),y:parseFloat(m.style.getPropertyValue('--mist-y')),tx:t.left+t.width/2,ty:t.top+t.height/2,width:w.width,height:w.height,animated:m.getAnimations().length>0};});
  assert.ok(opening.animated);assert.ok(Math.abs(opening.x-opening.tx)<1&&Math.abs(opening.y-opening.ty)<1);assert.equal(opening.width,width);assert.equal(opening.height,900);
  await page.screenshot({path:'.sites-runtime/language-mist-opening-'+width+'.png'});
  await page.waitForTimeout(850);
  assert.equal(await page.locator('#language-wheel').evaluate(w=>w.open),true);
  await page.screenshot({path:'.sites-runtime/language-mist-full-'+width+'.png'});
  await page.locator('.language-wheel-close').click();await page.waitForTimeout(180);
  const closing=await page.locator('.language-mist').evaluate(m=>m.getAnimations().some(a=>a.effect.getKeyframes().at(-1).clipPath.includes('circle(18px')));assert.ok(closing);
  await page.waitForFunction(()=>!document.querySelector('#language-wheel').open);
  await page.locator('#language-trigger').click();await page.waitForTimeout(900);
  await page.locator('.language-dial-rail [data-locale="en"]').click();
  await page.waitForFunction(()=>!document.querySelector('#language-wheel').open&&document.documentElement.lang==='en');
  assert.equal(await page.locator('.language-mist').evaluate(m=>m.getAnimations().length),0);
  // Closing while the plume is still opening must not resurrect the modal.
  await page.locator('#language-trigger').click();await page.waitForTimeout(80);
  const interrupted=await page.evaluate(()=>{const m=document.querySelector('.language-mist'),before=getComputedStyle(m).clipPath;document.querySelector('#language-wheel').dispatchEvent(new Event('cancel',{cancelable:true}));return {before,start:m.getAnimations()[0].effect.getKeyframes()[0].clipPath};});
  assert.equal(interrupted.start,interrupted.before,'Closing must begin at the visible mist boundary');
  await page.waitForTimeout(1100);assert.equal(await page.locator('#language-wheel').evaluate(w=>w.open),false);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#language-trigger').click();await page.locator('.language-wheel-close').click();await page.waitForFunction(()=>!document.querySelector('#language-wheel').open);
  assert.deepEqual(errors,[]);console.log({width,originAligned:true,closeReturnsToButton:true,languageAppliedBeforeClose:true,errors});await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
