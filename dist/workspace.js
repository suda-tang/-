import {applyLibraryPerspective} from './library-perspective.js';
import {afterWorkspace} from './background-work.js';
import {updateRangeFill} from './range-fill.js';
import {mountPracticePanel} from './practice-panel.js';
window.reportStartupActivity?.({id:'workspace',label:'整理曲库、演奏、改编和任务面板'});
// Navigation owns grouping; the existing controls keep their ids and handlers.
// The 3D classroom is not a startup dependency of the music workspace.
const $=selector=>document.querySelector(selector);
const glass=document.querySelector('link[href="/glass.css"]');
document.body.classList.add('studio');
const aside=$('.setup'),nav=document.querySelector('.workspace-nav[data-home-navigation]')||document.querySelector('.workspace-nav')||document.createElement('nav');nav.className='workspace-nav';nav.setAttribute('aria-label','工作区');
for(const duplicate of document.querySelectorAll('.workspace-nav'))if(duplicate!==nav){for(const button of duplicate.querySelectorAll('[data-panel]')){if(!nav.querySelector(`[data-panel="${button.dataset.panel}"]`))nav.append(button);}duplicate.remove();}
const pages={};
for(const [id,label] of [['library','曲库'],['play','演奏'],['arrange','改编'],['tasks','任务']]){
 const page=document.getElementById('workspace-'+id)||document.createElement('div');page.className='workspace-panel';page.id='workspace-'+id;page.hidden=id!=='library';if(!page.isConnected)aside.append(page);pages[id]=page;
 for(const duplicate of [...nav.querySelectorAll(`[data-panel="${id}"]`)].slice(1))duplicate.remove();
 const button=nav.querySelector(`[data-panel="${id}"]`)||document.createElement('button');button.disabled=false;button.textContent=label;button.dataset.panel=id;button.setAttribute('aria-controls',page.id);button.setAttribute('aria-pressed',String(id==='library'));button.onclick=()=>select(id);nav.append(button);
}
if(!nav.closest('.ai-navigation-dock'))$('.top').after(nav);
const lens=nav.querySelector('.nav-lens')||document.createElement('span');lens.className='nav-lens';lens.setAttribute('aria-hidden','true');nav.prepend(lens);
const stage=aside.querySelector('.workspace-stage')||document.createElement('div');stage.className='workspace-stage';if(stage.parentElement!==aside)aside.append(stage);Object.values(pages).forEach(page=>{if(page.parentElement!==stage)stage.append(page);});
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const ids=Object.keys(pages);let currentPanel='library',position=0,frame=0,moving=false,heights=[],drag=null,suppressClick=false,stageWidth=0,navGeometry=[],activeStart=0,activeEnd=0,heightFrom=0,heightTo=0,heightPathStart=0,heightPathEnd=0;
function measureNav(){navGeometry=[...nav.querySelectorAll('button')].map(button=>({left:button.offsetLeft,width:button.offsetWidth}));}
function positionLens(){
 if(navGeometry.length!==ids.length)measureNav();const a=Math.floor(position),b=Math.min(ids.length-1,a+1),fraction=position-a;
 const left=navGeometry[a].left+(navGeometry[b].left-navGeometry[a].left)*fraction-5;
 lens.style.width=(navGeometry[a].width+(navGeometry[b].width-navGeometry[a].width)*fraction)+'px';
 lens.style.transform=`translateX(${left}px)`;
}
let shellFrom=0,shellTo=0,shellCaptured=null,shellLocked=false,shellFrame=0;
function finishShell(from){
 releaseShell();const to=aside.getBoundingClientRect().height;
 if(reduceMotion.matches||document.documentElement.classList.contains('booting')||Math.abs(to-from)<1)return;
 aside.style.setProperty('transition','none','important');aside.style.setProperty('max-height','none','important');aside.style.setProperty('height',from+'px','important');
 let last=performance.now(),elapsed=0;function step(now){elapsed+=Math.min(32,now-last);last=now;const t=Math.min(1,elapsed/320),ease=t*t*(3-2*t);aside.style.setProperty('height',(from+(to-from)*ease)+'px','important');if(t<1)shellFrame=requestAnimationFrame(step);else{shellFrame=0;releaseShell();}}shellFrame=requestAnimationFrame(step);
}
function releaseShell(){cancelAnimationFrame(shellFrame);shellFrame=0;aside.style.removeProperty('height');aside.style.removeProperty('max-height');aside.style.removeProperty('transition');shellLocked=false;}
function prepare(target=position){
 if(moving&&target>=activeStart&&target<=activeEnd&&drag)return;const initialHeight=stage.getBoundingClientRect().height;sizeMotion?.cancel();moving=true;stage.style.height=initialHeight+'px';stage.classList.add('is-moving');stageWidth=stage.clientWidth+(parseFloat(getComputedStyle(stage).getPropertyValue('--workspace-page-gap'))||24);measureNav();heightFrom=initialHeight;heightPathStart=position;heightPathEnd=target;
 activeStart=Math.max(0,Math.floor(Math.min(position,target)));activeEnd=Math.min(ids.length-1,Math.ceil(Math.max(position,target)));
 ids.forEach((id,index)=>{const page=pages[id],active=index>=activeStart&&index<=activeEnd;page.hidden=!active;page.inert=true;if(active)page.style.transform=`translate3d(${(index-position)*stageWidth}px,0,0)`;});
 heights=ids.map((id,index)=>index>=activeStart&&index<=activeEnd?pages[id].getBoundingClientRect().height:0);
 heightTo=pages[ids[Math.round(target)]]?.getBoundingClientRect().height||initialHeight;
 // Measure the destination in its real flow, including margins and height caps.
 const shellHeight=shellCaptured??aside.getBoundingClientRect().height;shellCaptured=null;
 releaseShell();aside.style.setProperty('transition','none','important');
 stage.classList.remove('is-moving');stage.style.height='';
 ids.forEach((id,index)=>{pages[id].hidden=index!==Math.round(target);});
 shellFrom=shellHeight;shellTo=aside.getBoundingClientRect().height;
 stage.classList.add('is-moving');stage.style.height=initialHeight+'px';
 ids.forEach((id,index)=>{pages[id].hidden=index<activeStart||index>activeEnd;});
 aside.style.setProperty('max-height','none','important');aside.style.setProperty('height',shellFrom+'px','important');shellLocked=true;
}
function paint(value){
 position=Math.max(0,Math.min(ids.length-1,value));positionLens();
 if(!moving)return;
 const distance=heightPathEnd-heightPathStart,progress=Math.max(0,Math.min(1,distance?(position-heightPathStart)/distance:1));
 stage.style.height=(heightFrom+(heightTo-heightFrom)*progress)+'px';
 if(shellLocked)aside.style.setProperty('height',(shellFrom+(shellTo-shellFrom)*progress)+'px','important');
 for(let index=activeStart;index<=activeEnd;index++)pages[ids[index]].style.transform=`translate3d(${(index-position)*stageWidth}px,0,0)`;
}
let sizeMotion=null;
function settle(){
 const previousShell=aside.getBoundingClientRect().height;sizeMotion?.cancel();
 moving=false;stage.classList.remove('is-moving');stage.style.height='';
 releaseShell();shellCaptured=null;
 ids.forEach(id=>{const page=pages[id];page.hidden=id!==currentPanel;page.inert=id!==currentPanel;page.style.transform='';});
 finishShell(previousShell);

 positionLens();
 document.dispatchEvent(new CustomEvent('workspace-panel-changed',{detail:{id:currentPanel}}));
}
function select(id){
 shellCaptured=aside.getBoundingClientRect().height;
 aside.style.setProperty('transition','none','important');
 cancelAnimationFrame(frame);frame=0;currentPanel=id;
 for(const button of nav.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.panel===id));
 document.body.dataset.workspace=id;
 const target=ids.indexOf(id),from=position;
 if(document.documentElement.classList.contains('booting')||reduceMotion.matches||Math.abs(target-from)<.001){position=target;settle();return;}
 prepare(target);paint(from);
 let last=performance.now(),elapsed=0;const duration=460+Math.min(120,Math.abs(target-from)*50);
 function step(now){elapsed+=Math.min(32,Math.max(0,now-last));last=now;const t=Math.min(1,elapsed/duration),eased=t*t*(3-2*t);paint(from+(target-from)*eased);if(t<1)frame=requestAnimationFrame(step);else{frame=0;settle();}}
 frame=requestAnimationFrame(step);
}
let navResizeFrame=0;new ResizeObserver(()=>{cancelAnimationFrame(navResizeFrame);navResizeFrame=requestAnimationFrame(()=>{navGeometry=[];if(!moving)positionLens();});}).observe(nav);
// Rotation changes panel width and its responsive gutter. Rebase from the
// current animation position; height-only notifications must not restart it.
let panelWidth=stage.getBoundingClientRect().width,panelResizeFrame=0;
const panelResizeObserver=new ResizeObserver(entries=>{
 const width=entries[0]?.contentRect.width;
 if(!Number.isFinite(width)||Math.abs(width-panelWidth)<.5)return;
 panelWidth=width;cancelAnimationFrame(panelResizeFrame);
 panelResizeFrame=requestAnimationFrame(()=>{
  panelResizeFrame=0;navGeometry=[];
  if(moving){const pointer=drag?.id;drag=null;nav.classList.remove('is-dragging');if(pointer!==undefined&&nav.hasPointerCapture(pointer))nav.releasePointerCapture(pointer);select(currentPanel);}
  else positionLens();
 });
});
panelResizeObserver.observe(stage);
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
document.addEventListener('pointerdown',event=>{const button=event.target.closest('button,summary');if(!button||button.disabled||button.closest('.workspace-nav,.library-navigation,.library-list'))return;const rect=button.getBoundingClientRect();button.style.setProperty('--touch-x',`${event.clientX-rect.left}px`);button.style.setProperty('--touch-y',`${event.clientY-rect.top}px`);if(button.tagName!=='SUMMARY'&&!reduceMotion.matches)button.animate([{scale:1},{scale:.96},{scale:1}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});},{passive:true});
const fillRange=updateRangeFill;
document.querySelectorAll('input[type=range]').forEach(fillRange);
document.addEventListener('input',event=>{if(event.target.matches('input[type=range]'))fillRange(event.target);});
for(const node of [$('.score-library'),$('.score-import'),$('.service-controls')])if(node&&node.parentElement!==pages.library)pages.library.append(node);
if(!$('.score-library h3 .library-title-wide'))$('.score-library h3').innerHTML='<span class=library-title-wide>SUPERTANG 云端曲库</span><span class=library-title-compact>云曲库</span>';
if($('#notice').textContent==='待载入琴谱')$('#notice').textContent='';
pages.play.append($('.practice-controls'));
pages.arrange.append($('#arrangement-workspace'));
function moveTasks(){const tasks=$('.task-center');if(tasks&&tasks.parentElement!==pages.tasks){pages.tasks.append(tasks);tasks.open=true;}}
moveTasks();setTimeout(moveTasks,100);
$('.setup-head').hidden=true;
const settings=document.createElement('details');settings.className='practice-settings';settings.innerHTML='<summary>跟弹练习</summary>';
settings.append($('.control-grid'),$('.practice-actions'));pages.play.append(settings);
mountPracticePanel(settings);
const classroomStyle=document.createElement('link');classroomStyle.rel='stylesheet';classroomStyle.href='/score-classroom.css?v=header-origin2';document.head.append(classroomStyle);
const classroom=document.createElement('details');classroom.className='score-classroom';classroom.innerHTML='<summary>曲谱课堂</summary><div class="classroom-mount"></div>';settings.after(classroom);
for(const section of [settings,classroom]){const summary=section.querySelector(':scope>summary'),label=summary.textContent;summary.classList.add('workspace-disclosure-heading');const title=document.createElement('span');title.textContent=label;const icon=document.createElement('span');icon.className='workspace-disclosure-icon';icon.setAttribute('aria-hidden','true');icon.textContent=section.open?'−':'＋';summary.replaceChildren(title,icon);section.addEventListener('toggle',()=>{icon.textContent=section.open?'−':'＋'})}
let classroomPromise=null,classroomModule=null,classroomApi=null;
function prepareClassroom(){
 if(!classroomModule)classroomModule=import('./classroom-preloads.js').then(({classroomModules})=>{for(const href of classroomModules){const link=document.createElement('link');link.rel='modulepreload';link.href=href;document.head.append(link);}return import('./score-classroom.js?v=header-origin2');}).then(module=>{performance.mark('classroom-module-ready');return module;}).catch(error=>{classroomModule=null;throw error;});
 return classroomModule;
}
// Warm the module only after the workspace can be used. Mounting and requests remain on demand.
if(new URLSearchParams(location.search).get('tour')!=='1')afterWorkspace(()=>prepareClassroom(),{delay:1800});
else window.addEventListener('mentor-resources-released',()=>afterWorkspace(()=>prepareClassroom(),{delay:800}),{once:true});
classroom.querySelector('summary').addEventListener('pointerenter',()=>{void prepareClassroom().catch(()=>{});},{once:true});
function loadClassroom(){
 if(!classroomPromise){
  const mount=classroom.querySelector('.classroom-mount');
  const pending=document.createElement('div');pending.className='classroom-opening';pending.setAttribute('role','status');pending.textContent='正在打开课堂…';mount.replaceChildren(pending);mount.setAttribute('aria-busy','true');
  // Let the native disclosure and its placeholder paint before module initialization.
  classroomPromise=new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))).then(()=>prepareClassroom()).then(({mountClassroom})=>(classroomApi=mountClassroom(mount))).catch(error=>{classroomPromise=null;mount.replaceChildren();const message=document.createElement('p');message.textContent='课堂未能载入：'+error.message;const retry=document.createElement('button');retry.type='button';retry.textContent='重试';retry.onclick=()=>loadClassroom().catch(()=>{});mount.append(message,retry);throw error;}).finally(()=>mount.removeAttribute('aria-busy'));
 }
 return classroomPromise;
}
classroom.addEventListener('toggle',()=>{if(classroom.open)loadClassroom().catch(()=>{});});
document.addEventListener('ai-classroom-context',event=>event.detail.resolve(classroomApi?.state()||{status:'not-loaded',open:false}));
document.addEventListener('ai-classroom-command',async event=>{try{const value=event.detail.value||{};if(!['status','close'].includes(value.operation)){document.querySelector('.workspace-nav [data-panel="play"]')?.click();classroom.open=true;}const api=await loadClassroom();await api.ready;const result=await api.command(value);event.detail.resolve(result);}catch(error){event.detail.reject(error);}});
document.addEventListener('ai-create-classroom',async event=>{document.querySelector('.workspace-nav [data-panel="play"]')?.click();classroom.open=true;try{const api=await loadClassroom();await api.ready;const result=await api.create(event.detail.settings||{});event.detail.resolve(result);classroom.scrollIntoView({behavior:'smooth',block:'nearest'});}catch(error){event.detail.reject(error);}});
document.addEventListener('classroom-open',async event=>{document.querySelector('.workspace-nav [data-panel="play"]')?.click();classroom.open=true;try{await(await loadClassroom()).open(event.detail.id,true);classroom.scrollIntoView({behavior:'smooth',block:'center'});}catch(error){classroom.querySelector('.classroom-mount').textContent=error.message;}});
const sampleButton=$('#sample-button'),altRecognize=$('#alt-recognize'),librarySettings=$('.score-library .library-settings'),bottomSettings=$('.service-controls .technical');
if(bottomSettings){const actions=document.createElement('div');actions.className='library-settings-actions';
 if(sampleButton){sampleButton.className='small-button';actions.append(sampleButton);}
 // 云曲库工具（重新 OCR / 重新匹配封面）先排，把两颗“重新识谱”留到最后成对出现。
 let deep=null;
 if(librarySettings){const buttons=[...librarySettings.querySelectorAll('button')];deep=buttons.find(button=>button.hasAttribute('data-deep'))||null;for(const button of buttons)if(button!==deep)actions.append(button);for(const label of librarySettings.querySelectorAll('label'))actions.append(label);librarySettings.remove();}
 if(altRecognize){altRecognize.textContent='替代模型重新识谱';const tools=altRecognize.parentElement;altRecognize.className='small-button';actions.append(altRecognize);if(tools&&tools.classList.contains('recognition-tools')&&!tools.children.length)tools.remove();}
 if(deep)actions.append(deep);
 bottomSettings.append(actions);}
