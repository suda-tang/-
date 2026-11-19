const fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{const p=await b.newPage({viewport:{width:1280,height:800}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/mentor-greeting?**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({status:'synthesizing',progress:60,url:null})}));
await p.goto('http://127.0.0.1:5173/?tour=1&auto=1&mentor=李弘&lang=zh',{waitUntil:'domcontentloaded'});
await p.waitForSelector('.mentor-cinematic .narration-avatar canvas',{timeout:60000});let routes=new Set(),state;
for(let i=0;i<60;i++){await p.waitForTimeout(1000);state=await p.locator('.mentor-cinematic').evaluate(e=>({phase:e.dataset.phase,avatar:{...e.querySelector('.narration-avatar')?.dataset},arrival:{...e.querySelector('.home-intro-content')?.dataset},choice:window.mentorPreparation?.openingChoice,audio:{paused:window.mentorPreparation?.audio?.paused,ready:window.mentorPreparation?.audio?.readyState,time:window.mentorPreparation?.audio?.currentTime}}));if(state.arrival.route)routes.add(state.arrival.route);if(state.phase==='lecture'&&state.audio.time>1)break;}
console.log(JSON.stringify({routes:[...routes],state,errors},null,2));assert.ok(!routes.has('city'),'Audio readiness must never start landmark loops');assert.equal(state.choice,'fallback');assert.equal(state.phase,'lecture');assert.ok(state.audio.time>1);fs.mkdirSync('.sites-runtime/camera132',{recursive:true});await p.screenshot({path:'.sites-runtime/camera132/entrance-no-orbit.png'});
if(process.argv.includes('--all-chapters')){
 await p.emulateMedia({reducedMotion:'reduce'});
 await p.evaluate(()=>{window.camera132Samples=[];window.camera132Timer=setInterval(()=>{const e=document.querySelector('.mentor-cinematic .home-intro-content');if(e?.dataset.lectureShot)window.camera132Samples.push(JSON.parse(e.dataset.lectureShot));},40);});
 for(let chapter=1;chapter<=6;chapter++){
  await p.getByRole('button',{name:'跳过本段',exact:true}).click();
  await p.waitForFunction(chapter=>{const e=document.querySelector('.mentor-cinematic .home-intro-content'),s=e?.dataset.lectureShot&&JSON.parse(e.dataset.lectureShot);if(e?.dataset.flightError)throw Error(e.dataset.flightError);return s?.chapter===chapter&&!s.transitioning&&!s.departingBoat;},chapter,{timeout:60000});
  await p.waitForTimeout(400);console.log('chapter',chapter,await p.locator('.mentor-cinematic .home-intro-content').getAttribute('data-lecture-shot'));
 }
 const samples=await p.evaluate(()=>{clearInterval(window.camera132Timer);return window.camera132Samples;});
 const boarding=samples.filter(s=>s.departingBoat);assert.ok(boarding.length>5,'Must exercise real disembark');assert.ok(boarding.every(s=>!s.boardVisible),'Board must be stowed before walking onto the bank');
 await p.screenshot({path:'.sites-runtime/camera132/returned-to-tower.png'});console.log('PASS full route, board hidden throughout disembark; samples',samples.length);
}
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
