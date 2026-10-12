// 50 个「长流程」验收用例的执行器（★真打模型、真执行、真回读界面★）。
//
// 用法：
//   node scripts/check-ai-longflow.cjs --from 1 --to 10
//   node scripts/check-ai-longflow.cjs --from 1 --to 50
//
// 每条用例的流程：
//   新开页面（保证干净基线）→ 打开基线曲谱 → 施加前置状态(pre) → 读 before
//   → 把指令发给 AI → 等它跑完（is-thinking 消失 = 动作也执行完了）
//   → 读 after → 断言 → 写一行 JSONL
//
// ★ 为什么每条用例都新开页面：控件（速度/节拍器/音色/配器）和声部状态**不会**
//   因为换曲谱而重置，复用页面会让上一条用例的残留状态污染下一条 —— 那种失败
//   查起来极痛苦。新页面 = 干净基线，代价是每条多 ~8 秒，值得。
//
// 结果写到 scripts/_longflow-result.jsonl（一行一条，便于边跑边看）。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');

let CASES;   // 由 --cases 决定（默认原 60 条），见下方 argv 解析
let OUT=path.join(__dirname,'_longflow-result.jsonl');

const argv=process.argv.slice(2);
const numArg=(name,def)=>{const i=argv.indexOf('--'+name);return i>=0?Number(argv[i+1]):def;};
const strArg=(name,def)=>{const i=argv.indexOf('--'+name);return i>=0?argv[i+1]:def;};
// ★ --cases <path>：换一套用例（相对 scripts/ 或绝对路径）。默认仍是原 60 条。
CASES=require(strArg('cases','./ai-longflow-cases.cjs'));
const OUT_OVERRIDE=strArg('out','');
if(OUT_OVERRIDE)OUT=path.resolve(__dirname,OUT_OVERRIDE);
const FROM=numArg('from',1);
const TO=numArg('to',99);
const ONLY=numArg('only',0);          // --only 3 只跑第 3 条（调试用）
const RETRY=numArg('retry',0);        // --retry 2：失败用例自动重跑，隔离上游/模型偶发噪声

const CASE_TIMEOUT_MS=150000;
const BOOT_TIMEOUT_MS=60000;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ── 读界面状态（一次 evaluate 拿全，避免多次往返时状态漂移）────────────
async function readState(page){
  return page.evaluate(()=>{
    const live=new Promise(resolve=>document.dispatchEvent(
      new CustomEvent('ai-workspace-context',{detail:{resolve}})));
    return live.then(l=>({
      title:(document.querySelector('#score-title')?.textContent||'').trim(),
      currentId:l?.currentId||null,
      playing:!!l?.playing,
      measure:l?.measure??null,
      measureCount:l?.measureCount??null,
      view:l?.view||'',
      solo:l?.solo||'',
      muted:Array.isArray(l?.disabledParts)?l.disabledParts:[],
      panel:document.body.dataset.workspace||'',
      tempo:Number(document.querySelector('#tempo')?.value),
      metronome:!!document.querySelector('#metronome')?.checked,
      instrumentText:(document.querySelector('#instrument-select')?.selectedOptions?.[0]?.textContent||'').trim(),
      arrangement:document.querySelector('#arrangement-select')?.value||'',
      parts:[...(document.querySelector('#part-solo-select')?.options||[])]
        .map(o=>({value:o.value,name:o.textContent.trim()})),
    }));
  });
}

// ── 声部名 → 真实 value（支持 @钢琴 这种语义占位）──────────────────────
function resolvePart(token,before,after){
  if(!String(token).startsWith('@'))return token;
  const name=String(token).slice(1);
  for(const pool of [before?.parts,after?.parts]){
    if(!Array.isArray(pool))continue;
    const hit=pool.find(p=>p.name===name)||pool.find(p=>p.name.includes(name));
    if(hit)return hit.value;
  }
  return null;
}

