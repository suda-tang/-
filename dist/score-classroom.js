import {lessonActions,speechRegion} from './classroom-listening.js';
import {liveScore,livePlayer} from './capability-host.js';
import {rangeOf} from './ai-advanced-actions.js';
import {reportTask} from './task-center.js?v=folded-groups1';
import {renderSlide,renderInteractive,classroomActions} from './classroom-slides.js';
import {mountMaterials} from './classroom-materials.js';
import {executeClassroomAction} from './classroom-engine.js';
const call=(name,detail={},timeout=12000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('工作区暂未响应，请等待曲谱载入')),timeout);document.dispatchEvent(new CustomEvent(name,{detail:{...detail,resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}}}));});
const plain=value=>{const body=new DOMParser().parseFromString(String(value||''),'text/html').body;body.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));body.querySelectorAll('p,li,h1,h2,h3').forEach(n=>n.append('\n'));return(body.textContent||'').replace(/[\p{Extended_Pictographic}\uFE0F]/gu,'').replace(/\n{3,}/g,'\n\n').trim()};
const disclosureArrow=summary=>{const existing=summary.querySelector('.classroom-disclosure-arrow');if(existing)return existing;const arrow=document.createElement('span');arrow.className='classroom-disclosure-arrow';arrow.setAttribute('aria-hidden','true');summary.append(arrow);return summary};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;if(tag==='summary')disclosureArrow(n);return n};
async function request(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok||data.error)throw Error(data.error||`HTTP ${r.status}`);return data;}
export function mountClassroom(root){
 root.innerHTML=`<div class="classroom-heading"><h3>音乐课堂</h3></div><form class="classroom-setup"><label>教学要求<textarea name="goal" rows="3" maxlength="1500">从高中音乐鉴赏课堂的视角教这首作品，安排聆听、讨论和小组创作，学生不需要会弹钢琴。</textarea></label><div class="classroom-fields"><label>教学场景<select name="mode"><option value="classroom">中小学音乐课堂</option><option value="piano">钢琴教学</option></select></label><label class="classroom-school-stage">学段<select name="schoolStage"><option value="primary">小学</option><option value="junior">初中</option><option value="senior" selected>高中</option></select></label><label>学习者<input name="level" value="高中一年级"></label><label>课时<select name="duration"><option value="20">20 分钟</option><option value="35">35 分钟</option><option value="40">40 分钟</option><option value="45" selected>45 分钟</option><option value="90">90 分钟</option></select></label><label>作品范围<select name="scope"><option value="whole">全曲</option><option value="range">指定小节</option></select></label><label>起始小节<input name="start" type="number" min="1" value="1" required disabled></label><label>结束小节<input name="end" type="number" min="1" value="8" required disabled></label></div><div class="classroom-options"><label><input type="checkbox" value="slides" checked disabled>PPT 课件</label><label><input name="features" type="checkbox" value="quiz" checked>课堂测验</label><label><input name="features" type="checkbox" value="interactive" checked>互动活动</label><label><input name="features" type="checkbox" value="pbl" checked>小组项目</label><label><input name="useReferences" type="checkbox" checked>联网参考教案</label><button type="submit">生成课程</button></div></form><div class="classroom-status" role="status"></div><div class="classroom-progress" hidden><progress max="100" value="0" aria-label="课程生成进度"></progress><output class="classroom-percent" aria-live="polite">0%</output></div><div class="classroom-body" hidden><details class="classroom-plan"><summary>教学安排</summary><div></div></details><nav class="classroom-chapters" aria-label="课程环节"></nav><article class="classroom-sheet"></article><div class="classroom-tools"><button data-act="voice">开始讲课</button><button data-act="demo">聆听作品</button><button data-act="practice">演奏练习</button><button data-act="next">下一环节 →</button><button data-act="export">导出 PPT</button></div><p class="classroom-caption" aria-live="polite"></p><details class="classroom-question"><summary>课堂讨论</summary><label>对话对象<select class="classroom-role"><option value="teacher">音乐教师</option><option value="student">模拟同学</option></select></label><div class="classroom-dialogue" aria-live="polite"></div><form><input aria-label="课堂问题" placeholder="输入课堂问题或分享聆听感受" maxlength="1500" required><button>发送</button></form></details><p class="classroom-note"></p></div>`;
 const $=s=>root.querySelector(s),form=$('.classroom-setup'),status=$('.classroom-status'),bar=$('progress'),sheet=$('.classroom-sheet'),chapters=$('.classroom-chapters'),caption=$('.classroom-caption');
 let course=null,index=0,timer=null,voice=null,voiceToken=0,history=[],rendered='',busy=false,slideView=null,actionView=null,actionCursor=0,speaker=new Audio(),speakerReady=false,resumeTime=0,listening=null,formScoreId=null,rangeDirty=false,planKey='',chapterKey='',transcriptKey='',pollingId=null,inViewport=true,bindingVersion=0,boundScoreId=liveScore()?.serverId||null,openingFor=null;
 let sessionId=localStorage.getItem('classroom-session');if(!sessionId){sessionId=crypto.randomUUID();localStorage.setItem('classroom-session',sessionId)}
 const materialPicker=mountMaterials(form,{score:liveScore,request,onStatus:text=>status.textContent=text});
 let selectedElement=null,materialAudio=null,chatController=null,cancelActionAudio=null;
 async function observe(kind,value){if(!course)return;const id=course.id,sceneId=course.scenes[index]?.id;if(!sceneId)return;try{const response=await request('/api/classroom/event',{id,sceneId,sessionId,kind,value});if(course?.id===id)course.observations=response.observations}catch(error){status.textContent='课堂记录未保存：'+error.message}}
 function actionHost(token=voiceToken){const id=course?.id,version=bindingVersion;return {call,score:liveScore,player:livePlayer,current:()=>course?.id===id&&bindingVersion===version&&voiceToken===token,listen:async action=>{await showScore();return listenToWork(action,token)},visual:()=>actionView ||= classroomActions(sheet),jump:async target=>{if(!course.scenes[target])throw Error('课堂页码无效');index=target;rendered='';display();remember()},speak:text=>speakAction(text,token),playMaterial:async materialId=>{if(!course.materials?.some(m=>m.id===materialId&&m.playable))throw Error('此材料未绑定到当前课堂');materialAudio?.pause();const audio=new Audio('/api/classroom/material-file?id='+encodeURIComponent(materialId));materialAudio=audio;return new Promise((resolve,reject)=>{const finish=(error)=>{cancelActionAudio=null;materialAudio=null;error?reject(error):resolve({played:true})};cancelActionAudio=()=>finish();audio.onended=()=>finish();audio.onerror=()=>finish(Error('聆听素材无法解码，请使用MP3或WAV'));audio.play().catch(finish)})}}}
 async function speakAction(text,token){
  caption.textContent=plain(text);for(let attempt=0;attempt<100;attempt++){
   if(token!==voiceToken)throw Error('课堂播放已停止');
   const result=await request('/api/tour-voice?locale=zh&text='+encodeURIComponent(plain(text).slice(0,3000)));
   if(result.status==='failed')throw Error(result.message);
   if(result.status==='complete'&&result.url){const audio=speaker;voice=audio;audio.src=result.url;audio.playbackRate=Number(speed.value)||1;return new Promise((resolve,reject)=>{const finish=error=>{cancelActionAudio=null;voice=null;error?reject(error):resolve({spoken:true})};cancelActionAudio=()=>finish();audio.onended=()=>finish();audio.onerror=()=>finish(Error('讲解声音无法播放'));audio.play().catch(finish)})}
   await new Promise(resolve=>setTimeout(resolve,600));
  }throw Error('讲解声音仍在生成，请稍后继续');
 }
 const editor=el('details',null,'classroom-editor');editor.append(el('summary','修改当前课件'));const editTarget=document.createElement('select'),editText=el('textarea'),saveEdit=el('button','保存修改');editText.rows=5;saveEdit.type='button';editor.append(editTarget,editText,saveEdit);$('.classroom-sheet').after(editor);
 function fillEditor(){editTarget.replaceChildren();const scene=course?.scenes[index];for(const e of scene?.content?.canvas?.elements||[])if(e.type==='text'){const option=el('option',plain(e.content).slice(0,50));option.value='element:'+e.id;editTarget.append(option)}for(const [i,a]of (scene?.actions||[]).entries())if(a.type==='speech'){const option=el('option','讲解：'+plain(a.text).slice(0,40));option.value='speech:'+i;editTarget.append(option)}if(selectedElement&&[...editTarget.options].some(o=>o.value==='element:'+selectedElement))editTarget.value='element:'+selectedElement;editTarget.onchange()}
 editTarget.onchange=()=>{const [kind,...rest]=editTarget.value.split(':');const id=rest.join(':');const scene=course?.scenes[index];editText.value=kind==='element'?plain(scene?.content?.canvas?.elements.find(e=>e.id===id)?.content):scene?.actions[Number(id)]?.text||''};editor.addEventListener('click',event=>{if(event.target.closest('summary'))fillEditor()});
 sheet.addEventListener('click',event=>{selectedElement=event.target.closest('[data-element-id]')?.dataset.elementId||selectedElement});
 saveEdit.onclick=async()=>{if(!course)return;saveEdit.disabled=true;try{const id=course.id,sceneId=course.scenes[index]?.id,[kind,...rest]=editTarget.value.split(':'),key=rest.join(':');stopVoice();const changed=await request('/api/classroom/edit',{id,sceneId,revision:course.revision||0,change:kind==='element'?{kind:'element-text',elementId:key,text:editText.value}:{kind:'speech',cursor:Number(key),text:editText.value}});if(course?.id!==id)return;course=changed;rendered='';planKey=transcriptKey='';display();status.textContent='修改已保存';}catch(error){status.textContent=error.message}finally{saveEdit.disabled=false}};
 const editInstruction=el('textarea'),revise=el('button','按要求修改');editInstruction.rows=2;editInstruction.placeholder='例如：改成适合初中生的提问，保留音乐证据';revise.type='button';editor.append(editInstruction,revise);revise.onclick=async()=>{if(!course||!editTarget.value)return;revise.disabled=true;const id=course.id,sceneId=course.scenes[index].id,target=editTarget.value;try{status.textContent='正在修改选中的一段…';const response=await fetch('/api/classroom/revise',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,sceneId,text:editText.value,instruction:editInstruction.value}),signal:AbortSignal.timeout(120000)}),result=await response.json();if(!response.ok||result.error)throw Error(result.error||'修改未完成');if(course?.id!==id||course.scenes[index]?.id!==sceneId||editTarget.value!==target)return;editText.value=result.text;status.textContent='已修改，可继续编辑或保存';}catch(error){status.textContent=error.message}finally{revise.disabled=false}};
 for(const name of ['scope','start','end'])form.elements[name].addEventListener('change',()=>{rangeDirty=true});
 form.elements.scope.onchange=()=>{const whole=form.elements.scope.value==='whole';form.elements.start.disabled=whole;form.elements.end.disabled=whole;if(whole){form.elements.start.value=1;const measures=liveScore()?.events?.map(e=>Number(e.measure))||[];if(measures.length)form.elements.end.value=Math.max(...measures)}};
 const stageText={primary:'小学',junior:'初中',senior:'高中'};
 form.elements.schoolStage.onchange=()=>{const stage=stageText[form.elements.schoolStage.value];form.elements.level.value={primary:'小学三年级',junior:'初中一年级',senior:'高中一年级'}[form.elements.schoolStage.value];form.elements.goal.value=`从${stage}音乐课堂出发，围绕这首作品安排聆听、演唱或律动、探究与创作，面向普通班级，不要求会弹钢琴。`;};
 form.elements.mode.onchange=()=>{const school=form.elements.mode.value==='classroom';$('.classroom-school-stage').hidden=!school;if(school)form.elements.schoolStage.onchange();else{form.elements.level.value='中级';form.elements.goal.value='围绕当前作品的节奏、声部平衡与演奏难点安排钢琴课。'}};
 const container=root.closest('details'),expand=el('button','展开课堂');expand.type='button';expand.className='classroom-expand';$('.classroom-heading').append(expand);let placeholder=null;
 root.querySelectorAll('summary').forEach(disclosureArrow);
 const config=el('details',null,'classroom-config'),configLabel=el('summary','课程设置');form.before(config);config.append(configLabel,form);config.open=true;
 const sidebar=el('aside',null,'classroom-sidebar');sidebar.setAttribute('aria-label','课程安排与讨论');root.append(sidebar);sidebar.append(config,$('.classroom-plan'),$('.classroom-question'));
 const continuous=el('label',null,'classroom-continuous'),continuousCheck=document.createElement('input');continuousCheck.type='checkbox';continuousCheck.checked=true;continuous.append(continuousCheck,' 连续讲解，到提问时停下');$('.classroom-tools').after(continuous);
 function fullscreen(){if(placeholder){placeholder.replaceWith(container);placeholder=null;container.classList.remove('classroom-fullscreen');expand.classList.remove('classroom-minimize');$('.classroom-heading').append(expand);expand.textContent='展开课堂';expand.setAttribute('aria-label','展开课堂');expand.title='展开课堂';expand.setAttribute('aria-expanded','false');}else{back.hidden=true;placeholder=document.createComment('classroom-home');container.before(placeholder);document.body.append(container);container.classList.add('classroom-fullscreen');document.body.append(expand);expand.classList.add('classroom-minimize');expand.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';expand.setAttribute('aria-label','收起课堂');expand.title='收起课堂';expand.setAttribute('aria-expanded','true');}}
 expand.onclick=()=>{const closing=!!placeholder;container.classList.remove('classroom-presentation');fullscreen();if(closing)container.open=false};
 const present=el('button','播放 PPT');present.type='button';present.className='classroom-present';$('.classroom-tools').prepend(present);
 const leave=el('button','退出放映');leave.type='button';leave.className='classroom-leave-presentation';leave.hidden=true;$('.classroom-tools').append(leave);
 const previous=el('button','上一页');previous.type='button';previous.hidden=true;$('.classroom-tools').prepend(previous);
 const pageNumber=el('output',null,'classroom-page-number');pageNumber.setAttribute('aria-live','polite');pageNumber.hidden=true;previous.after(pageNumber);
 let nativePresentation=false,presentationWasExpanded=false;
 const slideIndices=()=>course?.scenes.map((s,i)=>s.type==='slide'?i:-1).filter(i=>i>=0)||[];
 function syncPresentationControls(){
  const showing=container.classList.contains('classroom-presentation'),pages=slideIndices(),at=pages.indexOf(index);
  previous.hidden=!showing;pageNumber.hidden=!showing;
  if(showing){previous.disabled=at<=0;pageNumber.textContent=`${at+1} / ${pages.length}`;$('[data-act="next"]').textContent='下一页';$('[data-act="next"]').disabled=at<0||at>=pages.length-1}
 }
 function turnPage(direction){const pages=slideIndices(),at=pages.indexOf(index),target=pages[at+direction];if(target==null)return;stopVoice();index=target;remember();display();syncPresentationControls()}
 previous.onclick=()=>turnPage(-1);
 function endPresentation(){
  if(!container.classList.contains('classroom-presentation'))return;
  container.classList.remove('classroom-presentation');leave.hidden=true;present.hidden=false;previous.hidden=true;pageNumber.hidden=true;
  const exitNative=nativePresentation&&document.fullscreenElement===container;nativePresentation=false;
  if(exitNative)document.exitFullscreen?.().catch(()=>{});
  if(!presentationWasExpanded&&placeholder)fullscreen();
  $('[data-act="next"]').textContent='下一环节 →';$('[data-act="next"]').disabled=!course||index>=course.scenes.length-1;remember();
 }
 leave.onclick=endPresentation;
 present.onclick=async()=>{
  if(!course?.scenes.length)return;
  const pages=slideIndices();if(!pages.length){status.textContent='PPT 尚未生成';return}
  // Fullscreen changes presentation only; the current lecture and audio stay intact.
  if(course.scenes[index]?.type!=='slide'){const target=pages.find(i=>i>index)??pages.at(-1);stopVoice();index=target;remember();display()}
  presentationWasExpanded=!!placeholder;if(!placeholder)fullscreen();
  container.classList.add('classroom-presentation');leave.hidden=false;present.hidden=true;container.scrollTop=0;syncPresentationControls();
  try{if(container.requestFullscreen){await container.requestFullscreen();nativePresentation=true}}catch{}
 };
 document.addEventListener('fullscreenchange',()=>{if(nativePresentation&&!document.fullscreenElement)endPresentation()});
 document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,select,[contenteditable=true]'))return;
  if(container.classList.contains('classroom-presentation')){
   if(e.key==='Escape'){endPresentation();return}
   if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&['ArrowLeft','ArrowRight','PageUp','PageDown'].includes(e.key)){e.preventDefault();turnPage(['ArrowLeft','PageUp'].includes(e.key)?-1:1)}
  }else if(e.key==='Escape'&&placeholder){pauseLecture();fullscreen()}
 });
 const store=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
 const saved=key=>{try{return JSON.parse(localStorage.getItem(key))}catch{return null}};
 function unlockSpeaker(){if(speakerReady)return;speakerReady=true;speaker.src='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';speaker.play().then(()=>{if(speaker.src.startsWith('data:'))speaker.pause()}).catch(()=>{})}
 function stopVoice(){sheet.querySelectorAll('video[data-classroom-playing]').forEach(video=>video.dispatchEvent(new Event('classroom-cancel')));voice?.pause();materialAudio?.pause();cancelActionAudio?.();cancelActionAudio=null;materialAudio=null;cancelListening();actionCursor=0;voiceToken++;if(voice){voice.pause();voice=null}resumeTime=0;$('[data-act="voice"]').textContent='开始讲课';}
 function sameScore(){if(liveScore()?.serverId!==course?.scoreId)throw Error('当前曲谱已切换，请先打开这堂课对应的《'+course.title+'》');if(liveScore()?.generated)throw Error('当前显示的是改编总谱，请切回原谱后使用这堂课的示范与练习');}
 function remember(){if(course)store('classroom-position:'+course.id,{index,history,actionCursor,time:voice?.currentTime||resumeTime});}
 function pauseLecture(){const video=sheet.querySelector('video[data-classroom-playing]');if(video){video.pause();$('[data-act="voice"]').textContent='继续播放';return}if(materialAudio){materialAudio.pause();$('[data-act="voice"]').textContent='继续聆听';return}if(listening){listening.paused=true;if(livePlayer()?.playing)void call('ai-transport',{command:'pause'}).catch(()=>{});$('[data-act="voice"]').textContent='继续讲课';remember();return}if(voice){voice.pause();$('[data-act="voice"]').textContent='继续讲解'}else if(actionCursor){voiceToken++;actionCursor=Math.max(0,actionCursor-1)}remember()}
 speaker.ontimeupdate=()=>{if(voice&&Math.floor(voice.currentTime)%3===0)remember()};
 const pace=el('label',null,'classroom-pace'),speed=el('input'),speedValue=el('output');speed.type='range';speed.min='.8';speed.max='1.8';speed.step='.05';speed.setAttribute('aria-label','讲解语速');speed.value=String(saved('classroom-speech-rate')||1.15);speedValue.textContent=Number(speed.value).toFixed(2)+'×';pace.append('语速 ',speed,speedValue);continuous.after(pace);speed.oninput=()=>{speaker.playbackRate=Number(speed.value);speedValue.textContent=Number(speed.value).toFixed(2)+'×';store('classroom-speech-rate',Number(speed.value))};
 const skip=el('button','跳过当前讲解');skip.type='button';skip.dataset.act='skip-speech';const secondaryActions=el('div',null,'classroom-secondary-actions');secondaryActions.append(skip,$('[data-act=export]'));const lessonActionsPanel=el('div',null,'classroom-lesson-actions');lessonActionsPanel.append(secondaryActions,$('[data-act=next]'));$('.classroom-tools').append(lessonActionsPanel);
 const tools=$('.classroom-tools');
 function layoutTools(){const buttons=[...tools.querySelectorAll('button')].filter(button=>!button.hidden);for(const button of tools.querySelectorAll('button'))button.classList.toggle('classroom-full-row',buttons.length%2===1&&button===buttons.at(-1));}
 const toolsObserver=new MutationObserver(layoutTools);toolsObserver.observe(tools,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});layoutTools();
 async function jumpLecture(cursor){
  const scene=course?.scenes[index];if(!scene)return;
  stopVoice();const token=++voiceToken;actionCursor=cursor;
  // Seeking skips earlier actions, so restore the visual cue before waiting for audio.
  actionView ||= classroomActions(sheet);
  const cue=(lessonActions(scene.actions||[],scene.content?.canvas?.elements||[])).slice(0,cursor+1).findLast(a=>a.type==='spotlight'||a.type==='laser');
  if(cue)actionView.apply(cue);else actionView.apply({type:'spotlight',elementId:null});
  remember();
  try{unlockSpeaker();if(livePlayer()?.playing)await call('ai-transport',{command:'pause'});if(token!==voiceToken)return;await advanceLecture(token)}catch(e){if(token===voiceToken)status.textContent=e.message}
 }
 skip.onclick=()=>{const actions=lessonActions(course?.scenes[index]?.actions||[],course?.scenes[index]?.content?.canvas?.elements||[]);const next=actions.findIndex((a,i)=>i>=actionCursor&&a.type==='speech');jumpLecture(next<0?actions.length:next)};
 sheet.addEventListener('click',event=>{const node=event.target.closest('[data-element-id]');if(!node)return;const actions=lessonActions(course?.scenes[index]?.actions||[],course?.scenes[index]?.content?.canvas?.elements||[]);const cue=actions.findIndex(a=>(a.type==='spotlight'||a.type==='laser')&&a.elementId===node.dataset.elementId);if(cue>=0)jumpLecture(cue);else{actionView ||= classroomActions(sheet);actionView.apply({type:'spotlight',elementId:node.dataset.elementId})}});
 sheet.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-element-id][role=button]')){event.preventDefault();event.target.click()}});
 const back=el('button','返回课堂','classroom-return');back.type='button';back.hidden=true;document.body.append(back);back.onclick=()=>{back.hidden=true;container.open=true;if(!placeholder)fullscreen()};
 function discuss(question){$('.classroom-question').open=true;$('.classroom-role').value='teacher';$('.classroom-question input').value=question.slice(0,1500);$('.classroom-question form').requestSubmit();$('.classroom-question').scrollIntoView({behavior:'smooth',block:'nearest'})}
 function quiz(scene){
  for(const q of scene.content.questions||[]){
   const group=el('fieldset'),feedback=el('p');group.append(el('legend',q.question));
   const key='classroom-answer:'+course.id+':'+q.id,previous=saved(key),chosen=new Set(previous?.answer||[]);
   if(q.type==='short_answer'||!(q.options||[]).length){const answer=el('textarea');answer.rows=4;answer.placeholder='写下你的理解，并说明听到了什么';answer.value=previous?.text||'';const submit=el('button','提交并讨论');submit.type='button';submit.onclick=()=>{if(!answer.value.trim())return;store(key,{text:answer.value});void observe('short-answer',{question:q.question,answer:answer.value});discuss(`课堂问题：${q.question}\n我的回答：${answer.value}\n请从当前音乐课堂的教学目标出发给予反馈，指出证据是否充分。`)};group.append(answer,submit);}
   else{
    const buttons=[];for(const option of q.options){const b=el('button',`${option.value}. ${plain(option.label||option.text||option.content)}`);b.type='button';b.setAttribute('aria-pressed',String(chosen.has(option.value)));b.onclick=()=>{if(q.type==='multiple'){chosen.has(option.value)?chosen.delete(option.value):chosen.add(option.value)}else{chosen.clear();chosen.add(option.value)}buttons.forEach(([button,value])=>button.setAttribute('aria-pressed',String(chosen.has(value))))};buttons.push([b,option.value]);group.append(b)}
    const submit=el('button','提交答案');submit.type='button';submit.onclick=()=>{if(!chosen.size){feedback.textContent='请先选择答案';return}const actual=[...chosen].sort(),expected=[...(q.answer||[])].sort(),correct=JSON.stringify(actual)===JSON.stringify(expected);feedback.textContent=(correct?'回答正确。':'可以再听一次，比较你的判断。')+plain(q.analysis||'');store(key,{answer:actual,correct});void observe('quiz',{question:q.question,answer:actual,expected,correct}).then(()=>{if(!$('.classroom-question form button').disabled)discuss('请根据我刚才的测验回答继续教学。若答错，给一个可以通过重听检验的提示，必要时播放对应片段；若答对，请追问一句音乐证据，不重复整段讲解。')});};group.append(submit);
   }
   group.append(feedback);sheet.append(group);
  }
 }
 function project(scene){
  const p=scene.content.projectV2||{};sheet.append(el('h3',p.title||scene.title),el('p',p.description||''));if(p.learningObjective)sheet.append(el('p',p.learningObjective));
  const roles=el('div',null,'classroom-project-roles');for(const role of p.roles||[]){const button=el('button',role.name||role.title||role.id);button.type='button';button.dataset.projectRole=role.id||'';button.onclick=()=>{roles.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n===button)));discuss(`请以${role.name||role.title||'项目教练'}的身份指导当前小组项目。\n项目：${p.title}\n任务：${p.description||''}\n教学目标：${p.learningObjective||''}\n指导方式：${role.description||''}\n请先说明当前第一步怎么做，并提出一个具体问题，等待我的回答，不要一次讲完整个项目。`)};roles.append(button)}sheet.append(roles);
  for(const milestone of p.milestones||[]){const section=el('section',null,'classroom-project-stage');section.append(el('h4',milestone.title),el('p',milestone.briefing||milestone.description||''));
   for(const task of milestone.microtasks||[]){const block=el('div',null,'classroom-project-task'),answer=el('textarea'),key='classroom-project:'+course.id+':'+task.id;block.append(el('h4',task.title),el('p',task.learnerBrief||task.description||task.narration||''));if(task.completionCriteria||task.successWhen)block.append(el('p','评价依据：'+(task.completionCriteria||task.successWhen)));answer.rows=4;answer.placeholder='记录小组的想法、创作说明或作品链接';answer.value=saved(key)?.text||'';answer.oninput=()=>answer.setCustomValidity('');const save=el('button','保存小组记录');save.type='button';save.onclick=()=>{store(key,{text:answer.value,updatedAt:Date.now()});void observe('project',{taskId:task.id,task:task.title,answer:answer.value});save.textContent='已保存'};const evaluate=el('button','请教师反馈');evaluate.type='button';evaluate.onclick=()=>{if(!answer.value.trim()){answer.setCustomValidity('请先记录小组的想法，再请教师反馈');answer.reportValidity();answer.focus();return}answer.setCustomValidity('');discuss(`小组项目：${p.title}\n任务：${task.title}\n评价依据：${task.completionCriteria||task.successWhen||''}\n小组提交：${answer.value}\n请给予具体反馈，不伪称已经听过未提供的音乐作品。`)};block.append(answer,save,evaluate);section.append(block)}sheet.append(section);
  }
 }
 function display(){
  if(!course)return;
  const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value};
  if(!voice)setText(status,`《${course.title}》 · 第 ${course.start}—${course.end} 小节　${course.message}`);
  const percent=course.status==='complete'?100:Math.max(0,Math.min(100,Number(course.progress)||0));if(bar.value!==percent)bar.value=percent;$('.classroom-progress').hidden=false;setText($('.classroom-percent'),percent.toFixed(percent%1?1:0)+'%');const valueText=percent+'%，'+course.message;if(bar.getAttribute('aria-valuetext')!==valueText)bar.setAttribute('aria-valuetext',valueText);
  reportTask('omr-classroom-'+course.id,{kind:'classroom',scoreTitle:course.title,status:course.status==='generating'?'running':course.status,progress:course.progress,detail:course.message,label:'曲谱课堂'});
  const hideBody=!(course.scenes.length||course.outlines?.length);if($('.classroom-body').hidden!==hideBody)$('.classroom-body').hidden=hideBody;
  if(course.scenes.length&&planKey==='')config.open=false;
  const nextPlan=JSON.stringify([course.id,course.goal,course.lessonPlan,course.references]);
  if(nextPlan!==planKey){planKey=nextPlan;const plan=$('.classroom-plan div'),fragment=document.createDocumentFragment();if(course.lessonPlan){fragment.append(el('p',`${course.lessonPlan.audience}　${course.lessonPlan.duration} 分钟`),el('p',course.goal));for(const [key,label]of Object.entries({lessonType:'课型',learnerAnalysis:'学情',objectives:'教学目标',keyPoints:'重点',difficulties:'难点与帮助',preparation:'课堂准备',assessment:'课堂评价',differentiation:'分层支持'})){const value=course.lessonPlan[key];if(value){fragment.append(el('h4',label));for(const item of Array.isArray(value)?value:[value])fragment.append(el('p',String(item)))}}for(const step of course.lessonPlan.teachingSteps||[]){fragment.append(el('h4',step.title));for(const [key,label]of Object.entries({teacherPrompt:'教师',studentActivity:'学生',anticipatedResponse:'预想回应',followUp:'追问与帮助',evidence:'评价'}))if(step[key])fragment.append(el('p',label+'：'+step[key]))}for(const entry of course.lessonPlan.timeline||[])fragment.append(el('p',`${entry.title}　约 ${entry.minutes} 分钟`));}if(course.references){const refs=el('details',null,'classroom-references');refs.append(el('summary','教案参考'));refs.append(el('p',course.references.message));for(const source of course.references.sources||[]){const a=el('a',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';refs.append(a)}fragment.append(refs)}plan.replaceChildren(fragment);}
  const practiceHidden=course.mode==='classroom';if($('[data-act="practice"]').hidden!==practiceHidden)$('[data-act="practice"]').hidden=practiceHidden;
  const entries=course.outlines?.length?course.outlines:course.scenes;
  const nextChapters=course.id+':'+entries.map((entry,i)=>entry.id+':'+(course.scenes[i]?.phase|| (course.scenes[i]?'ready':'pending'))).join(',');
  if(chapterKey!==nextChapters){chapterKey=nextChapters;const fragment=document.createDocumentFragment();entries.forEach((entry,i)=>{const scene=course.scenes[i],b=el('button',`${String(i+1).padStart(2,'0')}  ${entry.title}${!scene?' · 待生成':scene.phase==='content'?' · 讲解准备中':''}`);b.type='button';b.disabled=!scene;b.onclick=()=>{stopVoice();index=i;remember();display()};fragment.append(b)});chapters.replaceChildren(fragment);}
  if(!course.scenes.length){setText(sheet,'正在生成第一个环节，完成后会在这里出现。');$('[data-act="voice"]').disabled=true;$('[data-act="next"]').disabled=true;return}
  index=Math.min(index,course.scenes.length-1);
  for(const [i,b]of [...chapters.children].entries()){const active=String(index===i);if(b.getAttribute('aria-current')!==active)b.setAttribute('aria-current',active)}
  $('[data-act="next"]').disabled=index>=course.scenes.length-1;
  updateLectureUI(course.scenes[index]);syncPresentationControls();
  const signature=course.id+':'+course.scenes[index].id+':'+(course.revision||0)+':'+(course.scenes[index].phase||'ready');
  if(rendered===signature)return;rendered=signature;
  const scene=course.scenes[index];actionView?.dispose();actionView=null;slideView?.dispose();slideView=null;sheet.replaceChildren(el('small',`环节 ${index+1} / ${course.outlines?.length||course.scenes.length}`));
  if(scene.content.type==='quiz'){sheet.append(el('h3',scene.title));quiz(scene)}
  else if(scene.content.type==='interactive'){const sceneId=scene.id;sheet.append(el('h3',scene.title),renderInteractive(scene.content,value=>{if(course?.scenes[index]?.id===sceneId){void observe('interactive',value).then(()=>{if(value.kind==='submission'&&course?.scenes[index]?.id===sceneId&&!$('.classroom-question form button').disabled)discuss('请根据刚才提交的互动活动记录给予反馈，指出一个需要再听或再试的地方；必要时定位对应小节播放。不要编造未观察到的操作。')});status.textContent='已记录课堂操作，可在课堂讨论中继续提问'}}))}
  else if(scene.content.type==='pbl')project(scene);
  else if(scene.content.canvas){slideView=renderSlide(scene.content.canvas);sheet.append(slideView.element)}
  transcriptKey='';updateLectureUI(scene);if(editor.open)fillEditor();
  $('.classroom-note').textContent='';
 }
 function updateLectureUI(scene){
  const pending=scene.phase==='content';$('[data-act="voice"]').disabled=pending;$('[data-act="skip-speech"]').disabled=pending;
  if(pending&&!voice)$('[data-act="voice"]').textContent='讲解准备中';else if(!voice)$('[data-act="voice"]').textContent='开始讲课';
  for(const n of sheet.querySelectorAll('[data-element-id]'))if((lessonActions(scene.actions||[],scene.content?.canvas?.elements||[])).some(a=>(a.type==='spotlight'||a.type==='laser')&&a.elementId===n.dataset.elementId)){n.tabIndex=0;n.setAttribute('role','button');n.setAttribute('aria-label','从这里开始讲解：'+(n.textContent||'本页内容').slice(0,60));}
  const key=course.id+':'+scene.id+':'+JSON.stringify(lessonActions(scene.actions||[],scene.content?.canvas?.elements||[]));if(key===transcriptKey)return;transcriptKey=key;
  const oldTranscript=$('.classroom-transcript');oldTranscript?.remove();const transcript=el('details',null,'classroom-transcript');transcript.append(el('summary','讲解内容'));for(const [cursor,action]of (lessonActions(scene.actions||[],scene.content?.canvas?.elements||[])).entries())if(action.type==='speech'){const jump=el('button',plain(action.text));jump.type='button';jump.onclick=()=>jumpLecture(cursor);transcript.append(jump)}caption.after(transcript);
  const speech=(lessonActions(scene.actions||[],scene.content?.canvas?.elements||[])).filter(a=>a.type==='speech').map(a=>a.text).filter(Boolean).join('\n');if(!voice&&!listening)caption.textContent=plain(speech);


 }
 function resetCourse(){chatController?.abort();remember();stopVoice();clearTimeout(timer);timer=null;course=null;index=0;history=[];rendered='';planKey=chapterKey=transcriptKey='';slideView?.dispose();slideView=null;actionView?.dispose();actionView=null;sheet.replaceChildren();$('.classroom-body').hidden=true;$('.classroom-progress').hidden=true;$('.classroom-chapters').replaceChildren();$('.classroom-plan div')?.replaceChildren();$('.classroom-note').textContent='';$('.classroom-dialogue').replaceChildren();$('.classroom-transcript')?.remove();caption.textContent='';}
 function syncScoreBinding(){const score=liveScore(),id=score?.serverId||null;if(id===boundScoreId)return;boundScoreId=id;if(openingFor===id)return;bindingVersion++;resetCourse();formScoreId=id;rangeDirty=false;form.elements.scope.value='whole';form.elements.scope.onchange();status.textContent=score?'《'+score.title+'》的曲谱课堂':'请先打开一首曲谱';const savedCourse=id&&saved('classroom-score:'+id);if(savedCourse)void open(savedCourse).catch(error=>{status.textContent=error.message});}
 document.addEventListener('practice-state',syncScoreBinding);
 function syncActivity(){for(const iframe of sheet.querySelectorAll('.classroom-interactive'))iframe.classroomVisibility?.(visible())}
 function visible(){return !document.hidden&&inViewport&&(!container||container.open)&&!root.closest('.workspace-panel')?.hidden}
 function schedulePoll(delay=2500){clearTimeout(timer);timer=null;if(course&&['queued','generating'].includes(course.status)&&visible())timer=setTimeout(poll,delay)}
 async function poll(){
  clearTimeout(timer);timer=null;if(!course||!visible())return;const id=course.id;if(pollingId===id)return;pollingId=id;
  try{const data=await request('/api/classroom?id='+id+(course.updatedAt?'&since='+course.updatedAt:''));if(course?.id!==id)return;if(!data.unchanged){course=data;if(visible())display()}schedulePoll()}
  catch(e){if(course?.id!==id)return;if(visible())status.textContent='同步课堂暂时中断：'+e.message;schedulePoll(5000)}finally{if(pollingId===id)pollingId=null}
 }
 const visibility=new IntersectionObserver(entries=>{inViewport=entries.some(e=>e.isIntersecting);syncActivity();if(visible()){display();schedulePoll(100)}else{clearTimeout(timer);timer=null}},{rootMargin:'250px'});visibility.observe(root);
 document.addEventListener('visibilitychange',()=>{syncActivity();if(visible())schedulePoll(100);else{clearTimeout(timer);timer=null}});

 form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;form.querySelector('[type=submit]').disabled=true;stopVoice();clearTimeout(timer);try{const score=liveScore();if(!score?.serverId)throw Error('请先从云曲库打开一首已识别的作品');if(score.generated)throw Error('请切回原谱后准备课堂，改编总谱暂不作为授课依据');if(formScoreId!==score.serverId&&!rangeDirty){form.elements.scope.value='whole';form.elements.scope.onchange()}formScoreId=score.serverId;rangeDirty=false;const data=Object.fromEntries(new FormData(form));data.materialIds=materialPicker.ids();data.useReferences=form.elements.useReferences.checked;data.features=['slides',...new FormData(form).getAll('features')];status.textContent='正在读取《'+score.title+'》并准备课程…';const version=bindingVersion;const created=await request('/api/classroom/create',{...data,scoreId:score.serverId});store('classroom-score:'+score.serverId,created.id);if(version!==bindingVersion||liveScore()?.serverId!==score.serverId)return;course=created;index=0;history=[];$('.classroom-dialogue').replaceChildren();rendered='';store('classroom-last',course.id);display();poll();}catch(error){status.textContent=error.message}finally{busy=false;form.querySelector('[type=submit]').disabled=false}};
 $('[data-act="export"]').onclick=()=>{if(course?.scenes.length){const a=document.createElement('a');a.href='/api/classroom/export?id='+course.id;a.download=course.title+'.pptx';a.click()}};
 $('[data-act="next"]').onclick=()=>{if(container.classList.contains('classroom-presentation')){turnPage(1);return}if(!course||index>=course.scenes.length-1)return;stopVoice();index++;remember();display()};
 function cancelListening(){if(!listening)return;const state=listening;listening=null;clearInterval(state.timer);state.resolve(false);if(livePlayer()===state.player){state.player.clearLoop();if(state.player.playing)void call('ai-transport',{command:'pause'}).catch(()=>{})}}
 async function listenToWork(action,token){
  status.textContent='正在准备课堂聆听…';
  if(liveScore()?.serverId!==course.scoreId||liveScore()?.generated)await call('ai-open-score',{id:course.scoreId},120000);
  if(token!==voiceToken)return false;sameScore();
  const measures=liveScore().events.map(event=>Number(event.measure)).filter(Number.isFinite);
  const start=action.wholeScore?Math.min(...measures):Number(action.startMeasure)||course.start,end=action.wholeScore?Math.max(...measures):Number(action.endMeasure)||course.end;
  const range=rangeOf(liveScore(),start,end);
  if(range.from!==start||range.to!==end)throw Error(`这段聆听指定第 ${start}—${end} 小节，但当前作品只有第 ${range.lowest}—${range.highest} 小节，请调整课堂范围`);
  await call('ai-seek-measure',{measure:start});if(token!==voiceToken)return false;
  const player=livePlayer();const seconds=Math.max(0,Number(action.seconds)||0);const endBeat=seconds&&player.timeAtBeat&&player.beatAtTime?Math.min(range.endBeat,player.beatAtTime(player.timeAtBeat(range.startBeat)+seconds)):range.endBeat;player.setLoop(range.startBeat,endBeat,{once:true});
  await call('ai-play-score',{},60000);if(token!==voiceToken){if(player===livePlayer()){player.clearLoop();if(player.playing)await call('ai-transport',{command:'pause'})}return false}
  $('[data-act="voice"]').textContent='暂停聆听';
  return new Promise((resolve,reject)=>{
   const state={player,resolve,paused:false,elapsed:0,last:Math.max(player.context?.currentTime||0,player.clockTime||0),timer:null};listening=state;
   const finish=async()=>{clearInterval(state.timer);if(listening!==state)return;listening=null;player.clearLoop();try{if(player.playing)await call('ai-transport',{command:'pause'});resolve(token===voiceToken)}catch(e){reject(e)}};
   state.timer=setInterval(()=>{
    if(token!==voiceToken){cancelListening();return}
    if(livePlayer()!==player||liveScore()?.serverId!==course.scoreId){cancelListening();status.textContent='曲谱已切换，课堂聆听已停止';return}
    const now=player.context?.currentTime||0;if(player.playing&&!state.paused)state.elapsed+=Math.max(0,now-state.last);state.last=Math.max(state.last,now);
    if(!state.paused&&((seconds&&state.elapsed>=seconds)||player.beat>=endBeat-.01||(!player.playing&&!player.loop))){void finish();return}
    status.textContent=state.paused?'聆听已暂停':`正在聆听《${course.title}》 · 第 ${start}—${end} 小节${seconds?' · 剩余 '+Math.max(0,Math.ceil(seconds-state.elapsed))+' 秒':''}`;
   },100);
  });
 }
 async function advanceLecture(token){
  const scene=course.scenes[index];actionView ||= classroomActions(sheet);
  const actions=lessonActions(scene.actions||[],scene.content?.canvas?.elements||[]);
  while(actionCursor<actions.length){
   if(token!==voiceToken)return;
   const action=actions[actionCursor++];
   if(['music-listen','listen','play_music'].includes(action.type)){try{if(!await listenToWork(action,token))return}catch(e){if(token===voiceToken){actionCursor--;livePlayer()?.clearLoop();$('[data-act="voice"]').textContent='重试聆听'}throw e}continue}
   if(action.type!=='speech'){if(await executeClassroomAction(action,actionHost(token))==='pause'){status.textContent='讨论后可继续讲课';$('[data-act="voice"]').textContent='继续讲课';return}continue}
   const text=plain(action.text);if(!text)continue;
   const previousCue=actions.slice(0,actionCursor).findLast(a=>a.type==='spotlight'||a.type==='laser');
   const region=speechRegion(text,scene.content?.canvas?.elements||[],previousCue?.elementId);
   actionView.apply({type:'spotlight',elementId:region});caption.textContent=text;status.textContent='正在准备这一段讲解…';
   for(let i=0;i<45;i++){
    if(token!==voiceToken)return;
    const r=await request('/api/tour-voice?locale=zh&text='+encodeURIComponent(text.slice(0,3000)));
    if(r.status==='failed')throw Error(r.message);
    if(r.status==='generating'&&r.message)status.textContent=r.message;
    if(r.status==='complete'){
     if(token!==voiceToken)return;voice=speaker;voice.src=r.url;voice.volume=1;voice.muted=false;voice.playbackRate=Number(speed.value);if(resumeTime){const offset=resumeTime;resumeTime=0;voice.addEventListener('loadedmetadata',()=>{voice.currentTime=Math.min(offset,Math.max(0,voice.duration-.1))},{once:true})}voice.onerror=()=>{status.textContent='讲解音频未能播放，请重试；错误代码 '+(voice?.error?.code||'未知');$('[data-act="voice"]').textContent='重试讲解'};
     voice.onended=()=>{voice=null;advanceLecture(token).catch(e=>{status.textContent=e.message;stopVoice()})};
     await voice.play();$('[data-act="voice"]').textContent='暂停讲解';status.textContent='正在讲解：'+scene.title;
     const next=actions.slice(actionCursor).find(a=>a.type==='speech');if(next)request('/api/tour-voice?locale=zh&text='+encodeURIComponent(plain(next.text).slice(0,3000))).catch(()=>{});
     return;
    }
    await new Promise(resolve=>setTimeout(resolve,1800));
   }
   actionCursor--;throw Error('这段讲解声音仍在生成，请稍后继续');
  }
  stopVoice();const next=course.scenes[index+1];
  if(continuousCheck.checked&&next?.type==='slide'&&scene.type==='slide'){index++;remember();display();$('[data-act="voice"]').click()}
  else status.textContent='本环节讲解结束，可以继续聆听、讨论或进入下一环节。';
 }
 $('[data-act="voice"]').onclick=async()=>{try{
  unlockSpeaker();const video=sheet.querySelector('video[data-classroom-playing]');if(video){if(video.paused){await video.play();$('[data-act="voice"]').textContent='暂停播放'}else{video.pause();$('[data-act="voice"]').textContent='继续播放'}return}if(materialAudio){if(materialAudio.paused){await materialAudio.play();$('[data-act="voice"]').textContent='暂停聆听'}else{materialAudio.pause();$('[data-act="voice"]').textContent='继续聆听'}return}if(listening){const state=listening;if(state.paused){state.last=state.player.context?.currentTime||0;await call('ai-play-score',{},60000);if(listening!==state)return;state.paused=false;$('[data-act="voice"]').textContent='暂停聆听'}else{state.paused=true;await call('ai-transport',{command:'pause'});$('[data-act="voice"]').textContent='继续讲课'}return}if(voice){if(voice.paused){if(livePlayer()?.playing)await call('ai-transport',{command:'pause'});await voice.play();$('[data-act="voice"]').textContent='暂停讲解'}else{voice.pause();$('[data-act="voice"]').textContent='继续讲解'}return}
  if(livePlayer()?.playing)await call('ai-transport',{command:'pause'});
  await advanceLecture(++voiceToken);
 }catch(e){if(e.name==='NotAllowedError'&&voice){status.textContent='音频已准备好，请再次点击继续讲解';$('[data-act="voice"]').textContent='继续讲解'}else{status.textContent=e.message;stopVoice()}}};
 async function showScore(){pauseLecture();nativePresentation=false;if(document.fullscreenElement===container)try{await document.exitFullscreen()}catch{}container.classList.remove('classroom-presentation');leave.hidden=true;present.hidden=false;previous.hidden=true;pageNumber.hidden=true;$('[data-act="next"]').textContent='下一环节 →';if(placeholder)fullscreen();container.open=false;back.hidden=false;document.querySelector('.workspace-nav [data-panel="play"]')?.click();document.querySelector('#sheet-scroll')?.scrollIntoView({behavior:'smooth',block:'start'});}
 $('[data-act="demo"]').onclick=async()=>{try{await showScore();if(liveScore()?.serverId!==course?.scoreId)await call('ai-open-score',{id:course.scoreId},120000);sameScore();if(livePlayer()?.playing){await call('ai-transport',{command:'pause'});return}const range=rangeOf(liveScore(),course.start,course.end);await call('ai-seek-measure',{measure:course.start});livePlayer().setLoop(range.startBeat,range.endBeat,{once:true});await call('ai-play-score',{},60000);status.textContent=`正在示范第 ${course.start}—${course.end} 小节`;}catch(e){status.textContent=e.message;const visibleStatus=document.querySelector('#play-status');if(visibleStatus)visibleStatus.textContent=e.message}};
 $('[data-act="practice"]').onclick=async()=>{try{sameScore();stopVoice();if(livePlayer()?.playing)await call('ai-transport',{command:'pause'});const state=await call('practice-command',{action:'fingering-context'});const result=await call('practice-command',{action:'configure',version:state.version,start:course.start,end:course.end,bpm:liveScore().tempo||80,rounds:1});if(result.error)throw Error(result.error);if(placeholder)fullscreen();const panel=root.closest('.workspace-page')?.querySelector('.practice-settings')||document.querySelector('.practice-settings');if(panel){panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'center'})}status.textContent='小节范围已设好，请点击「开始练习」开启麦克风。';}catch(e){status.textContent=e.message}};
 $('.classroom-question form').onsubmit=async e=>{
  e.preventDefault();const input=e.target.querySelector('input'),button=e.target.querySelector('button'),question=input.value.trim();if(!question||button.disabled||!course)return;
  button.disabled=true;pauseLecture();const version=bindingVersion,id=course.id,sceneId=course.scenes[index]?.id;chatController=new AbortController();const area=$('.classroom-dialogue'),reply=el('p','正在对照当前课件与课堂记录…');area.append(el('p',question,'classroom-user'),reply);let prompt=question;
  try{for(let round=0;round<3;round++){
   const response=await fetch('/api/classroom/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,sessionId,question:prompt,sceneIndex:index,role:$('.classroom-role').value,playback:{parts:liveScore()?.parts||liveScore()?.midiParts||[],beat:livePlayer()?.beat,playing:livePlayer()?.playing,selectedElement,whiteboard:actionView?.snapshot?.()||[]},history:history.slice(-8).map(t=>({...t,content:t.content.slice(0,1500)}))}),signal:AbortSignal.any([chatController.signal,AbortSignal.timeout(120000)])});
   if(!response.ok)throw Error((await response.json()).error);const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',answer='',actions=[],finished=false;
   const accept=event=>{if(event.error)throw Error(event.error);if(event.text){answer+=event.text;reply.textContent=answer}if(event.done){answer=event.answer||answer;reply.textContent=answer;actions=event.actions||[];finished=true}};
   while(!finished){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const rows=buffer.split('\n');buffer=rows.pop();for(const row of rows)if(row.trim())accept(JSON.parse(row));if(done){if(buffer.trim())accept(JSON.parse(buffer));break}}
   void reader.cancel();if(version!==bindingVersion||course?.id!==id)return;
   history.push({role:'user',content:prompt},{role:'assistant',content:answer});remember();if(!actions.length)break;
   stopVoice();const host=actionHost(),results=[];
   for(const [i,action]of actions.entries()){
    if(!host.current())return;status.textContent=`正在执行课堂操作 ${i+1}/${actions.length}：${action.title||action.type}`;
    try{const value=await executeClassroomAction(action,host);results.push({action,result:value??{ok:true}});if(value==='pause')break}catch(error){results.push({action,error:error.message});break}
   }
   if(!host.current())return;await observe('execution',{question,results});
   if(round===2){reply.append(el('p','本轮操作已结束，可继续提问。'));break}
   prompt='刚才课堂操作的真实结果：'+JSON.stringify(results).slice(0,1200)+'。请根据结果继续回答原问题；成功的动作不要重复，失败的动作可以纠正一次，不要假称已完成。';
  }input.value='';status.textContent='';
  }catch(error){if(error.name!=='AbortError'&&version===bindingVersion)reply.textContent+='\n'+error.message}finally{button.disabled=false}
 };
 document.addEventListener('practice-state',e=>{if(!course||liveScore()?.serverId!==course.scoreId){const measures=e.detail.measures||[];if(measures.length)form.elements.end.value=Math.min(8,Math.max(...measures));}if(course&&e.detail.complete&&liveScore()?.serverId===course.scoreId){$('.classroom-note').textContent='本轮练习完成，可以回到课堂回顾难点，或再听一遍示范。'}});
 root.closest('details')?.addEventListener('toggle',e=>{syncActivity();if(!e.target.open){pauseLecture();clearTimeout(timer);timer=null}else{display();schedulePoll(100)}});
 async function open(id,loadScore=false){if(course?.id===id&&(!liveScore()?.serverId||liveScore().serverId===course.scoreId)){display();schedulePoll(100);return}stopVoice();clearTimeout(timer);const version=++bindingVersion,currentId=liveScore()?.serverId;const next=await request('/api/classroom?id='+id);if(version!==bindingVersion)return;if(loadScore&&liveScore()?.serverId!==next.scoreId){openingFor=next.scoreId;try{await call('ai-open-score',{id:next.scoreId},120000)}finally{openingFor=null}}if(version!==bindingVersion)return;if(liveScore()?.serverId&&liveScore().serverId!==next.scoreId){resetCourse();status.textContent='《'+liveScore().title+'》的曲谱课堂';return}course=next;boundScoreId=liveScore()?.serverId||null;store('classroom-score:'+course.scoreId,course.id);const position=saved('classroom-position:'+id)||{};index=position.index||0;history=position.history||[];resumeTime=Number(position.time)||0;actionCursor=Math.max(0,(Number(position.actionCursor)||0)-(resumeTime>0?1:0));$('.classroom-dialogue').replaceChildren(...history.map(t=>el('p',t.content,t.role==='user'?'classroom-user':'')));rendered='';form.elements.goal.value=course.goal;form.elements.start.value=course.start;form.elements.end.value=course.end;form.elements.level.value=course.level;form.elements.mode.value=course.mode||'piano';form.elements.schoolStage.value=course.schoolStage||'senior';form.elements.useReferences.checked=course.useReferences!==false;form.elements.duration.value=course.duration||45;formScoreId=course.scoreId;rangeDirty=false;form.elements.scope.value=course.scope||'range';form.elements.scope.onchange();for(const box of form.querySelectorAll('[name=features]'))box.checked=(course.features||['slides','quiz']).includes(box.value);store('classroom-last',id);display();poll();}
 const last=saved('classroom-last');if(last)open(last).catch(()=>{});
 return {open,expand(){if(container&&!placeholder)fullscreen()}};
}
