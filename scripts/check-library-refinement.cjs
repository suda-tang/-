const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/api/scores',r=>r.fulfill({json:{scores:[{id:'a',title:'测试曲',ready:false,hasPdf:true}]}}));
 await page.route('**/api/tasks',r=>r.fulfill({json:{tasks:[]}}));
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-panel=library]').click();
 assert.equal(await page.locator('.library-navigation button').count(),4);
 assert.equal(await page.locator('.library-settings').count(),0);
 for(const selector of ['#sample-button','[data-ocr]','[data-cover]'])assert.equal(await page.locator('.service-controls .technical '+selector).count(),1);
 for(let i=0;i<3;i++){
  await page.getByRole('button',{name:'展开云曲库'}).click();await page.waitForFunction(()=>document.querySelector(".library-browser").open);await page.waitForTimeout(380);
  assert.equal(await page.locator('.library-browser .library-score').count(),1);
  await page.locator('.library-browser header button').click();
  await page.waitForFunction(()=>!document.querySelector('.library-browser').open);
  await page.waitForFunction(()=>!document.querySelector('.library-expand').disabled);
  assert.equal(await page.locator('.score-library .library-score').count(),1);
 }
 const timings=await page.evaluate(async()=>{
  const {ScorePlayer}=await import('/player.js');const hits=[];const p=new ScorePlayer();
  const events=Array.from({length:24},(_,i)=>({beat:i,measure:1+Math.floor(i/4),notes:[{midi:60,duration:1}]}));
  p.score=p.originalScore={events};p.context={currentTime:0};p.clockTime=0;p.clockBeat=0;p.bpm=60;p.totalBeats=24;p.nextPulse=0;p.playing=true;p.sound=(n,e,v,d,t)=>hits.push(t);
  p.tick();p.context.currentTime=4.2;p.tick();p.context.currentTime=8.5;p.tick();p.playing=false;
  return hits;
 });
 assert.ok(timings.length>16);for(let i=1;i<timings.length;i++)assert.ok(Math.abs(timings[i]-i)<.001);
 console.log('Four icons, merged settings, repeated open/close and cross-bar audio clock passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
