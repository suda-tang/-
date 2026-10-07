// 端到端 AI 功能审计（真打模型，走真实浏览器链路）。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const CASES=[
  ['打开《知足》', '准备:打开曲谱'],
  ['你好，你是谁？', '身份/连通'],
  ['播放', '播放'],
  ['暂停', '暂停'],
  ['跳到第 30 小节', '跳小节'],
  ['只听钢琴', '独奏声部'],
  ['把速度调到 100', '绝对速度'],
  ['打开节拍器', '节拍器'],
  ['切换到简谱', '简谱'],
  ['切换到五线谱', '五线谱'],
  ['把《知足》删掉', '禁删'],
  ['钢琴音量小一点', '音量拒答'],
  ['这首歌的曲式结构是怎样的', '曲式分析'],
  ['分析一下当前小节的和弦', '和弦'],
  ['搜索《小星星》', '搜索'],
];

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const out=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
    let lastResp=null, lastStatus=null;
    page.on('response', async r=>{
      if(r.url().includes('/api/workspace-ai')){
        lastStatus=r.status();
        try{ lastResp=await r.json(); }catch(e){ try{ lastResp={_raw:(await r.text()).slice(0,300)}; }catch(e2){ lastResp={_raw:'(unreadable)'}; } }
      }
    });

    await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000});
    await page.waitForTimeout(1500);

    const ensureOpen=async()=>{
      if(!await page.evaluate(()=>!!document.querySelector('.ai-conversation')?.open)){
        await page.locator('#workspace-ai').click();
        await page.waitForTimeout(900);
      }
    };

    for(const [msg,tag] of CASES){
      await ensureOpen();
      lastResp=null; lastStatus=null;
      const t0=Date.now();
      try{
        await page.locator('.ai-conversation input').fill(msg);
        await page.locator('.ai-conversation input').press('Enter');
        await page.waitForFunction(()=>!document.querySelector('.ai-conversation')?.classList.contains('is-thinking'),null,{timeout:180000});
        await page.waitForTimeout(1500);
      }catch(e){
        out.push({tag,msg,error:'WAIT_FAIL '+e.message.slice(0,80),dt:((Date.now()-t0)/1000).toFixed(1)});
        continue;
      }
      const dt=((Date.now()-t0)/1000).toFixed(1);
      const reply=await page.evaluate(()=>{
        const n=[...document.querySelectorAll('.ai-messages p.assistant')];
        return n.length?n[n.length-1].textContent:'';
      });
      const acts=(lastResp&&lastResp.actions)?JSON.stringify(lastResp.actions).slice(0,180):(lastResp&&lastResp.error?('ERR:'+lastResp.error):'(无响应体)');
      out.push({tag,msg,status:lastStatus,dt,reply:(reply||'').slice(0,140),acts});
    }

    console.log('===== AI 功能审计 =====');
    for(const o of out){
      console.log('\n['+o.tag+'] «'+o.msg+'»  status='+o.status+' dt='+o.dt+'s');
      if(o.error){ console.log('  ✗ '+o.error); continue; }
      console.log('  回复: '+o.reply);
      console.log('  动作: '+o.acts);
    }
    console.log('\n===== 页面 JS 报错 ('+errors.length+') =====');
    errors.forEach(e=>console.log('  - '+e));
  } finally { await browser.close(); }
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
