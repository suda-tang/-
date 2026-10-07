import {updateRangeFill} from './range-fill.js';
window.reportStartupActivity?.({id:'workspace',label:'整理曲库、演奏、改编和任务面板'});
// Navigation owns grouping; the existing controls keep their ids and handlers.
// The 3D classroom is not a startup dependency of the music workspace.
const $=selector=>document.querySelector(selector);
const glass=document.querySelector('link[href="/glass.css"]');
document.body.classList.add('studio');
const aside=$('.setup'),nav=document.createElement('nav');nav.className='workspace-nav';nav.setAttribute('aria-label','工作区');
const pages={};
for(const [id,label] of [['library','曲库'],['play','演奏'],['arrange','改编'],['tasks','任务']]){
 const page=document.createElement('div');page.className='workspace-panel';page.id='workspace-'+id;page.hidden=id!=='library';aside.append(page);pages[id]=page;
 const button=document.createElement('button');button.textContent=label;button.dataset.panel=id;button.setAttribute('aria-controls',page.id);button.setAttribute('aria-pressed',String(id==='library'));button.onclick=()=>select(id);nav.append(button);
}
$('.top').after(nav);
const lens=document.createElement('span');lens.className='nav-lens';lens.setAttribute('aria-hidden','true');nav.prepend(lens);
const stage=document.createElement('div');stage.className='workspace-stage';aside.append(stage);Object.values(pages).forEach(page=>stage.append(page));
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const ids=Object.keys(pages);let currentPanel='library',position=0,frame=0,moving=false,heights=[],drag=null,suppressClick=false,stageWidth=0,navGeometry=[],activeStart=0,activeEnd=0,heightFrom=0,heightTo=0,heightPathStart=0,heightPathEnd=0;
function measureNav(){navGeometry=[...nav.querySelectorAll('button')].map(button=>({left:button.offsetLeft,width:button.offsetWidth}));}
function positionLens(){
 if(navGeometry.length!==ids.length)measureNav();const a=Math.floor(position),b=Math.min(ids.length-1,a+1),fraction=position-a;
 const left=navGeometry[a].left+(navGeometry[b].left-navGeometry[a].left)*fraction-5;
 lens.style.width=(navGeometry[a].width+(navGeometry[b].width-navGeometry[a].width)*fraction)+'px';
 lens.style.transform=`translateX(${left}px)`;
}
function prepare(target=position){
 if(moving&&target>=activeStart&&target<=activeEnd)return;const initialHeight=stage.getBoundingClientRect().height;sizeMotion?.cancel();moving=true;stage.style.height=initialHeight+'px';stage.classList.add('is-moving');stageWidth=stage.clientWidth;measureNav();heightFrom=initialHeight;heightPathStart=position;heightPathEnd=target;
 activeStart=Math.max(0,Math.floor(Math.min(position,target)));activeEnd=Math.min(ids.length-1,Math.ceil(Math.max(position,target)));
 ids.forEach((id,index)=>{const page=pages[id],active=index>=activeStart&&index<=activeEnd;page.hidden=!active;page.inert=true;if(active)page.style.transform=`translate3d(${(index-position)*stageWidth}px,0,0)`;});
 heights=ids.map((id,index)=>index>=activeStart&&index<=activeEnd?pages[id].getBoundingClientRect().height:0);
 heightTo=pages[ids[Math.round(target)]]?.getBoundingClientRect().height||initialHeight;
}
function paint(value){
 position=Math.max(0,Math.min(ids.length-1,value));positionLens();
 if(!moving)return;
 const distance=heightPathEnd-heightPathStart,progress=Math.max(0,Math.min(1,distance?(position-heightPathStart)/distance:1));
 stage.style.height=(heightFrom+(heightTo-heightFrom)*progress)+'px';
 for(let index=activeStart;index<=activeEnd;index++)pages[ids[index]].style.transform=`translate3d(${(index-position)*stageWidth}px,0,0)`;
}
let sizeMotion=null;
function settle(){
 const previousHeight=stage.getBoundingClientRect().height;sizeMotion?.cancel();
 moving=false;stage.classList.remove('is-moving');stage.style.height='';
 ids.forEach(id=>{const page=pages[id];page.hidden=id!==currentPanel;page.inert=id!==currentPanel;page.style.transform='';});
 const finalHeight=stage.getBoundingClientRect().height;
 if(!reduceMotion.matches&&!document.documentElement.classList.contains('booting')&&Math.abs(finalHeight-previousHeight)>1){stage.classList.add('is-sizing');sizeMotion=stage.animate([{height:previousHeight+'px'},{height:finalHeight+'px'}],{duration:300,easing:'cubic-bezier(.22,.65,.3,1)'});const motion=sizeMotion;void motion.finished.catch(()=>{}).then(()=>{if(sizeMotion===motion)stage.classList.remove('is-sizing');});}
 positionLens();
}
function select(id){
 cancelAnimationFrame(frame);frame=0;currentPanel=id;
 for(const button of nav.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.panel===id));
 document.body.dataset.workspace=id;
 const target=ids.indexOf(id),from=position;
 if(document.documentElement.classList.contains('booting')||reduceMotion.matches||Math.abs(target-from)<.001){position=target;settle();return;}
 prepare(target);paint(from);
 let previous=performance.now(),elapsed=0;const duration=460+Math.min(120,Math.abs(target-from)*50);
 function step(now){elapsed+=Math.min(32,now-previous);previous=now;const t=Math.min(1,elapsed/duration),eased=t*t*(3-2*t);paint(from+(target-from)*eased);if(t<1)frame=requestAnimationFrame(step);else{frame=0;settle();}}
 frame=requestAnimationFrame(step);
}
let navResizeFrame=0;new ResizeObserver(()=>{cancelAnimationFrame(navResizeFrame);navResizeFrame=requestAnimationFrame(()=>{navGeometry=[];if(!moving)positionLens();});}).observe(nav);
if(glass)glass.onload=()=>{positionLens();};
reduceMotion.addEventListener('change',()=>select(currentPanel));
nav.addEventListener('pointerdown',event=>{
 if(event.button!==0)return;
 drag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,origin:position,selected:currentPanel};
});
nav.addEventListener('pointermove',event=>{
 if(!drag||event.pointerId!==drag.id)return;
 const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
 if(!drag.moved&&Math.abs(dy)>Math.abs(dx)+8){drag=null;select(currentPanel);return;}
 if(Math.abs(dx)>6||drag.moved){
  if(!drag.moved){cancelAnimationFrame(frame);frame=0;drag.origin=position;drag.moved=true;nav.setPointerCapture(event.pointerId);}
  nav.classList.add('is-dragging');
  const buttons=[...nav.querySelectorAll('button')],step=buttons[1].offsetLeft-buttons[0].offsetLeft;
  if(!reduceMotion.matches)prepare(drag.origin+dx/step);
  paint(drag.origin+dx/step);
 }
});
function finishDrag(event,cancel=false){
 if(!drag||drag.id!==event.pointerId)return;const state=drag;drag=null;nav.classList.remove('is-dragging');
 if(state.moved){suppressClick=true;setTimeout(()=>suppressClick=false,0);select(cancel?state.selected:ids[Math.round(position)]);}
 else if(moving)select(currentPanel);else positionLens();
}
document.addEventListener('pointerup',event=>finishDrag(event));
document.addEventListener('pointercancel',event=>finishDrag(event,true));
window.addEventListener('blur',()=>{if(drag){drag=null;nav.classList.remove('is-dragging');select(currentPanel);}});
nav.addEventListener('lostpointercapture',event=>{if(event.target===nav&&drag)finishDrag(event,true);});
nav.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}},true);
nav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...nav.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();select(buttons[next].dataset.panel);});
document.addEventListener('pointerdown',event=>{const button=event.target.closest('button,summary');if(!button||button.disabled||button.closest('.workspace-nav,.library-navigation,.library-list'))return;const rect=button.getBoundingClientRect();button.style.setProperty('--touch-x',`${event.clientX-rect.left}px`);button.style.setProperty('--touch-y',`${event.clientY-rect.top}px`);if(!reduceMotion.matches)button.animate([{scale:1},{scale:.96},{scale:1}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});},{passive:true});
const fillRange=updateRangeFill;
document.querySelectorAll('input[type=range]').forEach(fillRange);
document.addEventListener('input',event=>{if(event.target.matches('input[type=range]'))fillRange(event.target);});
pages.library.append($('.score-library'),$('.score-import'),$('.service-controls'));
$('.score-library h3').textContent='云曲库';
if($('#notice').textContent==='待载入琴谱')$('#notice').textContent='';
pages.play.append($('.practice-controls'));
pages.arrange.append($('#arrangement-workspace'));
function moveTasks(){const tasks=$('.task-center');if(tasks&&tasks.parentElement!==pages.tasks){pages.tasks.append(tasks);tasks.open=true;}}
moveTasks();setTimeout(moveTasks,100);
$('.setup-head').hidden=true;
const settings=document.createElement('details');settings.className='practice-settings';settings.innerHTML='<summary>跟弹练习</summary>';
settings.append($('.control-grid'),$('.practice-actions'));pages.play.append(settings);
const sampleButton=$('#sample-button'),altRecognize=$('#alt-recognize'),librarySettings=$('.score-library .library-settings'),bottomSettings=$('.service-controls .technical');
if(bottomSettings){const actions=document.createElement('div');actions.className='library-settings-actions';
 if(sampleButton){sampleButton.className='small-button';actions.append(sampleButton);}
 // 云曲库工具（重新 OCR / 重新匹配封面）先排，把两颗“重新识谱”留到最后成对出现。
 let deep=null;
 if(librarySettings){const buttons=[...librarySettings.querySelectorAll('button')];deep=buttons.find(button=>button.hasAttribute('data-deep'))||null;for(const button of buttons)if(button!==deep)actions.append(button);librarySettings.remove();}
 if(altRecognize){altRecognize.textContent='替代模型重新识谱';const tools=altRecognize.parentElement;altRecognize.className='small-button';actions.append(altRecognize);if(tools&&tools.classList.contains('recognition-tools')&&!tools.children.length)tools.remove();}
 if(deep)actions.append(deep);
 bottomSettings.append(actions);}
