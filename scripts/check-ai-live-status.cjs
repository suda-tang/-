const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.route('**/api/scores',r=>r.fulfill({json:{scores:[]}}));
  await page.route('**/api/ai-tasks**',r=>r.fulfill({json:{tasks:[]}}));
  await page.addInitScript(()=>{
   const original=window.fetch;
   window.fetch=(url,options)=>{
    if(String(url)!=='/api/workspace-ai')return original(url,options);
    const encoder=new TextEncoder();let timer;
    const events=[{type:'status',text:'核对选曲条件：德国、后浪漫主义、无弦乐'},{type:'status',text:'核对选曲条件：德国、后浪漫主义、无弦乐'},{type:'status',text:'正在核对具体乐章的曲式依据'},{type:'delta',text:'**候选作品**：曲式尚待谱面核实。'},{type:'status',text:'不应覆盖正文的迟到状态'},{type:'result',reply:'**候选作品**：曲式尚待谱面核实。',actions:[]}];
    return Promise.resolve(new Response(new ReadableStream({start(controller){let i=0;timer=setInterval(()=>{controller.enqueue(encoder.encode(JSON.stringify(events[i++])+'\n'));if(i===events.length){clearInterval(timer);controller.close();}},300);},cancel(){clearInterval(timer);}}),{headers:{'Content-Type':'application/x-ndjson'}}));
   };
  });
  await page.goto('http://127.0.0.1:5173/');await page.click('#workspace-ai');await page.locator('.ai-conversation input').fill('德国后浪漫主义选曲');await page.locator('.ai-conversation form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>document.querySelector('.ai-operation-detail')?.textContent.includes('具体乐章'));
  assert.equal(await page.locator('.ai-operation-detail').count(),1);
  assert.ok(!(await page.locator('.ai-operation-detail').textContent()).includes('德国'));
  assert.equal(await page.locator('.ai-operation-detail .ai-action-step').count(),0);
  await page.waitForFunction(()=>document.querySelector('.ai-streaming-text')?.textContent.includes('候选作品'));
  assert.equal(await page.locator('.ai-operation-detail').count(),0);
  await page.waitForFunction(()=>!document.querySelector('.ai-conversation').classList.contains('is-thinking'));
  assert.equal(await page.locator('.ai-operation-detail').count(),0);
  console.log('PASS single live status, replacement, duplicates, first-token dismissal, late status:',width);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
