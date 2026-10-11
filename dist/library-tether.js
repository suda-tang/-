// The very same cards travel between layouts. No cover clones or second reveal.
export function cardPositions(list){
 // Resolve the bounded set's content before reading any row coordinates.
 // Auto containment otherwise changes earlier row heights during measurement.
 const candidates=[...list.querySelectorAll('.library-score')].filter(c=>!c.hidden&&!c.closest('[hidden]')&&(!c.closest('.library-card-stack:not(.is-expanded)')||c.classList.contains('stack-peek')));
 for(const card of candidates.slice(0,48)){card.style.contentVisibility='visible';const stack=card.closest('.library-card-stack');if(stack)stack.style.contentVisibility='visible';}
 const clip=list.getBoundingClientRect(),map=new Map();
 let measured=0;
 for(const card of list.querySelectorAll('.library-score')){
  if(card.hidden||card.closest('[hidden]'))continue;
  if(card.closest('.library-card-stack:not(.is-expanded)')&&!card.classList.contains('stack-peek'))continue;
  if(measured>=48&&!card._coverVisible)continue;
  measured++;
  const r=card.getBoundingClientRect();if(!r.width||!r.height)continue;
  const matrix=new DOMMatrix(getComputedStyle(card).transform);
  matrix.m41=matrix.m42=matrix.m43=0;
  const rawWidth=card.offsetWidth,rawHeight=card.offsetHeight;
  const projection=new DOMMatrix();projection.m34=-1/1300;projection.multiplySelf(matrix);
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{const p=new DOMPoint(x*rawWidth/2,y*rawHeight/2).matrixTransform(projection);return {x:p.x/p.w,y:p.y/p.w};});
  const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
  const fitX=r.width/Math.max(1,maxX-minX),fitY=r.height/Math.max(1,maxY-minY);
  map.set(card,{left:r.left,top:r.top,width:r.width,height:r.height,rawWidth,rawHeight,fitX,fitY,projectedX:(minX+maxX)/2*fitX,projectedY:(minY+maxY)/2*fitY,orientation:matrix.toString(),angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI,visible:r.right>Math.max(0,clip.left)&&r.left<Math.min(innerWidth,clip.right)&&r.bottom>Math.max(0,clip.top)&&r.top<Math.min(innerHeight,clip.bottom)});
 }
 return map;
}

