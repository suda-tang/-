const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('.library-score').first().waitFor();
  const count=await page.locator('.library-score').count();assert.ok(count>0);
  await page.locator('.library-score').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('.note-event').length>0);
  assert.equal(await page.locator('#play-button').isDisabled(),false);
  await page.reload();await page.locator('.library-score').first().waitFor();assert.equal(await page.locator('.library-score').count(),count);
  assert.equal(await page.evaluate(async()=>{const {cleanText}=await import('/library.js');return cleanText('青玉案\uFFFD\uE001 · dolce');}),'青玉案 · dolce');
  assert.deepEqual(errors,[]);console.log('PASS: persisted server library, open historical score, page reload, text cleanup');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