// ── 前置状态：用前端自己的事件/控件设，不经过模型（快且可靠）──────────
async function applyPre(page,pre,parts){
  if(!pre)return;
  // ★ playwright 的 page.evaluate 只接受**一个**参数：传两个会报
  //   「Too many arguments. If you need to pass more than 1 argument to the function
  //   wrap them in an object.」——所以这里包成对象。这条路径在 #51（第一条带 pre 的
  //   用例）之前从没被走到过，一直藏着没暴露。
  await page.evaluate(async({pre,parts})=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const fire=(name,detail)=>new Promise(resolve=>{
      const timer=setTimeout(()=>resolve(null),4000);
      document.dispatchEvent(new CustomEvent(name,{detail:{...detail,
        resolve:v=>{clearTimeout(timer);resolve(v);},reject:()=>{clearTimeout(timer);resolve(null);}}}));
    });
    const pick=t=>{
      if(!String(t).startsWith('@'))return t;
      const n=String(t).slice(1);
      const hit=parts.find(p=>p.name===n)||parts.find(p=>p.name.includes(n));
      if(!hit)throw new Error('基线曲谱里没有声部「'+n+'」');
      return hit.value;
    };
    if(pre.view){await fire('ai-set-view',{mode:pre.view});await sleep(450);}
    if(pre.measure){await fire('ai-seek-measure',{measure:Number(pre.measure)});await sleep(450);}
    if(pre.tempo){await fire('ai-set-tempo',{value:Number(pre.tempo)});await sleep(300);}
    if(pre.solo){
      const s=document.querySelector('#part-solo-select');
      s.value=pick(pre.solo);s.dispatchEvent(new Event('change',{bubbles:true}));await sleep(600);
    }
    if(pre.muted){
      for(const t of pre.muted){
        const v=pick(t);
        const box=[...document.querySelectorAll('#part-mix input')].find(i=>i.value===v);
        if(box&&box.checked){box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}));}
      }
      await sleep(600);
    }
    if(pre.metronome!==undefined){
      const m=document.querySelector('#metronome');
      if(m){m.checked=!!pre.metronome;m.dispatchEvent(new Event('change',{bubbles:true}));}
      await sleep(300);
    }
    if(pre.arrangement){
      const a=document.querySelector('#arrangement-select');
      if(a){a.value=pre.arrangement;a.dispatchEvent(new Event('change',{bubbles:true}));}
      await sleep(350);
    }
    if(pre.panel){
      const el=document.querySelector(`.workspace-nav [data-panel="${pre.panel}"]`);
      if(el)el.click();
      await sleep(750);
    }
  },{pre,parts});
}

