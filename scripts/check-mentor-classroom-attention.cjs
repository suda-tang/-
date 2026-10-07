const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:900,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__classroom-test',r=>r.fulfill({contentType:'text/html',body:'<style>.avatar-3d-stage{width:640px;height:640px}</style><main></main>'}));
  await page.goto('http://127.0.0.1:5173/__classroom-test');
  await page.evaluate(async()=>{
   const {attachNarrationAvatar}=await import('/narration-avatar.js?v=classroom7');const audio=document.createElement('audio');
   window.testElapsed=.2;Object.defineProperties(audio,{paused:{get:()=>false},ended:{get:()=>false},readyState:{get:()=>4},currentTime:{get:()=>window.testElapsed}});
   window.disposeTestAvatar=attachNarrationAvatar(document.querySelector('main'),audio,{embedded:true});
  });
  await page.waitForSelector('[data-ready=true]');
  const snapshot=()=>page.locator('.narration-avatar').evaluate(n=>({...n.dataset}));
  await page.waitForTimeout(700);const visitor=await snapshot();
  await page.evaluate(()=>{window.testElapsed=3;document.dispatchEvent(new CustomEvent('mentor-lesson',{detail:{mode:'writing',progress:.3,title:'课堂',points:['合奏']}}));});
  await page.waitForTimeout(1100);const board=await snapshot();await page.screenshot({path:'.sites-runtime/avatar-source/mentor-attention-board.png'});
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('mentor-lesson',{detail:{mode:'slides',progress:.7,title:'课堂',points:['反馈']}})));
  await page.waitForTimeout(1100);const slides=await snapshot();
  await page.evaluate(()=>window.testElapsed=6);await page.waitForTimeout(1100);const returned=await snapshot();
  assert.equal(visitor.attention,'visitor');assert.equal(board.attention,'board');assert.equal(slides.attention,'slides');assert.equal(returned.attention,'visitor');
  assert.ok(Number(board.headYaw)-Number(visitor.headYaw)>.15);assert.ok(Number(board.headYaw)-Number(returned.headYaw)>.15);assert.ok(Math.abs(Number(board.gazeY)-Number(visitor.gazeY))>.001);
  assert.deepEqual(errors,[]);console.log({visitor,board,slides,returned});await page.evaluate(()=>window.disposeTestAvatar());
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
