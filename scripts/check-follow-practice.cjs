const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/scores',r=>r.fulfill({json:{scores:[]}}));
  await page.route('**/engine.js',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync('dist/engine.js','utf8')+'\nPitchListener.prototype.start=async function(notes){window.practiceTestNotes=notes;};PitchListener.prototype.stop=function(){};'}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>!!document.querySelector('.follow-content'));
  await page.evaluate(()=>{window.followStates=[];document.addEventListener('practice-state',e=>{window.followLast=e.detail;window.followStates.push(e.detail);});document.querySelector('#sample-button').click();});
  await page.waitForFunction(()=>window.followLast?.total>0);
  const result=await page.evaluate(async()=>{
   const command=(action,extra={})=>{let result;document.dispatchEvent(new CustomEvent('practice-command',{detail:{action,...extra,resolve:r=>result=r}}));return result;};
   const {sampleScore}=await import('/score.js?v=chunk-plan4');const events=sampleScore().events,numbers=[...new Set(events.map(e=>e.measure))];const measure=numbers.at(-1);
   const invalid=command('range',{start:9999,end:1});const selected=command('range',{start:measure,end:measure});
   const expected=events.filter(e=>e.measure===measure);const before=window.followLast;
   await document.querySelector('#start-button').onclick();
   const locked=command('whole');
   let time=0;for(const event of expected){window.practiceTestNotes(event.pitches,time);time+=.75;}
   const after=window.followLast,history=JSON.parse(localStorage.getItem('piano-follow-history-v1')||'[]');
   document.querySelector('#reset-button').click();const reset=window.followLast;
   command('slower');const slow=window.followLast;
   return {invalid,selected,locked,before,after,history,reset,slow,expected:expected.length};
  });
  assert.ok(result.invalid.error);assert.ok(result.locked.error);assert.equal(result.before.total,result.expected);assert.equal(result.before.done,0);assert.equal(result.after.done,result.expected);assert.ok(result.after.complete);assert.equal(result.after.evidence.observations,result.expected);assert.equal(result.history.length,1);assert.equal(result.reset.done,0);assert.equal(result.reset.evidence,null);assert.equal(result.slow.bpm,result.reset.bpm-10);assert.deepEqual(result.slow.range,result.before.range);
  await page.evaluate(()=>{document.querySelector('.practice-settings').open=true;document.querySelector('.workspace-nav [data-panel="play"]')?.click();document.querySelector('[data-action="advice"]').click();});
  await page.waitForFunction(()=>document.querySelector('.ai-conversation').open);
  assert.ok((await page.locator('.ai-conversation input').inputValue()).includes('不要虚构演奏问题'));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,range:result.before.range,observations:result.after.evidence.observations,history:result.history.length,errors}));await page.close();
 }
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
