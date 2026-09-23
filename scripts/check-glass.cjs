const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/');await page.waitForSelector('.nav-lens');
 for(const [width,height] of [[1440,1000],[390,844],[844,390],[1024,768]]){
  await page.setViewportSize({width,height});
  await page.locator('[data-panel=tasks]').click();await page.locator('[data-panel=play]').click();
  await page.locator('.practice-settings').evaluate(el=>el.open=true);await page.waitForTimeout(600);
  const result=await page.evaluate(()=>{
   const rect=id=>document.querySelector(id).getBoundingClientRect();const a=rect('#start-button'),b=rect('#reset-button'),lens=rect('.nav-lens'),active=rect('.workspace-nav [aria-pressed=true]');
   return {a:a.toJSON(),b:b.toJSON(),hidden:document.querySelector('#reset-button').hidden,display:getComputedStyle(document.querySelector('#reset-button')).display,sameRow:Math.abs(a.y-b.y)<1,width:Math.abs(a.width-b.width),noOverlap:a.right<=b.left,aligned:Math.abs(lens.x-active.x)<2,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });assert.ok(result.sameRow&&result.noOverlap&&result.aligned,JSON.stringify({width,...result}));assert.ok(result.width<2);assert.equal(result.overflow,false);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`.sites-runtime/verification/glass-${width}.png`});
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-panel=arrange]').click();
 assert.equal(await page.locator('#workspace-arrange').evaluate(el=>el.getAnimations().length),0);
 assert.deepEqual(errors,[]);console.log('Glass: 4 layouts, practice button geometry, lens alignment, reduced motion passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
