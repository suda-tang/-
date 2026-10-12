const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'],proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{let type='auto';window.sessionChecks=[];window.testStreams=[];Object.defineProperty(navigator,'audioSession',{configurable:true,value:{get type(){return type;},set type(value){type=value;window.sessionChecks.push(value);}}});const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{if(type==='playback')throw Error('AudioSession category is not compatible with audio capture.');const stream=await original(options);window.testStreams.push(stream);return stream;};});
 await page.route('**/api/scores',r=>r.fulfill({json:{scores:[]}}));await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>!!document.querySelector('.follow-content'));
 await page.evaluate(()=>document.querySelector('#sample-button').click());await page.waitForFunction(()=>!document.querySelector('#start-button').disabled);
 for(let round=0;round<2;round++){
  await page.evaluate(async()=>{const {ScorePlayer}=await import('/player.js?v=bounded-cache2');window.sessionPlayer??=new ScorePlayer();await window.sessionPlayer.unlock();window.sessionPlayer.pause();await document.querySelector('#start-button').onclick();});
  assert.equal(await page.locator('#mic-label').textContent(),'麦克风已开启');assert.equal(await page.evaluate(()=>navigator.audioSession.type),'play-and-record');
  if(round===0)await page.waitForTimeout(3200);
  await page.evaluate(()=>document.querySelector('#stop-button').onclick());assert.equal(await page.evaluate(()=>navigator.audioSession.type),'playback',JSON.stringify(await page.evaluate(()=>({changes:window.sessionChecks,mic:document.querySelector('#mic-label').textContent,streams:window.testStreams.map(s=>s.getTracks().map(t=>t.readyState))}))));assert.ok(await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));assert.ok(!(await page.locator('#notice').textContent()).includes('Unknown dtype'));
 }
 assert.deepEqual(errors,[]);console.log('PASS real browser capture with synthetic microphone: playback → practice → pause → playback → practice, input tracks released');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