// ── 断言 ────────────────────────────────────────────────────────────
function checkExpect(exp,before,after){
  const fails=[];
  for(const [k,v] of Object.entries(exp||{})){
    switch(k){
      case 'baseTitle':
        if(!after.title.includes(v))fails.push(`曲谱应为「${v}」，实际「${after.title}」`);break;
      case 'currentIdChanged':
        // ★ 重名曲谱专用：标题一样，只有 id 能证明「真的换成了另一份」。
        //   v=true 表示要求 id 必须变；v=false 表示要求不许变。
        if(!!(before.currentId&&after.currentId&&before.currentId!==after.currentId)!==!!v)
          fails.push(`当前曲谱 id 应${v?'改变':'保持不变'}，实际 ${before.currentId} → ${after.currentId}`);
        break;
      case 'playing':
        if(after.playing!==v)fails.push(`playing 应为 ${v}，实际 ${after.playing}`);break;
      case 'measure':
        if(after.measure!==v)fails.push(`小节应为 ${v}，实际 ${after.measure}`);break;
      case 'measureRange':{
        // ★ 为什么需要区间：`ai-seek-measure` 的语义是「从第 N 小节开始播放」，而且
        //   按**当前可听声部**的音符事件定位（只听鼓组时，第 5 小节若没有鼓的音符，
        //   就落到鼓组最早有音符的那一小节）。读状态又总在播放开始之后 1.5 秒，
        //   播放头会推进。所以「跳到第 N 小节」的诚实断言是 N..N+3。
        const [lo,hi]=v;
        if(!(after.measure>=lo&&after.measure<=hi))fails.push(`小节应在 ${lo}~${hi}，实际 ${after.measure}`);
        break;}
      case 'measureAtLeast':
        if(!(after.measure>=v))fails.push(`小节应 ≥ ${v}，实际 ${after.measure}`);break;
      case 'view':
        if(after.view!==v)fails.push(`视图应为 ${v}，实际「${after.view}」`);break;
      case 'panel':
        if(after.panel!==v)fails.push(`面板应为 ${v}，实际「${after.panel}」`);break;
      case 'tempo':
        if(after.tempo!==v)fails.push(`速度应为 ${v}，实际 ${after.tempo}`);break;
      case 'tempoAtLeast':
        if(!(after.tempo>=v))fails.push(`速度应 ≥ ${v}，实际 ${after.tempo}`);break;
      case 'tempoAtMost':
        if(!(after.tempo<=v))fails.push(`速度应 ≤ ${v}，实际 ${after.tempo}`);break;
      case 'metronome':
        if(after.metronome!==v)fails.push(`节拍器应为 ${v}，实际 ${after.metronome}`);break;
      case 'instrumentText':
        if(!after.instrumentText.includes(v))fails.push(`音色应含「${v}」，实际「${after.instrumentText}」`);break;
      case 'arrangement':
        if(after.arrangement!==v)fails.push(`配器应为 ${v}，实际「${after.arrangement}」`);break;
      case 'solo':{
        const want=resolvePart(v,before,after);
        if(want===null)fails.push(`解析不出声部「${v}」`);
        else if(after.solo!==want)fails.push(`独奏应为 ${v}(${want})，实际「${after.solo}」`);
        break;}
      case 'onlyPart':{
        // 「只听 X」的两种等价实现：solo==X，或者除 X 外的声部全被静音
        const want=resolvePart(v,before,after);
        if(want===null){fails.push(`解析不出声部「${v}」`);break;}
        if(after.solo===want)break;
        const others=(after.parts||[]).map(p=>p.value).filter(x=>x!=='all'&&x!==want);
        const unmuted=others.filter(x=>!after.muted.includes(x));
        if(unmuted.length)fails.push(`应只听 ${v}(${want})，实际独奏=${after.solo} 且未静音 ${JSON.stringify(unmuted)}`);
        break;}
      case 'muted':{
        const want=v.map(x=>resolvePart(x,before,after));
        if(want.includes(null))fails.push(`解析不出声部 ${JSON.stringify(v)}`);
        else{
          const miss=want.filter(x=>!after.muted.includes(x));
          if(miss.length)fails.push(`应静音 ${v.join('、')}，实际静音 ${JSON.stringify(after.muted)}`);
        }
        break;}
      default:fails.push(`未知断言字段 ${k}`);
    }
  }
  return fails;
}

function checkReply(rule,reply){
  const fails=[];
  for(const re of rule?.must||[])if(!re.test(reply))fails.push(`回复应匹配 ${re}`);
  for(const re of rule?.mustNot||[])if(re.test(reply))fails.push(`回复不应匹配 ${re}`);
  return fails;
}

