import {defineLiquidGlass} from './vendor/simple-liquid-glass/web-component.esm.js';
defineLiquidGlass('tqm-liquid-glass');
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
// A small canvas provides a bounded optical source on WebKit. It contains the
// page's ambient palette, rather than repeatedly rasterising the score DOM.
const backdrop=document.createElement('canvas');backdrop.id='liquid-ambient-source';backdrop.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:-10;opacity:0';backdrop.setAttribute('aria-hidden','true');document.body.append(backdrop);
function paintBackdrop(){const scale=Math.min(1,1200/innerWidth);backdrop.width=Math.round(innerWidth*scale);backdrop.height=Math.round(innerHeight*scale);const c=backdrop.getContext('2d'),w=backdrop.width,h=backdrop.height;c.fillStyle='#f4f2f5';c.fillRect(0,0,w,h);for(const [x,y,color] of [[.08,0,'#dbc8dd'],[.92,.35,'#d4e2dc']]){let g=c.createRadialGradient(w*x,h*y,0,w*x,h*y,w*.55);g.addColorStop(0,color);g.addColorStop(1,'#f4f2f500');c.fillStyle=g;c.fillRect(0,0,w,h);}}
paintBackdrop();let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(paintBackdrop,180);},{passive:true});
const selector='#language-trigger,.workspace-nav,.view-buttons';
function mount(el){if(el.hasAttribute('data-optical-glass'))return;el.dataset.opticalGlass='';el.classList.add('optical-glass-control');const glass=document.createElement('tqm-liquid-glass');glass.className='optical-glass-material';glass.setAttribute('aria-hidden','true');for(const [k,v] of Object.entries({'radius':el.matches('.workspace-nav,.view-buttons')?'20':'24','frost':'.07','blur':'1.4','saturation':'115','scale':'65','dispersion':'8','lens':'rounded','border-color':'rgba(255,255,255,.72)','backdrop-selector':'#liquid-ambient-source'}))glass.setAttribute(k,v);el.prepend(glass);
 const highlight=document.createElement('i');highlight.className='optical-glass-highlight';highlight.setAttribute('aria-hidden','true');el.append(highlight);
 let frame=0,point;function move(e){point=e;if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const r=el.getBoundingClientRect();el.style.setProperty('--glass-x',((point.clientX-r.left)/r.width*100).toFixed(1)+'%');el.style.setProperty('--glass-y',((point.clientY-r.top)/r.height*100).toFixed(1)+'%');});}
 el.addEventListener('pointermove',move,{passive:true});el.addEventListener('pointerdown',e=>{move(e);el.classList.add('glass-pressed');},{passive:true});const release=()=>el.classList.remove('glass-pressed');el.addEventListener('pointerup',release,{passive:true});el.addEventListener('pointercancel',release,{passive:true});el.addEventListener('pointerleave',release,{passive:true});
 if(reduced.matches)glass.setAttribute('effect-mode','blur');
}
function scan(){document.querySelectorAll(selector).forEach(mount);}scan();
const candidates=new Set();let pending=false;
new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node.nodeType!==1)continue;if(node.matches(selector))candidates.add(node);if(node.tagName!=='svg'&&node.tagName!=='BUTTON')node.querySelectorAll(selector).forEach(el=>candidates.add(el));}if(!candidates.size||pending)return;pending=true;requestAnimationFrame(()=>{pending=false;for(const el of candidates)if(el.isConnected)mount(el);candidates.clear();});}).observe(document.body,{childList:true,subtree:true});
