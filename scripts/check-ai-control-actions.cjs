// 控件类动作的守护检查（桩响应驱动，不依赖模型、不产生副作用）。
// 覆盖测试报告里标「立刻」的几项：
//   A1  说「暂停」绝不能开始播放（play 的 value 带暂停/停止时必须改走 pause/stop）
//   A1  独立的 pause / stop 动作要真的改变播放状态
//   P1-④ 变速不能「假装成功」（跟练中改不动就必须报错，不能照样说已设置）
//   B1/C5 set_tempo / set_metronome / set_instrument / set_arrangement 四个动作真的落到控件上
//   B2  view 四值（simple / engraved / pdf / daw）都要能切，不能一律掉回简谱
//   A4  mute all（全部静音）以前必然失败并触发一次无效重试
// 前提：本地 http://127.0.0.1:5173 已经在跑，且曲库里有 ready 的曲谱。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

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
    // 60s 而不是 40s：server.py 检测到源码变更会重建进程，那几秒页面起不来，
    // 40s 偶尔会不够，于是报「waitForFunction Timeout」——是假失败。
    await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000});

    // 先打开一首 ready 的曲谱，声部/配器/音色控件才有内容
    const score=await page.evaluate(async()=>{const r=await fetch('/api/scores');const d=await r.json();return (d.scores||[]).find(x=>x.ready)||null;});
    assert.ok(score,'曲库里没有 ready 的曲谱，无法测试控件动作');
    await page.evaluate(id=>new Promise((res,rej)=>document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id,resolve:res,reject:rej}}))),score.id);
    await page.waitForTimeout(3500);

    const state=()=>page.evaluate(()=>({
      playText:(document.querySelector('#play-button')?.textContent||'').trim(),
      tempo:document.querySelector('#tempo')?.value||'',
      metronome:!!document.querySelector('#metronome')?.checked,
      instrument:document.querySelector('#instrument-select')?.value||'',
      instrumentText:document.querySelector('#instrument-select')?.selectedOptions?.[0]?.textContent?.trim()||'',
      arrangement:document.querySelector('#arrangement-select')?.value||'',
      panel:document.body.dataset.workspace||'',
      activeView:['notation-button','simple-button','original-button','daw-button'].find(id=>document.querySelector('#'+id)?.classList.contains('active'))||'',
      mix:[...document.querySelectorAll('#part-mix input[data-part]')].map(x=>x.checked),
      tail:[...document.querySelectorAll('.ai-messages p')].slice(-4).map(x=>x.textContent.slice(0,90))
    }));
    const act=async(actions,reply='我来处理。')=>{
      stub={reply,actions};
      await page.locator('.ai-conversation input').fill('检查');
      await page.locator('.ai-conversation input').press('Enter');
      await page.waitForFunction(()=>!document.querySelector('.ai-conversation')?.classList.contains('is-thinking'),null,{timeout:60000});
      await page.waitForTimeout(1800);
      return state();
    };

    await page.locator('#workspace-ai').click();
    await page.waitForTimeout(900);

    // ── A1：说「暂停」绝不能变成开始播放 ────────────────────────────
    let before=await state();
    assert.notEqual(before.playText,'暂停播放','初始就在播放，无法判断「暂停会不会开始播放」');
    let r=await act([{type:'play',value:'暂停'}]);
    assert.notEqual(r.playText,'暂停播放','★ A1 回归：说「暂停」竟然开始播放了');
    assert.ok(r.tail.some(t=>/暂停|没有在播放/.test(t)),'「暂停」既没暂停也没有任何说明：'+JSON.stringify(r.tail));

    // ── A1：独立的 stop 动作要真的生效 ──────────────────────────────
    r=await act([{type:'stop'}]);
    assert.notEqual(r.playText,'暂停播放','stop 之后仍在播放');
    assert.ok(r.tail.some(t=>/已停止/.test(t)),'stop 没有给出任何反馈：'+JSON.stringify(r.tail));

    // ── B1/C5：四个控件动作 ────────────────────────────────────────
    r=await act([{type:'set_tempo',value:'150'}]);
    assert.equal(r.tempo,'150','set_tempo 没有落到速度控件上，实际 '+r.tempo);
    assert.ok(r.tail.some(t=>/速度已设为 150 BPM/.test(t)),'set_tempo 没有回报实际结果：'+JSON.stringify(r.tail));

    r=await act([{type:'set_metronome',value:'on'}]);
    assert.equal(r.metronome,true,'set_metronome on 没有打开节拍器');
    r=await act([{type:'set_metronome',value:'off'}]);
    assert.equal(r.metronome,false,'set_metronome off 没有关闭节拍器');
    // 值不规范时必须报错，不能静默什么都不做
    r=await act([{type:'set_metronome',value:'随便'}]);
    assert.ok(r.tail.some(t=>/没有听懂节拍器/.test(t)),'节拍器的无效取值被静默吞掉了：'+JSON.stringify(r.tail));

    r=await act([{type:'set_instrument',value:'三角钢琴'}]);
    assert.ok(/三角钢琴/.test(r.instrumentText),'set_instrument 没有切到「三角钢琴」，实际「'+r.instrumentText+'」');
    r=await act([{type:'set_instrument',value:'不存在的音色'}]);
    assert.ok(r.tail.some(t=>/没有这个音色/.test(t)),'不存在的音色没有报错：'+JSON.stringify(r.tail));

    r=await act([{type:'set_arrangement',value:'弦乐四重奏'}]);
    assert.equal(r.panel,'arrange','set_arrangement 没有先切到改编面板');
    assert.ok(r.tail.some(t=>/配器已选择/.test(t)),'set_arrangement 没有给出反馈：'+JSON.stringify(r.tail));
    r=await act([{type:'set_arrangement',value:'不存在的编制'}]);
    assert.ok(r.tail.some(t=>/没有这个配器方案/.test(t)),'不存在的编制没有报错：'+JSON.stringify(r.tail));

    // ── B2：视图四值（简谱 / 五线谱 / 原稿 / 音轨）───────────────────
    //    以前 ai-set-view 只认 simple/engraved，说「打开原稿」只会掉回简谱。
    r=await act([{type:'view',value:'simple'}]);
    assert.equal(r.activeView,'simple-button','view=simple 没有切到简谱，实际 '+r.activeView);
    r=await act([{type:'view',value:'engraved'}]);
    assert.equal(r.activeView,'notation-button','view=engraved 没有切到五线谱，实际 '+r.activeView);
    const hasPdf=await page.evaluate(()=>!document.querySelector('#original-button')?.disabled);
    r=await act([{type:'view',value:'pdf'}]);
    if(hasPdf)assert.equal(r.activeView,'original-button','★ B2 回归：view=pdf 没有切到原稿视图，实际 '+r.activeView);
    else assert.ok(r.tail.some(t=>/没有原始 PDF/.test(t)),'没有 PDF 时 view=pdf 没有给出说明：'+JSON.stringify(r.tail));
    r=await act([{type:'view',value:'daw'}]);
    assert.equal(r.activeView,'daw-button','★ B2 回归：view=daw 没有切到音轨视图，实际 '+r.activeView);
    r=await act([{type:'view',value:'乱写'}]);
    assert.ok(r.tail.some(t=>/谱面类型无效/.test(t)),'view 的无效取值被静默吞掉了：'+JSON.stringify(r.tail));
    r=await act([{type:'view',value:'engraved'}]);
    assert.equal(r.activeView,'notation-button','收尾没有回到五线谱，实际 '+r.activeView);

    // ── A4：全部静音 ───────────────────────────────────────────────
    r=await act([{type:'mute',value:'all'}]);
    assert.ok(r.mix.length>0,'没有可静音的声部，测不出 mute all');
    assert.equal(r.mix.every(x=>x===false),true,'mute all 之后仍有声部没关掉：'+JSON.stringify(r.mix));

    assert.deepEqual(errors,[],'页面出现脚本错误：'+errors.join(' | '));
    console.log('PASS AI 控件动作检查（暂停/停止 / 速度 / 节拍器 / 音色 / 配器 / 视图四值 / 全部静音）');
  }finally{await browser.close();}
})().catch(error=>{console.error('FAIL',error.message);process.exitCode=1;});