// ── 主流程 ──────────────────────────────────────────────────────────
(async()=>{
  // --rescore：不碰模型，用**当前**的用例定义重判已落盘的 before/after/reply。
  // 为什么需要：断言写错了（写太严/写太松）时，不该为了改判而重跑 26 分钟。
  // 每条用例取**最后一条**记录（同一 id 被重跑过就以后者为准）。
  if(argv.includes('--rescore')){
    const byId=new Map();
    for(const line of fs.readFileSync(OUT,'utf8').trim().split('\n')){
      if(!line.trim())continue;
      try{const r=JSON.parse(line);byId.set(r.id,r);}catch(e){}
    }
    const rows=[...byId.values()].sort((a,b)=>a.id-b.id);
    const stat={PASS:0,FAIL:0,ERROR:0};
    const byTier={};
    for(const r of rows){
      const c=CASES.find(x=>x.id===r.id);if(!c)continue;
      const fails=[...checkExpect(c.expect,r.before,r.after),...checkReply(c.reply,r.reply)];
      if(r.status==='ERROR')fails.push('(本轮执行报错：'+(r.fails[0]||'')+')');
      const st=fails.length?(r.status==='ERROR'?'ERROR':'FAIL'):'PASS';
      stat[st]++;
      byTier[c.tier]=byTier[c.tier]||{PASS:0,total:0};
      byTier[c.tier].total++;if(st==='PASS')byTier[c.tier].PASS++;
      const mark=st==='PASS'?'PASS':(st==='ERROR'?'ERR ':'FAIL');
      console.log(`[${String(r.id).padStart(2)}] ${mark} ${c.name}`);
      for(const f of fails)console.log('        · '+f);
      if(st!=='PASS'&&r.reply)console.log('        回复：'+String(r.reply).replace(/\n/g,' ').slice(0,140));
    }
    console.log('\n── 重判汇总 ──');
    for(const [t,v] of Object.entries(byTier))console.log(`  ${t.padEnd(6)} ${v.PASS}/${v.total}`);
    console.log(`  合计   ${stat.PASS}/${rows.length} PASS  (FAIL ${stat.FAIL} / ERROR ${stat.ERROR})`);
    return;
  }
  const browser=await chromium.launch({channel:'msedge',headless:true,proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});
  const results=[];
  try{
    // 标题 → id（只取 ready 的）
    const probe=await browser.newPage();
    await probe.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    const scores=await probe.evaluate(async()=>{
      const r=await fetch('/api/scores');const d=await r.json();
      return (d.scores||[]).filter(x=>x.ready).map(x=>({id:x.id,title:x.title}));
    });
    await probe.close();
    const idOf=t=>{const hit=scores.find(s=>s.title===t)||scores.find(s=>s.title.includes(t));return hit?.id||null;};
    console.log(`ready 曲谱 ${scores.length} 首 | 用例范围 ${FROM}~${TO}`);

    const IDS=strArg('ids','').split(',').map(x=>Number(x.trim())).filter(Boolean);
    const todo=CASES.filter(c=>ONLY?c.id===ONLY:(IDS.length?IDS.includes(c.id):(c.id>=FROM&&c.id<=TO)));
    console.log(`本次要跑 ${todo.length} 条\n`);

    const runBatch=async(list)=>{
    for(const c of list){
      const t0=Date.now();
      const rec={id:c.id,name:c.name,tier:c.tier,say:c.say,status:'',fails:[],before:null,after:null,reply:''};
      let page=null;
      try{
        page=await browser.newPage({viewport:{width:1440,height:900}});
        const errors=[];
        page.on('pageerror',e=>errors.push(String(e.message).slice(0,140)));
        // ★ 2026-10-11：捕获 /api/workspace-ai 的 SSE result 事件，记录**真实**下发的动作数组，
        //   用于排查"界面没生效到底是模型没发动作、还是前端没执行"（排查 longflow #48 时加的）。
        await page.addInitScript(()=>{
          window.__sseActions=[];
          const origFetch=window.fetch;
          window.fetch=async function(input,init){
            const url=typeof input==='string'?input:(input&&input.url)||'';
            const res=await origFetch.apply(this,arguments);
            if(url.includes('/api/workspace-ai')&&res.body){
              try{
                const clone=res.clone();
                const reader=clone.body.getReader();const dec=new TextDecoder();let buf='';
                (async()=>{for(;;){const{done,value}=await reader.read();if(done)break;buf+=dec.decode(value||new Uint8Array(),{stream:true});
                  for(const line of buf.split('\n')){const s=line.trim();if(!s.startsWith('{'))continue;try{const ev=JSON.parse(s);if(ev.type==='result'&&ev.actions)window.__sseActions.push(ev.actions);}catch{}}
                  buf=buf.split('\n').pop();}})().catch(()=>{});
              }catch{}
            }
            return res;
          };
        });
        await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
        await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:BOOT_TIMEOUT_MS});

        // 打开基线曲谱
        const baseId=idOf(c.base);
        if(!baseId)throw new Error('曲库里没有基线曲谱「'+c.base+'」');
        await page.evaluate(id=>new Promise((res,rej)=>document.dispatchEvent(
          new CustomEvent('ai-open-score',{detail:{id,resolve:res,reject:rej}}))),baseId);
        await sleep(4200);

        const baseState=await readState(page);
        await applyPre(page,c.pre,baseState.parts);
        const before=await readState(page);
        rec.before=before;

        // 发指令。`say` 可以是字符串（单轮），也可以是字符串数组（**多轮**）——
        // 真实用户是一句一句说的，多轮里第二句常常省略主语（「只听鼓组」「跳到最后一小节」），
        // 依赖的正是 context.currentId 和对话历史 —— 单轮用例测不到这一层。
        if(!await page.evaluate(()=>!!document.querySelector('.ai-conversation')?.open)){
          await page.locator('#workspace-ai').click();
          await sleep(900);
        }
        const turns=Array.isArray(c.say)?c.say:[c.say];
        for(const turn of turns){
          // ★★ 多轮专属坑（单轮用例永远踩不到）：AI 执行完某些动作后**会自动收起面板**。
          //    实测「只听鼓组」就会（dialog.open 变 false，输入框还在 DOM 里但不可见），
          //    于是下一轮 fill 必然 30 秒超时。→ 每轮发送前都重新确认面板是打开的。
          if(!await page.evaluate(()=>!!document.querySelector('.ai-conversation')?.open)){
            await page.locator('#workspace-ai').click();
            await sleep(900);
          }
          await page.locator('.ai-conversation input').fill(turn);
          await page.locator('.ai-conversation input').press('Enter');
          // ★ 2026-10-09：模型首字延迟变大（上下文/提示词变长），20s 内可能还没进入
          //   is-thinking → 旧代码会「没等到就往下走」→ 在动作生效前就读状态 → 误判失败。
          //   放宽到 45s，并在「动作执行完」后多留 3s 让界面稳定。
          await page.waitForFunction(
            ()=>document.querySelector('.ai-conversation')?.classList.contains('is-thinking'),
            null,{timeout:45000}).catch(()=>{});
          await page.waitForFunction(
            ()=>!document.querySelector('.ai-conversation')?.classList.contains('is-thinking'),
            null,{timeout:CASE_TIMEOUT_MS});
          // ★ 2026-10-09：动作是**逐条**执行的，is-thinking 消失后可能还有最后几步没落盘
          //   （实测 #3「只听钢琴+速度60」读早了 → 误判未生效，实际 UI 已生效）。多留 4.5s。
          await sleep(4500);
          // ★ 2026-10-11：换曲类多步用例（open 14s + seek 最多 15s 兜底）总耗时可到 30s，
          //   固定 4.5s 远远不够 → 实测 #48「独奏鼓组→跳通鼓最早处→播放」在 solo 生效前
          //   就被读状态，误判成"独奏没生效"（实际 t=16s 就正确切成 P10 了）。
          //   这里改为轮询等 AI 真正空闲（发送按钮回到 '↑' 且 ai-executing 消失），最多再等 40s。
          await page.waitForFunction(
            ()=>{
              const btn=document.querySelector('dialog.ai-conversation button[type=submit]');
              const busyText=btn&&btn.textContent==='■';
              const exec=document.body.classList.contains('ai-executing');
              return !busyText&&!exec;
            },
            null,{timeout:40000,polling:500}).catch(()=>{});
          await sleep(800);
        }

        const after=await readState(page);
        rec.after=after;
        rec.reply=await page.evaluate(()=>{
          // ★ 2026-10-09：前端把 assistant 消息从 `<p class="assistant">` 改成了
          //   `<div class="assistant">`（workspace-ai.js 的 line() 用 createElement('div') +
          //   renderAssistantText 渲染）。旧选择器 `p.assistant` 恒为空 → 所有回复断言全挂。
          //   而且现在**每条动作/回复各占一个 div**，只取最后一个会漏内容 → 合并全部。
          const nodes=[...document.querySelectorAll('.ai-messages .assistant')];
          return nodes.map(n=>n.textContent).join('\n').trim();
        });
        rec.actions=await page.evaluate(()=>{
          // 结果气泡里带动作清单的文本，尽力抓一份，便于人工看「它到底做了什么」
          const pills=[...document.querySelectorAll('.ai-settle-pill')];
          return pills.length?pills[pills.length-1].textContent.slice(0,200):'';
        }).catch(()=>'');
        // ★ 2026-10-11：pill 只是 UI 摘要，看不到后端**真实**下发的动作。
        //   排查 longflow #48「独奏没生效」时需要确认真实动作数组，故额外捕获 SSE result 事件。
        if(typeof page!=='undefined'&&page)rec.sseActions=await page.evaluate(()=>{
          const arr=window.__sseActions||[];window.__sseActions=[];return arr;
        }).catch(()=>[]);

        rec.fails=[...checkExpect(c.expect,before,after),...checkReply(c.reply,rec.reply)];
        if(errors.length)rec.fails.push('页面 JS 报错：'+errors.join(' | '));
        rec.status=rec.fails.length?'FAIL':'PASS';
      }catch(e){
        rec.status='ERROR';
        rec.fails.push(String(e.message).split('\n')[0].slice(0,220));
      }finally{
        if(page)await page.close().catch(()=>{});
      }
      rec.ms=Date.now()-t0;
      results.push(rec);
      fs.appendFileSync(OUT,JSON.stringify(rec)+'\n',{encoding:'utf-8'});

      const mark=rec.status==='PASS'?'PASS':(rec.status==='ERROR'?'ERR ':'FAIL');
      console.log(`[${String(c.id).padStart(2)}] ${mark} ${c.name}  (${(rec.ms/1000).toFixed(0)}s)`);
      if(rec.status!=='PASS'){
        for(const f of rec.fails)console.log('        · '+f);
        if(rec.reply)console.log('        回复：'+rec.reply.replace(/\n/g,' ').slice(0,150));
      }
    }
    };
    await runBatch(todo);
    // ★ 失败重试：上游隧道/模型偶发（超时、坏 id）会伪装成「AI 不会做」，
    //   重跑能把「真缺陷」和「噪声」分开。结果按 id 取最后一次。
    for(let r=0;r<RETRY;r++){
      const failed=[...new Set(results.filter(x=>x.status!=='PASS').map(x=>x.id))];
      if(!failed.length)break;
      const list=CASES.filter(c=>failed.includes(c.id));
      console.log(`\n── 重试轮 ${r+1}：${list.length} 条 ──`);
      await runBatch(list);
    }
  } finally {
    await browser.close();
  }
  const finalById=new Map();for(const r of results)finalById.set(r.id,r);
  const finals=[...finalById.values()];
  const pass=finals.filter(r=>r.status==='PASS').length;
  console.log(`\n本片结果：${pass}/${finals.length} PASS`);
})().catch(e=>{console.error('RUNNER FAIL',e);process.exit(1);});
