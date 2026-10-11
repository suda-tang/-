// One modal surface, revealed from and returned to the live trigger position.
export function createLanguageMist(wheel,trigger,rail){
 const mist=document.createElement('div');mist.className='language-mist';mist.setAttribute('aria-hidden','true');
 const vapour=document.createElement('div');vapour.className='language-mist-vapour';
 for(let i=0;i<4;i++){const puff=document.createElement('i');puff.style.setProperty('--mist-index',String(i));vapour.append(puff);}
 mist.append(vapour);wheel.prepend(mist);
 const close=document.createElement('button');close.className='language-wheel-close';close.type='button';close.setAttribute('aria-label','关闭语言选择 / Close');close.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';wheel.append(close);
 const content=[rail,close];let animations=[],sequence=0;
 const origin=()=>{const r=trigger.getBoundingClientRect(),x=Math.max(0,Math.min(innerWidth,r.left+r.width/2)),y=Math.max(0,Math.min(innerHeight,r.top+r.height/2));return {x,y,r:Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y))+80};};
 const stop=()=>{for(const a of animations)a.cancel();animations=[];};
 async function travel(open){
  // Preserve the visible frame when the user closes before expansion finishes.
  const snapshot=el=>{const s=getComputedStyle(el);return {transform:s.transform,opacity:s.opacity};};
  const visibleMist=!open?{clipPath:getComputedStyle(mist).clipPath,opacity:getComputedStyle(mist).opacity}:null;
  const visiblePuffs=!open?[...vapour.children].map(snapshot):[];
  const visibleContent=!open?content.map(snapshot):[];
  const ticket=++sequence;stop();const {x,y,r}=origin();mist.style.setProperty('--mist-x',x+'px');mist.style.setProperty('--mist-y',y+'px');
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,duration=reduced?0:open?820:650;
  const small=`circle(18px at ${x}px ${y}px)`,large=`circle(${r}px at ${x}px ${y}px)`;
  mist.style.clipPath=open?large:small;
  animations.push(mist.animate(open?[{clipPath:small,opacity:0},{clipPath:small,opacity:.9,offset:.04},{clipPath:large,opacity:1}]:[{clipPath:visibleMist.clipPath==='none'?large:visibleMist.clipPath,opacity:visibleMist.opacity},{clipPath:small,opacity:Math.min(.85,Number(visibleMist.opacity)),offset:.94},{clipPath:small,opacity:0}],{duration,easing:open?'cubic-bezier(.2,.7,.2,1)':'cubic-bezier(.55,0,.7,.35)',fill:'both'}));
  for(const [i,puff] of [...vapour.children].entries()){
   const angle=i*Math.PI*.4,dx=Math.cos(angle)*innerWidth*.15,dy=Math.sin(angle)*innerHeight*.12;
   puff.style.left=x+'px';puff.style.top=y+'px';puff.style.width=puff.style.height=Math.min(900,r*1.4)+'px';
   const seed={transform:'translate(-50%,-50%) scale(.025) rotate(-18deg)',opacity:.5},bloom={transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(1) rotate(${i*14}deg)`,opacity:.65};
   puff.style.transform=bloom.transform;puff.style.opacity=String(bloom.opacity);
   animations.push(puff.animate(open?[seed,bloom]:[visiblePuffs[i],seed],{duration,easing:open?'cubic-bezier(.18,.7,.25,1)':'cubic-bezier(.5,0,.7,.4)',fill:'both'}));
  }
  for(const [i,el] of content.entries())animations.push(el.animate(open?[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}]:[visibleContent[i],{opacity:0,transform:'translateY(-5px)'}],{duration:reduced?0:open?380:190,delay:reduced?0:open?200:0,easing:'ease-out',fill:'both'}));
  await Promise.all(animations.map(a=>a.finished.catch(()=>{})));
  if(ticket!==sequence)return;
  if(open){mist.style.clipPath='none';mist.style.opacity='1';for(const el of content){el.style.opacity='1';el.style.transform='none';}stop();}
 }
 return {close,open:()=>travel(true),async hide(){await travel(false);wheel.close();stop();mist.style.clipPath='none';mist.style.opacity='';for(const el of content){el.style.opacity='';el.style.transform='';}}};
}
