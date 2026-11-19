import {fetchCatalog} from './catalog-request.js';
import {createCoverPainter} from './library-cover-painter.js';
import {applyLibraryPerspective} from './library-perspective.js';
import {createCardOrder} from './library-order.js';
import {mountOnlineMusic} from './library-online-music.js?v=preview-pages8';
import {afterWorkspace} from './background-work.js';
import {createCardDecks} from './library-decks.js?v=9';
import {yieldToBrowser} from './yield-to-browser.js?v=1';
import {abortTimeout} from './abort-timeout.js';
async function categoryRequest(url,options={},milliseconds=15000){const deadline=abortTimeout(null,milliseconds);try{return await fetch(url,{...options,signal:deadline.signal})}finally{deadline.dispose()}}
import {cardPositions,tetherCards} from './library-tether.js';
import {carryCardToLoader} from './library-record.js';
import {concealArrivingScore,restoreArrivingScore,unfoldScoreLoader,foldLoaderIntoScore} from './score-arrival.js';
export function cleanText(value) {
  return String(value || '').replace(/[\uFFFD\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\uFEFF]/g, '').replace(/[\uE000-\uF8FF]/g, '').trim();
}

export function initLibrary({openPdf, openScore, recognizeTitle, matchCover, openPending}) {
  const earlyPanel=document.querySelector('.score-library[data-home-library]');const panel=earlyPanel||document.createElement('section');panel.className='score-library setup-section';delete panel.dataset.homeLibrary;
  const heading=panel.querySelector('h3')||document.createElement('h3');if(!heading.querySelector('.library-title-wide'))heading.innerHTML='<span class=library-title-wide>SUPERTANG 云端曲库</span><span class=library-title-compact>云曲库</span>';
  const refresh=document.createElement('button');refresh.className='small-button library-refresh';refresh.textContent='刷新列表';
  const list=panel.querySelector('.library-list')||document.createElement('div');list.className='library-list';list.setAttribute('aria-busy','true');
  const skeleton=list.querySelector('.library-skeleton')||document.createElement('div');skeleton.className='library-skeleton';skeleton.setAttribute('role','status');skeleton.innerHTML='<div class="skeleton-cover" aria-hidden="true"></div><span>正在读取云曲库</span>';list.append(skeleton);
  if(heading.parentElement!==panel)panel.append(heading);if(list.parentElement!==panel)panel.append(list);
  const importSection=document.querySelector('.score-import');
  if(!earlyPanel)document.querySelector('.practice').prepend(panel);
  const pendingGroup=document.createElement('section');pendingGroup.className='library-pending-group';
  pendingGroup.innerHTML='<button type="button" class="library-pending-toggle" aria-expanded="false"><span>未就绪曲谱</span><small></small><span class="pending-chevron" aria-hidden="true">⌄</span></button><div class="library-pending-fold"><div class="library-pending-items"></div></div>';
  const pendingItems=pendingGroup.querySelector('.library-pending-items'),pendingToggle=pendingGroup.querySelector('button');
  const decks=createCardDecks({list,pendingGroup,pendingItems,pendingToggle,openBrowser:()=>expand.onclick(),isFullscreen:()=>browser.open});
  function regroupPending(){decks.regroup();}
  let snapshotWrite=null,showTestImports=false;
  let lastLeading='';try{lastLeading=localStorage.getItem('cloudLibraryLeading')||'';}catch{}
  const orderCards=createCardOrder(Math.random,lastLeading);
  let deferredCard=null;let pollTimer=null,titleQueue=Promise.resolve(),opening=false;const titlesInFlight=new Set();
  const loader=document.createElement('div');loader.className='score-loading-overlay';loader.hidden=true;loader.innerHTML='<div class=score-loading-dialog role=status aria-live=polite><div class=score-loading-seal role=img aria-label="苏州大学"></div><strong>正在打开琴谱</strong><span>准备连接 SUPERTANG CLOUD</span><div class=score-loading-progress><i></i></div><small>0%</small></div>';loader.setAttribute('popover','manual');document.body.append(loader);
  let shownProgress=0,targetProgress=0,progressFrame=0,progressTime=0,progressStarted=0,barMotion=null;
  const animateProgress=now=>{
    const elapsed=Math.min(64,now-(progressTime||now));progressTime=now;
    // Advance the visual estimate while the network/renderer is busy. Actual
    // stages stay in the text; only successful completion may reach 100%.
    const age=(now-progressStarted)/1000;
    const estimate=Math.min(95,age*3);
    shownProgress=targetProgress>=100?100:estimate;
    const fill=loader.querySelector('.score-loading-progress i');
    if(!barMotion&&targetProgress<100){fill.style.width='100%';fill.style.transformOrigin='left center';barMotion=fill.animate([{transform:'scaleX(0)'},{transform:'scaleX(.95)'}],{duration:31667,easing:'linear',fill:'forwards'});}
    if(targetProgress>=100){barMotion?.cancel();barMotion=null;fill.style.transition='none';fill.style.transform=`scaleX(${shownProgress/100})`;}
    loader.querySelector('small').textContent=targetProgress>=100&&shownProgress>=99.95?'100%':`${shownProgress.toFixed(1)}%`;
    progressFrame=shownProgress<100?requestAnimationFrame(animateProgress):0;
  };
  const updateLoader=(value,label)=>{targetProgress=Math.max(targetProgress,Math.max(0,Math.min(100,Number(value)||0)));if(targetProgress>=100){if(progressFrame)cancelAnimationFrame(progressFrame);progressFrame=0;animateProgress(performance.now());}if(!progressStarted)progressStarted=performance.now();if(targetProgress<100&&!progressFrame)progressFrame=requestAnimationFrame(animateProgress);if(label)loader.querySelector('span').textContent=label;};
  const scoreCache=new Map(),scoreVersions=new Map();
  function invalidateChangedScores(items){for(const item of items){const version=JSON.stringify([item.saved,item.ready,item.status,item.variant]);if(scoreVersions.has(item.id)&&scoreVersions.get(item.id)!==version){const transfer=scoreTransfers.get(item.id);if(transfer&&!transfer.done)transfer.controller.abort();scoreCache.delete(item.id);}scoreVersions.set(item.id,version);}}

  const lowMemory=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  document.body.classList.toggle('library-low-memory',lowMemory);
  const motionAllowed=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
  async function revealLoader(closeLibrary=true){
    loader.hidden=false;loader.showPopover?.();
    const libraryExit=closeLibrary&&browser.open?closeBrowser():Promise.resolve();
    if(!motionAllowed()){await libraryExit;document.body.classList.add('score-loader-covering');return;}
    await libraryExit;loader.hidePopover?.();loader.showPopover?.();
    await unfoldScoreLoader(loader).catch(()=>{});
  }
  async function dismissLoader(success=false){
    if(targetProgress>=100){shownProgress=100;animateProgress(performance.now());}
    try{await foldLoaderIntoScore(loader,{success});}catch(error){console.warn('曲谱过渡未完成',error);restoreArrivingScore();}
    loader.hidePopover?.();loader.hidden=true;document.body.classList.remove('score-loader-covering');document.dispatchEvent(new Event('score-loader-dismissed'));barMotion?.cancel();barMotion=null;if(progressFrame)cancelAnimationFrame(progressFrame);progressFrame=0;
  }
  const scoreTransfers=new Map();
  const prefetchScore=id=>{
    // Hover prefetch must never evict/abort the score the user is opening.
    if(opening&&id!==document.body.dataset.currentScoreId)return Promise.resolve(null);
    while(scoreCache.size>=(lowMemory?1:3)&&!scoreCache.has(id)){const oldest=scoreCache.keys().next().value;if(!scoreTransfers.get(oldest)?.done)scoreTransfers.get(oldest)?.controller.abort();scoreCache.delete(oldest);}
    if(!scoreCache.has(id)){
      const state={received:0,total:0,done:false,error:'',controller:new AbortController()};scoreTransfers.set(id,state);
      scoreCache.set(id,(async()=>{
        let timer;const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>state.controller.abort(),60000);};arm();
        const limit=setTimeout(()=>state.controller.abort(),300000);
        try{
          const response=await fetch(`/api/scores/${id}`,{signal:state.controller.signal});if(!response.ok)throw Error(`云端读取失败（HTTP ${response.status}）`);
          state.total=Number(response.headers.get('X-Uncompressed-Length')||response.headers.get('Content-Length'))||0;
          let data;if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];while(true){const {done,value}=await reader.read();if(done)break;arm();chunks.push(value);state.received+=value.length;}const bytes=new Uint8Array(state.received);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}data=JSON.parse(new TextDecoder().decode(bytes));}else data=await response.json();state.done=true;return data;
        }catch(error){state.error=['AbortError','TimeoutError'].includes(error.name)?'云端曲谱下载中断：连续 60 秒未收到数据，或总等待超过 5 分钟。请重试。':error.message;if(scoreTransfers.get(id)===state)scoreCache.delete(id);return null;}
        finally{clearTimeout(timer);clearTimeout(limit);while(scoreTransfers.size>6)scoreTransfers.delete(scoreTransfers.keys().next().value);}
      })());
    }return scoreCache.get(id);
  };
  async function obtainScore(id){
    const pending=prefetchScore(id);
    const paint=()=>{const state=scoreTransfers.get(id);if(state?.done){updateLoader(32,'已读取曲谱缓存');return;}const received=state?.received||0,total=state?.total||0;const size=n=>(n/1024/1024).toFixed(2)+' MB';updateLoader(total?8+Math.min(1,received/total)*24:8,received?`正在下载电子谱：${size(received)}${total?' / '+size(total):''}`:'正在等待云端曲谱响应');};paint();const interval=setInterval(paint,200);
    try{const data=await pending;if(!data)throw Error(scoreTransfers.get(id)?.error||'琴谱读取失败，请重试');return data;}finally{clearInterval(interval);}
  }

  const stageCards=mode=>{
    if(document.documentElement.matches('.tour-arrival,.tour-travelling'))return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const clip=browser.open?{left:0,top:0,right:innerWidth,bottom:innerHeight}:list.getBoundingClientRect();
    for(const card of [...list.querySelectorAll('.library-score')].filter(c=>!c.hidden&&!c.closest('.library-pending-group')&&intersects(c.getBoundingClientRect(),clip)).slice(0,lowMemory?8:24)){
      card._deal?.cancel();
      card.style.opacity='0';
    }
  };
  const animateCards=mode=>{
    if(document.documentElement.matches('.tour-arrival,.tour-travelling'))return;
    // Resolve the dock's resting perspective before capturing flight endpoints,
    // rather than letting its observer rotate cards after they have landed.
    document.dispatchEvent(new Event('library-layout-ready'));
    for(const card of list.querySelectorAll('.library-score'))card.style.opacity='';
    const destinations=cardPositions(list),origins=new Map([...destinations].map(([card,r])=>[card,{...r,left:-r.width-120,top:r.top-35,visible:r.visible}]));
    transfer=tetherCards(list,origins,destinations,{dock:{left:0,top:0,right:innerWidth,bottom:innerHeight},limit:lowMemory?24:48});return transfer;
  };
  const navigation=document.createElement('div');navigation.className='library-navigation';for(const [label,direction] of [['上一组',-1],['下一组',1]]){const arrow=document.createElement('button');arrow.className='small-button';arrow.textContent=direction<0?'‹':'›';arrow.setAttribute('aria-label',label);let held=false,frame=0,start=0,last=0,moved=false;
    const release=()=>{held=false;cancelAnimationFrame(frame);list.style.scrollSnapType='';list.style.scrollBehavior='';};
    arrow.onpointerdown=e=>{if(e.button!==0)return;held=true;moved=false;start=last=performance.now();arrow.setPointerCapture(e.pointerId);list.style.scrollSnapType='none';list.style.scrollBehavior='auto';
      const pull=now=>{if(!held)return;const elapsed=now-start,dt=Math.min(32,now-last);last=now;if(elapsed>180){moved=true;list.scrollLeft+=direction*Math.min(2.8,.3+(elapsed-180)/650)*dt;}frame=requestAnimationFrame(pull);};frame=requestAnimationFrame(pull);};
    arrow.onpointerup=release;arrow.onpointercancel=release;arrow.onlostpointercapture=release;window.addEventListener('blur',release);
    arrow.onclick=()=>{if(!moved)list.scrollBy({left:direction*list.clientWidth*.72,behavior:'smooth'});};navigation.append(arrow);}heading.after(navigation);refresh.textContent='↻';refresh.setAttribute('aria-label','刷新云曲库');refresh.title='刷新云曲库';navigation.append(refresh);
  const settings=document.createElement('details');settings.className='library-settings';settings.innerHTML='<summary>云曲库设置</summary><div><button class="small-button" type="button" data-ocr>重新 OCR 标题</button><button class="small-button" type="button" data-cover>重新匹配未识别封面</button><button class="small-button" type="button" data-deep>精细重新识谱</button></div>';panel.append(settings);const testLabel=document.createElement('label'),testToggle=document.createElement('input');testToggle.type='checkbox';testToggle.setAttribute('aria-label','显示测试导入');testLabel.append(testToggle,document.createTextNode('显示测试导入'));settings.append(testLabel);testToggle.onchange=()=>{showTestImports=testToggle.checked;void reload(true);};
  const connectorButton=document.createElement('button');connectorButton.className='small-button';connectorButton.type='button';connectorButton.textContent='连接歌曲转谱';connectorButton.onclick=()=>window.open('/scorestarling.html','_blank','noopener');settings.querySelector('div').append(connectorButton);
  const refreshMetadata=async(mode)=>{const button=document.querySelector(mode==='ocr'?'[data-ocr]':mode==='cover'?'[data-cover]':'[data-deep]');const currentId=document.body.dataset.currentScoreId;const items=mode==='deep'?[...list.querySelectorAll('.library-score')].map(card=>card._item).find(item=>item&&item.id===currentId&&item.hasPdf):[...list.querySelectorAll('.library-score')].map(card=>card._item).filter(item=>item&&(mode==='ocr'?item.hasPdf:!item.cover));if(!items||(Array.isArray(items)&&!items.length)){if(mode==='deep'){button.textContent='请先打开一份 PDF';setTimeout(()=>button.textContent='精细重新识谱',1600);}return;}const queue=Array.isArray(items)?items:[items];button.disabled=true;const original=button.textContent;button.textContent='已加入后台处理';try{await Promise.all(queue.map(item=>fetch(`/api/scores/${item.id}/refresh-metadata`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})}).then(response=>{if(!response.ok)throw Error();})));setTimeout(reload,400);}catch{button.textContent='服务暂不可用';}finally{setTimeout(()=>{button.disabled=false;button.textContent=original;},1600);}};
  settings.querySelector('[data-ocr]').onclick=()=>refreshMetadata('ocr');settings.querySelector('[data-cover]').onclick=()=>refreshMetadata('cover');settings.querySelector('[data-deep]').onclick=()=>refreshMetadata('deep');
  const browser=document.createElement('dialog');browser.className='library-browser';browser.innerHTML='<header><h2>云曲库</h2><input type="search" aria-label="搜索曲谱" placeholder="搜索曲谱"><button class="library-close" type="button" aria-label="关闭云曲库" title="关闭">×</button></header>';document.body.append(browser);
  const expand=document.createElement('button');expand.className='small-button library-expand';expand.type='button';expand.textContent='⤢';expand.setAttribute('aria-label','展开云曲库');navigation.insertBefore(expand,navigation.children[1]);
  const libraryHeader=document.createElement('div');libraryHeader.className='library-heading-row';heading.before(libraryHeader);libraryHeader.append(heading,navigation);

  refresh.classList.add('library-refresh');refresh.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 7l-3-3"/></svg><span>刷新曲谱</span>';expand.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/></svg>';

  const classify=document.createElement('button');classify.type='button';classify.className='small-button library-classify';classify.setAttribute('aria-label','AI 分类');classify.title='AI 分类';classify.dataset.libraryAction='categories';classify.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>';const classifyLabel=document.createElement('span');classifyLabel.textContent='AI 分类';classify.append(classifyLabel);navigation.insertBefore(classify,expand);navigation.insertBefore(expand,refresh);
  const categoryStatus=document.createElement('span');categoryStatus.className='library-category-status';categoryStatus.setAttribute('role','status');browser.querySelector('header').after(categoryStatus);
  const categoryControl=document.createElement('button');categoryControl.type='button';categoryControl.className='small-button library-category-control';categoryControl.setAttribute('aria-label','AI 重新分类');categoryControl.title='AI 重新分类';categoryControl.hidden=true;categoryStatus.hidden=true;categoryControl.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/></svg>';const categoryControlLabel=document.createElement('span');categoryControlLabel.textContent='AI 分类';categoryControl.append(categoryControlLabel);const headerActions=document.createElement('div');headerActions.className='library-header-actions';browser.querySelector('header').append(headerActions);headerActions.append(categoryControl,browser.querySelector('.library-close'));
  let categoryTimer=0,categoryRunning=false,categoryKnown=false,categorySignature='';
  let deferredCategory=null,categoryApplyTimer=0;
  function applyCategoryState(data){clearTimeout(categoryApplyTimer);if(!data)return;categoryRunning=data.state==='running';categoryControl.disabled=categoryRunning;categoryControl.setAttribute('aria-busy',String(categoryRunning));if(cardMotion||expanding||closing){deferredCategory=data;clearTimeout(categoryApplyTimer);categoryApplyTimer=setTimeout(()=>applyCategoryState(deferredCategory),100);return;}deferredCategory=null;const signature=JSON.stringify(data.categories||{});if(signature!==categorySignature){categorySignature=signature;decks.setCategories(data.categories||{});}categoryKnown=Object.keys(data.categories||{}).length>0;categoryRunning=data.state==='running';categoryControl.disabled=categoryRunning;categoryControl.setAttribute('aria-busy',String(categoryRunning));classify.title=categoryRunning?'查看分类进度 '+(data.percent||0)+'%':'打开分类';classify.setAttribute('aria-label','打开分类');categoryStatus.textContent=categoryRunning?'正在分类 '+(data.detail||'')+'　'+(data.percent||0)+'%':data.warning||'';}
  async function pollCategories(){clearTimeout(categoryTimer);try{const response=await categoryRequest('/api/scores/classify',{},10000);if(!response.ok)throw Error();applyCategoryState(await response.json());if(categoryRunning)categoryTimer=setTimeout(pollCategories,1500);}catch{categoryStatus.textContent='分类进度连接中断，正在重连…';categoryTimer=setTimeout(pollCategories,4000);}}
  async function classifyLibrary(force=false,instruction=''){
    if(!browser.open){if(reloading){await new Promise(resolve=>{const check=()=>reloading?setTimeout(check,80):resolve();check();});}await expand.onclick(true);}if(!browser.open)return;browser.classList.add('is-category-browser');categoryControl.hidden=false;categoryStatus.hidden=false;decks.setCategorized(true);
    if(categoryRunning){void pollCategories();return;}if(categoryKnown&&!force)return;
    categoryControl.disabled=true;categoryStatus.textContent='正在提交分类…';
    try{const scores=(window.cloudLibrarySnapshot?.scores||[]).map(({id,title,ready})=>({id,title,ready}));
      const response=await categoryRequest('/api/scores/classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scores,force,instruction})});const data=await response.json();if(!response.ok)throw Error(data.error||'分类未完成');applyCategoryState(data);if(categoryRunning)categoryTimer=setTimeout(pollCategories,800);
    }catch(error){categoryControl.disabled=false;categoryStatus.textContent='分类未完成：'+(error.message||'连接中断')+'，可点击 AI 分类重试。';}
  }
  classify.onclick=()=>classifyLibrary();
  const categoryPrompt=document.createElement('dialog');categoryPrompt.className='library-category-prompt';categoryPrompt.innerHTML='<form><header><strong>AI 分类</strong><button type="button" aria-label="关闭分类对话">×</button></header><label for="category-instruction">你希望按照什么方式分类？</label><textarea id="category-instruction" rows="3" maxlength="500" placeholder="例如：按作曲者分组，或按适合初学者、进阶、演出分组"></textarea><small role="status"></small><footer><button type="submit">开始分类</button></footer></form>';document.body.append(categoryPrompt);
  categoryControl.onclick=()=>{if(categoryRunning)return;categoryPrompt.showModal();categoryPrompt.querySelector('textarea').focus();};categoryPrompt.querySelector('[type=button]').onclick=()=>categoryPrompt.close();
  categoryPrompt.querySelector('form').onsubmit=event=>{event.preventDefault();const instruction=categoryPrompt.querySelector('textarea').value.trim();if(!instruction){categoryPrompt.querySelector('small').textContent='请填写分类方式。';return;}categoryPrompt.close();void classifyLibrary(true,instruction);};
  afterWorkspace(pollCategories,{delay:1200});
  let enteredDecks=new WeakSet();
  const deckEntrance=new IntersectionObserver(entries=>{
    for(const entry of entries){if(!entry.isIntersecting||!browser.open)continue;deckEntrance.unobserve(entry.target);if(enteredDecks.has(entry.target))continue;enteredDecks.add(entry.target);
      if(expanding||closing||!motionAllowed())continue;
      entry.target.animate([{opacity:0,transform:'perspective(900px) translateY(20px) rotateX(-7deg)'},{opacity:1,transform:'perspective(900px) translateY(0) rotateX(0deg)'}],{duration:440,easing:'cubic-bezier(.22,.75,.24,1)'});
    }
  },{root:browser,threshold:.05});
  const observeDecks=()=>{deckEntrance.disconnect();if(browser.open)for(const group of list.querySelectorAll('.library-card-stack'))if(!enteredDecks.has(group))deckEntrance.observe(group);};
  new MutationObserver(observeDecks).observe(list,{childList:true});
  let closing=false,motion=null,expanding=false,dockRect=null,dockPlaceholder=null;
  const releaseCardLayout=()=>{list.getBoundingClientRect();requestAnimationFrame(()=>{list.classList.remove('cards-transferring');const more=list.querySelector('.library-stream-more');if(more&&browser.open){streamObserver.unobserve(more);streamObserver.observe(more);}});};
  let deckScroll=0,transfer=Promise.resolve(),cardMotion=false,dockOrder=[];
  const intersects=(box,clip)=>box.right>clip.left&&box.left<clip.right&&box.bottom>clip.top&&box.top<clip.bottom;
  let tiltFrame=0;
  list.addEventListener('pointermove',event=>{
    if(cardMotion||expanding||closing||!browser.open||event.pointerType==='touch'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const card=event.target.closest('.library-score');if(!card)return;list.classList.add('library-hover-ready');
    cancelAnimationFrame(tiltFrame);
    tiltFrame=requestAnimationFrame(()=>{const box=card.getBoundingClientRect();card.style.setProperty('--card-x',`${(0.5-(event.clientY-box.top)/box.height)*10}deg`);card.style.setProperty('--card-y',`${((event.clientX-box.left)/box.width-.5)*14}deg`);});
  },{passive:true});
  list.addEventListener('pointerout',event=>{const card=event.target.closest('.library-score');if(card&&!card.contains(event.relatedTarget)){cancelAnimationFrame(tiltFrame);card.style.removeProperty('--card-x');card.style.removeProperty('--card-y');}});
  const surfaceDockFrame=()=>{
    const box=dockRect||panel.getBoundingClientRect(),clamp=(v,max)=>Math.max(0,Math.min(max,v));
    return {clipPath:`inset(${clamp(box.top,innerHeight)}px ${clamp(innerWidth-box.right,innerWidth)}px ${clamp(innerHeight-box.bottom,innerHeight)}px ${clamp(box.left,innerWidth)}px round 28px)`,opacity:0};
  };
  const animateBrowser=async(open)=>{
    motion?.cancel();
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    // Reveal the actual surface from its dock, without scaling the card layer.
    // Opacity/clip work even when the existing background is !important.
    const dock=surfaceDockFrame(),full={clipPath:'inset(0px 0px 0px 0px round 0px)',opacity:1};
    const lifted={...dock};
    const settled={...full};
    motion=browser.animate(open?[lifted,settled]:[settled,lifted],{duration:850,easing:'cubic-bezier(.32,.05,.2,1)',fill:'both'});
    await motion.finished.catch(()=>{});
  };
  async function closeBrowser(){
    if(!browser.open||closing)return;closing=true;expand.disabled=true;await transfer;
    deckEntrance.disconnect();
    const before=cardPositions(list);list.classList.remove('library-hover-ready');list.classList.add('cards-transferring');
    browser.classList.add('is-closing');
    const dock=dockPlaceholder?.getBoundingClientRect()||dockRect;cardMotion=true;
    // Lay out the real destination before flight; cached dock rectangles become
    // stale after grouping, responsive resizing and content updates.
    {
      decks.reset();panel.insertBefore(list,panel.querySelector('.library-settings'));document.body.classList.remove('library-expanded');
      let anchor=pendingGroup.parentElement===list?pendingGroup:list.querySelector(':scope > .library-stream-more');
      for(let i=dockOrder.length-1;i>=0;i--){const card=dockOrder[i];if(card.parentElement!==list||card.dataset.ready!=='true')continue;if(card.nextElementSibling!==anchor)list.insertBefore(card,anchor);anchor=card;}
      dockPlaceholder?.remove();dockPlaceholder=null;
      for(const card of list.children)card.hidden=false;
      list.scrollLeft=deckScroll;
    }
    document.dispatchEvent(new Event('library-layout-ready'));
    const after=cardPositions(list);
    const commit=()=>browser.close();
    const onLayer=()=>{
      // Returning cards stay behind the loading surface; only the selected
      // original card crosses in front of it. Reorder in the same paint turn.
      for(const surface of [loader,document.querySelector('.record-flight'),document.querySelector('.record-disc-stage')])if(surface?.matches(':popover-open')){surface.hidePopover();surface.showPopover();}
    };
    try{await tetherCards(list,before,after,{closing:true,dock,limit:lowMemory?24:48,settle:()=>animateBrowser(false),commit,onLayer});}finally{cardMotion=false;releaseCardLayout();}
    categoryControl.setAttribute('aria-busy',String(categoryRunning));document.dispatchEvent(new Event('library-tour-closed'));motion?.cancel();browser.style.clipPath='';browser.style.opacity='';list.scrollLeft=deckScroll;
    closing=false;expand.disabled=false;expand.focus({preventScroll:true});
  }
  expand.onclick=async(categoryView=false)=>{
    if(browser.open||closing||expanding||reloading){
      // 首屏还在铺 1800+ 张卡时 reloading=true，以前这里静默 return —— 用户点了「⤢」没反应，
      // 以为按钮坏了。现在给按钮一个可见的「正在载入」反馈（2.4 秒后自动复原）。
      if(reloading&&!browser.open&&!expanding){
        expand.title='曲库正在载入，请稍候再展开';expand.classList.add('is-waiting');
        const hint=browser.querySelector('.library-search-status');
        if(hint&&!hint.textContent)hint.textContent='曲库正在载入，请稍候再展开…';
        clearTimeout(expand._waitTimer);
        expand._waitTimer=setTimeout(()=>{expand.classList.remove('is-waiting');expand.title='展开云曲库';
          if(hint&&/正在载入/.test(hint.textContent))hint.textContent='';},2400);
      }
      return;
    }
    expanding=true;await transfer;dockRect=panel.getBoundingClientRect();deckScroll=list.scrollLeft;
    const origins=cardPositions(list);list.classList.remove('library-hover-ready');list.classList.add('cards-transferring');dockOrder=[...list.querySelectorAll('.library-score')];
    for(const card of list.children){card._deal?.cancel();card._deal=null;card.style.opacity='';}
    // Capture dock coordinates before regrouping or moving the original list.
    deckEntrance.disconnect();
    const categorized=categoryView===true;browser.classList.toggle('is-category-browser',categorized);categoryControl.hidden=!categorized;categoryStatus.hidden=!categorized;if(categorized)decks.setCategorized(true,false);else decks.reset();
    const listBox=list.getBoundingClientRect(),listStyle=getComputedStyle(list);
    dockPlaceholder=document.createElement('div');dockPlaceholder.setAttribute('aria-hidden','true');dockPlaceholder.className='library-dock-placeholder';
    dockPlaceholder.style.cssText=`height:${listBox.height}px;flex-shrink:0;margin-top:${listStyle.marginTop};margin-bottom:${listStyle.marginBottom};pointer-events:none`;
    list.before(dockPlaceholder);
    const streamTail=list.querySelector(':scope > .library-stream-more');if(streamTail)list.append(streamTail);
    browser.append(list);browser.querySelector('input').value='';document.body.classList.add('library-expanded');
    enteredDecks=new WeakSet();browser.classList.remove('is-closing');
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){const start=surfaceDockFrame();browser.style.clipPath=start.clipPath;browser.style.opacity='0';}
    browser.showModal();observeDecks();document.dispatchEvent(new CustomEvent('library-tour-opened',{detail:{browser}}));browser.querySelector('.library-close').focus({preventScroll:true});
    browser.scrollTop=0;
    const destinations=cardPositions(list);cardMotion=true;
    transfer=(async()=>{try{await tetherCards(list,origins,destinations,{dock:listBox,limit:lowMemory?24:48,settle:()=>animateBrowser(true)});}finally{motion?.cancel();browser.style.clipPath='';browser.style.opacity='';cardMotion=false;expanding=false;releaseCardLayout();observeDecks();}})();await transfer;
  };
  panel.tourOpen=async()=>{for(let n=0;n<220&&(reloading||closing);n++)await new Promise(r=>setTimeout(r,100));if(reloading||closing)throw Error('曲库仍在加载，请稍后重试');await expand.onclick();await transfer;return browser;};panel.tourClose=closeBrowser;
  panel.tourOpenCategories=async()=>{await panel.tourOpen();await pollCategories();await classifyLibrary();await transfer;return browser;};
  browser.querySelector('.library-close').onclick=closeBrowser;browser.addEventListener('cancel',event=>{event.preventDefault();closeBrowser();});const searchInput=browser.querySelector('input');searchInput.placeholder='搜索曲名，或描述你想找的音乐';
  const searchStatus=document.createElement('div');searchStatus.className='library-search-status';searchStatus.setAttribute('role','status');browser.querySelector('header').after(searchStatus);
  mountOnlineMusic(browser,searchInput,{onImported:()=>reload(true)});
  let searchTimer,searchRequest,searchRevision=0,searchClock=0;
  searchInput.oninput=()=>{
    const query=searchInput.value.trim();const revision=++searchRevision;clearTimeout(searchTimer);clearInterval(searchClock);searchRequest?.abort();decks.search(query.toLowerCase());searchStatus.replaceChildren();
    if(lowMemory){mobileQuery=query.toLowerCase();mobileMatches=null;mobileLimit=STREAM_BATCH;void reload(true);}if(!query)return;
    searchTimer=setTimeout(async()=>{
      const controller=new AbortController();searchRequest=controller;let timedOut=false,stopped=false,progress=0,completed=0,total=0,stage='正在核对曲名',started=Date.now();
      searchStatus.innerHTML='<div class="library-search-state"><span></span><small></small><button type="button" aria-label="停止搜索">×</button></div><div class="library-search-meter" role="progressbar" aria-label="曲库搜索进度" aria-valuemin="0" aria-valuemax="100"><i></i></div>';
      const label=searchStatus.querySelector('span'),clock=searchStatus.querySelector('small'),meter=searchStatus.querySelector('[role=progressbar]'),fill=meter.firstElementChild;
      const paint=()=>{if(revision!==searchRevision)return;label.textContent=stage;clock.textContent=(progress===100?'100%':total?completed+'/'+total+' 首 · '+Math.round(progress)+'%':'连接中')+' · '+Math.floor((Date.now()-started)/1000)+' 秒';meter.classList.toggle('is-waiting',progress<100&&completed===0);fill.style.width=progress+'%';meter.setAttribute('aria-valuenow',String(Math.round(progress)));};
      searchStatus.querySelector('button').onclick=()=>{stopped=true;controller.abort();};paint();searchClock=setInterval(paint,1000);
      const timeout=setTimeout(()=>{timedOut=true;controller.abort();},75000);
      try{
        const scores=(window.cloudLibrarySnapshot?.scores||[]).map(({id,title})=>({id,title}));
        const response=await fetch('/api/scores/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,scores,stream:true}),signal:controller.signal});
        if(!response.ok){const data=await response.json();throw Error(data.error||'搜索服务返回 HTTP '+response.status);}
        let result=null;
        const receive=event=>{if(revision!==searchRevision)return;if(event.type==='progress'){stage=event.text||'正在检索';completed=Math.max(completed,Number(event.completed)||0);total=Math.max(total,Number(event.total)||0);progress=total?Math.min(99,completed/total*100):0;paint();}else if(event.type==='result'){result=event;if(event.partial&&!lowMemory){const part=event.ids||[];decks.search(query.toLowerCase(),part);stage='已找到 '+part.length+' 首，继续检索…';paint();}}else if(event.type==='error')throw Error(event.text||'搜索未完成');};
        if(response.headers.get('Content-Type')?.includes('ndjson')&&response.body?.getReader){
          const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
          const consume=line=>{if(line.trim())receive(JSON.parse(line));};
          // ★ 与 workspace-ai.js Bug7 同款（2026-10-11）：以前只在 done（连接关闭）时跳出，
//   而这条流迟迟不关闭 → 结果其实早就收到了，但套用结果的代码在循环之后，
//   界面就一直转圈，要等到 75 秒超时才把结果刷出来。
//   result 事件是终点，但 **partial 是中途结果**（后面还会有最终的一版），
//   所以只在「非 partial 的最终 result」到达时才收工。
 for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)consume(line);if(result&&!result.partial){try{void reader.cancel();}catch{}break;}if(done){consume(buffer);break;}}
        }else result=await response.json();
        if(!result)throw Error('搜索连接已结束，但结果未接收完整');if(revision!==searchRevision||!browser.open)return;
        const ids=result.ids||[];if(lowMemory){mobileMatches=new Set(ids);mobileLimit=STREAM_BATCH;await reload(true);}decks.search(query.toLowerCase(),ids);progress=100;stage=result.warning|| (ids.length?'找到 '+ids.length+' 首曲谱':'未找到相关曲谱');paint();searchStatus.querySelector('button')?.remove();
      }catch(error){if(revision===searchRevision){searchStatus.textContent=timedOut?'搜索超过 75 秒未完成，已保留曲名匹配结果。':stopped?'已停止搜索，保留曲名匹配结果。':error.name==='AbortError'?'搜索已中止。':'搜索未完成：'+error.message+'。已保留曲名匹配结果。';}}
      finally{clearTimeout(timeout);if(revision===searchRevision){clearInterval(searchClock);searchRequest=null;}}
    },400);
  };browser.addEventListener('close',()=>{++searchRevision;clearTimeout(searchTimer);clearInterval(searchClock);searchRequest?.abort();searchStatus.replaceChildren();});

  function progressMarkup(button,item){
    let progress=button.querySelector('.library-progress');
    if(item.status==='running'){
      if(!progress){progress=document.createElement('span');progress.className='library-progress';progress.innerHTML='<i></i>';button.append(progress);}
      const bar=progress.querySelector('i');bar.style.width=`${Math.max(2,Math.min(100,Number(item.progress)||0))}%`;
      progress.title=`${item.stage||'正在识谱'} ${Math.round(Number(item.progress)||0)}%`;
    }else if(progress)progress.remove();
  }
  function statusText(item){
    if(item.status==='running')return `${item.stage||'正在识谱'}　${Math.round(Number(item.progress)||0)}%`;
    if(item.status==='failed')return '识谱失败，可重新导入';
    if(item.titleSource==='ocr')return item.ready?'已就绪':'等待电子谱';
    if(item.titleSource==='user')return '已就绪';
    return item.ready?'已就绪':'等待后台识别';
  }
  function updateCard(card,item){
    if(!card)return;
    const stamp=JSON.stringify([item.title,item.status,item.ready,item.progress,item.stage,item.titleSource,item.cover]);
    if(card._renderStamp===stamp)return false;card._renderStamp=stamp;
    if(card._item)Object.assign(card._item,item);
    card.dataset.status=item.status||'idle';card.dataset.ready=String(!!item.ready);
    const title=card.querySelector('.library-title'),nextTitle=cleanText(item.title)||'正在识别原谱标题';if(title&&title.textContent!==nextTitle)title.textContent=nextTitle;
    const detail=card.querySelector('.library-detail'),nextDetail=statusText(item);if(detail&&detail.textContent!==nextDetail)detail.textContent=nextDetail;
    const staff=card.querySelector('.recognition-staff');if(staff){staff.classList.toggle('is-writing',item.status==='running');// A finished card keeps its title and status only; the indicator is for work in
// progress, the way an iOS list row behaves.
staff.hidden=item.status!=='running';}
    progressMarkup(card,item);return true;
  }
  const paintCover=createCoverPainter();
  const coverObserver=new IntersectionObserver(entries=>{for(const entry of entries){entry.target._coverVisible=entry.isIntersecting;entry.target.toggleAttribute('data-cover-visible',entry.isIntersecting);if(entry.isIntersecting&&entry.target._pendingCover){const item=entry.target._pendingCover;entry.target._pendingCover=null;void hydrateCover(item,entry.target);}}},{rootMargin:'100px'});
  document.addEventListener('library-deck-expanded',event=>{for(const card of event.detail.querySelectorAll('.library-score')){coverObserver.unobserve(card);coverObserver.observe(card);}});
  let coverQueue=Promise.resolve();const coverMatches=new Map();
  function hydrateCover(item,card){
    if(!card._coverVisible||(card.closest('.library-card-stack:not(.is-expanded)')&&!card.classList.contains('stack-peek'))){card._pendingCover=item;return Promise.resolve();}
    if(item.cover&&card._coverApplied===item.cover)return Promise.resolve();
    if(item.cover)return hydrateCoverNow(item,card);
    const image=card.querySelector('.library-cover');if(image&&!image.dataset.fallback){image.dataset.fallback='true';void paintCover(card,{url:`/api/scores/${item.id}/cover-fallback`,title:item.title});}
    coverQueue=coverQueue.then(()=>hydrateCoverNow(item,card)).catch(()=>{});
    return coverQueue;
  }
  async function hydrateCoverNow(item,card){
    if(!card.isConnected)return;
    if(!card._coverVisible||(card.closest('.library-card-stack:not(.is-expanded)')&&!card.classList.contains('stack-peek'))){card._pendingCover=item;return;}
    if(item.cover){await paintCover(card,{source:item.cover,url:item.cover.replace(/\/\d+x\d+bb\./,lowMemory?'/240x240bb.':'/480x480bb.'),fallback:`/api/scores/${item.id}/cover-fallback`,title:item.title});return;}
    if(!matchCover||!item.title||item.title==='未命名曲谱')return;
    const title=cleanText(item.title);if(!title)return;
    try{const key=item.id+'|'+title;let pending=coverMatches.get(key);if(!pending){pending=Promise.resolve(matchCover(title,item.id));coverMatches.set(key,pending);if(coverMatches.size>256)coverMatches.delete(coverMatches.keys().next().value);pending.catch(()=>coverMatches.delete(key));}const cover=await pending;if(!cover||!card.isConnected)return;if(card._item&&cleanText(card._item.title)!==title)return;if(!card._coverVisible){card._pendingCover=item;return;}await paintCover(card,{source:cover,url:cover,fallback:`/api/scores/${item.id}/cover-fallback`,title});}catch{}
  }
  function queueTitle(item,card){
    if(!recognizeTitle||!item.hasPdf||item.titleSource==='user'||item.titleVerification==='catalogue'||titlesInFlight.has(item.id))return;titlesInFlight.add(item.id);
    titleQueue=titleQueue.then(async()=>{
      const detail=card.querySelector('.library-detail');if(detail)detail.textContent='正在 OCR 原谱标题';
      try{const result=await recognizeTitle(item);const title=typeof result==='string'?result:result?.title;const cover=typeof result==='object'?result?.cover:'';if(title){const titleEl=card.querySelector('.library-title');if(titleEl)titleEl.textContent=cleanText(title);if(detail)detail.textContent='已就绪';const readyRow=card.querySelector('.recognition-staff');if(readyRow)readyRow.hidden=true;if(cover){const image=document.createElement('span');image.className='library-cover';image.style.backgroundImage=`url("${cover.replace(/"/g,'')}" )`;image.setAttribute('aria-label',`${title}封面`);card.prepend(image);}}}
      catch{if(detail&&card.dataset.status!=='running')detail.textContent='等待再次识别标题';}
    });
  }
  async function pollRecognition(){
    if(cardMotion||expanding||closing||opening){pollTimer=setTimeout(pollRecognition,1200);return;}
    try{
      const response=await fetch('/api/scores');if(!response.ok)throw Error();const data=await response.json();if(cardMotion||expanding||closing||opening){pollTimer=setTimeout(pollRecognition,1200);return;}invalidateChangedScores(data.scores);window.cloudLibrarySnapshot={scores:data.scores,saved:Date.now()};let running=false;
      const mounted=new Map([...list.querySelectorAll('.library-score')].map(c=>[c.dataset.scoreId,c]));let changed=false;
      for(const item of data.scores){const card=mounted.get(item.id);changed=!!updateCard(card,item)||changed;if(card&&(card.dataset.coverTitle!==item.title||card._coverSource!==item.cover)){card.dataset.coverTitle=item.title;card._coverSource=item.cover;void hydrateCover(item,card);}if(item.status==='running')running=true;}
      if(changed)regroupPending();pollTimer=setTimeout(pollRecognition,document.hidden?30000:running?4000:15000);
    }catch{pollTimer=setTimeout(pollRecognition,30000);}
  }
  document.addEventListener('ai-open-score',async event=>{
    const {id,resolve,reject,onProgress=()=>{}}=event.detail;
    if(opening){reject(Error('另一份曲谱正在打开，请稍后重试'));return;}
    opening=true;
    // ★ 2026-10-10 修：手动点卡片打开时（第 372 行）会写 body.dataset.currentScoreId，
    //   但 AI 打开走的是这条路，以前漏写 —— 导致 AI 打开曲谱后前端快照里的
    //   currentScoreId 仍是旧值，与 workspace-ai.js:157「library.js 每次打开曲谱都会写」
    //   的契约不符，后续依赖该值的逻辑（如 open 动作回读、上下文上报）拿到的是过期信息。
    document.body.dataset.currentScoreId=id;
    try{shownProgress=0;targetProgress=0;progressTime=0;progressStarted=performance.now();barMotion?.cancel();barMotion=null;if(progressFrame)cancelAnimationFrame(progressFrame);progressFrame=0;updateLoader(4,'正在读取琴谱');await revealLoader();onProgress(.1);const data=await obtainScore(id);concealArrivingScore();await openScore({...data,id},(percent,label)=>{updateLoader(percent,label);onProgress(percent/100);});await dismissLoader(true);opening=false;resolve();}
    catch(error){await dismissLoader();opening=false;reject(error);}
  });
  const STREAM_BATCH=24;let reloading=false,mobileLimit=STREAM_BATCH,mobileQuery='',mobileMatches=null;
  const streamObserver=new IntersectionObserver(entries=>{if(browser.open&&!document.querySelector('.tour-home-intro')&&entries.some(e=>e.isIntersecting)&&!reloading){mobileLimit+=STREAM_BATCH;void reload(true);}},{root:browser,rootMargin:'240px'});
  list.addEventListener('scroll',()=>{if(!lowMemory||browser.open||reloading||document.documentElement.classList.contains('tour-arrival')||!list.querySelector('.library-stream-more'))return;if(list.scrollWidth>list.clientWidth+100&&list.scrollLeft+list.clientWidth>=list.scrollWidth-100){mobileLimit+=STREAM_BATCH;void reload(true);}},{passive:true});
  async function reload(local=false,force=false){
    if(reloading||opening||cardMotion||expanding||closing)return;let shuffleNext=!local;reloading=true;streamObserver.disconnect();refresh.disabled=true;
    // 下面这一段原本写在 try 之前：transfer（卡片位移动画）一旦抛错，异常会直接
    // 冲出函数，finally 永远等不到，reloading / refresh.disabled 就此卡死 ——
    // 表现就是「刷新云曲库」按钮从此失灵，只有整页刷新才能恢复。
    // 现在把它纳入 try 的保护范围，由 finally 统一兜底复位。
    try{
    try{await transfer;}catch{/* 位移动画失败不该拖垮整个刷新 */ }
    const previousScroll=browser.open?browser.scrollTop:list.scrollLeft;if(pollTimer)clearTimeout(pollTimer);
    const leaving=[...list.querySelectorAll('.library-score')].filter(card=>{const box=card.getBoundingClientRect();return box.width>0&&box.bottom>0&&box.top<innerHeight&&box.right>0&&box.left<innerWidth;}).slice(0,24);
    if(!local&&motionAllowed())await Promise.all(leaving.map((card,index)=>{card._deal?.cancel();card.style.opacity='';return card.animate([{opacity:1,translate:'0px 0px',rotate:'0deg',scale:'1'},{opacity:0,translate:`${-innerWidth-card.getBoundingClientRect().right}px -35px`,rotate:'18deg',scale:'.25'}],{duration:360,delay:Math.min(index*28,350),easing:'cubic-bezier(.55,.05,.9,.4)',fill:'forwards'}).finished.catch(()=>{});}));
    const controller=new AbortController(),requestTimeout=setTimeout(()=>controller.abort(),45000);let backgroundPending=false;
    try{
      window.reportStartupActivity?.({id:'catalog',label:'读取云曲库列表'});
      // ★ 2026-10-10 缓存优先：先用上次快照（内存或 localStorage）秒显首屏，后台再静默拉最新；接口偶发慢甚至挂掉时也不白等
      const cacheOK=!local&&window.cloudLibrarySnapshot&&window.cloudLibrarySnapshot.scores&&window.cloudLibrarySnapshot.scores.length;
      const sameCatalog=fresh=>{const a=window.cloudLibrarySnapshot.scores,f=fresh.scores;if(a.length!==f.length)return false;const fp=s=>s.id+'\u0001'+(s.status||'')+'\u0001'+(s.ready?1:0)+'\u0001'+(s.progress||0)+'\u0001'+(s.stage||'');const fa=new Map(a.map(s=>[s.id,fp(s)]));for(const s of f){if(fa.get(s.id)!==fp(s))return false;}return true;};
      const fetchFresh=()=>fetchCatalog();
      const paint=async(data,incremental=local)=>{
        if(!list.querySelector('.library-score')){
          await window.homeStylesReady;window.prepareHomepageShell?.();
          // Never expose cards in the legacy practice parent while the real
          // homepage shell is still being prepared by its asynchronous script.
          if(!document.querySelector('#workspace-library')&&document.documentElement.dataset.workspaceReady!=='true')await new Promise(resolve=>window.addEventListener('workspace-ready',resolve,{once:true}));
          const target=document.querySelector('#workspace-library');if(target&&panel.parentElement!==target)target.prepend(panel);
        }
        invalidateChangedScores(data.scores);window.cloudLibrarySnapshot={scores:data.scores,saved:Date.now()};
        snapshotWrite?.cancel();snapshotWrite=afterWorkspace(()=>{try{localStorage.setItem('cloudLibrarySnapshot',JSON.stringify(window.cloudLibrarySnapshot));}catch{}});
        const existing=new Map([...list.querySelectorAll('.library-score')].map(c=>[c.dataset.scoreId,c]));
        const initialEntrance=!incremental&&!existing.size&&!force;
        if(!incremental){coverObserver.disconnect();decks.clear(false);pendingItems.replaceChildren();pendingToggle.setAttribute('aria-expanded','false');pendingGroup.classList.remove('is-expanded');list.replaceChildren();}
        list.querySelector('.library-stream-more')?.remove();
        const byTitle=new Map();for(const item of data.scores){const key=String(item.title||'').normalize('NFKC').toLowerCase().replace(/[\s《》「」_-]/g,'');if(!item.ready||!key||/未命名|正在识别/.test(key)){byTitle.set(item.id,item);continue;}const current=byTitle.get(key);if(!current||Number(item.ready)>Number(current.ready)||(item.ready===current.ready&&(item.saved||0)>(current.saved||0)))byTitle.set(key,item);}
        const uniqueItems=[...byTitle.values()].filter(item=>showTestImports||!(/^(?:noauth|probe|test(?:_|-|$)|upload-test)/i.test(String(item.title||''))||item.metadata?.test===true));let visibleItems=[...orderCards(uniqueItems.filter(item=>item.ready),shuffleNext),...uniqueItems.filter(item=>!item.ready)];shuffleNext=false;try{if(visibleItems[0])localStorage.setItem('cloudLibraryLeading',visibleItems[0].id);}catch{}if(lowMemory){visibleItems=visibleItems.filter(item=>mobileMatches!==null?mobileMatches.has(item.id):!mobileQuery||String(item.title||'').toLowerCase().includes(mobileQuery));}
        const pageItems=lowMemory?visibleItems.slice(0,mobileLimit):visibleItems;
        window.reportStartupActivity?.({id:'catalog',label:'准备云曲库封面卡片',detail:'本次显示 '+pageItems.length+' 首'});
        const pendingBatch=[];let firstAppended=false;const nextPaint=()=>new Promise(r=>requestAnimationFrame(()=>r()));
        const publishCards=async cards=>{
          if(!cards.length)return;list.append(...cards);
          // The resting 3D pose must be resolved before the first visible frame,
          // including the fast initial batch, not after its entrance has ended.
          if(!browser.open)applyLibraryPerspective(list,true);
          if(initialEntrance&&motionAllowed())for(const card of cards)card._deal=card.animate([{opacity:0,translate:'-40px 8px',rotate:'y -12deg'},{opacity:1,translate:'0px 0px',rotate:'y 0deg'}],{duration:480,delay:Math.min(card._entranceIndex*35,140),easing:'cubic-bezier(.22,.75,.24,1)',fill:'backwards'});
          await nextPaint();
        };
        const wanted=new Set(pageItems.map(item=>item.id));
        if(incremental)for(const [id,card]of existing)if(!wanted.has(id)){coverObserver.unobserve(card);card.remove();}
        for(const [scoreIndex,item] of pageItems.entries()){
          if(incremental&&existing.has(item.id)){const card=existing.get(item.id);updateCard(card,item);void hydrateCover(item,card);continue;}
          if(scoreIndex&&scoreIndex%24===0)await yieldToBrowser();
          const button=document.createElement('button');button.className='library-score';button.dataset.scoreId=item.id;button.dataset.status=item.status||'idle';button.dataset.ready=String(!!item.ready);
          button._item=item;
          button._renderStamp=JSON.stringify([item.title,item.status,item.ready,item.progress,item.stage,item.titleSource,item.cover]);
          const fallback=document.createElement('span');fallback.className='library-cover';fallback.style.backgroundImage='linear-gradient(145deg,#785751,#a67e74)';button.append(fallback);
          const title=document.createElement('strong');title.className='library-title';title.textContent=cleanText(item.title)||'正在识别原谱标题';
          const detail=document.createElement('small');detail.className='library-detail';detail.textContent=statusText(item);
          const staff=document.createElement('span');staff.className='recognition-staff';staff.innerHTML='<i></i><i></i><i></i><i></i><i></i>';staff.hidden=item.status!=='running';staff.classList.toggle('is-writing',item.status==='running');
          button.append(title,detail,staff);progressMarkup(button,item);
          button.onclick=async()=>{
            if(opening||closing||expanding||reloading||cardMotion){deferredCard=item.id;detail.textContent='正在准备打开…';const clickDeadline=Date.now()+60000;const waitForCard=()=>{if(deferredCard!==item.id)return;if(Date.now()>clickDeadline){deferredCard=null;detail.textContent='页面仍在处理，请稍后重新点击';return;}if(opening||closing||expanding||reloading||cardMotion){setTimeout(waitForCard,120);return;}deferredCard=null;list.querySelector(`[data-score-id="${CSS.escape(item.id)}"]`)?.click();};setTimeout(waitForCard,120);return;}opening=true;button.disabled=true;button.setAttribute('aria-busy','true');
            if(item.status==='failed'&&!item.hasPdf){
             opening=false;button.disabled=false;button.removeAttribute('aria-busy');
             const recovery=document.createElement('dialog');recovery.className='score-recovery-dialog';
             const title=document.createElement('h3'),reason=document.createElement('p'),choose=document.createElement('button'),close=document.createElement('button');
             title.textContent=cleanText(item.title)||'曲谱处理失败';reason.textContent=item.error||item.stage||'上次处理未完成，请重新选择原始文件导入。';choose.textContent='重新选择源文件';close.textContent='关闭';choose.type=close.type='button';choose.className=close.className='small-button';
             choose.onclick=()=>{const picker=document.querySelector('.score-import input[type=file]');if(picker)picker.click();};close.onclick=()=>recovery.close();recovery.addEventListener('close',()=>recovery.remove(),{once:true});recovery.append(title,reason,choose,close);document.body.append(recovery);recovery.showModal();return;
            }
            let tourError=null;document.dispatchEvent(new CustomEvent('library-tour-loading',{detail:{id:item.id}}));
            document.body.dataset.currentScoreId=item.id;
            if(item.ready)void prefetchScore(item.id);
            try{
              shownProgress=0;targetProgress=0;progressTime=0;progressStarted=performance.now();barMotion?.cancel();barMotion=null;if(progressFrame)cancelAnimationFrame(progressFrame);progressFrame=0;updateLoader(4,cleanText(item.title)||'正在读取琴谱');
              loader.hidden=false;loader.showPopover?.();loader.style.opacity=motionAllowed()?'0':'';const loaderEntry=Promise.resolve();let libraryExit=Promise.resolve(),scorePrepared=false;
              // Start download, parsing and engraving while the selected sleeve opens.
              const scoreWork=button.dataset.ready==='true'?(async()=>{concealArrivingScore();const data=await obtainScore(item.id);updateLoader(34,'解析音符与声部');await openScore({...data,id:item.id,hasPdf:item.hasPdf},updateLoader);if(lowMemory)scoreCache.delete(item.id);})().then(()=>{scorePrepared=true;return {ok:true}},error=>({error})):null;
              const recordFlight=carryCardToLoader(button,list,loader,()=>libraryExit,{ready:()=>scorePrepared});
              libraryExit=browser.open?closeBrowser():Promise.resolve();
              if(item.ready)void prefetchScore(item.id);
              await Promise.all([recordFlight,loaderEntry,libraryExit]);regroupPending();
              if(button.dataset.ready==='true'){
                const result=scoreWork?await scoreWork:null;if(result?.error)throw result.error;
              }
              else if(item.hasPdf&&openPending){await openPending(item);}
              else if(item.hasPdf){const pdf=await fetch(`/api/scores/${item.id}/pdf`);if(!pdf.ok)throw Error('原谱读取失败');await openPdf(new File([await pdf.blob()],`${cleanText(item.title)||'云曲谱'}.pdf`,{type:'application/pdf'}));}
              else {document.dispatchEvent(new Event('show-task-center'));detail.textContent=item.status==='failed'?'处理失败，请重新选择源文件导入':'正在后台转录';if(item.status==='failed'){const picker=document.querySelector('.score-import input[type=file]');if(picker){picker.scrollIntoView({block:'center',behavior:'smooth'});picker.click();}}}
            }catch(e){tourError=e.message;detail.textContent=e.message;}finally{await dismissLoader(!tourError&&button.dataset.ready==='true'&&targetProgress>=100);button.disabled=false;button.removeAttribute('aria-busy');opening=false;document.dispatchEvent(new CustomEvent('library-tour-selected',{detail:{id:item.id,ready:button.dataset.ready==='true',error:tourError}}));}
          };
          button._entranceIndex=scoreIndex;
          button.onpointerenter=()=>{if(item.ready&&!lowMemory)void prefetchScore(item.id);};coverObserver.observe(button);void hydrateCover(item,button);
          pendingBatch.push(button);if(pendingBatch.length>=(!firstAppended?4:STREAM_BATCH)){await publishCards(pendingBatch.splice(0));firstAppended=true;}
        }
        window.reportStartupActivity?.({id:'catalog',label:'云曲库列表已准备',state:'complete',detail:pageItems.length+' 首'});
        if(pendingBatch.length)await publishCards(pendingBatch.splice(0));regroupPending();if(lowMemory&&visibleItems.length>pageItems.length){const more=document.createElement('div');more.className='library-stream-more';more.setAttribute('role','status');more.textContent='正在载入更多曲谱…';list.append(more);requestAnimationFrame(()=>{if(more.isConnected)streamObserver.observe(more);});}if(!data.scores.length)list.textContent='暂无琴谱';
        else if(!incremental&&!initialEntrance){const mode=browser.open?'full':'deck';stageCards(mode);await animateCards(mode);}
        pollTimer=setTimeout(pollRecognition,4000);
      };
      if(local){
        if(window.cloudLibrarySnapshot&&window.cloudLibrarySnapshot.scores&&window.cloudLibrarySnapshot.scores.length)await paint(window.cloudLibrarySnapshot);
        else{const data=await fetchFresh();await paint(data);}
      }else if(cacheOK&&!force){
        await paint(window.cloudLibrarySnapshot);
        // ★ 后台静默拉取不能被下面的 finally 提前清掉超时，否则请求会永久悬挂（无中止）。
        backgroundPending=true;
        (async()=>{try{const fresh=await fetchFresh();if(!sameCatalog(fresh))await paint(fresh,true);}catch{window.reportStartupActivity?.({id:'catalog',label:'云曲库列表已准备（离线缓存）',state:'complete',detail:'缓存 '+window.cloudLibrarySnapshot.scores.length+' 首'});}finally{backgroundPending=false;clearTimeout(requestTimeout);}})();
      }else{
        // 直接拉最新再重绘即可：paint 在拉取**之后**才清空列表，拉取期间旧卡片一直可见，
        // 不需要先绘一遍旧快照（那只会让每次强制刷新多画一遍全库、把请求推后好几秒）。
        const data=await fetchFresh();
        await paint(data);
      }
    }catch{window.reportStartupActivity?.({id:'catalog',label:'云曲库连接未完成',state:'failed',detail:controller.signal.aborted?'请求超过 45 秒':'服务器未返回可用列表'});list.textContent='琴谱库暂不可用，点击刷新重试。';}
    finally{if(local){if(browser.open)browser.scrollTop=previousScroll;else list.scrollLeft=previousScroll;}if(!backgroundPending)clearTimeout(requestTimeout);reloading=false;refresh.disabled=false;list.setAttribute('aria-busy','false');}    }catch(error){reloading=false;refresh.disabled=false;list.setAttribute('aria-busy','false');console.warn('曲库刷新未完成',error);}
  }
  refresh.onclick=async()=>{refresh.animate([{transform:'rotate(0deg)'},{transform:'rotate(250deg)'},{transform:'rotate(360deg)'}],{duration:520,easing:'cubic-bezier(.22,.8,.25,1)'});await reload(false,true);};
  document.addEventListener('score-renamed',event=>{const {id,title}=event.detail||{},card=id&&list.querySelector(`[data-score-id="${id}"]`);if(card){card._item={...card._item,title,titleSource:'user'};updateCard(card,card._item);}});
  document.addEventListener('open-library-score',async event=>{if(reloading)for(let n=0;n<100&&reloading;n++)await new Promise(r=>setTimeout(r,100));let card=list.querySelector(`[data-score-id="${CSS.escape(event.detail.id)}"]`);if(!card&&lowMemory){mobileQuery='';mobileMatches=new Set([event.detail.id]);mobileQuery='\u0000';mobileLimit=STREAM_BATCH;await reload();card=list.querySelector(`[data-score-id="${CSS.escape(event.detail.id)}"]`);}if(card)card.click();});
  // ★ 2026-10-10 缓存优先：模块加载时若 localStorage 有上次快照，先恢复到内存，
  //   这样首次 reload 即可 cacheOK=true 用旧列表秒显首屏（含 F5 整页刷新场景）。
  try{const s=JSON.parse(localStorage.getItem('cloudLibrarySnapshot')||'null');if(s&&Array.isArray(s.scores)&&s.scores.length)window.cloudLibrarySnapshot=s;}catch{}
  reload();return reload;
}

