import {presentWelcome,researchFor,glideTo,pinTourHeader} from './tour-presentation.js';
// 项目导览：缓缓移到目标 → 按目标圆角画高亮框 → 文字与人声同步 → 箭头指向目标。
// 语音走浏览器自带的 speechSynthesis，不需要联网；被浏览器拦下时退回定时讲解。
export async function initTour(){
 const params=new URLSearchParams(location.search);if(params.get('tour')!=='1')return;
 const unpinHeader=pinTourHeader();
 let mentor=(params.get('mentor')||'').trim().slice(0,50),direction=params.get('direction')||'ensemble',visit=null;
 if(params.has('visit')){try{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);try{const response=await fetch('/mentor-visits.json',{signal:controller.signal});if(response.ok)visit=(await response.json())[params.get('visit')]||null;}finally{clearTimeout(timeout);}if(visit){mentor=visit.name;direction=visit.direction;}}catch{}}
 const research=await researchFor(mentor,visit);if(research)direction=research.direction;
 const opening={
  ensemble:'我平时弹钢琴，也给人伴奏。最早想做异地 MIDI 合奏，就是希望人在不同地方也能一起排练，不用每次都凑到一间琴房。您现在看到的这个网页，是我后来做的钢琴学习原型，跟远程合奏不是同一个程序。我想借它给您看几个我还没想明白的问题，您随时可以停下来自己点一点。',
  education:'我学的是音乐教育。做这个网页的时候我一直在想一件事：给学生把错音标出来之后，他下一遍到底会怎么练？我想先带您看看这个原型，再说说哪些反馈值得拿进课堂做研究。',
  generation:'让程序生成一份能播放的总谱不难，难的是各声部真的合在一起。这个原型把生成、试听、核对的过程都留下来了。我想让您看看我做到哪儿了，又卡在哪儿。'
 };
 const ending={
  ensemble:'接下来我想回到双人异地 MIDI 合奏，把网络延迟控制住，比较几种补偿办法。除了看两个音差了多少毫秒，我还想知道演奏者有没有一直在追对方，还能不能主动带起一句音乐。这一点我特别想听您的意见。',
  education:'我想先比较两种反馈：一边弹一边提示，和弹完一个乐句再提示。练习时间一样的情况下，学生把提示关掉之后还能不能改过来，我觉得比眼前分数涨了多少更值得看。这个实验还得再设计细一点。',
  generation:'我想把问题缩小到分层练习素材：保持原曲结构，再加上声部和难度的约束，生成的练习材料会不会更适合教学？我希望让老师盲评、学生试奏来参与判断，而不是只让生成模型给自己打分。'
 };
 const steps=[
  ['library','.score-library','我为什么从合奏做起',opening[direction]||opening.ensemble],
  ['library','.score-import','先把手里的谱子放进来','平时拿到的谱子很少是同一种格式。有的是 PDF，有的是手机拍的几页纸，也有人只有一段录音。我把这些入口放在一起，是想让使用者从自己手里的材料开始。照片可以先排好页序，再一起处理。\n\n不过，能上传和能用是两回事。我之前遇到过左右手混在一起、拍号读错的情况。所以这里保留了原稿，识别后的电子谱也要回头核对。要是拿它做教学研究，这一步就更不能省：否则我们以为在观察学生，其实是在观察程序的错误。'],
  ['play','.playback-panel','先听这一段','您可以先选一小段熟悉的旋律，按播放听听，再放慢一点对着谱看。我做这个播放器时，有个问题反复改了很久：音符看着都在，到了小节末尾却会停一下。后来排查到拍号和时值的解析，才发现并不是换个钢琴音色就能解决。\n\n这件事让我对“自然演奏”谨慎了不少。演奏需要呼吸，但不能把拍子弄乱。我想先把该有的节奏核准，再讨论力度、句尾和左右手的关系。您听的时候，也可以留意伴奏有没有在托着旋律走。'],
  ['play','.practice-settings','提示出现以后，学生怎么练','这一处是我最想继续研究的。程序能指出错音和时间偏差，可学生看到以后，是听明白了，还是只是照着提示又弹了一遍？光看下一次的分数，我觉得还分不清。\n\n我想先把条件收得小一点：练同一段，一组边弹边看提示，另一组等乐句弹完再看；练习时间保持一致，然后关掉提示再弹。除了错音，还想看他在哪儿停、会从哪里重新开始。这目前是我准备推进的实验问题，还不是已经得到的结论。您可以展开这里看操作，麦克风需要主动开启。'],
  ['arrange','#arrangement-workspace','这几条声部，放在一起好听吗','这里可以换编制，再看各乐器生成的声部。我最不满意的一类结果，是每条声部单独听似乎都能说得通，合起来却一直在抢，钢琴、弦乐和鼓谁也不让谁。只检查音符有没有超出音域，显然不够。\n\n所以我想把“生成完了”后面的工作补上：先听声部怎样进入、怎样给旋律留位置，再看学生是否弹得下来。如果用于教学，我宁愿先做好几种有限的织体，也不想一下子给出很多种看着完整、实际不好用的编配。'],
  ['tasks','.task-center','让等待留在后台','这页看起来偏工程，但它影响的是人能不能顺畅地用下去。识谱和编配有时要等，如果一直挡住页面，刚才想听的那一处很容易就被打断了。我把这些工作放进队列，让人可以先看原稿、先听已经能播放的部分。\n\n这里显示的是实际任务，您可以点开看是哪首作品、进行到哪一步。如果出错，我希望它说清楚卡在哪儿，而不是只剩一个一直转的圈。做课堂里的工具，等待和出错怎么处理，也是教学过程的一部分。'],
  ['play','.playback-panel','还有一个问题，想请教您',ending[direction]||ending.ensemble]
 ];
 if(visit){steps[0][3]=`${mentor}老师，这次我想先围绕${visit.focus}跟您聊聊。${opening[direction]||opening.ensemble}`;steps[steps.length-1][3]=visit.question||steps[steps.length-1][3];}
 if(research){steps[0][3]=research.opening;steps[0][2]=research.heading||'我想向您请教的问题';if(research.play)steps[2][3]=research.play;if(research.arrange)steps[4][3]=research.arrange;steps[6][3]=research.question;}
 steps.splice(1,0,['library','.library-list','请在全屏曲库里选一首','这里请您挑一首熟悉的作品。熟悉的旋律更容易听出哪里不对，我们就沿着这首曲子往下看，不必每换一个功能就换一份材料。\n\n可以在上面搜索歌名，点卡片后等它打开；我会等作品载入，再接着介绍。若想先了解整体，也可以跳过选曲。']);
 let index=Math.max(0,steps.findIndex(s=>s[0]===params.get('panel'))),automatic=params.get('auto')!=='0',timer=0,version=0,closed=false,highlighted=null,revealFrame=0,boundaryChars=0,stepDuration=0,ringRadius=20;
 let voiceOn=false,voiceStarted=false,voiceBlocked=false,voiceAuto=false,voiceWaiting=false,utter=null;
 let recorded=null,recordedTracks=[];
 try{const r=await fetch('/narration/tour.json');if(r.ok)recordedTracks=await r.json();}catch{}
 const recordingIds=['tang-opening','tang-select','tang-import','tang-play','tang-practice','tang-arrange','tang-tasks','tang-closing'];
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const box=document.createElement('aside');box.className='guided-tour';box.hidden=true;box.setAttribute('aria-label','项目导览');
 const greeting=document.createElement('div');greeting.className='tour-greeting';greeting.textContent=mentor?`${mentor}老师，您好。我是唐秋鸣。`:'您好，我是唐秋鸣。';
 const head=document.createElement('strong'),copy=document.createElement('p'),state=document.createElement('small'),actions=document.createElement('div'),prev=document.createElement('button'),next=document.createElement('button'),pause=document.createElement('button'),voice=document.createElement('button'),exit=document.createElement('button');
 const meter=document.createElement('div');meter.className='tour-time';meter.setAttribute('aria-hidden','true');meter.append(document.createElement('i'));
 const bar=meter.firstChild;
 head.id='tour-heading';copy.className='tour-copy';copy.setAttribute('aria-live','polite');prev.textContent='上一步';exit.textContent='结束导览';
 const source=document.createElement('a');source.className='tour-research';source.target='_blank';source.rel='noopener';const sourceURL=research?.source||visit?.source;if(sourceURL&&/^https?:\/\//.test(sourceURL)){source.href=sourceURL;source.textContent=research?`${research.basis} · ${research.title} ↗`:'研究线索：导师个人主页 ↗';}else source.hidden=true;
 actions.append(prev,pause,voice,next,exit);box.append(greeting,head,copy,source,state,meter,actions);document.body.append(box);document.body.classList.add('has-guided-tour');

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
  if(!highlighted||closed||index===1){showRing(false);showArrow(false);return;}
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
 zhVoice=zh.find(v=>/natural|online|neural/i.test(v.name))
  ||zh.find(v=>/xiaoxiao|yaoyao|huihui|kangkang|晓晓|晓伊|云希|云扬|康康/i.test(v.name))
  ||zh.find(v=>/^zh[-_]?(CN|Hans|SG)/i.test(v.lang))||zh[0]||null;}
 function stopSpeak(){if(recorded){recorded.pause();recorded.src='';recorded=null;}if(!canSpeak)return;utter=null;try{speechSynthesis.cancel();}catch{}}
 function armTimer(ms){clearTimeout(timer);timer=setTimeout(()=>{if(closed)return;index++;void render();},ms);}
 function speak(text){
  const track=recordedTracks.find(t=>t.id===recordingIds[index]);
  // Custom research text must never be narrated with a different cached script.
  if(track&&index!==1&&!research&&!visit){
   stopSpeak();const a=new Audio(track.url);recorded=a;copy.textContent=track.text;
   a.onplaying=()=>{if(recorded!==a)return;clearTimeout(timer);voiceStarted=true;state.textContent='唐秋鸣讲解 · 合成语音';};
   a.ontimeupdate=()=>{if(recorded===a&&Number.isFinite(a.duration))meterRun(a.currentTime/a.duration,0);};
   a.onended=()=>{if(recorded!==a)return;voiceStarted=false;if(automatic&&index<steps.length-1)armTimer(1800);};
   a.onerror=()=>{if(recorded===a){state.textContent='语音未能播放，可以继续阅读或重试';voiceStarted=false;}};
   a.play().catch(()=>{state.textContent='点击“播放讲解”即可听这一段';});return;
  }
  if(!canSpeak||!voiceOn||!text||index===1)return;
  if(!activated()){voiceWaiting=true;return;}
  voiceWaiting=false;loadVoices();
  stopSpeak();voiceStarted=false;voiceBlocked=false;
  const current=new SpeechSynthesisUtterance(text);
  utter=current;
  if(zhVoice)current.voice=zhVoice;
  // 默认 rate=1 念中文偏快偏平，听起来很机械：语速放慢一点、音高略抬一点。
  current.lang=(zhVoice&&zhVoice.lang)||'zh-CN';current.rate=0.94;current.pitch=1.02;
  // 每个回调都先确认自己还是当前这条，免得被取消的旧朗读把新的一步顶掉。
  current.onstart=()=>{if(utter!==current)return;voiceStarted=true;voiceBlocked=false;clearTimeout(timer);timer=0;state.textContent=automatic?'语音讲解中 · 点页面即可暂停':'语音讲解中 · 点“继续讲解”接着走';};
  current.onboundary=event=>{if(utter!==current)return;if(typeof event.charIndex==='number'&&event.charIndex>boundaryChars)boundaryChars=event.charIndex;};
  current.onend=()=>{if(utter!==current||closed)return;meterFreeze();if(automatic&&index<steps.length-1){armTimer(2400);}else{state.textContent='导览结束。您可以继续查看，或直接试用。';pause.hidden=true;}};
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
  if(index===1){pause.hidden=true;state.textContent='选择作品后继续；也可以跳过选曲';return;}
  if(!automatic){pause.textContent='继续讲解';state.textContent='已暂停，可以自己操作';return;}
  pause.textContent='暂停讲解';
  if(index===steps.length-1){state.textContent='导览结束。您可以继续查看，或直接试用。';pause.hidden=true;return;}
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
  const token=++version;cancel();stopReveal();stopSpeak();voiceStarted=false;
  const [panel,target,title,text]=steps[index];
  if(index!==1&&document.querySelector('.library-browser[open]'))await document.querySelector('.score-library')?.tourClose?.();
  if(token!==version||closed)return;
  box.hidden=false;document.body.append(box);
  if(!reduce.matches)box.animate([{opacity:0,transform:'perspective(1000px) translateY(20px) rotateY(-7deg)'},{opacity:1,transform:'perspective(1000px) translateY(0) rotateY(0)'}],{duration:650,easing:'cubic-bezier(.16,1,.3,1)'});
  pause.hidden=false;pause.textContent=automatic?'暂停讲解':'继续讲解';
  if(highlighted)highlighted.classList.remove('tour-focus');
  highlighted=null;showRing(false);showArrow(false);
  document.querySelector(`[data-panel="${panel}"]`)?.click();
  source.hidden=!sourceURL||![0,5,7].includes(index);
  head.textContent=`${index+1} / ${steps.length}　${title}`;
  copy.style.minHeight='';copy.textContent=text;copy.style.minHeight=copy.getBoundingClientRect().height+'px';copy.textContent='';
  prev.disabled=index===0;next.textContent=index===steps.length-1?'回到开头':'下一步';
  state.textContent='正在移到对应功能';
  for(let n=0;n<80&&document.querySelector('.workspace-stage.is-moving');n++)await wait(25);
  if(token!==version||closed)return;
  if(index===1){
   copy.textContent=text;pause.hidden=true;next.textContent='跳过选曲';state.textContent='正在展开云曲库';
   await glideTo(document.querySelector('.score-library'),{cancelled:()=>token!==version||closed});if(token!==version||closed)return;
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
  startReveal(text,token);
  retryVoice();
  speak(text);
  schedule();
 }
 prev.onclick=()=>{index=Math.max(0,index-1);void render();};
 next.onclick=()=>{index=(index+1)%steps.length;void render();};
 pause.onclick=()=>{automatic=!automatic;if(automatic){if(recorded)recorded.play().catch(()=>{});if(canSpeak&&voiceOn&&utter&&speechSynthesis.paused){try{speechSynthesis.resume();}catch{}}schedule();}else stopAuto();};
// 朗读改成自动的，不再放开关：voiceOn 恒为 true，按钮直接隐藏。
// 浏览器按自动播放策略可能拦下首次发声，这时由 manual（用户任意一次滚动 /
// 点击 / 按键）里的 retryVoice() 自动把语音接回来，不需要用户去点开关。
const setVoiceButton=()=>{voice.textContent=recordedTracks.length&&!research&&!visit?'播放讲解':voiceOn?'关闭系统朗读':'系统朗读';};
setVoiceButton();
voice.hidden=!canSpeak&&!recordedTracks.length;
voice.onclick=()=>{if(recordedTracks.length&&!research&&!visit){speak(steps[index][3]);return;}if(!canSpeak)return;voiceOn=!voiceOn;voiceAuto=false;setVoiceButton();if(!voiceOn){stopSpeak();schedule();return;}voiceBlocked=false;voiceStarted=false;state.textContent='正在准备系统朗读…';speak(steps[index][3]);};
 let inIntro=true,selecting=false;
 const onLibraryClose=()=>{document.body.append(box);if(index===1&&!selecting)state.textContent='已收起曲库，可以重新展开选曲或跳过';};
 const onLibraryOpen=e=>{if(index===1&&!closed){box.hidden=true;e.detail.browser.append(box);}};
 const onFlight=()=>{if(!closed)box.hidden=true;};
 const onFlightEnd=()=>{if(!closed&&!selecting&&!inIntro){box.hidden=false;}};
 document.addEventListener('library-flight-layer',onFlight);document.addEventListener('library-flight-finished',onFlightEnd);
 const onLoading=()=>{if(index===1){selecting=true;box.hidden=true;cancel();stopSpeak();}};
 const onSelected=e=>{if(closed||index!==1)return;selecting=false;box.hidden=false;if(e.detail.error){state.textContent='作品未能打开：'+e.detail.error;return;}if(!e.detail.ready){state.textContent='这首作品还在识别，请选择已就绪的作品或跳过';return;}index=3;automatic=true;void render();};
 document.addEventListener('library-tour-opened',onLibraryOpen);document.addEventListener('library-tour-closed',onLibraryClose);document.addEventListener('library-tour-loading',onLoading);document.addEventListener('library-tour-selected',onSelected);
 const manual=event=>{if(!event.isTrusted||inIntro||index===1)return;if(retryVoice())speak(steps[index][3]);if(!box.contains(event.target))stopAuto();},onVisibility=()=>{if(document.hidden)stopAuto('已暂停，返回后可继续讲解');};
 for(const type of ['wheel','pointerdown','keydown'])document.addEventListener(type,manual,{passive:true});document.addEventListener('visibilitychange',onVisibility);
 addEventListener('pagehide',stopSpeak,{once:true});
 exit.onclick=()=>{unpinHeader();document.removeEventListener('library-flight-layer',onFlight);document.removeEventListener('library-flight-finished',onFlightEnd);document.removeEventListener('library-tour-opened',onLibraryOpen);document.removeEventListener('library-tour-closed',onLibraryClose);document.removeEventListener('library-tour-loading',onLoading);document.removeEventListener('library-tour-selected',onSelected);closed=true;version++;cancel();stopReveal();stopSpeak();if(highlighted)highlighted.classList.remove('tour-focus');highlighted=null;ring.remove();arrow.remove();box.remove();document.body.classList.remove('has-guided-tour');removeEventListener('scroll',scheduleOverlay);removeEventListener('resize',scheduleOverlay);for(const type of ['wheel','pointerdown','keydown'])document.removeEventListener(type,manual);document.removeEventListener('visibilitychange',onVisibility);};
 await presentWelcome({mentor,visit,focus:visit?.focus||({ensemble:'异地 MIDI 合奏与音乐参与',education:'音乐学习与反馈',generation:'音乐生成与教学素材'}[direction])});
 inIntro=false;if(!closed)void render();
}
