const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1360,height:900},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const scores=['待恢复的作品','Probe'].map((title,i)=>({id:String(i+1).repeat(64),title,ready:false,status:'failed',hasPdf:false,error:'测试用诊断：识谱输出不完整'}));
 await page.route('**/api/scores',r=>r.fulfill({json:{scores}}));
 await page.goto('http://127.0.0.1:5173');
 await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:90000});
 await page.waitForSelector('.library-pending-toggle');
 assert.equal(await page.locator('.library-score').count(),1,'test imports should be hidden by default');
 await page.locator('.library-pending-toggle').click();
 await page.waitForFunction(()=>document.querySelector('.library-pending-toggle').getAttribute('aria-expanded')==='true');
 await page.locator('.library-score').click();
 await page.waitForSelector('dialog.score-recovery-dialog[open]');
 assert.ok((await page.locator('dialog.score-recovery-dialog').innerText()).includes('重新选择源文件'));
 await page.locator('dialog.score-recovery-dialog button').last().click();
 const toggle=page.locator('input[aria-label="显示测试导入"]');
 await toggle.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
 // Settings belong to the compact library, so close the fullscreen first.
 await page.evaluate(()=>document.querySelector('.library-browser')?.close());
 await toggle.evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change'));});
 await page.waitForTimeout(1200);
 assert.deepEqual(errors,[]);
 console.log('PASS pending aria-expanded, failed-card recovery and non-destructive test filtering');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
