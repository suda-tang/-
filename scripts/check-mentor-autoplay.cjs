const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{for(const allow of [false,true]){
 const browser=await chromium.launch({channel:'msedge',headless:true,args:[allow?'--autoplay-policy=no-user-gesture-required':'--autoplay-policy=user-gesture-required']});
 try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/?tour=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('.mentor-cinematic')?.dataset.phase==='lecture',{},{timeout:45000});
 await page.waitForFunction(()=>document.querySelector('.mentor-cinematic audio')?.readyState>=2);
 if(!allow){await page.waitForTimeout(1000);await page.mouse.click(80,180);}
 await page.waitForFunction(()=>{const a=document.querySelector('.mentor-cinematic audio');return a&&!a.paused&&!a.muted&&a.volume===1&&a.currentTime>.4;},{},{timeout:10000});
 const state=await page.locator('.mentor-cinematic audio').evaluate(a=>({time:a.currentTime,muted:a.muted,volume:a.volume,error:a.error?.message}));assert.deepEqual(errors,[]);assert.ok(!state.error);console.log(allow?'PASS automatic audible playback':'PASS gesture unlock',state);
 await page.locator('.mentor-caption-actions button').first().click();
 await page.waitForFunction(()=>{const a=document.querySelector('.mentor-cinematic audio');return a?.src.includes('mentor-context')&&!a.paused&&!a.muted&&a.currentTime>.3;});console.log('PASS next segment stays unmuted');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exit(1)});
