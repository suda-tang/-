const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/portrait-upload.html');const result=await page.evaluate(async()=>{
 const {classroomRequest}=await import('/classroom-request.js');const {abortTimeout}=await import('/abort-timeout.js');const original=window.fetch;let reads=0,writes=0;
 window.fetch=async()=>{if(++reads===1)throw new DOMException('Fetch is aborted','AbortError');return new Response(JSON.stringify({ok:true}))};
 const read=await classroomRequest('/read');
 window.fetch=async()=>{writes++;throw new DOMException('Fetch is aborted','AbortError')};let message;try{await classroomRequest('/create',{title:'test'})}catch(e){message=e.message}
 const wait=abortTimeout(null,100);await new Promise(r=>setTimeout(r,65));wait.reset();await new Promise(r=>setTimeout(r,65));const active=!wait.signal.aborted;wait.dispose();
 const parent=new AbortController(),child=abortTimeout(parent.signal,1000);parent.abort();const cancelled=child.signal.aborted;child.dispose();window.fetch=original;return {read,reads,writes,message,active,cancelled};
 });assert(result.read.ok);assert.equal(result.reads,2);assert.equal(result.writes,1);assert(!result.message.includes('Fetch is aborted'));assert(result.active);assert(result.cancelled);console.log('PASS browser: aborted read recovers, writes never duplicated, streaming extends idle deadline, parent cancellation preserved');}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
