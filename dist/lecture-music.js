export function attachLectureMusic(voice){
 window.__disposeLectureMusic?.();
 const music=document.createElement('audio');music.dataset.lectureMusic='';music.hidden=true;music.loop=true;music.preload='auto';music.playsInline=true;document.body.append(music);
 let disposed=false,starting=false,request=null,metadata=null;
 const clearMetadata=()=>{if(metadata){music.removeEventListener('loadedmetadata',metadata);metadata=null;}};
 const clearSource=()=>{clearMetadata();music.pause();music.removeAttribute('src');music.load();music.dataset.state='paused';};
 const play=async()=>{
  if(!music.getAttribute('src')||disposed||starting||!music.paused||voice.dataset.priming==='1'||voice.dataset.lectureReady==='0'||voice.currentTime<.15||voice.paused)return;
  starting=true;
  try{await music.play();if(disposed||!music.getAttribute('src')){music.pause();return;}music.dataset.state='playing';}
  catch(e){if(!disposed){music.dataset.state='blocked';music.dataset.error=e.message;console.warn('讲解背景音乐未能播放',e);}}
  finally{starting=false;}
 };
 const pause=()=>{if(!document.hidden&&(voice.ended||voice.dataset.chapterTransition==='1'))return;music.pause();music.dataset.state='paused';};
 const unlock=()=>{if(!music.getAttribute('src')||disposed||voice.paused)return;void play();};
 voice.addEventListener('playing',play);voice.addEventListener('timeupdate',play);voice.addEventListener('pause',pause);document.addEventListener('pointerdown',unlock,true);document.addEventListener('touchend',unlock,true);
 const sync=async()=>{
  if(disposed||request)return;
  const controller=new AbortController();request=controller;
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch('/api/lecture-music',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('背景音乐服务未连接');
   const d=await response.json();if(disposed)return;
   if(!d.url){if(music.getAttribute('src'))clearSource();return;}
   const volume=Number(d.volume??.12);music.volume=d.renderedVolume!==undefined?1:Math.max(0,Math.min(1,Number.isFinite(volume)?volume:.12));music.dataset.volume=String(d.volume);
   if(music.getAttribute('src')!==d.url){
    const time=music.currentTime;clearMetadata();music.src=d.url;
    metadata=()=>{clearMetadata();if(disposed)return;if(time&&music.duration>0&&Number.isFinite(music.duration))music.currentTime=time%music.duration;if(!voice.paused)void play();};
    music.addEventListener('loadedmetadata',metadata,{once:true});music.load();
   }
   if(!voice.paused)void play();
  }catch(e){if(!disposed)console.warn('背景音乐加载失败',e);}
  finally{clearTimeout(timeout);if(request===controller)request=null;}
 };
 void sync();const syncTimer=setInterval(sync,3000);
 const dispose=()=>{
  if(disposed)return;disposed=true;clearInterval(syncTimer);request?.abort();clearMetadata();
  voice.removeEventListener('playing',play);voice.removeEventListener('timeupdate',play);voice.removeEventListener('pause',pause);document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('touchend',unlock,true);
  clearSource();music.remove();if(window.__disposeLectureMusic===dispose)delete window.__disposeLectureMusic;
 };
 window.__disposeLectureMusic=dispose;return dispose;
}
