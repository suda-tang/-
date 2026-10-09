// 实测全库乐理检索在真实界面里的表现（抓回复 + 原始动作）。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CASES=[
 '这首歌曲里边什么和弦最多？',
 '哪首歌曲的小提琴声部是从五十三小节进入的？',
 '哪些歌曲有两个小提琴声部？',
 '全库最长的曲子是哪首？',
 '音符最多的曲子',
 '没有小提琴的曲子',
 '有没有小提琴声部有比较阴冷的和弦色彩的曲子',
 '查找有小提琴的歌',
 '继续',
 '找悲伤的小提琴曲',
 '明亮一点的钢琴曲',
 '查找含有减七和弦的歌曲',
 '只听小提琴',
 '分析当前小节的和弦',
];
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const scores=await (async()=>{const p=await browser.newPage();await p.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    const s=await p.evaluate(async()=>{const r=await fetch('/api/scores');const d=await r.json();return d.scores.map(x=>({id:x.id,title:x.title}));});await p.close();return s;})();
  for(const q of CASES){
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.addInitScript(()=>{
      const orig=window.fetch;window.__aiResp='';
      window.fetch=async function(...args){
        const res=await orig.apply(this,args);
        try{const url=(typeof args[0]==='string')?args[0]:(args[0]&&args[0].url)||'';
          if(url.includes('workspace-ai')){const cl=res.clone();cl.text().then(t=>{window.__aiResp+=t;}).catch(()=>{});}
        }catch(e){}
        return res;
      };
    });
    try{
      await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
      await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000});
      const b=scores.find(s=>s.title==='知足');
      await page.evaluate(id=>new Promise((res,rej)=>document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id,resolve:res,reject:rej}}))),b.id);
      await sleep(4200);
      if(!await page.evaluate(()=>!!document.querySelector('.ai-conversation')?.open)){await page.locator('#workspace-ai').click();await sleep(900);}
      const t0=Date.now();
      await page.locator('.ai-conversation input').fill(q);
      await page.locator('.ai-conversation input').press('Enter');
      let seen=false;
      for(let i=0;i<100;i++){const t=await page.evaluate(()=>!!document.querySelector('.ai-conversation')?.classList.contains('is-thinking'));if(t)seen=true;if(seen&&!t)break;await sleep(1000);}
      await sleep(2500);
      const reply=await page.evaluate(()=>[...document.querySelectorAll('.ai-messages .assistant')].map(n=>n.textContent).join('\n').trim());
      console.log('\n❓ '+q+'   ('+((Date.now()-t0)/1000).toFixed(0)+'s)');
      console.log('   '+ (reply||'(空)').replace(/\n/g,' | ').slice(0,420));
    }catch(e){console.log('\n❓ '+q+'\n   ERROR '+e.message);}
    finally{await page.close().catch(()=>{});}
  }
  await browser.close();
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
