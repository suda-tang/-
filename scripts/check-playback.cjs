const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1360,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/health',r=>r.fulfill({json:{omr:false}}));
 // Keep prior server-library fixtures from bypassing the mocked OMR path.
 await page.route('**/api/scores/*',r=>r.fulfill({status:404,json:{error:'No cached fixture'}}));
 try{
 await page.goto('http://192.168.2.6:5173/');await page.locator('#sample-button').click();
 await page.locator('#play-button').click();await page.waitForFunction(()=>document.querySelector('#play-button').textContent.includes('暂停'));
 await page.waitForTimeout(350);assert.equal(await page.locator('#accuracy').innerText(),'—');
 await page.locator('#tempo').fill('160');await page.locator('#tempo').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('#play-status').textContent.includes('160 BPM'));
 await page.locator('#play-button').click();const paused=await page.locator('#progress-label').innerText();await page.waitForTimeout(300);assert.equal(await page.locator('#progress-label').innerText(),paused);
 await page.locator('#play-button').click();await page.waitForFunction(()=>document.querySelector('#play-button').textContent.includes('暂停'));await page.locator('#play-reset').click();assert.equal(await page.locator('#progress-label').innerText(),'0%');
 await page.locator('#autoplay').check();await page.locator('#xml-input').setInputFiles('tests/playback.musicxml');await page.waitForFunction(()=>document.querySelector('#score-title').textContent==='导入与播放测试');await page.waitForFunction(()=>document.querySelector('#play-button').textContent.includes('暂停'));assert.equal(await page.locator('.note-event').count(),3);
 const parsed=await page.evaluate(async xml=>(await import('/score.js')).parseMusicXML(xml),fs.readFileSync('tests/playback.musicxml','utf8'));
 assert.deepEqual(parsed.events.map(e=>e.beat),[1,2,5]);assert.equal(parsed.events[1].notes[0].duration,3);assert.equal(parsed.totalBeats,8);
 await page.locator('#play-button').click();
 const audio=await page.evaluate(async()=>{const {ScorePlayer}=await import('/player.js');const p=new ScorePlayer();p.load({events:[{beat:0,notes:[{midi:60,duration:4}]}]});await p.play();const a=p.context.createAnalyser();p.output.connect(a);await new Promise(r=>setTimeout(r,600));const data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);const energy=data.reduce((s,x)=>s+x*x,0)/data.length;p.stop();await p.context.close();return energy;});assert.ok(audio>0.000001,'actual Web Audio output must be nonzero');
 await page.locator('#pdf-input').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('bad')});await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('不是有效'));assert.equal(await page.locator('#play-button').isDisabled(),true);
  await page.locator('#pdf-input').setInputFiles('outputs/test-score.pdf');await page.waitForFunction(()=>document.querySelectorAll('#pdf-pages canvas,#pdf-pages img').length===1);await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('缺少 Audiveris'));assert.equal(await page.locator('#notice').getAttribute('class'),'notice warning');assert.equal(await page.locator('#play-button').isDisabled(),true);assert.equal(await page.locator('#retry-import').isVisible(),true);
 // Mock only the OMR transport to verify the frontend's completion/autoplay path.
 // This is explicitly not an end-to-end test of Audiveris.
 await page.route('**/api/health',r=>r.fulfill({json:{omr:true}}));
 await page.route('**/api/recognize',r=>r.fulfill({json:{id:'fixture',status:'complete',xml:fs.readFileSync('tests/playback.musicxml','utf8')}}));
 await page.locator('#retry-import').click();await page.waitForFunction(()=>document.querySelector('#score-title').textContent==='导入与播放测试');await page.waitForFunction(()=>document.querySelector('#play-button').textContent.includes('暂停'));
 await page.screenshot({path:'outputs/playback-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'outputs/playback-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS: LAN PDF preview/errors, MusicXML autoplay, pause/resume, live tempo, ties/rests, real audio output, responsive layout; OMR completion tested with mocked transport only.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
