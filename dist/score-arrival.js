const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
let styleReady;
function styles(){
 if(styleReady)return styleReady;
 styleReady=new Promise(resolve=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/score-arrival.css';link.onload=resolve;link.onerror=resolve;document.head.append(link);});return styleReady;
}
styles();
const settle=animations=>Promise.all(animations.map(a=>a.finished.catch(()=>{})));
const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
export function concealArrivingScore(){document.querySelector('.score-card')?.classList.add('score-arrival-waiting');}
export function restoreArrivingScore(){document.querySelector('.score-card')?.classList.remove('score-arrival-waiting');}
export async function unfoldScoreLoader(loader){
 await styles();if(reduced())return;
 const seal=loader.querySelector('.score-loading-seal'),surface=loader.querySelector('.score-loading-dialog');
 const r=seal.getBoundingClientRect(),s=surface.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,radius=Math.hypot(innerWidth,innerHeight);
 const animations=[
  surface.animate([{transform:'scale(.9)'},{transform:'scale(1.025)',offset:.76},{transform:'scale(1)'}],{duration:640,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'}),
  loader.animate([{clipPath:`circle(${r.width*.6}px at ${x}px ${y}px)`,opacity:.3},{clipPath:`circle(${radius}px at ${x}px ${y}px)`,opacity:1}],{duration:640,easing:'cubic-bezier(.18,.8,.22,1)',fill:'both'}),
  surface.animate([{clipPath:`circle(${r.width/2}px at ${x-s.left}px ${y-s.top}px)`},{clipPath:`circle(${Math.hypot(s.width,s.height)}px at ${x-s.left}px ${y-s.top}px)`}],{duration:560,easing:'cubic-bezier(.18,.8,.22,1)',fill:'both'})
 ];
 try{await settle(animations);}finally{animations.forEach(a=>a.cancel());}
}
// The original seal travels all the way to the score. No second emblem, bitmap
// snapshot or clone of the engraved score is swapped in at a phase boundary.
export async function foldLoaderIntoScore(loader,{success=false}={}){
 const card=document.querySelector('.score-card'),sheet=document.querySelector('#sheet-scroll');
 if(loader.hidden){restoreArrivingScore();return;}
 await styles();
 if(reduced()||!success||!card||!sheet){
  if(!reduced()){const a=loader.animate([{opacity:1},{opacity:0}],{duration:220,fill:'forwards'});await settle([a]);loader.hidePopover?.();a.cancel();}
  restoreArrivingScore();return;
 }
 const seal=loader.querySelector('.score-loading-seal'),surface=loader.querySelector('.score-loading-dialog'),origin=seal.getBoundingClientRect(),panel=surface.getBoundingClientRect();
 const x=origin.left+origin.width/2,y=origin.top+origin.height/2;
 const slot=document.createElement('div');slot.style.cssText=`width:${origin.width}px;height:${origin.height}px;`;slot.setAttribute('aria-hidden','true');seal.replaceWith(slot);
 const originalStyle=seal.getAttribute('style'),animations=[];
 const layer=document.createElement('div');layer.className='score-arrival-layer';layer.setAttribute('popover','manual');layer.setAttribute('aria-hidden','true');
 const disc=document.createElement('div');disc.className='score-arrival-disc';disc.style.cssText=`left:${origin.left}px;top:${origin.top}px;width:${origin.width}px;height:${origin.height}px;`;
 seal.classList.add('score-arrival-emblem');disc.append(seal);layer.append(disc);document.body.append(layer);layer.showPopover?.();loader.dataset.arrivalPhase='fold';
 try{
  const fold=loader.animate([
   {clipPath:`circle(${Math.hypot(innerWidth,innerHeight)}px at ${x}px ${y}px)`,opacity:1},
   {clipPath:`circle(${origin.width*.7}px at ${x}px ${y}px)`,opacity:1,offset:.83},
   {clipPath:`circle(${origin.width*.44}px at ${x}px ${y}px)`,opacity:0}
  ],{duration:620,easing:'cubic-bezier(.65,0,.3,1)',fill:'both'});
  const squeeze=surface.animate([
   {transform:'translate3d(0,0,0) scale(1)',borderRadius:'30px',opacity:1},
   {transform:`translate3d(${x-panel.left-panel.width/2}px,${y-panel.top-panel.height/2}px,0) scale(${origin.width/panel.width},${origin.height/panel.height})`,borderRadius:'50%',opacity:0}
  ],{duration:620,easing:'cubic-bezier(.65,0,.3,1)',fill:'both'});
  const pulse=disc.animate([{transform:'scale(1)'},{transform:'scale(.88)',offset:.64},{transform:'scale(1.04)'}],{duration:620,easing:'ease-in-out',fill:'both'});
  animations.push(fold,squeeze,pulse);await settle([fold,squeeze,pulse]);
  loader.hidePopover?.();loader.hidden=true;
  // Move the viewport while the score is still concealed. Measure the landing
  // only after mobile navigation and the engraving layout have settled.
  const initial=sheet.getBoundingClientRect();if(initial.top<24||initial.bottom>innerHeight-24)sheet.scrollIntoView({block:'center',behavior:'instant'});
  await frame();
  const area=sheet.getBoundingClientRect(),left=Math.max(12,area.left),right=Math.min(innerWidth-12,area.right),top=Math.max(16,area.top),bottom=Math.min(innerHeight-16,area.bottom);
  const tx=(left+right)/2,ty=top+(bottom-top)*.42,dx=tx-x,dy=ty-y;
  loader.dataset.arrivalPhase='vinyl';disc.classList.add('is-vinyl');
  const emblem=seal.animate([{transform:'scale(1)',boxShadow:'0 0 0 0 #121116'},{transform:'scale(.37)',boxShadow:'0 0 0 2px #ffffff40'}],{duration:360,easing:'cubic-bezier(.22,.8,.24,1)',fill:'both'});
  const body=disc.animate([{backgroundColor:'#ad2720',boxShadow:'0 12px 28px #8c1e1a4d'},{backgroundColor:'#16151b',boxShadow:'0 28px 50px #21152655'}],{duration:360,fill:'both'});
  const grooves=disc.animate([{opacity:0},{opacity:1}],{duration:360,pseudoElement:'::before',fill:'both'});
  animations.push(emblem,body,grooves);await settle([emblem,body,grooves]);pulse.cancel();
  loader.dataset.arrivalPhase='flight';
  const flight=disc.animate([
   {transform:'perspective(1100px) translate3d(0,0,0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1.04)'},
   {transform:`perspective(1100px) translate3d(${dx*.22}px,${dy*.2-65}px,170px) rotateX(54deg) rotateY(-26deg) rotateZ(110deg) scale(1.5)`,offset:.32},
   {transform:`perspective(1100px) translate3d(${dx*.8}px,${dy*.78-20}px,90px) rotateX(-22deg) rotateY(18deg) rotateZ(275deg) scale(1.65)`,offset:.74},
   {transform:`perspective(1100px) translate3d(${dx}px,${dy}px,0) rotateX(0deg) rotateY(0deg) rotateZ(360deg) scale(1.6)`}
  ],{duration:780,easing:'cubic-bezier(.28,.5,.22,1)',fill:'both'});animations.push(flight);await settle([flight]);
  loader.dataset.arrivalPhase='score';
  const destination=card.getBoundingClientRect(),cx=tx-destination.left,cy=ty-destination.top,startRadius=origin.width*.8,maxRadius=Math.max(...[[0,0],[destination.width,0],[0,destination.height],[destination.width,destination.height]].map(([a,b])=>Math.hypot(a-cx,b-cy)));
  // Install both masks before revealing the real, already-rendered score.
  const reveal=card.animate([
   {clipPath:`circle(${startRadius}px at ${cx}px ${cy}px)`,transform:'perspective(1300px) rotateX(5deg) scale(.985)',opacity:0},
   {clipPath:`circle(${maxRadius*.35}px at ${cx}px ${cy}px)`,transform:'perspective(1300px) rotateX(1deg) scale(.996)',opacity:1,offset:.32},
   {clipPath:`circle(${maxRadius}px at ${cx}px ${cy}px)`,transform:'perspective(1300px) rotateX(0deg) scale(1)',opacity:1}
  ],{duration:660,easing:'cubic-bezier(.18,.8,.2,1)',fill:'both'});
  const dissolve=disc.animate([{opacity:1,filter:'blur(0px)'},{opacity:0,filter:'blur(5px)'}],{duration:290,easing:'ease-in',fill:'both'});
  animations.push(reveal,dissolve);restoreArrivingScore();await settle([reveal,dissolve]);
 }finally{
  restoreArrivingScore();animations.forEach(a=>a.cancel());seal.classList.remove('score-arrival-emblem');originalStyle===null?seal.removeAttribute('style'):seal.setAttribute('style',originalStyle);slot.replaceWith(seal);layer.remove();delete loader.dataset.arrivalPhase;
 }
}
