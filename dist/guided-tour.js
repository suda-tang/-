import {tourAudience,audiences} from './tour-audiences.js?v=research-depth-20261025';
import {onlineClassroomVoice} from './classroom-online-voice.js';
import {runTourDemo} from './tour-demonstrations.js?v=dual-route1';
import {createTourCopy} from './tour-copy.js?v=research-depth-20261025';
import {presentWelcome,researchFor,glideTo,pinTourHeader} from './tour-presentation.js?v=mentor-camera132-20261024';
import {registerTourEnglish} from './tour-english.js?v=reference-narration6';
import {narrationMedia} from './narration-media.js';
import {splitTourSpeech} from './tour-speech-chunks.js?v=research-depth1';
// 项目导览：缓缓移到目标 → 按目标圆角画高亮框 → 文字与人声同步 → 箭头指向目标。
// 语音走浏览器自带的 speechSynthesis，不需要联网；被浏览器拦下时退回定时讲解。
export async function initTour(){
 const params=new URLSearchParams(location.search);if(params.get('tour')!=='1')return;
 const unpinHeader=pinTourHeader();
 let mentor=(params.get('mentor')||'').trim().slice(0,50),direction=params.get('direction')||'education',visit=null;
 if(params.has('visit')){try{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);try{const response=await fetch('/mentor-visits.json',{signal:controller.signal});if(response.ok)visit=(await response.json())[params.get('visit')]||null;}finally{clearTimeout(timeout);}if(visit){mentor=visit.name;if(!params.has('direction'))direction=visit.direction;}}catch{}}
 const research=await researchFor(mentor,visit);if(research&&!params.has('direction'))direction=research.direction;direction=tourAudience(direction);
 const steps=createTourCopy(direction);
 const readyVoices=new Map(),warming=new Map();
 function prewarm(text){const locale=window.sudaLanguage?.getLocale()||'zh';const spoken=splitTourSpeech(locale==='zh'?text:(window.sudaLanguage?.translate(text)||text))[0]||'';const url='/api/tour-voice?role=narrator&locale='+encodeURIComponent(locale)+'&text='+encodeURIComponent(spoken);if(warming.has(url))return;const job=(async()=>{const start=performance.now();let tried=false;for(let n=0;n<100;n++){try{let data=readyVoices.get(url);if(!data){const r=await fetch(url,{signal:AbortSignal.timeout(6000)});data=await r.json();}if(data.status!=='complete'&&!tried&&performance.now()-start>=1800){tried=true;data=await onlineClassroomVoice(url)||data;}if(data.status==='complete'&&data.url){readyVoices.set(url,data);if(!data.streaming){const audio=new Audio();audio.preload='auto';audio.src=data.url;audio.load();}return;}}catch{}await new Promise(r=>setTimeout(r,400));}})();warming.set(url,job);}

 if(mentor)steps[0][3]=steps[0][3].replace(/^老师您好[，！!。]?/,`${mentor}老师，您好！`);
 if(research){const context=research.opening?.split('\n\n').find(p=>/论文|文章|报道|读到/.test(p));if(context)steps[0][3]+='\n\n'+context;}
 const researchQuestion=research?.question||visit?.question;
 if(researchQuestion)steps.at(-1)[3]+='\n\n'+researchQuestion;
 registerTourEnglish(steps,direction);
 let index=Math.max(0,steps.findIndex(s=>params.has('chapter')?s.id===params.get('chapter'):s[0]===params.get('panel'))),automatic=params.get('auto')!=='0',timer=0,version=0,closed=false,highlighted=null,revealFrame=0,boundaryChars=0,stepDuration=0,ringRadius=20;
 let voiceOn=true,voiceStarted=false,voiceBlocked=false,voiceAuto=false,voiceWaiting=false,utter=null;
 let recorded=null,recordedTracks=[],narrationGeneration=0;
 try{const r=await fetch('/narration/tour.json');if(r.ok)recordedTracks=await r.json();}catch{}
 const recordingIds={opening:'tang-opening',select:'tang-select',inputs:'tang-import','shared-time':'tang-play',practice:'tang-practice',arrange:'tang-arrange',tasks:'tang-tasks',research:'tang-closing'};
 const isSelection=()=>steps[index]?.id==='select';
 let demoController=null,demoBusy=false;const demonstrated=new Set();
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const box=document.createElement('aside');box.className='guided-tour';box.hidden=true;box.setAttribute('aria-label','项目导览');
 const greeting=document.createElement('div');greeting.className='tour-greeting';greeting.textContent=mentor?`${mentor}老师，您好。我是唐秋鸣。`:'您好，我是唐秋鸣。';
 const head=document.createElement('strong'),copy=document.createElement('p'),state=document.createElement('small'),actions=document.createElement('div'),prev=document.createElement('button'),next=document.createElement('button'),pause=document.createElement('button'),voice=document.createElement('button'),exit=document.createElement('button');
 const meter=document.createElement('div');meter.className='tour-time';meter.setAttribute('aria-hidden','true');meter.append(document.createElement('i'));
 const bar=meter.firstChild;
 head.id='tour-heading';copy.className='tour-copy';copy.tabIndex=0;copy.setAttribute('aria-label','本段讲稿');copy.setAttribute('aria-live','polite');prev.textContent='上一步';exit.textContent='结束导览';
 const source=document.createElement('a');source.className='tour-research';source.target='_blank';source.rel='noopener';const sourceURL=research?.source||visit?.source;if(sourceURL&&/^https?:\/\//.test(sourceURL)){source.href=sourceURL;source.textContent=research?`${research.basis} · ${research.title} ↗`:'研究线索：导师个人主页 ↗';}else source.hidden=true;
 const directory=document.createElement('details');directory.className='tour-directory';const contents=document.createElement('summary');contents.textContent='导览目录';directory.append(contents);const listing=document.createElement('div');let group='';
 for(const [i,step]of steps.entries()){if(step.group!==group){group=step.group;const label=document.createElement('strong');label.textContent=group;listing.append(label);}const item=document.createElement('button');item.type='button';item.textContent=String(i+1).padStart(2,'0')+'  '+step[2];item.onclick=()=>{directory.open=false;index=i;void render()};listing.append(item);}directory.append(listing);
 const demoArea=document.createElement('div');demoArea.className='tour-demo-area';const demoButton=document.createElement('button');demoButton.type='button';demoButton.textContent='演示这一项';const resultBox=document.createElement('details');resultBox.className='tour-demo-result';const resultTitle=document.createElement('summary');resultTitle.textContent='实际操作结果';const resultText=document.createElement('div');resultBox.append(resultTitle,resultText);resultBox.hidden=true;demoArea.append(demoButton,resultBox);
 demoButton.onclick=()=>void demonstrate();
 actions.append(prev,pause,voice,next,exit);box.append(greeting,head,directory,copy,demoArea,source,state,meter,actions);document.body.append(box);document.body.classList.add('has-guided-tour');
 function cancelDemo(){demoController?.abort();demoController=null;demoBusy=false;demoButton.disabled=false;}
 async function demonstrate(){
  const step=steps[index],token=version;if(!step.demo||demoBusy)return false;
  stopSpeak();cancel();demoController=new AbortController();demoBusy=true;demoButton.disabled=true;demoButton.textContent='正在演示';pause.textContent='停止演示';
  const ai=step.demo.startsWith('ai-');if(ai)box.hidden=true;
  try{const result=await runTourDemo(step.demo,{signal:demoController.signal,holdResults:true,onProgress:text=>{if(token===version)state.textContent=text}});if(token!==version||closed)return false;demonstrated.add(step.id);resultText.replaceChildren();
   if(typeof result==='string')resultText.textContent=result;
   else{for(const [label,text]of [['AI 回答',result.reply],['执行结果',result.execution]]){if(!text)continue;const heading=document.createElement('strong'),paragraph=document.createElement('p');heading.textContent=label;paragraph.textContent=text;resultText.append(heading,paragraph);}for(const link of result.links||[]){const anchor=document.createElement('a');anchor.href=link.href;anchor.textContent=link.text;anchor.target='_blank';anchor.rel='noopener';resultText.append(anchor,document.createElement('br'));}}
   if(step.demo==='library-categories'){const dialog=document.querySelector('.library-browser[open]');if(dialog)dialog.append(box);automatic=false;}
   resultBox.hidden=false;resultBox.open=true;state.textContent='演示已完成';return true;}
  catch(error){if(error.name!=='AbortError'&&token===version&&!closed){resultText.textContent=error.message;resultBox.hidden=false;resultBox.open=true;state.textContent='这项操作没有完成，原因保留在结果中';automatic=false;}return false;}
  finally{if(token===version&&!closed){if(step.demo!=='library-categories')document.body.append(box);box.hidden=false;demoBusy=false;demoController=null;demoButton.disabled=false;demoButton.textContent=demonstrated.has(step.id)?'再演示一次':'演示这一项';pause.textContent=automatic?'暂停讲解':'继续讲解';}}
 }


 // 高亮框自己画：圆角取目标元素的实际圆角再加外扩量，弧度和框体一致。
 const ring=document.createElement('div');ring.className='tour-ring';ring.hidden=true;
 // 箭头：从讲解卡边缘指向高亮框边缘。
 const ns='http://www.w3.org/2000/svg';
 const arrow=document.createElementNS(ns,'svg');arrow.setAttribute('class','tour-arrow');arrow.setAttribute('aria-hidden','true');
 const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker'),tip=document.createElementNS(ns,'path'),curve=document.createElementNS(ns,'path');
 marker.setAttribute('id','tour-arrow-head');marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','7.5');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','5.5');marker.setAttribute('markerHeight','5.5');marker.setAttribute('orient','auto');
 tip.setAttribute('d','M0 0 L10 5 L0 10 z');tip.setAttribute('fill','#a95e4d');
 marker.append(tip);defs.append(marker);arrow.append(defs,curve);document.body.append(ring,arrow);
 // hidden 在 SVG 元素上不一定生效，这里统一用 setAttribute 控制。
 const showArrow=visible=>{if(visible)arrow.removeAttribute('hidden');else arrow.setAttribute('hidden','');};
 ring.hidden=true;showArrow(false);
 const showRing=visible=>{ring.hidden=!visible;if(!visible)ring.classList.remove('is-on');};

 const PAD=8;
 const edgePoint=(rect,from,to)=>{const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,dx=to.x-from.x,dy=to.y-from.y;if(!dx&&!dy)return{x:cx,y:cy};const scale=1/Math.max(Math.abs(dx)/(rect.width/2||1),Math.abs(dy)/(rect.height/2||1));return{x:cx+dx*scale,y:cy+dy*scale};};
 // 高亮框的圆角跟着框体走：元素自己常被 CSS 抹成 0，就往上取最近一层有圆角的容器，
 // 否则会出现方角框套在圆角卡片里。外扩了 PAD，圆角也要加上 PAD 才同心。
 const radiusPx=value=>{const v=parseFloat(value);return Number.isFinite(v)&&String(value).includes('px')?v:0;};
 function radiusFor(el,h){
  let r=radiusPx(getComputedStyle(el).borderTopLeftRadius),node=el;
  while(!r&&(node=node.parentElement))r=radiusPx(getComputedStyle(node).borderTopLeftRadius);
  return Math.min((r||0)+PAD,Math.max(12,(h+PAD*2)/2));
 }
 function placeOverlay(){
  if(!highlighted||closed||isSelection()){showRing(false);showArrow(false);return;}
  const rect=highlighted.getBoundingClientRect();
  if(!rect.width&&!rect.height){showRing(false);showArrow(false);return;}
  // 元素比屏幕还长时（比如任务中心），只框住看得见的那一段，不然会画出上万个像素高的框。
  const vis={left:Math.max(rect.left,6),top:Math.max(rect.top,(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tour-header-height'))||0)+6),right:Math.min(rect.right,innerWidth-6),bottom:Math.min(rect.bottom,innerHeight-6)};
  if(vis.right-vis.left<12||vis.bottom-vis.top<12){showRing(false);showArrow(false);return;}
  showRing(true);showArrow(true);
  ring.style.left=(window.scrollX+vis.left-PAD)+'px';
  ring.style.top=(window.scrollY+vis.top-PAD)+'px';
  ring.style.width=(vis.right-vis.left+PAD*2)+'px';
  ring.style.height=(vis.bottom-vis.top+PAD*2)+'px';
  ring.style.borderRadius=ringRadius+'px';
  const outer={left:vis.left-PAD,top:vis.top-PAD,width:vis.right-vis.left+PAD*2,height:vis.bottom-vis.top+PAD*2};
  const boxRect=box.getBoundingClientRect();
  const bc={x:boxRect.left+boxRect.width/2,y:boxRect.top+boxRect.height/2};
  const tc={x:outer.left+outer.width/2,y:outer.top+outer.height/2};
  // 起点落在讲解卡朝向目标的那条边，终点落在高亮框朝向讲解卡的那条边。
  const start=edgePoint(boxRect,bc,tc),end=edgePoint(outer,tc,bc);
  const mx=(start.x+end.x)/2,my=(start.y+end.y)/2,nx=-(end.y-start.y),ny=(end.x-start.x),len=Math.hypot(nx,ny)||1,bend=Math.min(30,len*0.14);
  curve.setAttribute('d',`M${start.x} ${start.y} Q${mx+nx/len*bend} ${my+ny/len*bend} ${end.x} ${end.y}`);
  curve.setAttribute('marker-end','url(#tour-arrow-head)');
 }
 let overlayQueued=false;
 function scheduleOverlay(){if(overlayQueued||closed)return;overlayQueued=true;requestAnimationFrame(()=>{overlayQueued=false;placeOverlay();});}
 addEventListener('scroll',scheduleOverlay,{passive:true});addEventListener('resize',scheduleOverlay);
 async function follow(token,ms=2400){const t0=performance.now();while(performance.now()-t0<ms){if(token!==version||closed)return;placeOverlay();await wait(50);}}

 // 进度条：有语音时跟着朗读走，没有语音时按预计时长走。
 function meterFreeze(){const m=getComputedStyle(bar).transform;bar.style.transition='none';bar.style.transform=m==='none'?'scaleX(0)':m;}
 function meterRun(target,ms){bar.style.transition=ms?`transform ${ms}ms linear`:'none';bar.style.transform=`scaleX(${target})`;}
 function meterReset(){bar.style.transition='none';bar.style.transform='scaleX(0)';void bar.offsetWidth;}

 const canSpeak=typeof speechSynthesis!=='undefined'&&typeof SpeechSynthesisUtterance==='function';
 // 浏览器本来就不允许页面没被点过就出声；而且 Windows 上首次调用语音接口会去枚举
 // 系统语音，可能把主线程卡住（表现就是页面像卡死/打不开）。所以没点过页面之前
 // 连 getVoices 都不调，等用户点一下再整个接上。
 const activated=()=>{const ua=navigator.userActivation;return !ua||ua.hasBeenActive;};
 let zhVoice=null,voicesLoaded=false;
 function loadVoices(){if(!canSpeak||voicesLoaded)return;voicesLoaded=true;let list=[];try{list=speechSynthesis.getVoices()||[];}catch{}
 const zh=list.filter(v=>/^zh[-_]?(CN|Hans|SG)/i.test(v.lang)||/^zh/i.test(v.lang)||/chinese|中文|普通话|国语/i.test(v.name));
 // 尽量挑更自然的那个：系统里带 Natural / Online / Neural 的一般是神经网络
 // 语音，比传统合成音自然得多；再按常见的高质量中文音色兜底。
 zhVoice=zh.find(v=>/yunxi|云希|yunjian|云健|yunyang|云扬/i.test(v.name)&&/natural|online|neural/i.test(v.name))
  ||zh.find(v=>/yunxi|云希|yunjian|云健|yunyang|云扬|kangkang|康康/i.test(v.name))
  ||zh.find(v=>/natural|online|neural/i.test(v.name))
  ||zh.find(v=>/xiaoxiao|yaoyao|huihui|kangkang|晓晓|晓伊|云希|云扬|康康/i.test(v.name))
  ||zh.find(v=>/^zh[-_]?(CN|Hans|SG)/i.test(v.lang))||zh[0]||null;}
 function stopSpeak(invalidate=true){if(invalidate)narrationGeneration++;if(recorded){recorded.pause();recorded.src='';recorded=null;}if(!canSpeak)return;utter=null;try{speechSynthesis.cancel();}catch{}}
 function armTimer(ms){clearTimeout(timer);timer=setTimeout(async()=>{if(closed)return;const token=version;if(steps[index].demo&&!demonstrated.has(steps[index].id)){const ok=await demonstrate();if(!ok||token!==version||!automatic||closed)return;automatic=false;pause.textContent='继续讲解';state.textContent='结果已保留，查看后点下一步继续';return;}if(token!==version||closed||!automatic)return;index++;void render();},ms);}
 async function speak(text,sequence=null){
  const requestVersion=version,requestGeneration=++narrationGeneration;
  const narrationLocale=window.sudaLanguage?.getLocale()||'zh';
  const fullNarration=narrationLocale==='zh'?text:(window.sudaLanguage?.translate(text)||text);
  const chunks=sequence?.chunks||splitTourSpeech(fullNarration),chunkIndex=sequence?.index||0;
  if(!chunks.length||closed||sequence&&sequence.version!==version)return;
  const narrationText=chunks[chunkIndex];
  const continueChapter=()=>{if(closed||version!==requestVersion||requestGeneration!==narrationGeneration)return;
   if(chunkIndex+1<chunks.length&&voiceOn){void speak(text,{chunks,index:chunkIndex+1,version:requestVersion});return;}
   if(automatic&&index<steps.length-1)armTimer(1800);
  };
  if(chunks[chunkIndex+1])prewarm(chunks[chunkIndex+1]);
  if(voiceOn&&text&&!isSelection()){
   stopSpeak(false);voiceStarted=false;voiceWaiting=true;clearTimeout(timer);
   state.textContent='正在准备讲解';
   try{
    const locale=narrationLocale;const spokenText=narrationText;const endpoint='/api/tour-voice?role=narrator&locale='+encodeURIComponent(locale)+'&text='+encodeURIComponent(spokenText);
    for(let attempt=0;attempt<80;attempt++){
     let data=readyVoices.get(endpoint);if(!data){const response=await fetch(endpoint,{signal:AbortSignal.timeout(6000)});if(!response.ok)throw Error('语音服务暂不可用');data=await response.json();}if(data.status!=='complete'&&attempt===5)data=await onlineClassroomVoice(endpoint)||data;
     if(closed||version!==requestVersion||requestGeneration!==narrationGeneration)return;
     if(data.status==='failed')throw Error(data.message);
     if(data.status==='complete'){
      voiceWaiting=false;const a=narrationMedia();a.src=data.url;a.muted=false;a.preservesPitch=true;a.playbackRate=1.4;recorded=a;
      const started=()=>{if(recorded!==a||a.paused||a.currentTime<.05)return;clearTimeout(timer);voiceStarted=true;state.textContent='正在讲解';};a.onplaying=started;a.onwaiting=()=>{if(recorded===a){voiceStarted=false;state.textContent='正在缓冲讲解音频…';}};a.onstalled=a.onwaiting;
      a.ontimeupdate=()=>{if(recorded===a&&!a.paused&&a.currentTime>=.05&&!voiceStarted){voiceStarted=true;clearTimeout(timer);state.textContent='正在讲解';}if(recorded===a&&Number.isFinite(a.duration))meterRun((chunks.slice(0,chunkIndex).join('').length+narrationText.length*a.currentTime/a.duration)/fullNarration.length,0);};
      a.onended=()=>{if(recorded!==a||requestGeneration!==narrationGeneration)return;voiceStarted=false;continueChapter();};
      a.onerror=()=>{if(recorded===a){voiceStarted=false;state.textContent='讲解音频未能播放，请重试';}};
      await a.play().catch(()=>{state.textContent='轻触页面继续讲解';voiceWaiting=true;});return;
     }
     await new Promise(resolve=>setTimeout(resolve,300));
    }
   }catch(error){if(closed||version!==requestVersion||requestGeneration!==narrationGeneration)return;console.warn('Natural tour narration',error);}
   voiceWaiting=false;
  }

  const track=recordedTracks.find(t=>t.id===recordingIds[steps[index].id]);
  // Custom research text must never be narrated with a different cached script.
  if(track&&track.text?.trim()===text.trim()&&!isSelection()&&!research&&!visit){
   stopSpeak(false);const a=narrationMedia();a.src=track.url;a.muted=false;a.preservesPitch=true;a.playbackRate=1.4;recorded=a;copy.textContent=track.text;
   a.onplaying=()=>{if(recorded!==a||requestGeneration!==narrationGeneration)return;clearTimeout(timer);voiceStarted=true;state.textContent='唐秋鸣讲解 · 合成语音';};
   a.ontimeupdate=()=>{if(recorded===a&&!a.paused&&a.currentTime>=.05&&!voiceStarted){voiceStarted=true;clearTimeout(timer);state.textContent='正在讲解';}if(recorded===a&&Number.isFinite(a.duration))meterRun(a.currentTime/a.duration,0);};
   a.onended=()=>{if(recorded!==a||requestGeneration!==narrationGeneration)return;voiceStarted=false;if(automatic&&index<steps.length-1)armTimer(1800);};
   a.onerror=()=>{if(recorded===a){state.textContent='语音未能播放，可以继续阅读或重试';voiceStarted=false;}};
   a.play().catch(()=>{state.textContent='点击“播放讲解”即可听这一段';});return;
  }
  if(!canSpeak||!voiceOn||!text||isSelection())return;
  if(!activated()){voiceWaiting=true;return;}
  voiceWaiting=false;loadVoices();
  stopSpeak(false);voiceStarted=false;voiceBlocked=false;
  const current=new SpeechSynthesisUtterance(narrationText);
  utter=current;
  let systemVoice=zhVoice;if(narrationLocale!=='zh'){const prefix={'zh-Hant':'zh-TW',yue:'zh-HK'}[narrationLocale]||narrationLocale;const candidates=speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith(prefix.toLowerCase()));systemVoice=candidates.find(v=>/guy|henri|conrad|alvaro|keita|injoon|wanlung|yunjhe|antonio|male/i.test(v.name))||candidates[0]||null;}if(systemVoice)current.voice=systemVoice;
  // 默认 rate=1 念中文偏快偏平，听起来很机械：语速放慢一点、音高略抬一点。
  current.lang=systemVoice?.lang||({'zh-Hant':'zh-TW',yue:'zh-HK',zh:'zh-CN'}[narrationLocale]||narrationLocale);current.rate=1.3;current.pitch=1;
  // 每个回调都先确认自己还是当前这条，免得被取消的旧朗读把新的一步顶掉。
  current.onstart=()=>{if(utter!==current)return;voiceStarted=true;voiceBlocked=false;clearTimeout(timer);timer=0;state.textContent=automatic?'语音讲解中 · 点页面即可暂停':'语音讲解中 · 点“继续讲解”接着走';};
  current.onboundary=event=>{if(utter!==current)return;if(typeof event.charIndex==='number'&&event.charIndex>boundaryChars)boundaryChars=event.charIndex;};
  current.onend=()=>{if(utter!==current||closed||requestGeneration!==narrationGeneration)return;meterFreeze();continueChapter();if(chunkIndex===chunks.length-1&&index===steps.length-1){state.textContent='导览结束。您可以继续查看，或直接试用。';pause.hidden=true;}};
  current.onerror=event=>{
   if(utter!==current)return;
   const reason=(event&&event.error)||'';
   if(reason==='not-allowed'||reason==='synthesis-failed'||reason==='audio-busy'||reason==='audio-hardware'){
    blockVoice();
   }else if(!closed&&automatic&&!voiceStarted){armTimer(Math.max(5000,stepDuration));}
  };
  try{speechSynthesis.speak(current);}catch{blockVoice();}
  // 有些浏览器不报错、只是不出声，超时没开始就按“没放行”处理。
  setTimeout(()=>{if(!closed&&utter===current&&!voiceStarted&&!voiceBlocked)blockVoice();},1600);
}
// 语音被拦下：退回定时讲解，按钮改成“开启语音”，用户点一下页面就能补上。
 function blockVoice(){
  voiceBlocked=true;voiceOn=false;voiceStarted=false;voiceAuto=true;
  if(!canSpeak||closed)return;
  setVoiceButton();schedule();state.textContent='可以先读文字，也可以随时停下来操作';
 }
// 点过页面之后（或语音曾被拦下）自动把语音接回来。
 function retryVoice(){
  if(!canSpeak||closed)return false;
  if(!voiceOn&&!voiceAuto)return false;
  if(!activated())return false;
  if(voiceOn&&voiceStarted)return false;
  voiceOn=true;voiceBlocked=false;voiceAuto=false;voiceWaiting=false;setVoiceButton();return true;
 }

 // 文字跟着人声往外走：语音边界事件是主，按字速推进是兜底，两者取快的一个。
 function stopReveal(){if(revealFrame)cancelAnimationFrame(revealFrame);revealFrame=0;}
 function startReveal(text,token){
  stopReveal();boundaryChars=0;copy.textContent=text;
  if(!reduce.matches)copy.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:650,easing:'ease-out'});
 }

 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const cancel=()=>{clearTimeout(timer);timer=0;meterFreeze();};
 function stopAuto(reason='已暂停，可以自己操作'){automatic=false;cancel();recorded?.pause();pause.textContent='继续讲解';state.textContent=reason;if(canSpeak&&speechSynthesis.speaking&&!speechSynthesis.paused){try{speechSynthesis.pause();}catch{}}}
 function schedule(){
  cancel();
  if(isSelection()){pause.hidden=true;state.textContent='选择作品后继续；也可以跳过选曲';return;}
  if(!automatic){pause.textContent='继续讲解';state.textContent='已暂停，可以自己操作';return;}
  pause.textContent='暂停讲解';
  if(index===steps.length-1){state.textContent='导览结束。您可以继续查看，或直接试用。';pause.hidden=true;return;}
  if(voiceOn&&(voiceWaiting||voiceStarted||recorded)){clearTimeout(timer);return;}
  stepDuration=Math.max(18000,steps[index][3].length*230);
  if(voiceOn&&canSpeak&&voiceStarted){}   // 语音在走，进度条由朗读驱动，不另起定时
  else{
   state.textContent=voiceOn&&canSpeak?(activated()?'正在准备讲解…':'读完后会继续，您也可以自己往下看'):'您可以随时停下来看看';
   meterReset();meterRun(1,stepDuration);
  }
  armTimer(stepDuration);
 }
 // 滚到目标附近、等页面停下来，再让文字出现。
 async function settle(token,max=1800){
  const t0=performance.now();
  if(!reduce.matches){let last=window.scrollY,still=0;
   while(performance.now()-t0<max){await wait(60);if(token!==version||closed)return;const now=window.scrollY;if(Math.abs(now-last)<1){if(++still>=2)break;}else still=0;last=now;}}
  const left=520-(performance.now()-t0);if(left>0)await wait(left);
 }
 async function render(){
  cancelDemo();const token=++version;cancel();stopReveal();stopSpeak();voiceStarted=false;
  const [panel,target,title,text]=steps[index];
  if(!isSelection()&&document.querySelector('.library-browser[open]'))await document.querySelector('.score-library')?.tourClose?.();
  if(token!==version||closed)return;
  box.hidden=false;document.body.append(box);
  if(!reduce.matches)box.animate([{opacity:0,transform:'perspective(1000px) translateY(20px) rotateY(-7deg)'},{opacity:1,transform:'perspective(1000px) translateY(0) rotateY(0)'}],{duration:650,easing:'cubic-bezier(.16,1,.3,1)'});
  pause.hidden=false;pause.textContent=automatic?'暂停讲解':'继续讲解';
  if(highlighted)highlighted.classList.remove('tour-focus');
  highlighted=null;showRing(false);showArrow(false);
  document.querySelector(`[data-panel="${panel}"]`)?.click();
  source.hidden=!sourceURL||!['opening','arrange','research'].includes(steps[index].id);
  head.textContent=`${index+1} / ${steps.length}　${title}`;
  // 访问采集：导览每切到一段就报一次，供统计「看了哪几段、各停留多久」。
  try{document.dispatchEvent(new CustomEvent('mentor-tour-step',{detail:{id:steps[index].id,index,total:steps.length,title,panel,text:(text||'').slice(0,1200),demo:!!steps[index].demo}}));}catch{}
  demoArea.hidden=!steps[index].demo;resultBox.hidden=true;resultBox.open=false;demoButton.textContent=demonstrated.has(steps[index].id)?'再演示一次':'演示这一项';
  listing.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-current',String(i===index)));
  copy.scrollTop=0;copy.style.minHeight='';copy.textContent=text;copy.style.minHeight=copy.getBoundingClientRect().height+'px';copy.textContent='';
  prev.disabled=index===0;next.textContent=index===steps.length-1?'回到开头':'下一步';
  state.textContent='正在移到对应功能';
  for(let n=0;n<80&&document.querySelector('.workspace-stage.is-moving');n++)await wait(25);
  if(token!==version||closed)return;
  if(isSelection()){
   copy.textContent=text;pause.hidden=true;next.textContent='跳过选曲';state.textContent='正在展开云曲库';
   await glideTo(document.querySelector('.score-library'),{cancelled:()=>token!==version||closed});if(token!==version||closed)return;
   for(let n=0;n<200&&!document.querySelector('.score-library')?.tourOpen;n++){if(token!==version||closed)return;await wait(75);}
   try{const dialog=await document.querySelector('.score-library')?.tourOpen?.();if(token!==version||closed)return;if(dialog?.open){dialog.append(box);box.hidden=false;state.textContent='选一首作品，载入后继续';}else state.textContent='曲库尚未准备好，可以稍后重试或跳过';}catch(e){state.textContent=e.message;}return;
  }
  highlighted=document.querySelector(target);
  if(highlighted){
   if(highlighted.matches('details'))highlighted.open=true;
   await glideTo(highlighted,{cancelled:()=>token!==version||closed,duration:1400});
   await settle(token);
   if(token!==version||closed)return;
   highlighted.classList.add('tour-focus');
   ringRadius=radiusFor(highlighted,highlighted.getBoundingClientRect().height);
   placeOverlay();ring.classList.add('is-on');
   void follow(token);
  }
  const nextText=steps[index+1]?.[3];if(nextText&&steps[index+1].id!=='select')prewarm(nextText);
  startReveal(text,token);
  retryVoice();
  speak(text);
  schedule();
 }
 prev.onclick=()=>{index=Math.max(0,index-1);void render();};
 next.onclick=()=>{index=(index+1)%steps.length;void render();};
 pause.onclick=()=>{if(demoBusy){cancelDemo();stopAuto('演示已停止');return;}automatic=!automatic;if(automatic){if(recorded)recorded.play().catch(()=>{});else if(!utter||!speechSynthesis?.paused){voiceOn=true;voiceWaiting=false;void speak(steps[index][3]);}if(canSpeak&&voiceOn&&utter&&speechSynthesis.paused){try{speechSynthesis.resume();}catch{}}schedule();}else stopAuto();};
