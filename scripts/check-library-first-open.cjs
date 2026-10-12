const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});try{
 for(const width of [390,834]){
  const page=await browser.newPage({viewport:{width,height:900},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const scores=Array.from({length:500},(_,i)=>({id:i.toString(16).padStart(64,'0'),title:'动画测试 '+i,ready:true,status:'complete',titleSource:'user',cover:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'}));
  await page.route('**/api/scores',r=>r.fulfill({json:{scores}}));
  await page.route('**/api/scores/classify',r=>r.fulfill({json:{state:'complete',categories:Object.fromEntries(scores.map((s,i)=>[s.id,['古典','浪漫','现代'][i%3]]))}}));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>document.documentElement.dataset.workspaceReady==='true'&&document.querySelector('.score-library')?.tourOpen);
  await page.locator('.library-expand').click({trial:true,timeout:60000});
  const results=await page.evaluate(async()=>{
   const panel=document.querySelector('.score-library'),list=panel.querySelector('.library-list'),out=[];
   for(let i=0;i<2;i++){
    // Cold first open: do not warm or settle the fullscreen layout.
    const before=panel.getBoundingClientRect().height,scroll=list.scrollLeft,order=[...list.querySelectorAll('.library-score')].map(c=>c.dataset.scoreId);
    for(const operation of ['tourOpen','tourClose']){
     const identities=new Set(list.querySelectorAll('.library-score'));
     const gaps=[];let previous=performance.now(),active=true,ghosts=0,travelling=0,same=true,moving=false,surfaceMoving=false,spatial=false,handoffClean=true;
     const frame=t=>{gaps.push(t-previous);previous=t;ghosts=Math.max(ghosts,document.querySelectorAll('.card-flight-ghost').length);const cards=[...document.querySelectorAll('.library-tether-layer .library-score')];travelling=Math.max(travelling,cards.length);same&&=cards.every(c=>identities.has(c));moving||=cards.some(c=>c.parentElement.getAnimations().some(a=>a.currentTime>50&&a.currentTime<500)&&getComputedStyle(c.parentElement).transform!=='none');spatial||=cards.some(c=>{const m=new DOMMatrix(getComputedStyle(c.parentElement).transform);return Math.abs(m.m43)>30&&Math.abs(m.m13)+Math.abs(m.m23)>.1;});const dialog=document.querySelector('.library-browser'),style=getComputedStyle(dialog);if(operation==='tourClose'&&cards.length&&dialog.open&&getComputedStyle(list).opacity!=='0')handoffClean=false;surfaceMoving||=dialog.open&&Number(style.opacity)>0&&Number(style.opacity)<.99&&style.clipPath.startsWith('inset(');if(active)requestAnimationFrame(frame);};requestAnimationFrame(frame);
     let spatialFlightCreated=false;const landing=new Map(),nativeAnimate=Element.prototype.animate;Element.prototype.animate=function(...args){const a=nativeAnimate.apply(this,args);if(this.classList.contains('library-tether-card')){spatialFlightCreated||=args[0].some(f=>String(f.transform).includes('translateZ('));const carrier=this;a.finished.then(()=>{const c=carrier.querySelector('.library-score');if(c&&Number(getComputedStyle(carrier).opacity)>.01)landing.set(c,c.getBoundingClientRect());}).catch(()=>{});}return a;};
     const started=performance.now();if(operation==='tourOpen'&&i===1)await panel.querySelector('.library-expand').onclick(true);else await panel[operation]();active=false;Element.prototype.animate=nativeAnimate;
     let landingError=0;for(const [c,r] of landing){const box=c.getBoundingClientRect();if(box.width&&box.height&&box.right>0&&box.left<innerWidth&&box.bottom>0&&box.top<innerHeight)landingError=Math.max(landingError,...['left','top','width','height'].map(k=>Math.abs(box[k]-r[k])));}if(landingError>3)throw Error(operation+' actual handoff jumps '+landingError+'px');
     const resting=new Map([...landing.keys()].map(c=>[c,c.getBoundingClientRect()]));await new Promise(r=>setTimeout(r,1000));for(const [c,r]of resting){const box=c.getBoundingClientRect();if(box.width&&box.height&&box.right>0&&box.left<innerWidth&&box.bottom>0&&box.top<innerHeight){const drift=Math.max(...['left','top','width','height'].map(k=>Math.abs(box[k]-r[k])));if(drift>3)throw Error(operation+' delayed layout jumps '+drift+'px');}}
     if(document.querySelector('.library-tether-layer'))throw Error('card transfer leaked');
     if([...identities].some(c=>!c.isConnected))throw Error('original cards replaced during stream');
     const surface=document.querySelector('.library-browser');if(surface.style.opacity||surface.style.clipPath)throw Error('surface animation styles leaked');
     if(!handoffClean)throw Error('fullscreen cards flashed during close handoff');
     out.push({operation,categorized:i===1,landingError,duration:Math.round(performance.now()-started),maxFrameGap:Math.round(Math.max(0,...gaps)),ghosts,travelling,same,moving,surfaceMoving,spatial,spatialFlightCreated});
    }
    if(Math.abs(panel.getBoundingClientRect().height-before)>2)throw Error('dock height changed');
    if(Math.abs(list.scrollLeft-scroll)>2)throw Error('dock scroll not restored');
    if(JSON.stringify([...list.querySelectorAll('.library-score')].map(c=>c.dataset.scoreId).filter(id=>order.includes(id)))!==JSON.stringify(order))throw Error('dock card order changed');
    if(document.querySelector('.library-dock-placeholder')||document.querySelector('.library-browser').open)throw Error('close cleanup incomplete');
   }
   return out;
  });
  console.log(width,results);assert.ok(results.every(r=>r.ghosts===0&&r.travelling>0&&r.same&&r.spatialFlightCreated));assert.deepEqual(errors,[]);
  await page.evaluate(()=>{window.motionCapture=document.querySelector('.library-expand').onclick(true);});
  await page.waitForTimeout(220);await page.screenshot({path:'.sites-runtime/library-tether-open-'+width+'.png'});
  await page.evaluate(()=>window.motionCapture);
  await page.screenshot({path:'.sites-runtime/library-tether-full-'+width+'.png'});
  await page.evaluate(()=>{window.motionCapture=document.querySelector('.score-library').tourClose();});
  await page.waitForTimeout(220);await page.screenshot({path:'.sites-runtime/library-tether-close-'+width+'.png'});
  await page.evaluate(()=>window.motionCapture);
  const endpointError=await page.evaluate(async()=>{
   const {cardPositions,tetherCards}=await import('/library-tether.js');
   const list=document.querySelector('.library-list'),positions=cardPositions(list);let release;
   const settle=new Promise(resolve=>release=resolve);
   const movement=tetherCards(list,positions,positions,{dock:list.getBoundingClientRect(),settle});
   const carriers=[...document.querySelectorAll('.library-tether-card')];for(let wait=0;wait<12&&!carriers[0]?.getAnimations().length;wait++)await new Promise(requestAnimationFrame);let error=0;
   for(const carrier of carriers){const a=carrier.getAnimations()[0];a.pause();for(const time of [0,Number(a.effect.getTiming().delay)+Number(a.effect.getTiming().duration)]){a.currentTime=time;const card=carrier.querySelector('.library-score'),actual=card.getBoundingClientRect(),expected=positions.get(card);error=Math.max(error,...['left','top','width','height'].map(k=>Math.abs(actual[k]-expected[k])));}a.finish();}
   release();await movement;return error;
  });
  console.log('Projected endpoint error:',width,endpointError);assert.ok(endpointError<2);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async()=>{const p=document.querySelector('.score-library');await p.tourOpen();await p.tourClose();});
  await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
