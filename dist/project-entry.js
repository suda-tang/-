// Tour visitors see the presenter before the heavy workspace modules start.
const activity=detail=>window.reportStartupActivity?.(detail);
activity({id:'entry',label:'工作区入口已载入',state:'complete'});
const params=new URLSearchParams(location.search);
if(params.get('tour')==='1'){
 window.earlyTourBoot=true;document.body.classList.add('studio');
 const stageReady=new Promise(resolve=>{const timer=setTimeout(resolve,12000);window.addEventListener('mentor-stage-ready',()=>{clearTimeout(timer);resolve();},{once:true});});
 try{
  activity({id:'presenter',label:'加载数字人、讲解与舞台资源'});
  const {runWelcome,pinTourHeader}=await import('./tour-presentation.js?v=auto-discovery5');
  window.earlyTourUnpin=pinTourHeader();
  const mentor=params.get('mentor')||'';
  window.earlyTourWelcome=runWelcome({mentor,focus:({education:'音乐学习与反馈',ensemble:'异地 MIDI 合奏与音乐参与',generation:'音乐生成与教学素材'}[params.get('direction')||'ensemble'])});
  // Attach a rejection handler immediately; the guided tour will report the failure.
  window.earlyTourWelcome.catch(error=>{console.error('数字人启动失败',error);window.dispatchEvent(new Event('mentor-stage-ready'));});
 }catch(error){console.error('数字人资源加载失败',error);window.dispatchEvent(new Event('mentor-stage-ready'));}
 await stageReady;activity({id:'presenter',label:'数字人舞台已就绪',state:'complete'});
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}
for(let attempt=0;attempt<3;attempt++){
 try{activity({id:'app',label:'下载并初始化乐谱、音频和工作区模块',detail:attempt?'重新连接 '+attempt+' 次':''});await import('./app.js?v=stream-search27'+(attempt?'&retry='+Date.now():''));activity({id:'app',label:'乐谱与音频模块已初始化',state:'complete'});break;}
 catch(error){if(attempt<2&&error instanceof TypeError){const label=document.querySelector('#boot-label');if(label)label.textContent='正在重新连接工作区资源';await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));continue;}window.dispatchEvent(new CustomEvent('workspace-error',{detail:error.message}));break;}
}
