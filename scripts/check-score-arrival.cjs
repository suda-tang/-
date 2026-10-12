const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];let xml='';
  page.on('pageerror',e=>errors.push(e.message));
  const id='b'.repeat(64),scores=[{id,title:'连贯展开测试',ready:true,status:'complete',titleSource:'user',cover:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'}];
  await page.route('**/api/scores',r=>r.fulfill({json:{scores}}));
  await page.route('**/api/scores/'+id,r=>r.fulfill({json:{id,xml,metadata:{title:'连贯展开测试'}}}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>!!document.querySelector('.score-library')?.tourOpen);
  xml=await page.evaluate(async()=>{const m=await import('/score.js?v=chunk-plan4');return m.fallbackMusicXML(m.sampleScore());});
  await page.evaluate(async()=>{await document.querySelector('.score-library').tourOpen();window.arrivalFrames=[];window.arrivalSeal=document.querySelector('.score-loading-seal');const sample=()=>{const loader=document.querySelector('.score-loading-overlay'),disc=document.querySelector('.score-arrival-disc'),card=document.querySelector('.score-card');if(loader.dataset.arrivalPhase&&disc){const r=disc.getBoundingClientRect();window.arrivalFrames.push({phase:loader.dataset.arrivalPhase,same:disc.contains(window.arrivalSeal),transform:getComputedStyle(disc).transform,cx:r.left+r.width/2,cy:r.top+r.height/2,scoreVisible:getComputedStyle(card).visibility,clip:getComputedStyle(card).clipPath,loader:loader.matches(':popover-open')});}if(!window.arrivalDone)requestAnimationFrame(sample);};requestAnimationFrame(sample);window.arrivalPromise=document.querySelector('.library-score').onclick().finally(()=>window.arrivalDone=true);});
  await page.waitForFunction(()=>document.querySelector('.score-loading-overlay').dataset.arrivalPhase==='flight');
  await page.screenshot({path:'.sites-runtime/score-arrival-flight-'+width+'.png'});
  await page.evaluate(()=>window.arrivalPromise);
  const result=await page.evaluate(()=>({frames:window.arrivalFrames,restored:document.querySelector('.score-loading-dialog').contains(window.arrivalSeal),leaked:!!document.querySelector('.score-arrival-layer,.record-flight'),visible:getComputedStyle(document.querySelector('.score-card')).visibility,svg:document.querySelectorAll('#notation svg').length,hidden:document.querySelector('.score-loading-overlay').hidden,inline:document.querySelector('.score-card').getAttribute('style')}));
  for(const phase of ['fold','vinyl','flight','score'])assert.ok(result.frames.some(f=>f.phase===phase),phase+' observed '+JSON.stringify([...new Set(result.frames.map(f=>f.phase))]));
  assert.ok(result.frames.every(f=>f.same));assert.ok(result.frames.filter(f=>['fold','vinyl','flight'].includes(f.phase)).every(f=>f.scoreVisible==='hidden'));
  assert.ok(result.frames.some(f=>f.phase==='flight'&&f.transform.startsWith('matrix3d')));assert.ok(result.frames.filter(f=>f.phase==='score').some(f=>f.clip.startsWith('circle')));
  assert.ok(result.restored&&!result.leaked&&result.hidden&&result.svg>0);assert.equal(result.visible,'visible');
  await page.screenshot({path:'.sites-runtime/score-arrival-complete-'+width+'.png'});
  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=await page.evaluate(id=>new Promise(resolve=>document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id,resolve:()=>resolve({ok:true,leaked:!!document.querySelector('.score-arrival-layer'),visible:getComputedStyle(document.querySelector('.score-card')).visibility}),reject:e=>resolve({error:e.message})}}))),id);
  assert.ok(reduced.ok&&!reduced.leaked);assert.equal(reduced.visible,'visible');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({width,phases:[...new Set(result.frames.map(f=>f.phase))],sameSeal:true,svg:result.svg,reducedMotion:reduced.ok,errors}));await page.close();
 }
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
