const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext();
  const login=await context.request.post('http://127.0.0.1:5173/api/upload/login',{data:{password:process.env.PIANO_UPLOAD_PASSWORD||'tqm'}});
  if(!login.ok())throw Error('Upload login failed');
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173/voice-record.html');
  const button=page.getByRole('button',{name:process.argv[2]==='full'?'声学全参数训练试听':'全部素材训练试听',exact:true});await button.waitFor({timeout:15000});await button.click();
  const audio=page.locator('.mentor-audio').last();await audio.waitFor();
  await page.waitForFunction(()=>{const a=document.querySelector('.mentor-audio');return a&&a.readyState>=2&&a.duration>0;},{},{timeout:20000});
  await audio.evaluate(a=>a.play());
  await page.waitForFunction(()=>{const a=document.querySelector('.mentor-audio');return a&&a.currentTime>.25;},{},{timeout:15000});
  const result=await audio.evaluate(a=>{const result={duration:a.duration,time:a.currentTime,error:a.error?.message||null};a.pause();return result;});
  if(result.error||result.time<=0)throw Error(JSON.stringify(result));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
