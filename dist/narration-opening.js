import {openingTracks} from './mentor-track-list.js?v=eleven-v4-20261027';
import {mentorIdentityText,mentorTrackListUrl,mentorPrefaceUrl,mentorGreetingUrl} from './mentor-identity.js?v=eleven-v4-20261027';
import {createArrival} from './mentor-arrival.js?v=flow138';
import {attachNarrationAvatar} from './narration-avatar.js?v=flow133';
import {narrationMedia} from './narration-media.js';
const boards={"mentor-preface": {"title": "课题缘起", "points": ["音乐教育专业", "钢琴教学经验", "星海高中实践"]}, "mentor-context": {"title": "课堂中的音乐材料", "points": ["材料导入", "声部核对", "片段聆听"]}, "mentor-material": {"title": "课堂提问如何落实", "points": ["理解提问", "定位作品和声部", "播放后继续追问"]}, "mentor-listening": {"title": "一节音乐课如何组织", "points": ["学段和教学要求", "聆听及课堂活动", "讲解接续"]}, "mentor-learning": {"title": "练习反馈的研究问题", "points": ["提示何时出现", "学生如何调整练习", "撤去提示后的表现"]}, "mentor-arrangement": {"title": "教学材料的生成和核对", "points": ["旋律保留", "织体及难度调整", "试听和修订"]}, "mentor-handoff": {"title": "进入项目演示", "points": ["音乐教育导览", "人工智能技术导览", "实际操作和研究讨论"]}};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fetchOpening=async url=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{return await fetch(url,{signal:controller.signal});}finally{clearTimeout(timer);}};
const activeOpenings=new WeakMap();
export function openingNarration(scene){if(activeOpenings.has(scene))return activeOpenings.get(scene);const pending=runOpeningNarration(scene);activeOpenings.set(scene,pending);pending.finally(()=>activeOpenings.delete(scene)).catch(()=>{});return pending;}
async function runOpeningNarration(scene){
 if(!document.querySelector('link[data-mentor-cinematic]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/mentor-cinematic.css?v=28';style.dataset.mentorCinematic='';document.head.append(style);}
 scene.style.cssText+=';position:fixed;inset:0;width:100%;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;overflow:hidden;z-index:110';scene.classList.add('mentor-cinematic');scene.dataset.phase='loading';const content=scene.querySelector('.home-intro-content');content.replaceChildren();content.style.cssText='position:relative;width:100%;height:100%;max-width:none;margin:0;padding:0;transform:none';
 const brand=document.querySelector('.top .brand strong');if(brand)scene.style.setProperty('--mentor-accent',getComputedStyle(brand).color);
 const host=document.createElement('div');host.className='mentor-cinematic-host';host.style.cssText='position:absolute;inset:0;width:100%;height:100%;visibility:visible';content.append(host);const arrival=createArrival(content);
 const sound=document.createElement('button');sound.type='button';sound.className='mentor-sound-unlock';sound.hidden=true;sound.textContent='轻触开始讲解';content.append(sound);
 const audio=narrationMedia();const mediaLifecycle=new AbortController();
 // Start fetching the existing recording while the avatar enters the stage.
 function prepareTrack(url){const prep=window.mentorPreparation;const source=prep?.playable?.url===url?prep.greetingSource:url;const target=new URL(source,location.href).href;if(audio.src!==target){audio.src=target;audio.load();}}
 prepareTrack(window.mentorPreparation?.playable?.url||mentorPrefaceUrl());
 audio.addEventListener('canplay',()=>window.dispatchEvent(new Event('mentor-voice-ready')),{signal:mediaLifecycle.signal});audio.addEventListener('playing',()=>{if(audio.muted||audio.dataset.priming==='1'||audio.dataset.lectureReady!=='1')return;window.mentorVoiceStarted=true;window.dispatchEvent(new Event('mentor-voice-playing'));},{signal:mediaLifecycle.signal});

 audio.dataset.lectureReady='0';audio.dataset.mentorVoice='1';window.__disposeLectureMusic?.();document.querySelectorAll('audio[data-lecture-music]').forEach(a=>{a.pause();a.removeAttribute('src');a.remove();});const disposeMusic=()=>{};content.append(audio);
 const captionPanel=document.createElement('div');captionPanel.className='mentor-caption-panel';
 const loading=document.createElement('div');loading.className='mentor-loading';loading.setAttribute('role','status');loading.hidden=true;
 const spinner=document.createElement('span');spinner.className='mentor-loading-spinner';spinner.setAttribute('aria-hidden','true');
 const loadingText=document.createElement('span');loadingText.textContent=scene.dataset.mentor?scene.dataset.mentor+'老师，正在准备讲解':'唐秋鸣导师数字人正在加载中';loading.append(spinner,loadingText);captionPanel.append(loading);content.append(captionPanel);
 const voiceLoading=document.createElement('div');voiceLoading.className='mentor-voice-loading';voiceLoading.hidden=true;const voiceLabel=document.createElement('span'),voicePercent=document.createElement('span');voiceLabel.textContent='TangQiuMingVision数字人物引擎加载中';voicePercent.textContent='0%';voiceLoading.append(voiceLabel,voicePercent);captionPanel.append(voiceLoading);
 const engineProgress=document.createElement('progress');engineProgress.max=100;engineProgress.value=0;engineProgress.hidden=true;engineProgress.className='mentor-engine-progress';engineProgress.setAttribute('aria-label','专属语音生成进度');captionPanel.append(engineProgress);let voiceProgress=0,voiceTarget=0,voiceDisplayed=0,voiceAnimTimer=null;
function ensureVoiceAnim(){if(voiceAnimTimer)return;voiceAnimTimer=setInterval(()=>{
  // 朝后端真实进度缓动，避免数字直接跳变
  const k=voiceTarget>=1?0.3:0.14;
  let next=voiceDisplayed+(voiceTarget-voiceDisplayed)*k;
  // 未完成时缓慢爬升，防止长时间停在 60% 不动；上限 90% 直到后端真正完成
  if(voiceTarget<1)next=Math.min(Math.max(next,voiceDisplayed+0.006),0.9);
  voiceDisplayed=next;
  const percent=Math.max(0,Math.min(100,Math.round(voiceDisplayed*100)));
  voicePercent.textContent=percent+'%';engineProgress.value=percent;
  if(voiceTarget>=1&&voiceDisplayed>=0.995){clearInterval(voiceAnimTimer);voiceAnimTimer=null;voiceLoading.hidden=true;engineProgress.hidden=true;}
},120);
}
function showEngineProgress(){voiceLoading.hidden=false;engineProgress.hidden=false;voiceTarget=voiceProgress;ensureVoiceAnim();}
 const disposeAvatar=attachNarrationAvatar(host,audio,{embedded:true,cinematic:true,arrival});
 const avatarReady=new Promise(resolve=>{const timeout=setTimeout(()=>{observer.disconnect();resolve(false);},60000);const observer=new MutationObserver(()=>{const avatar=host.querySelector('.narration-avatar');if(avatar?.dataset.ready||avatar?.dataset.error){clearTimeout(timeout);observer.disconnect();resolve(!!avatar.dataset.ready);}});observer.observe(host,{subtree:true,attributes:true});const ready=host.querySelector('.narration-avatar');if(ready?.dataset.ready||ready?.dataset.error){clearTimeout(timeout);observer.disconnect();resolve(!!ready.dataset.ready);}});
 let arrivalAt=0;
 avatarReady.then(loaded=>{if(loaded){arrivalAt=performance.now();}window.mentorStageState={loaded};window.dispatchEvent(new CustomEvent('mentor-stage-ready',{detail:{loaded}}));});
 const generatedReady=Promise.resolve(window.mentorPreparation?.tracks||openingTracks()).then(list=>list.filter(t=>t.role==='mentor'&&t.url).length===7?list:openingTracks()).catch(()=>openingTracks());
 const continueButton=document.createElement('button');continueButton.type='button';continueButton.className='mentor-greeting-continue';continueButton.textContent='';continueButton.hidden=true;captionPanel.append(continueButton);let continueIntro,greetingDetached=false;const continueReady=new Promise(resolve=>{continueIntro=()=>resolve({useExisting:true});});continueButton.onclick=()=>{greetingDetached=true;voiceLoading.hidden=true;engineProgress.hidden=true;continueButton.hidden=true;continueIntro();};
 const greetingName=scene.dataset.mentor;let greetingState=null;const greetingReady=greetingName&&window.mentorPreparation?.name===greetingName?window.mentorPreparation.ready:greetingName?(async()=>{while(scene.isConnected&&!greetingDetached){try{const r=await fetchOpening(mentorGreetingUrl(greetingName));greetingState=await r.json();if(greetingDetached||!scene.isConnected)return null;if(greetingState.url){voiceProgress=1;showEngineProgress();return greetingState;}if(greetingState.status==='failed'){voiceLoading.hidden=false;voiceLabel.textContent='专属前言生成失败：'+(greetingState.error||'请稍后重试');return null;}continueButton.hidden=true;voiceProgress=Number(greetingState.progress??({queued:0,loading:20,synthesizing:60,joining:90}[greetingState.status]||0))/100;showEngineProgress();}catch{voiceLoading.hidden=false;voiceLabel.textContent='专属前言连接中断，正在重试';}await wait(3000);}return null;})():Promise.resolve(null);
 const earlyProgress=event=>{if(greetingDetached)return;const value=event.detail;voiceProgress=Math.max(0,Math.min(1,Number(value.progress||0)/100));if(value.url){voiceTarget=1;voiceLoading.hidden=true;engineProgress.hidden=true;}else showEngineProgress();};
 window.addEventListener('mentor-greeting-progress',earlyProgress,{signal:mediaLifecycle.signal});
 if(window.mentorPreparation?.state)earlyProgress({detail:window.mentorPreparation.state});
 const greetingPrepared=(async()=>{
  const remaining=Math.max(0,30000-(performance.now()-(window.mentorPreparation?.started||performance.now())));
  let timer;const greeting=greetingName?await Promise.race([greetingReady,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),remaining);})]).finally(()=>clearTimeout(timer)):null;
  if(window.mentorPreparation){window.mentorPreparation.openingChoice=greeting?.url?'personalized':'fallback';window.mentorPreparation.lectureStarted=true;}
  const available=await generatedReady,openingTrack=available.find(t=>t.role==='mentor'&&t.url);
  prepareTrack(greeting?.url||openingTrack?.url||mentorPrefaceUrl());
  let retryAt=performance.now()+15000;scene.dataset.voiceBuffer='loading';
  while(scene.isConnected){
   const buffered=audio.buffered.length?audio.buffered.end(0):0,required=Math.min(1.5,Number.isFinite(audio.duration)?audio.duration:7);
   if(audio.readyState>=3&&buffered>=required){scene.dataset.voiceBuffer='ready';arrival.prepare();return greeting;}if(performance.now()>retryAt){retryAt=performance.now()+15000;if(audio.error||audio.networkState===3){audio.load();}scene.dataset.voiceBuffer='buffering';}
   await new Promise(resolve=>{const done=()=>{clearTimeout(timer);for(const e of ['canplay','progress','error'])audio.removeEventListener(e,done);resolve();};const timer=setTimeout(done,1000);for(const e of ['canplay','progress','error'])audio.addEventListener(e,done,{once:true});});
   if(audio.error){prepareTrack(mentorPrefaceUrl());await wait(700);audio.load();}
  }
  return greeting;
 })();

 const generated=await generatedReady;
 const tracks=generated.filter(track=>track.role==='mentor'&&track.url);
 if(tracks.length!==7)tracks.splice(0,tracks.length,...openingTracks());
 const warmAudio=window.mentorPreparation?.warmAudio||[];
 let workspaceRequested=false;function prepareWorkspace(){if(workspaceRequested)return;workspaceRequested=true;window.mentorWorkspaceRequested=true;window.dispatchEvent(new Event('mentor-workspace-needed'));}
 function warmUpcoming(current){if(current>=4)prepareWorkspace();if(current>=6)arrival.prepareDeparture?.();arrival.prefetchChapter?.(current+1);if(!window.mentorPreparation?.lectureStarted)return;const upcoming=tracks.slice(current+1,current+3).map(t=>new URL(t.url,location.href).href);for(let i=warmAudio.length-1;i>=0;i--)if(!upcoming.includes(warmAudio[i].src)){const a=warmAudio.splice(i,1)[0];a.pause();a.removeAttribute('src');a.load();}for(const url of upcoming)if(!warmAudio.some(a=>a.src===url)){const a=new Audio();a.preload='auto';a.src=url;a.load();warmAudio.push(a);}}
 function clearWarm(){for(const a of warmAudio){a.pause();a.removeAttribute('src');a.load();}warmAudio.length=0;}
 warmUpcoming(0);
 let arriving=true;
 const prime=()=>{if(!arriving||audio.dataset.priming==='1')return;const wasMuted=audio.muted;audio.dataset.priming='1';audio.muted=true;void audio.play().then(()=>{if(arriving){audio.pause();audio.currentTime=0;}audio.muted=wasMuted;delete audio.dataset.priming;}).catch(()=>{audio.muted=wasMuted;delete audio.dataset.priming;});};
 for(const event of ['pointerdown','touchend','click'])document.addEventListener(event,prime,true);
 function endArrival(){arriving=false;audio.pause();audio.currentTime=0;for(const event of ['pointerdown','touchend','click'])document.removeEventListener(event,prime,true);}
 let translations={};void fetchOpening('/narration/mentor-subtitles.json').then(r=>r.ok?r.json():{}).then(value=>{translations=value;}).catch(()=>{});
 const position=document.createElement('span'),subtitle=document.createElement('p'),actions=document.createElement('div'),skip=document.createElement('button'),exit=document.createElement('button');
 position.className='mentor-segment';subtitle.className='mentor-subtitle';subtitle.setAttribute('aria-live','off');actions.className='mentor-caption-actions';skip.type=exit.type='button';position.hidden=subtitle.hidden=actions.hidden=true;actions.append(skip,exit);captionPanel.append(position,subtitle,actions);
 const loaded=await avatarReady;
 if(!loaded){window.mentorStageFailed=true;window.dispatchEvent(new Event('mentor-workspace-needed'));clearWarm();arrival.dispose();endArrival();greetingDetached=true;clearInterval(voiceAnimTimer);mediaLifecycle.abort();disposeMusic();audio.pause();audio.onended=audio.onerror=null;audio.removeAttribute('src');audio.load();disposeAvatar();document.dispatchEvent(new Event('mentor-resources-released'));return;}
 const arrivalFinished=arrival.finish(()=>document.dispatchEvent(new Event('mentor-arrival-reveal')),()=>{void greetingPrepared.then(()=>{if(!scene.isConnected)return;scene.dataset.phase='greeting';subtitle.hidden=false;subtitle.textContent=mentorIdentityText((tracks[0].text||'').split(/[。！？]/)[0]);audio.muted=false;audio.volume=1;audio.dataset.lectureReady='1';void audio.play().catch(()=>{sound.hidden=false;sound.textContent='轻触开始讲解';sound.onclick=()=>{void audio.play().then(()=>sound.hidden=true).catch(()=>{});};});});});
 const greeting=await greetingPrepared;if(!scene.isConnected)return;endArrival();greetingDetached=true;if(window.mentorPreparation)window.mentorPreparation.lectureStarted=true;clearInterval(voiceAnimTimer);voiceAnimTimer=null;continueButton.hidden=true;voiceLoading.hidden=true;engineProgress.hidden=true;if(greeting?.url)tracks[0]={...tracks[0],url:greeting.url,text:greeting.text};host.style.visibility='';loading.hidden=true;await arrivalFinished;scene.dataset.phase='lecture';
 return new Promise(resolve=>{
  let index=0,finished=false,blocked=false,frame=0,trackStart=performance.now(),lastDraw=0,revision=0,selecting=false,queuedAdvance=false;
  function captions(elapsed=0,duration=1){
   const locale=document.documentElement.lang.split('-')[0],labels={zh:['第','段','跳过本段','结束讲解'],en:['Part','','Skip this part','End introduction'],fr:['Partie','','Passer','Terminer'],de:['Teil','','Überspringen','Einführung beenden'],es:['Parte','','Saltar','Terminar'],ja:['第','部','この部分をスキップ','紹介を終了'],ko:['','','이 부분 건너뛰기','소개 종료']}[locale]||['Part','','Skip this part','End introduction'];
   position.textContent=`${labels[0]} ${index+1} / ${tracks.length} ${labels[1]}`;skip.textContent=labels[2];exit.textContent=labels[3];
   const text=mentorIdentityText(locale==='zh'?tracks[index].text:(translations[locale]?.[tracks[index].id]||tracks[index].text));
   const lines=(text||'').match(/[^。！？.!?]+[。！？.!?]?/g)||[];const weights=lines.map(line=>line.length),total=weights.reduce((a,b)=>a+b,0);let cursor=Math.min(.999,elapsed/Math.max(1,duration))*total,selected=lines.at(-1)||'';
   for(let i=0;i<lines.length;i++){cursor-=weights[i];if(cursor<0){selected=lines[i];break;}}
   if(subtitle.textContent!==selected){subtitle.textContent=selected;subtitle.animate([{opacity:.35,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:200});}
  }
  function update(){
   if(finished)return;frame=requestAnimationFrame(update);if(document.hidden)return;
   const duration=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:Math.max(30,(tracks[index].text||'').length/3.5);
   const elapsed=audio.currentTime;
   captions(elapsed,duration);
   if(performance.now()-lastDraw>120){lastDraw=performance.now();const board=boards[tracks[index].id]||boards['mentor-context'];document.dispatchEvent(new CustomEvent('mentor-lesson',{detail:{...board,topic:tracks[index].id,lessonPosition:Math.min(1,elapsed/duration),progress:Math.min(1,elapsed/duration/.65),mode:elapsed/duration<.7?'writing':'slides',elapsed,speaking:!audio.paused&&!audio.ended}}));}
  }
  const buffering=document.createElement('div');buffering.className='mentor-audio-buffering';buffering.hidden=true;buffering.setAttribute('role','status');
  const bufferingLabel=document.createElement('span');bufferingLabel.textContent='正在准备讲解';const bufferingBar=document.createElement('progress');bufferingBar.max=100;bufferingBar.setAttribute('aria-label','讲解音频加载进度');buffering.append(bufferingLabel,bufferingBar);captionPanel.append(buffering);
  let pendingRevision=null;
  function showBuffering(){sound.hidden=true;buffering.hidden=audio.readyState>=3;bufferingBar.removeAttribute('value');}
  function hideBuffering(){buffering.hidden=true;}
  audio.addEventListener('progress',()=>{if(buffering.hidden)return;if(Number.isFinite(audio.duration)&&audio.duration>0&&audio.buffered.length)bufferingBar.value=Math.min(100,audio.buffered.end(audio.buffered.length-1)/audio.duration*100);},{signal:mediaLifecycle.signal});
  audio.addEventListener('waiting',()=>{if(!finished)showBuffering()},{signal:mediaLifecycle.signal});audio.addEventListener('playing',hideBuffering,{signal:mediaLifecycle.signal});
  async function play(gesture=false){if(finished||selecting||arrival.transitioning||!arrival.chapterReady(index))return;delete audio.dataset.priming;const version=revision;if(pendingRevision===version&&!gesture)return;pendingRevision=version;showBuffering();audio.muted=false;audio.volume=1;audio.dataset.lectureReady='1';try{await audio.play();if(version!==revision||finished)return;blocked=false;audio.dataset.chapterTransition='0';sound.hidden=true;hideBuffering();}catch(error){if(version!==revision||finished)return;hideBuffering();blocked=true;sound.hidden=false;sound.textContent=error.name==='NotAllowedError'?'轻触开始讲解':'讲解未能播放，轻触重试';}finally{if(pendingRevision===version)pendingRevision=null;}}

  window.addEventListener('mentor-greeting-buffered',event=>{if(finished||index!==0||!audio.paused||audio.currentTime>.05||window.mentorPreparation?.openingChoice==='fallback')return;tracks[0]={...tracks[0],url:event.detail.url,text:event.detail.text};revision++;pendingRevision=null;prepareTrack(tracks[0].url);},{signal:mediaLifecycle.signal});
  async function select(){
   warmUpcoming(index);arrival.setChapter(index);if(index===0){if(audio.paused)void play();return;}
   audio.dataset.chapterTransition='1';revision++;const selectedRevision=revision;selecting=true;skip.disabled=false;bufferingBar.hidden=false;trackStart=performance.now();audio.pause();prepareTrack(tracks[index].url);
   let retries=0;while(!finished&&revision===selectedRevision&&arrival.transitioning){
    const sceneProgress=arrival.sceneProgress;if(sceneProgress&&sceneProgress.loaded<sceneProgress.total){buffering.hidden=false;bufferingLabel.textContent=(sceneProgress.name==='yiyuan'?'怡园':'拙政园')+(sceneProgress.error?'资源连接中断，正在重试':'场景载入中（'+sceneProgress.loaded+'/'+sceneProgress.total+'）');bufferingBar.hidden=false;bufferingBar.value=sceneProgress.loaded/sceneProgress.total*100;}
    if(arrival.transitionError){if(retries++<1){await wait(500);if(finished||revision!==selectedRevision)return;arrival.retryChapter(index);}else{selecting=false;buffering.hidden=false;bufferingLabel.textContent='场景未能准备好：'+arrival.transitionError;bufferingBar.hidden=true;sound.hidden=false;sound.textContent='重新载入当前场景';sound.onclick=event=>{event.stopPropagation();arrival.retryChapter(index);void select();};return;}}
    await wait(80);
   }
   if(finished||revision!==selectedRevision)return;selecting=false;skip.disabled=false;if(queuedAdvance){queuedAdvance=false;void advance();}else if(arrival.chapterReady(index))void play();
  }
  async function finish(){if(finished)return;finished=true;prepareWorkspace();clearWarm();revision++;if(window.mentorPreparation)window.mentorPreparation.cancelled=true;mediaLifecycle.abort();audio.onended=audio.onerror=null;clearInterval(voiceAnimTimer);greetingDetached=true;endArrival();disposeMusic();scene.dataset.phase='departure';captionPanel.hidden=true;sound.hidden=true;cancelAnimationFrame(frame);audio.pause();for(const event of ['pointerdown','touchend','click'])document.removeEventListener(event,unlock,true);document.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;try{await arrival.depart();}catch(error){finished=false;captionPanel.hidden=false;buffering.hidden=false;bufferingLabel.textContent=error.message;bufferingBar.hidden=true;sound.hidden=false;sound.textContent='继续返回主页';sound.onclick=()=>void finish();return;}if(document.documentElement.dataset.workspaceReady!=='true')await new Promise(resolve=>{if(document.documentElement.dataset.workspaceReady==='true')return resolve();window.addEventListener('workspace-ready',resolve,{once:true});});scene.dataset.phase='doorway-reveal';await wait(reduced?80:320);disposeAvatar();audio.removeAttribute('src');audio.load();document.dispatchEvent(new Event('mentor-resources-released'));await wait(0);if(window.mentorPreparation?.greetingSource){URL.revokeObjectURL(window.mentorPreparation.greetingSource);window.mentorPreparation.greetingSource=null;}scene.classList.add('lecture-is-leaving');resolve();}
  async function advance(manual=false){if(finished)return;if(selecting||arrival.transitioning||!arrival.chapterReady(index)){if(manual)queuedAdvance=true;return;}if(index+1<tracks.length){index++;select();}else await finish();}
  function unlock(event){if(finished||selecting||arrival.transitioning||(!blocked&&!audio.paused))return;trackStart=performance.now()-audio.currentTime*1000;void play(!!event?.isTrusted);}
  function key(event){if(event.key==='Escape')void finish();else unlock();}
  function visibility(){if(document.hidden)audio.pause();else if(!selecting&&!arrival.transitioning){trackStart=performance.now()-audio.currentTime*1000;void play();}}
  for(const event of ['pointerdown','touchend','click'])document.addEventListener(event,unlock,true);document.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);
  sound.onclick=event=>{event.stopPropagation();void play(true);};skip.onclick=()=>void advance(true);exit.onclick=()=>void finish();captions();loading.hidden=true;engineProgress.hidden=true;voiceLoading.hidden=true;position.hidden=subtitle.hidden=actions.hidden=false;
  audio.onended=()=>void advance();audio.onerror=()=>{if(!finished){hideBuffering();blocked=true;sound.hidden=false;sound.textContent='讲解未能载入，轻触重试';sound.onclick=event=>{event.stopPropagation();audio.load();void play(true);};}};select();update();
 });
}
