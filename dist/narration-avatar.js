// Video is optional: completed chapters share the existing audio player's clock.
// A short test clip is never substituted for a complete narration chapter.
export function attachNarrationAvatar(host, audio) {
 const section=document.createElement('section');section.className='narration-avatar';section.hidden=true;
 const label=document.createElement('p');label.className='avatar-label';label.textContent='冒小瑛教授 · 数字人演示';
 const video=document.createElement('video');video.playsInline=true;video.muted=true;video.preload='metadata';video.setAttribute('aria-label','导师数字人讲解');
 const disclosure=document.createElement('small');disclosure.textContent='经授权制作的合成影像';
 section.append(video,label,disclosure);host.prepend(section);
 let manifest=null,disposed=false,active=null,previewButton=null,previewDialog=null,poll=0;
 const generationStatus=document.createElement('p');generationStatus.className='avatar-generation-status';generationStatus.hidden=true;generationStatus.setAttribute('role','status');host.append(generationStatus);
 const listeners=[];
 function on(target,event,fn){target.addEventListener(event,fn);listeners.push(()=>target.removeEventListener(event,fn));}
 async function sync(){
  if(disposed)return;
  const path=new URL(audio.currentSrc||audio.src,location.href).pathname;
  const item=manifest?.chapters?.find(entry=>entry.audio===path&&entry.complete===true);
  if(!item){active=null;video.pause();section.hidden=true;return;}
  if(active!==item.video){active=item.video;video.src=item.video;video.load();}
  section.hidden=false;
  if(video.readyState>=1&&Math.abs(video.currentTime-audio.currentTime)>.18)video.currentTime=audio.currentTime;
  video.playbackRate=audio.playbackRate;
  if(audio.paused||audio.ended||document.hidden){video.pause();return;}
  try{await video.play();if(disposed||audio.paused||document.hidden||!active)video.pause();}catch{if(!audio.paused)section.hidden=true;}
 }
 for(const event of ['play','pause','seeking','seeked','ratechange','loadedmetadata','ended','emptied'])on(audio,event,sync);
 on(audio,'timeupdate',()=>{if(active&&video.readyState>=1&&Math.abs(video.currentTime-audio.currentTime)>.25)video.currentTime=audio.currentTime;});
 on(video,'loadedmetadata',sync);on(video,'error',()=>{video.pause();section.hidden=true;});on(document,'visibilitychange',sync);
 function loadManifest(){return fetch('/narration/avatar-manifest.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
  if(disposed)return;manifest=data;void sync();
  if(!data?.preview?.video||previewButton)return;
  previewButton=document.createElement('button');previewButton.type='button';previewButton.className='avatar-preview-button';previewButton.textContent='数字人片段预览';
  previewButton.onclick=()=>{
   audio.pause();previewDialog=document.createElement('dialog');previewDialog.className='avatar-preview-dialog';
   const clip=document.createElement('video');clip.controls=true;clip.playsInline=true;clip.src=data.preview.video;
   const name=document.createElement('h2');name.textContent='冒小瑛教授 · 数字人演示';
   const note=document.createElement('p');note.textContent='经授权制作的合成影像';
   const close=document.createElement('button');close.type='button';close.textContent='关闭';close.onclick=()=>previewDialog.close();
   previewDialog.append(name,clip,note,close);document.body.append(previewDialog);
   previewDialog.onclose=()=>{clip.pause();clip.removeAttribute('src');clip.load();previewDialog.remove();previewDialog=null;previewButton.focus();};
   previewDialog.showModal();void clip.play().catch(()=>{});
  };host.append(previewButton);
 }).catch(()=>{});}
 async function checkGeneration(){
  try{const response=await fetch('/narration/avatar-status.json',{cache:'no-store'});const state=response.ok?await response.json():null;if(disposed)return;
   if(state&&['preparing','rendering','validating'].includes(state.state)){
    generationStatus.hidden=false;generationStatus.textContent=Number.isFinite(state.percent)?`数字人画面生成中 ${state.percent}%`:'数字人画面正在生成';
    poll=setTimeout(checkGeneration,5000);
   }else{generationStatus.hidden=true;if(state?.state==='ready')await loadManifest();}
  }catch{if(!disposed)poll=setTimeout(checkGeneration,10000);}
 }
 void loadManifest();void checkGeneration();
 return ()=>{disposed=true;clearTimeout(poll);listeners.forEach(remove=>remove());previewDialog?.close();previewButton?.remove();generationStatus.remove();video.pause();video.removeAttribute('src');video.load();section.remove();};
}
