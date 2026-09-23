const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

// Picking a编制 used to POST the job and then poll /api/jobs/<id>, which only
// knew about in-memory recognition jobs and answered 404 for a queue task, so
// the generated score was never opened. This drives the real UI path.
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  // The generation models only accept 4/4, so pick a qualifying score instead
  // of the first one in the library.
  const digest=process.env.DIGEST||await page.evaluate(async()=>{
   const data=await (await fetch('/api/scores')).json();
   for(const score of (data.scores||[])){
    if(!(score.ready&&score.hasPdf&&score.status==='complete'))continue;
    const item=await (await fetch(`/api/scores/${score.id}`)).json();
    const xml=item.xml||'';
    const beats=/<beats>\s*([^<]+?)\s*<\/beats>/.exec(xml)?.[1];
    const beatType=/<beat-type>\s*([^<]+?)\s*<\/beat-type>/.exec(xml)?.[1];
    if(beats==='4'&&beatType==='4')return score.id;
   }
   return null;
  });
  if(!digest){console.log('no ready score available, skipping');await browser.close();return;}
  await page.locator(`[data-score-id="${digest}"]`).click();
  await page.waitForFunction(()=>document.querySelectorAll('#notation .engraved-sheet').length>0,null,{timeout:90000});
  const before=await page.locator('#score-title').textContent();
  assert.ok(!/室内弦乐/.test(before),'starting from the original score');

  await page.selectOption('#arrangement-select','chamber');
  await page.waitForFunction(()=>/室内弦乐/.test(document.querySelector('#score-title').textContent)&&document.querySelectorAll('#notation .note-event').length>0,null,{timeout:600000});
  const result=await page.evaluate(()=>({
   title:document.querySelector('#score-title').textContent,
   subtitle:document.querySelector('#score-subtitle').textContent,
   status:document.querySelector('#play-status').textContent,
   notes:document.querySelectorAll('#notation .note-event').length,
   drums:document.querySelectorAll('#notation .drum-hit').length,
  }));
  console.log(result);
  assert.match(result.title,/室内弦乐/,'the generated score must be loaded');
  assert.ok(result.notes>0,'the engraving must contain playable events');
  // Autoplay may already have taken over the status line, so accept either the
  // idle "ready" text or an active transport state.
  assert.ok(/就绪|载入|正在播放|已暂停/.test(result.status),'the playback panel must report readiness');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'.sites-runtime/arrangement-load.png'});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