// 朗读改成自动的，不再放开关：voiceOn 恒为 true，按钮直接隐藏。
// 浏览器按自动播放策略可能拦下首次发声，这时由 manual（用户任意一次滚动 /
// 点击 / 按键）里的 retryVoice() 自动把语音接回来，不需要用户去点开关。
const setVoiceButton=()=>{voice.textContent=recordedTracks.length&&!research&&!visit?'播放讲解':voiceOn?'关闭系统朗读':'系统朗读';};
setVoiceButton();
voice.hidden=true;
voice.onclick=()=>{if(recordedTracks.length&&!research&&!visit){voiceOn=true;speak(steps[index][3]);return;}if(!canSpeak)return;voiceOn=!voiceOn;voiceAuto=false;setVoiceButton();if(!voiceOn){stopSpeak();schedule();return;}voiceBlocked=false;voiceStarted=false;state.textContent='正在准备系统朗读…';speak(steps[index][3]);};
 let inIntro=true,selecting=false;
 const onLibraryClose=()=>{document.body.append(box);if(isSelection()&&!selecting)state.textContent='已收起曲库，可以重新展开选曲或跳过';};
 const onLibraryOpen=e=>{if(isSelection()&&!closed){box.hidden=true;e.detail.browser.append(box);}};
 const onFlight=()=>{if(!closed)box.hidden=true;};
 const onFlightEnd=()=>{if(!closed&&!selecting&&!inIntro){box.hidden=false;}};
 document.addEventListener('library-flight-layer',onFlight);document.addEventListener('library-flight-finished',onFlightEnd);
 const onLoading=()=>{if(isSelection()){selecting=true;box.hidden=true;cancel();stopSpeak();}};
 const onSelected=e=>{if(closed||!isSelection())return;selecting=false;box.hidden=false;if(e.detail.error){state.textContent='作品未能打开：'+e.detail.error;return;}if(!e.detail.ready){state.textContent='这首作品还在识别，请选择已就绪的作品或跳过';return;}index=Math.max(0,steps.findIndex(s=>s.id==='source-check'));automatic=true;void render();};
 document.addEventListener('library-tour-opened',onLibraryOpen);document.addEventListener('library-tour-closed',onLibraryClose);document.addEventListener('library-tour-loading',onLoading);document.addEventListener('library-tour-selected',onSelected);
 const manual=event=>{if(!event.isTrusted||inIntro||isSelection())return;if(recorded&&voiceWaiting&&recorded.paused){voiceWaiting=false;voiceOn=true;void recorded.play().catch(()=>{voiceWaiting=true;state.textContent='轻触页面继续讲解';});return;}if(voiceWaiting&&!recorded)return;if(retryVoice()){void speak(steps[index][3]);return;}if(!box.contains(event.target))stopAuto();},onVisibility=()=>{if(document.hidden)stopAuto('已暂停，返回后可继续讲解');};
 for(const type of ['wheel','pointerdown','keydown'])document.addEventListener(type,manual,{passive:true});document.addEventListener('visibilitychange',onVisibility);
 addEventListener('pagehide',stopSpeak,{once:true});
 exit.onclick=()=>{cancelDemo();unpinHeader();document.removeEventListener('library-flight-layer',onFlight);document.removeEventListener('library-flight-finished',onFlightEnd);document.removeEventListener('library-tour-opened',onLibraryOpen);document.removeEventListener('library-tour-closed',onLibraryClose);document.removeEventListener('library-tour-loading',onLoading);document.removeEventListener('library-tour-selected',onSelected);closed=true;document.removeEventListener('languagechange',onNarrationLanguageChange);version++;cancel();stopReveal();stopSpeak();if(highlighted)highlighted.classList.remove('tour-focus');highlighted=null;ring.remove();arrow.remove();box.remove();document.body.classList.remove('has-guided-tour');removeEventListener('scroll',scheduleOverlay);removeEventListener('resize',scheduleOverlay);for(const type of ['wheel','pointerdown','keydown'])document.removeEventListener(type,manual);document.removeEventListener('visibilitychange',onVisibility);};
 const onNarrationLanguageChange=()=>{if(closed||box.hidden)return;version++;stopSpeak();if(voiceOn)void speak(steps[index][3]);};document.addEventListener('languagechange',onNarrationLanguageChange);
 let primedOpening=false;const primeAfterMentor=event=>{if(!primedOpening&&event.detail?.speaking&&event.detail?.elapsed>1){primedOpening=true;document.removeEventListener('mentor-lesson',primeAfterMentor);prewarm(steps[index][3]);}};document.addEventListener('mentor-lesson',primeAfterMentor);
 await presentWelcome({mentor,visit,focus:visit?.focus||audiences[direction].label});
 document.removeEventListener('mentor-lesson',primeAfterMentor);if(!primedOpening)prewarm(steps[index][3]);inIntro=false;if(!closed)void render();
}
