export function cleanText(value) {
  return String(value || '').replace(/[\uFFFD\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\uFEFF]/g, '').replace(/[\uE000-\uF8FF]/g, '').trim();
}

export function initLibrary({openPdf, openScore, recognizeTitle, matchCover, openPending}) {
  const panel=document.createElement('section');panel.className='score-library setup-section';
  const heading=document.createElement('h3');heading.textContent='SUPERTANG CLOUD 云曲谱';
  const refresh=document.createElement('button');refresh.className='small-button';refresh.textContent='刷新列表';
  const list=document.createElement('div');list.className='library-list';
  panel.append(heading,list);
  const importSection=document.querySelector('.score-import');
  document.querySelector('.practice').prepend(panel);
  let pollTimer=null,titleQueue=Promise.resolve(),opening=false;const titlesInFlight=new Set();
  const loader=document.createElement('div');loader.className='score-loading-overlay';loader.hidden=true;loader.innerHTML='<div class=score-loading-dialog role=status aria-live=polite><div class=score-loading-seal role=img aria-label="苏州大学"></div><strong>正在打开琴谱</strong><span>准备连接 SUPERTANG CLOUD</span><div class=score-loading-progress><i></i></div><small>0%</small></div>';document.body.append(loader);
  let shownProgress=0,targetProgress=0,progressFrame=0,progressTime=0;
  const animateProgress=now=>{const delta=targetProgress-shownProgress,elapsed=Math.min(48,now-(progressTime||now));progressTime=now;shownProgress=Math.abs(delta)<.08?targetProgress:shownProgress+Math.sign(delta)*Math.min(Math.abs(delta),elapsed*.105);const progress=Math.round(shownProgress);loader.querySelector('.score-loading-progress i').style.width=`${progress}%`;loader.querySelector('small').textContent=`${progress}%`;if(shownProgress!==targetProgress)progressFrame=requestAnimationFrame(animateProgress);else progressFrame=0;};
  const updateLoader=(value,label)=>{targetProgress=Math.max(0,Math.min(100,Number(value)||0));if(!progressFrame)progressFrame=requestAnimationFrame(animateProgress);if(label)loader.querySelector('span').textContent=label;};
  const scoreCache=new Map();
  const motionAllowed=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
  async function liftRecord(card){
    if(!motionAllowed())return;
    const rect=card.getBoundingClientRect(),shell=document.createElement('div');shell.className='record-flight';
    Object.assign(shell.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});
    const sleeve=card.cloneNode(true);sleeve.removeAttribute('id');sleeve.removeAttribute('data-score-id');sleeve.disabled=false;sleeve.tabIndex=-1;sleeve.className='record-sleeve';sleeve.style.cssText='';
    const disc=document.createElement('div');disc.className='record-disc';shell.append(disc,sleeve);shell.setAttribute('aria-hidden','true');(browser.open?browser:document.body).append(shell);
    card.style.visibility='hidden';
    const discMotion=disc.animate([{transform:'translateY(0) rotate(0deg)'},{transform:'translateY(-28%) rotate(36deg)'}],{duration:460,fill:'forwards',easing:'cubic-bezier(.2,.7,.2,1)'});
    const flight=shell.animate([
      {transform:'perspective(900px) translate3d(0,0,0) rotateX(0deg)',opacity:1},
      {transform:'perspective(900px) translate3d(0,-28px,100px) rotateX(-23deg)',opacity:1,offset:.55},
      {transform:'perspective(900px) translate3d(0,-40px,190px) rotateX(-34deg)',opacity:0}
    ],{duration:640,easing:'cubic-bezier(.22,.65,.25,1)',fill:'both'});
    try{await flight.finished;}catch{}finally{flight.cancel();discMotion.cancel();shell.remove();card.style.visibility='';}
  }
  async function revealLoader(){
    if(browser.open){browser.close();panel.insertBefore(list,panel.querySelector('.library-settings'));document.body.classList.remove('library-expanded');for(const card of list.children)card.hidden=false;list.scrollLeft=deckScroll;}
    loader.hidden=false;
    if(!motionAllowed())return;
    const surface=loader.querySelector('.score-loading-dialog');
    await Promise.all([
      loader.animate([{opacity:0},{opacity:1}],{duration:260,easing:'ease-out'}).finished,
      surface.animate([{opacity:0,transform:'perspective(1000px) translateY(24px) rotateX(9deg) scale(.94)'},{opacity:1,transform:'perspective(1000px) translateY(0) rotateX(0deg) scale(1)'}],{duration:420,easing:'cubic-bezier(.16,1,.3,1)'}).finished
    ]).catch(()=>{});
  }
  async function dismissLoader(){
    if(!loader.hidden&&motionAllowed())await loader.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-10px)'}],{duration:300,easing:'cubic-bezier(.4,0,.8,1)'}).finished.catch(()=>{});
    loader.hidden=true;if(progressFrame)cancelAnimationFrame(progressFrame);progressFrame=0;
  }
  const prefetchScore=id=>{if(!scoreCache.has(id))scoreCache.set(id,fetch(`/api/scores/${id}`).then(response=>{if(!response.ok)throw Error('琴谱读取失败');return response.json();}).catch(()=>{scoreCache.delete(id);return null;}));return scoreCache.get(id);};
  const stageCards=mode=>{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    for(const [index,card] of [...list.querySelectorAll('.library-score')].entries()){
      card._deal?.cancel();
      card.style.opacity='0';
    }
  };
  const animateCards=mode=>{
    const origins=new Map([...list.querySelectorAll('.library-score')].map(card=>{const box=card.getBoundingClientRect();return [card.dataset.scoreId,{left:-box.width-120,top:box.top-70,width:box.width,height:box.height}];}));
    transfer=flyCards(origins,true);
  };
  const navigation=document.createElement('div');navigation.className='library-navigation';for(const [label,direction] of [['上一组',-1],['下一组',1]]){const arrow=document.createElement('button');arrow.className='small-button';arrow.textContent=direction<0?'‹':'›';arrow.setAttribute('aria-label',label);let held=false,frame=0,start=0,last=0,moved=false;
    const release=()=>{held=false;cancelAnimationFrame(frame);list.style.scrollSnapType='';list.style.scrollBehavior='';};
    arrow.onpointerdown=e=>{if(e.button!==0)return;held=true;moved=false;start=last=performance.now();arrow.setPointerCapture(e.pointerId);list.style.scrollSnapType='none';list.style.scrollBehavior='auto';
      const pull=now=>{if(!held)return;const elapsed=now-start,dt=Math.min(32,now-last);last=now;if(elapsed>180){moved=true;list.scrollLeft+=direction*Math.min(2.8,.3+(elapsed-180)/650)*dt;}frame=requestAnimationFrame(pull);};frame=requestAnimationFrame(pull);};
    arrow.onpointerup=release;arrow.onpointercancel=release;arrow.onlostpointercapture=release;window.addEventListener('blur',release);
    arrow.onclick=()=>{if(!moved)list.scrollBy({left:direction*list.clientWidth*.72,behavior:'smooth'});};navigation.append(arrow);}heading.after(navigation);refresh.textContent='↻';refresh.setAttribute('aria-label','刷新云曲库');refresh.title='刷新云曲库';navigation.append(refresh);
  const settings=document.createElement('details');settings.className='library-settings';settings.innerHTML='<summary>云曲库设置</summary><div><button class="small-button" type="button" data-ocr>重新 OCR 标题</button><button class="small-button" type="button" data-cover>重新匹配未识别封面</button><button class="small-button" type="button" data-deep>精细重新识谱</button></div>';panel.append(settings);
  const refreshMetadata=async(mode)=>{const button=document.querySelector(mode==='ocr'?'[data-ocr]':mode==='cover'?'[data-cover]':'[data-deep]');const currentId=document.body.dataset.currentScoreId;const items=mode==='deep'?[...list.children].map(card=>card._item).find(item=>item&&item.id===currentId&&item.hasPdf):[...list.children].map(card=>card._item).filter(item=>item&&(mode==='ocr'?item.hasPdf:!item.cover));if(!items||(Array.isArray(items)&&!items.length)){if(mode==='deep'){button.textContent='请先打开一份 PDF';setTimeout(()=>button.textContent='精细重新识谱',1600);}return;}const queue=Array.isArray(items)?items:[items];button.disabled=true;const original=button.textContent;button.textContent='已加入后台处理';try{await Promise.all(queue.map(item=>fetch(`/api/scores/${item.id}/refresh-metadata`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})}).then(response=>{if(!response.ok)throw Error();})));setTimeout(reload,400);}catch{button.textContent='服务暂不可用';}finally{setTimeout(()=>{button.disabled=false;button.textContent=original;},1600);}};
  settings.querySelector('[data-ocr]').onclick=()=>refreshMetadata('ocr');settings.querySelector('[data-cover]').onclick=()=>refreshMetadata('cover');settings.querySelector('[data-deep]').onclick=()=>refreshMetadata('deep');
  const browser=document.createElement('dialog');browser.className='library-browser';browser.innerHTML='<header><h2>云曲库</h2><input type="search" aria-label="搜索曲谱" placeholder="搜索曲谱"><button class="library-close" type="button" aria-label="关闭云曲库" title="关闭">×</button></header>';document.body.append(browser);
  const expand=document.createElement('button');expand.className='small-button library-expand';expand.type='button';expand.textContent='⤢';expand.setAttribute('aria-label','展开云曲库');navigation.insertBefore(expand,navigation.children[1]);
  let closing=false,motion=null,expanding=false,dockRect=null;
  let deckScroll=0,transfer=Promise.resolve();
  const intersects=(box,clip)=>box.right>clip.left&&box.left<clip.right&&box.bottom>clip.top&&box.top<clip.bottom;
  const cardRects=()=>{const clip=browser.open?{left:0,top:0,right:innerWidth,bottom:innerHeight}:list.getBoundingClientRect();return new Map([...list.querySelectorAll('.library-score')].filter(card=>!card.hidden).map(card=>{const box=card.getBoundingClientRect();return [card.dataset.scoreId,{left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height,visible:intersects(box,clip)}];}));};
  const flyCards=async (origins,fall=false)=>{
    const cleanup=[];
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cards=[...list.querySelectorAll('.library-score')];
    const layer=document.createElement('div');layer.className='card-flight-layer';layer.setAttribute('popover','manual');layer.setAttribute('aria-hidden','true');document.body.append(layer);if(layer.showPopover)layer.showPopover();
    list.classList.add('cards-transferring');
    try{await Promise.all(cards.map((card,index)=>{
      card._deal?.cancel();card._deal=null;card.style.opacity='';
      let from=origins.get(card.dataset.scoreId),to=card.getBoundingClientRect();
      const visible=box=>box&&box.right!==undefined?box.right>0&&box.left<innerWidth&&box.bottom>0&&box.top<innerHeight:!!box;
      const targetClip=browser.open?{left:0,top:0,right:innerWidth,bottom:innerHeight}:list.getBoundingClientRect();
      const sourceVisible=from?.visible??visible(from),targetVisible=visible(to)&&intersects(to,targetClip);
      const absorbing=!fall&&sourceVisible&&!targetVisible;
      if(!fall&&!sourceVisible&&!targetVisible)return;
      // Off-screen deck cards travel through the deck mouth rather than vanish.
      const mouth=panel.getBoundingClientRect();
      if(!fall&&!sourceVisible&&targetVisible)from={left:Math.min(innerWidth-80,mouth.right-90),top:mouth.top+100,width:80,height:100};
      if(!fall&&sourceVisible&&!targetVisible)to={left:Math.min(innerWidth-70,mouth.right-70),top:list.getBoundingClientRect().top+list.clientHeight/2,width:36,height:48};
      if(reduced||!from||!to.width||!from.width)return;
      // Animate in viewport space, outside the dialog's scaling and scroll clips.
      if(fall&&!targetVisible)return;
      const ghost=card.cloneNode(true);
      // Keep typography, cover crop and surface identical outside the dialog.
      [card,...card.querySelectorAll('*')].forEach((source,i)=>{
        const target=[ghost,...ghost.querySelectorAll('*')][i],style=getComputedStyle(source);
        for(const key of style)target.style.setProperty(key,style.getPropertyValue(key));
      });
      ghost.removeAttribute('data-score-id');ghost.removeAttribute('id');ghost.classList.add('card-flight-ghost');ghost.disabled=false;ghost.tabIndex=-1;
      ghost.style.cssText+=`;position:absolute!important;left:${to.left}px!important;top:${to.top}px!important;width:${to.width}px!important;height:${to.height}px!important;min-width:0!important;min-height:0!important;margin:0!important;transform:none!important;transform-origin:0 0!important;transition:none!important;opacity:1;visibility:visible!important;content-visibility:visible!important;`;
      layer.append(ghost);card.style.visibility='hidden';
      const inset=`inset(${Math.max(0,targetClip.top-to.top)}px ${Math.max(0,to.left+to.width-targetClip.right)}px ${Math.max(0,to.top+to.height-targetClip.bottom)}px ${Math.max(0,targetClip.left-to.left)}px)`;
      if(fall){const clip=list.getBoundingClientRect();layer.style.clipPath=`inset(${Math.max(0,clip.top)}px ${Math.max(0,innerWidth-clip.right)}px ${Math.max(0,innerHeight-clip.bottom)}px ${Math.max(0,clip.left)}px)`;}

      const dx=from.left-to.left,dy=from.top-to.top,sx=from.width/to.width,sy=from.height/to.height;
      const flight=ghost.animate(fall?[
        {translate:`${dx}px ${dy}px 0px`,rotate:'z -18deg',scale:'1.08 .88'},
        {translate:'-36px -14px 30px',rotate:'z 5deg',scale:'1.03 .97',offset:.76},
        {translate:'0px 0px 0px',rotate:'z 0deg',scale:'1',clipPath:inset}
      ]:[
        {translate:`${dx}px ${dy}px 0px`,scale:`${sx} ${sy}`,rotate:'z 0deg',opacity:1,clipPath:'inset(0px)'},
        {translate:`${dx*.64+(closing?65:-65)}px ${dy*.64-85}px 65px`,scale:`${sx*.64+.36} ${sy*.64+.36}`,rotate:`z ${closing?14:-14}deg`,offset:.4},
        {translate:`${dx*.16}px ${dy*.16-16}px 15px`,scale:`${sx*.16+.84} ${sy*.16+.84}`,rotate:`z ${closing?-5:5}deg`,offset:.76},
        {translate:'0px 0px 0px',scale:absorbing?'0.001 0.001':'1 1',rotate:'z 0deg',opacity:absorbing?0:1,clipPath:absorbing?'inset(0px)':inset}
      ],{duration:fall?540:760,delay:Math.min(index*(fall?38:24),fall?300:180),easing:fall?'cubic-bezier(.16,.65,.22,1)':'cubic-bezier(.35,0,.2,1)',fill:'both'});
      card._deal=flight;
      const finish=()=>{if(card._deal===flight){card.style.visibility='';flight.cancel();card._deal=null;}ghost.remove();};cleanup.push(finish);
      return flight.finished.catch(()=>{}).finally(finish);
    }));

    }finally{cleanup.forEach(finish=>finish());layer.remove();list.classList.remove('cards-transferring');}
  };
  let tiltFrame=0;
  list.addEventListener('pointermove',event=>{
    if(!browser.open||event.pointerType==='touch'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
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
    motion=browser.animate(open?[dock,full]:[full,dock],{duration:900,easing:'cubic-bezier(.32,0,.18,1)',fill:'both'});
    await motion.finished.catch(()=>{});
  };
  async function closeBrowser(){
    if(!browser.open||closing)return;closing=true;expand.disabled=true;await transfer;
    const origins=cardRects();
    const surface=document.createElement('div');surface.className='library-closing-surface';
    const box=browser.getBoundingClientRect();Object.assign(surface.style,{position:'fixed',inset:'0',background:getComputedStyle(browser).backgroundColor,zIndex:24000,pointerEvents:'none'});document.body.append(surface);
    const target=dockRect||panel.getBoundingClientRect();
    const collapse=motionAllowed()?surface.animate([{opacity:1,transform:'translate(0,0) scale(1)',borderRadius:'0px'},{opacity:0,transform:`translate(${target.left+target.width/2-box.width/2}px,${target.top+target.height/2-box.height/2}px) scale(${target.width/box.width},${target.height/box.height})`,borderRadius:'28px'}],{duration:480,easing:'cubic-bezier(.32,0,.18,1)',fill:'both'}):null;
    collapse?.finished.then(()=>surface.remove(),()=>surface.remove());
    browser.close();motion?.cancel();panel.insertBefore(list,panel.querySelector('.library-settings'));
    document.body.classList.remove('library-expanded');for(const card of list.children)card.hidden=false;list.scrollLeft=deckScroll;
    transfer=Promise.all([flyCards(origins),collapse?.finished.catch(()=>{})]);await transfer;surface.remove();
    closing=false;expand.disabled=false;expand.focus({preventScroll:true});
  }
  expand.onclick=async()=>{
    if(browser.open||closing||expanding||reloading)return;expanding=true;await transfer;dockRect=panel.getBoundingClientRect();deckScroll=list.scrollLeft;
    for(const card of list.children){card._deal?.cancel();card._deal=null;card.style.opacity='';}
    const origins=cardRects();
    browser.append(list);browser.querySelector('input').value='';document.body.classList.add('library-expanded');
    browser.showModal();browser.querySelector('button').focus({preventScroll:true});
    transfer=(async()=>{try{await Promise.all([flyCards(origins),animateBrowser(true)]);}finally{motion?.cancel();expanding=false;}})();await transfer;
  };
  browser.querySelector('button').onclick=closeBrowser;browser.addEventListener('cancel',event=>{event.preventDefault();closeBrowser();});browser.querySelector('input').oninput=event=>{const text=event.target.value.trim().toLowerCase();for(const card of list.children)card.hidden=!card.querySelector('.library-title')?.textContent.toLowerCase().includes(text);};

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
    if(card._item)Object.assign(card._item,item);
    card.dataset.status=item.status||'idle';card.dataset.ready=String(!!item.ready);
    const title=card.querySelector('.library-title');if(title)title.textContent=cleanText(item.title)||'正在识别原谱标题';
    const detail=card.querySelector('.library-detail');if(detail)detail.textContent=statusText(item);
    const staff=card.querySelector('.recognition-staff');if(staff){staff.classList.toggle('is-writing',item.status==='running');// A finished card keeps its title and status only; the indicator is for work in
// progress, the way an iOS list row behaves.
staff.hidden=item.status!=='running';}
    progressMarkup(card,item);
  }
  let coverQueue=Promise.resolve();
  function hydrateCover(item,card){
    coverQueue=coverQueue.then(()=>hydrateCoverNow(item,card)).catch(()=>{});
    return coverQueue;
  }
  async function hydrateCoverNow(item,card){
    if(item.cover){let image=card.querySelector('.library-cover');if(!image){image=document.createElement('span');image.className='library-cover';card.prepend(image);}image.style.backgroundImage=`url("${item.cover.replace(/"/g,'')}"),url("/api/scores/${item.id}/cover-fallback")`;return;}
    if(!matchCover||!item.title||item.title==='未命名曲谱')return;
    const title=cleanText(item.title);if(!title)return;
    try{const cover=await matchCover(title,item.id);if(!cover)return;let image=card.querySelector('.library-cover');if(!image){image=document.createElement('span');image.className='library-cover';card.prepend(image);}image.style.backgroundImage=`url("${cover.replace(/"/g,'')}"),url("/api/scores/${item.id}/cover-fallback")`;image.setAttribute('aria-label',`${title}封面`);}catch{}
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
      const response=await fetch('/api/scores');if(!response.ok)throw Error();const data=await response.json();let running=false;
      for(const item of data.scores){const card=list.querySelector(`[data-score-id="${item.id}"]`);updateCard(card,item);if(card&&card.dataset.coverTitle!==item.title){card.dataset.coverTitle=item.title;void hydrateCover(item,card);}if(item.status==='running')running=true;}
      pollTimer=setTimeout(pollRecognition,4000);
    }catch{pollTimer=null;}
  }
  let reloading=false;
  async function reload(){
    if(reloading)return;if(expanding||closing)await transfer;reloading=true;refresh.disabled=true;
    scoreCache.clear();if(pollTimer)clearTimeout(pollTimer);
    const leaving=[...list.querySelectorAll('.library-score')];
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)await Promise.all(leaving.map((card,index)=>{card._deal?.cancel();card.style.opacity='';return card.animate([{opacity:1,translate:'0px 0px',rotate:'0deg',scale:'1'},{opacity:0,translate:`${-innerWidth-card.getBoundingClientRect().right}px -35px`,rotate:'18deg',scale:'.25'}],{duration:360,delay:Math.min(index*28,350),easing:'cubic-bezier(.55,.05,.9,.4)',fill:'forwards'}).finished.catch(()=>{});}));
    try{
      const response=await fetch('/api/scores');if(!response.ok)throw Error();const data=await response.json();list.replaceChildren();
      for(const [scoreIndex,item] of data.scores.entries()){
        const button=document.createElement('button');button.className='library-score';button.dataset.scoreId=item.id;button.dataset.status=item.status||'idle';button.dataset.ready=String(!!item.ready);
        button._item=item;
        const fallback=document.createElement('span');fallback.className='library-cover';fallback.style.backgroundImage=`url('/api/scores/${item.id}/cover-fallback')`;button.append(fallback);
        const title=document.createElement('strong');title.className='library-title';title.textContent=cleanText(item.title)||'正在识别原谱标题';
        const detail=document.createElement('small');detail.className='library-detail';detail.textContent=statusText(item);
        const staff=document.createElement('span');staff.className='recognition-staff';staff.innerHTML='<i></i><i></i><i></i><i></i><i></i>';staff.hidden=item.status!=='running';
        button.append(title,detail,staff);progressMarkup(button,item);
        button.onclick=async()=>{
          if(opening||closing||expanding)return;opening=true;button.disabled=true;button.setAttribute('aria-busy','true');
          document.body.dataset.currentScoreId=item.id;
          if(item.ready)void prefetchScore(item.id);
          try{
            await liftRecord(button);
            shownProgress=0;targetProgress=0;progressTime=0;if(progressFrame)cancelAnimationFrame(progressFrame);progressFrame=0;updateLoader(4,cleanText(item.title)||'正在读取琴谱');await revealLoader();
            if(button.dataset.ready==='true'){
              if(scoreCache.has(item.id)){updateLoader(28,'读取本地预载缓存');const data=await scoreCache.get(item.id)||await prefetchScore(item.id);if(!data)throw Error('琴谱读取失败，请重试');updateLoader(34,'解析音符与声部');await openScore({...data,id:item.id,hasPdf:item.hasPdf},updateLoader);}
              else{const r=await fetch(`/api/scores/${item.id}`);if(!r.ok)throw Error('琴谱读取失败');let data;if(r.body?.getReader){const reader=r.body.getReader(),chunks=[];let received=0;const total=Number(r.headers.get('Content-Length'))||0;while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.length;updateLoader(total?8+received/total*24:18,'正在下载电子谱');}const bytes=new Uint8Array(received);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}data=JSON.parse(new TextDecoder().decode(bytes));}else data=await r.json();scoreCache.set(item.id,Promise.resolve(data));updateLoader(34,'解析音符与声部');await openScore({...data,id:item.id,hasPdf:item.hasPdf},updateLoader);}
            }
            else if(item.hasPdf&&openPending){await openPending(item);}
            else if(item.hasPdf){const pdf=await fetch(`/api/scores/${item.id}/pdf`);if(!pdf.ok)throw Error('原谱读取失败');await openPdf(new File([await pdf.blob()],`${cleanText(item.title)||'云曲谱'}.pdf`,{type:'application/pdf'}));}
            else {document.dispatchEvent(new Event('show-task-center'));detail.textContent='正在后台转录';}
          }catch(e){detail.textContent=e.message;}finally{await dismissLoader();button.disabled=false;button.removeAttribute('aria-busy');opening=false;}
        };
        button.onpointerenter=()=>{if(item.ready)void prefetchScore(item.id);};list.append(button);void hydrateCover(item,button);
      }
      if(!data.scores.length)list.textContent='暂无琴谱';
      else {const mode=browser.open?'full':'deck';stageCards(mode);requestAnimationFrame(()=>animateCards(mode));}
      pollTimer=setTimeout(pollRecognition,4000);
    }catch{list.textContent='琴谱库暂不可用，点击刷新重试。';}
    finally{reloading=false;refresh.disabled=false;}
  }
  refresh.onclick=async()=>{refresh.animate([{transform:'rotate(0deg)'},{transform:'rotate(250deg)'},{transform:'rotate(360deg)'}],{duration:520,easing:'cubic-bezier(.22,.8,.25,1)'});await reload();};
  document.addEventListener('score-renamed',event=>{const {id,title}=event.detail||{},card=id&&list.querySelector(`[data-score-id="${id}"]`);if(card){card._item={...card._item,title,titleSource:'user'};updateCard(card,card._item);}});
  reload();return reload;
}
