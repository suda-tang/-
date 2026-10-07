// 临时探针：把页面里所有 4xx/5xx 请求和 JS 报错抓出来。用完即删。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const bad=[];
  const seen=new Set();
  const note=s=>{const k=String(s).slice(0,160);if(!seen.has(k)){seen.add(k);bad.push(k);}};
  page.on('response',r=>{if(r.status()>=400)note(r.status()+'  '+r.request().method()+'  '+r.url());});
  page.on('requestfailed',r=>note('FAILED  '+r.url()+'  '+(r.failure()?.errorText||'')));
  page.on('pageerror',e=>note('PAGEERROR  '+String(e.message).slice(0,200)));
  page.on('console',m=>{if(m.type()==='error')note('CONSOLE  '+String(m.text()).slice(0,200));});

  await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
  await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000})
    .catch(()=>note('BOOT 超时（页面没就绪）'));
  await sleep(4000);
  console.log('【阶段 1 · 首页加载完】',bad.length?'':'无异常');

  // 打开曲库面板
  await page.evaluate(()=>{document.body.dataset.workspace='library';}).catch(()=>{});
  await sleep(1500);

  // 打开《知足》的两份（重名）
  const scores=await page.evaluate(async()=>{
    const r=await fetch('/api/scores');const d=await r.json();
    return (d.scores||[]).filter(x=>x.ready).map(x=>({id:x.id,title:x.title}));
  });
  const zhizu=scores.filter(s=>s.title==='知足');
  console.log('《知足》份数：',zhizu.length,JSON.stringify(zhizu.map(z=>z.id.slice(0,8))));

  for(const s of zhizu.slice(0,2)){
    await page.evaluate(id=>new Promise((res,rej)=>document.dispatchEvent(
      new CustomEvent('ai-open-score',{detail:{id,resolve:res,reject:rej}}))),s.id).catch(e=>note('OPEN 失败 '+e.message));
    await sleep(3500);
  }
  console.log('【阶段 2 · 打开重名曲谱后】');

  // 逐个切面板
  for(const p of ['play','library','arrange','tasks']){
    await page.evaluate(v=>{document.body.dataset.workspace=v;},p).catch(()=>{});
    await sleep(1200);
  }
  console.log('【阶段 3 · 切完四个面板】');

  console.log('\n===== 抓到的异常（'+bad.length+' 条）=====');
  console.log(bad.length?bad.join('\n'):'（无）');
  await browser.close();
})().catch(e=>{console.error('探针崩溃:',e.message);process.exit(1);});
