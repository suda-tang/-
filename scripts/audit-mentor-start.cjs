const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=document-user-activation-required'],proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:5173/?tour=1&auto=0',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.mentor-cinematic',{timeout:45000});
  for(let i=0;i<12;i++){await page.waitForTimeout(2000);const state=await page.evaluate(()=>{const scene=document.querySelector('.mentor-cinematic'),button=scene?.querySelector('.mentor-sound-unlock'),audio=scene?.querySelector('audio');const r=button?.getBoundingClientRect();return {phase:scene?.dataset.phase,button:button?.textContent,hidden:button?.hidden,rect:r&&{x:r.x,y:r.y,w:r.width,h:r.height},hit:r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.className,media:audio&&{src:audio.currentSrc,time:audio.currentTime,paused:audio.paused,ready:audio.readyState,error:audio.error?.message},caption:scene?.querySelector('.mentor-loading')?.textContent};});console.log(JSON.stringify(state));if(state.phase==='lecture')break;}
  await page.screenshot({path:'audit/mentor-start-before.png'});
  const button=page.locator('.mentor-sound-unlock');
  if(await button.isVisible()){try{await button.click({timeout:6000});console.log('CLICK OK');}catch(e){console.log('CLICK FAILED',e.message.slice(-1200));}}
  await page.waitForTimeout(2000);
  const result=await page.evaluate(()=>({phase:document.querySelector('.mentor-cinematic')?.dataset.phase,audio:[...document.querySelectorAll('.mentor-cinematic audio')].map(a=>({src:a.currentSrc,time:a.currentTime,paused:a.paused,ready:a.readyState,error:a.error?.message})),buttonHidden:document.querySelector('.mentor-sound-unlock')?.hidden}));
  fs.writeFileSync('audit/mentor-start-result.json',JSON.stringify({result,errors},null,2));console.log('FINAL',JSON.stringify({result,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
