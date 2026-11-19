const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [390,1360]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});
  await page.addInitScript(()=>{Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});localStorage.removeItem('classroom-session');});
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:120000});
  await page.waitForSelector('#workspace-ai',{timeout:60000});
  await page.locator('.workspace-nav [data-panel=play]').click();
  await page.locator('.score-classroom>summary').click();
  await page.waitForSelector('.classroom-setup',{timeout:30000});
  assert.equal(await page.locator('.classroom-mount').innerText().then(t=>t.includes('randomUUID is not a function')),false);
  await page.locator('.workspace-nav [data-panel=library]').click();
  await page.locator('[data-photos]').evaluate(el=>{for(let parent=el.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});
  await page.locator('[data-photos]').click();
  assert.equal(await page.locator('dialog.photo-book-dialog').evaluate(d=>d.open),true);
  await page.locator('dialog.photo-book-dialog [data-close]').click();
  const position=await page.locator('header.top').evaluate(el=>getComputedStyle(el).position);
  assert.equal(position,'sticky');
  const ids=await page.evaluate(async()=>{const {resourceId}=await import('/resource-id.js');return Array.from({length:50},()=>resourceId());});
  assert.equal(new Set(ids).size,50);
  let requests=0;
  await page.route('**/api/scores',async route=>{requests++;await new Promise(r=>setTimeout(r,150));await route.fulfill({json:{scores:[]}});});
  const count=await page.evaluate(async()=>{const {fetchCatalog}=await import('/catalog-request.js');await new Promise(r=>setTimeout(r,700));return (await Promise.all(Array.from({length:48},()=>fetchCatalog()))).length;});
  assert.equal(count,48);assert.ok(requests<=2,`catalog requests: ${requests}`);
  assert.deepEqual(errors,[]);
  console.log('PASS',width,{classroomWithoutSecureUUID:true,photos:true,sticky:true,catalogRequests:requests});
  await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
