import {unfoldScoreLoader} from './score-arrival.js';
import {cardPositions} from './library-tether.js';
// Carry the selected original card into the existing loading surface.
export async function carryCardToLoader(card,list,loader,settle=()=>Promise.resolve()){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){loader.style.removeProperty('opacity');await settle();return;}
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
 layer.append(card);document.body.append(layer);layer.showPopover?.();
 const target=loader.querySelector('.score-loading-seal').getBoundingClientRect();
 const dx=target.left+target.width/2-box.left-box.width/2+(source?.projectedX||0),dy=target.top+target.height/2-box.top-box.height/2+(source?.projectedY||0),scale=Math.min(target.width/w,target.height/h);
 const seal=loader.querySelector('.score-loading-seal'),sealStyle=seal.getAttribute('style');
 const sealSlot=document.createElement('div');sealSlot.style.cssText=`width:${target.width}px;height:${target.height}px;`;seal.replaceWith(sealSlot);
 const discLayer=document.createElement('div');discLayer.className='record-disc-stage';discLayer.setAttribute('popover','manual');discLayer.setAttribute('aria-hidden','true');discLayer.style.cssText='position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;pointer-events:none;overflow:visible;';
 const diameter=Math.max(90,Math.min(w*.8,200)),cx=box.left+box.width/2,cy=box.top+box.height*.4;
 const disc=document.createElement('div');disc.className='record-launch-disc';disc.style.cssText=`position:absolute;left:${cx-diameter/2}px;top:${cy-diameter/2}px;width:${diameter}px;height:${diameter}px;border-radius:50%;background:conic-gradient(from 20deg,#c5c8dc,#fff,#b3d7dd,#f4cce5,#f7f8ff,#c5c8dc);box-shadow:inset 0 0 0 2px #fff9,0 20px 36px #30203030;`;
 seal.classList.add('record-morph-emblem');seal.style.cssText+=`;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;opacity:0;transform:scale(.28);`;disc.append(seal);discLayer.append(disc);document.body.append(discLayer);discLayer.showPopover?.();
 const animations=[];const animate=(el,frames,options)=>{const a=el.animate(frames,{fill:'both',...options});animations.push(a);return a;};const finish=a=>a.finished.catch(()=>{});
 let flight;
 try{
  loader.dataset.arrivalPhase='card-tip';
  flight=animate(layer,[{transform:`perspective(1100px) rotateX(0deg) scale(${source?.fitX||1},${source?.fitY||1}) ${matrix}`},{transform:'perspective(1100px) translate3d(0,22px,130px) rotateX(36deg) scale(1.04)'}],{duration:420,easing:'cubic-bezier(.22,.75,.25,1)'});
  const rise=animate(disc,[{transform:'perspective(1000px) translate3d(0,65px,-60px) rotateX(64deg) scale(.12)',opacity:0},{transform:'perspective(1000px) translate3d(0,-38px,80px) rotateX(18deg) scale(1)',opacity:1}],{duration:540,delay:150,easing:'cubic-bezier(.16,.8,.28,1)'});
  await finish(rise);loader.dataset.arrivalPhase='disc-to-seal';
  const tx=target.left+target.width/2-cx,ty=target.top+target.height/2-cy,ratio=target.width/diameter;
  const travel=animate(disc,[{transform:'perspective(1000px) translate3d(0,-38px,80px) rotateX(18deg) scale(1)'},{transform:`perspective(1000px) translate3d(${tx*.6}px,${ty*.6-20}px,35px) rotateX(8deg) scale(${ratio*1.3})`,offset:.65},{transform:`perspective(1000px) translate3d(${tx}px,${ty}px,0) rotateX(0deg) scale(${ratio})`}],{duration:560,easing:'cubic-bezier(.26,.65,.2,1)'});
  animate(seal,[{opacity:0,transform:'scale(.28) rotate(-32deg)'},{opacity:1,transform:'scale(1) rotate(0deg)'}],{duration:480,easing:'cubic-bezier(.22,.8,.2,1)'});
  animate(layer,[{opacity:1},{opacity:0}],{duration:340,easing:'ease-in'});
  await finish(travel);
  // Reparent the same emblem at the exact measured landing position.
  sealSlot.replaceWith(seal);seal.classList.remove('record-morph-emblem');sealStyle===null?seal.removeAttribute('style'):seal.setAttribute('style',sealStyle);
  loader.style.removeProperty('opacity');discLayer.remove();loader.dataset.arrivalPhase='balloon';
  await Promise.all([unfoldScoreLoader(loader),Promise.resolve().then(settle)]);
 }
 finally{
  if(slot.isConnected)slot.replaceWith(card);
  else{const anchor=following.map(id=>list.querySelector(`[data-score-id="${CSS.escape(id)}"]`)).find(Boolean);if(anchor)anchor.before(card);else list.append(card);}
  style===null?card.removeAttribute('style'):card.setAttribute('style',style);
  animations.forEach(a=>a.cancel());if(sealSlot.isConnected)sealSlot.replaceWith(seal);seal.classList.remove('record-morph-emblem');sealStyle===null?seal.removeAttribute('style'):seal.setAttribute('style',sealStyle);discLayer.remove();layer.remove();loader.style.removeProperty('opacity');delete loader.dataset.arrivalPhase;
 }
}