const tempo=$('#tempo').closest('label');$('.playback-buttons').after(tempo);
const sound=$('#instrument-select').closest('label');sound.classList.add('instrument-field');
const more=document.createElement('details');more.className='play-options';more.innerHTML='<summary>声音与播放设置</summary>';
const playbackSwitches=document.createElement('div');playbackSwitches.className='playback-switches';for(const id of ['score-follow-toggle','autoplay','real-keyboard-toggle','piano-hands-toggle']){const label=document.getElementById(id)?.closest('label');if(label)playbackSwitches.append(label);}more.append($('.sound-options'),playbackSwitches,$('#render-expression'),$('#expression-state'));const vocalTiming=document.createElement('div');vocalTiming.id='vocal-timing-settings';more.append(vocalTiming);$('.playback-panel').append(more);
$('.feedback').hidden=false;
// Deck perspective follows the visible card, rather than pointer-only tilt.
const list=$('.library-list');let deckFrame=0,deckFlying=false;
document.addEventListener('library-flight-layer',()=>{deckFlying=true;cancelAnimationFrame(deckFrame);deckFrame=0;});
document.addEventListener('library-flight-finished',()=>{deckFlying=false;if(!deckFrame)deckFrame=requestAnimationFrame(deck);});
function deck(event){deckFrame=0;if(deckFlying||document.body.classList.contains('library-expanded'))return;applyLibraryPerspective(list,event?.type==='library-layout-ready');}

list.addEventListener('scroll',()=>{if(!deckFrame)deckFrame=requestAnimationFrame(deck);},{passive:true});
document.addEventListener('library-layout-ready',deck);
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
if(new URLSearchParams(location.search).get('tour')==='1')void import('./guided-tour.js?v=research-depth-20261025').then(({initTour})=>initTour()).catch(error=>{console.error('导览加载失败',error);document.documentElement.classList.remove('tour-arrival','tour-travelling');const notice=document.createElement('aside');notice.className='guided-tour';notice.setAttribute('role','alert');const text=document.createElement('p');text.textContent='导览未能启动：'+(error.message||'连接中断');const retry=document.createElement('button');retry.textContent='重新打开导览';retry.onclick=()=>location.reload();notice.append(text,retry);document.body.append(notice);});
window.reportStartupActivity?.({id:'workspace',label:'工作区布局与交互已就绪',state:'complete'});
document.documentElement.dataset.workspaceReady='true';window.dispatchEvent(new Event('workspace-ready'));
new MutationObserver(()=>{document.body.dataset.training=String(!$('#stop-button').hidden);}).observe($('#stop-button'),{attributes:true,attributeFilter:['hidden']});
