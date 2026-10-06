// AI 动作执行的守护检查（桩响应驱动，不依赖模型）。
// 守四件事，任何一条回归都直接失败：
//  1. 动作真的空转时，界面必须给出「没有生效」提示（不能默默什么都不说）；
//  2. 已经站在目标面板上时，不要误报「没有生效」；
//  3. 面板名要归一：模型回中文名（「演奏」「任务中心」）也必须切对，不能一律掉回曲库；
//  4. 不认识的动作类型不能静默空转；「只答应不给动作」也要有提示。
// 前提：本地 http://127.0.0.1:5173 已经在跑。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

// 主请求走 SSE(NDJSON)；失败后的「重新核对」走普通 JSON —— 桩必须分开喂，
// 否则解析报错是桩的问题，测不出真问题。
const sse=(reply,actions)=>[
  JSON.stringify({type:'status',text:'正在安排操作'}),
  JSON.stringify({type:'delta',text:reply}),
  JSON.stringify({type:'result',reply,actions})
].join('\n')+'\n';

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,160)));
    let stub=null;
    await page.route('**/api/workspace-ai',async route=>{
      const post=route.request().postData()||'';
      if(post.includes('"repair"')){
        await route.fulfill({status:200,headers:{'Content-Type':'application/json; charset=utf-8'},
          body:JSON.stringify({reply:'重新核对后仍无法确定可执行的操作。',actions:[]})});
        return;
      }
      if(stub)await route.fulfill({status:200,headers:{'Content-Type':'application/json; charset=utf-8'},body:sse(stub.reply,stub.actions)});
      else await route.continue();
    });

    await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:40000});
    await page.locator('#workspace-ai').click();
    await page.waitForTimeout(1000);

    const notices=()=>page.evaluate(()=>[...document.querySelectorAll('.ai-messages p')].filter(x=>x.textContent.includes('注意：')).length);
    const send=async(reply,actions)=>{
      stub={reply,actions};
      const base=await notices();
      await page.locator('.ai-conversation input').fill('检查');
      await page.locator('.ai-conversation input').press('Enter');
      await page.waitForFunction(()=>!document.querySelector('.ai-conversation')?.classList.contains('is-thinking'),null,{timeout:60000});
      await page.waitForTimeout(2200);
      const state=await page.evaluate(()=>({
        workspace:document.body.dataset.workspace||'',
        tail:[...document.querySelectorAll('.ai-messages p')].slice(-3).map(x=>x.textContent.slice(0,80))
      }));
      return {...state,warned:(await notices())>base};
    };

    // 1. 空转动作必须报警
    let r=await send('我来处理。',[{type:'choose_scores',value:'[]'}]);
    assert.equal(r.warned,true,'空转动作没有提示「没有生效」，静默失败会漏检');
    assert.ok(r.tail.some(t=>t.includes('个子操作执行后界面没有变化')),'有步骤没生效时，结尾没有给总账');

    // 2. 已在目标面板上不该误报
    r=await send('我来处理。',[{type:'panel',value:'library'}]);
    assert.equal(r.warned,false,'已在目标面板却被误判为「没有生效」');
    r=await send('我来处理。',[{type:'panel',value:'tasks'}]);
    assert.equal(r.warned,false,'切到别的面板却被误判为「没有生效」');
    assert.equal(r.workspace,'tasks','切面板没有真正生效');
    r=await send('我来处理。',[{type:'panel',value:'library'}]);
    assert.equal(r.warned,false,'切回曲库却被误判为「没有生效」');

    // 3. 面板别名归一
    for(const [value,expect] of [['演奏','play'],['任务中心','tasks'],['曲库','library'],['play','play']]){
      r=await send('我来处理。',[{type:'panel',value}]);
      assert.equal(r.workspace,expect,`面板名「${value}」应切到 ${expect}，实际 ${r.workspace}`);
    }

    // 4. 未知动作不能静默
    //    注意：别拿 set_tempo 当反例了 —— 它现在是受支持的动作（见 check-ai-control-actions.cjs）。
    r=await send('我来处理。',[{type:'explode',value:'120'}]);
    assert.ok(/不支持这个操作/.test(JSON.stringify(r.tail)),'未知动作被静默吞掉了，用户看不到任何反馈');
    // 只答应不给动作也要说清楚
    r=await send('我来处理。',[]);
    assert.ok(r.tail.some(t=>t.includes('没有生成可执行的操作')),'「只答应不给动作」没有任何提示');
    // 搜索关键词为空时，不能把整个曲库倒出来（includes('') 会命中所有曲子）
    r=await send('我来处理。',[{type:'search',value:''}]);
    assert.ok(r.tail.some(t=>t.includes('你想找哪一首')),'空关键词搜索没有先问清楚，会把整个曲库列出来');

    assert.deepEqual(errors,[],'页面出现脚本错误：'+errors.join(' | '));
    console.log('PASS AI 动作守护检查（空转报警 / 不误报 / 面板名归一 / 未知动作不静默）');
  }finally{await browser.close();}
})().catch(error=>{console.error('FAIL',error.message);process.exitCode=1;});
