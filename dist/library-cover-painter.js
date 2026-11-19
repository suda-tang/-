// Decode before replacing the visible bitmap; stale requests cannot repaint a card.
export function createCoverPainter(){
 const decoded=new Map(),states=new WeakMap();
 function ready(url){
  if(decoded.has(url))return decoded.get(url);
  const promise=new Promise(resolve=>{const image=new Image();let done=false;const finish=ok=>{if(done)return;done=true;clearTimeout(timer);image.onload=image.onerror=null;resolve(ok);};const timer=setTimeout(()=>{finish(false);image.src=''},12000);image.decoding='async';image.onload=async()=>{try{if(image.decode)await image.decode();finish(true)}catch{finish(false)}};image.onerror=()=>finish(false);image.src=url;});
  decoded.set(url,promise);promise.then(ok=>{if(!ok&&decoded.get(url)===promise)decoded.delete(url)});while(decoded.size>32)decoded.delete(decoded.keys().next().value);return promise;
 }
 return async function paint(card,{url,source=url,fallback='',title=''}){
  const previous=states.get(card);if(previous?.source===source)return previous.pending;
  const state={source,pending:null};states.set(card,state);
  state.pending=(async()=>{
   const primary=await ready(url),chosen=primary?url:fallback&&await ready(fallback)?fallback:'';
   if(!chosen||states.get(card)!==state||!card.isConnected)return false;
   // Avoid decoding/repainting inside the entrance's 3D layer handoff.
   await card._deal?.finished.catch(()=>{});
   if(states.get(card)!==state||!card.isConnected)return false;
   let cover=card.querySelector('.library-cover');if(!cover){cover=document.createElement('span');cover.className='library-cover';card.prepend(cover)}
   const value='url('+JSON.stringify(chosen)+')';if(cover.style.backgroundImage!==value)cover.style.backgroundImage=value;
   if(title)cover.setAttribute('aria-label',title+'封面');if(primary)card._coverApplied=source;else states.delete(card);return true;
  })();state.pending.then(ok=>{if(!ok&&states.get(card)===state)states.delete(card)});return state.pending;
 };
}
