const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];let request;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/scores',r=>r.fulfill({json:{scores:[]}}));
  await page.route('**/api/ai-tasks**',r=>r.fulfill({json:{tasks:[]}}));
  await page.route('**/api/tasks',r=>r.fulfill({json:{tasks:[{id:'test-job',kind:'arrangement',status:'failed',scoreTitle:'测试作品',error:'测试错误',created:1}],foreground:{}}}));
  await page.route('**/api/workspace-ai',async r=>{request=r.request().postDataJSON();const configure=request.messages.at(-1).content.includes('小提琴');const reply=configure?'准备设置小提琴，加入鼓声部。':'已读取任务状态。';const actions=configure?[{type:'configure_arrangement',value:{style:'custom',programs:[40],drums:true}}]:[];await r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'delta',text:reply})+'\n'+JSON.stringify({type:'result',reply,actions})+'\n'});});
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5173/');
  await page.waitForFunction(()=>document.documentElement.dataset.workspaceReady==='true'&&document.querySelectorAll('input[name="arrangement-program"]').length>0);
  await page.waitForFunction(()=>!!document.querySelector('#workspace-tasks .task-center'));
  const result=await page.evaluate(async()=>{
   const {configureArrangement}=await import('/arrangement-intent.js');
   configureArrangement({style:'custom',programs:[40,42],drums:false});
   const before=document.querySelector('#arrangement-select').value;
   let rejected=false;try{configureArrangement({style:'custom',programs:[999],drums:true});}catch{rejected=true;}
   if(!rejected||document.querySelector('#arrangement-select').value!==before||document.querySelector('#generation-drums').checked)throw Error('invalid config changed controls');
   const generation=await new Promise(resolve=>document.dispatchEvent(new CustomEvent('ai-generate-arrangement',{detail:{resolve:()=>resolve('unexpected-success'),reject:e=>resolve(e.message)}})));
   return {generation,programs:[...document.querySelectorAll('input[name="arrangement-program"]:checked')].map(i=>Number(i.value)),panels:['library','play','arrange','tasks'].every(id=>!!document.querySelector('.setup > .workspace-stage #workspace-'+id)),taskInside:!!document.querySelector('#workspace-tasks .task-center')};
  });
  assert.deepEqual(result.programs,[40,42]);assert.equal(result.generation,'请先打开云曲谱');assert.ok(result.panels&&result.taskInside);
  await page.click('#workspace-ai');await page.locator('.ai-conversation input').fill('为什么任务失败了？');await page.locator('.ai-conversation form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>document.querySelector('.ai-messages').textContent.includes('已读取任务状态。'));
  assert.equal(request.context.settings.drums,false);assert.deepEqual(request.context.settings.arrangementPrograms,[40,42]);
  assert.equal(request.context.arrangementCapabilities.programs.length,34);assert.ok(request.context.tasks.syncedAt);assert.equal(request.context.tasks.items[0].stage,'测试错误');
  assert.equal(request.context.practice,null);assert.deepEqual(errors,[]);
  assert.equal(await page.locator('.ai-json-view').count(),0);
  await page.waitForFunction(()=>!document.querySelector('.ai-conversation').classList.contains('is-thinking'));
  await page.locator('.ai-conversation input').fill('改为小提琴，加入鼓声部，只设置参数');await page.locator('.ai-conversation form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>document.querySelector('#generation-drums').checked&&!document.body.classList.contains('ai-executing'));
  assert.equal(await page.locator('input[name="arrangement-program"]:checked').count(),1);
  assert.equal(await page.locator('input[name="arrangement-program"]:checked').inputValue(),'40');
  assert.equal(await page.locator('#workspace-arrange').isVisible(),true);
  console.log('PASS integrated context, atomic config, truthful generation, original four-panel frame:',width);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
