const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 for(const mobile of [true,false]){
  const browser=await chromium.launch({channel:'msedge',headless:true,proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});
  try{
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1360,height:960},isMobile:mobile,hasTouch:mobile});
   // Exercise the blocked-autoplay branch deterministically; real media decoding and clicks remain native.
   await page.addInitScript(()=>{const native=HTMLMediaElement.prototype.play;window.__mentorGesture=false;document.addEventListener('click',()=>window.__mentorGesture=true,true);HTMLMediaElement.prototype.play=function(){if(this.closest('.mentor-cinematic')&&!window.__mentorGesture)return Promise.reject(new DOMException('autoplay blocked','NotAllowedError'));return native.call(this);};});
   await page.goto('http://127.0.0.1:5173/?tour=1&auto=0&mentor='+encodeURIComponent('李克勤'),{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('.mentor-cinematic')?.dataset.phase==='lecture',{},{timeout:45000});
   await page.locator('.mentor-sound-unlock').waitFor({state:'visible'});
   await page.locator('.mentor-sound-unlock').click({timeout:8000});
   await page.waitForFunction(()=>{const a=document.querySelector('.mentor-cinematic audio');return a&&!a.paused&&a.currentTime>.5&&a.readyState>=2;},{},{timeout:15000});
   const first=await page.locator('.mentor-cinematic audio').evaluate(a=>a.currentSrc);
   assert.match(first,/narration\//);
   await page.locator('.mentor-caption-actions button').first().click();
   await page.waitForFunction(()=>{const a=document.querySelector('.mentor-cinematic audio');return a?.currentSrc.includes('mentor-context')&&!a.paused&&a.currentTime>.4;});
   console.log('PASS',mobile?'mobile':'desktop','real start-button click and next chapter',first);
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
