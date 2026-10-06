// 守住「AI 看得见整个曲库」这件事。
//
// 背景：2026-10-06 晚，AI 回答「曲库里只有 4 首曲目」，而那 4 首正好是曲库的**最后四条**。
// 真因是提示词被裁剪：苏大网页包装层当年把提问压到 5800 字符、system 只留 1500，
// 而 `clip_text()` 的策略是「留头 2/3 + 留尾 1/3、中间省略」。前端每轮塞 71 首
// {id,title,ready}（约 7800 字符）把 system 撑爆 → 模型只看得见头尾 6 首。
//
// 包装层后来实测发现「6000 字只是网页输入框的前端 UI 限制，服务端不校验」，
// 已把上限放开（system 1500 → 20000）。所以现在同时发两样东西：
//   library —— 一行紧凑曲名索引（含总数），**必须放在上下文第一个键**
//              （万一又被裁剪，头部优先活下来，模型至少还认得全库）；
//   scores  —— 带完整 64 位 id 的列表（ai_catalog 要按 id 读谱面缓存，
//              open / choose_scores 也要真实 id）。
//
// 这条用例不依赖模型发挥，只钉住**载荷不变量**。前提：本地 http://127.0.0.1:5173 已在跑。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

const BUDGET=20000;   // 包装层 system 提示上限（WEB_SYSTEM_LIMIT），留点余量

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,160)));

    const payloads=[];
    await page.route('**/api/workspace-ai',async route=>{
      const post=route.request().postData()||'';
      let ctx=null;
      try{ctx=(JSON.parse(post).context)||null;}catch(e){}
      if(ctx&&!post.includes('"repair"'))payloads.push(ctx);
      // 不真打模型：回一个空动作的结果，只关心前端发了什么
      await route.fulfill({status:200,headers:{'Content-Type':'application/json; charset=utf-8'},
        body:JSON.stringify({type:'status',text:'检查'})+'\n'
            +JSON.stringify({type:'result',reply:'收到。',actions:[]})+'\n'});
    });

    await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    // 60s 而不是 40s：server.py 检测到源码变更会重建进程，那几秒页面起不来，
    // 40s 偶尔会不够，于是报「waitForFunction Timeout」——是假失败。
    await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000});
    await page.locator('#workspace-ai').click();
    await page.waitForTimeout(1000);

    const total=await page.evaluate(async()=>{
      const r=await fetch('/api/scores');const d=await r.json();return d.scores.length;
    });
    assert.ok(total>10,'曲库曲目太少（'+total+'），这条用例失去意义');

    const ask=async q=>{
      payloads.length=0;
      // 执行完 AI 面板会自动收回（见 check-ai-retract.cjs），再问一句要先点开。
      if(!await page.evaluate(()=>!!document.querySelector('.ai-conversation')?.open)){
        await page.locator('#workspace-ai').click();
        await page.waitForTimeout(900);
      }
      await page.locator('.ai-conversation input').fill(q);
      await page.locator('.ai-conversation input').press('Enter');
      await page.waitForFunction(()=>!document.querySelector('.ai-conversation')?.classList.contains('is-thinking'),null,{timeout:60000});
      await page.waitForTimeout(800);
      assert.equal(payloads.length,1,'这次提问没有发出上下文，用例失效');
      return payloads[0];
    };

    // 1) 曲名索引必须在，且写明总数（模型自己数 a/b/c 串不准，实测把 71 数成 92）
    const ctx=await ask('曲库里一共有几首曲目');
    const index=String(ctx.library||'');
    assert.ok(index.length>0,'上下文里没有曲名索引，模型又只能看见头尾几首了');
    assert.ok(index.includes('共'+total+'首'),'索引里应写明总数，实际开头：'+index.slice(0,24));

    // 2) 索引必须是上下文的第一个键 —— 提示词万一又被裁剪，「留头 2/3」才能保住它
    assert.equal(Object.keys(ctx)[0],'library','曲名索引必须是上下文第一个键，否则被裁剪时救不回来');

    // 3) 完整列表要带真实 64 位 id：ai_catalog 按 id 读 .sites-runtime/score-cache，
    //    open / choose_scores 也要 id 才能干活
    const scores=ctx.scores||[];
    assert.equal(scores.length,total,'带 id 的曲库列表应覆盖全部曲目');
    assert.ok(scores.every(x=>/^[a-f0-9]{64}$/.test(String(x.id))),'曲库 id 必须是完整 64 位，短 id 读不到谱面缓存');

    // 4) 整体要留在包装层的提示词预算内，超了会被截（且过大会被网关掐连接）
    const size=JSON.stringify(ctx).length;
    assert.ok(size<BUDGET,`上下文 ${size} 字符超过 ${BUDGET} 预算，模型会看不见大部分曲目`);

    assert.deepEqual(errors,[],'页面出现脚本错误：'+errors.join(' | '));
    console.log(`PASS AI 曲库可见性（索引 ${index.length} 字符含总数 / 上下文 ${size} 字符 / ${scores.length} 条完整 id）`);
  }finally{await browser.close();}
})().catch(error=>{console.error('FAIL',error.message);process.exitCode=1;});
