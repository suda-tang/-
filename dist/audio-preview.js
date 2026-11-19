// A single transport for trial buttons, with deterministic resource cleanup.
export function createAudioPreview(report){
 let current=null,pending=null,revision=0;
 function restore(button,label){button.disabled=false;button.textContent=label;button.setAttribute('aria-pressed','false');}
 function release(){
  if(!current)return;
  const {audio,button,label,url}=current;current=null;
  audio.onended=audio.onerror=null;audio.pause();audio.removeAttribute('src');
  URL.revokeObjectURL(url);restore(button,label);
 }
 function cancelDownload(){
  if(!pending)return;
  const request=pending;pending=null;clearTimeout(request.timer);
  request.controller.abort();restore(request.button,request.label);
 }
 async function play(url,button,notice){
  if(current?.button===button){
   const active=current;
   try{
    if(active.audio.paused){
     await active.audio.play();
     if(current!==active)return;
     button.textContent='暂停试听';button.setAttribute('aria-pressed','true');
    }else{active.audio.pause();button.textContent='继续试听';button.setAttribute('aria-pressed','false');}
   }catch(error){if(current===active){release();report(error.message||'试听暂时无法播放。');}}
   return;
  }
  const ticket=++revision;cancelDownload();release();
  const label=button.textContent,controller=new AbortController();
  const request={button,label,controller,timedOut:false,timer:null};pending=request;
  button.disabled=true;button.textContent='正在载入试听…';
  request.timer=setTimeout(()=>{request.timedOut=true;controller.abort();},30000);
  let objectURL;
  try{
   const response=await fetch(url,{signal:controller.signal});
   if(!response.ok){let data;try{data=await response.json();}catch{}throw Error(data?.error||'试听暂时无法下载（HTTP '+response.status+'）。');}
   const blob=await response.blob();
   if(ticket!==revision)return;
   if(!blob.size)throw Error('试听音频为空。');
   clearTimeout(request.timer);pending=null;
   objectURL=URL.createObjectURL(blob);
   const audio=new Audio(objectURL);current={audio,button,label,url:objectURL};objectURL=null;
   audio.onended=()=>{if(current?.audio===audio)release();};
   audio.onerror=()=>{if(current?.audio===audio){release();report('播放器未能解码这段音频。');}};
   await audio.play();if(current?.audio!==audio)return;
   button.textContent='暂停试听';button.setAttribute('aria-pressed','true');report(notice);
  }catch(error){
   if(objectURL)URL.revokeObjectURL(objectURL);
   if(ticket===revision){release();report(request.timedOut?'试听下载超过30秒，请重试。':error.message||'试听暂时无法播放。');}
  }finally{
   clearTimeout(request.timer);if(pending===request)pending=null;
   // A superseding request owns this button now; stale completion must not reset it.
   if(ticket===revision){button.disabled=false;if(current?.button!==button)restore(button,label);}
  }
 }
 return {play,stop(){revision++;cancelDownload();release();}};
}
