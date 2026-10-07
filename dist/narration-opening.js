import {attachLectureMusic} from './lecture-music.js?v=5';
import {attachNarrationAvatar} from './narration-avatar.js?v=auto-discovery6';
import {narrationMedia} from './narration-media.js';
const boards={
 'mentor-preface':{title:'异地合奏',points:['时间码同步','网络延迟补偿','演奏者的体验']},
 'mentor-context':{title:'钢琴教学',points:['谱面与声音','练习中的反馈','课堂中的验证']},
 'mentor-material':{title:'一首作品的学习过程',points:['乐谱','聆听','练习']}
};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function openingNarration(scene){
 if(!document.querySelector('link[data-mentor-cinematic]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/mentor-cinematic.css?v=22';style.dataset.mentorCinematic='';document.head.append(style);}
 scene.classList.add('mentor-cinematic');scene.dataset.phase='loading';const content=scene.querySelector('.home-intro-content');content.replaceChildren();
 const brand=document.querySelector('.top .brand strong');if(brand)scene.style.setProperty('--mentor-accent',getComputedStyle(brand).color);
 const host=document.createElement('div');host.className='mentor-cinematic-host';content.append(host);
 const sound=document.createElement('button');sound.type='button';sound.className='mentor-sound-unlock';sound.hidden=true;sound.textContent='轻触开始讲解';content.append(sound);
 const audio=narrationMedia();const disposeMusic=attachLectureMusic(audio);content.append(audio);
 const captionPanel=document.createElement('div');captionPanel.className='mentor-caption-panel';
 const loading=document.createElement('div');loading.className='mentor-loading';loading.setAttribute('role','status');
 const spinner=document.createElement('span');spinner.className='mentor-loading-spinner';spinner.setAttribute('aria-hidden','true');
 const loadingText=document.createElement('span');loadingText.textContent='唐秋鸣导师数字人正在加载中';loading.append(spinner,loadingText);captionPanel.append(loading);content.append(captionPanel);
 const voiceLoading=document.createElement('div');voiceLoading.className='mentor-voice-loading';voiceLoading.hidden=true;const voiceLabel=document.createElement('span'),voicePercent=document.createElement('span');voiceLabel.textContent='TangQiuMingVision数字人物引擎加载中';voicePercent.textContent='0%';voiceLoading.append(voiceLabel,voicePercent);captionPanel.append(voiceLoading);
 const engineProgress=document.createElement('progress');engineProgress.max=100;engineProgress.value=0;engineProgress.hidden=true;engineProgress.className='mentor-engine-progress';engineProgress.setAttribute('aria-label','专属语音生成进度');captionPanel.append(engineProgress);let voiceProgress=0;function showEngineProgress(){voiceLoading.hidden=false;engineProgress.hidden=false;const percent=Math.round(voiceProgress*100);voicePercent.textContent=percent+'%';engineProgress.value=percent;}
 let generated=[];try{const response=await fetch('/narration/tour.json');if(response.ok)generated=await response.json();}catch{}
 const continueButton=document.createElement('button');continueButton.type='button';continueButton.className='mentor-greeting-continue';continueButton.textContent='先听项目介绍';continueButton.hidden=true;captionPanel.append(continueButton);let continueIntro,greetingDetached=false;const continueReady=new Promise(resolve=>{continueIntro=()=>resolve({useExisting:true});});continueButton.onclick=()=>{greetingDetached=true;voiceLoading.hidden=true;engineProgress.hidden=true;continueButton.hidden=true;continueIntro();};
 const greetingName=scene.dataset.mentor;let greetingState=null;const greetingReady=greetingName?(async()=>{while(scene.isConnected&&!greetingDetached){try{const r=await fetch('/api/mentor-greeting?name='+encodeURIComponent(greetingName));greetingState=await r.json();if(greetingState.url){voiceProgress=1;voiceLoading.hidden=true;engineProgress.hidden=true;return greetingState;}if(greetingState.status==='failed'){voiceLoading.hidden=false;voiceLabel.textContent='专属前言生成失败：'+(greetingState.error||'请稍后重试');return null;}continueButton.hidden=false;voiceProgress=Number(greetingState.progress??({queued:0,loading:20,synthesizing:60,joining:90}[greetingState.status]||0))/100;showEngineProgress();}catch{voiceLoading.hidden=false;voiceLabel.textContent='专属前言连接中断，正在重试';}await wait(3000);}return null;})():Promise.resolve(null);
 const tracks=generated.filter(track=>track.role==='mentor'&&track.url);
 if(!tracks.length)tracks.push({id:'mentor-preface',url:'/narration/mentor-preface.m4a'});
 audio.src=tracks[0].url;audio.load();let arriving=true;
 const prime=()=>{if(!arriving)return;void audio.play().then(()=>{if(arriving){audio.pause();audio.currentTime=0;}}).catch(()=>{});};
 for(const event of ['pointerdown','touchend','click'])document.addEventListener(event,prime,true);
 function endArrival(){arriving=false;for(const event of ['pointerdown','touchend','click'])document.removeEventListener(event,prime,true);}
 let translations={};try{translations=await (await fetch('/narration/mentor-subtitles.json')).json();}catch{}
 const position=document.createElement('span'),subtitle=document.createElement('p'),actions=document.createElement('div'),skip=document.createElement('button'),exit=document.createElement('button');
 position.className='mentor-segment';subtitle.className='mentor-subtitle';subtitle.setAttribute('aria-live','off');actions.className='mentor-caption-actions';skip.type=exit.type='button';position.hidden=subtitle.hidden=actions.hidden=true;actions.append(skip,exit);captionPanel.append(position,subtitle,actions);
 const disposeAvatar=attachNarrationAvatar(host,audio,{embedded:true,cinematic:true});
 const loaded=await new Promise(resolve=>{const timeout=setTimeout(()=>{observer.disconnect();resolve(false);},20000);const observer=new MutationObserver(()=>{const avatar=host.querySelector('.narration-avatar');if(avatar?.dataset.ready||avatar?.dataset.error){clearTimeout(timeout);observer.disconnect();resolve(!!avatar.dataset.ready);}});observer.observe(host,{subtree:true,attributes:true});});
 window.dispatchEvent(new CustomEvent('mentor-stage-ready',{detail:{loaded}}));
 if(!loaded){endArrival();audio.pause();disposeAvatar();return;}
 loading.hidden=true;scene.dataset.phase='arrival';await wait(matchMedia('(prefers-reduced-motion:reduce)').matches?400:5600);endArrival();const greeting=await Promise.race([greetingReady,continueReady]);continueButton.hidden=true;if(greetingName&&!greeting){continueButton.hidden=false;endArrival();audio.pause();sound.hidden=false;sound.textContent='前言生成失败，轻触重新载入';sound.onclick=async()=>{await fetch('/api/mentor-greeting?retry=1&name='+encodeURIComponent(greetingName));location.reload();};await continueReady;sound.hidden=true;continueButton.hidden=true;}if(greeting&&!greeting.useExisting){tracks[0]={...tracks[0],url:greeting.url,text:greeting.text};}scene.dataset.phase='lecture';
 return new Promise(resolve=>{
  let index=0,finished=false,blocked=false,frame=0,trackStart=performance.now(),lastDraw=0,revision=0;
  function captions(elapsed=0,duration=1){
   const locale=document.documentElement.lang.split('-')[0],labels={zh:['第','段','跳过本段','结束讲解'],en:['Part','','Skip this part','End introduction'],fr:['Partie','','Passer','Terminer'],de:['Teil','','Überspringen','Einführung beenden'],es:['Parte','','Saltar','Terminar'],ja:['第','部','この部分をスキップ','紹介を終了'],ko:['','','이 부분 건너뛰기','소개 종료']}[locale]||['Part','','Skip this part','End introduction'];
   position.textContent=`${labels[0]} ${index+1} / ${tracks.length} ${labels[1]}`;skip.textContent=labels[2];exit.textContent=labels[3];
   const text=locale==='zh'?tracks[index].text:(translations[locale]?.[tracks[index].id]||tracks[index].text);
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
  async function play(){const version=revision;audio.muted=false;audio.volume=1;try{await audio.play();if(version!==revision||finished)return;blocked=false;audio.dataset.chapterTransition='0';sound.hidden=true;}catch(error){if(version!==revision||finished)return;blocked=true;sound.hidden=false;sound.textContent=error.name==='NotAllowedError'?'轻触开始讲解':'讲解未能播放，轻触重试';}}
  function select(){audio.dataset.chapterTransition='1';revision++;trackStart=performance.now();audio.src=tracks[index].url;audio.load();void play();}
  async function finish(){if(finished)return;finished=true;disposeMusic();scene.dataset.phase='departure';captionPanel.hidden=true;sound.hidden=true;cancelAnimationFrame(frame);audio.pause();document.dispatchEvent(new CustomEvent('mentor-departure'));for(const event of ['pointerdown','touchend','click'])document.removeEventListener(event,unlock,true);document.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;await wait(reduced?100:2400);scene.dataset.phase='smoke';await wait(reduced?100:1000);disposeAvatar();audio.removeAttribute('src');audio.load();scene.classList.add('lecture-is-leaving');resolve();}
  async function advance(){if(finished)return;if(index+1<tracks.length){index++;select();}else await finish();}
  function unlock(){if(finished||(!blocked&&!audio.paused))return;trackStart=performance.now()-audio.currentTime*1000;void play();}
  function key(event){if(event.key==='Escape')void finish();else unlock();}
  function visibility(){if(document.hidden)audio.pause();else{trackStart=performance.now()-audio.currentTime*1000;void play();}}
  for(const event of ['pointerdown','touchend','click'])document.addEventListener(event,unlock,true);document.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);
  skip.onclick=()=>void advance();exit.onclick=()=>void finish();captions();loading.hidden=true;engineProgress.hidden=true;voiceLoading.hidden=true;position.hidden=subtitle.hidden=actions.hidden=false;
  audio.onended=()=>void advance();audio.onerror=()=>{const version=revision;if(!finished)setTimeout(()=>{if(version===revision)void advance();},1000);};select();update();
 });
}
