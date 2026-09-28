export async function initTour(){
 const params=new URLSearchParams(location.search);if(params.get('tour')!=='1')return;
 let mentor=(params.get('mentor')||'').trim().slice(0,50),direction=params.get('direction')||'ensemble',visit=null;
 if(params.has('visit')){try{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);try{const response=await fetch('/mentor-visits.json',{signal:controller.signal});if(response.ok)visit=(await response.json())[params.get('visit')]||null;}finally{clearTimeout(timeout);}if(visit){mentor=visit.name;direction=visit.direction;}}catch{}}
 const opening={ensemble:'我平时弹钢琴，也做伴奏，先做的是异地 MIDI 合奏。眼前这个网页是后来做的钢琴学习原型，和远程合奏不是同一个程序。我想借它展示几个还在琢磨的问题，您也可以随时停下来自己试。',education:'我学的是音乐教育，做这个网页时一直在想：给学生标出错音之后，学生下一遍到底会怎么练？我想先带您看这个原型，再说说哪些反馈值得放进课堂研究。',generation:'配器生成一份能播放的总谱并不难，难的是各声部真正合在一起。这个原型保留了生成、试听和核对的过程，我想给您看看我目前做到哪里，又卡在哪里。'};
 const ending={ensemble:'我接下来想回到双人异地 MIDI 合奏，控制网络延迟，比较补偿办法。除了看两个音差了多少毫秒，还想知道演奏者有没有不断追赶对方，是否仍能主动带动一句音乐。这是我想继续研究的一个问题。',education:'我想先比较两种反馈：一边弹一边提示，和弹完一个乐句再提示。在练习时间相同的情况下，学生离开提示后还能不能改正，可能比眼前分数升了多少更值得看。这个实验还需要细化。',generation:'我想把问题缩小到分层练习素材：保持原曲结构时，加入声部与难度约束，能不能让生成结果更适合教学？我希望让教师盲评和学生试奏参与判断，而不是只让生成模型自己打分。'};
 const steps=[
  ['library','.score-library','先说说我为什么做这个项目',opening[direction]||opening.ensemble],
  ['library','.score-import','把学生手上的谱子放进来','这里可以导入 PDF、乐谱照片和音视频。照片可以按顺序整理后再识别。我希望学生不用先去学文件转换，不过识谱仍然会出错，所以原稿必须留下来，后面才能逐处核对。'],
  ['play','.playback-panel','听的时候，问题比看数字清楚','这里能调速度、换音源，也能开节拍器。我遇到过一个很具体的错误：拍号识别出了偏差，播放每到小节末尾就空一截。这个问题让我不敢把评分单独拿出来讲，先得确认谱子和声音本身是对的。'],
  ['play','.practice-settings','跟弹时给了学生什么','跟弹能反馈音符和时间偏差。但即时提示多了，会不会让学生一直盯着屏幕？这一点我还想不通。这里展示的是能记录过程的原型，尚不能用它证明哪一种反馈更有效。'],
  ['arrange','#arrangement-workspace','改编以后，还得回头听','这里选择配器并生成总谱。我自己听过一些不理想的结果：声部都有了，却挤在一起，不像合奏。我更关心后面怎么验证和修改，而不是生成按钮点完就算做成了。'],
  ['tasks','.task-center','耗时的工作留在后台','上传、识谱和生成会在任务中心显示进度，前台可以继续操作。您看到的是当前服务的真实任务；这次导览不会为了演示而上传文件、生成作品或开启麦克风。'],
  ['play','.playback-panel','我想请教您的，是下一步怎么做',ending[direction]||ending.ensemble]
 ];
 if(visit){steps[0][3]=`${mentor}老师，这次我想围绕${visit.focus}向您介绍。${opening[direction]||opening.ensemble}`;steps[steps.length-1][3]=visit.question||steps[steps.length-1][3];}
 let index=Math.max(0,steps.findIndex(s=>s[0]===params.get('panel'))),automatic=params.get('auto')!=='0',timer=0,version=0,closed=false,highlighted=null;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)'),box=document.createElement('aside');box.className='guided-tour';box.setAttribute('aria-label','项目导览');
 const greeting=document.createElement('div');greeting.className='tour-greeting';greeting.textContent=mentor?`${mentor}老师，您好。我是唐秋鸣。`:'您好，我是唐秋鸣。';
 const head=document.createElement('strong'),copy=document.createElement('p'),state=document.createElement('small'),actions=document.createElement('div'),prev=document.createElement('button'),next=document.createElement('button'),pause=document.createElement('button'),exit=document.createElement('button');
 const meter=document.createElement('div');meter.className='tour-time';meter.setAttribute('aria-hidden','true');meter.append(document.createElement('i'));
 head.id='tour-heading';copy.setAttribute('aria-live','polite');prev.textContent='上一步';exit.textContent='结束导览';actions.append(prev,pause,next,exit);box.append(greeting,head,copy,state,meter,actions);document.body.append(box);document.body.classList.add('has-guided-tour');
 const cancel=()=>{clearTimeout(timer);timer=0;meter.firstChild.getAnimations().forEach(a=>a.cancel());};
 function stopAuto(reason='已暂停，可以自己操作'){automatic=false;cancel();pause.textContent='继续讲解';state.textContent=reason;}
 function schedule(){cancel();pause.textContent=automatic?'暂停讲解':'继续讲解';if(!automatic){state.textContent='已暂停，可以自己操作';return;}if(index===steps.length-1){state.textContent='导览结束。您可以继续查看，或直接试用。';pause.hidden=true;return;}const duration=Math.max(18000,steps[index][3].length*230);state.textContent='自动讲解中 · 操作页面即可暂停';meter.firstChild.animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration,fill:'forwards',easing:'linear'});timer=setTimeout(()=>{index++;void render();},duration);}
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function render(){
  const token=++version;cancel();const [panel,target,title,text]=steps[index];pause.hidden=false;highlighted?.classList.remove('tour-highlight');
  document.querySelector(`[data-panel="${panel}"]`)?.click();head.textContent=`${index+1} / ${steps.length}　${title}`;copy.textContent=text;prev.disabled=index===0;next.textContent=index===steps.length-1?'回到开头':'下一步';state.textContent='正在移到对应功能';
  for(let n=0;n<80&&document.querySelector('.workspace-stage.is-moving');n++)await wait(25);
  if(token!==version||closed)return;highlighted=document.querySelector(target);
  if(highlighted){if(highlighted.matches('details'))highlighted.open=true;window.scrollTo({top:Math.max(0,window.scrollY+highlighted.getBoundingClientRect().top-90),behavior:reduce.matches?'instant':'smooth'});await wait(reduce.matches?0:750);if(token!==version||closed)return;highlighted.classList.add('tour-highlight');}
  schedule();
 }
 prev.onclick=()=>{index=Math.max(0,index-1);void render();};next.onclick=()=>{index=(index+1)%steps.length;void render();};pause.onclick=()=>{automatic=!automatic;if(automatic)schedule();else stopAuto();};
 const manual=event=>{if(event.isTrusted&&!box.contains(event.target))stopAuto();},onVisibility=()=>{if(document.hidden)stopAuto('已暂停，返回后可继续讲解');};
 for(const type of ['wheel','pointerdown','keydown'])document.addEventListener(type,manual,{passive:true});document.addEventListener('visibilitychange',onVisibility);
 exit.onclick=()=>{closed=true;version++;cancel();highlighted?.classList.remove('tour-highlight');box.remove();document.body.classList.remove('has-guided-tour');for(const type of ['wheel','pointerdown','keydown'])document.removeEventListener(type,manual);document.removeEventListener('visibilitychange',onVisibility);};
 void render();
}
