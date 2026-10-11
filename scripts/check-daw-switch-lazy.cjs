// Bug2 回归探针：Daw→五线谱切回后，懒加载占位块（「正在准备后续谱面」）必须被重新 observe 并渲染。
// 复现路径：从云曲库打开一首足够大的曲子（>16 小节 → 多块 → 出现 [data-lazy-measure] 占位）
//          → 五线谱 → 切 Daw → 切回五线谱。
// 修复前：view('daw') 会 disconnect 懒加载 observer，而 setNotationMode 早退分支跳过 activateLazyEngraving，
//         占位块无人 observe，永久残留。修复后：早退分支补 activateLazyEngraving，observer 重建。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:1360,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(2500);
  // 关闭可能挡路的引导层（多种方式尝试）
  for(const t of ['跳过','跳过选曲','跳过引导','不再提示']){ await page.click('button:has-text("'+t+'")',{timeout:1500}).catch(()=>{}); }
  await page.evaluate(()=>{for(const sel of ['.guided-tour [data-skip]','.guided-tour .tour-skip','.guided-tour [data-close]','.tour-home-intro [data-close]']){const el=document.querySelector(sel);if(el){el.click();break;}}});
  // 打开云曲库（带重试，兼容引导层/首屏状态差异）
  let opened=false;
  for(let attempt=0;attempt<6&&!opened;attempt++){
   for(const sel of ['[data-panel="library"]','button:has-text("曲库")']){ await page.click(sel,{timeout:2500}).catch(()=>{}); }
   try{ await page.waitForSelector('.library-score',{state:'attached',timeout:4000}); opened=true; }catch{}
  }
  await page.waitForSelector('.library-score',{state:'visible',timeout:15000});
  // 找一首能产生懒加载占位块（多块）的曲子：逐个打开曲库卡片，直到 #notation 出现 [data-lazy-measure]
  let lazyCount=0, openedTitle='';
  const cards=await page.$$('.library-score');
  for(let i=0;i<Math.min(cards.length,8);i++){
   const card=((await page.$$('.library-score'))[i]);
   await card.click();
   // 等待谱面进入五线谱渲染
   try{ await page.waitForSelector('#notation .notation-chunk, #notation .note-event',{timeout:15000}); }catch{}
   await page.waitForTimeout(1500);
   lazyCount=await page.evaluate(()=>document.querySelectorAll('#notation [data-lazy-measure]').length);
   openedTitle=await page.evaluate(()=>document.querySelector('#score-title')?.textContent||'');
   if(lazyCount>0)break;
   // 回到曲库再试下一首
   await page.evaluate(()=>{const b=document.querySelector('[data-panel="library"]')||document.querySelector('.library-back');if(b)b.click&&b.click();});
   await page.waitForTimeout(400);
  }
  console.log('打开的曲子 =',openedTitle,' 懒加载占位块数量 =',lazyCount);
  assert.ok(lazyCount>0,'未能找到多块（懒加载）曲子，无法复现 Bug2 —— 请在云曲库确认存在 >16 小节的曲子');
  // 切到 Daw
  await page.click('#daw-button');
  await page.waitForTimeout(500);
  // 切回五线谱
  await page.click('#notation-button');
  await page.waitForTimeout(800);
  // 关键断言 1：切回后 observer 必须被重建（修复前为旧/已 disconnect 的，且占位块不会被重新渲染）
  const state=await page.evaluate(()=>({
   hasObserver:!!document.querySelector('#notation').lazyEngravingObserver,
   lazyNow:document.querySelectorAll('#notation [data-lazy-measure]').length,
  }));
  console.log('切回五线谱后：',JSON.stringify(state));
  assert.ok(state.hasObserver,'切回五线谱后懒加载 observer 未被重建（Bug2 未修复）');
  // 逐块将占位块滚入视口，触发懒加载渲染（修复前 observer 已断连，永远渲染不出）
  let remaining=state.lazyNow;
  for(let pass=0;pass<3&&remaining>0;pass++){
   const handles=await page.$$('#notation [data-lazy-measure]');
   for(const h of handles){ await h.scrollIntoViewIfNeeded().catch(()=>{}); await page.waitForTimeout(350); }
   await page.waitForTimeout(800);
   remaining=await page.evaluate(()=>document.querySelectorAll('#notation [data-lazy-measure]').length);
  }
  console.log('滚动到底后剩余占位块数量 =',remaining);
  assert.equal(remaining,0,'仍有占位块未渲染（「正在准备后续谱面」卡死）');
  assert.deepEqual(errors,[],'页面有 JS 报错: '+errors.join(' | '));
  console.log('PASS: Bug2 已修复 —— Daw→五线谱切回后占位块被重新懒加载并全部渲染');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
