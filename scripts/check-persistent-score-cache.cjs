const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');
 async function open(){const card=page.locator('.library-score[data-ready="true"]').first();await card.waitFor();const start=Date.now();await card.click();await page.locator('.score-loading-overlay').waitFor({state:'hidden',timeout:60000});assert.ok(await page.locator('#notation .engraved-sheet svg').count()>0);return Date.now()-start;}
 const firstMs=await open();
 const cacheMs=await open();
 await page.reload();
 const reloadMs=await open();
 console.log({firstMs,cacheMs,reloadMs,errors});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