const tempo=$('#tempo').closest('label');$('.playback-buttons').after(tempo);
const sound=$('#instrument-select').closest('label');sound.classList.add('instrument-field');
const more=document.createElement('details');more.className='play-options';more.innerHTML='<summary>声音与播放设置</summary>';
more.append($('.sound-options'),$('.autoplay-label:not(.score-follow-label)'),$('.score-follow-label'),$('#render-expression'),$('#expression-state'));const vocalTiming=document.createElement('div');vocalTiming.id='vocal-timing-settings';more.append(vocalTiming);$('.playback-panel').append(more);
$('.feedback').hidden=false;
// Deck perspective follows the visible card, rather than pointer-only tilt.
const list=$('.library-list');let deckFrame=0;
function deck(){deckFrame=0;const center=list.scrollLeft+list.clientWidth/2;
 if(document.body.classList.contains('library-expanded'))return;
 const width=list.clientWidth;
 const positions=[...list.querySelectorAll('.library-score')].filter(card=>!card.hidden&&(!card.closest('.library-card-stack:not(.is-expanded)')||card.classList.contains('stack-peek'))).map(card=>({card,left:card.offsetLeft,w:card.offsetWidth})).filter(p=>p.left+p.w>list.scrollLeft-width&&p.left<list.scrollLeft+width*2).map(p=>({...p,d:Math.max(-1,Math.min(1,(p.left+p.w/2-center)/Math.max(1,width)))}));
 for(const {card,d} of positions){const turn=(-d*28)+'deg',depth=(-Math.abs(d)*38)+'px';if(card.style.getPropertyValue('--deck-turn')!==turn)card.style.setProperty('--deck-turn',turn);if(card.style.getPropertyValue('--deck-depth')!==depth)card.style.setProperty('--deck-depth',depth);}

}
list.addEventListener('scroll',()=>{if(!deckFrame)deckFrame=requestAnimationFrame(deck);},{passive:true});
new MutationObserver(()=>{if(!deckFrame)deckFrame=requestAnimationFrame(deck);}).observe(list,{childList:true});new ResizeObserver(()=>{if(!deckFrame)deckFrame=requestAnimationFrame(deck);}).observe(list);
// Foreground leases expire after inactivity, even if the browser closes.
let lastInteraction=Date.now(),lastSent=0,playing=false;
const touch=()=>{lastInteraction=Date.now();send();};
function send(){if(Date.now()-lastSent<4000)return;if(!playing&&Date.now()-lastInteraction>7000)return;lastSent=Date.now();void fetch('/api/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:document.body.dataset.currentScoreTitle||$('#score-title')?.textContent||'',activity:playing?'自动演奏':'页面操作'}),keepalive:true}).catch(()=>{});}
for(const name of ['pointerdown','keydown','wheel','input'])document.addEventListener(name,touch,{passive:true});
document.addEventListener('transport-state',event=>{playing=event.detail.playing;send();});setInterval(send,4000);
new MutationObserver(()=>{if(document.body.dataset.workspace==='library'&&!$('#play-button').disabled)select('play');}).observe($('#score-title'),{childList:true});
document.addEventListener('show-task-center',()=>select('tasks'));
select('library');
// 导览是附加功能，出错也不能影响工作区初始化，所以单独兜住异常。
if(new URLSearchParams(location.search).get('tour')==='1')void import('./guided-tour.js?v=presenter-first3').then(({initTour})=>initTour()).catch(error=>{console.error('导览加载失败',error);document.documentElement.classList.remove('tour-arrival','tour-travelling');const notice=document.createElement('aside');notice.className='guided-tour';notice.setAttribute('role','alert');const text=document.createElement('p');text.textContent='导览未能启动：'+(error.message||'连接中断');const retry=document.createElement('button');retry.textContent='重新打开导览';retry.onclick=()=>location.reload();notice.append(text,retry);document.body.append(notice);});
window.reportStartupActivity?.({id:'workspace',label:'工作区布局与交互已就绪',state:'complete'});
document.documentElement.dataset.workspaceReady='true';window.dispatchEvent(new Event('workspace-ready'));
new MutationObserver(()=>{document.body.dataset.training=String(!$('#stop-button').hidden);}).observe($('#stop-button'),{attributes:true,attributeFilter:['hidden']});
