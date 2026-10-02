// Only completed presentation audio is published; reference uploads stay private.
export async function openingNarration(scene) {
 const caption=scene.querySelector('.premiere-caption'),start=scene.querySelector('button'),host=scene.querySelector('.home-intro-content');
 const controls=document.createElement('section');controls.className='opening-controls narration-playlist';
 const heading=document.createElement('div');heading.className='narration-heading';
 const title=document.createElement('p');title.textContent='项目导览声音';
 const status=document.createElement('p');status.className='narration-status';status.setAttribute('aria-live','polite');heading.append(title,status);
 const list=document.createElement('div');list.className='narration-list';
 const audio=document.createElement('audio');audio.className='narration-audio';audio.controls=true;audio.preload='metadata';audio.setAttribute('playsinline','');
 const actions=document.createElement('div');actions.className='narration-actions';
 const playAll=document.createElement('button'),skip=document.createElement('button');playAll.type='button';skip.type='button';playAll.textContent='连续播放全部';skip.textContent='直接看演示';actions.append(playAll,skip);controls.append(heading,list,audio,actions);host.append(controls);
 const tracks=[
  {src:'/narration/mentor-preface.m4a',speaker:'导师前言',label:'项目从哪里开始',text:'老师您好，谢谢您抽出时间来看唐秋鸣的项目。秋鸣是苏州大学音乐学院音乐教育专业钢琴方向的硕士研究生。进入操作页面以前，我先介绍一下这项工作的来由，以及接下来值得留意的几个地方。他最早关注的是异地合奏：人不在同一间琴房，怎样还能一起排练？对演奏者来说，声音能够传过来只是起点，更难的是彼此能不能合上，能不能听着对方往下走。'},
  {src:'/narration/mentor-context.m4a',speaker:'导师介绍',label:'从异地合奏到钢琴学习',text:'围绕这个问题，秋鸣做过基于时间码的异地数字乐器合奏工作，尝试处理不同地点的时钟同步和网络延迟。今天展示的钢琴学习网页，是与这项工作相关的另一套原型。两者不是同一个系统，不过，它们关心的都是技术进入音乐活动以后，怎样照顾实际的演奏体验。请您把今天的展示看作一次对研究过程的介绍。哪些已经做出来，哪些仍需要验证，演示中会分开说明。'},
  {src:'/narration/tang-introduction.m4a',speaker:'唐秋鸣',label:'演示从一首作品开始',text:'老师您好，我是唐秋鸣，现在在苏州大学学习音乐教育，主项是钢琴。我平时弹琴，也给人做伴奏，所以最早想做这个项目，是希望大家不在同一间琴房，也能一起排练。您不用急着把所有功能都看完，我们先选一首熟悉的作品，听一小段，再慢慢往下看。'}
 ];
 let chapters=[],generation=null;
 try{const r=await fetch('/narration/mentor-script.json');if(r.ok)chapters=await r.json();}catch{}
 try{const r=await fetch('/narration/generation.json');if(r.ok)generation=await r.json();}catch{}
 try{const r=await fetch('/narration/tour.json');if(r.ok){const generated=await r.json();const mentor=chapters.map(c=>generated.find(t=>t.id===c.id&&t.text===c.text)).filter(Boolean);if(mentor.length){const mentorTracks=mentor.map((t,i)=>({src:t.url,speaker:'导师前言与项目介绍',label:chapters.find(c=>c.id===t.id)?.title||`第 ${i+1} 节`,text:t.text}));const personal=tracks.find(track=>track.speaker==='唐秋鸣');tracks.splice(0,tracks.length,...mentorTracks,personal);}}}catch{}
 const mentorReady=tracks.filter(track=>track.speaker.includes('导师')).length;
 const mentorTotal=chapters.length||mentorReady;
 const pendingMentor=Math.max(0,mentorTotal-mentorReady);
 status.textContent=`导师讲解已准备 ${mentorReady}/${mentorTotal} 段；另有唐秋鸣介绍 1 段${pendingMentor?`；其余 ${pendingMentor} 段待生成`:''}`;
 if(chapters.length){const transcript=document.createElement('details');transcript.className='opening-transcript';const summary=document.createElement('summary');summary.textContent='阅读完整前言与项目介绍';transcript.append(summary);for(const c of chapters){const h=document.createElement('h3'),p=document.createElement('p');h.textContent=c.title;p.textContent=c.text;transcript.append(h,p);}controls.append(transcript);}
 let index=0,continuous=false,finished=false;const cards=[];
 function renderCards(){tracks.forEach((track,i)=>{const card=document.createElement('article'),number=document.createElement('span'),copy=document.createElement('div'),name=document.createElement('strong'),speaker=document.createElement('small'),button=document.createElement('button');card.className='narration-card';number.textContent=String(i+1).padStart(2,'0');name.textContent=track.label;speaker.textContent=track.speaker;button.type='button';button.textContent='试听';copy.append(name,speaker);card.append(number,copy,button);button.onclick=()=>{continuous=false;playAll.textContent='连续播放全部';select(i,true);};card.onclick=e=>{if(e.target===button)return;continuous=false;playAll.textContent='连续播放全部';select(i,true);};list.append(card);cards.push({card,button});});}
 function select(next,autoplay=false){index=next;const track=tracks[index];cards.forEach((item,i)=>{item.card.classList.toggle('is-playing',i===index);item.button.textContent='试听';});audio.src=track.src;caption.textContent=track.text;status.textContent=`正在准备：${track.speaker} · ${track.label}`;if(autoplay)void play();}
 async function play(){try{await audio.play();cards[index].button.textContent='播放中';status.textContent=`正在播放：${tracks[index].speaker} · ${tracks[index].label}`;}catch{status.textContent='请点播放器的播放键开始试听。';}}
 renderCards();select(0,false);start.textContent='播放前言并开始演示';
 return new Promise(resolve=>{
  function finish(){if(finished)return;finished=true;audio.pause();audio.removeAttribute('src');audio.load();audio.onended=null;start.onclick=null;skip.onclick=null;playAll.onclick=null;document.removeEventListener('visibilitychange',visibility);controls.remove();resolve();}
  function visibility(){if(document.hidden)audio.pause();}
  start.onclick=()=>{continuous=true;select(0,true);playAll.textContent='正在连续播放';};
  playAll.onclick=()=>{if(continuous){continuous=false;audio.pause();playAll.textContent='继续连续播放';return;}continuous=true;playAll.textContent='正在连续播放';void play();};skip.onclick=finish;
  audio.onplay=()=>{cards.forEach((item,i)=>item.button.textContent=i===index?'播放中':'试听');};audio.onpause=()=>{if(!audio.ended)cards[index].button.textContent='继续试听';};
  audio.onended=()=>{cards[index].button.textContent='重听';if(!continuous)return;if(index<tracks.length-1){select(index+1,true);return;}finish();};
  audio.onerror=()=>{cards[index].button.textContent='暂不可播放';status.textContent='这段语音暂时无法播放，可选择其他章节或直接查看演示。';continuous=false;playAll.textContent='连续播放全部';};document.addEventListener('visibilitychange',visibility);
 });
}
