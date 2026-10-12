const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,channel:'msedge',args:['--autoplay-policy=no-user-gesture-required'],proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});try{
 const p=await b.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5173/');
 // ★ 2026-10-12：面板切换辅助（与 check-playback.cjs 同款）。#play-button / #autoplay / #xml-input
 //   分布在 play / library 三个面板里，而面板是**互斥**的（非活动面板高度为 0、内容不可点）——
 //   实测点示例谱开始播放后活动面板仍是 library，#workspace-play 高度 0 → 直接点 #play-button 会超时。
 const panel=async id=>{await p.click(`.workspace-nav button[data-panel="${id}"]`);await p.waitForFunction(i=>document.body.dataset.workspace===i,id,{timeout:20000});};
 // ★ 2026-10-12：通用「确保可点」辅助。控件散落在互斥面板与折叠 details 里，且内容在一个
 //   可滚动容器（.setup，clientH≈893 / scrollH≈1403）里 —— 只切面板还不够，还要：
 //   ① 展开目标的所有祖先 <details>；② 在 .setup 里把目标滚进视口；③ 等 bounds 非空。
 const ensure=async selector=>{
   await p.waitForFunction(s=>!!document.querySelector(s),selector,{timeout:30000});
   await p.evaluate(s=>{
     let el=document.querySelector(s);
     let n=el;
     while(n){ if(n.tagName==='DETAILS'&&!n.open)n.open=true; n=n.parentElement; }
   },selector);
   await p.evaluate(s=>{
     const el=document.querySelector(s);
     const scroller=el.closest('.setup')||null;
     if(scroller){
       const er=el.getBoundingClientRect(),sr=scroller.getBoundingClientRect();
       if(er.top<sr.top||er.bottom>sr.bottom) el.scrollIntoView({block:'center'});
     } else el.scrollIntoView({block:'center'});
   },selector);
   await p.waitForFunction(s=>{
     const el=document.querySelector(s);
     if(!el)return false;
     const rc=el.getBoundingClientRect(),cs=getComputedStyle(el);
     return rc.width>0&&rc.height>0&&cs.visibility!=='hidden'&&cs.display!=='none';
   },selector,{timeout:20000});
 };
 // ★ 2026-10-12：#sample-button（打开示例谱）在曲库面板的「设置」<details class="technical"> 里，
 //   该面板默认**折叠**；且实测折叠态下其内容会泄漏渲染到文档可滚动区之外（y≈1268 > scrollHeight 1157），
 //   任何滚动位置都够不着 → 直接 click 会 30s 超时。先展开「设置」再点（实测展开后 click 成功、示例谱正常载入）。
 await p.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:60000});
 await p.evaluate(()=>{const d=document.querySelector('.technical');if(d&&d.tagName==='DETAILS'&&!d.open)d.open=true;});
 await p.waitForFunction(()=>{
   const el=document.querySelector('#sample-button');
   if(!el)return false;
   const rc=el.getBoundingClientRect(),cs=getComputedStyle(el);
   return rc.width>0&&rc.height>0&&cs.visibility!=='hidden'&&cs.display!=='none';
 },null,{timeout:60000});
 await p.locator('#sample-button').click();
 // ★ 2026-10-12：谱面渲染现在会为同一音符生成**重复的 data-index 节点**（带 data-finger-revision 的指法层），
 //   `[data-index="8"]` 严格模式会冲突 → 取 first()。
 await p.locator('[data-index="8"]').first().click();await p.waitForFunction(()=>document.querySelector('#play-button').textContent.includes('暂停'));
 await panel('play');await ensure('#progress-label');assert.ok(parseInt(await p.locator('#progress-label').textContent())>=50);
 await ensure('#play-button');await p.locator('#play-button').click();await panel('play');await ensure('#autoplay');await p.locator('#autoplay').uncheck();await panel('library');await p.locator('#xml-input').setInputFiles('tests/playback.musicxml');
 // ★ 2026-10-12：导入 MusicXML 后 OSMD 重排版 + autoplayImported 切到 play 面板，谱面节点会短暂 detach /
 // 处于不可交互态；直接 locator.waitFor 因"未就绪"在 30s 内反复失败。先等"存在"再滚入视口后交互。
 await p.waitForFunction(()=>document.querySelectorAll('.engraved-sheet [data-index="2"]').length>0,null,{timeout:30000});
 await panel('play');
 // 切到 play 面板后谱面会重新排版，节点先 detach 再 attach，Playwright 的 stable/attached 校验会一直失败。
 // 改为等节点重新 attach 且可见后，用 DOM 派发 click 触发 #notation 的 playFromNote（绕过稳定性校验）。
 await p.waitForFunction(()=>{const e=document.querySelector('.engraved-sheet [data-index="2"]');return e&&e.isConnected&&e.getBoundingClientRect().width>0;},null,{timeout:30000});
 await p.evaluate(()=>{const e=document.querySelector('.engraved-sheet [data-index="2"]');e.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));});await p.waitForFunction(()=>document.querySelector('#play-button').textContent.includes('暂停'));assert.ok(parseInt(await p.locator('#progress-label').textContent())>=62);
 await panel('play');await ensure('#play-button');await p.locator('#play-button').click();await p.screenshot({path:'outputs/refined-score.png',fullPage:true});
 const result=await p.evaluate(async()=>{const {ScorePlayer}=await import('/player.js');const player=new ScorePlayer();player.load({events:[{beat:0,notes:[{midi:60,duration:8}]}]});player.seek(0);await player.play();const voice=[...player.voices][0];const sampled=voice.oscillator instanceof AudioBufferSourceNode;const count=player.samples.length;player.stop();await player.context.close();return {sampled,count};});assert.equal(result.sampled,true);assert.equal(result.count,5);assert.deepEqual(errors,[]);console.log('PASS: sample click seek, engraved keyboard seek, five velocity layers, sampled audio playback');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
