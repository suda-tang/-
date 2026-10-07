// 临时探针：把页面里所有 4xx/5xx 请求和 JS 报错抓出来。
// ★ 第二轮：怀疑 500 来自「打开某一首具体曲谱」（有损坏/异常数据的那几首），
//   所以这次**遍历打开全部 ready 曲谱**，逐首记录。用完即删。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const bad=[];
  const seen=new Set();
  const note=s=>{const k=String(s).slice(0,180);if(!seen.has(k)){seen.add(k);bad.push(k);}};
  page.on('response',r=>{if(r.status()>=400)note(r.status()+'  '+r.request().method()+'  '+r.url());});
  page.on('pageerror',e=>note('PAGEERROR  '+String(e.message).slice(0,200)));
  page.on('console',m=>{if(m.type()==='error')note('CONSOLE  '+String(m.text()).slice(0,200));});

  // ★ 标记「当前在打开哪一首」，5xx 出现时好归因
  let currentScore='(首页)';
  const origNote=note;
  const note2=s=>origNote('['+currentScore+'] '+s);

  await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
  await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000})
    .catch(()=>note2('BOOT 超时'));
  await sleep(3000);
  console.log('【首页加载完】已抓到',bad.length,'条');

  const scores=await page.evaluate(async()=>{
    const r=await fetch('/api/scores');const d=await r.json();
    return (d.scores||[]).map(x=>({id:x.id,title:x.title,ready:x.ready,status:x.status||''}));
  });
  const ready=scores.filter(s=>s.ready);
  console.log('曲谱',scores.length,'首，ready',ready.length,'首。开始逐首打开…\n');

  let opened=0;
  for(const s of ready){
    currentScore=s.title.slice(0,18)+'/'+s.id.slice(0,6);
    const before=bad.length;
    try{
      await page.evaluate(id=>new Promise((res,rej)=>{
        const t=setTimeout(res,8000);
        document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id,resolve:()=>{clearTimeout(t);res();},reject:e=>{clearTimeout(t);res();}}}));
      }),s.id);
    }catch(e){note2('OPEN 抛错 '+e.message.slice(0,60));}
    await sleep(1200);
    opened++;
    if(bad.length>before){
      console.log('  ❌ '+currentScore+' 期间新增 '+(bad.length-before)+' 条异常');
    }
    if(opened%15===0)console.log('  …已打开',opened,'首，累计异常',bad.length,'条');
  }

  console.log('\n【逐首打开完毕】共',opened,'首');
  console.log('===== 抓到的异常（'+bad.length+' 条）=====');
  console.log(bad.length?bad.join('\n'):'（无）');
  await browser.close();
})().catch(e=>{console.error('探针崩溃:',e.message);process.exit(1);});
