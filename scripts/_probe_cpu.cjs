const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const scores=await (async()=>{const p=await browser.newPage();await p.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    const s=await p.evaluate(async()=>{const r=await fetch('/api/scores');const d=await r.json();return d.scores.map(x=>({id:x.id,title:x.title}));});await p.close();return s;})();
  const target=scores.find(s=>s.title.startsWith('Rienzi'));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
  await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000});
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval',{interval:500});
  await cdp.send('Profiler.start');
  const t0=Date.now();
  await page.evaluate(id=>new Promise((res,rej)=>document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id,resolve:res,reject:rej}}))),target.id).catch(()=>{});
  console.log('打开耗时 %ss',((Date.now()-t0)/1000).toFixed(1));
  const {profile}=await cdp.send('Profiler.stop');
  // 汇总自耗时
  const byId=new Map();profile.nodes.forEach(n=>byId.set(n.id,n));
  const self=new Map();let total=0;
  const dt=profile.timeDeltas, samples=profile.samples;
  for(let i=0;i<samples.length;i++){const d=dt[i]||0;total+=d;const n=byId.get(samples[i]);if(!n)continue;const f=n.callFrame;const key=(f.functionName||'(anonymous)')+' @ '+(f.url||'').split('/').pop()+':'+f.lineNumber;self.set(key,(self.get(key)||0)+d);}
  const top=[...self.entries()].sort((a,b)=>b[1]-a[1]).slice(0,18);
  console.log('总采样时长 %ss',(total/1e6).toFixed(1));
  top.forEach(([k,v])=>console.log('  '+((v/1e6).toFixed(1)+'s').padStart(8)+'  '+k.slice(0,110)));
  await browser.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
