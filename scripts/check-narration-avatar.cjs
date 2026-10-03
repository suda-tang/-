const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__avatar-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/narration-avatar.css"></head><body><main></main></body></html>'}));
  // This is a local playback fixture, not a published generated video.
  await page.route('**/__avatar-fixture.mp4',r=>r.fulfill({contentType:'video/mp4',body:fs.readFileSync(path.resolve('.sites-runtime/voice-reference/f922ad0fa273a637876ad1b4d9ddbef3.mp4'))}));
  await page.route('**/narration/avatar-manifest.json',r=>r.fulfill({json:{chapters:[{audio:'/narration/mentor-preface.m4a',video:'/__avatar-fixture.mp4',complete:true}],preview:{video:'/__avatar-fixture.mp4'}}}));
  await page.goto('http://127.0.0.1:5173/__avatar-test');
  await page.evaluate(async()=>{const {attachNarrationAvatar}=await import('/narration-avatar.js');window.testAudio=new Audio('/narration/mentor-preface.m4a');document.body.append(testAudio);window.disposeAvatar=attachNarrationAvatar(document.querySelector('main'),testAudio);});
  await page.waitForFunction(()=>document.querySelector('.narration-avatar video')?.readyState>=2);
  await page.evaluate(()=>testAudio.play());
  await page.waitForFunction(()=>!document.querySelector('.narration-avatar video').paused);
  await page.evaluate(()=>{testAudio.currentTime=4;testAudio.playbackRate=1.25;});
  await page.waitForFunction(()=>Math.abs(testAudio.currentTime-document.querySelector('.narration-avatar video').currentTime)<.35&&document.querySelector('.narration-avatar video').playbackRate===1.25);
  await page.evaluate(()=>testAudio.pause());
  assert.ok(await page.locator('.narration-avatar video').evaluate(v=>v.paused));
  await page.locator('.avatar-preview-button').click();
  assert.ok(await page.locator('dialog').evaluate(d=>d.open));
  assert.ok(await page.evaluate(()=>testAudio.paused));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog'));
  await page.evaluate(()=>{testAudio.src='/narration/tang-introduction.m4a';testAudio.load();});
  await page.waitForFunction(()=>document.querySelector('.narration-avatar').hidden);
  await page.evaluate(()=>disposeAvatar());assert.equal(await page.locator('.narration-avatar').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,sync:true,pause:true,seek:true,rate:true,preview:true,cleanup:true}));await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
