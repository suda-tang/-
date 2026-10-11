const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const scores=Array.from({length:18},(_,i)=>({id:i.toString(16).padStart(64,'a'),title:'空间动作 '+i,ready:true,status:'complete',titleSource:'user',cover:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'}));
  await page.route('**/api/scores',r=>r.fulfill({json:{scores}}));
  await page.route('**/api/scores/classify',r=>r.fulfill({json:{state:'complete',categories:Object.fromEntries(scores.map((s,i)=>[s.id,i%2?'复调':'奏鸣曲']))}}));
  await page.route(/\/api\/scores\/[a-f0-9]{64}$/,r=>r.fulfill({status:404,json:{error:'隔离动画测试，不读取真实作品'}}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>document.documentElement.dataset.workspaceReady==='true'&&!!document.querySelector('.score-library')?.tourOpen);
  for(const categorized of [false,true,'dock']){
   await page.evaluate(async categorized=>{const panel=document.querySelector('.score-library');await panel.tourOpen();if(categorized==='dock')await panel.tourClose();else if(categorized){await panel.tourClose();await document.querySelector('.library-expand').onclick(true);await document.querySelector('.library-card-stack .card-stack-toggle').onclick();}},categorized);
   await page.evaluate(()=>{
    const card=document.querySelector('.library-browser[open] .library-score')||[...document.querySelectorAll('.library-list .library-score')].find(c=>{const r=c.getBoundingClientRect();return r.left+r.width/2>0&&r.left+r.width/2<innerWidth&&r.top+r.height/2>0&&r.top+r.height/2<innerHeight;});if(!card)throw Error('no visible dock card');window.selectedMotionCard=card;window.loadingFlight=[];
    const sample=()=>{const layer=document.querySelector('.record-flight');if(layer){const box=card.getBoundingClientRect(),style=getComputedStyle(layer);window.loadingFlight.push({same:layer.contains(card),matrix:style.transform,cx:box.left+box.width/2,cy:box.top+box.height/2,opacity:Number(style.opacity),visible:layer.matches(':popover-open')&&style.display!=='none',loader:document.querySelector('.score-loading-overlay').matches(':popover-open')});}if(!window.loadingFlightDone)requestAnimationFrame(sample);};window.loadingFlightDone=false;requestAnimationFrame(sample);
    window.loadingMotion=card.onclick().finally(()=>{window.loadingFlightDone=true;});
   });
   await page.waitForTimeout(320);await page.screenshot({path:'.sites-runtime/library-record-'+width+'-'+categorized+'.png'});
   await page.evaluate(()=>window.loadingMotion);
   const result=await page.evaluate(()=>({samples:window.loadingFlight,same:document.querySelector('.library-list').contains(window.selectedMotionCard),count:document.querySelectorAll('.library-score').length,open:document.querySelector('.library-browser').open,leaked:!!document.querySelector('.record-flight,.library-tether-layer'),hidden:window.selectedMotionCard.style.visibility,order:[...document.querySelectorAll('.library-list > .library-score')].map(c=>c.dataset.scoreId)}));
   assert.ok(result.samples.length>3&&result.samples.every(s=>s.same));assert.ok(result.samples.some(s=>s.matrix.startsWith('matrix3d')));assert.ok(result.samples.filter(s=>s.opacity>.2).every(s=>s.visible&&s.loader));
   assert.ok(result.samples.filter(s=>s.opacity>.2).every(s=>s.cx>-30&&s.cx<width+30&&s.cy>0&&s.cy<900),JSON.stringify({width,categorized,bounds:result.samples.map(s=>[Math.round(s.cx),Math.round(s.cy),s.opacity])}));
   assert.ok(result.same&&!result.open&&!result.leaked&&!result.hidden);assert.equal(result.count,scores.length);assert.deepEqual(result.order,scores.map(s=>s.id));
   console.log('PASS selected original card, 3D loading trajectory, viewport, ordered handoff:',width,categorized);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
