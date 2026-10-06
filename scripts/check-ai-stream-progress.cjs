// 流式「实时进展」守护检查（★真打模型，不桩★）。
//
// 唐老师要求（2026-10-07）：别让用户干等，要一直看得到实时进展。
//
// 上游苏大**不提供独立思维链**（实测 message.reasoning.content 只是正文的累计版），
// 所以这里的做法是：把模型正在写的 `{"reply":"…","actions":[…]}` 里的 reply
// **边写边吐**给前端（见 ai_workspace.py 的 ReplyStreamExtractor）。
//
// 本脚本验证三件事：
//   1. 真的有流式气泡（.ai-streaming-text）出现，而不是等完整结果才一次性显示；
//   2. 气泡文本**是逐渐变长的** —— 至少观察到 3 个不同的长度值，
//      否则「一次性出现」也能骗过第 1 条；
//   3. 用户看到的是干净的中文回复，**没有**把 JSON 外壳（"reply" / "actions"）漏出来，
//      也没有把同一段回复显示两遍。
//
// 前提：本地 http://127.0.0.1:5173 在跑，8765 登录态有效。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

// ★ 必须用「需要长回答」的问题：实测上游对**短回答会攒成一条**发
//   （如「你好」这种 35 字回复只来 1 个 delta），那样就观察不到逐字增长，
//   会误判成「没流式」。长回答才逐字（实测 173 条 delta、每 ~50ms 一条）。
const ASK='请用大约四百字，系统介绍中国钢琴教育的发展历程，分成几个阶段来讲。';
const SAMPLE_MS=120;
const MAX_MS=120000;

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,160)));

    await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000});
    await page.waitForTimeout(1500);

    await page.locator('#workspace-ai').click();
    await page.waitForTimeout(900);
    await page.locator('.ai-conversation input').fill(ASK);
    await page.locator('.ai-conversation input').press('Enter');

    // 采样流式气泡的长度变化 + 状态行/秒表
    const lengths=[];
    let sawStreaming=false;
    let ticks=0;
    let sawClock=false;
    let statusSeen='';
    let clockSeen='';
    const t0=Date.now();
    while(Date.now()-t0<MAX_MS){
      const state=await page.evaluate(()=>{
        const el=document.querySelector('.ai-streaming-text');
        const thinking=!!document.querySelector('.ai-conversation')?.classList.contains('is-thinking');
        const detail=document.querySelector('.ai-operation-detail');
        const clock=document.querySelector('.ai-operation-detail .ai-wait-clock');
        return {
          len:el?el.textContent.length:-1,
          thinking,
          // 状态文字在第一个 span 里（秒表是第二个 span）—— 这个结构本身就是回归点：
          // 曾经 streamStatus 直接写 status.textContent，会把秒表一起抹掉。
          status:(detail?.querySelector('span')?.textContent||''),
          clock:(clock?.textContent||''),
          hasClock:!!clock,
        };
      });
      if(state.len>=0)sawStreaming=true;
      if(state.len>=0&&lengths[lengths.length-1]!==state.len)lengths.push(state.len);
      if(state.clock)  {sawClock=true;clockSeen=state.clock;}
      if(state.status) statusSeen=state.status;
      ticks++;
      if(ticks%25===0)console.log(`  …${((Date.now()-t0)/1000).toFixed(0)}s 气泡=${state.len} thinking=${state.thinking} 秒表=${JSON.stringify(state.clock)}`);
      if(!state.thinking&&sawStreaming)break;
      await page.waitForTimeout(SAMPLE_MS);
    }
    await page.waitForTimeout(2500);

    const finalText=await page.evaluate(()=>{
      const nodes=[...document.querySelectorAll('.ai-messages p.assistant')];
      return nodes.length?nodes[nodes.length-1].textContent:'';
    });
    const distinct=[...new Set(lengths)].filter(n=>n>0);

    console.log('采到的长度序列（去重）:',distinct.slice(0,14).join(' → ')+(distinct.length>14?' …':''));
    console.log('采样点数:',lengths.length,'| 出现过流式气泡:',sawStreaming);
    console.log('状态行末次文字:',JSON.stringify(statusSeen.slice(0,80)));
    console.log('秒表末次文字:',JSON.stringify(clockSeen),'| 出现过秒表:',sawClock);
    console.log('最终助手消息:',JSON.stringify(finalText.slice(0,160)));

    assert.equal(errors.length,0,'页面有 JS 报错：'+errors.join(' | '));
    assert.ok(sawStreaming,'从未出现 .ai-streaming-text —— 说明不是流式，是等完整结果一次性显示');
    assert.ok(distinct.length>=3,
      `流式气泡长度只变了 ${distinct.length} 次（${distinct.join(',')}）—— 不像逐字到达，像一次性塞进来`);
    assert.ok(finalText.trim(),'最终没有助手消息');
    assert.ok(!/"reply"\s*:/.test(finalText),'用户看到了 JSON 外壳（"reply":）—— 提取器没生效');
    assert.ok(!/"actions"\s*:/.test(finalText),'用户看到了 JSON 外壳（"actions":）—— 提取器没生效');
    // 重复显示的典型特征：同一句话连着出现两次
    const head=finalText.slice(0,12);
    assert.ok(head.length<12||finalText.indexOf(head,1)===-1,
      '回复疑似显示了两次（首句在正文里重复出现）：'+JSON.stringify(finalText.slice(0,200)));
    // 状态行必须还在（它的结构改成了「文字 span + 秒表 span」两段）
    assert.ok(statusSeen.trim(),'状态行没有文字 —— statusText span 没接上，用户看不到「正在安排操作」');
    // 400 字回答的首字延迟必然 > 2 秒（实测 3~7 秒），秒表理应出现
    assert.ok(sawClock,
      '「已等待 N 秒…」秒表从未出现 —— 首字前那段空档又变成静态的了（检查 waitTimer / .ai-wait-clock）');

    console.log('\nPASS 流式实时进展（逐字增长 / 首字等待有秒表 / 无 JSON 外壳 / 无重复）');
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error('\nFAIL',e.message);process.exit(1);});
