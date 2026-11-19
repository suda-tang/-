import {resourceId} from './resource-id.js';
import {speechQueue} from './classroom-speech-queue.js';
import {scoreMeasureCount,classroomGoal} from './classroom-setup.js';
import {abortTimeout} from './abort-timeout.js';
import {lessonActions,speechRegion} from './classroom-listening.js';
import {liveScore,livePlayer} from './capability-host.js';
import {rangeOf} from './ai-advanced-actions.js';
import {reportTask} from './task-center.js?v=home-attach3';
import {renderSlide,renderInteractive,classroomActions} from './classroom-slides.js';
import {mountMaterials} from './classroom-materials.js';
import {mountTeachingStage} from './classroom-stage.js';
import {executeClassroomAction} from './classroom-engine.js';
const call=(name,detail={},timeout=12000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('工作区暂未响应，请等待曲谱载入')),timeout);document.dispatchEvent(new CustomEvent(name,{detail:{...detail,resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}}}));});
const plain=value=>{const body=new DOMParser().parseFromString(String(value||''),'text/html').body;body.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));body.querySelectorAll('p,li,h1,h2,h3').forEach(n=>n.append('\n'));return(body.textContent||'').replace(/[\p{Extended_Pictographic}\uFE0F]/gu,'').replace(/\n{3,}/g,'\n\n').trim()};
const disclosureArrow=summary=>{const existing=summary.querySelector('.classroom-disclosure-arrow');if(existing)return existing;const arrow=document.createElement('span');arrow.className='classroom-disclosure-arrow';arrow.setAttribute('aria-hidden','true');summary.append(arrow);return summary};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;if(tag==='summary')disclosureArrow(n);return n};
import {classroomRequest,classroomNetworkError} from './classroom-request.js';
const request=classroomRequest;
export function mountClassroom(root){
 root.innerHTML=`<div class="classroom-heading"><h3>音乐课堂</h3></div><form class="classroom-setup"><label>教学要求<textarea name="goal" rows="3" maxlength="1500">从高中音乐鉴赏课堂的视角教这首作品，安排聆听、讨论和小组创作，学生不需要会弹钢琴。</textarea></label><div class="classroom-fields"><label>教学场景<select name="mode"><option value="classroom">中小学音乐课堂</option><option value="piano">钢琴教学</option></select></label><label class="classroom-school-stage">学段<select name="schoolStage"><option value="primary">小学</option><option value="junior">初中</option><option value="senior" selected>高中</option></select></label><label>学习者<input name="level" value="高中一年级"></label><label>课时<select name="duration"><option value="20">20 分钟</option><option value="35">35 分钟</option><option value="40">40 分钟</option><option value="45" selected>45 分钟</option><option value="90">90 分钟</option></select></label><label>作品范围<select name="scope"><option value="whole">全曲</option><option value="range">指定小节</option></select></label><label>起始小节<input name="start" type="number" min="1" value="1" required disabled></label><label>结束小节<input name="end" type="number" min="1" value="8" required disabled></label></div><div class="classroom-options"><label><input type="checkbox" value="slides" checked disabled>PPT 课件</label><label><input name="features" type="checkbox" value="quiz" checked>课堂测验</label><label><input name="features" type="checkbox" value="interactive" checked>互动活动</label><label><input name="features" type="checkbox" value="pbl" checked>小组项目</label><label><input name="useReferences" type="checkbox" checked>联网参考教案</label><button type="submit">生成课程</button></div></form><div class="classroom-status" role="status"></div><div class="classroom-progress" hidden><progress max="100" value="0" aria-label="课程生成进度"></progress><output class="classroom-percent" aria-live="polite">0%</output></div><div class="classroom-body" hidden><details class="classroom-plan"><summary>教学安排</summary><div></div></details><nav class="classroom-chapters" aria-label="课程环节"></nav><article class="classroom-sheet"></article><div class="classroom-tools"><button data-act="voice">开始讲课</button><button data-act="demo">聆听作品</button><button data-act="practice">演奏练习</button><button data-act="next">下一环节 →</button><button data-act="export">导出 PPT</button></div><p class="classroom-caption" aria-live="polite"></p><details class="classroom-question"><summary>课堂讨论</summary><label>对话对象<select class="classroom-role"><option value="teacher">音乐教师</option><option value="student">模拟同学</option></select></label><div class="classroom-dialogue" aria-live="polite"></div><form><input aria-label="课堂问题" placeholder="输入课堂问题或分享聆听感受" maxlength="1500" required><button>发送</button></form></details><p class="classroom-note"></p></div>`;
 const $=s=>root.querySelector(s),form=$('.classroom-setup'),status=$('.classroom-status'),bar=$('progress'),sheet=$('.classroom-sheet'),chapters=$('.classroom-chapters'),caption=$('.classroom-caption');
 let course=null,index=0,timer=null,voice=null,voiceToken=0,history=[],rendered='',busy=false,slideView=null,actionView=null,actionCursor=0,speaker=new Audio(),speakerReady=false,resumeTime=0,listening=null,formScoreId=null,rangeDirty=false,planKey='',chapterKey='',transcriptKey='',pollingId=null,inViewport=true,bindingVersion=0,boundScoreId=liveScore()?.serverId||null,openingFor=null;
 let sessionId;try{sessionId=localStorage.getItem('classroom-session');}catch{}if(!sessionId){sessionId=resourceId();try{localStorage.setItem('classroom-session',sessionId);}catch{}}
 const materialPicker=mountMaterials(form,{score:liveScore,request,onStatus:text=>status.textContent=text});
 const speech=speechQueue(request);const illustratedCourses=new Set();
 const speechUrl=(text,role='teacher')=>'/api/tour-voice?locale=zh&role='+(role==='teacher'?'classroom-teacher':role)+'&text='+encodeURIComponent(plain(text).slice(0,3000));
 function prepareNext(actions){const next=actions.slice(actionCursor).find(a=>a.type==='speech');if(next)void speech.prepare(speechUrl(next.text,/student|同学/.test(next.agentId||next.speaker||'')?'student':/assistant|助教/.test(next.agentId||next.speaker||'')?'assistant':'teacher')).catch(()=>{});}
 let selectedElement=null,materialAudio=null,chatController=null,cancelActionAudio=null,discussionPosition=null;
 const teachingStage=mountTeachingStage(sheet,{ask:async(topic,mode='ask')=>{const position=discussionPosition;teachingStage.set('discussion',topic,'student');const selector=$('.classroom-role'),prior=selector.value;selector.value='student';try{await discuss((mode==='groups'?'请模拟两组同学分别提出不同判断，每组提供音乐证据并向另一组追问。':mode==='review'?'请对当前会话已记录的真实作答进行同伴互评，没有作答时先邀请用户回答，禁止虚构答案。':'作为模拟同学围绕当前课堂讨论问题发言：')+topic+'。用学生的口吻说出自己的判断和不确定之处，不虚构真实学生表现。请使用speech动作朗读这段模拟发言，再等待来访者回应，不要自行推进后续页。','student')}finally{selector.value=prior;if(position&&course?.id===position.id&&index===position.index){actionCursor=position.cursor;discussionPosition=position}}},continueLesson:()=>{if(discussionPosition&&course?.id===discussionPosition.id&&index===discussionPosition.index)actionCursor=discussionPosition.cursor;discussionPosition=null;$('.teaching-interaction').hidden=true;$('[data-act=voice]').click()}});
 async function observe(kind,value){if(!course)return;const id=course.id,sceneId=course.scenes[index]?.id;if(!sceneId)return;try{const response=await request('/api/classroom/event',{id,sceneId,sessionId,kind,value});if(course?.id===id)course.observations=response.observations}catch(error){status.textContent='课堂记录未保存：'+error.message}}
 function actionHost(token=voiceToken){const id=course?.id,version=bindingVersion;return {call,score:liveScore,player:livePlayer,current:()=>course?.id===id&&bindingVersion===version&&voiceToken===token,listen:action=>listenToWork(action,token),visual:()=>actionView ||= classroomActions(sheet),jump:async target=>{if(!course.scenes[target])throw Error('课堂页码无效');index=target;rendered='';display();remember()},speak:text=>speakAction(text,token),playMaterial:async materialId=>{if(!course.materials?.some(m=>m.id===materialId&&m.playable))throw Error('此材料未绑定到当前课堂');materialAudio?.pause();const audio=new Audio('/api/classroom/material-file?id='+encodeURIComponent(materialId));materialAudio=audio;return new Promise((resolve,reject)=>{const finish=(error)=>{cancelActionAudio=null;materialAudio=null;error?reject(error):resolve({played:true})};cancelActionAudio=()=>finish();audio.onended=()=>finish();audio.onerror=()=>finish(Error('聆听素材无法解码，请使用MP3或WAV'));audio.play().catch(finish)})}}}
 async function speakAction(text,token){
  const role=$('.classroom-role').value==='student'?'student':'teacher';teachingStage.set('preparing',role==='student'?'同学准备发言':'正在准备讲解',role);
  caption.textContent=plain(text);for(let attempt=0;attempt<100;attempt++){
   if(token!==voiceToken)throw Error('课堂播放已停止');
   const result=await request('/api/tour-voice?locale=zh&role='+(role==='teacher'?'classroom-teacher':role)+'&text='+encodeURIComponent(plain(text).slice(0,3000)));
   if(result.status==='failed')throw Error(result.message);
   if(result.status==='complete'&&result.url){const audio=speaker;voice=audio;audio.src=result.url;audio.onplaying=()=>{if(token===voiceToken&&!audio.paused&&audio.currentTime>=.05)teachingStage.followAudio(audio,plain(text),role);};audio.ontimeupdate=()=>{if(teachingStage.node.dataset.state!=='speech')audio.onplaying?.();};audio.onwaiting=audio.onstalled=()=>{if(token===voiceToken)teachingStage.set('preparing','讲解音频正在缓冲',role);};audio.playbackRate=Number(speed.value)||1;return new Promise((resolve,reject)=>{const finish=error=>{cancelActionAudio=null;voice=null;error?reject(error):resolve({spoken:true})};cancelActionAudio=()=>finish();audio.onended=()=>finish();audio.onerror=()=>finish(Error('讲解声音无法播放'));audio.play().catch(finish)})}
   await new Promise(resolve=>setTimeout(resolve,600));
  }throw Error('讲解声音仍在生成，请稍后继续');
 }
 const editor=el('details',null,'classroom-editor');editor.append(el('summary','修改当前课件'));const editTarget=document.createElement('select'),editText=el('textarea'),saveEdit=el('button','保存修改');editText.rows=5;saveEdit.type='button';editor.append(editTarget,editText,saveEdit);$('.classroom-sheet').after(editor);
 function fillEditor(){editTarget.replaceChildren();const scene=course?.scenes[index];for(const e of scene?.content?.canvas?.elements||[])if(e.type==='text'){const option=el('option',plain(e.content).slice(0,50));option.value='element:'+e.id;editTarget.append(option)}for(const [i,a]of (scene?.actions||[]).entries())if(a.type==='speech'){const option=el('option','讲解：'+plain(a.text).slice(0,40));option.value='speech:'+i;editTarget.append(option)}if(selectedElement&&[...editTarget.options].some(o=>o.value==='element:'+selectedElement))editTarget.value='element:'+selectedElement;editTarget.onchange()}
 editTarget.onchange=()=>{const [kind,...rest]=editTarget.value.split(':');const id=rest.join(':');const scene=course?.scenes[index];editText.value=kind==='element'?plain(scene?.content?.canvas?.elements.find(e=>e.id===id)?.content):scene?.actions[Number(id)]?.text||''};editor.addEventListener('click',event=>{if(event.target.closest('summary'))fillEditor()});
 sheet.addEventListener('click',event=>{selectedElement=event.target.closest('[data-element-id]')?.dataset.elementId||selectedElement});
 saveEdit.onclick=async()=>{if(!course)return;saveEdit.disabled=true;try{const id=course.id,sceneId=course.scenes[index]?.id,[kind,...rest]=editTarget.value.split(':'),key=rest.join(':');stopVoice();const changed=await request('/api/classroom/edit',{id,sceneId,revision:course.revision||0,change:kind==='element'?{kind:'element-text',elementId:key,text:editText.value}:{kind:'speech',cursor:Number(key),text:editText.value}});if(course?.id!==id)return;course=changed;rendered='';planKey=transcriptKey='';display();status.textContent='修改已保存';}catch(error){status.textContent=error.message}finally{saveEdit.disabled=false}};
 const addPictures=el('button','补充课件图片');addPictures.type='button';editor.append(addPictures);addPictures.onclick=async()=>{if(!course)return;addPictures.disabled=true;const id=course.id;try{const result=await request('/api/classroom/illustrate',{id});if(course?.id!==id)return;course=result;display();schedulePoll(300)}catch(error){status.textContent=error.message}finally{addPictures.disabled=false}};
 const editInstruction=el('textarea'),revise=el('button','按要求修改');editInstruction.rows=2;editInstruction.placeholder='例如：改成适合初中生的提问，保留音乐证据';revise.type='button';editor.append(editInstruction,revise);revise.onclick=async()=>{if(!course||!editTarget.value)return;revise.disabled=true;const id=course.id,sceneId=course.scenes[index].id,target=editTarget.value;try{status.textContent='正在修改选中的一段…';const result=await request('/api/classroom/revise',{id,sceneId,text:editText.value,instruction:editInstruction.value},{timeout:120000});if(course?.id!==id||course.scenes[index]?.id!==sceneId||editTarget.value!==target)return;editText.value=result.text;status.textContent='已修改，可继续编辑或保存';}catch(error){status.textContent=error.message}finally{revise.disabled=false}};
 for(const name of ['scope','start','end'])form.elements[name].addEventListener('change',()=>{rangeDirty=true});
 form.elements.scope.onchange=()=>{const whole=form.elements.scope.value==='whole';form.elements.start.disabled=whole;form.elements.end.disabled=whole;if(whole){form.elements.start.value=1;form.elements.end.value=scoreMeasureCount(liveScore())}};
 const stageText={primary:'小学',junior:'初中',senior:'高中'};
 form.elements.schoolStage.onchange=()=>{const stage=stageText[form.elements.schoolStage.value];form.elements.level.value={primary:'小学三年级',junior:'初中一年级',senior:'高中一年级'}[form.elements.schoolStage.value];};
 form.elements.mode.onchange=()=>{const school=form.elements.mode.value==='classroom';$('.classroom-school-stage').hidden=!school;if(school)form.elements.schoolStage.onchange();else{form.elements.level.value='中级';}};
 let goalEdited=false;
 form.elements.goal.addEventListener('input',()=>{goalEdited=true});
 function refreshGoal(){if(goalEdited)return;const values=Object.fromEntries(new FormData(form));values.start=form.elements.start.value;values.end=form.elements.end.value;values.features=new FormData(form).getAll('features');form.elements.goal.value=classroomGoal(liveScore(),values)}
 for(const field of ['scope','start','end','schoolStage','mode','duration','level'])form.elements[field].addEventListener('change',refreshGoal);
 for(const field of form.querySelectorAll('[name=features]'))field.addEventListener('change',refreshGoal);
 form.elements.scope.onchange();refreshGoal();
 const container=root.closest('details'),expand=el('button','全屏课堂');expand.type='button';expand.className='classroom-expand';$('.classroom-heading').append(expand);let placeholder=null,morphing=null,scoreExcursion=0;
 root.querySelectorAll('summary').forEach(disclosureArrow);
 const config=el('details',null,'classroom-config'),configLabel=el('summary','课程设置');form.before(config);config.append(configLabel,form);config.open=true;
 const sidebar=el('aside',null,'classroom-sidebar');sidebar.setAttribute('aria-label','课程安排与讨论');root.append(sidebar);sidebar.append(config,$('.classroom-plan'),$('.classroom-question'));
 const continuous=el('label',null,'classroom-continuous'),continuousCheck=document.createElement('input');continuousCheck.type='checkbox';continuousCheck.checked=true;continuous.append(continuousCheck,' 连续讲解，到提问时停下');$('.classroom-tools').after(continuous);
 function animateMorph(from,to,closing=false){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!from.width||!from.height||!to.width||!to.height)return Promise.resolve();
  const base=to,dx=to.left+to.width/2-from.left-from.width/2,dy=to.top+to.height/2-from.top-from.height/2;
  const frames=[];
  // A monotonic path cannot overshoot or reverse as the panel settles.
  const direction=Math.sign(dx)||1;
  for(let i=0;i<=48;i++){
   const t=i/48,p=t*t*t*(10+t*(-15+6*t)),energy=16*t*t*(1-t)*(1-t);
   const width=from.width+(to.width-from.width)*p,height=from.height+(to.height-from.height)*p;
   const x=from.left+from.width/2+dx*p-base.left-base.width/2,y=from.top+from.height/2+dy*p-base.top-base.height/2;
   const sx=width/base.width,sy=height/base.height;
   // Compensate perspective magnification so the surface lands exactly in its slot.
   const z=energy*(closing?18:24),depth=1-z/1600;
   const radius=(closing?28-4*p:24+4*p)+energy*24;
   frames.push({offset:t,transform:`perspective(1600px) translate3d(${x}px,${y}px,${z}px) rotateX(${energy*(closing?1.2:-1.2)}deg) rotateY(${energy*direction*(closing?-1.8:1.8)}deg) scale(${sx*depth},${sy*depth})`,borderRadius:`${radius/Math.max(.1,sx)}px / ${radius/Math.max(.1,sy)}px`,boxShadow:`0 ${10+energy*30}px ${28+energy*65}px rgba(48,32,50,${.12+energy*.12})`});
  }
  container.style.transformOrigin='center center';container.classList.add('classroom-morphing');
  const animation=container.animate(frames,{duration:closing?540:590,easing:'linear',fill:'both'});
  return animation.finished.catch(()=>{}).finally(()=>{animation.cancel();container.classList.remove('classroom-morphing');container.style.transformOrigin=''});
 }
 function fullscreen({collapse=false}={}){
  if(morphing)return morphing;
  if(placeholder){
   const home=placeholder,from=container.getBoundingClientRect();
   // Restore the destination layout before animating, so the last frame does
   // not switch from a scaled fullscreen grid to the inline classroom layout.
   home.replaceWith(container);placeholder=null;if(collapse)container.open=false;
   container.classList.remove('classroom-fullscreen');container.scrollTop=0;
   expand.classList.remove('classroom-minimize');headingActions.append(expand);
   expand.textContent='全屏课堂';expand.setAttribute('aria-label','全屏课堂');expand.title='全屏课堂';expand.setAttribute('aria-expanded','false');
   const parents=[];for(let parent=container.parentElement;parent&&parent!==document.body;parent=parent.parentElement){parent.classList.add('classroom-return-parent');parents.push(parent)}
   const to=container.getBoundingClientRect();
   morphing=animateMorph(from,to,true).finally(()=>{parents.forEach(parent=>parent.classList.remove('classroom-return-parent'));morphing=null});
  }else{
   container.open=true;const from=container.getBoundingClientRect();back.hidden=true;placeholder=document.createElement('div');placeholder.className='classroom-home-slot';placeholder.style.height=from.height+'px';container.before(placeholder);document.body.append(container);container.classList.add('classroom-fullscreen');headingActions.append(expand);expand.classList.add('classroom-minimize');expand.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';expand.setAttribute('aria-label','收起课堂');expand.title='收起课堂';expand.setAttribute('aria-expanded','true');
   morphing=animateMorph(from,container.getBoundingClientRect()).finally(()=>{morphing=null});
  }
  return morphing;
 }
 expand.onclick=async()=>{if(morphing)return;container.classList.remove('classroom-presentation');await fullscreen()};
 const agentLaunch=el('button','AI','classroom-agent-launch');agentLaunch.type='button';agentLaunch.setAttribute('aria-label','打开 AI 对话');agentLaunch.onclick=()=>document.querySelector('#workspace-ai')?.onclick?.({origin:agentLaunch});const headingActions=el('div',null,'classroom-heading-actions');headingActions.append(agentLaunch,expand);$('.classroom-heading').append(headingActions);
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
  presentationWasExpanded=!!placeholder;if(!placeholder)await fullscreen();else if(morphing)await morphing;
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
 function unlockSpeaker(){void livePlayer()?.unlock?.().then(()=>livePlayer()?.loadSamples?.()).catch(()=>{});void call('ai-prepare-score',{id:course?.scoreId},60000).catch(()=>{});if(speakerReady)return;speakerReady=true;speaker.src='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';speaker.play().then(()=>{if(speaker.src.startsWith('data:'))speaker.pause()}).catch(()=>{})}
 function stopVoice(){speaker.onplaying=speaker.ontimeupdate=speaker.onwaiting=speaker.onstalled=speaker.onended=speaker.onerror=null;scorePause.hidden=true;teachingStage.stop();sheet.querySelectorAll('video[data-classroom-playing]').forEach(video=>video.dispatchEvent(new Event('classroom-cancel')));voice?.pause();materialAudio?.pause();cancelActionAudio?.();cancelActionAudio=null;materialAudio=null;cancelListening();actionCursor=0;voiceToken++;if(voice){voice.pause();voice=null}resumeTime=0;$('[data-act="voice"]').textContent='开始讲课';}
 function sameScore(){if(liveScore()?.serverId!==course?.scoreId)throw Error('当前曲谱已切换，请先打开这堂课对应的《'+course.title+'》');if(liveScore()?.generated)throw Error('当前显示的是改编总谱，请切回原谱后使用这堂课的示范与练习');}
 function remember(){if(course)store('classroom-position:'+course.id,{index,history,actionCursor,time:voice?.currentTime||resumeTime});}
 function pauseLecture(){const video=sheet.querySelector('video[data-classroom-playing]');if(video){video.pause();$('[data-act="voice"]').textContent='继续播放';return}if(materialAudio){materialAudio.pause();$('[data-act="voice"]').textContent='继续聆听';return}if(listening){listening.paused=true;if(livePlayer()?.playing)void call('ai-transport',{command:'pause'}).catch(()=>{});$('[data-act="voice"]').textContent='继续讲课';remember();return}if(voice){voice.pause();$('[data-act="voice"]').textContent='继续讲解'}else if(actionCursor){voiceToken++;actionCursor=Math.max(0,actionCursor-1)}remember()}
 speaker.addEventListener('waiting',()=>{if(voice===speaker)status.textContent='讲解音频正在缓冲…'});
 speaker.addEventListener('stalled',()=>{if(voice===speaker)status.textContent='讲解音频下载暂时停滞，正在等待连接恢复…'});
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
 const scorePause=el('button','暂停聆听','classroom-score-pause');scorePause.type='button';scorePause.hidden=true;document.body.append(scorePause);scorePause.onclick=async()=>{await $('[data-act=voice]').onclick();scorePause.textContent=listening?.paused?'继续聆听':'暂停聆听'};
 function discuss(question,role='teacher'){$('.classroom-question').open=true;$('.classroom-role').value=role;$('.classroom-question input').value=question.slice(0,1500);const form=$('.classroom-question form');$('.classroom-question').scrollIntoView({behavior:'smooth',block:'nearest'});return form.onsubmit({preventDefault(){},target:form})}
 function quiz(scene){
  for(const q of scene.content.questions||[]){
   const group=el('fieldset'),feedback=el('p');group.append(el('legend',q.question));
   const key='classroom-answer:'+course.id+':'+q.id,previous=saved(key),chosen=new Set(previous?.answer||[]);
   if(q.type==='short_answer'||!(q.options||[]).length){const answer=el('textarea');answer.rows=4;answer.placeholder='写下你的理解，并说明听到了什么';answer.value=previous?.text||'';const submit=el('button','提交并讨论');submit.type='button';submit.onclick=()=>{if(!answer.value.trim())return;store(key,{text:answer.value});void observe('short-answer',{question:q.question,answer:answer.value});discuss(`课堂问题：${q.question}\n我的回答：${answer.value}\n请从当前音乐课堂的教学目标出发给予反馈，指出证据是否充分。`)};group.append(answer,submit);}
   else{
    const buttons=[];for(const option of q.options){const b=el('button',`${option.value}. ${plain(option.label||option.text||option.content)}`);b.type='button';b.setAttribute('aria-pressed',String(chosen.has(option.value)));b.onclick=()=>{if(q.type==='multiple'){chosen.has(option.value)?chosen.delete(option.value):chosen.add(option.value)}else{chosen.clear();chosen.add(option.value)}buttons.forEach(([button,value])=>button.setAttribute('aria-pressed',String(chosen.has(value))))};buttons.push([b,option.value]);group.append(b)}
    const submit=el('button','提交答案');submit.type='button';submit.onclick=()=>{if(!chosen.size){feedback.textContent='请先选择答案';return}const actual=[...chosen].sort(),expected=[...(q.answer||[])].sort(),correct=JSON.stringify(actual)===JSON.stringify(expected);teachingStage.set('quiz',q.question,'assistant');feedback.textContent=(correct?'回答正确。':'可以再听一次，比较你的判断。')+plain(q.analysis||'');store(key,{answer:actual,correct});void observe('quiz',{question:q.question,answer:actual,expected,correct}).then(()=>{if(!$('.classroom-question form button').disabled)discuss('请根据我刚才的测验回答继续教学。若答错，给一个可以通过重听检验的提示，必要时播放对应片段；若答对，请追问一句音乐证据，不重复整段讲解。')});};group.append(submit);
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
  if(visible()&&['complete','failed'].includes(course.status)&&course.imagesStatus!=='running'&&!illustratedCourses.has(course.id)&&course.scenes.some(s=>s.type==='slide')&&course.imagesDesignVersion!=='rich-20-web'){
   const id=course.id;illustratedCourses.add(id);
   void request('/api/classroom/illustrate',{id}).then(next=>{if(course?.id===id){course=next;display();schedulePoll(300)}}).catch(error=>{if(course?.id===id)status.textContent='课件插图补充未完成：'+error.message});
  }
  if(visible()){const actions=lessonActions(course.scenes[index]?.actions||[],course.scenes[index]?.content?.canvas?.elements||[]);prepareNext(actions);}
  const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value};
  if(!voice)setText(status,`《${course.title}》 · 第 ${course.start}—${course.end} 小节　${course.imagesStatus==='running'?course.imagesMessage:course.message}`);
  const percent=course.status==='complete'?100:Math.max(0,Math.min(100,Number(course.progress)||0));if(bar.value!==percent)bar.value=percent;$('.classroom-progress').hidden=false;setText($('.classroom-percent'),percent.toFixed(percent%1?1:0)+'%');const valueText=percent+'%，'+course.message;if(bar.getAttribute('aria-valuetext')!==valueText)bar.setAttribute('aria-valuetext',valueText);
  reportTask('omr-classroom-'+course.id,{kind:'classroom',scoreTitle:course.title,status:course.status==='generating'?'running':course.status,progress:course.progress,detail:course.message,label:'曲谱课堂'});
  const hideBody=!(course.scenes.length||course.outlines?.length);if($('.classroom-body').hidden!==hideBody)$('.classroom-body').hidden=hideBody;
  if(course.scenes.length&&planKey==='')config.open=false;
  const nextPlan=JSON.stringify([course.id,course.goal,course.lessonPlan,course.references]);
  if(nextPlan!==planKey){planKey=nextPlan;const plan=$('.classroom-plan div'),fragment=document.createDocumentFragment();if(course.lessonPlan){fragment.append(el('p',`${course.lessonPlan.audience}　${course.lessonPlan.duration} 分钟`),el('p',course.goal));for(const [key,label]of Object.entries({lessonType:'课型',learnerAnalysis:'学情',objectives:'教学目标',keyPoints:'重点',difficulties:'难点与帮助',preparation:'课堂准备',assessment:'课堂评价',differentiation:'分层支持'})){const value=course.lessonPlan[key];if(value){fragment.append(el('h4',label));for(const item of Array.isArray(value)?value:[value])fragment.append(el('p',String(item)))}}for(const step of course.lessonPlan.teachingSteps||[]){fragment.append(el('h4',step.title));for(const [key,label]of Object.entries({teacherPrompt:'教师',studentActivity:'学生',anticipatedResponse:'预想回应',followUp:'追问与帮助',evidence:'评价'}))if(step[key])fragment.append(el('p',label+'：'+step[key]))}for(const entry of course.lessonPlan.timeline||[])fragment.append(el('p',`${entry.title}　约 ${entry.minutes} 分钟`));}if(course.references){const refs=el('details',null,'classroom-references');refs.append(el('summary','教案参考'));refs.append(el('p',course.references.message));const retry=el('button',course.references.loading?'正在检索…':'重新检索教案');retry.type='button';retry.disabled=!!course.references.loading||course.status!=='complete';retry.onclick=async()=>{retry.disabled=true;const id=course.id;try{const next=await request('/api/classroom/references-retry',{id});if(course?.id!==id)return;course=next;display();schedulePoll(300)}catch(error){status.textContent=error.message;retry.disabled=false}};refs.append(retry);for(const diagnostic of course.references.diagnostics||[]){const verification=diagnostic.verification;if(verification?.id&&verification.image){const form=el('form',null,'classroom-verification'),image=el('img'),input=el('input'),submit=el('button','验证并继续'),message=el('p',verification.detail);image.src=verification.image;image.alt='网站验证码';image.style.maxWidth='100%';input.placeholder='输入验证码';input.setAttribute('aria-label','验证码');input.maxLength=20;input.required=true;submit.type='submit';form.append(message,image,input,submit);form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;const id=course.id;try{await request('/api/workspace-ai/web',{mode:'verification',id:verification.id,code:input.value});if(course?.id!==id)return;course=await request('/api/classroom/references-retry',{id});display();schedulePoll(300)}catch(error){message.textContent=error.message;submit.disabled=false}};refs.append(form)}const target=diagnostic.verification?.url;if(target&&/^https:\/\/(www\.so\.com|www\.sogou\.com|www\.bing\.com|cn\.bing\.com)\//.test(target)){const link=el('a','打开'+diagnostic.engine+'验证页面');link.href=target;link.target='_blank';link.rel='noopener noreferrer';refs.append(link)}}for(const source of course.references.sources||[]){const a=el('a',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';refs.append(a)}fragment.append(refs)}plan.replaceChildren(fragment);}
  const practiceHidden=course.mode==='classroom';if($('[data-act="practice"]').hidden!==practiceHidden)$('[data-act="practice"]').hidden=practiceHidden;
  const entries=course.outlines?.length?course.outlines:course.scenes;
  const nextChapters=course.id+':'+entries.map((entry,i)=>entry.id+':'+(course.scenes[i]?.phase|| (course.scenes[i]?'ready':'pending'))).join(',');
  if(chapterKey!==nextChapters){chapterKey=nextChapters;const fragment=document.createDocumentFragment();entries.forEach((entry,i)=>{const scene=course.scenes[i],b=el('button',`${String(i+1).padStart(2,'0')}  ${entry.title}${!scene?' · 待生成':scene.phase==='content'?' · 讲解准备中':''}`);b.type='button';b.disabled=!scene;b.onclick=()=>{stopVoice();index=i;remember();display()};fragment.append(b)});chapters.replaceChildren(fragment);}
  if(!course.scenes.length){setText(sheet,'正在生成第一个环节，完成后会在这里出现。');$('[data-act="voice"]').disabled=true;$('[data-act="next"]').disabled=true;return}
  index=Math.min(index,course.scenes.length-1);
  for(const [i,b]of [...chapters.children].entries()){const active=String(index===i);if(b.getAttribute('aria-current')!==active)b.setAttribute('aria-current',active)}
  $('[data-act="next"]').disabled=index>=course.scenes.length-1;
  updateLectureUI(course.scenes[index]);syncPresentationControls();
  const signature=course.id+':'+course.scenes[index].id+':'+(course.revision||0)+':'+(course.scenes[index].phase||'ready')+':'+(course.scenes[index].visualRevision||0);
  if(rendered===signature)return;rendered=signature;
  const scene=course.scenes[index];discussionPosition=null;teachingStage.clear();actionView?.dispose();actionView=null;slideView?.dispose();slideView=null;sheet.replaceChildren(el('small',`环节 ${index+1} / ${course.outlines?.length||course.scenes.length}`));
  if(scene.content.type==='quiz'){teachingStage.set('quiz',scene.title,'assistant');sheet.append(el('h3',scene.title));quiz(scene)}
  else if(scene.content.type==='interactive'){const sceneId=scene.id;sheet.append(el('h3',scene.title),renderInteractive(scene.content,value=>{if(course?.scenes[index]?.id===sceneId){void observe('interactive',value).then(()=>{if(value.kind==='submission'&&course?.scenes[index]?.id===sceneId&&!$('.classroom-question form button').disabled)discuss('请根据刚才提交的互动活动记录给予反馈，指出一个需要再听或再试的地方；必要时定位对应小节播放。不要编造未观察到的操作。')});status.textContent='已记录课堂操作，可在课堂讨论中继续提问'}},{score:liveScore,player:livePlayer,call,current:()=>course?.scenes[index]?.id===sceneId&&liveScore()?.serverId===course?.scoreId}))}
  else if(scene.content.type==='pbl')project(scene);
  else if(scene.content.canvas){slideView=renderSlide(scene.content.canvas,{cover:index===0,page:index+1,total:course.scenes.length});sheet.append(slideView.element)}
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
 function resetCourse(){speech.clear();discussionPosition=null;teachingStage.clear();chatController?.abort();remember();stopVoice();clearTimeout(timer);timer=null;course=null;index=0;history=[];rendered='';planKey=chapterKey=transcriptKey='';slideView?.dispose();slideView=null;actionView?.dispose();actionView=null;sheet.replaceChildren();$('.classroom-body').hidden=true;$('.classroom-progress').hidden=true;$('.classroom-chapters').replaceChildren();$('.classroom-plan div')?.replaceChildren();$('.classroom-note').textContent='';$('.classroom-dialogue').replaceChildren();$('.classroom-transcript')?.remove();caption.textContent='';}
 function syncScoreBinding(){const score=liveScore(),id=score?.serverId||null;if(id===boundScoreId)return;boundScoreId=id;if(openingFor===id)return;bindingVersion++;resetCourse();formScoreId=id;rangeDirty=false;form.elements.scope.value='whole';form.elements.scope.onchange();goalEdited=false;refreshGoal();status.textContent=score?'《'+score.title+'》的曲谱课堂':'请先打开一首曲谱';const savedCourse=id&&saved('classroom-score:'+id);if(savedCourse)void open(savedCourse).catch(error=>{status.textContent=error.message});}
 document.addEventListener('practice-state',syncScoreBinding);
 function syncActivity(){for(const iframe of sheet.querySelectorAll('.classroom-interactive'))iframe.classroomVisibility?.(visible())}
 function visible(){return !document.hidden&&inViewport&&(!container||container.open)&&!root.closest('.workspace-panel')?.hidden}
 function schedulePoll(delay=2500){clearTimeout(timer);timer=null;if(course&&(['queued','generating'].includes(course.status)||course.imagesStatus==='running'||course.references?.loading)&&visible())timer=setTimeout(poll,delay)}
 async function poll(){
  clearTimeout(timer);timer=null;if(!course||!visible())return;const id=course.id;if(pollingId===id)return;pollingId=id;
  try{const data=await request('/api/classroom?id='+id+(course.updatedAt?'&since='+course.updatedAt:''));if(course?.id!==id)return;if(!data.unchanged){course=data;if(visible())display()}schedulePoll()}
  catch(e){if(course?.id!==id)return;if(visible())status.textContent='同步课堂暂时中断：'+e.message;schedulePoll(5000)}finally{if(pollingId===id)pollingId=null}
 }
 const visibility=new IntersectionObserver(entries=>{inViewport=entries.some(e=>e.isIntersecting);syncActivity();if(visible()){display();schedulePoll(100)}else{clearTimeout(timer);timer=null}},{rootMargin:'250px'});visibility.observe(root);
 document.addEventListener('visibilitychange',()=>{syncActivity();if(visible())schedulePoll(100);else{clearTimeout(timer);timer=null}});

 let lastCreateError=null;
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;lastCreateError=null;busy=true;form.querySelector('[type=submit]').disabled=true;stopVoice();clearTimeout(timer);try{const score=liveScore();if(!score?.serverId)throw Error('请先从云曲库打开一首已识别的作品');if(score.generated)throw Error('请切回原谱后准备课堂，改编总谱暂不作为授课依据');if(formScoreId!==score.serverId&&!rangeDirty){form.elements.scope.value='whole';form.elements.scope.onchange()}formScoreId=score.serverId;rangeDirty=false;if(form.elements.scope.value==='whole')form.elements.scope.onchange();refreshGoal();const data=Object.fromEntries(new FormData(form));data.goalCustomized=goalEdited;data.start=Number(form.elements.start.value);data.end=Number(form.elements.end.value);data.materialIds=materialPicker.ids();data.useReferences=form.elements.useReferences.checked;data.features=['slides',...new FormData(form).getAll('features')];status.textContent='正在读取《'+score.title+'》并准备课程…';const version=bindingVersion;const created=await request('/api/classroom/create',{...data,scoreId:score.serverId});store('classroom-score:'+score.serverId,created.id);if(version!==bindingVersion||liveScore()?.serverId!==score.serverId)return;course=created;index=0;history=[];$('.classroom-dialogue').replaceChildren();rendered='';store('classroom-last',course.id);display();poll();return created;}catch(error){lastCreateError=error;status.textContent=error.message}finally{busy=false;form.querySelector('[type=submit]').disabled=false}};
 $('[data-act="export"]').onclick=()=>{if(course?.scenes.length){const a=document.createElement('a');a.href='/api/classroom/export?id='+course.id;a.download=course.title+'.pptx';a.click()}};
 $('[data-act="next"]').onclick=()=>{if(container.classList.contains('classroom-presentation')){turnPage(1);return}if(!course||index>=course.scenes.length-1)return;stopVoice();index++;remember();display()};
 function cancelListening(){if(!listening)return;const state=listening;listening=null;clearInterval(state.timer);state.resolve(false);if(livePlayer()===state.player){state.player.clearLoop();if(state.player.playing)void call('ai-transport',{command:'pause'}).catch(()=>{})}}
 async function listenToWork(action,token){
  teachingStage.set('music-listen',action.title||'聆听当前作品');
  const restore=!!placeholder,presentation=container.classList.contains('classroom-presentation'),id=course?.id;
  scoreExcursion++;
  try{
   // Start audio while the classroom folds away, not after its animation.
   const returning=showScore({automatic:true});
   const excerpt=playLessonExcerpt(action,token);
   void returning.catch(e=>{if(token===voiceToken)status.textContent=e.message});
   scorePause.hidden=false;scorePause.textContent='暂停聆听';
   const result=await excerpt;
   await returning;
   if(result&&token===voiceToken&&course?.id===id){
    back.hidden=true;scorePause.hidden=true;container.open=true;if(restore&&!placeholder)void fullscreen().catch(e=>{if(token===voiceToken)status.textContent=e.message});
    if(presentation){container.classList.add('classroom-presentation');leave.hidden=false;present.hidden=true;syncPresentationControls()}
   }
   return result;
  }finally{scoreExcursion=Math.max(0,scoreExcursion-1);if(!scoreExcursion)scorePause.hidden=true}
 }
 async function playLessonExcerpt(action,token){
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
  if(token!==voiceToken)return;
  const scene=course.scenes[index];actionView ||= classroomActions(sheet);
  const actions=lessonActions(scene.actions||[],scene.content?.canvas?.elements||[]);
  while(actionCursor<actions.length){
   if(token!==voiceToken)return;
   const action=actions[actionCursor++];
   if(['music-listen','listen','play_music'].includes(action.type)){prepareNext(actions);try{if(!await listenToWork(action,token))return}catch(e){if(token===voiceToken){actionCursor--;livePlayer()?.clearLoop();$('[data-act="voice"]').textContent='重试聆听'}throw e}continue}
   if(action.type!=='speech'){teachingStage.set(action.type,plain(action.content||action.text||action.topic||action.prompt||''));if(await executeClassroomAction(action,actionHost(token))==='pause'){discussionPosition={id:course.id,index,cursor:actionCursor};$('.classroom-question').open=true;teachingStage.set('discussion',action.topic||action.prompt||'请分享你的聆听判断');status.textContent='讨论后可继续讲课';$('[data-act="voice"]').textContent='继续讲课';return}continue}
   const text=plain(action.text);if(!text)continue;const role=/student|同学/.test(action.agentId||action.speaker||'')?'student':/assistant|助教/.test(action.agentId||action.speaker||'')?'assistant':'teacher';
   const previousCue=actions.slice(0,actionCursor).findLast(a=>a.type==='spotlight'||a.type==='laser');
   const region=speechRegion(text,scene.content?.canvas?.elements||[],previousCue?.elementId);
   status.textContent='正在准备这一段讲解…';teachingStage.set('preparing','正在准备这一段讲解',role);
   for(let i=0;i<150;i++){
    if(token!==voiceToken)return;
    const r=await speech.prepare(speechUrl(text,role));
    if(r.status==='failed')throw Error(r.message);
    if(r.status==='generating'&&r.message)status.textContent=r.message;
    if(r.status==='complete'){
     if(token!==voiceToken)return;voice=speaker;voice.src=r.url;voice.onplaying=()=>{if(token!==voiceToken||speaker.paused||speaker.currentTime<.05)return;status.textContent='正在讲解：'+scene.title;$('[data-act=voice]').textContent='暂停讲解';actionView.apply({type:previousCue?.type==='laser'?'laser':'spotlight',elementId:region});caption.textContent=text;teachingStage.followAudio(speaker,text,role)};voice.ontimeupdate=()=>{if(token===voiceToken&&!speaker.paused&&speaker.currentTime>=.05&&teachingStage.node.dataset.state!=='speech')speaker.onplaying?.();};voice.onwaiting=voice.onstalled=()=>{if(token===voiceToken){status.textContent='讲解音频正在缓冲…';teachingStage.set('preparing','讲解音频正在缓冲',role);}};voice.volume=1;voice.muted=false;voice.playbackRate=Number(speed.value);if(resumeTime){const offset=resumeTime;resumeTime=0;voice.addEventListener('loadedmetadata',()=>{voice.currentTime=Math.min(offset,Math.max(0,voice.duration-.1))},{once:true})}voice.onerror=()=>{if(token!==voiceToken)return;const code=speaker.error?.code||'未知';speaker.onended=speaker.onerror=null;speaker.pause();voice=null;resumeTime=0;actionCursor=Math.max(0,actionCursor-1);voiceToken++;teachingStage.stop();remember();status.textContent='讲解音频未能播放，请重试；错误代码 '+code;$('[data-act="voice"]').textContent='重试讲解'};
     voice.onended=()=>{if(token!==voiceToken)return;voice=null;advanceLecture(token).catch(e=>{status.textContent=e.message;stopVoice()})};
     status.textContent='讲解音频正在缓冲…';await voice.play();
     prepareNext(actions);
     return;
    }
    await new Promise(resolve=>setTimeout(resolve,300));
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
 async function showScore({automatic=false}={}){if(!automatic)pauseLecture();nativePresentation=false;if(document.fullscreenElement===container)try{await document.exitFullscreen()}catch{}container.classList.remove('classroom-presentation');leave.hidden=true;present.hidden=false;previous.hidden=true;pageNumber.hidden=true;$('[data-act="next"]').textContent='下一环节 →';if(morphing)await morphing;if(placeholder)await fullscreen({collapse:true});container.open=false;back.hidden=false;document.querySelector('.workspace-nav [data-panel="play"]')?.click();document.querySelector('#sheet-scroll')?.scrollIntoView({behavior:'smooth',block:'start'});}
 $('[data-act="demo"]').onclick=async()=>{try{unlockSpeaker();await showScore();if(liveScore()?.serverId!==course?.scoreId)await call('ai-open-score',{id:course.scoreId},120000);sameScore();if(livePlayer()?.playing){await call('ai-transport',{command:'pause'});return}const range=rangeOf(liveScore(),course.start,course.end);await call('ai-seek-measure',{measure:course.start});livePlayer().setLoop(range.startBeat,range.endBeat,{once:true});await call('ai-play-score',{},60000);status.textContent=`正在示范第 ${course.start}—${course.end} 小节`;}catch(e){status.textContent=e.message;const visibleStatus=document.querySelector('#play-status');if(visibleStatus)visibleStatus.textContent=e.message}};
 $('[data-act="practice"]').onclick=async()=>{try{sameScore();stopVoice();if(livePlayer()?.playing)await call('ai-transport',{command:'pause'});const state=await call('practice-command',{action:'fingering-context'});const result=await call('practice-command',{action:'configure',version:state.version,start:course.start,end:course.end,bpm:liveScore().tempo||80,rounds:1});if(result.error)throw Error(result.error);if(placeholder)fullscreen();const panel=root.closest('.workspace-page')?.querySelector('.practice-settings')||document.querySelector('.practice-settings');if(panel){panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'center'})}status.textContent='小节范围已设好，请点击「开始练习」开启麦克风。';}catch(e){status.textContent=e.message}};
 $('.classroom-question form').onsubmit=async e=>{
  e.preventDefault();const input=e.target.querySelector('input'),button=e.target.querySelector('button'),question=input.value.trim();if(!question||button.disabled||!course)return;
  button.disabled=true;unlockSpeaker();pauseLecture();const version=bindingVersion,id=course.id,sceneId=course.scenes[index]?.id;chatController=new AbortController();const area=$('.classroom-dialogue'),reply=el('p','正在对照当前课件与课堂记录…');area.append(el('p',question,'classroom-user'),reply);let prompt=question,chatTimeout=null;
  try{for(let round=0;round<3;round++){
   chatTimeout?.dispose();chatTimeout=abortTimeout(chatController.signal,120000);
   const response=await fetch('/api/classroom/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,sessionId,question:prompt,sceneIndex:index,role:$('.classroom-role').value,playback:{parts:liveScore()?.parts||liveScore()?.midiParts||[],beat:livePlayer()?.beat,playing:livePlayer()?.playing,selectedElement,whiteboard:actionView?.snapshot?.()||[]},history:history.slice(-8).map(t=>({...t,content:t.content.slice(0,1500)}))}),signal:chatTimeout.signal});
   if(!response.ok)throw Error((await response.json()).error);const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',answer='',actions=[],finished=false;
   const accept=event=>{if(event.error)throw Error(event.error);if(event.text){answer+=event.text;reply.textContent=answer}if(event.done){answer=event.answer||answer;reply.textContent=answer;actions=event.actions||[];if($('.classroom-role').value==='student'&&answer)void request('/api/tour-voice?locale=zh&role=student&text='+encodeURIComponent(plain(answer).slice(0,3000))).catch(()=>{});finished=true}};
   while(!finished){const {value,done}=await reader.read();chatTimeout.reset();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const rows=buffer.split('\n');buffer=rows.pop();for(const row of rows)if(row.trim())accept(JSON.parse(row));if(done){if(buffer.trim())accept(JSON.parse(buffer));break}}
   void reader.cancel().catch(()=>{});chatTimeout.dispose();if(version!==bindingVersion||course?.id!==id)return;
   history.push({role:'user',content:prompt},{role:'assistant',content:answer});remember();if($('.classroom-role').value==='student'&&round===0&&answer){actions=actions.filter(a=>a.type!=='speech');actions.unshift({type:'speech',text:plain(answer).slice(0,3000),agentId:'student-listener'});}if(!actions.length)break;
   stopVoice();const host=actionHost(),results=[];
   for(const [i,action]of actions.entries()){
    if(!host.current())return;status.textContent=`正在执行课堂操作 ${i+1}/${actions.length}：${action.title||action.type}`;
    try{teachingStage.set(action.type,action.text||action.topic||action.prompt||'',$('.classroom-role').value==='student'?'student':'teacher');const value=await executeClassroomAction(action,host);results.push({action,result:value??{ok:true}});if(value==='pause')break}catch(error){results.push({action,error:error.message});break}
   }
   if(!host.current())return;await observe('execution',{question,results});if($('.classroom-role').value==='student')break;
   if(round===2){reply.append(el('p','本轮操作已结束，可继续提问。'));break}
   prompt='刚才课堂操作的真实结果：'+JSON.stringify(results).slice(0,1200)+'。请根据结果继续回答原问题；成功的动作不要重复，失败的动作可以纠正一次，不要假称已完成。';
  }input.value='';status.textContent='';
  }catch(error){if(!chatController.signal.aborted&&version===bindingVersion)reply.textContent+='\n'+classroomNetworkError(error,chatTimeout?.signal)}finally{chatTimeout?.dispose();button.disabled=false}
 };
 document.addEventListener('practice-state',e=>{if(!course||liveScore()?.serverId!==course.scoreId){const measures=e.detail.measures||[];if(form.elements.scope.value==='whole'){form.elements.scope.onchange();refreshGoal()}else if(measures.length&&!rangeDirty)form.elements.end.value=Math.min(8,Math.max(...measures));}if(course&&e.detail.complete&&liveScore()?.serverId===course.scoreId){$('.classroom-note').textContent='本轮练习完成，可以回到课堂回顾难点，或再听一遍示范。'}});
 root.closest('details')?.addEventListener('toggle',e=>{syncActivity();if(!e.target.open){if(!scoreExcursion)pauseLecture();clearTimeout(timer);timer=null}else{display();schedulePoll(100)}});
 async function open(id,loadScore=false){if(course?.id===id&&(!liveScore()?.serverId||liveScore().serverId===course.scoreId)){display();schedulePoll(100);return}remember();stopVoice();speech.clear();chatController?.abort();clearTimeout(timer);const version=++bindingVersion,currentId=liveScore()?.serverId;const next=await request('/api/classroom?id='+id);if(version!==bindingVersion)return;if(loadScore&&liveScore()?.serverId!==next.scoreId){openingFor=next.scoreId;try{await call('ai-open-score',{id:next.scoreId},120000)}finally{openingFor=null}}if(version!==bindingVersion)return;if(liveScore()?.serverId&&liveScore().serverId!==next.scoreId){resetCourse();status.textContent='《'+liveScore().title+'》的曲谱课堂';return}course=next;boundScoreId=liveScore()?.serverId||null;store('classroom-score:'+course.scoreId,course.id);const position=saved('classroom-position:'+id)||{};index=position.index||0;history=position.history||[];resumeTime=Number(position.time)||0;actionCursor=Math.max(0,(Number(position.actionCursor)||0)-(resumeTime>0?1:0));$('.classroom-dialogue').replaceChildren(...history.map(t=>el('p',t.content,t.role==='user'?'classroom-user':'')));rendered='';form.elements.goal.value=course.goal;goalEdited=course.goalCustomized!==false;form.elements.start.value=course.start;form.elements.end.value=course.end;form.elements.level.value=course.level;form.elements.mode.value=course.mode||'piano';form.elements.schoolStage.value=course.schoolStage||'senior';form.elements.useReferences.checked=course.useReferences!==false;form.elements.duration.value=course.duration||45;formScoreId=course.scoreId;rangeDirty=false;form.elements.scope.value=course.scope||'range';form.elements.scope.onchange();for(const box of form.querySelectorAll('[name=features]'))box.checked=(course.features||['slides','quiz']).includes(box.value);store('classroom-last',id);display();poll();}
 function agentState(){return {id:course?.id||null,scoreId:course?.scoreId||liveScore()?.serverId||null,title:course?.title||liveScore()?.title||'',status:course?.status||'not-created',progress:course?.progress||0,message:course?.message||status.textContent,open:!!container?.open,fullscreen:!!placeholder,presentation:container.classList.contains('classroom-presentation'),scene:index+1,sceneCount:course?.scenes.length||0,slide:slideIndices().indexOf(index)+1,slides:slideIndices().map((i,n)=>({page:n+1,scene:i+1,title:course.scenes[i].title})),speaking:!!voice&&!voice.paused,listening:!!listening,rate:Number(speed.value),continuous:continuousCheck.checked,settings:{goal:form.elements.goal.value,level:form.elements.level.value,schoolStage:form.elements.schoolStage.value,mode:form.elements.mode.value,duration:Number(form.elements.duration.value),scope:form.elements.scope.value,start:Number(form.elements.start.value),end:Number(form.elements.end.value)},currentScene:course?.scenes[index]?{id:course.scenes[index].id,title:course.scenes[index].title,type:course.scenes[index].type,text:plain((course.scenes[index].content?.canvas?.elements||[]).map(e=>e.content||'').join('\n')).slice(0,4500),speech:plain((course.scenes[index].actions||[]).filter(a=>a.type==='speech').map(a=>a.text||'').join('\n')).slice(0,3000)}:null,lastDiscussion:history.slice(-2).map(t=>({...t,content:String(t.content||'').slice(0,2000)}))};}
 function configureClassroom(settings={}){
  for(const key of ['schoolStage','mode','duration','scope'])if(settings[key]!=null){if(![...form.elements[key].options].some(o=>o.value===String(settings[key])))throw Error('课堂设置无效：'+key);}
  if(settings.scope==='range'){const max=scoreMeasureCount(liveScore());if(!Number.isInteger(Number(settings.start))||!Number.isInteger(Number(settings.end))||Number(settings.start)<1||Number(settings.end)<Number(settings.start)||Number(settings.end)>max)throw Error('课堂小节范围不在当前曲谱内');}
  for(const key of ['schoolStage','mode','duration','scope'])if(settings[key]!=null)form.elements[key].value=String(settings[key]);
  if(settings.schoolStage)form.elements.level.value={primary:'小学三年级',junior:'初中一年级',senior:'高中一年级'}[settings.schoolStage];
  if(settings.schoolStage&&!settings.goal){form.elements.goal.value=form.elements.goal.value.replace(/(?:小学|初中|高中)[一二三四五六七八九]年级/g,form.elements.level.value).replace(/(?:小学|初中|高中)音乐课/g,{primary:'小学音乐课',junior:'初中音乐课',senior:'高中音乐课'}[settings.schoolStage]);}

  form.elements.scope.onchange();if(settings.scope==='range'){form.elements.start.value=settings.start;form.elements.end.value=settings.end;rangeDirty=true;}
  if(settings.goal){form.elements.goal.value=String(settings.goal).slice(0,1500);goalEdited=true;}
 }
 async function agentCommand(value={}){
  const op=value.operation;
  if(course&&course.scoreId!==liveScore()?.serverId)throw Error('课堂与当前曲谱不一致，请先打开对应曲谱');
  if(op==='status')return agentState();
  if(op==='configure'){if(!value.settings||!Object.keys(value.settings).length)throw Error('课堂设置为空，尚未更改');configureClassroom(value.settings);return {...agentState(),receipt:'课堂设置已更新，尚未重新生成'};}
  if(op==='open'){container.open=true;return agentState();}
  if(op==='close'){stopVoice();endPresentation();if(placeholder)await fullscreen();container.open=false;return agentState();}
  if(!course?.scenes.length)throw Error('当前作品还没有可用课件，请先生成课程');
  if(op==='goto_slide'){const page=Number(value.page),pages=slideIndices();if(!Number.isInteger(page)||page<1||page>pages.length)throw Error('当前 PPT 共 '+pages.length+' 页，请选择有效页码');stopVoice();index=pages[page-1];remember();display();syncPresentationControls();}
  else if(op==='next'||op==='previous'){const target=index+(op==='next'?1:-1);if(target<0||target>=course.scenes.length)throw Error(op==='next'?'已经是最后一个环节':'已经是第一个环节');stopVoice();index=target;remember();display();syncPresentationControls();}
  else if(op==='present')await present.onclick();
  else if(op==='minimize'){endPresentation();if(placeholder)await fullscreen();}
  else if(op==='pause')pauseLecture();
  else if(op==='stop')stopVoice();
  else if(op==='speak'){if(!voice||voice.paused)void $('[data-act="voice"]').onclick();}
  else if(op==='listen'){await $('[data-act="demo"]').onclick();if(!livePlayer()?.playing)throw Error(status.textContent||'课堂音乐未能开始播放');}
  else if(op==='rate'){const valueRate=Number(value.rate);if(!Number.isFinite(valueRate)||valueRate<.8||valueRate>1.8)throw Error('讲解语速范围是 0.8 到 1.8 倍');speed.value=String(valueRate);speed.oninput();}
  else if(op==='continuous'){if(typeof value.enabled!=='boolean')throw Error('连续讲解需要开启或关闭');continuousCheck.checked=value.enabled;}
  else if(op==='export')$('[data-act="export"]').onclick();
  else if(op==='images'){const next=await request('/api/classroom/illustrate',{id:course.id});if(liveScore()?.serverId!==next.scoreId)throw Error('补图期间切换了曲谱');course=next;display();schedulePoll(300);}
  else if(op==='ask'){if(!String(value.question||'').trim())throw Error('请提供课堂问题');await discuss(String(value.question),value.role==='student'?'student':'teacher');}
  else throw Error('不支持的课堂操作：'+op);
  return {...agentState(),receipt:op==='speak'?'已请求开始讲解，声音状态以 speaking 为准':op==='export'?'已请求下载 PPT':op==='ask'?'课堂讨论已返回':undefined};
 }
 const last=saved('classroom-score:'+liveScore()?.serverId)||saved('classroom-last');const ready=last?open(last).catch(()=>{}):Promise.resolve();
 return {open,ready,state:agentState,command:agentCommand,async create(settings={}){if(busy)throw Error('当前课堂正在提交，请等待提交完成');configureClassroom({scope:'whole',...settings});const created=await form.onsubmit({preventDefault(){}});if(lastCreateError)throw lastCreateError;if(!created||created.scoreId!==liveScore()?.serverId)throw Error('提交期间曲谱已切换，请核对当前作品后重新生成');return {id:created.id,title:created.title,status:created.status};},expand(){if(container&&!placeholder)fullscreen()}};
}
