// A single transport for trial buttons, with deterministic resource cleanup.
export function createAudioPreview(report){
 let current=null,revision=0;
 function release(){if(!current)return;const {audio,button,label,url}=current;current=null;audio.pause();audio.removeAttribute('src');URL.revokeObjectURL(url);button.textContent=label;button.setAttribute('aria-pressed','false');}
 async function play(url,button,notice){
  if(current?.button===button){try{if(current.audio.paused){await current.audio.play();button.textContent='暂停试听';button.setAttribute('aria-pressed','true');}else{current.audio.pause();button.textContent='继续试听';button.setAttribute('aria-pressed','false');}}catch(error){release();report(error.message||'试听暂时无法播放。');}return;}
  const ticket=++revision;release();const label=button.textContent;button.disabled=true;button.textContent='正在载入试听…';let objectURL;
  try{const response=await fetch(url);if(!response.ok){const data=await response.json();throw Error(data.error||'试听不可用。');}const blob=await response.blob();if(ticket!==revision)return;if(!blob.size)throw Error('试听音频为空。');objectURL=URL.createObjectURL(blob);const audio=new Audio(objectURL);current={audio,button,label,url:objectURL};audio.onended=()=>{if(current?.audio===audio)release();};audio.onerror=()=>{if(current?.audio===audio){release();report('播放器未能解码这段音频。');}};await audio.play();if(current?.audio!==audio)return;button.textContent='暂停试听';button.setAttribute('aria-pressed','true');report(notice);
  }catch(error){if(ticket===revision){release();report(error.message||'试听暂时无法播放。');}}
  finally{button.disabled=false;if(current?.button!==button)button.textContent=label;}
 }
 return {play,stop(){revision++;release();}};
}
