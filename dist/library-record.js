import {unfoldScoreLoader,restoreArrivingScore} from './score-arrival.js';
import {cardPositions} from './library-tether.js';
// Carry the selected original card into the existing loading surface.
export async function carryCardToLoader(card,list,loader,settle=()=>Promise.resolve(),{ready=()=>false}={}){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){document.body.classList.add('score-loader-covering');loader.style.removeProperty('opacity');await settle();return;}
 const source=cardPositions(list).get(card);
 const box=card.getBoundingClientRect(),style=card.getAttribute('style'),computed=getComputedStyle(card),padding=computed.padding;
 const matrix=new DOMMatrix(computed.transform);matrix.m41=matrix.m42=matrix.m43=0;
 const w=card.offsetWidth,h=card.offsetHeight;
 const order=(window.cloudLibrarySnapshot?.scores||[]).map(s=>s.id),at=order.indexOf(card.dataset.scoreId);
 const following=at>=0?order.slice(at+1):[card.nextElementSibling?.dataset.scoreId].filter(Boolean);
 const slot=card.cloneNode(false);slot.removeAttribute('id');slot.setAttribute('aria-hidden','true');slot.style.cssText+=`;box-sizing:border-box!important;width:${w}px!important;height:${h}px!important;visibility:hidden!important;pointer-events:none!important;transition:none!important;animation:none!important;`;
 card.replaceWith(slot);
 const layer=document.createElement('div');layer.className='record-flight';layer.setAttribute('popover','manual');layer.setAttribute('aria-hidden','true');
 layer.style.cssText=`position:fixed;left:${box.left+(box.width-w)/2-(source?.projectedX||0)}px;top:${box.top+(box.height-h)/2-(source?.projectedY||0)}px;width:${w}px;height:${h}px;max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:0;background:transparent;overflow:visible;pointer-events:none;transform-origin:50% 50%;`;
 card.style.cssText+=`;position:absolute!important;inset:0!important;width:${w}px!important;height:${h}px!important;min-width:0!important;min-height:0!important;margin:0!important;padding:${padding}!important;transform:none!important;translate:none!important;rotate:none!important;scale:none!important;opacity:1!important;visibility:visible!important;transition:none!important;animation:none!important;content-visibility:visible!important;`;
 const inside=document.createElement('div');inside.className='record-book-inside';
 const cover=document.createElement('div');cover.className='record-book-cover';cover.append(card);
 const pocket=document.createElement('div');pocket.className='record-book-pocket';
 const title=document.createElement('div');title.className='record-book-title';
 title.textContent=card.querySelector('.library-title')?.textContent?.trim()||card.getAttribute('aria-label')||'';
 title.style.fontSize=Math.min(33,Math.max(14,Math.sqrt(w*h*.4/Math.max(1,Array.from(title.textContent).length))))+'px';
 title.setAttribute('dir','auto');cover.append(title);
 if(!document.querySelector('link[data-record-font]')){const font=document.createElement('link');font.rel='stylesheet';font.href='/vendor/record-fonts/title-font.css';font.dataset.recordFont='';document.head.append(font);}
 const emblem=document.createElement('img');emblem.className='record-pocket-seal';emblem.src='/suda-seal.svg';emblem.alt='苏州大学';emblem.width=64;emblem.height=64;pocket.append(emblem);
 layer.append(inside,cover);document.body.append(layer);layer.showPopover?.();
 const target=loader.querySelector('.score-loading-seal').getBoundingClientRect();
 const seal=loader.querySelector('.score-loading-seal'),sealStyle=seal.getAttribute('style');
 const sealSlot=document.createElement('div');sealSlot.style.cssText=`width:${target.width}px;height:${target.height}px;`;seal.replaceWith(sealSlot);
 const discLayer=document.createElement('div');discLayer.className='record-disc-stage';discLayer.setAttribute('popover','manual');discLayer.setAttribute('aria-hidden','true');discLayer.style.cssText='position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;pointer-events:none;overflow:visible;';
 const diameter=Math.max(90,Math.min(w*.8,200)),cx=box.left+box.width/2,cy=box.top+box.height*.4;
 const disc=document.createElement('div');disc.className='record-launch-disc';disc.style.cssText=`position:absolute;left:${cx-diameter/2}px;top:${cy-diameter/2}px;width:${diameter}px;height:${diameter}px;border-radius:50%;background:radial-gradient(circle,#d9b6ad 0 4%,#874357 4.5% 22%,transparent 22.5%),repeating-radial-gradient(circle,#1a191f 0 2px,#35323c 2.5px,#17161c 3.5px);box-shadow:inset 0 0 0 2px #fff9,0 20px 36px #30203030;`;
 seal.classList.add('record-morph-emblem');seal.style.cssText+=`;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;opacity:0;transform:scale(.28);`;disc.append(seal);disc.style.left=(w-diameter)/2+'px';disc.style.top=Math.max(12,(h-diameter)/2)+'px';inside.append(disc,pocket);document.body.append(discLayer);
 const animations=[];const animate=(el,frames,options)=>{const a=el.animate(frames,{fill:'both',...options});animations.push(a);return a;};const finish=a=>a.finished.catch(()=>{});
 try{
  const bookScale=Math.min(1.05,innerWidth/(w*2.25),innerHeight/(h*1.65));
  const bx=innerWidth*.5+w*bookScale*.43-box.left-box.width/2+(source?.projectedX||0),by=innerHeight*.48-box.top-box.height/2+(source?.projectedY||0);
  const lifted=`perspective(1400px) translate3d(${bx}px,${by}px,0) rotateX(10deg) rotateY(-10deg) rotateZ(-3deg) scale(${bookScale})`;
  loader.dataset.arrivalPhase='book-lift';
  await finish(animate(layer,[{transform:`perspective(1400px) scale(${source?.fitX||1},${source?.fitY||1}) ${matrix}`},{transform:lifted}],{duration:820,easing:'cubic-bezier(.22,.7,.2,1)'}));
  loader.dataset.arrivalPhase='book-open';
  const opening=animate(cover,[{transform:'rotateY(0deg)'},{transform:'rotateY(-148deg)'}],{duration:1100,easing:'cubic-bezier(.35,0,.2,1)'});
  await finish(opening);
  loader.dataset.arrivalPhase='disc-release';
  const flat=`perspective(1400px) translate3d(${bx}px,${by}px,0) scale(${bookScale})`;
  const flatten=animate(layer,[{transform:lifted},{transform:flat}],{duration:920,easing:'cubic-bezier(.3,.1,.2,1)'});
  await finish(animate(disc,[{transform:'translate3d(0,0,1px)'},{transform:`translate3d(${w*.15}px,${-h*.38}px,1px)`}],{duration:920,easing:'cubic-bezier(.3,.1,.2,1)'}));
  await finish(flatten);
  // Keep the very same disc at its exact projected bounds when it leaves the sleeve.
  const released=disc.getBoundingClientRect();discLayer.append(disc);discLayer.showPopover?.();
  for(const animation of animations.filter(a=>a.effect?.target===disc))animation.cancel();
  Object.assign(disc.style,{left:released.left+'px',top:released.top+'px',width:released.width+'px',height:released.height+'px',transform:'none'});
  loader.dataset.arrivalPhase='disc-to-seal';
  const tx=target.left+target.width/2-released.left-released.width/2,ty=target.top+target.height/2-released.top-released.height/2,ratio=target.width/released.width;
  const travel=animate(disc,[{transform:'translate3d(0,0,0) scale(1)'},{transform:`translate3d(${tx*.48}px,${ty*.48-26}px,0) scale(${1+(ratio-1)*.48})`,offset:.48},{transform:`translate3d(${tx}px,${ty}px,0) scale(${ratio})`}],{duration:1000,easing:'cubic-bezier(.3,.05,.2,1)'});
  animate(seal,[{opacity:0,transform:'scale(.65) rotate(-12deg)'},{opacity:1,transform:'scale(1) rotate(0deg)'}],{duration:680,delay:260,easing:'cubic-bezier(.22,.8,.2,1)'});
  animate(layer,[{opacity:1,transform:flat},{opacity:0,transform:`perspective(1400px) translate3d(${bx}px,${by+32}px,-70px) scale(${bookScale*.96})`}],{duration:850,delay:100,easing:'ease-in-out'});
  await finish(travel);
  // Reparent the same emblem at the exact measured landing position.
  await Promise.resolve().then(settle);
  if(ready()){
   // The download and engraving finished during the sleeve animation. Reveal
   // that prepared score directly; never open and immediately close a loader.
   loader.hidePopover?.();loader.hidden=true;
   const sheet=document.querySelector('#sheet-scroll'),score=document.querySelector('.score-card');
   if(sheet){const r=sheet.getBoundingClientRect();if(r.top<24||r.bottom>innerHeight-24)sheet.scrollIntoView({block:'center',behavior:'instant'});}
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   if(score&&sheet){
    loader.dataset.arrivalPhase='direct-vinyl';
    const area=sheet.getBoundingClientRect(),from=disc.getBoundingClientRect();
    const x=(Math.max(12,area.left)+Math.min(innerWidth-12,area.right))/2;
    const y=Math.max(16,area.top)+(Math.min(innerHeight-16,area.bottom)-Math.max(16,area.top))*.42;
    const dx=x-from.left-from.width/2,dy=y-from.top-from.height/2;
    // Continue from the exact last frame of the same physical disc.
    const base=`translate3d(${tx}px,${ty}px,0) scale(${ratio})`;
    const flight=animate(disc,[
     {transform:base},
     {transform:`translate3d(${tx+dx*.55}px,${ty+dy*.55-36}px,0) scale(${ratio*1.35}) rotateX(32deg) rotateZ(120deg)`,offset:.55},
     {transform:`translate3d(${tx+dx}px,${ty+dy}px,0) scale(${ratio*1.5}) rotateX(0deg) rotateZ(240deg)`}
    ],{duration:620,easing:'cubic-bezier(.25,.5,.2,1)'});
    await finish(flight);
    const rect=score.getBoundingClientRect(),px=x-rect.left,py=y-rect.top;
    const radius=Math.max(...[[0,0],[rect.width,0],[0,rect.height],[rect.width,rect.height]].map(([a,b])=>Math.hypot(a-px,b-py)));
    const reveal=animate(score,[
     {clipPath:`circle(${from.width*.65}px at ${px}px ${py}px)`,opacity:0},
     {clipPath:`circle(${radius*.45}px at ${px}px ${py}px)`,opacity:1,offset:.4},
     {clipPath:`circle(${radius}px at ${px}px ${py}px)`,opacity:1}
    ],{duration:560,easing:'cubic-bezier(.18,.8,.2,1)'});
    const dissolve=animate(disc,[{opacity:1},{opacity:0}],{duration:240,easing:'ease-in'});
    restoreArrivingScore();await Promise.all([finish(reveal),finish(dissolve)]);
   }else restoreArrivingScore();
   return;
  }
  sealSlot.replaceWith(seal);seal.classList.remove('record-morph-emblem');sealStyle===null?seal.removeAttribute('style'):seal.setAttribute('style',sealStyle);
  // Top-layer order, rather than z-index, decides which popover covers another.
  // Finish card returns before the loading surface takes the foreground.
  layer.remove();discLayer.remove();loader.hidePopover?.();loader.showPopover?.();
  loader.style.removeProperty('opacity');loader.dataset.arrivalPhase='balloon';
  await unfoldScoreLoader(loader);
 }
 finally{
  if(slot.isConnected)slot.replaceWith(card);
  else{const anchor=following.map(id=>list.querySelector(`[data-score-id="${CSS.escape(id)}"]`)).find(Boolean);if(anchor)anchor.before(card);else list.append(card);}
  style===null?card.removeAttribute('style'):card.setAttribute('style',style);
  animations.forEach(a=>a.cancel());if(sealSlot.isConnected)sealSlot.replaceWith(seal);seal.classList.remove('record-morph-emblem');sealStyle===null?seal.removeAttribute('style'):seal.setAttribute('style',sealStyle);discLayer.remove();layer.remove();loader.style.removeProperty('opacity');delete loader.dataset.arrivalPhase;
 }
}
