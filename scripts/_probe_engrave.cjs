const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const scores=await (async()=>{const p=await browser.newPage();await p.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    const s=await p.evaluate(async()=>{const r=await fetch('/api/scores');const d=await r.json();return d.scores.map(x=>({id:x.id,title:x.title}));});await p.close();return s;})();
  const target=scores.find(s=>s.title.startsWith('Rienzi'))||scores.find(s=>s.title.startsWith('The Blue Danube'));
  console.log('目标:',target.title);
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
  await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000});
  // 记录长任务
  await page.evaluate(()=>{window.__long=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(Math.round(e.duration));}).observe({entryTypes:['longtask']});}catch(e){}});
  const t0=Date.now();
  await page.evaluate(id=>new Promise((res,rej)=>document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id,resolve:res,reject:rej}}))),target.id);
  console.log('打开曲谱耗时 %ss',((Date.now()-t0)/1000).toFixed(1));
  await sleep(3000);
  // 找视图切换按钮
  const views=await page.evaluate(()=>[...document.querySelectorAll('button,[role=tab],[data-view]')].map(b=>({t:(b.textContent||'').trim().slice(0,12),v:b.dataset.view||'',id:b.id||''})).filter(x=>/谱|线|简|原稿|音轨/.test(x.t)||/engraved|simple|pdf|daw/.test(x.v)).slice(0,10));
  console.log('视图控件:',JSON.stringify(views));
  const t1=Date.now();
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button,[role=tab],[data-view]')].find(x=>/五线谱/.test(x.textContent||'')||x.dataset.view==='engraved');if(b)b.click();});
  // 等第一个 notation-chunk 出现
  try{await page.waitForSelector('.notation-chunk svg, .notation-chunk canvas',{timeout:120000});}catch(e){console.log('首块未出现');}
  console.log('切到五线谱并出现首块: %ss',((Date.now()-t1)/1000).toFixed(1));
  await sleep(6000);
  const stat=await page.evaluate(()=>({chunks:document.querySelectorAll('.notation-chunk').length,rendered:document.querySelectorAll('.notation-chunk svg,.notation-chunk canvas').length,long:(window.__long||[]).slice(0,10),longMax:Math.max(0,...(window.__long||[]))}));
  console.log('块数:',stat.chunks,'已渲染:',stat.rendered,'最长长任务:',stat.longMax+'ms','前10个长任务:',JSON.stringify(stat.long));
  await browser.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
