// AI 面板「操作完就收回」的守护检查（桩响应驱动，不依赖模型）。
// 守三件事：
//  1. 纯执行类动作（切换面板/播放/定位小节…）跑完后，面板必须自动收回，不能挡着谱面；
//     并且要用结果气泡说明「刚才那步做完了」，否则用户什么都看不到。
//  2. 需要用户拍板的动作（列出曲谱待选、联网结果）必须把面板留在眼前 —— 收回就没法选了。
//  3. 删除/清空云曲库的动作必须被明确回绝，且**不触发**「重新核对」（重试多少次都不该做）。
// 前提：本地 http://127.0.0.1:5173 已经在跑，且曲库里有 ready 的曲谱。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

// 主请求走 SSE(NDJSON)；失败后的「重新核对」走普通 JSON —— 桩必须分开喂。
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
    let stub=null,repairs=0;
    await page.route('**/api/workspace-ai',async route=>{
      const post=route.request().postData()||'';
      if(post.includes('"repair"')){
        repairs++;
        await route.fulfill({status:200,headers:{'Content-Type':'application/json; charset=utf-8'},
          body:JSON.stringify({reply:'重新核对后仍无法确定可执行的操作。',actions:[]})});
        return;
      }
      if(stub)await route.fulfill({status:200,headers:{'Content-Type':'application/json; charset=utf-8'},body:sse(stub.reply,stub.actions)});
      else await route.continue();
    });

    await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000});

    const score=await page.evaluate(async()=>{const r=await fetch('/api/scores');const d=await r.json();return (d.scores||[]).find(x=>x.ready)||null;});
    assert.ok(score,'曲库里没有 ready 的曲谱，无法测试');
    await page.evaluate(id=>new Promise((res,rej)=>document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id,resolve:res,reject:rej}}))),score.id);
    await page.waitForTimeout(3500);

    await page.locator('#workspace-ai').click();
    await page.waitForTimeout(1000);

    const send=async(reply,actions)=>{
      stub={reply,actions};
      const before=repairs;
      // 上一条用例如果是「纯执行类」，面板已经自己收回了 —— 再问一句要先点开。
      if(!await page.evaluate(()=>!!document.querySelector('.ai-conversation')?.open)){
        await page.locator('#workspace-ai').click();
        await page.waitForTimeout(900);
      }
      await page.locator('.ai-conversation input').fill('检查');
      await page.locator('.ai-conversation input').press('Enter');
      await page.waitForFunction(()=>!document.querySelector('.ai-conversation')?.classList.contains('is-thinking'),null,{timeout:60000});
      await page.waitForTimeout(2600);
      const state=await page.evaluate(()=>({
        open:!!document.querySelector('.ai-conversation')?.open,
        settle:(document.querySelector('.ai-settle-pill')?.textContent||''),
        tail:[...document.querySelectorAll('.ai-messages p')].slice(-4).map(x=>x.textContent.slice(0,90))
      }));
      return {...state,repairs:repairs-before};
    };

    // 1. 纯执行类动作 → 面板收回 + 结果气泡
    let r=await send('已切换到任务中心。',[{type:'panel',value:'tasks'}]);
    assert.equal(r.open,false,'执行完成后 AI 面板没有收回，会一直挡着谱面');
    assert.ok(r.settle.trim(),'面板收回后没有结果气泡，用户不知道刚才那步成没成');

    // 播放类动作同样要收回
    r=await send('正在播放。',[{type:'play',value:''}]);
    assert.equal(r.open,false,'开始播放后面板没有收回');

    // 2. 需要用户拍板 → 面板留在眼前
    r=await send('本地曲库找到了这些作品，请选择一首。',[{type:'choose_scores',value:JSON.stringify([{id:score.id,title:score.title,ready:true}])}]);
    assert.equal(r.open,true,'需要用户选择曲谱时面板被错误收回，用户没法点选');
    assert.ok(!r.settle,'需要用户拍板时不该再弹结果气泡');

    // 3. 删除类动作 → 明确回绝，不重试
    r=await send('好的。',[{type:'delete_score',value:score.id}]);
    assert.ok(r.tail.some(t=>t.includes('不会删除')),'删除类动作没有被回绝：'+JSON.stringify(r.tail));
    assert.equal(r.repairs,0,'删除类动作触发了「重新核对」重试 —— 删除不该重试');
    assert.equal(r.open,true,'被回绝后说明应留在面板里');

    // 变体：remove_score / wipe 也要拦
    r=await send('好的。',[{type:'remove_score',value:score.id}]);
    assert.ok(r.tail.some(t=>t.includes('不会删除')),'remove_score 没有被回绝');
    r=await send('好的。',[{type:'wipe',value:'all'}]);
    assert.ok(r.tail.some(t=>t.includes('不会删除')),'wipe 没有被回绝');

    assert.deepEqual(errors,[],'页面出现脚本错误：'+errors.join(' | '));
    console.log('PASS AI 面板收回检查（执行后收回 / 待选时保留 / 删除类回绝且不重试）');
  }finally{await browser.close();}
})().catch(error=>{console.error('FAIL',error.message);process.exitCode=1;});
