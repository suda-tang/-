const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const reply='如果你是在问***钢琴演奏或音乐教学***相关的问题，可以详细描述一下。比如：- 日常练习怎样安排？- &#x548C;声分析如何应用？\n\n**本次建议**\n1. 先慢练\n2. 再连贯弹奏\n\n[参考资料](https://example.com/score)';
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];let calls=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/scores',r=>r.fulfill({json:{scores:[]}}));
  await page.route('**/api/ai-tasks**',r=>r.fulfill({json:{tasks:[{id:'format-fixture',kind:'ai',status:'complete',created:1,label:'格式检查',result:reply}]}}));
  await page.route('**/api/workspace-ai',r=>{calls++;const events=calls===1?[{type:'status',text:'已取得问题，正在准备回复。'},...reply.match(/.{1,13}/gs).map(text=>({type:'delta',text})),{type:'result',reply,actions:[]}]:[{type:'result',reply:'**第二次回复**：只返回完整结果也能正常显示。',actions:[]}];return r.fulfill({contentType:'application/x-ndjson',body:events.map(x=>JSON.stringify(x)).join('\n')+'\n'});});
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>!!document.querySelector('#workspace-ai'));
  await page.click('#workspace-ai');await page.locator('.ai-conversation input').fill('格式检查');await page.locator('.ai-conversation form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>!document.querySelector('.ai-conversation').classList.contains('is-thinking'));
  const assistant=page.locator('.ai-messages > .assistant').last();
  assert.equal(await assistant.locator('strong').first().textContent(),'钢琴演奏或音乐教学');
  assert.equal(await assistant.locator('ul li').count(),2);assert.equal(await assistant.locator('ol li').count(),2);
  assert.ok((await assistant.textContent()).includes('和声分析'));assert.ok(!(await assistant.textContent()).includes('&#x548C;'));
  assert.equal(await assistant.locator('a').getAttribute('rel'),'noopener noreferrer');
  assert.equal(await page.locator('.ai-json-view').count(),0);
  assert.ok(await assistant.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  const safe=await page.evaluate(async()=>{
   const {renderAssistantText}=await import('/ai-text.js');const root=document.createElement('div');
   renderAssistantText(root,'**正常加粗** &#x548C; &amp;lt;script&amp;gt;window.injected=true&lt;/script&gt;\n[危险链接](javascript:alert(1))\n<img src=x onerror=alert(1)>');
   return {strong:root.querySelector('strong')?.textContent,safe:!root.querySelector('script,img,a')&&!window.injected,text:root.textContent};
  });assert.equal(safe.strong,'正常加粗');assert.ok(safe.safe&&safe.text.includes('和'));
  await page.screenshot({path:'.sites-runtime/ai-text-'+width+'.png'});
  await page.locator('.ai-conversation input').fill('再回复一次');await page.locator('.ai-conversation form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>!document.querySelector('.ai-conversation').classList.contains('is-thinking'));
  assert.equal(await page.locator('.ai-messages > .assistant').last().locator('strong').textContent(),'第二次回复');
  await page.waitForFunction(()=>!!document.querySelector('.ai-task-result .ai-formatted-text strong'));
  assert.deepEqual(errors,[]);console.log('PASS rich streaming reply, entities, lists, saved results, HTML safety, result-only response:',width);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
