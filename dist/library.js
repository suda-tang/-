import {createCardDecks} from './library-decks.js?v=8';
export function cleanText(value) {
  return String(value || '').replace(/[\uFFFD\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\uFEFF]/g, '').replace(/[\uE000-\uF8FF]/g, '').trim();
}

export function initLibrary({openPdf, openScore, recognizeTitle, matchCover, openPending}) {
  const panel=document.createElement('section');panel.className='score-library setup-section';
  const heading=document.createElement('h3');heading.textContent='SUPERTANG CLOUD 云曲谱';
  const refresh=document.createElement('button');refresh.className='small-button library-refresh';refresh.textContent='刷新列表';
  const list=document.createElement('div');list.className='library-list';list.setAttribute('aria-busy','true');
  const skeleton=document.createElement('div');skeleton.className='library-skeleton';skeleton.setAttribute('role','status');skeleton.innerHTML='<div class="skeleton-cover" aria-hidden="true"></div><span>正在读取云曲库</span>';list.append(skeleton);
  panel.append(heading,list);
  const importSection=document.querySelector('.score-import');
  document.querySelector('.practice').prepend(panel);
  const pendingGroup=document.createElement('section');pendingGroup.className='library-pending-group';
  pendingGroup.innerHTML='<button type="button" class="library-pending-toggle" aria-expanded="false"><span>未就绪曲谱</span><small></small><span class="pending-chevron" aria-hidden="true">⌄</span></button><div class="library-pending-fold"><div class="library-pending-items"></div></div>';
  const pendingItems=pendingGroup.querySelector('.library-pending-items'),pendingToggle=pendingGroup.querySelector('button');
  const decks=createCardDecks({list,pendingGroup,pendingItems,pendingToggle,openBrowser:()=>expand.onclick(),isFullscreen:()=>browser.open});
  function regroupPending(){decks.regroup();}
  let pollTimer=null,titleQueue=Promise.resolve(),opening=false;const titlesInFlight=new Set();
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
  function invalidateChangedScores(items){for(const item of items){const version=JSON.stringify([item.saved,item.ready,item.status,item.variant]);if(scoreVersions.has(item.id)&&scoreVersions.get(item.id)!==version)scoreCache.delete(item.id);scoreVersions.set(item.id,version);}}

  const lowMemory=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  document.body.classList.toggle('library-low-memory',lowMemory);
  const motionAllowed=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
  async function liftRecord(card){
    if(!motionAllowed())return;
    const rect=card.getBoundingClientRect(),shell=document.createElement('div');shell.className='record-flight';
    Object.assign(shell.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});
    const sleeve=card.cloneNode(true);sleeve.removeAttribute('id');sleeve.removeAttribute('data-score-id');sleeve.disabled=false;sleeve.tabIndex=-1;sleeve.className='record-sleeve';sleeve.style.cssText='';
    const disc=document.createElement('div');disc.className='record-disc';shell.append(disc,sleeve);shell.setAttribute('aria-hidden','true');shell.setAttribute('popover','manual');document.body.append(shell);
    card.style.visibility='hidden';
    const discMotion=disc.animate([{transform:'translateY(0) rotate(0deg)'},{transform:'translateY(-28%) rotate(36deg)'}],{duration:460,fill:'forwards',easing:'cubic-bezier(.2,.7,.2,1)'});
    const flight=shell.animate([
      {transform:'perspective(900px) translate3d(0,0,0) rotateX(0deg)',opacity:1},
      {transform:'perspective(900px) translate3d(0,-28px,100px) rotateX(-23deg)',opacity:1,offset:.55},
      {transform:'perspective(900px) translate3d(0,-40px,190px) rotateX(-34deg)',opacity:0}
    ],{duration:640,easing:'cubic-bezier(.22,.65,.25,1)',fill:'both'});
    try{await Promise.race([flight.finished,new Promise(resolve=>setTimeout(resolve,1000))]);}catch{}finally{flight.cancel();discMotion.cancel();shell.remove();card.style.visibility='';}
  }
  async function revealLoader(){
    loader.hidden=false;loader.showPopover?.();
    if(browser.open){decks.reset();categoryControl.setAttribute('aria-busy',String(categoryRunning));browser.close();document.dispatchEvent(new Event('library-tour-closed'));panel.insertBefore(list,panel.querySelector('.library-settings'));document.body.classList.remove('library-expanded');for(const card of list.children)card.hidden=false;list.scrollLeft=deckScroll;}
    loader.hidden=false;
    if(!motionAllowed())return;
    const surface=loader.querySelector('.score-loading-dialog');
    await Promise.all([
      loader.animate([{opacity:0},{opacity:1}],{duration:260,easing:'ease-out'}).finished,
      surface.animate([{opacity:0,transform:'perspective(1000px) translateY(24px) rotateX(9deg) scale(.94)'},{opacity:1,transform:'perspective(1000px) translateY(0) rotateX(0deg) scale(1)'}],{duration:420,easing:'cubic-bezier(.16,1,.3,1)'}).finished
    ]).catch(()=>{});
  }
  async function dismissLoader(){
    if(targetProgress>=100){shownProgress=100;animateProgress(performance.now());}
    if(!loader.hidden&&motionAllowed())await loader.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-10px)'}],{duration:300,easing:'cubic-bezier(.4,0,.8,1)'}).finished.catch(()=>{});
    loader.hidePopover?.();loader.hidden=true;barMotion?.cancel();barMotion=null;if(progressFrame)cancelAnimationFrame(progressFrame);progressFrame=0;
  }
  const scoreTransfers=new Map();
  const prefetchScore=id=>{
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
        }catch(error){state.error=['AbortError','TimeoutError'].includes(error.name)?'云端曲谱下载中断：连续 60 秒未收到数据，或总等待超过 5 分钟。请重试。':error.message;scoreCache.delete(id);return null;}
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
    const origins=new Map([...list.querySelectorAll('.library-score')].map(card=>{const box=card.getBoundingClientRect();return [card.dataset.scoreId,{left:-box.width-120,top:box.top-70,width:box.width,height:box.height}];}));
    transfer=flyCards(origins,true);return transfer;
  };
  const navigation=document.createElement('div');navigation.className='library-navigation';for(const [label,direction] of [['上一组',-1],['下一组',1]]){const arrow=document.createElement('button');arrow.className='small-button';arrow.textContent=direction<0?'‹':'›';arrow.setAttribute('aria-label',label);let held=false,frame=0,start=0,last=0,moved=false;
    const release=()=>{held=false;cancelAnimationFrame(frame);list.style.scrollSnapType='';list.style.scrollBehavior='';};
    arrow.onpointerdown=e=>{if(e.button!==0)return;held=true;moved=false;start=last=performance.now();arrow.setPointerCapture(e.pointerId);list.style.scrollSnapType='none';list.style.scrollBehavior='auto';
      const pull=now=>{if(!held)return;const elapsed=now-start,dt=Math.min(32,now-last);last=now;if(elapsed>180){moved=true;list.scrollLeft+=direction*Math.min(2.8,.3+(elapsed-180)/650)*dt;}frame=requestAnimationFrame(pull);};frame=requestAnimationFrame(pull);};
    arrow.onpointerup=release;arrow.onpointercancel=release;arrow.onlostpointercapture=release;window.addEventListener('blur',release);
    arrow.onclick=()=>{if(!moved)list.scrollBy({left:direction*list.clientWidth*.72,behavior:'smooth'});};navigation.append(arrow);}heading.after(navigation);refresh.textContent='↻';refresh.setAttribute('aria-label','刷新云曲库');refresh.title='刷新云曲库';navigation.append(refresh);
  const settings=document.createElement('details');settings.className='library-settings';settings.innerHTML='<summary>云曲库设置</summary><div><button class="small-button" type="button" data-ocr>重新 OCR 标题</button><button class="small-button" type="button" data-cover>重新匹配未识别封面</button><button class="small-button" type="button" data-deep>精细重新识谱</button></div>';panel.append(settings);
  const refreshMetadata=async(mode)=>{const button=document.querySelector(mode==='ocr'?'[data-ocr]':mode==='cover'?'[data-cover]':'[data-deep]');const currentId=document.body.dataset.currentScoreId;const items=mode==='deep'?[...list.querySelectorAll('.library-score')].map(card=>card._item).find(item=>item&&item.id===currentId&&item.hasPdf):[...list.querySelectorAll('.library-score')].map(card=>card._item).filter(item=>item&&(mode==='ocr'?item.hasPdf:!item.cover));if(!items||(Array.isArray(items)&&!items.length)){if(mode==='deep'){button.textContent='请先打开一份 PDF';setTimeout(()=>button.textContent='精细重新识谱',1600);}return;}const queue=Array.isArray(items)?items:[items];button.disabled=true;const original=button.textContent;button.textContent='已加入后台处理';try{await Promise.all(queue.map(item=>fetch(`/api/scores/${item.id}/refresh-metadata`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})}).then(response=>{if(!response.ok)throw Error();})));setTimeout(reload,400);}catch{button.textContent='服务暂不可用';}finally{setTimeout(()=>{button.disabled=false;button.textContent=original;},1600);}};
  settings.querySelector('[data-ocr]').onclick=()=>refreshMetadata('ocr');settings.querySelector('[data-cover]').onclick=()=>refreshMetadata('cover');settings.querySelector('[data-deep]').onclick=()=>refreshMetadata('deep');
  const browser=document.createElement('dialog');browser.className='library-browser';browser.innerHTML='<header><h2>云曲库</h2><input type="search" aria-label="搜索曲谱" placeholder="搜索曲谱"><button class="library-close" type="button" aria-label="关闭云曲库" title="关闭">×</button></header>';document.body.append(browser);
  const expand=document.createElement('button');expand.className='small-button library-expand';expand.type='button';expand.textContent='⤢';expand.setAttribute('aria-label','展开云曲库');navigation.insertBefore(expand,navigation.children[1]);
  const libraryHeader=document.createElement('div');libraryHeader.className='library-heading-row';heading.before(libraryHeader);libraryHeader.append(heading,navigation);

  refresh.classList.add('library-refresh');refresh.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 7l-3-3"/></svg><span>刷新曲谱</span>';expand.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/></svg><span>更多曲谱</span>';

  const classify=document.createElement('button');classify.type='button';classify.className='small-button library-classify';classify.setAttribute('aria-label','分类曲谱');classify.title='分类曲谱';classify.dataset.libraryAction='categories';classify.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>';navigation.insertBefore(classify,refresh);
  const categoryStatus=document.createElement('span');categoryStatus.className='library-category-status';categoryStatus.setAttribute('role','status');browser.querySelector('header').after(categoryStatus);
  const categoryControl=document.createElement('button');categoryControl.type='button';categoryControl.className='small-button library-category-control';categoryControl.setAttribute('aria-label','AI 重新分类');categoryControl.title='AI 重新分类';categoryControl.hidden=true;categoryStatus.hidden=true;categoryControl.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/></svg>';const headerActions=document.createElement('div');headerActions.className='library-header-actions';browser.querySelector('header').append(headerActions);headerActions.append(categoryControl,browser.querySelector('.library-close'));
  let categoryTimer=0,categoryRunning=false,categoryKnown=false,categorySignature='';
  function applyCategoryState(data){const signature=JSON.stringify(data.categories||{});if(signature!==categorySignature){categorySignature=signature;decks.setCategories(data.categories||{});}categoryKnown=Object.keys(data.categories||{}).length>0;categoryRunning=data.state==='running';categoryControl.disabled=categoryRunning;categoryControl.setAttribute('aria-busy',String(categoryRunning));classify.title=categoryRunning?'查看分类进度 '+(data.percent||0)+'%':'打开分类';classify.setAttribute('aria-label','打开分类');categoryStatus.textContent=categoryRunning?'正在分类 '+(data.detail||'')+'　'+(data.percent||0)+'%':data.warning||'';}
  async function pollCategories(){clearTimeout(categoryTimer);try{const response=await fetch('/api/scores/classify',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();applyCategoryState(await response.json());if(categoryRunning)categoryTimer=setTimeout(pollCategories,1500);}catch{categoryStatus.textContent='分类进度连接中断，正在重连…';categoryTimer=setTimeout(pollCategories,4000);}}
  async function classifyLibrary(force=false,instruction=''){
    if(!browser.open){if(reloading){await new Promise(resolve=>{const check=()=>reloading?setTimeout(check,80):resolve();check();});}await expand.onclick(true);}if(!browser.open)return;browser.classList.add('is-category-browser');categoryControl.hidden=false;categoryStatus.hidden=false;decks.setCategorized(true);
    if(categoryRunning){void pollCategories();return;}if(categoryKnown&&!force)return;
    categoryControl.disabled=true;categoryStatus.textContent='正在提交分类…';
    try{const scores=(window.cloudLibrarySnapshot?.scores||[]).map(({id,title,ready})=>({id,title,ready}));
      const response=await fetch('/api/scores/classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scores,force,instruction}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error||'分类未完成');applyCategoryState(data);if(categoryRunning)categoryTimer=setTimeout(pollCategories,800);
    }catch(error){categoryControl.disabled=false;categoryStatus.textContent='分类未完成：'+(error.message||'连接中断')+'，可点击 AI 分类重试。';}
  }
  classify.onclick=()=>classifyLibrary();
  const categoryPrompt=document.createElement('dialog');categoryPrompt.className='library-category-prompt';categoryPrompt.innerHTML='<form><header><strong>AI 分类</strong><button type="button" aria-label="关闭分类对话">×</button></header><label for="category-instruction">你希望按照什么方式分类？</label><textarea id="category-instruction" rows="3" maxlength="500" placeholder="例如：按作曲者分组，或按适合初学者、进阶、演出分组"></textarea><small role="status"></small><footer><button type="submit">开始分类</button></footer></form>';document.body.append(categoryPrompt);
  categoryControl.onclick=()=>{if(categoryRunning)return;categoryPrompt.showModal();categoryPrompt.querySelector('textarea').focus();};categoryPrompt.querySelector('[type=button]').onclick=()=>categoryPrompt.close();
  categoryPrompt.querySelector('form').onsubmit=event=>{event.preventDefault();const instruction=categoryPrompt.querySelector('textarea').value.trim();if(!instruction){categoryPrompt.querySelector('small').textContent='请填写分类方式。';return;}categoryPrompt.close();void classifyLibrary(true,instruction);};
  void pollCategories();
  let enteredDecks=new WeakSet();
  const deckEntrance=new IntersectionObserver(entries=>{
    for(const entry of entries){if(!entry.isIntersecting||!browser.open)continue;deckEntrance.unobserve(entry.target);if(enteredDecks.has(entry.target))continue;enteredDecks.add(entry.target);
      if(!motionAllowed())continue;
      entry.target.animate([{opacity:0,transform:'perspective(900px) translateY(20px) rotateX(-7deg)'},{opacity:1,transform:'perspective(900px) translateY(0) rotateX(0deg)'}],{duration:440,easing:'cubic-bezier(.22,.75,.24,1)'});
    }
  },{root:browser,threshold:.05});
  const observeDecks=()=>{deckEntrance.disconnect();if(browser.open)for(const group of list.querySelectorAll('.library-card-stack'))if(!enteredDecks.has(group))deckEntrance.observe(group);};
  new MutationObserver(observeDecks).observe(list,{childList:true});
  let closing=false,motion=null,expanding=false,dockRect=null;
  let deckScroll=0,transfer=Promise.resolve(),cardMotion=false;
  const intersects=(box,clip)=>box.right>clip.left&&box.left<clip.right&&box.bottom>clip.top&&box.top<clip.bottom;
  const cardRects=()=>{const clip=browser.open?{left:0,top:0,right:innerWidth,bottom:innerHeight}:list.getBoundingClientRect();return new Map([...list.querySelectorAll('.library-score')].filter(card=>!card.hidden).map(card=>{const box=card.getBoundingClientRect();return [card.dataset.scoreId,{left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height,visible:intersects(box,clip)}];}));};
  const flyCards=async (origins,fall=false)=>{
    if(fall&&document.documentElement.matches('.tour-arrival,.tour-travelling')){for(const card of list.children){card.style.opacity='';card.style.visibility='';}return;}
    const cleanup=[];
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const viewport={left:0,top:0,right:innerWidth,bottom:innerHeight};
    const cards=[...list.querySelectorAll('.library-score')].filter(card=>{if(card.hidden)return false;const r=card.getBoundingClientRect(),from=origins.get(card.dataset.scoreId);return r.width>0&&r.height>0&&(intersects(r,viewport)||from?.visible);}).slice(0,lowMemory?8:24);
    // Read layout once before creating flight layers; alternating reads/writes
    // for every cover forces repeated layout on a large library.
    const targetClip=browser.open?{left:0,top:0,right:innerWidth,bottom:innerHeight}:list.getBoundingClientRect();
    const mouth=panel.getBoundingClientRect(),deckBox=list.getBoundingClientRect();
    const visualProperties=['display','box-sizing','font-family','font-size','font-weight','line-height','color','background','border','border-radius','box-shadow','padding','margin','width','height','min-height','overflow','position','inset','flex','align-items','justify-content','gap','object-fit','white-space','text-align'];
    const snapshots=new Map(cards.map(card=>{
      const rect=card.getBoundingClientRect(),from=origins.get(card.dataset.scoreId);
      const moving=intersects(rect,targetClip)||(!fall&&from?.visible);
      const styles=moving?[card,...card.querySelectorAll('*')].map(node=>{const style=getComputedStyle(node);return visualProperties.map(key=>[key,style.getPropertyValue(key)]);}):null;
      return [card,{rect,styles}];
    }));
    const layer=document.createElement('div');layer.className='card-flight-layer';layer.setAttribute('popover','manual');layer.setAttribute('aria-hidden','true');document.body.append(layer);if(layer.showPopover)layer.showPopover();document.dispatchEvent(new Event('library-flight-layer'));
    const headerHeight=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tour-header-height'))||0;layer.style.clipPath=`inset(${headerHeight}px 0 0 0)`;cardMotion=true;
    list.classList.add('cards-transferring');
    try{await Promise.all(cards.map((card,index)=>{
      card._deal?.cancel();card._deal=null;card.style.opacity='';
      let from=origins.get(card.dataset.scoreId),to=snapshots.get(card).rect;
      const visible=box=>box&&box.right!==undefined?box.right>0&&box.left<innerWidth&&box.bottom>0&&box.top<innerHeight:!!box;
      const sourceVisible=from?.visible??visible(from),targetVisible=visible(to)&&intersects(to,targetClip);
      const absorbing=!fall&&sourceVisible&&!targetVisible;
      if(!fall&&!sourceVisible&&!targetVisible)return;
      // Off-screen deck cards travel through the deck mouth rather than vanish.
      if(!fall&&!sourceVisible&&targetVisible)from={left:Math.min(innerWidth-80,mouth.right-90),top:mouth.top+100,width:80,height:100};
      if(!fall&&sourceVisible&&!targetVisible)to={left:Math.min(innerWidth-70,mouth.right-70),top:deckBox.top+deckBox.height/2,width:36,height:48};
      if(reduced||!from||!to.width||!from.width)return;
      // Animate in viewport space, outside the dialog's scaling and scroll clips.
      if(fall&&!targetVisible)return;
      const ghost=card.cloneNode(true);
      ghost.querySelectorAll('img').forEach(img=>{img.loading='eager';img.decoding='async';});
      // Keep typography, cover crop and surface identical outside the dialog.
      const targets=[ghost,...ghost.querySelectorAll('*')];
      snapshots.get(card).styles?.forEach((styles,i)=>{for(const [key,value] of styles)targets[i].style.setProperty(key,value);});
      ghost.removeAttribute('data-score-id');ghost.removeAttribute('id');ghost.classList.add('card-flight-ghost');ghost.disabled=false;ghost.tabIndex=-1;
      ghost.style.cssText+=`;position:absolute!important;left:${to.left}px!important;top:${to.top}px!important;width:${to.width}px!important;height:${to.height}px!important;min-width:0!important;min-height:0!important;margin:0!important;transform:none!important;transform-origin:0 0!important;transition:none!important;opacity:1;visibility:visible!important;content-visibility:visible!important;`;
      layer.append(ghost);card.style.visibility='hidden';
      const inset=`inset(${Math.max(0,targetClip.top-to.top)}px ${Math.max(0,to.left+to.width-targetClip.right)}px ${Math.max(0,to.top+to.height-targetClip.bottom)}px ${Math.max(0,targetClip.left-to.left)}px)`;
      if(fall){const clip=deckBox;layer.style.clipPath=`inset(${Math.max(headerHeight,clip.top)}px ${Math.max(0,innerWidth-clip.right)}px ${Math.max(0,innerHeight-clip.bottom)}px ${Math.max(0,clip.left)}px)`;}

      const dx=from.left-to.left,dy=from.top-to.top,sx=from.width/to.width,sy=from.height/to.height;
      const flight=ghost.animate(fall?[
        {translate:`${dx}px ${dy}px -70px`,rotate:'1 0.6 0.2 -20deg',scale:'.94'},
        {translate:'-18px -6px 12px',rotate:'1 0.6 0.2 2deg',scale:'1.01',offset:.8},
        {translate:'0px 0px 0px',rotate:'1 0.6 0.2 0deg',scale:'1',clipPath:inset}
      ]:[
        {translate:`${dx}px ${dy}px 0px`,scale:`${sx} ${sy}`,rotate:'1 0.6 0.2 0deg',opacity:1,clipPath:'inset(0px)'},
        {translate:`${dx*.58+(closing?22:-22)}px ${dy*.58-30}px 48px`,scale:`${sx*.58+.42} ${sy*.58+.42}`,rotate:`1 0.6 0.2 ${closing?12:-12}deg`,offset:.42},
        {translate:`${dx*.1}px ${dy*.1-4}px 8px`,scale:`${sx*.1+.9} ${sy*.1+.9}`,rotate:`1 0.6 0.2 ${closing?2:-2}deg`,offset:.8},
        {translate:'0px 0px 0px',scale:absorbing?'0.001 0.001':'1 1',rotate:'1 0.6 0.2 0deg',opacity:absorbing?0:1,clipPath:absorbing?'inset(0px)':inset}
      ],{duration:fall?560:620,delay:Math.min(index*(fall?22:10),fall?180:70),easing:'cubic-bezier(.22,.55,.25,1)',fill:'both'});
      card._deal=flight;
      const finish=()=>{if(card._deal===flight){card.style.visibility='';flight.cancel();card._deal=null;}ghost.remove();};cleanup.push(finish);
      return flight.finished.catch(()=>{}).finally(finish);
    }));

    }finally{cleanup.forEach(finish=>finish());for(const card of list.querySelectorAll('.library-score')){card.style.opacity='';card.style.visibility='';}layer.remove();list.classList.remove('cards-transferring');cardMotion=false;document.dispatchEvent(new Event('library-flight-finished'));}
  };
  let tiltFrame=0;
  list.addEventListener('pointermove',event=>{
    if(cardMotion||expanding||closing||!browser.open||event.pointerType==='touch'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const card=event.target.closest('.library-score');if(!card)return;
    cancelAnimationFrame(tiltFrame);
    tiltFrame=requestAnimationFrame(()=>{const box=card.getBoundingClientRect();card.style.setProperty('--card-x',`${(0.5-(event.clientY-box.top)/box.height)*10}deg`);card.style.setProperty('--card-y',`${((event.clientX-box.left)/box.width-.5)*14}deg`);});
  },{passive:true});
  list.addEventListener('pointerout',event=>{const card=event.target.closest('.library-score');if(card&&!card.contains(event.relatedTarget)){cancelAnimationFrame(tiltFrame);card.style.removeProperty('--card-x');card.style.removeProperty('--card-y');}});
  const animateBrowser=async(open)=>{
    motion?.cancel();
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const box=dockRect||panel.getBoundingClientRect();
    const x=box.left+box.width/2-innerWidth/2,y=box.top+box.height/2-innerHeight/2;
    const dock={opacity:0,transform:`translate3d(${x}px,${y}px,0) scale(${Math.max(.15,box.width/innerWidth)},${Math.max(.12,box.height/innerHeight)})`,borderRadius:'28px'};
    const full={opacity:1,transform:'translate3d(0,0,0) scale(1)',borderRadius:'0px'};
    motion=browser.animate(open?[dock,full]:[full,dock],{duration:500,easing:'cubic-bezier(.32,0,.18,1)',fill:'both'});
    await motion.finished.catch(()=>{});
  };
  async function closeBrowser(){
    if(!browser.open||closing)return;closing=true;expand.disabled=true;await transfer;
    const origins=cardRects();
    browser.classList.add('is-closing');
    await animateBrowser(false);
    decks.reset();categoryControl.setAttribute('aria-busy',String(categoryRunning));browser.close();document.dispatchEvent(new Event('library-tour-closed'));motion?.cancel();panel.insertBefore(list,panel.querySelector('.library-settings'));
    document.body.classList.remove('library-expanded');for(const card of list.children)card.hidden=false;list.scrollLeft=deckScroll;
    transfer=flyCards(origins);await transfer;deckEntrance.disconnect();
    closing=false;expand.disabled=false;expand.focus({preventScroll:true});
  }
  expand.onclick=async(categoryView=false)=>{
    if(browser.open||closing||expanding||reloading)return;expanding=true;await transfer;dockRect=panel.getBoundingClientRect();deckScroll=list.scrollLeft;
    for(const card of list.children){card._deal?.cancel();card._deal=null;card.style.opacity='';}
    const origins=cardRects();
    const categorized=categoryView===true;browser.classList.toggle('is-category-browser',categorized);categoryControl.hidden=!categorized;categoryStatus.hidden=!categorized;if(categorized)decks.setCategorized(true);else decks.reset();
    browser.append(list);browser.querySelector('input').value='';document.body.classList.add('library-expanded');
    enteredDecks=new WeakSet();browser.classList.remove('is-closing');browser.showModal();observeDecks();document.dispatchEvent(new CustomEvent('library-tour-opened',{detail:{browser}}));browser.querySelector('.library-close').focus({preventScroll:true});
    transfer=(async()=>{try{await Promise.all([flyCards(origins),animateBrowser(true)]);}finally{motion?.cancel();expanding=false;}})();await transfer;
  };
  panel.tourOpen=async()=>{for(let n=0;n<220&&(reloading||closing);n++)await new Promise(r=>setTimeout(r,100));if(reloading||closing)throw Error('曲库仍在加载，请稍后重试');await expand.onclick();await transfer;return browser;};panel.tourClose=closeBrowser;
  browser.querySelector('.library-close').onclick=closeBrowser;browser.addEventListener('cancel',event=>{event.preventDefault();closeBrowser();});const searchInput=browser.querySelector('input');searchInput.placeholder='搜索曲名，或描述你想找的音乐';
  const searchStatus=document.createElement('div');searchStatus.className='library-search-status';searchStatus.setAttribute('role','status');browser.querySelector('header').after(searchStatus);
  let searchTimer,searchRequest,searchRevision=0,searchClock=0;
  searchInput.oninput=()=>{
    const query=searchInput.value.trim();const revision=++searchRevision;clearTimeout(searchTimer);clearInterval(searchClock);searchRequest?.abort();decks.search(query.toLowerCase());searchStatus.replaceChildren();
    if(lowMemory){mobileQuery=query.toLowerCase();mobileMatches=null;mobileLimit=STREAM_BATCH;void reload(true);}if(!query)return;
    searchTimer=setTimeout(async()=>{
      const controller=new AbortController();searchRequest=controller;let timedOut=false,stopped=false,progress=5,stage='正在核对曲名',started=Date.now();
      searchStatus.innerHTML='<div class="library-search-state"><span></span><small></small><button type="button" aria-label="停止搜索">×</button></div><div class="library-search-meter" role="progressbar" aria-label="曲库搜索进度" aria-valuemin="0" aria-valuemax="100"><i></i></div>';
      const label=searchStatus.querySelector('span'),clock=searchStatus.querySelector('small'),meter=searchStatus.querySelector('[role=progressbar]'),fill=meter.firstElementChild;
      const paint=()=>{if(revision!==searchRevision)return;label.textContent=stage;clock.textContent=Math.round(progress)+'%'+(Date.now()-started>=2000?' · '+Math.floor((Date.now()-started)/1000)+' 秒':'');fill.style.width=progress+'%';meter.setAttribute('aria-valuenow',String(Math.round(progress)));};
      searchStatus.querySelector('button').onclick=()=>{stopped=true;controller.abort();};paint();searchClock=setInterval(paint,1000);
      const timeout=setTimeout(()=>{timedOut=true;controller.abort();},75000);
      try{
        const scores=(window.cloudLibrarySnapshot?.scores||[]).map(({id,title})=>({id,title}));
        const response=await fetch('/api/scores/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,scores,stream:true}),signal:controller.signal});
        if(!response.ok){const data=await response.json();throw Error(data.error||'搜索服务返回 HTTP '+response.status);}
        let result=null;
        const receive=event=>{if(revision!==searchRevision)return;if(event.type==='progress'){stage=event.text||'正在检索';progress=Math.max(progress,10+85*(event.total?event.completed/event.total:0));paint();}else if(event.type==='result')result=event;else if(event.type==='error')throw Error(event.text||'搜索未完成');};
        if(response.headers.get('Content-Type')?.includes('ndjson')&&response.body?.getReader){
          const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
          const consume=line=>{if(line.trim())receive(JSON.parse(line));};
          for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)consume(line);if(done){consume(buffer);break;}}
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
    const title=card.querySelector('.library-title');if(title)title.textContent=cleanText(item.title)||'正在识别原谱标题';
    const detail=card.querySelector('.library-detail');if(detail)detail.textContent=statusText(item);
    const staff=card.querySelector('.recognition-staff');if(staff){staff.classList.toggle('is-writing',item.status==='running');// A finished card keeps its title and status only; the indicator is for work in
// progress, the way an iOS list row behaves.
staff.hidden=item.status!=='running';}
    progressMarkup(card,item);return true;
  }
  const coverObserver=new IntersectionObserver(entries=>{for(const entry of entries){entry.target._coverVisible=entry.isIntersecting;if(entry.isIntersecting&&entry.target._pendingCover){const item=entry.target._pendingCover;entry.target._pendingCover=null;void hydrateCover(item,entry.target);}}},{rootMargin:'100px'});
  document.addEventListener('library-deck-expanded',event=>{for(const card of event.detail.querySelectorAll('.library-score')){coverObserver.unobserve(card);coverObserver.observe(card);}});
  let coverQueue=Promise.resolve();const coverMatches=new Map();
  function hydrateCover(item,card){
    if(!card._coverVisible||(card.closest('.library-card-stack:not(.is-expanded)')&&!card.classList.contains('stack-peek'))){card._pendingCover=item;return Promise.resolve();}
    if(item.cover&&card._coverApplied===item.cover)return Promise.resolve();
    if(item.cover)return hydrateCoverNow(item,card);
    const image=card.querySelector('.library-cover');if(image&&!image.dataset.fallback){image.dataset.fallback='true';image.style.backgroundImage=`url('/api/scores/${item.id}/cover-fallback')`;}
    coverQueue=coverQueue.then(()=>hydrateCoverNow(item,card)).catch(()=>{});
    return coverQueue;
  }
  async function hydrateCoverNow(item,card){
    if(!card.isConnected)return;
    if(item.cover){card._coverApplied=item.cover;let image=card.querySelector('.library-cover');if(!image){image=document.createElement('span');image.className='library-cover';card.prepend(image);}image.style.backgroundImage=`url("${item.cover.replace(/\/\d+x\d+bb\./,lowMemory?'/240x240bb.':'/480x480bb.').replace(/"/g,'')}"),url("/api/scores/${item.id}/cover-fallback")`;return;}
    if(!matchCover||!item.title||item.title==='未命名曲谱')return;
    const title=cleanText(item.title);if(!title)return;
    try{const key=item.id+'|'+title;let pending=coverMatches.get(key);if(!pending){pending=Promise.resolve(matchCover(title,item.id));coverMatches.set(key,pending);if(coverMatches.size>256)coverMatches.delete(coverMatches.keys().next().value);pending.catch(()=>coverMatches.delete(key));}const cover=await pending;if(!cover||!card.isConnected)return;let image=card.querySelector('.library-cover');if(!image){image=document.createElement('span');image.className='library-cover';card.prepend(image);}image.style.backgroundImage=`url("${cover.replace(/"/g,'')}"),url("/api/scores/${item.id}/cover-fallback")`;image.setAttribute('aria-label',`${title}封面`);}catch{}
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
    try{
      const response=await fetch('/api/scores');if(!response.ok)throw Error();const data=await response.json();invalidateChangedScores(data.scores);window.cloudLibrarySnapshot={scores:data.scores,saved:Date.now()};let running=false;
      const mounted=new Map([...list.querySelectorAll('.library-score')].map(c=>[c.dataset.scoreId,c]));let changed=false;
      for(const item of data.scores){const card=mounted.get(item.id);changed=!!updateCard(card,item)||changed;if(card&&card.dataset.coverTitle!==item.title){card.dataset.coverTitle=item.title;void hydrateCover(item,card);}if(item.status==='running')running=true;}
      if(changed)regroupPending();pollTimer=setTimeout(pollRecognition,document.hidden?30000:running?4000:15000);
    }catch{pollTimer=null;}
  }
  document.addEventListener('ai-open-score',async event=>{
    const {id,resolve,reject,onProgress=()=>{}}=event.detail;
    if(opening){reject(Error('另一份曲谱正在打开，请稍后重试'));return;}
    opening=true;
    try{await revealLoader();onProgress(.1);const data=await obtainScore(id);await openScore({...data,id},(percent,label)=>{updateLoader(percent,label);onProgress(percent/100);});await dismissLoader();opening=false;resolve();}
    catch(error){await dismissLoader();opening=false;reject(error);}
  });
  const STREAM_BATCH=24;let reloading=false,mobileLimit=STREAM_BATCH,mobileQuery='',mobileMatches=null;
  const streamObserver=new IntersectionObserver(entries=>{if(browser.open&&!document.querySelector('.tour-home-intro')&&entries.some(e=>e.isIntersecting)&&!reloading){mobileLimit+=STREAM_BATCH;void reload(true);}},{root:browser,rootMargin:'240px'});
  list.addEventListener('scroll',()=>{if(!lowMemory||browser.open||reloading||document.documentElement.classList.contains('tour-arrival')||!list.querySelector('.library-stream-more'))return;if(list.scrollWidth>list.clientWidth+100&&list.scrollLeft+list.clientWidth>=list.scrollWidth-100){mobileLimit+=STREAM_BATCH;void reload(true);}},{passive:true});
  async function reload(local=false){
    if(reloading||opening)return;reloading=true;streamObserver.disconnect();refresh.disabled=true;await transfer;
    const previousScroll=browser.open?browser.scrollTop:list.scrollLeft;if(pollTimer)clearTimeout(pollTimer);
    const leaving=[...list.querySelectorAll('.library-score')].filter(card=>{const box=card.getBoundingClientRect();return box.width>0&&box.bottom>0&&box.top<innerHeight&&box.right>0&&box.left<innerWidth;}).slice(0,24);
    if(!local&&motionAllowed())await Promise.all(leaving.map((card,index)=>{card._deal?.cancel();card.style.opacity='';return card.animate([{opacity:1,translate:'0px 0px',rotate:'0deg',scale:'1'},{opacity:0,translate:`${-innerWidth-card.getBoundingClientRect().right}px -35px`,rotate:'18deg',scale:'.25'}],{duration:360,delay:Math.min(index*28,350),easing:'cubic-bezier(.55,.05,.9,.4)',fill:'forwards'}).finished.catch(()=>{});}));
    const controller=new AbortController(),requestTimeout=setTimeout(()=>controller.abort(),20000);
    try{
      window.reportStartupActivity?.({id:'catalog',label:'读取云曲库列表'});
      const response=local&&window.cloudLibrarySnapshot?null:await fetch('/api/scores',{signal:controller.signal});if(response&&!response.ok)throw Error();const data=response?await response.json():window.cloudLibrarySnapshot;invalidateChangedScores(data.scores);window.cloudLibrarySnapshot={scores:data.scores,saved:Date.now()};const existing=new Map([...list.querySelectorAll('.library-score')].map(c=>[c.dataset.scoreId,c]));
      if(!local){coverObserver.disconnect();decks.clear(false);pendingItems.replaceChildren();pendingToggle.setAttribute('aria-expanded','false');pendingGroup.classList.remove('is-expanded');list.replaceChildren();}
      list.querySelector('.library-stream-more')?.remove();
      const byTitle=new Map();for(const item of data.scores){const key=String(item.title||'').normalize('NFKC').toLowerCase().replace(/[\s《》「」_-]/g,'');if(!item.ready||!key||/未命名|正在识别/.test(key)){byTitle.set(item.id,item);continue;}const current=byTitle.get(key);if(!current||Number(item.ready)>Number(current.ready)||(item.ready===current.ready&&(item.saved||0)>(current.saved||0)))byTitle.set(key,item);}
      let visibleItems=[...byTitle.values()];if(lowMemory){visibleItems=visibleItems.filter(item=>!mobileQuery||String(item.title||'').toLowerCase().includes(mobileQuery)||mobileMatches?.has(item.id));}
      const pageItems=lowMemory?visibleItems.slice(0,mobileLimit):visibleItems;
      window.reportStartupActivity?.({id:'catalog',label:'准备云曲库封面卡片',detail:'本次显示 '+pageItems.length+' 首'});
      const fragment=document.createDocumentFragment();
      const wanted=new Set(pageItems.map(item=>item.id));
      if(local)for(const [id,card]of existing)if(!wanted.has(id)){coverObserver.unobserve(card);card.remove();}
      for(const [scoreIndex,item] of pageItems.entries()){
        if(local&&existing.has(item.id)){const card=existing.get(item.id);updateCard(card,item);continue;}
        if(scoreIndex&&scoreIndex%24===0)await new Promise(resolve=>setTimeout(resolve,0));
        const button=document.createElement('button');button.className='library-score';button.dataset.scoreId=item.id;button.dataset.status=item.status||'idle';button.dataset.ready=String(!!item.ready);
        button._item=item;
        const fallback=document.createElement('span');fallback.className='library-cover';fallback.style.backgroundImage='linear-gradient(145deg,#785751,#a67e74)';button.append(fallback);
        const title=document.createElement('strong');title.className='library-title';title.textContent=cleanText(item.title)||'正在识别原谱标题';
        const detail=document.createElement('small');detail.className='library-detail';detail.textContent=statusText(item);
        const staff=document.createElement('span');staff.className='recognition-staff';staff.innerHTML='<i></i><i></i><i></i><i></i><i></i>';staff.hidden=item.status!=='running';
        button.append(title,detail,staff);progressMarkup(button,item);
        button.onclick=async()=>{
          if(opening||closing||expanding||reloading||cardMotion)return;opening=true;button.disabled=true;button.setAttribute('aria-busy','true');
          let tourError=null;document.dispatchEvent(new CustomEvent('library-tour-loading',{detail:{id:item.id}}));
          document.body.dataset.currentScoreId=item.id;
          if(item.ready)void prefetchScore(item.id);
          try{
            shownProgress=0;targetProgress=0;progressTime=0;progressStarted=performance.now();barMotion?.cancel();barMotion=null;if(progressFrame)cancelAnimationFrame(progressFrame);progressFrame=0;updateLoader(4,cleanText(item.title)||'正在读取琴谱');
            const recordFlight=liftRecord(button),loaderEntry=revealLoader();document.querySelector('.record-flight')?.showPopover?.();if(item.ready)void prefetchScore(item.id);await Promise.race([Promise.all([recordFlight,loaderEntry]),new Promise(resolve=>setTimeout(resolve,1100))]);
            if(button.dataset.ready==='true'){
              const data=await obtainScore(item.id);updateLoader(34,'解析音符与声部');await openScore({...data,id:item.id,hasPdf:item.hasPdf},updateLoader);if(lowMemory)scoreCache.delete(item.id);
            }
            else if(item.hasPdf&&openPending){await openPending(item);}
            else if(item.hasPdf){const pdf=await fetch(`/api/scores/${item.id}/pdf`);if(!pdf.ok)throw Error('原谱读取失败');await openPdf(new File([await pdf.blob()],`${cleanText(item.title)||'云曲谱'}.pdf`,{type:'application/pdf'}));}
            else {document.dispatchEvent(new Event('show-task-center'));detail.textContent='正在后台转录';}
          }catch(e){tourError=e.message;detail.textContent=e.message;}finally{await dismissLoader();button.disabled=false;button.removeAttribute('aria-busy');opening=false;document.dispatchEvent(new CustomEvent('library-tour-selected',{detail:{id:item.id,ready:button.dataset.ready==='true',error:tourError}}));}
        };
        button.onpointerenter=()=>{if(item.ready&&!lowMemory)void prefetchScore(item.id);};fragment.append(button);coverObserver.observe(button);void hydrateCover(item,button);
      }
      window.reportStartupActivity?.({id:'catalog',label:'云曲库列表已准备',state:'complete',detail:pageItems.length+' 首'});
      list.append(fragment);regroupPending();if(lowMemory&&visibleItems.length>pageItems.length){const more=document.createElement('div');more.className='library-stream-more';more.setAttribute('role','status');more.textContent='正在载入更多曲谱…';list.append(more);requestAnimationFrame(()=>{if(more.isConnected)streamObserver.observe(more);});}if(!data.scores.length)list.textContent='暂无琴谱';
      else if(!local){const mode=browser.open?'full':'deck';stageCards(mode);await animateCards(mode);}
      pollTimer=setTimeout(pollRecognition,4000);
    }catch{window.reportStartupActivity?.({id:'catalog',label:'云曲库连接未完成',state:'failed',detail:controller.signal.aborted?'请求超过 20 秒':'服务器未返回可用列表'});list.textContent='琴谱库暂不可用，点击刷新重试。';}
    finally{if(local){if(browser.open)browser.scrollTop=previousScroll;else list.scrollLeft=previousScroll;}clearTimeout(requestTimeout);reloading=false;refresh.disabled=false;list.setAttribute('aria-busy','false');}
  }
  refresh.onclick=async()=>{refresh.animate([{transform:'rotate(0deg)'},{transform:'rotate(250deg)'},{transform:'rotate(360deg)'}],{duration:520,easing:'cubic-bezier(.22,.8,.25,1)'});await reload();};
  document.addEventListener('score-renamed',event=>{const {id,title}=event.detail||{},card=id&&list.querySelector(`[data-score-id="${id}"]`);if(card){card._item={...card._item,title,titleSource:'user'};updateCard(card,card._item);}});
  document.addEventListener('open-library-score',async event=>{if(reloading)for(let n=0;n<100&&reloading;n++)await new Promise(r=>setTimeout(r,100));let card=list.querySelector(`[data-score-id="${CSS.escape(event.detail.id)}"]`);if(!card&&lowMemory){mobileQuery='';mobileMatches=new Set([event.detail.id]);mobileQuery='\u0000';mobileLimit=STREAM_BATCH;await reload();card=list.querySelector(`[data-score-id="${CSS.escape(event.detail.id)}"]`);}if(card)card.click();});
  reload();return reload;
}

