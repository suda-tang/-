const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('assert');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
 const ctx=await browser.newContext({permissions:['microphone']});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:5189/voice-record.html#key='+process.argv[2]);
 await p.waitForFunction(()=>document.querySelectorAll('#saved li').length===4);
 assert.equal(await p.locator('#segments button').count(),4);assert(!p.url().includes('key='));
 await p.locator('#record').click();await p.waitForSelector('body.recording');await p.waitForTimeout(8500);await p.locator('#stop').click();await p.waitForFunction(()=>!document.querySelector('#save').disabled);
 assert(await p.locator('audio').isVisible());await p.locator('#save').click();await p.waitForFunction(()=>document.querySelector('#percent').textContent==='已保存');
 await p.waitForFunction(()=>document.querySelector('#saved').textContent.includes('已保存 1 次')); 
 await p.locator('#next').click();assert((await p.locator('#label').innerText()).includes('第 2 段'));
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'.sites-runtime/voice-record-mobile.png',fullPage:true});
 const denied=await ctx.request.get('http://127.0.0.1:5189/api/voice-reference');assert.equal(denied.status(),403);
 const invalid=await ctx.request.post('http://127.0.0.1:5189/api/voice-reference',{headers:{'X-Voice-Key':process.argv[2],'X-Voice-Prompt':'introduction','X-Voice-Duration':'20','Content-Type':'audio/webm'},data:Buffer.alloc(2000)});assert.equal(invalid.status(),400);
 const wav=Buffer.alloc(44+22050*2*50);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 await p.locator('#mentor-file').setInputFiles({name:'测试导师素材.wav',mimeType:'audio/wav',buffer:wav});await p.locator('#mentor-preface').fill('');assert.equal(await p.locator('#mentor-upload').isDisabled(),false);await p.locator('#mentor-upload').click();await p.waitForFunction(()=>document.querySelector('#mentor-message').textContent.includes('授权确认'));await p.locator('#mentor-consent').check();await p.locator('#mentor-upload').click();await p.waitForFunction(()=>document.querySelector('#mentor-percent').textContent==='已保存');await p.waitForFunction(()=>document.querySelector('#mentor-saved').textContent.includes('测试导师素材.wav')); 
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS: recorder, mentor 3-chunk upload, consent gate, mobile width, private authorization');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
