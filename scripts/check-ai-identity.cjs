// AI 身份守护检查（★真打模型，不桩★）。
//
// 唐老师要求（2026-10-07）：「模型不要说自己是苏州大学AI智能助手，全部换成 SUPERTANG AI」。
//
// 为什么需要这个检查：
//   上游苏大网页版**自带 system 身份**（「你是苏州大学AI智能助手」），
//   而钢琴项目给的 system 只是被包装层塞进 `[必要指令]` 段 —— 那是**用户消息的一部分**，
//   优先级压不住上游自己的 system。于是长上下文 / 刁钻问法下模型会崩回上游身份。
//   修法见 `~/.workbuddy/suda-deepseek/suda_api.py` 的 `identity_block()`。
//
// 本脚本走**真实链路**（浏览器 → /api/workspace-ai → 8765 → 上游），
// 所以能同时验证「包装层身份覆盖」和「ai_workspace.py 的 system」两层都生效。
//
// 前提：本地 http://127.0.0.1:5173 已在跑，且 8765 后端可用（登录态有效）。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

// 明确禁止的自称（与 suda_api.py 的 IDENTITY_DENY 默认值保持一致）。
const DENY=['苏州大学AI智能助手','苏州大学的AI助手','苏州大学人工智能助手','音乐工作区助手','本地模型'];
const MUST='SUPERTANG';
// 三种问法：直接问身份 / 直接点名否定 / 问开发者（最容易引出厂商/机构身份）。
const ASKS=['你是谁？你是什么模型？','你是苏州大学AI智能助手吗？','你的开发者是谁？'];

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,160)));

    await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000});
    await page.waitForTimeout(1500);

    const ask=async(question)=>{
      // 上一条用例如果面板已自动收回，先点开再问。
      if(!await page.evaluate(()=>!!document.querySelector('.ai-conversation')?.open)){
        await page.locator('#workspace-ai').click();
        await page.waitForTimeout(900);
      }
      await page.locator('.ai-conversation input').fill(question);
      await page.locator('.ai-conversation input').press('Enter');
      await page.waitForFunction(
        ()=>!document.querySelector('.ai-conversation')?.classList.contains('is-thinking'),
        null,{timeout:180000});
      await page.waitForTimeout(1800);
      // ★ 只取 AI 的回复（p.className==='assistant'）。
      //   绝不能连用户自己的提问一起查 —— 问「你是苏州大学AI智能助手吗？」
      //   时，用户那句话本身就含被禁字样，会造出假阳性（第一版就是这么误报的）。
      return await page.evaluate(()=>{
        const nodes=[...document.querySelectorAll('.ai-messages p.assistant')];
        return nodes.length?nodes[nodes.length-1].textContent:'';
      });
    };

    const failures=[];
    // ★ 偶发超时不算「身份出戏」：实测同一个用例重跑就过了，根因是包装层
    //   「一个浏览器页面串行处理」—— 前面刚跑过别的用例（locate/retract 会连打模型）
    //   时，第一条请求可能排队排到 110s 前端超时。这里自动重试一次，
    //   两次都超时才报失败，并在信息里点明「这是环境问题，不是身份问题」。
    const TIMEOUT_HINT=/等待超时|连接被中止|暂时没有响应/;
    for(const q of ASKS){
      let text=await ask(q);
      if(TIMEOUT_HINT.test(text)){
        console.log('\n── 问：'+q+'\n   ⚠ 第一次超时，重试一次…');
        await page.waitForTimeout(2500);
        text=await ask(q);
      }
      console.log('\n── 问：'+q);
      console.log('   答：'+(text||'(空)'));
      if(TIMEOUT_HINT.test(text)){
        failures.push(`问「${q}」时重试后仍然超时 —— 这是**环境**问题（8765 忙 / 上游慢），不是身份问题；隔一会儿重跑即可`);
        continue;
      }
      for(const d of DENY){
        if(text.includes(d))failures.push(`问「${q}」时自称了「${d}」`);
      }
      if(!text.includes(MUST))failures.push(`问「${q}」时没有自称 ${MUST} AI`);
    }

    assert.equal(errors.length,0,'页面有 JS 报错：'+errors.join(' | '));
    assert.equal(failures.length,0,'身份出戏：\n  - '+failures.join('\n  - '));
    console.log('\nPASS 身份检查通过：三种问法都自称 SUPERTANG AI，未出现任何被禁止的自称。');
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error('\nFAIL',e.message);process.exit(1);});