export async function tetherCards(list,before,after,{closing=false,dock,limit=32,settle=Promise.resolve(),commit=()=>{},onLayer=()=>{}}={}){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){await (typeof settle==='function'?settle():settle);commit();return;}
 const cards=[...new Set([...after.keys(),...before.keys()])].filter(card=>before.get(card)?.visible||after.get(card)?.visible).slice(0,limit);
 const snapshots=cards.map(card=>{
  const to=after.get(card),from=before.get(card);if(!to&&!from)return null;
  const swallowed=closing&&!to?.visible;
  const end=swallowed?{left:dock.left+dock.width*.5-6,top:dock.top+dock.height*.5-9,width:12,height:18,rawWidth:from.rawWidth||from.width,rawHeight:from.rawHeight||from.height,fitX:12/(from.rawWidth||from.width),fitY:18/(from.rawHeight||from.height)}:to||{left:dock.right+40,top:dock.top+20,width:from.width,height:from.height};
  const start=from||{left:dock.right+40,top:dock.top+20,width:end.width,height:end.height};
  // Read all styles before moving any node out of its original ancestry.
  // Child cover/title styling is global and stays on the actual nodes. Copying
  // every descendant's computed geometry forces expensive content layout.
  const nodes=[card];
  const properties=['padding','border-radius','font-family','font-size','font-weight','line-height','color','box-shadow','background','border','backdrop-filter','-webkit-backdrop-filter'];
  return {card,start,end,swallowed,nodes,styles:nodes.map(n=>n.getAttribute('style')),computed:nodes.map(n=>{const s=getComputedStyle(n);return properties.map(k=>[k,s.getPropertyValue(k)]);})};
 }).filter(Boolean);
 const layer=document.createElement('div');layer.className='library-tether-layer';layer.setAttribute('popover','manual');layer.setAttribute('aria-hidden','true');
 layer.style.cssText='position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:hidden;pointer-events:none;';
 document.body.append(layer);layer.showPopover?.();
 document.dispatchEvent(new Event('library-flight-layer'));onLayer();
 const active=[],flights=[],fragment=document.createDocumentFragment(),listStyle=list.getAttribute('style');list.style.scrollSnapType='none';list.style.overflowAnchor='none';
 try{
  for(const [index,s] of snapshots.entries()){
   const {card,start,end}=s,slot=card.cloneNode(false);slot.removeAttribute('id');slot.setAttribute('aria-hidden','true');slot.style.cssText+=`;box-sizing:border-box!important;width:${end.rawWidth||end.width}px!important;height:${end.rawHeight||end.height}px!important;visibility:hidden!important;pointer-events:none!important;transition:none!important;animation:none!important;`;card.replaceWith(slot);s.slot=slot;
   for(let i=0;i<s.nodes.length;i++)for(const [k,v] of s.computed[i])s.nodes[i].style.setProperty(k,v);
   const w=end.rawWidth||end.width,h=end.rawHeight||end.height;
   const carrier=document.createElement('div');carrier.className='library-tether-card';carrier.style.cssText=`position:absolute;left:${end.left+(end.width-w)/2-(end.projectedX||0)}px;top:${end.top+(end.height-h)/2-(end.projectedY||0)}px;width:${w}px;height:${h}px;z-index:${snapshots.length-index};transform-origin:50% 50%;will-change:transform;`;
   card.style.cssText+=`;position:absolute!important;left:0!important;top:0!important;width:${w}px!important;height:${h}px!important;min-width:0!important;min-height:0!important;margin:0!important;transform:none!important;translate:none!important;rotate:none!important;scale:none!important;transition:none!important;animation:none!important;visibility:visible!important;opacity:1!important;content-visibility:visible!important;transform-origin:0 0!important;pointer-events:none!important;`;
   fragment.append(carrier);carrier.append(card);
   const dx=start.left+start.width/2-(start.projectedX||0)-end.left-end.width/2+(end.projectedX||0),dy=start.top+start.height/2-(start.projectedY||0)-end.top-end.height/2+(end.projectedY||0),sx=(start.rawWidth||start.width)/w,sy=(start.rawHeight||start.height)/h;
   const identity='matrix(1,0,0,1,0,0)',fromMatrix=start.orientation||identity,toMatrix=end.orientation||identity;
   const clipping=(r,weight)=>`inset(${[Math.max(0,dock.top-r.top)/r.height,Math.max(0,r.left+r.width-dock.right)/r.width,Math.max(0,r.top+r.height-dock.bottom)/r.height,Math.max(0,dock.left-r.left)/r.width].map(v=>Math.min(100,v*100)*weight+'%').join(' ')})`;
   // One continuous current: no intermediate landing, recoil or direction flip.
   // Sample a smooth arc and interpolate orientation throughout the flight.
   const from=new DOMMatrix(fromMatrix),to=new DOMMatrix(toMatrix),frames=[];
   const fields=['m11','m12','m13','m14','m21','m22','m23','m24','m31','m32','m33','m34','m41','m42','m43','m44'];
   const bend=closing?-1:1;
   for(let step=0;step<=24;step++){
    const t=step/24,crest=Math.sin(Math.PI*t),swell=crest*crest;
    const x=dx*(1-t)+bend*64*swell,y=dy*(1-t)-Math.min(170,Math.max(60,Math.abs(dy)*.22))*crest;
    const orientation='matrix3d('+fields.map(k=>from[k]+(to[k]-from[k])*t).join(',')+')';
    const scaleX=sx*(start.fitX||1)*(1-t)+(end.fitX||1)*t,scaleY=sy*(start.fitY||1)*(1-t)+(end.fitY||1)*t;
    frames.push({offset:t,transform:`translate3d(${x}px,${y}px,0) perspective(1300px) translateZ(${260*crest}px) rotateX(${bend*-38*crest}deg) rotateY(${bend*24*crest}deg) rotateZ(${bend*7*crest}deg) scale(${scaleX},${scaleY}) ${orientation}`,opacity:s.swallowed&&t>.96?Math.max(0,(1-t)/.04):1,clipPath:closing?(s.swallowed?'inset(0% 0% 0% 0%)':clipping(end,Math.max(0,(t-.96)/.04))):clipping(start,Math.max(0,1-t/.4))});
   }
   const anchor=closing?start:end;
   const rank=Math.max(0,Math.min(1,(anchor.left+anchor.top*.3)/Math.max(1,innerWidth+innerHeight*.3)));
   // Unclipped flights remain transform-only compositor animations.
   if(frames.every(frame=>frame.clipPath==='inset(0% 0% 0% 0%)'))for(const frame of frames)delete frame.clipPath;
   carrier.style.transform=frames[0].transform;
   if(frames[0].clipPath)carrier.style.clipPath=frames[0].clipPath;
   flights.push({carrier,frames,timing:{duration:780,delay:(closing?1-rank:rank)*70,easing:'cubic-bezier(.32,.05,.2,1)',fill:'both'}});
  }
  // Opacity cannot be undone by collapsed stacks' visibility:visible rules.
  list.style.opacity='0';layer.append(fragment);
  // Let the newly reparented cards paint at their original positions before
  // starting the clock. Cold iOS layout must not consume the flight itself.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  for(const {carrier,frames,timing} of flights)active.push(carrier.animate(frames,timing));
  await Promise.all([typeof settle==='function'?settle():settle,...active.map(a=>a.finished.catch(()=>{}))]);
 }finally{
  snapshots.forEach(s=>{s.slot?.replaceWith(s.card);s.nodes.forEach((n,i)=>s.styles[i]===null?n.removeAttribute('style'):n.setAttribute('style',s.styles[i]));});
  // Commit the new layout while both old and new list surfaces remain hidden.
  // There is no paint of restored fullscreen cards before returning to the dock.
  commit();
  active.forEach(a=>a.cancel());listStyle===null?list.removeAttribute('style'):list.setAttribute('style',listStyle);layer.remove();
  document.dispatchEvent(new Event('library-flight-finished'));
 }
}
