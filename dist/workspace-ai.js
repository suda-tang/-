import {reportTask} from './task-center.js?v=scan3';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function readableNetworkError(error){if(['AbortError','TimeoutError'].includes(error?.name)||/fetch is aborted|signal.*abort/i.test(error?.message||''))return '请求等待超时或连接被中止，操作尚未完成。请重试；若持续出现，请检查外网隧道连接。';return error?.message||'连接失败';}
function init(){
 if(document.querySelector('#workspace-ai'))return;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(ios)document.documentElement.classList.add('ios-low-memory');
 const nav=document.querySelector('.workspace-nav');if(!nav)return;
 const trigger=document.createElement('button');trigger.id='workspace-ai';trigger.type='button';trigger.innerHTML='<span>AI</span><svg class="ai-task-ring" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="ai-task-gradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#74bfff"/><stop offset=".5" stop-color="#bf88ef"/><stop offset="1" stop-color="#f8a487"/></linearGradient></defs><circle cx="24" cy="24" r="22"/></svg>';trigger.setAttribute('aria-label','打开音乐助手');const dock=document.createElement('div');dock.className='ai-navigation-dock';nav.before(dock);dock.append(nav,trigger);
 const dialog=document.createElement('dialog');dialog.className='ai-conversation';
 dialog.innerHTML='<div class="ai-screen-aura" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="ai-history-frame"><div class="ai-messages" role="log" aria-live="polite"></div></div><form><input aria-label="告诉我你想做什么" placeholder="告诉我你想做什么" maxlength="2000" required><button type="submit" aria-label="发送">↑</button><button type="button" class="ai-close" aria-label="关闭">×</button></form>';
 document.body.append(dialog);const log=dialog.querySelector('.ai-messages'),input=dialog.querySelector('input'),form=dialog.querySelector('form');let messages=[],busy=false,transitioning=false,selectedScoreId=null,lastUserText="";
 function trimConversation(){while(log.children.length>60)log.firstElementChild.remove();if(messages.length>20)messages=messages.slice(-20);}
 function line(text,role='assistant'){if(role==='assistant'&&aiTask)taskLines.push(text);trimConversation();const p=document.createElement('p');p.className=role;p.textContent=text;log.append(p);log.scrollTop=log.scrollHeight;}
 const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 const operation=document.createElement('div');operation.className='ai-operation-layer';operation.innerHTML='<div class="ai-screen-aura" aria-hidden="true"><i></i><i></i><i></i><i></i></div><span role="status"></span>';document.body.append(operation);
 let taskPercent=0,aiTask=null,saveTimer=0,saveChain=Promise.resolve(),taskLines=[];
 function taskReport(changes){if(!aiTask)return;aiTask={...aiTask,...changes,updated:Date.now()};reportTask(aiTask.id,aiTask);clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const snapshot={...aiTask};saveChain=saveChain.catch(()=>{}).then(async()=>{const r=await fetch('/api/ai-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('AI 任务保存失败');}).catch(e=>console.warn(e));},changes.status==='complete'||changes.status==='failed'?0:300);}

 function taskProgress(percent,label){taskPercent=Math.max(taskPercent,Math.min(100,percent));trigger.dataset.taskProgress=String(Math.round(taskPercent));trigger.style.setProperty('--ai-task-progress',taskPercent/100);trigger.classList.add('has-task');trigger.title=label+' '+Math.round(taskPercent)+'%';trigger.setAttribute('aria-label',trigger.title);operation.querySelector('span').textContent=trigger.title;taskReport({progress:Math.round(taskPercent),detail:label});}
 async function showResults(){while(transitioning)await wait(30);if(!dialog.open)await trigger.onclick({result:true});log.scrollTop=log.scrollHeight;}
 const labels={panel:'切换工作区',view:'切换谱面',search:'查找曲谱',open:'打开曲谱',play:'开始播放',solo:'选择独奏声部',solo_group:'声部分组',mute:'调整声部',web_search:'联网搜索',skill_search:'查找技能',choose_scores:'列出曲谱',seek_measure:'定位小节',chords:'提取和弦'};
// 动作执行后回读界面，确认它真的生效了。
// 为什么需要：AI 常说「我来处理」并发回动作，但动作在界面上什么都没改变 ——
// 这类「嘴上说好了、界面没动」的失败最难发现，只能靠执行后回读来兜住。
const PANELS=['library','play','arrange','tasks'];
// 模型常把面板写成中文名或别名（「演奏」「任务中心」）。以前认不出来就一律退回曲库，
// 于是「切换到演奏」会跳到曲库——看着像执行了，其实跑偏。这里先归一，认不出才退回曲库。
const PANEL_ALIAS={library:'library',曲库:'library',乐谱库:'library',乐谱:'library',play:'play',演奏:'play',播放:'play',弹奏:'play',arrange:'arrange',改编:'arrange',tasks:'tasks',任务:'tasks',任务中心:'tasks'};
const panelValue=value=>PANEL_ALIAS[String(value??'').trim().toLowerCase()]||'library';
const KNOWN_TYPES=new Set(['view','solo_group','choose_scores','panel','search','open','chords','seek_measure','play','solo','mute','skill_search','web_search']);
// 声部名称对不上就用显示名模糊匹配：模型回「左手」而选项里是「Left Hand」时也能命中。
function findPart(value){const want=String(value??'').trim();if(!want)return null;
 const options=parts();return options.find(p=>p.value===want)||options.find(p=>p.name&&(p.name.includes(want)||want.includes(p.name)))||null;}
function findMix(value){const want=String(value??'').trim();if(!want)return null;
 const inputs=[...document.querySelectorAll('#part-mix input[data-part]')];
 return inputs.find(x=>x.dataset.part===want)||inputs.find(x=>{const name=x.parentElement?.querySelector('span')?.textContent||'';return name&&(name.includes(want)||want.includes(name));})||null;}
function snapshot(){
 const play=document.querySelector('#play-button'),select=document.querySelector('#part-solo-select');
 return {panel:document.body.dataset.workspace||'',
  viewMode:document.querySelector('#notation-button')?.classList.contains('active')?'engraved':document.querySelector('#simple-button')?.classList.contains('active')?'simple':'',
  title:document.querySelector('#score-title')?.textContent||'',
  playing:play?play.textContent.trim():'',playDisabled:play?play.disabled:null,
  solo:select?select.value:'',muted:[...document.querySelectorAll('#part-mix input')].filter(x=>!x.checked).map(x=>x.dataset.part),
  position:document.querySelector('#position')?.textContent||'',logLines:log.children.length};
}
// 每种动作预期会改动哪些字段；产出文字/按钮的动作以「对话多了一行」为准。
// view 看谱面按钮的选中态（切谱面不会动工作区面板），solo_group 看声部勾选。
const EXPECT={panel:['panel'],view:['viewMode'],open:['title'],play:['playing','playDisabled'],solo:['solo'],mute:['muted'],solo_group:['solo','muted'],seek_measure:['position'],chords:['logLines'],search:['logLines'],web_search:['logLines'],skill_search:['logLines'],choose_scores:['logLines']};
// 回读留一个观察窗口：切面板、换谱面这类改动要过一帧才落到 DOM，
// 立刻比对会把「其实成功了」误判成「没生效」。已经站在目标面板上则直接算完成。
async function verifyAction(a,before){
 const keys=EXPECT[a.type];if(!keys)return true;
 if(a.type==='panel'&&before.panel===panelValue(a.value))return true;
 const changed=()=>{const after=snapshot();return keys.some(key=>JSON.stringify(before[key])!==JSON.stringify(after[key]));};
 for(let i=0;i<12;i++){await wait(60);if(changed())return true;}
 return false;
}
 async function readCloudLibrary(){
  const cached=window.cloudLibrarySnapshot;if(cached?.scores&&Date.now()-cached.saved<60000)return {scores:cached.scores};
  const response=await fetch('/api/scores',{priority:'high',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('曲库读取失败');const data=await response.json();window.cloudLibrarySnapshot={scores:data.scores,saved:Date.now()};return data;
 }
 function readLiveContext(){return Promise.race([new Promise(resolve=>document.dispatchEvent(new CustomEvent('ai-workspace-context',{detail:{resolve}}))),new Promise((_,reject)=>setTimeout(()=>reject(Error('播放工作区尚未响应，请关闭并重新打开 AI')),3000))]);}
 async function workspaceContext(){const data=await readCloudLibrary();const live=await readLiveContext();return {...live,scores:data.scores.map(x=>({id:x.id,title:x.title,ready:x.ready})),parts:parts(),current:document.querySelector('#score-title')?.textContent};}
 async function repairActions(failed,error,completed){line('操作没有完成，正在重新核对曲谱、声部和播放位置…');const context=await workspaceContext();const response=await fetch('/api/workspace-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:messages.slice(-16),context,repair:{failed,error:readableNetworkError(error),completed}}),signal:AbortSignal.timeout(100000)});const result=await response.json();if(!response.ok)throw Error(result.error);line(result.reply);if(!result.actions?.length)throw Error('重新核对后仍无法完成：'+error.message);return result.actions;}
 async function runActions(actions){if(!actions.length)return;actions=[...actions];let repairCount=0;const failedStates=new Set();const completed=[];await close();document.body.classList.add('ai-executing');trigger.disabled=true;taskPercent=0;taskProgress(0,'准备操作');try{for(let i=0;i<actions.length;i++){const a=actions[i];taskProgress(i/actions.length*100,labels[a.type]||'正在操作');const snapBefore=snapshot();try{await action(a,p=>taskProgress((i+p)/actions.length*100,labels[a.type]||'正在操作'));if(!await verifyAction(a,snapBefore))line('注意：'+(labels[a.type]||'这一步')+'执行后界面没有变化，可能没有真正生效。');}catch(error){const signature=JSON.stringify(a)+'|'+error.message;if(repairCount>=2||failedStates.has(signature))throw error;failedStates.add(signature);repairCount++;const replacement=await repairActions(a,error,completed);actions.splice(i,actions.length-i,...replacement.slice(0,6));i--;continue;}completed.push(a);messages.push({role:'assistant',content:'实际执行完成：'+JSON.stringify(a)});taskProgress((i+1)/actions.length*100,labels[a.type]||'正在操作');}taskProgress(100,'已完成');await wait(reduced()?0:350);}catch(error){trigger.classList.add('task-failed');throw error;}finally{document.body.classList.remove('ai-executing');trigger.disabled=false;}await showResults();}


 let layoutFrame=0;
 function visibleLayout(){const v=window.visualViewport;const width=v?.width||innerWidth,height=v?.height||innerHeight,left=v?.offsetLeft||0,top=v?.offsetTop||0;const w=Math.min(560,width-32);return {width:w,left:left+(width-w)/2,top:top+height-74,height};}
 function syncViewport(){if(!dialog.open||transitioning)return;const v=visibleLayout();dialog.style.width=v.width+'px';dialog.style.left=v.left+'px';dialog.style.top=v.top+'px';dialog.style.setProperty('--ai-history-height',Math.max(80,v.height-118)+'px');}
 function scheduleViewport(){cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(syncViewport);}
 window.visualViewport?.addEventListener('resize',scheduleViewport);window.visualViewport?.addEventListener('scroll',scheduleViewport);addEventListener('resize',scheduleViewport);input.addEventListener('focus',scheduleViewport);

 let dockMotion=null,dockExpanded=false;
 function animateDock(expanded){
  const current=getComputedStyle(nav).transform;const matrix=new DOMMatrixReadOnly(current==='none'?undefined:current);const from=matrix.m41;
  const bounds=nav.getBoundingClientRect(),area=dock.getBoundingClientRect();
  const target=expanded?area.left+area.width/2-(bounds.left+bounds.width/2-from):0;
  dockMotion?.cancel();dockExpanded=expanded;nav.style.transform=`translateX(${target}px)`;
  if(reduced())return;
  const delta=target-from;
  dockMotion=nav.animate([
   {transform:`translateX(${from}px) scaleX(1)`,offset:0},
   {transform:`translateX(${target+delta*.09}px) scaleX(1.018)`,offset:.65},
   {transform:`translateX(${target-delta*.025}px) scaleX(.996)`,offset:.85},
   {transform:`translateX(${target}px) scaleX(1)`,offset:1}
  ],{duration:640,easing:'cubic-bezier(.22,.75,.25,1)'});
 }
 addEventListener('resize',()=>{if(dockExpanded)animateDock(true);});
 async function morphSurface(from,to,duration){
  const surface=document.createElement('div');surface.className='ai-morph-surface';
  Object.assign(surface.style,{left:to.left+'px',top:to.top+'px',width:to.width+'px',height:to.height+'px'});
  surface.setAttribute('popover','manual');document.body.append(surface);surface.showPopover?.();
  const dx=from.left-to.left,dy=from.top-to.top,sx=from.width/to.width,sy=from.height/to.height;
  try{await surface.animate([{transform:`translate3d(${dx}px,${dy}px,0) scale(${sx},${sy})`},{transform:'translate3d(0,0,0) scale(1,1)'}],{duration:reduced()?0:duration,easing:'cubic-bezier(.22,.8,.25,1)',fill:'both'}).finished;}finally{surface.hidePopover?.();surface.remove();}
 }
 async function close(){if(!dialog.open||transitioning)return;transitioning=true;animateDock(false);const from=dialog.getBoundingClientRect();input.blur();const to=trigger.getBoundingClientRect();document.body.classList.remove('ai-listening');dialog.classList.add('is-morphing');dialog.style.opacity='0';try{await morphSurface(from,to,480);}finally{dialog.close();dialog.style.opacity='';dialog.classList.remove('is-morphing');trigger.style.opacity='';trigger.focus({preventScroll:true});transitioning=false;}}
 trigger.onclick=async event=>{if(transitioning)return;transitioning=true;const from=trigger.getBoundingClientRect();dialog.style.width=from.width+'px';dialog.style.left=from.left+'px';dialog.style.top=from.top+'px';dialog.classList.add('is-morphing');dialog.style.opacity='0';dialog.showModal();if(!event?.result)input.focus({preventScroll:true});trigger.style.opacity='0';animateDock(true);requestAnimationFrame(()=>document.body.classList.add('ai-listening'));
 // Focus first; wait for the keyboard viewport to settle before choosing the destination.
 if(matchMedia('(pointer:coarse)').matches&&!reduced()){await new Promise(resolve=>{let settle;const v=window.visualViewport;const finish=()=>{clearTimeout(settle);clearTimeout(deadline);v?.removeEventListener('resize',changed);resolve();};const changed=()=>{clearTimeout(settle);settle=setTimeout(finish,120);};const deadline=setTimeout(finish,650);v?.addEventListener('resize',changed);});}
 const layout=visibleLayout(),{width,top,left}=layout;dialog.style.width=width+'px';dialog.style.left=left+'px';dialog.style.top=top+'px';try{await morphSurface(from,{left,top,width,height:57},520);}finally{dialog.style.opacity='';dialog.classList.remove('is-morphing');transitioning=false;syncViewport();}};dialog.querySelector('.ai-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();void close();});
 async function spotlight(el){if(!el)return;el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('ai-operating');try{await wait(matchMedia('(prefers-reduced-motion:reduce)').matches?0:650);}finally{el.classList.remove('ai-operating');}}
 function characterStream(){let queue=[],timer=0,node=null,finished=false,resolve;const drained=new Promise(r=>resolve=r);function tick(){timer=0;if(queue.length){if(!node){node=document.createElement('p');node.className='assistant ai-streaming-text';log.append(node);}const char=queue.shift();if(node.lastChild?.nodeType===Node.TEXT_NODE)node.lastChild.appendData(char);else node.append(document.createTextNode(char));log.scrollTop=log.scrollHeight;timer=setTimeout(tick,18);}else if(finished){node?.classList.remove('ai-streaming-text');resolve();}}return {push(text){queue.push(...Array.from(text));if(!timer)timer=setTimeout(tick,0);},finish(){finished=true;if(!timer)tick();return drained;},cancel(){clearTimeout(timer);queue=[];node?.classList.remove('ai-streaming-text');resolve();}};}
 const parts=()=>[...document.querySelectorAll('#part-solo-select option')].map(o=>({value:o.value,name:o.textContent}));
 async function watchImport(id){for(let i=0;i<240;i++){await wait(5000);try{const r=await fetch('/api/scores');const data=await r.json();const score=data.scores?.find(x=>x.id===id);if(score?.ready){document.querySelector('.library-refresh')?.click();await wait(1800);await action({type:'open',value:id});await action({type:'play'});line('识谱完成，已开始播放。');return;}if(score?.status==='failed'){line('识谱失败，请到任务中心查看详细原因。');return;}}catch(e){line('自动打开没有完成：'+e.message);return;}}line('识谱仍在后台处理，请到任务中心查看。');}
 async function action(a,onProgress=()=>{}){
  // 不认识的动作直接报错走「重新核对」，不要静默空转——那是「AI 说好了但什么都没发生」的主力来源。
  if(!KNOWN_TYPES.has(a.type))throw Error('暂时不支持这个操作：'+a.type);
  if(a.type==='view'){await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-set-view',{detail:{mode:a.value,resolve,reject}})));return;}
  if(a.type==='solo_group'){await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-solo-group',{detail:{ids:(Array.isArray(a.value)?a.value:JSON.parse(a.value)),resolve,reject}})));return;}
  if(a.type==='choose_scores'){const items=(Array.isArray(a.value)?a.value:JSON.parse(a.value));for(const item of items){const button=document.createElement('button');button.type='button';button.textContent=item.title+(item.ready===false?'（识谱中）':'');if(item.evidence)button.title=item.evidence;button.onclick=()=>{if(busy)return;selectedScoreId=item.id;input.value=lastUserText;form.requestSubmit();};log.append(button);}return;}

  // 已经站在目标面板上就别再点一遍：省掉 650ms 的聚光动画，也不会被回读当成「没生效」。
  if(a.type==='panel'){const value=panelValue(a.value);if(document.body.dataset.workspace===value)return;const el=document.querySelector(`.workspace-nav [data-panel="${value}"]`);await spotlight(el);el?.click();return;}
  if(a.type==='search'){
   await action({type:'panel',value:'library'});const cards=[...document.querySelectorAll('.library-score')];const terms=a.value.replace(/的歌|歌曲|播放/g,'').trim();const hits=cards.filter(c=>(c._item?.title||c.textContent).includes(terms));
   for(const c of hits)await spotlight(c);line(hits.length?'找到：'+hits.map(c=>c._item?.title||c.querySelector('strong')?.textContent).join('、')+'。您想听哪首？':'曲库里没有找到，要在网上查找吗？');
   for(const card of hits){const choice=document.createElement('button');choice.textContent=card._item?.title||card.querySelector('strong')?.textContent;choice.onclick=async()=>{choice.disabled=true;try{await runActions([{type:'open',value:card.dataset.scoreId},{type:'play',value:''}]);}catch(e){line(readableNetworkError(e));}finally{choice.disabled=false;}};log.append(choice);}
   messages.push({role:'assistant',content:'查曲实际结果：'+JSON.stringify(hits.map(c=>({id:c.dataset.scoreId,title:c._item?.title}))) });
  }
  if(a.type==='open'){
   await action({type:'panel',value:'library'});
   const card=[...document.querySelectorAll('.library-score')].find(c=>c.dataset.scoreId===a.value);if(card)await spotlight(card);
   await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id:a.value,resolve,reject,onProgress}})));
  }
  if(a.type==='chords'){const result=await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-analyze-chords',{detail:{part:a.value,resolve,reject,onProgress}})));const known=result.chords.filter(c=>c.name).length;line('《'+result.title+'》：'+known+' 个小节得到和弦候选，其余需核对。以下按小节列出，属于音符匹配结果，不是已核定的和声分析。');line(result.chords.map(c=>'第 '+c.measure+' 小节：'+(c.name||'待核对')).join('\n'));messages.push({role:'assistant',content:JSON.stringify(result)});return;}
  if(a.type==='seek_measure'){await spotlight(document.querySelector('#sheet-scroll'));await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-seek-measure',{detail:{measure:Number(a.value),resolve,reject}})));}
  if(a.type==='play'){const el=document.querySelector('#play-button');if(!el||el.disabled)throw Error('请先载入一首已经识别好的曲谱');await spotlight(el);await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-play-score',{detail:{resolve,reject}})));}
  if(a.type==='solo'){const select=document.querySelector('#part-solo-select');const hit=findPart(a.value);if(!hit)throw Error('当前曲谱没有这个声部');await spotlight(select);select.value=hit.value;select.dispatchEvent(new Event('change',{bubbles:true}));}
  if(a.type==='mute'){const el=findMix(a.value);if(!el)throw Error('当前曲谱没有这个声部');await spotlight(el.parentElement);el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));}
  if(a.type==='skill_search'){
   const response=await fetch('/api/workspace-ai/web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'skills',query:a.value}),signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw Error(result.error);line(result.notice);for(const item of result.results){line(item.title+' — '+item.description+'（许可：'+item.license+'）');const link=document.createElement('a');link.href=item.url;link.textContent='查看开源项目';link.target='_blank';link.rel='noopener';log.append(link);}if(!result.results.length)line('没有找到匹配的 Skill，请补充功能描述。');return;
  }
  if(a.type==='web_search'){
   const r=await fetch('/api/workspace-ai/web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'search',query:a.value}),signal:AbortSignal.timeout(30000)});const result=await r.json();if(!r.ok)throw Error(result.error);line(result.results.length?'找到这些结果，您可以选择查看。直接 PDF 可以导入并加入识谱队列。':'没有找到可用结果，可以换个曲名再试。');
   if(result.notice)line(result.notice);for(const item of result.results){const link=document.createElement('a');link.textContent=item.title;link.href=item.url;link.target='_blank';link.rel='noopener';log.append(link);if(item.directPdf){const button=document.createElement('button');button.textContent='导入这份谱';button.onclick=async()=>{button.disabled=true;try{line('正在下载并提交识谱…');const response=await fetch('/api/workspace-ai/web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'import',url:item.url,title:a.value}),signal:AbortSignal.timeout(90000)});const data=await response.json();if(!response.ok)throw Error(data.error);line('已加入识谱队列；完成后会尝试打开并播放。');await action({type:'panel',value:'tasks'});void watchImport(data.id);}catch(e){line(readableNetworkError(e));}finally{button.disabled=false;}};log.append(button);}}
  }
 }
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;const text=input.value.trim();if(!text)return;lastUserText=text;busy=true;taskLines=[];aiTask={id:'ai-'+crypto.randomUUID(),label:text,created:Date.now(),kind:'ai',status:'running',progress:0,detail:'读取曲库'};taskReport({});trigger.classList.remove('task-failed','has-task');taskPercent=0;dialog.classList.add('is-thinking');input.value='';messages.push({role:'user',content:text});line(text,'user');form.querySelector('button').disabled=true;const status=document.createElement('p');status.className='ai-operation-detail';log.append(status);let statusTimer=0;function streamStatus(text){clearInterval(statusTimer);status.textContent='';const chars=Array.from(text);let index=0;statusTimer=setInterval(()=>{if(index>=chars.length){clearInterval(statusTimer);return;}status.textContent+=chars[index++];log.scrollTop=log.scrollHeight;},12);}streamStatus('读取云曲库，获取当前曲谱、播放位置和可用声部…');const reveal=characterStream();
  try{const libraryData=await readCloudLibrary();const live=await readLiveContext();const context={...live,scores:libraryData.scores.map(c=>({id:c.id,title:c.title,ready:c.ready})),selectionId:selectedScoreId,parts:parts(),current:document.querySelector('#score-title')?.textContent};selectedScoreId=null;const r=await fetch('/api/workspace-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:messages.slice(-16),context,stream:true}),signal:AbortSignal.timeout(300000)});if(!r.ok){const error=await r.json();throw Error(error.error);}let result=null,buffer='';const reader=r.body.getReader(),decoder=new TextDecoder();for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop();for(const lineText of lines){if(!lineText.trim())continue;const event=JSON.parse(lineText);if(event.type==='status'){streamStatus(event.text);taskReport({detail:event.text});}if(event.type==='delta')reveal.push(event.text);if(event.type==='error')throw Error(event.text);if(event.type==='result')result=event;}if(done)break;}if(!result)throw Error('模型连接已结束，但没有返回完整操作结果');clearInterval(statusTimer);status.remove();await reveal.finish();messages.push({role:'assistant',content:result.reply});await runActions(result.actions||[]);
  // 只答应不干活：回复里满口「我来处理」却一个动作都没给，用户看到的就是什么都没发生。
  if(!result.actions?.length&&/我来处理|我来帮|马上|没问题|好的|可以[，。]?$|已经帮你/.test(String(result.reply||'')))line('这一步没有生成可执行的操作，界面不会变化。请说得更具体一点，例如「打开《…》」「切换到演奏面板」「只听左手」。');taskReport({status:'complete',progress:100,detail:result.actions?.some(a=>['choose_scores','search','web_search'].includes(a.type))?'结果已列出，等待选择':'已完成',result:[result.reply,...taskLines].filter(Boolean).join('\n\n')}); }
  catch(error){taskReport({status:'failed',detail:readableNetworkError(error),result:taskLines.join('\n\n')});reveal.cancel();clearInterval(statusTimer);status.remove();line(readableNetworkError(error));await showResults();messages.push({role:'assistant',content:'操作未完成：'+error.message});}
  finally{clearInterval(statusTimer);clearTimeout(saveTimer);const snapshot=aiTask?{...aiTask}:null;busy=false;dialog.classList.remove('is-thinking');form.querySelector('button[type="submit"]').disabled=false;if(snapshot){saveChain=saveChain.catch(()=>{}).then(async()=>{const saved=await fetch('/api/ai-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot),signal:AbortSignal.timeout(8000)});if(!saved.ok)throw Error('任务结果未能保存');}).catch(error=>console.warn('AI 任务保存失败',error));}}

 };
}
if(document.querySelector('.workspace-nav'))init();else window.addEventListener('workspace-ready',init,{once:true});
