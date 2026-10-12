const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});
 try{for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/scores',r=>r.fulfill({json:{scores:[]}}));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>!!document.querySelector('.practice-fingering'),null,{timeout:60000});
  await page.evaluate(async()=>{
   const {sampleScore,fallbackMusicXML}=await import('/score.js?v=chunk-plan4');
   const fixture=sampleScore();fixture.title='指法双手测试';
   const xml=fallbackMusicXML(fixture).replace('<staff>1</staff>','<staff>1</staff><notations><technical><fingering>1</fingering></technical></notations>');
   const input=document.querySelector('#xml-input'),files=new DataTransfer();files.items.add(new File([xml],'fingering-test.musicxml',{type:'application/xml'}));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>{let c;document.dispatchEvent(new CustomEvent('practice-command',{detail:{action:'fingering-context',resolve:x=>c=x}}));return c?.score?.title==='指法双手测试'&&document.querySelectorAll('[data-fingering-notes]').length>0;},null,{timeout:60000});
  const before=await page.evaluate(()=>{let c;document.dispatchEvent(new CustomEvent('practice-command',{detail:{action:'fingering-context',resolve:x=>c=x}}));window.fingerOriginal=c.score;return JSON.stringify(c.score.events);});
  await page.evaluate(()=>document.querySelector('[data-finger-generate]').click());
  await page.waitForFunction(()=>document.querySelector('.fingering-message').textContent.includes('指法已保存'),null,{timeout:90000});
  await page.waitForFunction(()=>document.querySelectorAll('.practice-finger').length>=19);
  const checks=await page.evaluate(async()=>{
   const {fingeringNotes,annotatedXML}=await import('/practice-fingering.js?v=1');
   const source=window.fingerOriginal,ns=fingeringNotes(source,'P1'),fs=Object.fromEntries(ns.map(n=>[n.id,1]));
   const xml=annotatedXML(source,ns,fs),{parseMusicXML}=await import('/score.js?v=chunk-plan4'),parsed=parseMusicXML(xml);
   const timing=s=>s.events.map(e=>({beat:e.beat,notes:e.notes.map(n=>({midi:n.midi,duration:n.duration,staff:n.staff,part:n.part}))}));
   document.querySelector('[data-finger-visible]').click();await new Promise(r=>requestAnimationFrame(r));const hidden=document.querySelector('#notation').classList.contains('practice-fingers-hidden');document.querySelector('[data-finger-visible]').click();
   const label=document.querySelector('.practice-finger');label.dispatchEvent(new MouseEvent('click',{bubbles:true}));const editor=document.querySelector('.fingering-editor'),editable=!editor.hidden;editor.querySelectorAll('button')[3].click();
   return {unchanged:JSON.stringify(source.events),timingBefore:timing(source),timingAfter:timing(parsed),annotations:new DOMParser().parseFromString(xml,'application/xml').querySelectorAll('technical fingering').length,left:ns.filter(n=>n.hand==='left').length,right:ns.filter(n=>n.hand==='right').length,hidden,editable};
  });
  assert.equal(checks.unchanged,before);assert.deepEqual(checks.timingBefore,checks.timingAfter);assert.equal(checks.annotations,20);assert.equal(checks.left,4);assert.equal(checks.right,16);assert.ok(checks.hidden&&checks.editable);assert.deepEqual(errors,[]);
  await page.waitForTimeout(500);console.log(JSON.stringify({width,annotations:checks.annotations,left:checks.left,right:checks.right,timingUnchanged:true,manualEdit:true,errors}));await page.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
