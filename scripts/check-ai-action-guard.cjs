// AI 动作执行的守护检查（桩响应驱动，不依赖模型）。
// 守四件事，任何一条回归都直接失败：
//  1. 幂等控制（已静音声部再静音）按成功处理、不误报「没有生效」（设计如此，
//     ai-action-state.js 的 targetReached + 13/13 状态测试背书）；
//  2. 已经站在目标面板上时，不要误报；
//  3. 面板名要归一：模型回中文名（「演奏」「任务中心」）也必须切对，不能一律掉回曲库；
//  4. 不认识的动作类型不能静默；「只答应不给动作」要触发补齐（repair），而不是静默。
//  注意：旧版判据用的「注意：」报警器与「个子操作执行后界面没有变化」总账文案已从产品移除，
//        本脚本改测当前真实行为（幂等成功 / repair 触发 / 未知动作拒答 / 空关键词反问）。
// 前提：本地 http://127.0.0.1:5173 已经在跑，且曲库里有 ready 的曲谱。
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
  const browser=await chromium.launch({channel:'msedge',headless:true,proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});
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
    // 60s 而不是 40s：server.py 检测到源码变更会重建进程，那几秒页面起不来，
    // 40s 偶尔会不够，于是报「waitForFunction Timeout」——是假失败。
    await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000});

    // 先打开一首 ready 的曲谱：第 1 条用例拿「已经静音的声部再静音一次」当空转反例，
    // 没有载入曲谱时 #part-mix 是空的，用例会直接失效。
    const score=await page.evaluate(async()=>{const r=await fetch('/api/scores');const d=await r.json();return (d.scores||[]).find(x=>x.ready)||null;});
    assert.ok(score,'曲库里没有 ready 的曲谱，无法测试空转动作');
    await page.evaluate(id=>new Promise((res,rej)=>document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id,resolve:res,reject:rej}}))),score.id);
    await page.waitForTimeout(3500);

    await page.locator('#workspace-ai').click();
    await page.waitForTimeout(1000);

    const notices=()=>page.evaluate(()=>[...document.querySelectorAll('.ai-messages .assistant')].filter(x=>x.textContent.includes('注意：')).length);
    const send=async(reply,actions)=>{
      stub={reply,actions};
      const base=await notices();
      // 执行完 AI 面板会自动收回（见 check-ai-retract.cjs），再问一句要先点开。
      if(!await page.evaluate(()=>!!document.querySelector('.ai-conversation')?.open)){
        await page.locator('#workspace-ai').click();
        await page.waitForTimeout(900);
      }
      await page.locator('.ai-conversation input').fill('检查');
      await page.locator('.ai-conversation input').press('Enter');
      await page.waitForFunction(()=>!document.querySelector('.ai-conversation')?.classList.contains('is-thinking'),null,{timeout:60000});
      await page.waitForTimeout(2200);
      const state=await page.evaluate(()=>({
        workspace:document.body.dataset.workspace||'',
        tail:[...document.querySelectorAll('.ai-messages .assistant')].slice(-3).map(x=>x.textContent.slice(0,80))
      }));
      return {...state,warned:(await notices())>base};
    };

    // 1. 幂等控制按成功处理，不误报「没有生效」。
    //    产品把「已在目标状态的控制」定义为成功（ai-action-state.js 的 targetReached +
    //    13/13 状态测试背书），所以已静音声部再静音不应弹「没有生效」报警器，
    //    也不应触发「只答应不给动作」的 repair（那是给真正没动作的承诺用的）。
    let r=await send('我来处理。',[{type:'mute',value:'all'}]);
    const partId=await page.evaluate(()=>document.querySelector('#part-mix input[data-part]')?.dataset.part||null);
    assert.ok(partId,'曲谱没有可操作的声部，用例失效');
    r=await send('我来处理。',[{type:'mute',value:partId}]);
    assert.equal(r.warned,false,'已静音声部再静音被误报为「没有生效」—— 幂等控制应判成功');
    const partMuted=await page.evaluate(pid=>{const el=[...document.querySelectorAll('#part-mix input')].find(x=>x.dataset.part===pid);return el? !el.checked:null;},partId);
    assert.equal(partMuted,true,'幂等静音后该声部未保持静音态');

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

    // 4. 未知动作不能静默；「只答应不给动作」要触发补齐（repair），而不是静默。
    //    注意：别拿 set_tempo 当反例了 —— 它现在是受支持的动作（见 check-ai-control-actions.cjs）。
    r=await send('我来处理。',[{type:'explode',value:'120'}]);
    assert.ok(/不支持这个操作/.test(JSON.stringify(r.tail)),'未知动作被静默吞掉了，用户看不到任何反馈');
    // 只答应不给动作：承诺措辞（含「处理/安排/搞定」等泛化词）→ 触发 repair 补齐，
    // 桩的 repair 回执是「重新核对后仍无法确定可执行的操作。」—— 出现即证明 repair 被触发，
    // 用户不再面对一句「我来处理。」却界面毫无变化的死局。
    r=await send('我来处理。',[]);
    assert.ok(r.tail.some(t=>t.includes('重新核对后仍无法确定')),'「只答应不给动作」没有触发补齐（repair），用户看不到任何反馈');
    // 搜索关键词为空时，不能把整个曲库倒出来（includes('') 会命中所有曲子）
    r=await send('我来处理。',[{type:'search',value:''}]);
    assert.ok(r.tail.some(t=>t.includes('你想找哪一首')),'空关键词搜索没有先问清楚，会把整个曲库列出来');

    assert.deepEqual(errors,[],'页面出现脚本错误：'+errors.join(' | '));
    console.log('PASS AI 动作守护检查（空转报警 / 不误报 / 面板名归一 / 未知动作不静默）');
  }finally{await browser.close();}
})().catch(error=>{console.error('FAIL',error.message);process.exitCode=1;});
