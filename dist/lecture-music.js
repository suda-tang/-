export function attachLectureMusic(voice){
 window.__disposeLectureMusic?.();
 const music=document.createElement('audio');music.dataset.lectureMusic='';music.hidden=true;music.loop=true;music.preload='auto';music.playsInline=true;document.body.append(music);let disposed=false,starting=false;
 const play=async()=>{if(!music.src||disposed||starting)return;starting=true;try{await music.play();music.dataset.state='playing';}catch(e){music.dataset.state='blocked';music.dataset.error=e.message;console.warn('讲解背景音乐未能播放',e);}finally{starting=false;}};
 const pause=()=>{if(!document.hidden&&(voice.ended||voice.dataset.chapterTransition==='1'))return;music.pause();music.dataset.state='paused';};
 const unlock=()=>{if(!music.src||disposed||voice.paused)return;void play();};
 voice.addEventListener('playing',play);voice.addEventListener('pause',pause);document.addEventListener('pointerdown',unlock,true);document.addEventListener('touchend',unlock,true);
 const sync=()=>fetch('/api/lecture-music',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('背景音乐服务未连接');return r.json();}).then(d=>{if(disposed||!d.url)return;const changed=music.getAttribute('src')!==d.url;music.volume=d.renderedVolume!==undefined?1:(d.volume??.12);music.dataset.volume=String(d.volume);if(changed){const time=music.currentTime;music.src=d.url;music.load();music.addEventListener('loadedmetadata',()=>{if(time&&Number.isFinite(music.duration))music.currentTime=time%music.duration;if(!voice.paused)void play();},{once:true});}if(!voice.paused)void play();}).catch(e=>console.warn('背景音乐加载失败',e));
 void sync();const syncTimer=setInterval(sync,3000);
 const dispose=()=>{disposed=true;clearInterval(syncTimer);voice.removeEventListener('playing',play);voice.removeEventListener('pause',pause);document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('touchend',unlock,true);music.pause();music.removeAttribute('src');music.load();music.remove();if(window.__disposeLectureMusic===dispose)delete window.__disposeLectureMusic;};
 window.__disposeLectureMusic=dispose;return dispose;
}
