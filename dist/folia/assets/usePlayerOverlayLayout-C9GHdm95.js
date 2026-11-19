import{n as e,r as t}from"./rolldown-runtime-hePW80VL.js";import{Ct as n,Et as r,U as i,h as a,j as o,k as s,l as c,lt as l,r as u,s as d,st as f,z as p}from"./lucide-icons-BLzzyU0y.js";import{B as m,H as h,R as g,V as _,z as v}from"./providerRegistry-Br1QXXHc.js";import{C as y,F as b,O as x,S,c as C,d as w,h as T,i as E,k as D,l as O,n as k,o as A,p as ee,r as j,s as M,u as te,v as ne,x as re,y as ie}from"./usePlayerChromeSettingsStore-M_0Zt6Lk.js";import{$ as ae,F as oe,I as se,L as ce,R as le,T as ue,V as de,d as fe,et as pe,m as me,nt as he,u as ge}from"./themeColorMath-CsKiZkr7.js";import{a as _e,i as ve,n as ye,o as be}from"./value-jNKkcUOO.js";import{_ as xe,c as Se,d as Ce,g as we,h as N,i as P,l as Te,m as Ee,n as De,o as Oe,p as ke,r as Ae,s as je,t as Me,u as Ne}from"./paperShaderUniforms-glv1M_No.js";import{C as Pe,F as Fe,a as Ie,g as F,m as Le,t as Re,v as ze}from"./visualizerModes-F6HhwNb0.js";import{t as Be}from"./react-DrygFcre.js";import{i as Ve,n as He,t as Ue}from"./storagePrimitives-1Z0kv7xK.js";import{n as We,r as Ge,t as I}from"./colorMix-08vn8-lY.js";import{n as Ke}from"./beatEffects-B1QX-wnr.js";import{a as qe,i as Je,r as Ye}from"./motionSignals-CtY0HKnb.js";import{i as Xe,n as Ze,r as Qe,s as $e,t as et}from"./lucideIconResolver-DSyqamvS.js";import{p as tt,t as nt}from"./beatFxLive-dLhNfd00.js";import{d as rt,f as it,t as at,u as ot}from"./stageLayers-zRo1Bful.js";function st(...e){let t=!Array.isArray(e[0]),n=t?0:-1,r=e[0+n],i=e[1+n],a=e[2+n],o=e[3+n],s=de(i,a,o);return t?s(r):s}var ct=new Set,lt=({timestamp:e})=>{ct.forEach(t=>t.tick(e))},ut=class extends oe{constructor(e){super(),this.state=`idle`,this.startTime=0,this.currentTime=0,this.started=!1,this.hasNextTarget=!1,this.nextTarget=0,this.stop=()=>{this.state!==`idle`&&(this.teardown(),this.options.onStop?.())},this.options=e,se(e),this.factory=e.type||le,this.generator=this.factory(e);let{driver:t}=e;t&&(this.driver=t(e=>this.tick(e))),this.startTime=this.now(),this.state=`running`,this.driver?this.driver.start():(ct.size||be.update(lt,!0),ct.add(this))}setTarget(e,t){this.nextTarget=e,this.nextVelocity=t,this.hasNextTarget=!0}retarget(e,t){let{options:n,generator:r}=this;n.keyframes=e,n.velocity=t,this.startTime=this.now(),this.currentTime=0,r.retarget?r.retarget(e,t):this.generator=this.factory(n)}tick(e){let{options:t,hasNextTarget:n}=this,{delay:r=0,onUpdate:i,onPlay:a}=t,o=Math.round(e-this.startTime)-r,s=this.currentTime=Math.max(0,o),c=this.generator.next(s),l=o<0?t.keyframes[0]:c.value;if(n){this.hasNextTarget=!1;let{keyframes:e}=t;e[0]=l,e[1]=this.nextTarget,this.retarget(e,this.nextVelocity??this.getGeneratorVelocity())}(n||!this.started)&&(this.started=!0,a?.()),this.state===`running`&&(i?.(l),c.done&&o>=0&&!n&&!this.hasNextTarget&&this.state===`running`&&(this.notifyFinished(),this.teardown(),this.state=`finished`,t.onComplete?.()))}getGeneratorVelocity(){return ce(this.generator,this.currentTime,this.options.velocity)}now(){return this.driver?this.driver.now():ve.now()}teardown(){this.state=`idle`,this.driver?this.driver.stop():(ct.delete(this),ct.size||_e(lt))}};function dt(e,t,n={}){let r=e.get(),i=null,a,o=typeof r==`string`?r.replace(/[\d.-]/g,``):void 0,s=e=>a(o?e+o:e),c=()=>e.events.animationStart?.notify(),l=()=>{i&&=(i.stop(),null),e.animation=void 0};if(e.attach((t,r)=>{a=r;let o=pt(t);if(i?.state===`running`){i.setTarget(o,n.velocity);return}let u=pt(e.get()),d=i?i.getGeneratorVelocity():e.getVelocity();if(l(),u===o)return;let f=i=new ut({keyframes:[u,o],velocity:d,type:`spring`,restDelta:.001,restSpeed:.01,...n,onUpdate:s,onPlay:c});e.animation=f,f.then(()=>{i===f&&(i=null,e.animation=void 0,e.events.animationComplete?.notify())})},l),ue(t)){let r=n.skipInitialAnimation===!0,i=t.on(`change`,t=>{r?(r=!1,e.jump(ft(t,o),!1)):e.set(ft(t,o))}),a=e.on(`destroy`,i);return()=>{i(),a()}}return l}function ft(e,t){return t?e+t:e}function pt(e){return typeof e==`number`?e:parseFloat(e)}var L=t(r(),1);function mt(e,t){let n=xe(t()),r=()=>n.set(t());return r(),ae(()=>{let t=()=>be.preRender(r,!1,!0),n=e.map(e=>e.on(`change`,t));return()=>{n.forEach(e=>e()),_e(r)}}),n}function ht(e){ye.current=[],e();let t=mt(ye.current,e);return ye.current=void 0,t}function gt(e,t,n,r){if(typeof e==`function`)return ht(e);if(n!==void 0&&!Array.isArray(n)&&typeof t!=`function`)return vt(e,t,n,r);let i=typeof t==`function`?t:st(t,n,r),a=Array.isArray(e)?_t(e,i):_t([e],([e])=>i(e)),o=Array.isArray(e)?void 0:e.accelerate;return o&&!o.isTransformed&&typeof t!=`function`&&Array.isArray(n)&&r?.clamp!==!1&&(a.accelerate={...o,times:t,keyframes:n,isTransformed:!0,...r?.ease?{ease:r.ease}:{}}),a}function _t(e,t){let n=pe(()=>[]);return mt(e,()=>{n.length=0;let r=e.length;for(let t=0;t<r;t++)n[t]=e[t].get();return t(n)})}function vt(e,t,n,r){let i=pe(()=>Object.keys(n)),a=pe(()=>({}));for(let o of i)a[o]=gt(e,t,n[o],r);return a}function yt(e,t={}){let{isStatic:n}=(0,L.useContext)(me),r=()=>ue(e)?e.get():e;if(n)return gt(r);let i=xe(r());return(0,L.useInsertionEffect)(()=>dt(i,e,t),[i,JSON.stringify(t)]),i}function bt(e,t={}){return yt(e,{type:`spring`,...t})}var R=he(),xt=e=>e,St={id:`bg-common`,titleKey:`options.visualizerBackgroundModeCommon`},Ct={id:`bg-common-cover`,titleKey:`options.previewCoverBackgroundSettings`},wt=({config:e,actions:t,t:n,onSliderPointerDown:r,onSliderCommit:i})=>{let a=e?.common,o=t?.common,s=a?.useCoverColorBg??!1;return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsxs)(S,{def:St,bare:!0,children:[(0,R.jsx)(j,{label:n(`options.disableVisualizerVignette`),note:n(`options.disableVisualizerVignetteDesc`),checked:a?.disableVignette??!1,onChange:e=>o?.onDisableVignetteChange?.(e)}),(0,R.jsx)(j,{label:n(`options.disableVisualizerGeometricBackground`),note:n(`options.disableVisualizerGeometricBackgroundDesc`),checked:a?.disableGeometricBackground??!1,onChange:e=>o?.onDisableGeometricChange?.(e)})]}),(0,R.jsxs)(S,{def:Ct,children:[(0,R.jsx)(j,{label:n(`theme.addCoverColor`),note:n(`options.coverColorBackgroundDesc`),checked:s,onChange:e=>o?.onCoverColorChange?.(e)}),(0,R.jsx)(D,{when:s,children:(0,R.jsx)(k,{sub:!0,label:n(`options.previewCoverBackgroundOpacity`),value:a?.opacity??.75,min:0,max:1,step:.05,format:E,onChange:e=>o?.onOpacityChange?.(e),onDragStart:r,onDragEnd:i})})]})]})},Tt=`data-picture-arriving`,Et=(0,L.createContext)(null),Dt=()=>{let e=(0,L.useContext)(Et);return(0,L.useLayoutEffect)(()=>{e?.claim()},[e]),(0,L.useCallback)(()=>e?.drawn(),[e])},Ot=(0,L.createContext)(!1),kt=()=>(0,L.useContext)(Ot),At=e=>Math.max(0,Math.min(1,e)),jt=(e,t)=>t>=1?1:At((e-t)/(1-t)),Mt=e=>1-(1-e)**3,Nt=(e,t)=>e.length===t.length&&e.every((e,n)=>e===t[n]),Pt=(e,t,n)=>{let r=e.join(`|`),i=(0,L.useMemo)(()=>r.split(`|`),[r]),[a,o]=(0,L.useState)(i),s=(0,L.useRef)(i);return(0,L.useEffect)(()=>{let e=s.current,r=e=>{s.current=e,o(e)};if(Nt(e,i))return;if(t<=0||e.length!==i.length){r(i);return}let a=t=>t>=1?i:i.map((n,r)=>We(e[r],n,t)),c=n?.get()??1;if(n&&c<1)return n.on(`change`,e=>r(a(jt(e,c))));let l=performance.now(),u=0,d=e=>{let n=Math.min(1,(e-l)/t);r(a(n>=1?1:Mt(n))),n<1&&(u=requestAnimationFrame(d))};return u=requestAnimationFrame(d),()=>cancelAnimationFrame(u)},[i,t,n]),t<=0?i:a},z=24,Ft=96,It=()=>{if(typeof navigator>`u`)return!1;let e=navigator.userAgent,t=/iPad|iPhone|iPod/i.test(e)||navigator.platform===`MacIntel`&&navigator.maxTouchPoints>1,n=/WebKit/i.test(e),r=/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser|GSA/i.test(e);return t&&n&&!r},Lt=e=>new Promise(t=>{if(typeof document>`u`){t(null);return}let n=new Image;n.crossOrigin=`anonymous`,n.decoding=`async`,n.onload=()=>{try{let e=document.createElement(`canvas`),r=document.createElement(`canvas`);e.width=z,e.height=z,r.width=Ft,r.height=Ft;let i=e.getContext(`2d`),a=r.getContext(`2d`);if(!i||!a){t(null);return}let o=n.naturalWidth||n.width,s=n.naturalHeight||n.height,c=Math.min(o,s),l=Math.max(0,(o-c)/2),u=Math.max(0,(s-c)/2);i.imageSmoothingEnabled=!0,i.imageSmoothingQuality=`high`,i.drawImage(n,l,u,c,c,0,0,z,z),a.imageSmoothingEnabled=!0,a.imageSmoothingQuality=`high`,a.globalAlpha=1,a.drawImage(e,0,0,z,z,0,0,Ft,Ft),[{x:-8,y:-8,size:112,alpha:.22},{x:6,y:0,size:Ft,alpha:.14},{x:0,y:6,size:Ft,alpha:.14}].forEach(({x:t,y:n,size:r,alpha:i})=>{a.globalAlpha=i,a.drawImage(e,0,0,z,z,t,n,r,r)}),a.globalAlpha=1,t(r.toDataURL(`image/jpeg`,.72))}catch(e){console.warn(`[FluidBackground] Failed to build soft focus cover`,e),t(null)}},n.onerror=()=>t(null),n.src=e}),Rt=320,zt=640,Bt=1e3,Vt=(e,t)=>{e.fillStyle=`#000`,e.fillStyle=t;let n=String(e.fillStyle),[r,i,a]=n.startsWith(`#`)?[1,3,5].map(e=>parseInt(n.slice(e,e+2),16)):n.match(/[\d.]+/g)??[`0`,`0`,`0`];return[n,`rgba(${r}, ${i}, ${a}, 0)`]},Ht=(e,t)=>{let n=document.createElement(`canvas`);return n.width=e,n.height=t,n},Ut=null,Wt=()=>{if(Ut!==null)return Ut;try{let e=Ht(4,1).getContext(`2d`,{willReadFrequently:!0});!e||typeof e.filter!=`string`?Ut=!1:(e.filter=`blur(1px)`,e.fillStyle=`#fff`,e.fillRect(2,0,1,1),Ut=e.getImageData(1,0,1,1).data[3]>0)}catch{Ut=!1}return Ut},Gt=(e,t)=>{let{width:n,height:r}=e,i=n/Math.max(1,t*2.5),a=[],o=n,s=r;for(;o/2>=i&&o>2&&s>2;)o=Math.ceil(o/2),s=Math.ceil(s/2),a.push([o,s]);let c=[...a,...a.slice(0,-1).reverse(),[n,r]],l=e;for(let[e,t]of c){let n=Ht(e,t),r=n.getContext(`2d`);if(!r)return l;r.imageSmoothingEnabled=!0,r.imageSmoothingQuality=`high`,r.drawImage(l,0,0,e,t),l=n}return l},Kt=(e,t,n,r)=>{let i=Ht(t,n),a=i.getContext(`2d`);if(!a)return null;let o=Math.max(t/e.width,n/e.height)*1.5,s=e.width*o,c=e.height*o,l=60*t/r,u=Wt();return u&&(a.filter=`blur(${l}px)`),a.imageSmoothingEnabled=!0,a.imageSmoothingQuality=`high`,a.drawImage(e,(t-s)/2,(n-c)/2,s,c),u?i:Gt(i,l)},qt=(e,t,n,r)=>{let i=e.getContext(`2d`);if(!i)return;let{width:a,height:o}=e;if(i.clearRect(0,0,a,o),!t)return;i.drawImage(t,0,0,a,o);let s=Math.hypot(a,o),c=a*o/s,l=o/s*c,u=a/s*c,d=i.createLinearGradient(a/2-l,o/2-u,a/2+l,o/2+u),[f,p]=Vt(i,n),[m,h]=Vt(i,r);d.addColorStop(0,f),d.addColorStop(.5,p),d.addColorStop(.5,h),d.addColorStop(1,m),i.globalCompositeOperation=`overlay`,i.globalAlpha=.4,i.fillStyle=d,i.fillRect(0,0,a,o),i.globalCompositeOperation=`source-over`,i.globalAlpha=1},Jt=({image:e,primaryColor:t,secondaryColor:n,onDrawn:r})=>{let i=(0,L.useRef)(null),[a,o]=(0,L.useState)(null);(0,L.useLayoutEffect)(()=>{let e=i.current;if(!e)return;let t=()=>{let t=e.clientWidth,n=e.clientHeight;o(e=>e&&e.width===t&&e.height===n?e:{width:t,height:n})};if(t(),typeof ResizeObserver>`u`)return;let n=new ResizeObserver(t);return n.observe(e),()=>n.disconnect()},[]);let s=(0,L.useRef)(r);(0,L.useLayoutEffect)(()=>{s.current=r});let c=(0,L.useRef)(!1),l=(0,L.useRef)(null);return(0,L.useLayoutEffect)(()=>{let r=i.current;if(!r||!a)return;if(a.width>0&&a.height>0){let i=Math.max(1,Math.round(Rt*a.height/a.width));(r.width!==Rt||r.height!==i)&&(r.width=Rt,r.height=i);let o=l.current;e?(!o||o.image!==e||o.width!==r.width||o.height!==r.height||o.cssWidth!==a.width)&&(o={image:e,width:r.width,height:r.height,cssWidth:a.width,canvas:Kt(e,r.width,r.height,a.width)}):o=null,l.current=o,qt(r,o?.canvas??null,t,n)}if(c.current)return;let o=requestAnimationFrame(()=>{c.current=!0,s.current()});return()=>cancelAnimationFrame(o)},[a,e,t,n]),(0,R.jsx)(`canvas`,{ref:i,"aria-hidden":`true`,className:`absolute inset-0 w-full h-full`})},Yt=(0,L.memo)(({coverUrl:e,theme:t})=>{let n=(0,L.useMemo)(It,[]),[r,i]=(0,L.useState)(null),[a,o]=Pt([t.primaryColor,t.secondaryColor],Bt);(0,L.useEffect)(()=>{let t=!1;return!n||!e?(i(null),()=>{t=!0}):(i(null),Lt(e).then(e=>{t||i(e)}),()=>{t=!0})},[e,n]);let s=Dt(),c=(0,L.useRef)(0),[l,u]=(0,L.useState)([]),[d,f]=(0,L.useState)(()=>new Set),p=(0,L.useRef)(new Set);(0,L.useEffect)(()=>{let e=new Set(l.map(e=>e.image));p.current.forEach(t=>{e.has(t)||(t.close(),p.current.delete(t))})},[l]),(0,L.useEffect)(()=>()=>{p.current.forEach(e=>e.close()),p.current.clear()},[]),(0,L.useEffect)(()=>{if(n)return;if(!e){u([]);return}let t=!1,r=new Image;return r.decoding=`async`,r.src=e,r.decode().then(()=>{let e=Math.min(1,zt/Math.max(r.naturalWidth,r.naturalHeight));return createImageBitmap(r,{resizeWidth:Math.max(1,Math.round(r.naturalWidth*e)),resizeHeight:Math.max(1,Math.round(r.naturalHeight*e)),resizeQuality:`high`})}).then(n=>{if(t){n.close();return}p.current.add(n),u(t=>{let r=t[t.length-1];return r&&r.sourceCover===e?t:(c.current+=1,[...r?[r]:[],{image:n,sourceCover:e,key:c.current}])})},()=>{t||(u(t=>t.length>0?t:(c.current+=1,[{image:null,sourceCover:e,key:c.current}])),s())}),()=>{t=!0}},[e,n,s]);let m=kt(),h=(0,L.useRef)(m);(0,L.useLayoutEffect)(()=>{h.current=m});let[g,_]=(0,L.useState)(null);(0,L.useEffect)(()=>{(!e||n)&&s()},[e,n,s]);let v=(0,L.useCallback)(e=>{h.current&&_(e),f(t=>t.has(e)?t:new Set(t).add(e)),s()},[s]),[y,b]=(0,L.useState)(null),x=l[l.length-1],S=!!e&&!n&&!(x&&x.sourceCover===e&&x.key===y),C=n?r??e??null:null,w=n&&!!r,T=(0,L.useMemo)(()=>({transform:`scale(${w?1.28:1.2}) translateZ(0)`,opacity:w?.94:.3,willChange:`transform, opacity`,backfaceVisibility:`hidden`,WebkitBackfaceVisibility:`hidden`}),[w]);return(0,R.jsxs)(`div`,{className:`absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0`,style:{isolation:`isolate`,contain:`paint`,transform:`translateZ(0)`},...S?{[Tt]:``}:{},children:[e?(0,R.jsxs)(R.Fragment,{children:[n?(0,R.jsx)(`img`,{src:C??e,alt:``,"aria-hidden":`true`,draggable:!1,decoding:`async`,className:`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-out`,style:T}):(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(`div`,{className:`absolute inset-0 w-full h-full transition-colors duration-1000`,style:{backgroundColor:t.backgroundColor,opacity:.8}}),l.map((e,t)=>{let n=t===l.length-1,r=d.has(e.key);return(0,R.jsx)(fe.div,{className:`absolute inset-0 w-full h-full`,style:{willChange:`opacity`},initial:{opacity:+!n},animate:{opacity:n&&!r?0:1},transition:{duration:e.key===g?0:1.5,ease:`easeInOut`},onAnimationComplete:()=>{n&&r&&(u(t=>t.filter(t=>t.key===e.key)),f(t=>t.has(e.key)?new Set([e.key]):t),b(e.key))},children:(0,R.jsx)(Jt,{image:e.image,primaryColor:a,secondaryColor:o,onDrawn:()=>v(e.key)})},e.key)})]}),n&&(0,R.jsxs)(R.Fragment,{children:[!w&&(0,R.jsx)(`img`,{src:e,alt:``,"aria-hidden":`true`,draggable:!1,decoding:`async`,className:`absolute inset-0 w-full h-full object-cover`,style:{transform:`scale(1.36) translateZ(0)`,opacity:.12,willChange:`transform, opacity`,backfaceVisibility:`hidden`,WebkitBackfaceVisibility:`hidden`}}),(0,R.jsx)(`div`,{className:`absolute inset-0 w-full h-full`,style:{backgroundColor:t.backgroundColor,opacity:.28}}),(0,R.jsx)(`div`,{className:`absolute inset-0 w-full h-full`,style:{background:`radial-gradient(circle at 20% 20%, ${t.accentColor}55 0%, transparent 42%), radial-gradient(circle at 80% 28%, ${t.secondaryColor}50 0%, transparent 44%), radial-gradient(circle at 50% 78%, ${t.primaryColor}28 0%, transparent 52%)`,opacity:w?.52:.7}})]})]}):(0,R.jsx)(`div`,{className:`absolute inset-0 w-full h-full transition-colors duration-1000`,style:{backgroundColor:t.backgroundColor,opacity:.8}}),(!e||n||x&&!x.image)&&(0,R.jsx)(`div`,{className:`absolute inset-0 w-full h-full`,style:{background:`linear-gradient(to bottom right, ${a}, transparent, ${o})`,opacity:n?.2:.4,mixBlendMode:n?`normal`:`overlay`}})]})},(e,t)=>{if(e.coverUrl!==t.coverUrl)return!1;let n=e.theme,r=t.theme;return n.backgroundColor===r.backgroundColor&&n.primaryColor===r.primaryColor&&n.secondaryColor===r.secondaryColor}),Xt=e=>{let t=e?.join(`
`)??``;return(0,L.useEffect)(()=>{t&&Qe(t.split(`
`))},[t]),(0,L.useSyncExternalStore)($e,et,et)},Zt=e=>{switch(e.type){case`circle`:return`bass`;case`square`:return`lowMid`;case`triangle`:return`mid`;case`cross`:return`treble`;default:return`default`}},Qt=e=>e===`triangle`?`polygon(50% 0%, 0% 100%, 100% 100%)`:e===`cross`?`polygon(20% 0%, 0% 20%, 30% 50%, 0% 80%, 20% 100%, 50% 70%, 80% 100%, 100% 80%, 70% 50%, 100% 20%, 80% 0%, 50% 30%)`:`none`,$t=(e,t)=>{let n=(e.type===`circle`||e.type===`square`)&&!e.filled;return{border:n?`1px solid ${t.secondaryColor}`:`none`,backgroundColor:n?`transparent`:t.secondaryColor,borderRadius:e.type===`circle`?`50%`:`0%`,opacity:e.opacity,clipPath:Qt(e.type)}},en=e=>({left:`${e.initialX}%`,top:`${e.initialY}%`,width:e.size,height:e.size,animationDuration:`${e.duration}s`,animationDelay:`${e.delay}s`,"--geometric-dir":e.reverse?-1:1,"--geometric-rotate":`${e.initialRotation}deg`}),tn=(e,t)=>{if(e.iconSlot===null||t.length===0)return null;let n=t[Math.floor(e.iconSlot*t.length)];return Ze(n)===`loading`?`loading`:Xe(n)},nn=({disabled:e=!1})=>e?null:(0,R.jsx)(`div`,{className:`absolute inset-0 pointer-events-none`,style:{background:`radial-gradient(circle, transparent 40%, rgba(0,0,0,0.6) 100%)`}}),rn=({theme:e,audioPower:t,audioBands:n,shapes:r,particles:i,hideShapes:a,disableVignette:o,paused:s})=>{let c=e=>gt(bt(e||t,{stiffness:300,damping:30}),[10,200],[.95,1.45]),l={bass:c(n?.bass),lowMid:c(n?.lowMid),mid:c(n?.mid),vocal:c(n?.vocal),treble:c(n?.treble),default:c(t)},u=e.lyricsIcons||[];return(0,R.jsxs)(`div`,{className:s?`absolute inset-0 geometric-paused`:`absolute inset-0`,children:[!a&&(0,R.jsxs)(R.Fragment,{children:[r.map(t=>{let n=tn(t,u),r=n===`loading`?null:n;return(0,R.jsxs)(`div`,{className:`absolute geometric-drift`,style:en(t),children:[(0,R.jsx)(fe.div,{className:`w-full h-full transition-[color,background-color,border-color,opacity] duration-1000`,style:{...$t(t,e),...n===null?{}:{opacity:0},scale:l[Zt(t)]}}),t.iconSlot!==null&&(0,R.jsx)(`div`,{className:`absolute inset-0 transition-opacity duration-1000`,style:{opacity:+!!r},children:(0,R.jsx)(fe.div,{className:`w-full h-full flex items-center justify-center geometric-pulse transition-colors duration-1000`,style:{color:e.secondaryColor,scale:l.vocal,animationDuration:`${t.duration*.5}s`,animationDelay:`${t.delay}s`,"--geometric-peak":t.opacity*3},children:r&&(0,R.jsx)(r,{size:t.size,strokeWidth:1,absoluteStrokeWidth:!0})})})]},t.id)}),i.map(t=>(0,R.jsx)(`div`,{className:`absolute rounded-full geometric-rise transition-colors duration-1000`,style:{backgroundColor:e.accentColor,width:t.size,height:t.size,left:`${t.left}%`,top:`${t.top}%`,animationDuration:`${t.duration}s`,animationDelay:`${t.delay}s`,"--geometric-peak":t.opacity}},`p-${t.id}`))]}),(0,R.jsx)(nn,{disabled:o})]})},an=({theme:e,audioPower:t,audioBands:n,seed:r,hideShapes:i=!1,disableVignette:a=!1,paused:o=!1})=>{Xt(e.lyricsIcons);let s=(0,L.useMemo)(()=>{let e=[`circle`,`square`,`triangle`,`cross`],t=0;return Array.from({length:15}).map((n,r)=>{let i=t<6&&Math.random()>.7?Math.random():null;return i!==null&&(t+=1),{id:r,type:e[Math.floor(Math.random()*e.length)],iconSlot:i,initialX:Math.random()*100,initialY:Math.random()*100,size:40+Math.random()*100,duration:i===null?30+Math.random()*30:20+Math.random()*20,delay:Math.random()*5,opacity:.11+Math.random()*.08,reverse:Math.random()>.5,filled:Math.random()<.3,initialRotation:Math.random()*360}})},[r]),c=(0,L.useMemo)(()=>Array.from({length:20}).map((e,t)=>({id:t,size:Math.random()*4+1,left:Math.random()*100,top:Math.random()*100,opacity:Math.random()*.3,duration:15+Math.random()*20,delay:Math.random()*10})),[r]);return(0,R.jsx)(fe.div,{className:`absolute inset-0`,initial:!1,animate:{opacity:1},exit:{opacity:0},transition:{duration:.6,ease:`easeInOut`},children:(0,R.jsx)(rn,{theme:e,audioPower:t,audioBands:n,shapes:s,particles:c,hideShapes:i,disableVignette:a,paused:o})})},on=L.memo(e=>{let t=String(e.seed??`default`);return(0,R.jsx)(`div`,{className:`absolute inset-0 overflow-hidden pointer-events-none`,children:(0,R.jsx)(b,{mode:`sync`,children:(0,R.jsx)(an,{...e},t)})})},(e,t)=>{if(e.seed!==t.seed||e.audioPower!==t.audioPower||e.hideShapes!==t.hideShapes||e.disableVignette!==t.disableVignette||e.paused!==t.paused)return!1;let n=e.audioBands,r=t.audioBands;if(!n!=!r)return!1;let i=!0;if(n&&r&&(i=n.bass===r.bass&&n.lowMid===r.lowMid&&n.mid===r.mid&&n.vocal===r.vocal&&n.treble===r.treble),!i)return!1;let a=e.theme,o=t.theme,s=a.backgroundColor===o.backgroundColor&&a.primaryColor===o.primaryColor&&a.secondaryColor===o.secondaryColor&&a.accentColor===o.accentColor,c=!!(a.lyricsIcons===o.lyricsIcons||a.lyricsIcons?.length===o.lyricsIcons?.length&&a.lyricsIcons?.every((e,t)=>e===o.lyricsIcons?.[t]));return s&&c}),sn=e({default:()=>cn}),cn=xt({mode:`common`,order:10,labelKey:`options.visualizerBackgroundModeCommon`,labelFallback:`Common`,glyph:(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(`path`,{d:`M4 17l5-8 5 8z`}),(0,R.jsx)(`circle`,{cx:`17.5`,cy:`8.5`,r:`3`,opacity:`0.55`})]}),command:{title:`Background: Common`,description:`Switch background to general layout`,keywords:[`background general`,`common`,`general`,`通用背景`,`ty`,`背景切换到 通用`,`背景切换到通用`]},song:({config:e,coverUrl:t,seed:n,staticMode:r})=>[r?null:n??null,e?.common?.useCoverColorBg?t??null:null],render:({config:e,theme:t,coverUrl:n,audioPower:r,audioBands:i,seed:a,staticMode:o,paused:s})=>{let c=e?.common,l=c?.useCoverColorBg??!1;return(0,R.jsxs)(R.Fragment,{children:[l&&(0,R.jsx)(`div`,{className:`absolute inset-0 z-0`,children:(0,R.jsx)(Yt,{coverUrl:n,theme:t})}),(0,R.jsx)(`div`,{className:`absolute inset-0 z-0 transition-all duration-1000`,style:{backgroundColor:t.backgroundColor,opacity:l?c?.opacity??.75:1}}),!o&&(0,R.jsx)(`div`,{className:`absolute inset-0 z-0`,children:(0,R.jsx)(on,{theme:t,audioPower:r,audioBands:i,seed:a,hideShapes:c?.disableGeometricBackground??!1,disableVignette:c?.disableVignette??!1,paused:s})})]})},renderSettingsPanel:e=>(0,R.jsx)(wt,{...e}),renderQuickControls:({config:e,actions:t,t:r})=>{let i=e?.common?.useCoverColorBg??!1,a=!(e?.common?.disableVignette??!1);return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(C,{active:i,label:r(i?`theme.addCoverColor`:`theme.useDefaultColor`),onToggle:()=>t?.common?.onCoverColorChange?.(!i),children:(0,R.jsx)(f,{size:14})}),(0,R.jsx)(C,{active:a,label:r(`options.visualizerVignette`),onToggle:()=>t?.common?.onDisableVignetteChange?.(a),children:(0,R.jsx)(n,{size:14})})]})},resetSettings:e=>{e?.common?.onOpacityChange?.(.75),e?.common?.onCoverColorChange?.(!1),e?.common?.onDisableVignetteChange?.(!1),e?.common?.onDisableGeometricChange?.(!1)}}),ln={maxColorCount:10},un=`#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colors[${ln.maxColorCount}];
uniform float u_colorsCount;

uniform float u_distortion;
uniform float u_swirl;
uniform float u_grainMixer;
uniform float u_grainOverlay;

in vec2 v_objectUV;
out vec4 fragColor;

${Oe}
${Ne}
${Te}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float noise(vec2 n, vec2 seedOffset) {
  return valueNoise(n + seedOffset);
}

vec2 getPosition(int i, float t) {
  float a = float(i) * .37;
  float b = .6 + fract(float(i) / 3.) * .9;
  float c = .8 + fract(float(i + 1) / 4.);

  float x = sin(t * b + a);
  float y = cos(t * c + a * 1.5);

  return .5 + .5 * vec2(x, y);
}

void main() {
  vec2 uv = v_objectUV;
  uv += .5;
  vec2 grainUV = uv * 1000.;

  float grain = noise(grainUV, vec2(0.));
  float mixerGrain = .4 * u_grainMixer * (grain - .5);

  const float firstFrameOffset = 41.5;
  float t = .5 * (u_time + firstFrameOffset);

  float radius = smoothstep(0., 1., length(uv - .5));
  float center = 1. - radius;
  for (float i = 1.; i <= 2.; i++) {
    uv.x += u_distortion * center / i * sin(t + i * .4 * smoothstep(.0, 1., uv.y)) * cos(.2 * t + i * 2.4 * smoothstep(.0, 1., uv.y));
    uv.y += u_distortion * center / i * cos(t + i * 2. * smoothstep(.0, 1., uv.x));
  }

  vec2 uvRotated = uv;
  uvRotated -= vec2(.5);
  float angle = 3. * u_swirl * radius;
  uvRotated = rotate(uvRotated, -angle);
  uvRotated += vec2(.5);

  vec3 color = vec3(0.);
  float opacity = 0.;
  float totalWeight = 0.;

  for (int i = 0; i < ${ln.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;

    vec2 pos = getPosition(i, t) + mixerGrain;
    vec3 colorFraction = u_colors[i].rgb * u_colors[i].a;
    float opacityFraction = u_colors[i].a;

    float dist = length(uvRotated - pos);

    dist = pow(dist, 3.5);
    float weight = 1. / (dist + 1e-3);
    color += colorFraction * weight;
    opacity += opacityFraction * weight;
    totalWeight += weight;
  }

  color /= max(1e-4, totalWeight);
  opacity /= max(1e-4, totalWeight);

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`,dn=`#version 300 es
precision mediump float;

uniform float u_time;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

uniform float u_pxSize;
uniform vec4 u_colorBack;
uniform vec4 u_colorFront;
uniform float u_shape;
uniform float u_type;

out vec4 fragColor;

${Ce}
${Oe}
${Se}
${Te}

float getSimplexNoise(vec2 uv, float t) {
  float noise = .5 * snoise(uv - vec2(0., .3 * t));
  noise += .5 * snoise(2. * uv + vec2(0., .32 * t));

  return noise;
}

const int bayer2x2[4] = int[4](0, 2, 3, 1);
const int bayer4x4[16] = int[16](
0, 8, 2, 10,
12, 4, 14, 6,
3, 11, 1, 9,
15, 7, 13, 5
);

const int bayer8x8[64] = int[64](
0, 32, 8, 40, 2, 34, 10, 42,
48, 16, 56, 24, 50, 18, 58, 26,
12, 44, 4, 36, 14, 46, 6, 38,
60, 28, 52, 20, 62, 30, 54, 22,
3, 35, 11, 43, 1, 33, 9, 41,
51, 19, 59, 27, 49, 17, 57, 25,
15, 47, 7, 39, 13, 45, 5, 37,
63, 31, 55, 23, 61, 29, 53, 21
);

float getBayerValue(vec2 uv, int size) {
  ivec2 pos = ivec2(fract(uv / float(size)) * float(size));
  int index = pos.y * size + pos.x;

  if (size == 2) {
    return float(bayer2x2[index]) / 4.0;
  } else if (size == 4) {
    return float(bayer4x4[index]) / 16.0;
  } else if (size == 8) {
    return float(bayer8x8[index]) / 64.0;
  }
  return 0.0;
}


void main() {
  float t = .5 * u_time;

  float pxSize = u_pxSize * u_pixelRatio;
  vec2 pxSizeUV = gl_FragCoord.xy - .5 * u_resolution;
  pxSizeUV /= pxSize;
  vec2 canvasPixelizedUV = (floor(pxSizeUV) + .5) * pxSize;
  vec2 normalizedUV = canvasPixelizedUV / u_resolution;

  vec2 ditheringNoiseUV = canvasPixelizedUV;
  vec2 shapeUV = normalizedUV;

  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * PI / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
  vec2 boxSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  
  if (u_shape > 3.5) {
    vec2 objectBoxSize = vec2(0.);
    // fit = none
    objectBoxSize.x = min(boxSize.x, boxSize.y);
    if (u_fit == 1.) { // fit = contain
      objectBoxSize.x = min(u_resolution.x, u_resolution.y);
    } else if (u_fit == 2.) { // fit = cover
      objectBoxSize.x = max(u_resolution.x, u_resolution.y);
    }
    objectBoxSize.y = objectBoxSize.x;
    vec2 objectWorldScale = u_resolution.xy / objectBoxSize;

    shapeUV *= objectWorldScale;
    shapeUV += boxOrigin * (objectWorldScale - 1.);
    shapeUV += vec2(-u_offsetX, u_offsetY);
    shapeUV /= u_scale;
    shapeUV = graphicRotation * shapeUV;
  } else {
    vec2 patternBoxSize = vec2(0.);
    // fit = none
    patternBoxSize.x = patternBoxRatio * min(boxSize.x / patternBoxRatio, boxSize.y);
    float patternWorldNoFitBoxWidth = patternBoxSize.x;
    if (u_fit == 1.) { // fit = contain
      patternBoxSize.x = patternBoxRatio * min(u_resolution.x / patternBoxRatio, u_resolution.y);
    } else if (u_fit == 2.) { // fit = cover
      patternBoxSize.x = patternBoxRatio * max(u_resolution.x / patternBoxRatio, u_resolution.y);
    }
    patternBoxSize.y = patternBoxSize.x / patternBoxRatio;
    vec2 patternWorldScale = u_resolution.xy / patternBoxSize;

    shapeUV += vec2(-u_offsetX, u_offsetY) / patternWorldScale;
    shapeUV += boxOrigin;
    shapeUV -= boxOrigin / patternWorldScale;
    shapeUV *= u_resolution.xy;
    shapeUV /= u_pixelRatio;
    if (u_fit > 0.) {
      shapeUV *= (patternWorldNoFitBoxWidth / patternBoxSize.x);
    }
    shapeUV /= u_scale;
    shapeUV = graphicRotation * shapeUV;
    shapeUV += boxOrigin / patternWorldScale;
    shapeUV -= boxOrigin;
    shapeUV += .5;
  }

  float shape = 0.;
  if (u_shape < 1.5) {
    // Simplex noise
    shapeUV *= .001;

    shape = 0.5 + 0.5 * getSimplexNoise(shapeUV, t);
    shape = smoothstep(0.3, 0.9, shape);

  } else if (u_shape < 2.5) {
    // Warp
    shapeUV *= .003;

    for (float i = 1.0; i < 6.0; i++) {
      shapeUV.x += 0.6 / i * cos(i * 2.5 * shapeUV.y + t);
      shapeUV.y += 0.6 / i * cos(i * 1.5 * shapeUV.x + t);
    }

    shape = .15 / max(0.001, abs(sin(t - shapeUV.y - shapeUV.x)));
    shape = smoothstep(0.02, 1., shape);

  } else if (u_shape < 3.5) {
    // Dots
    shapeUV *= .05;

    float stripeIdx = floor(2. * shapeUV.x / TWO_PI);
    float rand = hash11(stripeIdx * 10.);
    rand = sign(rand - .5) * pow(.1 + abs(rand), .4);
    shape = sin(shapeUV.x) * cos(shapeUV.y - 5. * rand * t);
    shape = pow(abs(shape), 6.);

  } else if (u_shape < 4.5) {
    // Sine wave
    shapeUV *= 4.;

    float wave = cos(.5 * shapeUV.x - 2. * t) * sin(1.5 * shapeUV.x + t) * (.75 + .25 * cos(3. * t));
    shape = 1. - smoothstep(-1., 1., shapeUV.y + wave);

  } else if (u_shape < 5.5) {
    // Ripple

    float dist = length(shapeUV);
    float waves = sin(pow(dist, 1.7) * 7. - 3. * t) * .5 + .5;
    shape = waves;

  } else if (u_shape < 6.5) {
    // Swirl

    float l = length(shapeUV);
    float angle = 6. * atan(shapeUV.y, shapeUV.x) + 4. * t;
    float twist = 1.2;
    float offset = 1. / pow(max(l, 1e-6), twist) + angle / TWO_PI;
    float mid = smoothstep(0., 1., pow(l, twist));
    shape = mix(0., fract(offset), mid);

  } else {
    // Sphere
    shapeUV *= 2.;

    float d = 1. - pow(length(shapeUV), 2.);
    vec3 pos = vec3(shapeUV, sqrt(max(0., d)));
    vec3 lightPos = normalize(vec3(cos(1.5 * t), .8, sin(1.25 * t)));
    shape = .5 + .5 * dot(lightPos, pos);
    shape *= step(0., d);
  }


  int type = int(floor(u_type));
  float dithering = 0.0;

  switch (type) {
    case 1: {
      dithering = step(hash21(ditheringNoiseUV), shape);
    } break;
    case 2:
    dithering = getBayerValue(pxSizeUV, 2);
    break;
    case 3:
    dithering = getBayerValue(pxSizeUV, 4);
    break;
    default :
    dithering = getBayerValue(pxSizeUV, 8);
    break;
  }

  dithering -= .5;
  float res = step(.5, shape + dithering);

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);

  fragColor = vec4(color, opacity);
}
`,fn={simplex:1,warp:2,dots:3,wave:4,ripple:5,swirl:6,sphere:7},pn={random:1,"2x2":2,"4x4":3,"8x8":4},mn=`#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_contrast;
uniform float u_roughness;
uniform float u_fiber;
uniform float u_fiberSize;
uniform float u_crumples;
uniform float u_crumpleSize;
uniform float u_folds;
uniform float u_foldCount;
uniform float u_drops;
uniform float u_seed;
uniform float u_fade;

uniform sampler2D u_noiseTexture;

in vec2 v_imageUV;

out vec4 fragColor;

float getUvFrame(vec2 uv) {
  float aax = 2. * fwidth(uv.x);
  float aay = 2. * fwidth(uv.y);

  float left   = smoothstep(0., aax, uv.x);
  float right = 1. - smoothstep(1. - aax, 1., uv.x);
  float bottom = smoothstep(0., aay, uv.y);
  float top = 1. - smoothstep(1. - aay, 1., uv.y);

  return left * right * bottom * top;
}

${Oe}
${Ne}
${ke}
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomR(i);
  float b = randomR(i + vec2(1.0, 0.0));
  float c = randomR(i + vec2(0.0, 1.0));
  float d = randomR(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}
float fbm(vec2 n) {
  float total = 0.0, amplitude = .4;
  for (int i = 0; i < 3; i++) {
    total += valueNoise(n) * amplitude;
    n *= 1.99;
    amplitude *= 0.65;
  }
  return total;
}


float randomG(vec2 p) {
  vec2 uv = floor(p) / 50. + .5;
  return texture(u_noiseTexture, fract(uv)).g;
}
float roughness(vec2 p) {
  p *= .1;
  float o = 0.;
  for (float i = 0.; ++i < 4.; p *= 2.1) {
    vec4 w = vec4(floor(p), ceil(p));
    vec2 f = fract(p);
    o += mix(
    mix(randomG(w.xy), randomG(w.xw), f.y),
    mix(randomG(w.zy), randomG(w.zw), f.y),
    f.x);
    o += .2 / exp(2. * abs(sin(.2 * p.x + .5 * p.y)));
  }
  return o / 3.;
}

${je}

vec2 randomGB(vec2 p) {
  vec2 uv = floor(p) / 50. + .5;
  return texture(u_noiseTexture, fract(uv)).gb;
}
float crumpledNoise(vec2 t, float pw) {
  vec2 p = floor(t);
  float wsum = 0.;
  float cl = 0.;
  for (int y = -1; y < 2; y += 1) {
    for (int x = -1; x < 2; x += 1) {
      vec2 b = vec2(float(x), float(y));
      vec2 q = b + p;
      vec2 q2 = q - floor(q / 8.) * 8.;
      vec2 c = q + randomGB(q2);
      vec2 r = c - t;
      float w = pow(smoothstep(0., 1., 1. - abs(r.x)), pw) * pow(smoothstep(0., 1., 1. - abs(r.y)), pw);
      cl += (.5 + .5 * sin((q2.x + q2.y * 5.) * 8.)) * w;
      wsum += w;
    }
  }
  return pow(wsum != 0.0 ? cl / wsum : 0.0, .5) * 2.;
}
float crumplesShape(vec2 uv) {
  return crumpledNoise(uv * .25, 16.) * crumpledNoise(uv * .5, 2.);
}


vec2 folds(vec2 uv) {
  vec3 pp = vec3(0.);
  float l = 9.;
  for (float i = 0.; i < 15.; i++) {
    if (i >= u_foldCount) break;
    vec2 rand = randomGB(vec2(i, i * u_seed));
    float an = rand.x * TWO_PI;
    vec2 p = vec2(cos(an), sin(an)) * rand.y;
    float dist = distance(uv, p);
    l = min(l, dist);

    if (l == dist) {
      pp.xy = (uv - p.xy);
      pp.z = dist;
    }
  }
  return mix(pp.xy, vec2(0.), pow(pp.z, .25));
}

float drops(vec2 uv) {
  vec2 iDropsUV = floor(uv);
  vec2 fDropsUV = fract(uv);
  float dropsMinDist = 1.;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 neighbor = vec2(float(i), float(j));
      vec2 offset = randomGB(iDropsUV + neighbor);
      offset = .5 + .5 * sin(10. * u_seed + TWO_PI * offset);
      vec2 pos = neighbor + offset - fDropsUV;
      float dist = length(pos);
      dropsMinDist = min(dropsMinDist, dropsMinDist*dist);
    }
  }
  return 1. - smoothstep(.05, .09, pow(dropsMinDist, .5));
}

float lst(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

void main() {

  vec2 imageUV = v_imageUV;
  vec2 patternUV = v_imageUV - .5;
  patternUV = 5. * (patternUV * vec2(u_imageAspectRatio, 1.));

  vec2 roughnessUv = 1.5 * (gl_FragCoord.xy - .5 * u_resolution) / u_pixelRatio;
  float roughness = roughness(roughnessUv + vec2(1., 0.)) - roughness(roughnessUv - vec2(1., 0.));

  vec2 crumplesUV = fract(patternUV * .02 / u_crumpleSize - u_seed) * 32.;
  float crumples = u_crumples * (crumplesShape(crumplesUV + vec2(.05, 0.)) - crumplesShape(crumplesUV));

  vec2 fiberUV = 2. / u_fiberSize * patternUV;
  float fiber = fiberNoise(fiberUV, vec2(0.));
  fiber = .5 * u_fiber * (fiber - 1.);

  vec2 normal = vec2(0.);
  vec2 normalImage = vec2(0.);

  vec2 foldsUV = patternUV * .12;
  foldsUV = rotate(foldsUV, 4. * u_seed);
  vec2 w = folds(foldsUV);
  foldsUV = rotate(foldsUV + .007 * cos(u_seed), .01 * sin(u_seed));
  vec2 w2 = folds(foldsUV);

  float drops = u_drops * drops(patternUV * 2.);

  float fade = u_fade * fbm(.17 * patternUV + 10. * u_seed);
  fade = clamp(8. * fade * fade * fade, 0., 1.);

  w = mix(w, vec2(0.), fade);
  w2 = mix(w2, vec2(0.), fade);
  crumples = mix(crumples, 0., fade);
  drops = mix(drops, 0., fade);
  fiber *= mix(1., .5, fade);
  roughness *= mix(1., .5, fade);

  normal.xy += u_folds * min(5. * u_contrast, 1.) * 4. * max(vec2(0.), w + w2);
  normalImage.xy += u_folds * 2. * w;

  normal.xy += crumples;
  normalImage.xy += 1.5 * crumples;

  normal.xy += 3. * drops;
  normalImage.xy += .2 * drops;

  normal.xy += u_roughness * 1.5 * roughness;
  normal.xy += fiber;

  normalImage += u_roughness * .75 * roughness;
  normalImage += .2 * fiber;

  vec3 lightPos = vec3(1., 2., 1.);
  float res = dot(normalize(vec3(normal, 9.5 - 9. * pow(u_contrast, .1))), normalize(lightPos));

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  imageUV += .02 * normalImage;
  float frame = getUvFrame(imageUV);
  vec4 image = texture(u_image, imageUV);
  image.rgb += .6 * pow(u_contrast, .4) * (res - .7);

  frame *= image.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);
  opacity = mix(opacity, 1., frame);

  color -= .007 * drops;

  color.rgb = mix(color, image.rgb, frame);

  fragColor = vec4(color, opacity);
}
`,hn=`#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_rotation;

uniform vec4 u_colorBack;
uniform vec4 u_colorShadow;
uniform vec4 u_colorHighlight;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_size;
uniform float u_shadows;
uniform float u_angle;
uniform float u_stretch;
uniform float u_shape;
uniform float u_distortion;
uniform float u_highlights;
uniform float u_distortionShape;
uniform float u_shift;
uniform float u_blur;
uniform float u_edges;
uniform float u_marginLeft;
uniform float u_marginRight;
uniform float u_marginTop;
uniform float u_marginBottom;
uniform float u_grainMixer;
uniform float u_grainOverlay;

in vec2 v_imageUV;

out vec4 fragColor;

${Oe}
${Ne}
${Te}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float getUvFrame(vec2 uv, float softness) {
  float aax = 2. * fwidth(uv.x);
  float aay = 2. * fwidth(uv.y);
  float left   = smoothstep(0., aax + softness, uv.x);
  float right  = 1. - smoothstep(1. - softness - aax, 1., uv.x);
  float bottom = smoothstep(0., aay + softness, uv.y);
  float top    = 1. - smoothstep(1. - softness - aay, 1., uv.y);
  return left * right * bottom * top;
}

const int MAX_RADIUS = 50;
vec4 samplePremultiplied(sampler2D tex, vec2 uv) {
  vec4 c = texture(tex, uv);
  c.rgb *= c.a;
  return c;
}
vec4 getBlur(sampler2D tex, vec2 uv, vec2 texelSize, vec2 dir, float sigma) {
  if (sigma <= .5) return texture(tex, uv);
  int radius = int(min(float(MAX_RADIUS), ceil(3.0 * sigma)));

  float twoSigma2 = 2.0 * sigma * sigma;
  float gaussianNorm = 1.0 / sqrt(TWO_PI * sigma * sigma);

  vec4 sum = samplePremultiplied(tex, uv) * gaussianNorm;
  float weightSum = gaussianNorm;

  for (int i = 1; i <= MAX_RADIUS; i++) {
    if (i > radius) break;

    float x = float(i);
    float w = exp(-(x * x) / twoSigma2) * gaussianNorm;

    vec2 offset = dir * texelSize * x;
    vec4 s1 = samplePremultiplied(tex, uv + offset);
    vec4 s2 = samplePremultiplied(tex, uv - offset);

    sum += (s1 + s2) * w;
    weightSum += 2.0 * w;
  }

  vec4 result = sum / weightSum;
  if (result.a > 0.) {
    result.rgb /= result.a;
  }

  return result;
}

vec2 rotateAspect(vec2 p, float a, float aspect) {
  p.x *= aspect;
  p = rotate(p, a);
  p.x /= aspect;
  return p;
}

float smoothFract(float x) {
  float f = fract(x);
  float w = fwidth(x);

  float edge = abs(f - 0.5) - 0.5;
  float band = smoothstep(-w, w, edge);

  return mix(f, 1.0 - f, band);
}

void main() {

  float patternRotation = -u_angle * PI / 180.;
  float patternSize = mix(200., 5., u_size);

  vec2 uv = v_imageUV;

  vec2 uvMask = gl_FragCoord.xy / u_resolution.xy;
  vec2 sw = vec2(.005);
  vec4 margins = vec4(u_marginLeft, u_marginTop, u_marginRight, u_marginBottom);
  float mask =
  smoothstep(margins[0], margins[0] + sw.x, uvMask.x + sw.x) *
  smoothstep(margins[2], margins[2] + sw.x, 1.0 - uvMask.x + sw.x) *
  smoothstep(margins[1], margins[1] + sw.y, uvMask.y + sw.y) *
  smoothstep(margins[3], margins[3] + sw.y, 1.0 - uvMask.y + sw.y);
  float maskOuter =
  smoothstep(margins[0] - sw.x, margins[0], uvMask.x + sw.x) *
  smoothstep(margins[2] - sw.x, margins[2], 1.0 - uvMask.x + sw.x) *
  smoothstep(margins[1] - sw.y, margins[1], uvMask.y + sw.y) *
  smoothstep(margins[3] - sw.y, margins[3], 1.0 - uvMask.y + sw.y);
  float maskStroke = maskOuter - mask;
  float maskInner =
  smoothstep(margins[0] - 2. * sw.x, margins[0], uvMask.x) *
  smoothstep(margins[2] - 2. * sw.x, margins[2], 1.0 - uvMask.x) *
  smoothstep(margins[1] - 2. * sw.y, margins[1], uvMask.y) *
  smoothstep(margins[3] - 2. * sw.y, margins[3], 1.0 - uvMask.y);
  float maskStrokeInner = maskInner - mask;

  uv -= .5;
  uv *= patternSize;
  uv = rotateAspect(uv, patternRotation, u_imageAspectRatio);

  float curve = 0.;
  float patternY = uv.y / u_imageAspectRatio;
  if (u_shape > 4.5) {
    // pattern
    curve = .5 + .5 * sin(.5 * PI * uv.x) * cos(.5 * PI * patternY);
  } else if (u_shape > 3.5) {
    // zigzag
    curve = 10. * abs(fract(.1 * patternY) - .5);
  } else if (u_shape > 2.5) {
    // wave
    curve = 4. * sin(.23 * patternY);
  } else if (u_shape > 1.5) {
    // lines irregular
    curve = .5 + .5 * sin(.5 * uv.x) * sin(1.7 * uv.x);
  } else {
    // lines
  }

  vec2 UvToFract = uv + curve;
  vec2 fractOrigUV = fract(uv);
  vec2 floorOrigUV = floor(uv);

  float x = smoothFract(UvToFract.x);
  float xNonSmooth = fract(UvToFract.x) + .0001;

  float highlightsWidth = 2. * max(.001, fwidth(UvToFract.x));
  highlightsWidth += 2. * maskStrokeInner;
  float highlights = smoothstep(0., highlightsWidth, xNonSmooth);
  highlights *= smoothstep(1., 1. - highlightsWidth, xNonSmooth);
  highlights = 1. - highlights;
  highlights *= u_highlights;
  highlights = clamp(highlights, 0., 1.);
  highlights *= mask;

  float shadows = pow(x, 1.3);
  float distortion = 0.;
  float fadeX = 1.;
  float frameFade = 0.;

  float aa = fwidth(xNonSmooth);
  aa = max(aa, fwidth(uv.x));
  aa = max(aa, fwidth(UvToFract.x));
  aa = max(aa, .0001);

  if (u_distortionShape == 1.) {
    distortion = -pow(1.5 * x, 3.);
    distortion += (.5 - u_shift);

    frameFade = pow(1.5 * x, 3.);
    aa = max(.2, aa);
    aa += mix(.2, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    distortion = mix(.5, distortion, fadeX);
  } else if (u_distortionShape == 2.) {
    distortion = 2. * pow(x, 2.);
    distortion -= (.5 + u_shift);

    frameFade = pow(abs(x - .5), 4.);
    aa = max(.2, aa);
    aa += mix(.2, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    distortion = mix(.5, distortion, fadeX);
    frameFade = mix(1., frameFade, .5 * fadeX);
  } else if (u_distortionShape == 3.) {
    distortion = pow(2. * (xNonSmooth - .5), 6.);
    distortion -= .25;
    distortion -= u_shift;

    frameFade = 1. - 2. * pow(abs(x - .4), 2.);
    aa = .15;
    aa += mix(.1, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    frameFade = mix(1., frameFade, fadeX);

  } else if (u_distortionShape == 4.) {
    x = xNonSmooth;
    distortion = sin((x + .25) * TWO_PI);
    shadows = .5 + .5 * asin(distortion) / (.5 * PI);
    distortion *= .5;
    distortion -= u_shift;
    frameFade = .5 + .5 * sin(x * TWO_PI);
  } else if (u_distortionShape == 5.) {
    distortion -= pow(abs(x), .2) * x;
    distortion += .33;
    distortion -= 3. * u_shift;
    distortion *= .33;

    frameFade = .3 * (smoothstep(.0, 1., x));
    shadows = pow(x, 2.5);

    aa = max(.1, aa);
    aa += mix(.1, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    distortion *= fadeX;
  }

  vec2 dudx = dFdx(v_imageUV);
  vec2 dudy = dFdy(v_imageUV);
  vec2 grainUV = v_imageUV - .5;
  grainUV *= (.8 / vec2(length(dudx), length(dudy)));
  grainUV += .5;
  float grain = valueNoise(grainUV);
  grain = smoothstep(.4, .7, grain);
  grain *= u_grainMixer;
  distortion = mix(distortion, 0., grain);

  shadows = min(shadows, 1.);
  shadows += maskStrokeInner;
  shadows *= mask;
  shadows = min(shadows, 1.);
  shadows *= pow(u_shadows, 2.);
  shadows = clamp(shadows, 0., 1.);

  distortion *= 3. * u_distortion;
  frameFade *= u_distortion;

  fractOrigUV.x += distortion;
  floorOrigUV = rotateAspect(floorOrigUV, -patternRotation, u_imageAspectRatio);
  fractOrigUV = rotateAspect(fractOrigUV, -patternRotation, u_imageAspectRatio);

  uv = (floorOrigUV + fractOrigUV) / patternSize;
  uv += pow(maskStroke, 4.);

  uv += vec2(.5);

  uv = mix(v_imageUV, uv, smoothstep(0., .7, mask));
  float blur = mix(0., 50., u_blur);
  blur = mix(0., blur, smoothstep(.5, 1., mask));

  float edgeDistortion = mix(.0, .04, u_edges);
  edgeDistortion += .06 * frameFade * u_edges;
  edgeDistortion *= mask;
  float frame = getUvFrame(uv, edgeDistortion);

  float stretch = 1. - smoothstep(0., .5, xNonSmooth) * smoothstep(1., 1. - .5, xNonSmooth);
  stretch = pow(stretch, 2.);
  stretch *= mask;
  stretch *= getUvFrame(uv, .1 + .05 * mask * frameFade);
  uv.y = mix(uv.y, .5, u_stretch * stretch);

  vec4 image = getBlur(u_image, uv, 1. / u_resolution / u_pixelRatio, vec2(0., 1.), blur);
  image.rgb *= image.a;
  vec4 backColor = u_colorBack;
  backColor.rgb *= backColor.a;
  vec4 highlightColor = u_colorHighlight;
  highlightColor.rgb *= highlightColor.a;
  vec4 shadowColor = u_colorShadow;

  vec3 color = highlightColor.rgb * highlights;
  float opacity = highlightColor.a * highlights;

  shadows = mix(shadows * shadowColor.a, 0., highlights);
  color = mix(color, shadowColor.rgb * shadowColor.a, .5 * shadows);
  color += .5 * pow(shadows, .5) * shadowColor.rgb;
  opacity += shadows;
  color = clamp(color, vec3(0.), vec3(1.));
  opacity = clamp(opacity, 0., 1.);

  color += image.rgb * (1. - opacity) * frame;
  opacity += image.a * (1. - opacity) * frame;

  color += backColor.rgb * (1. - opacity);
  opacity += backColor.a * (1. - opacity);

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  grainOverlayStrength *= mask;
  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`,gn={lines:1,linesIrregular:2,wave:3,zigzag:4,pattern:5},_n={prism:1,lens:2,contour:3,cascade:4,flat:5},vn=`#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;

uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform vec4 u_colorHighlight;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_type;
uniform float u_pxSize;
uniform bool u_originalColors;
uniform bool u_inverted;
uniform float u_colorSteps;

out vec4 fragColor;


${Te}
${Oe}

float getUvFrame(vec2 uv, vec2 pad) {
  float aa = 0.0001;

  float left   = smoothstep(-pad.x, -pad.x + aa, uv.x);
  float right  = smoothstep(1.0 + pad.x, 1.0 + pad.x - aa, uv.x);
  float bottom = smoothstep(-pad.y, -pad.y + aa, uv.y);
  float top    = smoothstep(1.0 + pad.y, 1.0 + pad.y - aa, uv.y);

  return left * right * bottom * top;
}

vec2 getImageUV(vec2 uv) {
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  float r = u_rotation * PI / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  vec2 imageBoxSize;
  if (u_fit == 1.) { // contain
    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else if (u_fit == 2.) { // cover
    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else {
    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
  }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;

  vec2 imageUV = uv;
  imageUV *= imageBoxScale;
  imageUV += boxOrigin * (imageBoxScale - 1.);
  imageUV += graphicOffset;
  imageUV /= u_scale;
  imageUV.x *= u_imageAspectRatio;
  imageUV = graphicRotation * imageUV;
  imageUV.x /= u_imageAspectRatio;

  imageUV += .5;
  imageUV.y = 1. - imageUV.y;

  return imageUV;
}

const int bayer2x2[4] = int[4](0, 2, 3, 1);
const int bayer4x4[16] = int[16](
0, 8, 2, 10,
12, 4, 14, 6,
3, 11, 1, 9,
15, 7, 13, 5
);

const int bayer8x8[64] = int[64](
0, 32, 8, 40, 2, 34, 10, 42,
48, 16, 56, 24, 50, 18, 58, 26,
12, 44, 4, 36, 14, 46, 6, 38,
60, 28, 52, 20, 62, 30, 54, 22,
3, 35, 11, 43, 1, 33, 9, 41,
51, 19, 59, 27, 49, 17, 57, 25,
15, 47, 7, 39, 13, 45, 5, 37,
63, 31, 55, 23, 61, 29, 53, 21
);

float getBayerValue(vec2 uv, int size) {
  ivec2 pos = ivec2(fract(uv / float(size)) * float(size));
  int index = pos.y * size + pos.x;

  if (size == 2) {
    return float(bayer2x2[index]) / 4.0;
  } else if (size == 4) {
    return float(bayer4x4[index]) / 16.0;
  } else if (size == 8) {
    return float(bayer8x8[index]) / 64.0;
  }
  return 0.0;
}


void main() {

  float pxSize = u_pxSize * u_pixelRatio;
  vec2 pxSizeUV = gl_FragCoord.xy - .5 * u_resolution;
  pxSizeUV /= pxSize;
  vec2 canvasPixelizedUV = (floor(pxSizeUV) + .5) * pxSize;
  vec2 normalizedUV = canvasPixelizedUV / u_resolution;

  vec2 imageUV = getImageUV(normalizedUV);
  vec2 ditheringNoiseUV = canvasPixelizedUV;
  vec4 image = texture(u_image, imageUV);
  float frame = getUvFrame(imageUV, pxSize / u_resolution);

  int type = int(floor(u_type));
  float dithering = 0.0;

  float lum = dot(vec3(.2126, .7152, .0722), image.rgb);
  lum = u_inverted ? (1. - lum) : lum;

  switch (type) {
    case 1: {
      dithering = step(hash21(ditheringNoiseUV), lum);
    } break;
    case 2:
    dithering = getBayerValue(pxSizeUV, 2);
    break;
    case 3:
    dithering = getBayerValue(pxSizeUV, 4);
    break;
    default :
    dithering = getBayerValue(pxSizeUV, 8);
    break;
  }

  float colorSteps = max(floor(u_colorSteps), 1.);
  vec3 color = vec3(0.0);
  float opacity = 1.;

  dithering -= .5;
  float brightness = clamp(lum + dithering / colorSteps, 0.0, 1.0);
  brightness = mix(0.0, brightness, frame);
  brightness = mix(0.0, brightness, image.a);
  float quantLum = floor(brightness * colorSteps + 0.5) / colorSteps;
  quantLum = mix(0.0, quantLum, frame);

  if (u_originalColors == true) {
    vec3 normColor = image.rgb / max(lum, 0.001);
    color = normColor * quantLum;

    float quantAlpha = floor(image.a * colorSteps + 0.5) / colorSteps;
    opacity = mix(quantLum, 1., quantAlpha);
  } else {
    vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
    float fgOpacity = u_colorFront.a;
    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    float bgOpacity = u_colorBack.a;
    vec3 hlColor = u_colorHighlight.rgb * u_colorHighlight.a;
    float hlOpacity = u_colorHighlight.a;

    fgColor = mix(fgColor, hlColor, step(1.02 - .02 * u_colorSteps, brightness));
    fgOpacity = mix(fgOpacity, hlOpacity, step(1.02 - .02 * u_colorSteps, brightness));

    color = fgColor * quantLum;
    opacity = fgOpacity * quantLum;
    color += bgColor * (1.0 - opacity);
    opacity += bgOpacity * (1.0 - opacity);
  }

  fragColor = vec4(color, opacity);
}
`,yn=`#version 300 es
precision mediump float;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;
uniform float u_spread;
uniform float u_bias;
uniform float u_angle;
uniform float u_perspective;
uniform float u_count;
uniform float u_dispersion;
uniform float u_dispersionShift;
uniform float u_dispersionColor;
uniform float u_focusCenter;
uniform float u_focusEdges;
uniform float u_swirl;
uniform float u_noise;
uniform float u_noiseFrequency;
uniform float u_noiseOffset;
uniform float u_lensBulge;
uniform float u_lensCircle;
uniform float u_grainMixer;
uniform float u_grainOverlay;
uniform float u_imageX;
uniform float u_imageY;

in vec2 v_imageUV;

out vec4 fragColor;

${Oe}
${Te}
${Ne}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1., 0.));
  float c = hash21(i + vec2(0., 1.));
  float d = hash21(i + vec2(1., 1.));
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float getUvFrame(vec2 uv) {
  vec2 invAA = 1. / clamp(fwidth(uv), 1e-5, .02);
  vec2 lo = clamp(uv * invAA + .5, 0., 1.);
  vec2 hi = clamp((1. - uv) * invAA + .5, 0., 1.);
  return lo.x * hi.x * lo.y * hi.y;
}

vec4 sampleOverWhite(vec2 uv) {
  vec4 img = texture(u_image, uv);
  float cover = img.a * getUvFrame(uv);
  vec3 colorOverWhite = mix(vec3(1.), img.rgb, cover);
  return vec4(colorOverWhite, cover);
}

vec3 hueColor(float hue) {
  vec3 rgb = clamp(abs(mod(hue * 6. + vec3(0., 4., 2.), 6.) - 3.) - 1., 0., 1.);
  rgb = rgb * rgb * (3. - 2. * rgb);
  return rgb;
}
                                            
float boxInradius() {
  return .5 * min(u_imageAspectRatio, 1.);
}

float boxOutradius() {
  return .5 * length(vec2(u_imageAspectRatio, 1.));
}

float spreadReach() {
  return .7 * pow(u_spread, 1.3 + 2.7 * u_spread);
}

float innerCircleMask(float radius, float inradius) {
  return 1. - smoothstep(.5 * inradius, 1.1 * inradius, radius);
}

float dispersionCurve(float t, float biasPow) {
  float mirroredT = u_bias < 0. ? 1. - t : t;
  float curved = pow(mirroredT, biasPow);
  return u_bias < 0. ? 1. - curved : curved;
}

vec2 getSpread(vec2 fromCenter, float radius, vec2 warpedUV, float edgeAA, float inradius, float outradius, float reach, out float outStrength) {
  float angleRad = radians(u_angle);
  vec2 uniformDir = vec2(cos(angleRad), sin(angleRad));

  float invInradius = 1. / inradius;
  vec2 radialDir = fromCenter * invInradius;
  float maxLen = (outradius + reach) * invInradius;
  float radialLen = radius * invInradius;
  if (radialLen > maxLen) radialDir *= maxLen / radialLen;
  vec2 spreadDir = mix(uniformDir, radialDir, u_perspective);

  float bandProximity = smoothstep(inradius * .8, inradius, radius);
  float lensCircleMaxing = bandProximity * u_lensCircle * u_lensCircle * u_lensCircle;
  spreadDir = mix(spreadDir, radialDir, lensCircleMaxing);

  vec2 warpedAbs = abs(warpedUV - .5);
  float inner = mix(1., smoothstep(0., mix(inradius, outradius, u_focusCenter), radius), u_focusCenter);
  float boxDist = max(warpedAbs.x, warpedAbs.y) * 2.;
  float outer = mix(1., 1. - min(boxDist, 1.), u_focusEdges);
  float strength = inner * outer;

  strength *= mix(1., mix(.15, .03, max(-u_lensBulge, 0.)), lensCircleMaxing);

  vec2 outside = max(warpedAbs - .5, 0.);
  float margin = max(reach * length(spreadDir) * (1. - u_lensCircle), edgeAA);
  strength *= 1. - smoothstep(0., margin, length(outside));

  outStrength = strength;
  vec2 axis = spreadDir * (reach * strength);

  if (u_noise > 0.) {
    float turn = (valueNoise(fromCenter * u_noiseFrequency * 18. + u_noiseOffset * 30.) - .5) * 2. * u_noise;
    float cs = cos(turn), sn = sin(turn);
    axis = mat2(cs, -sn, sn, cs) * axis;
  }

  axis.x /= u_imageAspectRatio;
  return axis;
}

vec2 lensWarp(vec2 fromCenter, float radius, float inradius, out float bulgeFade) {
  bulgeFade = 1.;
  if (u_lensBulge == 0. && u_lensCircle <= 0.) return fromCenter;
  if (radius < 1e-5) return fromCenter;
  
  float r = radius;

  if (u_lensBulge != 0.) {
    float rn = radius / inradius;
    float bulge = abs(u_lensBulge) * (u_lensBulge > 0. ? 1.4 : 1.2);
    if (u_lensBulge > 0.) bulgeFade = 1. - smoothstep(1.45, 1.53, rn * bulge);
    float map = u_lensBulge > 0.
      ? tan(min(rn * bulge, 1.53)) / tan(bulge)
      : atan(rn * tan(bulge)) / bulge;
    float bulgeScale = map / rn;
    fromCenter *= bulgeScale;
    r *= bulgeScale;
  }

  if (u_lensCircle > 0.) {
    vec2 dir = fromCenter / max(r, 1e-5);
    vec2 halfBox = vec2(u_imageAspectRatio, 1.) * .5;
    float rBox = min(halfBox.x / max(abs(dir.x), 1e-4), halfBox.y / max(abs(dir.y), 1e-4));
    float band = inradius * mix(.03, .2, .5 * (u_lensBulge + 1.));
    float innerEdge = inradius - band;
    float over = smoothstep(0., 1., (r - innerEdge) / band);
    float g = r + (rBox - inradius) * pow(over, 14.);
    fromCenter = dir * mix(r, g, u_lensCircle);
  }

  return fromCenter;
}

void main() {
  vec2 uv = v_imageUV;

  float invAspect = 1. / u_imageAspectRatio;
  float inradius = boxInradius();
  float outradius = boxOutradius();
  float reach = spreadReach();

  vec2 fromCenter = uv - .5;
  fromCenter.x *= u_imageAspectRatio;
  float radius = length(fromCenter);

  float bulgeFade;
  vec2 warpedFromCenter = lensWarp(fromCenter, radius, inradius, bulgeFade);
  vec2 baseUV = vec2(warpedFromCenter.x * invAspect, warpedFromCenter.y) + .5;

  vec2 baseDerivative = fwidth(baseUV);
  float edgeAA = clamp(2. * max(baseDerivative.x, baseDerivative.y), .001, .02);

  float spreadStrength;
  vec2 spreadAxis = getSpread(fromCenter, radius, baseUV, edgeAA, inradius, outradius, reach, spreadStrength);

  vec2 grainUV = vec2(0.);
  if (u_grainMixer > 0. || u_grainOverlay > 0.) {
    vec2 dudx = dFdx(v_imageUV);
    vec2 dudy = dFdy(v_imageUV);
    grainUV = (v_imageUV - .5) * (.8 / vec2(length(dudx), length(dudy))) + .5;
  }

  if (u_grainMixer > 0.) {
    float grainSeed = valueNoise(grainUV);
    vec2 jit = fract(grainSeed * vec2(157.31, 113.57)) * 2. - 1.;
    spreadAxis += jit * .3 * u_grainMixer * length(spreadAxis);
  }

  float count = floor(u_count);
  int countInteger = int(count);

  float invCount = 1. / count;
  float invSpan = 1. / max(count - 1., 1.);
  float hueBase = u_dispersionColor + .5;
  float biasPower = 1. + 2. * abs(u_bias);
  vec2 tapBias = .5 - vec2(u_imageX, u_imageY);

  float centerAmount = clamp(1. - u_dispersionShift, 0., 1.);
  float edgesAmount = clamp(1. + u_dispersionShift, 0., 1.);
  float dispersion = u_dispersion * mix(edgesAmount, centerAmount, innerCircleMask(radius, inradius));
  float dispersionPower = pow(dispersion, .8);

  float warpedRadius = length(warpedFromCenter);
  float swirlAngle = u_swirl * .4 * PI * spreadStrength * u_spread * min(1., inradius / max(warpedRadius, 1e-4));

  vec3 colorSum = vec3(0.);
  vec3 weightSum = vec3(0.);
  float coverSum = 0.;

  for (int i = 0; i < ${{maxSamples:50}.maxSamples}; i++) {
    if (i >= countInteger) break;

    float layer = float(i);
    float hue = hueBase + layer * invCount;

    float spread = layer * invSpan;
    if (u_bias != 0.) spread = dispersionCurve(spread, biasPower);

    // mix(axis, -axis, spread) is axis scaled by the signed position along the fan
    float fanPos = 1. - 2. * spread;
    vec2 tapUV = baseUV + spreadAxis * fanPos - .5;

    if (u_swirl != 0.) {
      tapUV.x *= u_imageAspectRatio;
      tapUV = rotate(tapUV, swirlAngle * fanPos);
      tapUV.x *= invAspect;
    }

    vec4 tap = sampleOverWhite(tapUV + tapBias);
    vec3 weight = 1. - dispersionPower * hueColor(hue);

    colorSum += tap.rgb * weight;
    weightSum += weight;
    coverSum += tap.a;
  }

  vec3 color = colorSum / max(weightSum, 1e-4);
  float coverAvg = coverSum * invCount;

  float ground = min(color.r, min(color.g, color.b));
  float alpha = max(coverAvg, 1. - ground);
  vec3 premult = max(color - (1. - alpha), 0.);
  fragColor = vec4(premult, alpha) * bulgeFade;

  if (u_grainOverlay > 0.) {
    float grain = valueNoise(rotate(grainUV, 1.) + vec2(3.));
    grain = mix(grain, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
    grain = pow(grain, 1.3);
    float grainV = grain * 2. - 1.;
    float grainStrength = pow(u_grainOverlay * abs(grainV), .8) * fragColor.a;
    fragColor.rgb = mix(fragColor.rgb, vec3(step(0., grainV)) * fragColor.a, .35 * grainStrength);
  }
}
`,bn=`#version 300 es
precision mediump float;

uniform float u_rotation;

uniform float u_time;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform float u_radius;
uniform float u_contrast;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_size;
uniform float u_grainMixer;
uniform float u_grainOverlay;
uniform float u_grainSize;
uniform float u_grid;
uniform bool u_originalColors;
uniform bool u_inverted;
uniform float u_type;

in vec2 v_imageUV;

out vec4 fragColor;

${Oe}
${Ne}
${Te}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float lst(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

float sst(float edge0, float edge1, float x) {
  return smoothstep(edge0, edge1, x);
}

float getCircle(vec2 uv, float r, float baseR) {
  r = mix(.25 * baseR, 0., r);
  float d = length(uv - .5);
  float aa = fwidth(d);
  return 1. - smoothstep(r - aa, r + aa, d);
}

float getCell(vec2 uv) {
  float insideX = step(0.0, uv.x) * (1.0 - step(1.0, uv.x));
  float insideY = step(0.0, uv.y) * (1.0 - step(1.0, uv.y));
  return insideX * insideY;
}

float getCircleWithHole(vec2 uv, float r, float baseR) {
  float cell = getCell(uv);

  r = mix(.75 * baseR, 0., r);
  float rMod = mod(r, .5);

  float d = length(uv - .5);
  float aa = fwidth(d);
  float circle = 1. - smoothstep(rMod - aa, rMod + aa, d);
  if (r < .5) {
    return circle;
  } else {
    return cell - circle;
  }
}

float getGooeyBall(vec2 uv, float r, float baseR) {
  float d = length(uv - .5);
  float sizeRadius = .3;
  if (u_grid == 1.) {
    sizeRadius = .42;
  }
  sizeRadius = mix(sizeRadius * baseR, 0., r);
  d = 1. - sst(0., sizeRadius, d);

  d = pow(d, 2. + baseR);
  return d;
}

float getSoftBall(vec2 uv, float r, float baseR) {
  float d = length(uv - .5);
  float sizeRadius = clamp(baseR, 0., 1.);
  sizeRadius = mix(.5 * sizeRadius, 0., r);
  d = 1. - lst(0., sizeRadius, d);
  float powRadius = 1. - lst(0., 2., baseR);
  d = pow(d, 4. + 3. * powRadius);
  return d;
}

float getUvFrame(vec2 uv, vec2 pad) {
  float aa = 0.0001;

  float left   = smoothstep(-pad.x, -pad.x + aa, uv.x);
  float right  = smoothstep(1.0 + pad.x, 1.0 + pad.x - aa, uv.x);
  float bottom = smoothstep(-pad.y, -pad.y + aa, uv.y);
  float top    = smoothstep(1.0 + pad.y, 1.0 + pad.y - aa, uv.y);

  return left * right * bottom * top;
}

float sigmoid(float x, float k) {
  return 1.0 / (1.0 + exp(-k * (x - 0.5)));
}

float getLumAtPx(vec2 uv, float contrast) {
  vec4 tex = texture(u_image, uv);
  vec3 color = vec3(
  sigmoid(tex.r, contrast),
  sigmoid(tex.g, contrast),
  sigmoid(tex.b, contrast)
  );
  float lum = dot(vec3(0.2126, 0.7152, 0.0722), color);
  lum = mix(1., lum, tex.a);
  lum = u_inverted ? (1. - lum) : lum;
  return lum;
}

float getLumBall(vec2 p, vec2 pad, vec2 inCellOffset, float contrast, float baseR, float stepSize, out vec4 ballColor) {
  p += inCellOffset;
  vec2 uv_i = floor(p);
  vec2 uv_f = fract(p);
  vec2 samplingUV = (uv_i + .5 - inCellOffset) * pad + vec2(.5);
  float outOfFrame = getUvFrame(samplingUV, pad * stepSize);

  float lum = getLumAtPx(samplingUV, contrast);
  ballColor = texture(u_image, samplingUV);
  ballColor.rgb *= ballColor.a;
  ballColor *= outOfFrame;

  float ball = 0.;
  if (u_type == 0.) {
    // classic
    ball = getCircle(uv_f, lum, baseR);
  } else if (u_type == 1.) {
    // gooey
    ball = getGooeyBall(uv_f, lum, baseR);
  } else if (u_type == 2.) {
    // holes
    ball = getCircleWithHole(uv_f, lum, baseR);
  } else if (u_type == 3.) {
    // soft
    ball = getSoftBall(uv_f, lum, baseR);
  }

  return ball * outOfFrame;
}


void main() {

  float stepMultiplier = 1.;
  if (u_type == 0.) {
    // classic
    stepMultiplier = 2.;
  } else if (u_type == 1. || u_type == 3.) {
    // gooey & soft
    stepMultiplier = 6.;
  }

  float cellsPerSide = mix(300., 7., pow(u_size, .7));
  cellsPerSide /= stepMultiplier;
  float cellSizeY = 1. / cellsPerSide;
  vec2 pad = cellSizeY * vec2(1. / u_imageAspectRatio, 1.);
  if (u_type == 1. && u_grid == 1.) {
    // gooey diagonal grid works differently
    pad *= .7;
  }

  vec2 uv = v_imageUV;
  uv -= vec2(.5);
  uv /= pad;

  float contrast = mix(0., 15., pow(u_contrast, 1.5));
  float baseRadius = u_radius;
  if (u_originalColors == true) {
    contrast = mix(.1, 4., pow(u_contrast, 2.));
    baseRadius = 2. * pow(.5 * u_radius, .3);
  }

  float totalShape = 0.;
  vec3 totalColor = vec3(0.);
  float totalOpacity = 0.;

  vec4 ballColor;
  float shape;
  float stepSize = 1. / stepMultiplier;
  for (float x = -0.5; x < 0.5; x += stepSize) {
    for (float y = -0.5; y < 0.5; y += stepSize) {
      vec2 offset = vec2(x, y);

      if (u_grid == 1.) {
        float rowIndex = floor((y + .5) / stepSize);
        float colIndex = floor((x + .5) / stepSize);
        if (stepSize == 1.) {
          rowIndex = floor(uv.y + y + 1.);
          if (u_type == 1.) {
            colIndex = floor(uv.x + x + 1.);
          }
        }
        if (u_type == 1.) {
          if (mod(rowIndex + colIndex, 2.) == 1.) {
            continue;
          }
        } else {
          if (mod(rowIndex, 2.) == 1.) {
            offset.x += .5 * stepSize;
          }
        }
      }

      shape = getLumBall(uv, pad, offset, contrast, baseRadius, stepSize, ballColor);
      totalColor   += ballColor.rgb * shape;
      totalShape   += shape;
      totalOpacity += shape;
    }
  }

  const float eps = 1e-4;

  totalColor /= max(totalShape, eps);
  totalOpacity /= max(totalShape, eps);

  float finalShape = 0.;
  if (u_type == 0.) {
    finalShape = min(1., totalShape);
  } else if (u_type == 1.) {
    float aa = fwidth(totalShape);
    float th = .5;
    finalShape = smoothstep(th - aa, th + aa, totalShape);
  } else if (u_type == 2.) {
    finalShape = min(1., totalShape);
  } else if (u_type == 3.) {
    finalShape = totalShape;
  }

  vec2 grainSize = mix(2000., 200., u_grainSize) * vec2(1., 1. / u_imageAspectRatio);
  vec2 grainUV = v_imageUV - .5;
  grainUV *= grainSize;
  grainUV += .5;
  float grain = valueNoise(grainUV);
  grain = smoothstep(.55, .7 + .2 * u_grainMixer, grain);
  grain *= u_grainMixer;
  finalShape = mix(finalShape, 0., grain);

  vec3 color = vec3(0.);
  float opacity = 0.;

  if (u_originalColors == true) {
    color = totalColor * finalShape;
    opacity = totalOpacity * finalShape;

    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    color = color + bgColor * (1. - opacity);
    opacity = opacity + u_colorBack.a * (1. - opacity);
  } else {
    vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
    float fgOpacity = u_colorFront.a;
    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    float bgOpacity = u_colorBack.a;

    color = fgColor * finalShape;
    opacity = fgOpacity * finalShape;
    color += bgColor * (1. - opacity);
    opacity += bgOpacity * (1. - opacity);
  }

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  color = mix(color, grainOverlayColor, .5 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`,xn={classic:0,gooey:1,holes:2,soft:3},Sn={square:0,hex:1};function Cn(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(let n in e){if(n===`colors`){let n=Array.isArray(e.colors),r=Array.isArray(t.colors);if(!n||!r){if(Object.is(e.colors,t.colors)===!1)return!1;continue}if(e.colors?.length!==t.colors?.length||!e.colors?.every((e,n)=>e===t.colors?.[n]))return!1;continue}if(Object.is(e[n],t[n])===!1)return!1}return!0}var B={name:`Default`,params:{...N,speed:1,frame:0,colors:[`#e0eaff`,`#241d9a`,`#f75092`,`#9f50d3`],distortion:.8,swirl:.1,grainMixer:0,grainOverlay:0}};({...N}),{...N},{...N};var wn=(0,L.memo)(function({speed:e=B.params.speed,frame:t=B.params.frame,colors:n=B.params.colors,distortion:r=B.params.distortion,swirl:i=B.params.swirl,grainMixer:a=B.params.grainMixer,grainOverlay:o=B.params.grainOverlay,fit:s=B.params.fit,rotation:c=B.params.rotation,scale:l=B.params.scale,originX:u=B.params.originX,originY:d=B.params.originY,offsetX:f=B.params.offsetX,offsetY:p=B.params.offsetY,worldWidth:m=B.params.worldWidth,worldHeight:h=B.params.worldHeight,...g}){let _={u_colors:n.map(P),u_colorsCount:n.length,u_distortion:r,u_swirl:i,u_grainMixer:a,u_grainOverlay:o,u_fit:Ee[s],u_rotation:c,u_scale:l,u_offsetX:f,u_offsetY:p,u_originX:u,u_originY:d,u_worldWidth:m,u_worldHeight:h};return(0,R.jsx)(De,{...g,speed:e,frame:t,fragmentShader:un,uniforms:_})},Cn),V={name:`Default`,params:{...we,speed:1,frame:0,scale:.6,colorBack:`#000000`,colorFront:`#00b2ff`,shape:`sphere`,type:`4x4`,size:2}};({...we}),{...we},{...N},{...N},{...N};var Tn=(0,L.memo)(function({speed:e=V.params.speed,frame:t=V.params.frame,colorBack:n=V.params.colorBack,colorFront:r=V.params.colorFront,shape:i=V.params.shape,type:a=V.params.type,pxSize:o,size:s=o===void 0?V.params.size:o,fit:c=V.params.fit,scale:l=V.params.scale,rotation:u=V.params.rotation,originX:d=V.params.originX,originY:f=V.params.originY,offsetX:p=V.params.offsetX,offsetY:m=V.params.offsetY,worldWidth:h=V.params.worldWidth,worldHeight:g=V.params.worldHeight,..._}){let v={u_colorBack:P(n),u_colorFront:P(r),u_shape:fn[i],u_type:pn[a],u_pxSize:s,u_fit:Ee[c],u_scale:l,u_rotation:u,u_offsetX:p,u_offsetY:m,u_originX:d,u_originY:f,u_worldWidth:h,u_worldHeight:g};return(0,R.jsx)(De,{..._,speed:e,frame:t,fragmentShader:dn,uniforms:v})}),H={name:`Default`,params:{...N,fit:`cover`,scale:.6,speed:0,frame:0,colorFront:`#9fadbc`,colorBack:`#ffffff`,contrast:.3,roughness:.4,fiber:.3,fiberSize:.2,crumples:.3,crumpleSize:.35,folds:.65,foldCount:5,fade:0,drops:.2,seed:5.8}};({...N}),{...N},{...N};var En=(0,L.memo)(function({speed:e=H.params.speed,frame:t=H.params.frame,colorFront:n=H.params.colorFront,colorBack:r=H.params.colorBack,image:i=``,contrast:a=H.params.contrast,roughness:o=H.params.roughness,fiber:s=H.params.fiber,crumples:c=H.params.crumples,folds:l=H.params.folds,drops:u=H.params.drops,seed:d=H.params.seed,fiberScale:f,fiberSize:p=f===void 0?H.params.fiberSize:.2/f,crumplesScale:m,crumpleSize:h=m===void 0?H.params.crumpleSize:.2/m,blur:g,fade:_=g===void 0?H.params.fade:g,foldsNumber:v,foldCount:y=v===void 0?H.params.foldCount:v,fit:b=H.params.fit,scale:x=H.params.scale,rotation:S=H.params.rotation,originX:C=H.params.originX,originY:w=H.params.originY,offsetX:T=H.params.offsetX,offsetY:E=H.params.offsetY,worldWidth:D=H.params.worldWidth,worldHeight:O=H.params.worldHeight,...k}){let A=typeof window<`u`&&{u_noiseTexture:Ae()},ee={u_image:i,u_colorFront:P(n),u_colorBack:P(r),u_contrast:a,u_roughness:o,u_fiber:s,u_fiberSize:p,u_crumples:c,u_crumpleSize:h,u_foldCount:y,u_folds:l,u_fade:_,u_drops:u,u_seed:d,...A,u_fit:Ee[b],u_scale:x,u_rotation:S,u_offsetX:T,u_offsetY:E,u_originX:C,u_originY:w,u_worldWidth:D,u_worldHeight:O};return(0,R.jsx)(De,{...k,speed:e,frame:t,fragmentShader:mn,mipmaps:[`u_image`],uniforms:ee})},Cn),U={name:`Default`,params:{...N,fit:`cover`,speed:0,frame:0,colorBack:`#00000000`,colorShadow:`#000000`,colorHighlight:`#ffffff`,shadows:.25,size:.5,angle:0,distortionShape:`prism`,highlights:.1,shape:`lines`,distortion:.5,shift:0,blur:0,edges:.25,stretch:0,margin:0,marginLeft:0,marginRight:0,marginTop:0,marginBottom:0,grainMixer:0,grainOverlay:0}};({...N}),{...N},{...N};var Dn=(0,L.memo)(function({speed:e=U.params.speed,frame:t=U.params.frame,colorBack:n=U.params.colorBack,colorShadow:r=U.params.colorShadow,colorHighlight:i=U.params.colorHighlight,image:a=``,shadows:o=U.params.shadows,angle:s=U.params.angle,distortion:c=U.params.distortion,distortionShape:l=U.params.distortionShape,highlights:u=U.params.highlights,shape:d=U.params.shape,shift:f=U.params.shift,blur:p=U.params.blur,edges:m=U.params.edges,margin:h,marginLeft:g=h??U.params.marginLeft,marginRight:_=h??U.params.marginRight,marginTop:v=h??U.params.marginTop,marginBottom:y=h??U.params.marginBottom,grainMixer:b=U.params.grainMixer,grainOverlay:x=U.params.grainOverlay,stretch:S=U.params.stretch,count:C,size:w=C===void 0?U.params.size:(1/(C*1.6))**(1/6)/.7-.5,fit:T=U.params.fit,scale:E=U.params.scale,rotation:D=U.params.rotation,originX:O=U.params.originX,originY:k=U.params.originY,offsetX:A=U.params.offsetX,offsetY:ee=U.params.offsetY,worldWidth:j=U.params.worldWidth,worldHeight:M=U.params.worldHeight,...te}){let ne={u_image:a,u_colorBack:P(n),u_colorShadow:P(r),u_colorHighlight:P(i),u_shadows:o,u_size:w,u_angle:s,u_distortion:c,u_shift:f,u_blur:p,u_edges:m,u_stretch:S,u_distortionShape:_n[l],u_highlights:u,u_shape:gn[d],u_marginLeft:g,u_marginRight:_,u_marginTop:v,u_marginBottom:y,u_grainMixer:b,u_grainOverlay:x,u_fit:Ee[T],u_scale:E,u_rotation:D,u_offsetX:A,u_offsetY:ee,u_originX:O,u_originY:k,u_worldWidth:j,u_worldHeight:M};return(0,R.jsx)(De,{...te,speed:e,frame:t,fragmentShader:hn,mipmaps:[`u_image`],uniforms:ne})}),W={name:`Default`,params:{...N,fit:`cover`,speed:0,frame:0,colorFront:`#94ffaf`,colorBack:`#000c38`,colorHighlight:`#eaff94`,type:`8x8`,size:2,colorSteps:2,originalColors:!1,inverted:!1}};({...N}),{...N},{...N};var On=(0,L.memo)(function({speed:e=W.params.speed,frame:t=W.params.frame,colorFront:n=W.params.colorFront,colorBack:r=W.params.colorBack,colorHighlight:i=W.params.colorHighlight,image:a=``,type:o=W.params.type,colorSteps:s=W.params.colorSteps,originalColors:c=W.params.originalColors,inverted:l=W.params.inverted,pxSize:u,size:d=u===void 0?W.params.size:u,fit:f=W.params.fit,scale:p=W.params.scale,rotation:m=W.params.rotation,originX:h=W.params.originX,originY:g=W.params.originY,offsetX:_=W.params.offsetX,offsetY:v=W.params.offsetY,worldWidth:y=W.params.worldWidth,worldHeight:b=W.params.worldHeight,...x}){let S={u_image:a,u_colorFront:P(n),u_colorBack:P(r),u_colorHighlight:P(i),u_type:pn[o],u_pxSize:d,u_colorSteps:s,u_originalColors:c,u_inverted:l,u_fit:Ee[f],u_rotation:m,u_scale:p,u_offsetX:_,u_offsetY:v,u_originX:h,u_originY:g,u_worldWidth:y,u_worldHeight:b};return(0,R.jsx)(De,{...x,speed:e,frame:t,fragmentShader:vn,uniforms:S})},Cn),G={name:`Default`,params:{...N,scale:1,fit:`contain`,speed:0,frame:0,spread:.6,bias:1,angle:0,perspective:.1,count:35,dispersion:1,dispersionShift:0,dispersionColor:.6,focusCenter:.8,focusEdges:1,swirl:.35,noise:0,noiseFrequency:.25,noiseOffset:0,lensBulge:0,lensCircle:0,grainMixer:0,grainOverlay:0,imageX:0,imageY:0}};({...N}),{...N},{...N};var kn=(0,L.memo)(function({speed:e=G.params.speed,frame:t=G.params.frame,image:n=``,spread:r=G.params.spread,bias:i=G.params.bias,angle:a=G.params.angle,perspective:o=G.params.perspective,count:s=G.params.count,dispersion:c=G.params.dispersion,dispersionShift:l=G.params.dispersionShift,dispersionColor:u=G.params.dispersionColor,focusCenter:d=G.params.focusCenter,focusEdges:f=G.params.focusEdges,swirl:p=G.params.swirl,noise:m=G.params.noise,noiseFrequency:h=G.params.noiseFrequency,noiseOffset:g=G.params.noiseOffset,lensBulge:_=G.params.lensBulge,lensCircle:v=G.params.lensCircle,grainMixer:y=G.params.grainMixer,grainOverlay:b=G.params.grainOverlay,imageX:x=G.params.imageX,imageY:S=G.params.imageY,fit:C=G.params.fit,scale:w=G.params.scale,rotation:T=G.params.rotation,originX:E=G.params.originX,originY:D=G.params.originY,offsetX:O=G.params.offsetX,offsetY:k=G.params.offsetY,worldWidth:A=G.params.worldWidth,worldHeight:ee=G.params.worldHeight,...j}){let M={u_image:n,u_spread:r,u_bias:i,u_angle:a,u_perspective:o,u_count:s,u_dispersion:c,u_dispersionShift:l,u_dispersionColor:u,u_focusCenter:d,u_focusEdges:f,u_swirl:p,u_noise:m,u_noiseFrequency:h,u_noiseOffset:g,u_lensBulge:_,u_lensCircle:v,u_grainMixer:y,u_grainOverlay:b,u_imageX:x,u_imageY:S,u_fit:Ee[C],u_rotation:T,u_scale:w,u_offsetX:O,u_offsetY:k,u_originX:E,u_originY:D,u_worldWidth:A,u_worldHeight:ee};return(0,R.jsx)(De,{...j,speed:e,frame:t,fragmentShader:yn,mipmaps:[`u_image`],uniforms:M})},Cn),K={name:`Default`,params:{...N,fit:`cover`,speed:0,frame:0,colorBack:`#f2f1e8`,colorFront:`#2b2b2b`,size:.5,radius:1.25,contrast:.4,originalColors:!1,inverted:!1,grainMixer:.2,grainOverlay:.2,grainSize:.5,grid:`hex`,type:`gooey`}};({...N}),{...N},{...N};var An=(0,L.memo)(function({speed:e=K.params.speed,frame:t=K.params.frame,colorFront:n=K.params.colorFront,colorBack:r=K.params.colorBack,image:i=``,size:a=K.params.size,radius:o=K.params.radius,contrast:s=K.params.contrast,originalColors:c=K.params.originalColors,inverted:l=K.params.inverted,grainMixer:u=K.params.grainMixer,grainOverlay:d=K.params.grainOverlay,grainSize:f=K.params.grainSize,grid:p=K.params.grid,type:m=K.params.type,fit:h=K.params.fit,scale:g=K.params.scale,rotation:_=K.params.rotation,originX:v=K.params.originX,originY:y=K.params.originY,offsetX:b=K.params.offsetX,offsetY:x=K.params.offsetY,worldWidth:S=K.params.worldWidth,worldHeight:C=K.params.worldHeight,...w}){let T={u_image:i,u_colorFront:P(n),u_colorBack:P(r),u_size:a,u_radius:o,u_contrast:s,u_originalColors:c,u_inverted:l,u_grainMixer:u,u_grainOverlay:d,u_grainSize:f,u_grid:Sn[p],u_type:xn[m],u_fit:Ee[h],u_rotation:_,u_scale:g,u_offsetX:b,u_offsetY:x,u_originX:v,u_originY:y,u_worldWidth:S,u_worldHeight:C};return(0,R.jsx)(De,{...w,speed:e,frame:t,fragmentShader:bn,uniforms:T})},Cn),jn=4,Mn=128,Nn=(e,t)=>{let n=255,r=0;for(let i of e)n=Math.min(n,i[t]),r=Math.max(r,i[t]);return r-n},Pn=e=>{if(e.colors.length<2)return null;let t={r:Nn(e.colors,`r`),g:Nn(e.colors,`g`),b:Nn(e.colors,`b`)},n=Object.keys(t).reduce((e,n)=>t[n]>t[e]?n:e,`r`),r=[...e.colors].sort((e,t)=>e[n]-t[n]),i=e.weight/2,a=0,o=1;for(let e=0;e<r.length-1&&(a+=r[e].weight,o=e+1,!(a>=i));e+=1);let s=r.slice(0,o),c=r.slice(o);return[{colors:s,weight:s.reduce((e,t)=>e+t.weight,0)},{colors:c,weight:c.reduce((e,t)=>e+t.weight,0)}]},Fn=e=>{let t=e.colors.reduce((e,t)=>({r:e.r+t.r*t.weight,g:e.g+t.g*t.weight,b:e.b+t.b*t.weight}),{r:0,g:0,b:0});return{r:Math.round(t.r/e.weight),g:Math.round(t.g/e.weight),b:Math.round(t.b/e.weight),weight:e.weight}},In=({r:e,g:t,b:n})=>`#${e.toString(16).padStart(2,`0`)}${t.toString(16).padStart(2,`0`)}${n.toString(16).padStart(2,`0`)}`,Ln=(e,t=5)=>{if(t<=0)return[];let n=new Map;for(let t=0;t<e.length;t+=4){if(e[t+3]<Mn)continue;let r=e[t],i=e[t+1],a=e[t+2],o=r>>jn<<8|i>>jn<<4|a>>jn,s=n.get(o);s?(s.r+=r,s.g+=i,s.b+=a,s.weight+=1):n.set(o,{r,g:i,b:a,weight:1})}let r=[...n.values()].map(e=>({r:Math.round(e.r/e.weight),g:Math.round(e.g/e.weight),b:Math.round(e.b/e.weight),weight:e.weight}));if(r.length===0)return[];let i=[{colors:r,weight:r.reduce((e,t)=>e+t.weight,0)}];for(;i.length<Math.min(t,r.length);){let e=-1,t=-1;for(let n=0;n<i.length;n+=1){let r=i[n];if(r.colors.length<2)continue;let a=Math.max(Nn(r.colors,`r`),Nn(r.colors,`g`),Nn(r.colors,`b`))*Math.sqrt(r.weight);a>t&&(t=a,e=n)}if(e<0)break;let n=Pn(i[e]);if(!n)break;i.splice(e,1,...n)}return i.map(Fn).sort((e,t)=>t.weight-e.weight).map(In)},Rn=(e,{silent:t=!1}={})=>new Promise(n=>{let r=new Image;r.crossOrigin=`Anonymous`,r.onload=()=>{let e=document.createElement(`canvas`),i=e.getContext(`2d`);if(!i){n(null);return}e.width=50,e.height=50;try{i.drawImage(r,0,0,50,50),n(i.getImageData(0,0,50,50).data)}catch(e){t||console.warn(`Failed to read image pixels for color extraction`,e),n(null)}},r.onerror=e=>{t||console.warn(`Failed to load image for color extraction`,e),n(null)},r.src=e}),zn=(e,t)=>{let n=[];for(let t=0;t<e.length;t+=8){let r=e[t],i=e[t+1],a=e[t+2];if(e[t+3]<128)continue;let o=Math.max(r,i,a),s=Math.min(r,i,a),c=(o+s)/2;((o===s?0:(o-s)/(255-Math.abs(o+s-255)))>.2&&c>30&&c<220||n.length<100)&&n.push({r,g:i,b:a})}n.sort((e,t)=>{let n=(Math.max(e.r,e.g,e.b)-Math.min(e.r,e.g,e.b))/255;return(Math.max(t.r,t.g,t.b)-Math.min(t.r,t.g,t.b))/255-n});let r=[];for(let e of n){if(r.length>=t)break;(r.every(t=>Math.sqrt((e.r-t.r)**2+(e.g-t.g)**2+(e.b-t.b)**2)>20)||r.length===0)&&r.push(e)}return r.map(e=>`#${e.r.toString(16).padStart(2,`0`)}${e.g.toString(16).padStart(2,`0`)}${e.b.toString(16).padStart(2,`0`)}`)},Bn=async(e,t=5)=>{let n=await Rn(e);return n?zn(n,t):[]},Vn=async(e,t=5)=>{let n=await Rn(e);return n?Ln(n,t):[]},Hn=Object.freeze({antialias:!1,depth:!1}),Un=e=>(t=>{if(e.current=t,t)return()=>{e.current=null;let n=t.paperShaderMount?.canvasElement;if(!n)return;let r=n.getContext(`webgl2`);queueMicrotask(()=>{!r||n.isConnected||r.isContextLost()||r.getExtension(`WEBGL_lose_context`)?.loseContext()})}}),Wn=921600,Gn=.12,Kn=300,q=e=>Math.min(1,Math.max(0,e/255)),qn=e=>Math.min(2,Math.max(0,e)),Jn=e=>Math.min(1,Math.max(0,e)),Yn=(e,t,n)=>e+(t-e)*n,Xn=(e,t,n,r,i)=>(q(e)*.22+q(t)*.18+q(n)*.22+q(r)*.28+q(i)*.1)**.55,Zn=(e,t,n)=>Math.max(n*.84,Jn((e-t)*7)),Qn=(e,t)=>Jn(e*.42+t*.85),$n=(e,t)=>Math.max(e,t),er=(e,t,n)=>n?Qn(e,t):Jn(e),tr=(e,t,n,r)=>qn(r?e*Gn:Yn(e,t,n)),nr=(e,t,n)=>{let r=e[0]??t.secondaryColor;if(n===`cover-only`){let t=e[1]??r,n=e[2]??t;return{ditheringBack:n,ditheringFront:r,mesh:[r,t,n,e[3]??r,e[4]??t,e[5]??n]}}let i=e[1]??t.primaryColor,a=e[2]??r,o=e[3]??i;return{ditheringBack:t.backgroundColor,ditheringFront:r,mesh:[r,i,a,o,t.backgroundColor,t.accentColor]}},rr=L.memo(({theme:e,coverUrl:t,audioPower:n,audioBands:r,staticMode:i,paused:a,tuning:o,blendMs:s=0,blendProgress:c})=>{let l=(0,L.useRef)(null),u=(0,L.useRef)(null),d=(0,L.useMemo)(()=>Un(l),[]),f=(0,L.useMemo)(()=>Un(u),[]),p=(0,L.useRef)(null),m=(0,L.useRef)(null),h=(0,L.useRef)(a),g=(0,L.useRef)(+!a),[_,v]=(0,L.useState)([]),y=o??Le,b=y.displayMode!==`mesh`,x=y.displayMode!==`dithering`;h.current=a;let S=Dt();(0,L.useEffect)(()=>{let e=!0;return t?(Vn(t,6).then(t=>{e&&(v(t),S())}),()=>{e=!1}):(v([]),S(),()=>{e=!1})},[t,S]);let C=(0,L.useMemo)(()=>nr(_,e,y.colorSource),[_,e,y.colorSource]),w=Pt([e.backgroundColor,C.ditheringBack,C.ditheringFront,...C.mesh],s,c),[T,E,D]=w,O=(0,L.useMemo)(()=>({ditheringBack:E,ditheringFront:D,mesh:w.slice(3)}),[w,E,D]);return(0,L.useEffect)(()=>{let e=l.current?.paperShaderMount,t=u.current?.paperShaderMount;if(i){e?.setSpeed(0),t?.setSpeed(0);return}let a=0,o=new WeakMap,s=(e,t,n)=>{let r=o.get(e);r||(r={},o.set(e,r)),r[t]!==n&&(r[t]=n,e.style[t]=n)},c=0,d=0,f=0,_=0,v=0,b=0,S=null,C=(e,t)=>Yn(tr(e,t,_,!0),tr(e,t,_,!1),g.current),w=e=>{a=requestAnimationFrame(w);let t=h.current,i=S===null?0:1-Math.exp((S-e)/Kn);S=e,g.current=Yn(g.current,+!t,i);let o=t?0:q(n.get()),T=t?0:q(r.bass.get()),E=t?0:Xn(r.bass.get(),r.lowMid.get(),r.mid.get(),r.vocal.get(),r.treble.get()),D=t?0:q(Math.max(r.mid.get(),r.vocal.get()));c=Yn(c,o,.12),d=Yn(d,T,.16),f=Yn(f,D,.13),b=y.enhancedBeatResponse?Zn(E,v,b):0,v=E;let O=!t&&tt()&&nt(Ke.latentPulse)>0?Qn(E,$n(Ye.get(),qe.get())):er(E,b,y.enhancedBeatResponse);_=Yn(_,O,O>_?.42:.14);let k=l.current?.paperShaderMount,A=u.current?.paperShaderMount;if(k){let e=C(y.ditheringSpeed,y.ditheringAudioSpeed);k.setSpeed(e),Me(k,{u_pxSize:Math.max(.5,y.ditheringSize-d*y.ditheringSize*.34)},e!==0)}if(A){let e=C(y.meshSpeed,y.meshAudioSpeed);A.setSpeed(e),Me(A,{u_distortion:y.meshDistortion+c*.62,u_swirl:y.meshSwirl+f*.38},e!==0)}p.current&&(s(p.current,`opacity`,x?`${Math.min(1,y.ditheringOpacity+d*.25)}`:`1`),s(p.current,`transform`,`scale(${1.015+d*.025})`)),m.current&&(s(m.current,`filter`,`saturate(${1.04+f*.34}) brightness(${.94+c*.16})`),s(m.current,`transform`,`scale(${1.025+c*.018})`))};return a=requestAnimationFrame(w),()=>cancelAnimationFrame(a)},[r,n,x,i,y]),(0,R.jsxs)(`div`,{className:`absolute inset-0 z-0 overflow-hidden`,style:{backgroundColor:T,pointerEvents:`none`},children:[x&&(0,R.jsx)(`div`,{ref:m,className:`absolute inset-0`,style:{transform:`scale(1.025)`,transformOrigin:`center`},children:(0,R.jsx)(wn,{ref:f,width:`100%`,height:`100%`,colors:O.mesh,distortion:y.meshDistortion,swirl:y.meshSwirl,grainMixer:0,grainOverlay:.01,speed:i?0:y.meshSpeed,minPixelRatio:1,maxPixelCount:Wn,webGlContextAttributes:Hn,style:{width:`100%`,height:`100%`}})}),b&&(0,R.jsx)(`div`,{ref:p,className:`absolute inset-0`,style:{mixBlendMode:x?`soft-light`:`normal`,opacity:x?y.ditheringOpacity:1,transform:`scale(1.015)`,transformOrigin:`center`},children:(0,R.jsx)(Tn,{ref:d,width:`100%`,height:`100%`,colorBack:O.ditheringBack,colorFront:O.ditheringFront,shape:`warp`,type:`4x4`,size:y.ditheringSize,speed:i?0:y.ditheringSpeed,minPixelRatio:1,maxPixelCount:Wn,webGlContextAttributes:Hn,style:{width:`100%`,height:`100%`}})}),y.overlayEnabled&&y.overlayOpacity>0&&(0,R.jsx)(`div`,{className:`absolute inset-0`,style:{backgroundColor:T,opacity:y.overlayOpacity}})]})}),ir={id:`bg-latent`,titleKey:`options.latentBackgroundSettings`},ar={id:`bg-latent-dithering`,titleKey:`options.latentDitheringGroup`},or={id:`bg-latent-mesh`,titleKey:`options.latentMeshGroup`},sr=e=>e.toFixed(1),cr=e=>e.toFixed(2),lr=({t:e,tuning:t,onTuningChange:n,onSliderPointerDown:r,onSliderCommit:i})=>{let a={onDragStart:r,onDragEnd:i};return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsxs)(S,{def:ir,children:[(0,R.jsx)(x,{label:e(`options.latentDisplayMode`),children:(0,R.jsx)(ne,{value:t.displayMode,options:[{value:`dithering`,label:e(`options.latentDisplayDithering`)},{value:`mesh`,label:e(`options.latentDisplayMesh`)},{value:`both`,label:e(`options.latentDisplayBoth`)}],onChange:e=>n?.({displayMode:e})})}),(0,R.jsx)(x,{label:e(`options.latentColorSource`),children:(0,R.jsx)(ne,{value:t.colorSource,options:[{value:`cover-theme`,label:e(`options.latentColorSourceCoverTheme`)},{value:`cover-only`,label:e(`options.latentColorSourceCoverOnly`)}],onChange:e=>n?.({colorSource:e})})}),(0,R.jsx)(j,{label:e(`options.latentDynamicOnlyInPlayer`),note:e(`options.latentDynamicOnlyInPlayerDesc`),checked:t.dynamicOnlyInPlayer,onChange:e=>n?.({dynamicOnlyInPlayer:e})}),(0,R.jsx)(j,{label:e(`options.latentEnhancedBeatResponse`),note:e(`options.latentEnhancedBeatResponseDesc`),checked:t.enhancedBeatResponse,onChange:e=>n?.({enhancedBeatResponse:e})}),(0,R.jsx)(j,{label:e(`options.nomandBackgroundOverlay`),note:e(`options.nomandBackgroundOverlayDesc`),checked:t.overlayEnabled,onChange:e=>n?.({overlayEnabled:e})}),(0,R.jsx)(D,{when:t.overlayEnabled,children:(0,R.jsx)(k,{...a,sub:!0,label:e(`options.nomandBackgroundOverlayOpacity`),value:t.overlayOpacity,min:0,max:1,step:.05,format:E,onChange:e=>n?.({overlayOpacity:e})})})]}),(0,R.jsxs)(S,{def:ar,children:[(0,R.jsx)(k,{...a,label:e(`options.latentBaseSpeed`),value:t.ditheringSpeed,min:0,max:2,step:.1,format:sr,onChange:e=>n?.({ditheringSpeed:e})}),(0,R.jsx)(k,{...a,label:e(`options.latentAudioSpeed`),value:t.ditheringAudioSpeed,min:0,max:2,step:.1,format:sr,onChange:e=>n?.({ditheringAudioSpeed:e})}),(0,R.jsx)(k,{...a,label:e(`options.latentDitheringSize`),value:t.ditheringSize,min:.5,max:8,step:.25,format:cr,onChange:e=>n?.({ditheringSize:e})}),(0,R.jsx)(k,{...a,label:e(`options.latentDitheringOpacity`),value:t.ditheringOpacity,min:0,max:1,step:.05,format:E,onChange:e=>n?.({ditheringOpacity:e})})]}),(0,R.jsxs)(S,{def:or,children:[(0,R.jsx)(k,{...a,label:e(`options.latentBaseSpeed`),value:t.meshSpeed,min:0,max:2,step:.1,format:sr,onChange:e=>n?.({meshSpeed:e})}),(0,R.jsx)(k,{...a,label:e(`options.latentAudioSpeed`),value:t.meshAudioSpeed,min:0,max:2,step:.1,format:sr,onChange:e=>n?.({meshAudioSpeed:e})}),(0,R.jsx)(k,{...a,label:e(`options.latentMeshDistortion`),value:t.meshDistortion,min:0,max:2,step:.05,format:cr,onChange:e=>n?.({meshDistortion:e})}),(0,R.jsx)(k,{...a,label:e(`options.latentMeshSwirl`),value:t.meshSwirl,min:0,max:1,step:.05,format:cr,onChange:e=>n?.({meshSwirl:e})})]})]})},ur=e({default:()=>hr}),dr=[`dithering`,`mesh`,`both`],fr={dithering:`options.latentDisplayDithering`,mesh:`options.latentDisplayMesh`,both:`options.latentDisplayBoth`},pr=[`cover-theme`,`cover-only`],mr={"cover-theme":`options.latentColorSourceCoverTheme`,"cover-only":`options.latentColorSourceCoverOnly`},hr=xt({mode:`latent`,order:35,labelKey:`options.visualizerBackgroundModeLatent`,labelFallback:`Latent`,glyph:(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(`path`,{d:`M4.5 7.5h.01M9 7.5h.01M13.5 7.5h.01M18 7.5h.01`,strokeWidth:`2.2`,opacity:`0.55`}),(0,R.jsx)(`path`,{d:`M3 15c3-3.5 6-3.5 9 0s6 3.5 9 0`})]}),command:{title:`Background: Latent`,description:`Switch background to cover-colored audio-reactive shaders`,keywords:[`latent`,`latent background`,`shader background`,`隐现`,`隐现背景`,`音频响应背景`]},beatEffects:[{id:Ke.latentPulse,nameKey:`options.beatEffect_latentPulse`,descKey:`options.beatEffect_latentPulseDesc`,source:`beats`,retired:!0}],render:({config:e,theme:t,coverUrl:n,audioPower:r,audioBands:i,staticMode:a,paused:o,blendMs:s,blendProgress:c})=>(0,R.jsx)(rr,{theme:t,coverUrl:n,audioPower:r,audioBands:i,staticMode:a,paused:o,tuning:e?.latent?.tuning,blendMs:s,blendProgress:c}),renderSettingsPanel:({config:e,actions:t,...n})=>(0,R.jsx)(lr,{...n,tuning:e?.latent?.tuning??Le,onTuningChange:t?.latent?.onTuningChange}),renderQuickControls:({config:e,actions:t,t:n})=>{let r=e?.latent?.tuning??Le,i=n(fr[r.displayMode]),a=n(mr[r.colorSource]);return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(M,{label:i,title:`${n(`options.latentDisplayMode`)}: ${i}`,onClick:()=>t?.latent?.onTuningChange?.({displayMode:O(dr,r.displayMode)})}),(0,R.jsx)(M,{label:a,title:`${n(`options.latentColorSource`)}: ${a}`,onClick:()=>t?.latent?.onTuningChange?.({colorSource:O(pr,r.colorSource)})}),(0,R.jsx)(C,{active:r.overlayEnabled,label:n(`options.nomandBackgroundOverlay`),onToggle:()=>t?.latent?.onTuningChange?.({overlayEnabled:!r.overlayEnabled}),children:(0,R.jsx)(p,{size:14})})]})},resetSettings:e=>e?.latent?.onResetTuning?.()});function gr(){return(gr=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&(e[r]=n[r])}return e}).apply(this,arguments)}function _r(e,t){if(e==null)return{};var n,r,i={},a=Object.keys(e);for(r=0;r<a.length;r++)t.indexOf(n=a[r])>=0||(i[n]=e[n]);return i}function vr(e){var t=(0,L.useRef)(e),n=(0,L.useRef)(function(e){t.current&&t.current(e)});return t.current=e,n.current}var yr=function(e,t,n){return t===void 0&&(t=0),n===void 0&&(n=1),e>n?n:e<t?t:e},br=function(e){return`touches`in e},xr=function(e){return e&&e.ownerDocument.defaultView||self},Sr=function(e,t,n){var r=e.getBoundingClientRect(),i=br(t)?function(e,t){for(var n=0;n<e.length;n++)if(e[n].identifier===t)return e[n];return e[0]}(t.touches,n):t;return{left:yr((i.pageX-(r.left+xr(e).pageXOffset))/r.width),top:yr((i.pageY-(r.top+xr(e).pageYOffset))/r.height)}},Cr=function(e){!br(e)&&e.preventDefault()},wr=L.memo(function(e){var t=e.onMove,n=e.onKey,r=e.onEnd,i=_r(e,[`onMove`,`onKey`,`onEnd`]),a=(0,L.useRef)(null),o=vr(t),s=vr(n),c=vr(r),l=(0,L.useRef)(null),u=(0,L.useRef)(!1),d=(0,L.useMemo)(function(){var e=function(e){Cr(e),(br(e)?e.touches.length>0:e.buttons>0)&&a.current?o(Sr(a.current,e,l.current)):(n(!1),c())},t=function(){n(!1),c()};function n(n){var r=u.current,i=xr(a.current),o=n?i.addEventListener:i.removeEventListener;o(r?`touchmove`:`mousemove`,e),o(r?`touchend`:`mouseup`,t)}return[function(e){var t=e.nativeEvent,r=a.current;if(r&&(Cr(t),!function(e,t){return t&&!br(e)}(t,u.current)&&r)){if(br(t)){u.current=!0;var i=t.changedTouches||[];i.length&&(l.current=i[0].identifier)}r.focus(),o(Sr(r,t,l.current)),n(!0)}},function(e){var t=e.which||e.keyCode;t<37||t>40||(e.preventDefault(),s({left:t===39?.05:t===37?-.05:0,top:t===40?.05:t===38?-.05:0}))},function(e){var t=e.which||e.keyCode;t>=37&&t<=40&&c()},n]},[s,o,c]),f=d[0],p=d[1],m=d[2],h=d[3];return(0,L.useEffect)(function(){return h},[h]),L.createElement(`div`,gr({},i,{onTouchStart:f,onMouseDown:f,className:`react-colorful__interactive`,ref:a,onKeyDown:p,onKeyUp:m,tabIndex:0,role:`slider`}))}),Tr=function(e){return e.filter(Boolean).join(` `)},Er=function(e){var t=e.color,n=e.left,r=e.top,i=r===void 0?.5:r,a=Tr([`react-colorful__pointer`,e.className]);return L.createElement(`div`,{className:a,style:{top:100*i+`%`,left:100*n+`%`}},L.createElement(`div`,{className:`react-colorful__pointer-fill`,style:{backgroundColor:t}}))},J=function(e,t,n){return t===void 0&&(t=0),n===void 0&&(n=10**t),Math.round(n*e)/n},Dr=function(e){return Fr(Or(e))},Or=function(e){return e[0]===`#`&&(e=e.substring(1)),e.length<6?{r:parseInt(e[0]+e[0],16),g:parseInt(e[1]+e[1],16),b:parseInt(e[2]+e[2],16),a:e.length===4?J(parseInt(e[3]+e[3],16)/255,2):1}:{r:parseInt(e.substring(0,2),16),g:parseInt(e.substring(2,4),16),b:parseInt(e.substring(4,6),16),a:e.length===8?J(parseInt(e.substring(6,8),16)/255,2):1}},kr=function(e){return Pr(Mr(e))},Ar=function(e){var t=e.s,n=e.v,r=e.a,i=(200-t)*n/100;return{h:J(e.h),s:J(i>0&&i<200?t*n/100/(i<=100?i:200-i)*100:0),l:J(i/2),a:J(r,2)}},jr=function(e){var t=Ar(e);return`hsl(`+t.h+`, `+t.s+`%, `+t.l+`%)`},Mr=function(e){var t=e.h,n=e.s,r=e.v,i=e.a;t=t/360*6,n/=100,r/=100;var a=Math.floor(t),o=r*(1-n),s=r*(1-(t-a)*n),c=r*(1-(1-t+a)*n),l=a%6;return{r:J(255*[r,s,o,o,c,r][l]),g:J(255*[c,r,r,s,o,o][l]),b:J(255*[o,o,c,r,r,s][l]),a:J(i,2)}},Nr=function(e){var t=e.toString(16);return t.length<2?`0`+t:t},Pr=function(e){var t=e.r,n=e.g,r=e.b,i=e.a,a=i<1?Nr(J(255*i)):``;return`#`+Nr(t)+Nr(n)+Nr(r)+a},Fr=function(e){var t=e.r,n=e.g,r=e.b,i=e.a,a=Math.max(t,n,r),o=a-Math.min(t,n,r),s=o?a===t?(n-r)/o:a===n?2+(r-t)/o:4+(t-n)/o:0;return{h:60*(s<0?s+6:s),s:a?o/a*100:0,v:a/255*100,a:i}},Ir=L.memo(function(e){var t=e.hue,n=e.onChange,r=e.onChangeEnd,i=Tr([`react-colorful__hue`,e.className]);return L.createElement(`div`,{className:i},L.createElement(wr,{onMove:function(e){n({h:360*e.left})},onKey:function(e){n({h:yr(t+360*e.left,0,360)})},onEnd:r,"aria-label":`Hue`,"aria-valuenow":J(t),"aria-valuemax":`360`,"aria-valuemin":`0`},L.createElement(Er,{className:`react-colorful__hue-pointer`,left:t/360,color:jr({h:t,s:100,v:100,a:1})})))}),Lr=L.memo(function(e){var t=e.hsva,n=e.onChange,r=e.onChangeEnd,i={backgroundColor:jr({h:t.h,s:100,v:100,a:1})};return L.createElement(`div`,{className:`react-colorful__saturation`,style:i},L.createElement(wr,{onMove:function(e){n({s:100*e.left,v:100-100*e.top})},onKey:function(e){n({s:yr(t.s+100*e.left,0,100),v:yr(t.v-100*e.top,0,100)})},onEnd:r,"aria-label":`Color`,"aria-valuetext":`Saturation `+J(t.s)+`%, Brightness `+J(t.v)+`%`},L.createElement(Er,{className:`react-colorful__saturation-pointer`,top:1-t.v/100,left:t.s/100,color:jr(t)})))}),Rr=function(e,t){if(e===t)return!0;for(var n in e)if(e[n]!==t[n])return!1;return!0},zr=function(e,t){return e.toLowerCase()===t.toLowerCase()||Rr(Or(e),Or(t))};function Br(e,t,n,r){var i=vr(n),a=vr(r),o=(0,L.useState)(function(){return e.toHsva(t)}),s=o[0],c=o[1],l=(0,L.useRef)({color:t,hsva:s}),u=(0,L.useRef)(!1);return(0,L.useEffect)(function(){if(!e.equal(t,l.current.color)){var n=e.toHsva(t);l.current={hsva:n,color:t},c(n),u.current=!1}},[t,e]),(0,L.useEffect)(function(){var t;Rr(s,l.current.hsva)||e.equal(t=e.fromHsva(s),l.current.color)||(l.current={hsva:s,color:t},i(t),u.current=!0)},[s,e,i]),[s,(0,L.useCallback)(function(e){c(function(t){return Object.assign({},t,e)})},[]),(0,L.useCallback)(function(){u.current&&(u.current=!1,a(l.current.color))},[a])]}var Vr=typeof window<`u`?L.useLayoutEffect:L.useEffect,Hr=function(){return typeof __webpack_nonce__<`u`?__webpack_nonce__:void 0},Ur=new WeakMap,Wr=function(e){Vr(function(){var t=e.current;if(typeof document<`u`&&t){var n=t.getRootNode?t.getRootNode():t.ownerDocument,r=n&&(`head`in n||`host`in n)?n:t.ownerDocument;if(!Ur.has(r)){var i=`head`in r?r.head:r,a=(i.ownerDocument||document).createElement(`style`);a.innerHTML=`.react-colorful{position:relative;display:flex;flex-direction:column;width:200px;height:200px;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;cursor:default}.react-colorful__saturation{position:relative;flex-grow:1;border-color:transparent;border-bottom:12px solid #000;border-radius:8px 8px 0 0;background-image:linear-gradient(0deg,#000,transparent),linear-gradient(90deg,#fff,hsla(0,0%,100%,0))}.react-colorful__alpha-gradient,.react-colorful__pointer-fill{content:"";position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;border-radius:inherit}.react-colorful__alpha-gradient,.react-colorful__saturation{box-shadow:inset 0 0 0 1px rgba(0,0,0,.05)}.react-colorful__alpha,.react-colorful__hue{position:relative;height:24px}.react-colorful__hue{background:linear-gradient(90deg,red 0,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,red)}.react-colorful__last-control{border-radius:0 0 8px 8px}.react-colorful__interactive{position:absolute;left:0;top:0;right:0;bottom:0;border-radius:inherit;outline:none;touch-action:none}.react-colorful__pointer{position:absolute;z-index:1;box-sizing:border-box;width:28px;height:28px;transform:translate(-50%,-50%);background-color:#fff;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,.2)}.react-colorful__interactive:focus .react-colorful__pointer{transform:translate(-50%,-50%) scale(1.1)}.react-colorful__alpha,.react-colorful__alpha-pointer{background-color:#fff;background-image:url('data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill-opacity=".05"><path d="M8 0h8v8H8zM0 8h8v8H0z"/></svg>')}.react-colorful__saturation-pointer{z-index:3}.react-colorful__hue-pointer{z-index:2}`;var o=Hr();o&&a.setAttribute(`nonce`,o),Ur.set(r,a),i.appendChild(a)}}},[])},Gr=function(e){var t=e.className,n=e.colorModel,r=e.color,i=r===void 0?n.defaultColor:r,a=e.onChange,o=e.onChangeEnd,s=_r(e,[`className`,`colorModel`,`color`,`onChange`,`onChangeEnd`]),c=(0,L.useRef)(null);Wr(c);var l=Br(n,i,a,o),u=l[0],d=l[1],f=l[2],p=Tr([`react-colorful`,t]);return L.createElement(`div`,gr({},s,{ref:c,className:p}),L.createElement(Lr,{hsva:u,onChange:d,onChangeEnd:f}),L.createElement(Ir,{hue:u.h,onChange:d,onChangeEnd:f,className:`react-colorful__last-control`}))},Kr={defaultColor:`000`,toHsva:Dr,fromHsva:function(e){return kr({h:e.h,s:e.s,v:e.v,a:1})},equal:zr},qr=function(e){return L.createElement(Gr,gr({},e,{colorModel:Kr}))},Jr={id:`bg-monet-source`,titleKey:`options.monetGroupBackgroundSource`},Yr={id:`bg-monet-layout`,titleKey:`options.monetGroupLayoutPosition`},Xr={id:`bg-monet-filters`,titleKey:`options.monetGroupFiltersPostProcessing`},Zr={id:`bg-monet-tint`,titleKey:`options.monetGroupColorTintWash`},Qr=(e,t,n,r)=>Number.isFinite(e)?Math.min(n,Math.max(t,e)):r,$r=e=>{let t=e.trim().replace(/^#/,``);return/^[0-9a-fA-F]{6}$/.test(t)?`#${t.toLowerCase()}`:null},ei=e=>(0,R.jsx)(`span`,{className:`absolute inset-0`,style:{backgroundImage:e===`full-overlay`?`linear-gradient(var(--st-t3), var(--st-t3))`:`linear-gradient(90deg, var(--st-t3) 30%, transparent 62%)`}}),ti=({t:e,tuning:t=F,onTuningChange:n,monetBackgroundImage:r,onUploadMonetBackgroundImage:a,onClearMonetBackgroundImage:o,isLoadingMonetBackgroundImage:s=!1,onSliderPointerDown:l,onSliderCommit:u})=>{let d=(0,L.useRef)(null),[f,p]=(0,L.useState)(null),m={backgroundSource:t.backgroundSource??F.backgroundSource,backgroundLayout:t.backgroundLayout??F.backgroundLayout,backgroundBlurPx:Qr(t.backgroundBlurPx??F.backgroundBlurPx,0,60,F.backgroundBlurPx),backgroundOverlayOpacity:Qr(t.backgroundOverlayOpacity??F.backgroundOverlayOpacity,0,1,F.backgroundOverlayOpacity),backgroundGrayscale:Qr(t.backgroundGrayscale??F.backgroundGrayscale,0,1,F.backgroundGrayscale),backgroundSaturation:Qr(t.backgroundSaturation??F.backgroundSaturation,0,2,F.backgroundSaturation),backgroundWash:Qr(t.backgroundWash??F.backgroundWash,0,1,F.backgroundWash),backgroundHalfPaneOffsetX:Qr(t.backgroundHalfPaneOffsetX??F.backgroundHalfPaneOffsetX,-40,40,F.backgroundHalfPaneOffsetX),backgroundWashColorMode:t.backgroundWashColorMode??F.backgroundWashColorMode,backgroundWashCustomColor:$r(t.backgroundWashCustomColor)??F.backgroundWashCustomColor,backgroundDriftEnabled:t.backgroundDriftEnabled??F.backgroundDriftEnabled,backgroundDriftStrength:Qr(t.backgroundDriftStrength??F.backgroundDriftStrength,0,1,F.backgroundDriftStrength),backgroundStreaksEnabled:t.backgroundStreaksEnabled??F.backgroundStreaksEnabled},h={onDragStart:l,onDragEnd:u},g=async t=>{let r=Array.from(t.target.files??[]);if(t.target.value=``,p(null),!r.length||!a)return;let i=await a(r);i.ok?(n?.({backgroundSource:`uploaded-global`}),p(r[0].name)):p(i.error||e(`options.monetUploadBackground`))};return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsxs)(S,{def:Jr,children:[(0,R.jsx)(x,{label:e(`options.monetBackgroundSource`),children:(0,R.jsx)(ne,{value:m.backgroundSource,options:[{value:`cover-derived`,label:e(`options.monetBackgroundSourceCover`)},{value:`uploaded-global`,label:e(`options.monetBackgroundSourceUploaded`),disabled:!r&&!s}],onChange:e=>n?.({backgroundSource:e})})}),(0,R.jsxs)(x,{label:e(`options.monetUploadBackground`),hint:f||r?.name||`-`,children:[(0,R.jsx)(y,{icon:i,onClick:()=>d.current?.click(),disabled:s||!a,children:e(`options.monetUploadBackground`)}),(0,R.jsx)(y,{icon:c,onClick:()=>void o?.(),disabled:!r||!o,children:e(`options.monetClearBackground`)}),(0,R.jsx)(`input`,{ref:d,type:`file`,accept:`.png,.jpg,.jpeg,.gif,.webp,.svg,image/*`,className:`hidden`,onChange:e=>void g(e)})]})]}),(0,R.jsxs)(S,{def:Yr,children:[(0,R.jsx)(x,{label:e(`options.monetBackgroundLayout`),below:(0,R.jsx)(ie,{className:`-mx-4`,columns:4,label:e(`options.monetBackgroundLayout`),value:m.backgroundLayout,options:[{value:`half-pane-gradient`,label:e(`options.monetLayoutHalfPane`)},{value:`full-overlay`,label:e(`options.monetLayoutFullOverlay`)}],picture:ei,onChange:e=>n?.({backgroundLayout:e})})}),(0,R.jsx)(D,{when:m.backgroundLayout===`half-pane-gradient`,children:(0,R.jsx)(k,{...h,sub:!0,label:e(`options.monetHalfPaneOffsetX`),value:m.backgroundHalfPaneOffsetX,min:-40,max:40,step:2,format:e=>`${Math.round(e)}%`,onChange:e=>n?.({backgroundHalfPaneOffsetX:e})})}),(0,R.jsx)(j,{label:e(`options.monetBackgroundDriftEnabled`),note:e(`options.monetBackgroundDriftEnabledDesc`),checked:m.backgroundDriftEnabled,onChange:e=>n?.({backgroundDriftEnabled:e})}),(0,R.jsx)(D,{when:m.backgroundDriftEnabled,children:(0,R.jsx)(k,{...h,sub:!0,label:e(`options.monetBackgroundDriftStrength`),value:m.backgroundDriftStrength,min:0,max:1,step:.05,format:E,onChange:e=>n?.({backgroundDriftStrength:e})})})]}),(0,R.jsxs)(S,{def:Xr,children:[(0,R.jsx)(k,{...h,label:e(`options.monetBackgroundBlur`),value:m.backgroundBlurPx,min:0,max:60,step:2,format:e=>`${Math.round(e)}px`,onChange:e=>n?.({backgroundBlurPx:e})}),(0,R.jsx)(k,{...h,label:e(`options.monetBackgroundSaturation`),value:m.backgroundSaturation,min:0,max:2,step:.05,format:E,onChange:e=>n?.({backgroundSaturation:e})}),(0,R.jsx)(k,{...h,label:e(`options.monetBackgroundGrayscale`),value:m.backgroundGrayscale,min:0,max:1,step:.02,format:E,onChange:e=>n?.({backgroundGrayscale:e})})]}),(0,R.jsxs)(S,{def:Zr,children:[(0,R.jsx)(k,{...h,label:e(`options.monetBackgroundOverlayOpacity`),value:m.backgroundOverlayOpacity,min:0,max:1,step:.02,format:E,onChange:e=>n?.({backgroundOverlayOpacity:e})}),(0,R.jsx)(k,{...h,label:e(`options.monetBackgroundWash`),value:m.backgroundWash,min:0,max:1,step:.02,format:E,onChange:e=>n?.({backgroundWash:e})}),(0,R.jsx)(j,{label:e(`options.monetBackgroundStreaksEnabled`),note:e(`options.monetBackgroundStreaksEnabledDesc`),checked:m.backgroundStreaksEnabled,onChange:e=>n?.({backgroundStreaksEnabled:e})}),(0,R.jsx)(x,{label:e(`options.monetBackgroundWashColorMode`),children:(0,R.jsx)(ne,{value:m.backgroundWashColorMode,options:[{value:`theme`,label:e(`options.monetBackgroundWashTheme`)},{value:`custom`,label:e(`options.monetBackgroundWashCustom`)}],onChange:e=>n?.({backgroundWashColorMode:e})})}),(0,R.jsx)(D,{when:m.backgroundWashColorMode===`custom`,children:(0,R.jsxs)(x,{sub:!0,label:e(`options.monetBackgroundWashCustomColor`),below:(0,R.jsx)(qr,{color:m.backgroundWashCustomColor,onChange:e=>n?.({backgroundWashCustomColor:e}),style:{width:`100%`,height:180}}),children:[(0,R.jsx)(`span`,{className:`h-4 w-4 rounded-full shadow-[0_0_0_1px_var(--st-line)]`,style:{backgroundColor:m.backgroundWashCustomColor}}),(0,R.jsx)(ee,{children:m.backgroundWashCustomColor.toUpperCase()})]})})]})]})},ni=new Map,ri=(e,t,n)=>Math.min(n,Math.max(t,e)),ii=({coverUrl:e,monetBackgroundImage:t,tuning:n})=>n.backgroundSource===`uploaded-global`?t?.url??e??null:e??t?.url??null,ai=async e=>{let t=new Image;(e.startsWith(`http://`)||e.startsWith(`https://`))&&(t.crossOrigin=`anonymous`),t.decoding=`async`;let n=new Promise((n,r)=>{t.onload=()=>n(),t.onerror=()=>r(Error(`Failed to load image: ${e}`))});t.src=e;try{await t.decode()}catch{await n}return t},oi=({coverUrl:e,monetBackgroundImage:t,theme:n,tuning:r})=>JSON.stringify({sourceUrl:ii({coverUrl:e,monetBackgroundImage:t,tuning:r}),uploadedId:r.backgroundSource===`uploaded-global`?t?.id??null:null,theme:{backgroundColor:n.backgroundColor,primaryColor:n.primaryColor,accentColor:n.accentColor},tuning:{backgroundSource:r.backgroundSource,backgroundBlurPx:r.backgroundBlurPx,backgroundOverlayOpacity:r.backgroundOverlayOpacity,backgroundGrayscale:r.backgroundGrayscale,backgroundSaturation:r.backgroundSaturation,backgroundWash:r.backgroundWash,backgroundWashColorMode:r.backgroundWashColorMode,backgroundWashCustomColor:r.backgroundWashCustomColor,backgroundStreaksEnabled:r.backgroundStreaksEnabled}}),si=null,ci=()=>{if(si!==null)return si;if(typeof document>`u`)return!1;try{let e=document.createElement(`canvas`);e.width=2,e.height=2;let t=e.getContext(`2d`);return!t||typeof t.filter!=`string`?(si=!1,!1):(t.fillStyle=`#000000`,t.fillRect(0,0,2,2),t.filter=`blur(1px)`,t.fillStyle=`#ffffff`,t.fillRect(0,0,1,1),si=t.getImageData(1,1,1,1).data[0]>0,si)}catch{return si=!1,!1}},li=null,ui=0,di=null,fi=[],pi=()=>{for(;!di&&fi.length>0;){let e=fi.shift();if(!e.wanted()){e.request.image.close(),e.settle(void 0);continue}let t=ui+=1;di={...e,id:t};try{hi().postMessage({...e.request,id:t},{transfer:[e.request.image]})}catch{di=null,e.request.image.close(),e.settle(null)}}},mi=e=>{let t=di;di=null,t?.settle(e),pi()},hi=()=>{if(li)return li;let e=new Worker(new URL(`/folia/assets/monetBackground.worker-BdbhyxNv.js`,``+import.meta.url),{type:`module`});return e.onmessage=e=>{e.data.id===di?.id&&mi(`picture`in e.data?e.data.picture:null)},e.onerror=()=>{e.terminate(),li=null,mi(null)},li=e,e},gi=(e,t)=>new Promise(n=>{fi.push({request:e,wanted:t,settle:n}),pi()}),_i=async({coverUrl:e,monetBackgroundImage:t,theme:n,tuning:r},i)=>{let a=ii({coverUrl:e,monetBackgroundImage:t,tuning:r});if(!a)return null;let o=await gi({image:await createImageBitmap(await ai(a)),colors:{backgroundColor:n.backgroundColor,primaryColor:n.primaryColor,accentColor:n.accentColor},tuning:r,blurPx:ci()?ri(r.backgroundBlurPx,0,60):null},i);if(!o)return o;let s=URL.createObjectURL(o),c=new Image;c.src=s;try{await c.decode()}catch(e){throw URL.revokeObjectURL(s),e}return s},vi=e=>{let t=oi(e),n=ni.get(t);if(!n){let r={url:Promise.resolve(null),holders:0};r.url=_i(e,()=>r.holders>0||(ni.get(t)===r&&ni.delete(t),!1)).then(e=>e??null,()=>null),ni.set(t,r),n=r}let r=n;r.holders+=1;let i=!1;return{url:r.url,release:()=>{i||(i=!0,--r.holders)}}},yi=240,bi=76,xi=156,Si=3.4,Ci=.035,wi=.01,Ti=12.9898,Ei=78.233,Di=39.425,Oi=(e,t)=>(e%t+t)%t,ki=(e,t)=>{let n=Math.sin(e*127.1+t*311.7)*43758.5453;return n-Math.floor(n)},Ai=e=>e*e*(3-2*e),ji=(e,t,n)=>{let r=Math.floor(e),i=ki(Oi(r,t),n);return i+(ki(Oi(r+1,t),n)-i)*Ai(e-r)},Mi=(e,t)=>{let n=ji(e,bi,t),r=ji(e*2,152,t+17.31);return(n*.68+r*.32)*2-1},Ni=e=>{let t=e.reduce((e,t)=>Math.max(e,Math.abs(t)),0);return t>0?e.map(e=>e/t):e},Pi=e=>{let t=Math.min(1,Math.max(0,e)),n=Si*t,r=1+n/100*2+wi,i=Ci*t,a=[],o=[],s=[];for(let e=0;e<=xi;e+=1){let t=bi*e/xi;a.push(Mi(t,Ti)),o.push(Mi(t,Ei)),s.push(Mi(t,Di))}let c=Ni(a),l=Ni(o),u=Ni(s);return{keyframes:c.map((e,t)=>({transform:`translate3d(${(e*n).toFixed(4)}%, ${(l[t]*n).toFixed(4)}%, 0) scale(${(r+i*((u[t]+1)/2)).toFixed(5)})`})),durationMs:yi*1e3,maxTravelPercent:n,minScale:r}},Fi=180,Ii=(e,t,n)=>Math.min(n,Math.max(t,e)),Li=(e,t,n,r)=>{(0,L.useEffect)(()=>{let i=e.current;if(!i||!t||n<=0||typeof i.animate!=`function`||r)return;let a=Pi(n),o=i.animate(a.keyframes,{duration:a.durationMs,iterations:1/0,easing:`linear`});return()=>o.cancel()},[t,e,n,r])},Ri=(e,t,n)=>n.backgroundSource===`uploaded-global`?t?.url??e??null:e??t?.url??null,zi=({coverUrl:e,monetBackgroundImage:t,theme:n,isDaylight:r=!1,tuning:i=F,transparentBackground:a=!1,staticMode:o=!1})=>{let[s,c]=(0,L.useState)(null),[l,u]=(0,L.useState)(!1),d=Ri(e,t,i),f=Dt(),[p,m]=(0,L.useState)(null),h=(0,L.useRef)(null),g=(0,L.useMemo)(()=>`linear-gradient(135deg, ${I(n.accentColor,.22)}, ${I(n.backgroundColor,.96)} 50%, ${I(n.primaryColor,.18)})`,[n]),_=(0,L.useMemo)(()=>`linear-gradient(90deg, ${I(n.backgroundColor,.18)} 0%, ${I(n.backgroundColor,.32)} 34%, ${I(n.backgroundColor,.66)} 70%, ${I(n.backgroundColor,.82)} 100%)`,[n]),v=(0,L.useMemo)(()=>oi({coverUrl:e,monetBackgroundImage:t,theme:n,tuning:i}),[e,t,n,i]);(0,L.useEffect)(()=>{let r=!1,o;if(!d||a)return c(null),u(!1),f(),()=>{r=!0};u(!0);let s={coverUrl:e,monetBackgroundImage:t,theme:n,tuning:i},l=d===h.current?null:vi(s),p=null;return o=window.setTimeout(()=>{p=vi(s),p.url.then(e=>{r||(c(t=>t===e?t:e),u(!1),h.current=d,e&&m(t=>t??e),f())})},Fi),()=>{r=!0,o!==void 0&&window.clearTimeout(o),l?.release(),p?.release()}},[v,d,a,f]);let y=(0,L.useRef)(null),x=Ii(i.backgroundDriftStrength??0,0,1),S=!!i.backgroundDriftEnabled&&!o&&x>0;Li(y,S,x,ge(`monetBackground`));let C=(0,L.useMemo)(()=>S?{willChange:`transform`}:void 0,[S]),w=(0,L.useMemo)(()=>ci(),[])?0:i.backgroundBlurPx,T=(0,L.useMemo)(()=>w<=0?{}:{filter:`blur(${w}px)`,WebkitFilter:`blur(${w}px)`,transform:`scale(1.1) translateZ(0)`},[w]);if(a)return null;let E=s?`url(${s})`:d?`linear-gradient(135deg, ${I(n.accentColor,.2)}, ${I(n.backgroundColor,.78)}), url(${d})`:g,D=l?{[Tt]:``}:{},O=s||d||`fallback`,k=O!==p&&{opacity:0};if(i.backgroundLayout===`full-overlay`)return(0,R.jsxs)(`div`,{className:`absolute inset-0 z-0 overflow-hidden`,...D,children:[(0,R.jsx)(`div`,{ref:y,className:`absolute inset-0`,style:C,children:(0,R.jsx)(b,{initial:!1,children:(0,R.jsx)(fe.div,{initial:k,animate:{opacity:1},exit:{opacity:0},transition:{duration:.8,ease:`easeInOut`},className:`absolute inset-0`,style:{backgroundColor:n.backgroundColor,backgroundImage:E,backgroundSize:`cover`,backgroundPosition:`center`,...T}},O)})}),(0,R.jsx)(`div`,{className:`absolute inset-0`,style:{background:_}})]});let A=(r?.7:.3)+Ii(i.backgroundOverlayOpacity,0,1)*.16,ee=Ii(50+i.backgroundHalfPaneOffsetX,10,90);return(0,R.jsxs)(`div`,{className:`absolute inset-0 z-0 overflow-hidden`,...D,children:[(0,R.jsx)(`div`,{className:`absolute inset-0`,style:{backgroundColor:n.backgroundColor,backgroundImage:g}}),(0,R.jsx)(b,{initial:!1,children:s||d?(0,R.jsx)(`div`,{className:`absolute inset-y-0 left-0 w-[72%] sm:w-[68%] lg:w-[60%] overflow-hidden`,style:{WebkitMaskImage:`linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.94) 48%, rgba(0,0,0,0.46) 74%, rgba(0,0,0,0) 100%)`,maskImage:`linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.94) 48%, rgba(0,0,0,0.46) 74%, rgba(0,0,0,0) 100%)`},children:(0,R.jsx)(`div`,{ref:y,className:`absolute inset-0`,style:C,children:(0,R.jsx)(fe.div,{initial:k,animate:{opacity:A},exit:{opacity:0},transition:{duration:.8,ease:`easeInOut`},className:`absolute inset-0`,style:{backgroundImage:E,backgroundRepeat:`no-repeat`,backgroundSize:`cover`,backgroundPosition:`${ee}% center`,...T}},O)})}):null}),(0,R.jsx)(`div`,{className:`absolute inset-0`,style:{background:`linear-gradient(90deg, ${I(n.backgroundColor,.14)} 0%, ${I(n.backgroundColor,.28)} 28%, ${I(n.backgroundColor,.62)} 64%, ${I(n.backgroundColor,.86)} 100%)`}}),(0,R.jsx)(`div`,{className:`absolute inset-0`,style:{backgroundImage:`radial-gradient(circle at 18% 34%, ${I(n.accentColor,.18)}, transparent 36%)`,backgroundSize:`cover`,backgroundPosition:`center`}}),(0,R.jsx)(`div`,{className:`absolute inset-0`,style:{background:_}})]})},Bi=e({default:()=>Ui}),Vi={"cover-derived":`options.monetBackgroundSourceCover`,"uploaded-global":`options.monetBackgroundSourceUploaded`},Hi=e=>e&&g(e),Ui=xt({mode:`monet`,order:20,labelKey:`options.visualizerBackgroundModeMonet`,labelFallback:`Monet`,glyph:(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(`rect`,{x:`3.5`,y:`4.5`,width:`17`,height:`15`,rx:`2`}),(0,R.jsx)(`path`,{d:`M20.5 8.5L8 19.5`,opacity:`0.55`})]}),song:({config:e,coverUrl:t})=>[Ri(Hi(t),e?.customImage,e?.monet?.tuning??F)],render:({config:e,coverUrl:t,theme:n,isDaylight:r,staticMode:i})=>(0,R.jsx)(zi,{coverUrl:Hi(t),monetBackgroundImage:e?.customImage,theme:n,isDaylight:r,tuning:e?.monet?.tuning,transparentBackground:e?.transparent,staticMode:i}),renderSettingsPanel:({config:e,actions:t,t:n,onSliderPointerDown:r,onSliderCommit:i})=>(0,R.jsx)(ti,{t:n,tuning:e?.monet?.tuning??F,onTuningChange:t?.monet?.onTuningChange,monetBackgroundImage:e?.customImage,onUploadMonetBackgroundImage:t?.customImage?.onUpload,onClearMonetBackgroundImage:t?.customImage?.onClear,isLoadingMonetBackgroundImage:t?.customImage?.isLoading,onSliderPointerDown:r,onSliderCommit:i}),renderQuickControls:({config:e,actions:t,t:n})=>{let r=e?.monet?.tuning??F,i=r.backgroundLayout===`full-overlay`,a=n(i?`options.monetLayoutFullOverlay`:`options.monetLayoutHalfPane`),o=e=>t?.monet?.onTuningChange?.(e),s=r.backgroundSource,c=n(Vi[s]),d=!!e?.customImage;return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(M,{label:a,title:`${n(`options.monetBackgroundLayout`)}: ${a}`,onClick:()=>o({backgroundLayout:i?`half-pane-gradient`:`full-overlay`})}),(0,R.jsx)(M,{label:c,title:`${n(`options.monetBackgroundSource`)}: ${c}`,disabled:!d&&s===`cover-derived`,onClick:()=>o({backgroundSource:d&&s===`cover-derived`?`uploaded-global`:`cover-derived`})}),(0,R.jsx)(C,{active:r.backgroundStreaksEnabled,label:n(`options.monetBackgroundStreaksEnabled`),onToggle:()=>o({backgroundStreaksEnabled:!r.backgroundStreaksEnabled}),children:(0,R.jsx)(l,{size:14})}),(0,R.jsx)(C,{active:r.backgroundDriftEnabled,label:n(`options.monetBackgroundDriftEnabled`),onToggle:()=>o({backgroundDriftEnabled:!r.backgroundDriftEnabled}),children:(0,R.jsx)(u,{size:14})})]})},resetSettings:e=>e?.monet?.onResetTuning?.()}),Wi=1.8,Gi=.01,Ki=16/9,qi={fiberSize:.2,crumples:.35,crumpleSize:.35,folds:.65,foldCount:5,drops:.2,seed:5.8},Ji={perspective:.4,count:20,focusCenter:.55,focusEdges:.8,swirl:.08,lensCircle:.1},Yi=e=>Math.min(1,Math.max(0,e)),Xi=e=>Math.min(Wi,Math.max(1,e)),Zi=e=>e<=1?1:Xi(e+Gi),Qi=e=>Zi(1/(1-2*Math.min(Math.max(e,0),.45))),$i=(e,t,n)=>n&&!t?!e:e,ea=(e,t,n)=>$i(!e,t,n),ta=(e,t)=>{let{folds:n,crumples:r,drops:i}=qi;return Qi(.02*(2*n+1.5*r+.2*i+.75*Yi(e)+.1*Yi(t)))},na=(e,t)=>{let n=.5*Math.hypot(Ki,1),r=Yi(t),i=.7*r**(1.3+2.7*r)*(1-Ji.focusEdges),a=Math.max(.35,1-i/n);if(e<=0)return Zi(1/a);let o=Math.min(e,1)*1.4,s=e=>{let t=2*n/e;return Math.tan(t*o)/Math.tan(o)/t},c=Math.max(1,2*n*o/1.45);if(c>=Wi||s(Wi)>Wi*a)return Wi;if(c===1&&s(1)<=a)return Zi(1/a);let l=Wi;for(let e=0;e<32;e+=1){let e=(c+l)/2;s(e)>e*a?c=e:l=e}return Zi(l)},ra=(e,t)=>{let n=Dt();(0,L.useEffect)(()=>{if(t===null){n();return}let r=0,i=()=>{r=requestAnimationFrame(e.current?.paperShaderMount?n:i)};return i(),()=>cancelAnimationFrame(r)},[e,t,n])},ia=(e,t,n)=>n.imageSource===`uploaded-global`?t?.url??e:e??t?.url,aa=L.memo(({coverUrl:e,monetBackgroundImage:t,tuning:n,theme:r,isDaylight:i})=>{let a={...ze,...n},o=ia(e,t,a),s=(0,L.useRef)(null);return ra(s,o?`${o}:${a.effect}`:null),o?(0,R.jsxs)(`div`,{className:`absolute inset-0 z-0 overflow-hidden`,style:{backgroundColor:r.backgroundColor,pointerEvents:`none`},children:[(()=>{let e={width:`100%`,height:`100%`,ref:s,image:o,fit:`cover`,minPixelRatio:1,maxPixelCount:2073600,webGlContextAttributes:Hn,style:{width:`100%`,height:`100%`}};switch(a.effect){case`fluted-glass`:return(0,R.jsx)(Dn,{...e,colorBack:r.backgroundColor,colorShadow:r.secondaryColor,colorHighlight:r.primaryColor,shadows:.25,size:a.flutedGlassSize,distortion:a.flutedGlassDistortion,blur:a.flutedGlassBlur,shape:`lines`,distortionShape:`prism`,highlights:.1,edges:.25},`${o}:fluted-glass`);case`paper-texture`:return(0,R.jsx)(En,{...e,...qi,colorFront:r.accentColor,colorBack:r.backgroundColor,contrast:a.paperTextureContrast,roughness:a.paperTextureRoughness,fiber:a.paperTextureFiber,scale:ta(a.paperTextureRoughness,a.paperTextureFiber)},`${o}:paper-texture`);case`halftone-dots`:return(0,R.jsx)(An,{...e,colorBack:r.backgroundColor,colorFront:r.accentColor,size:a.halftoneDotsSize,radius:a.halftoneDotsRadius,contrast:a.halftoneDotsContrast,originalColors:a.halftoneDotsOriginalColors,inverted:ea(a.halftoneDotsInverted,a.halftoneDotsOriginalColors,i),grid:`hex`,type:`gooey`,grainMixer:.12,grainOverlay:.06,grainSize:.5},`${o}:halftone-dots`);case`lens-distortion`:return(0,R.jsx)(kn,{...e,...Ji,spread:a.lensDistortionSpread,dispersion:a.lensDistortionDispersion,lensBulge:a.lensDistortionBulge,scale:na(a.lensDistortionBulge,a.lensDistortionSpread)},`${o}:lens-distortion`);default:return(0,R.jsx)(On,{...e,colorBack:r.backgroundColor,colorFront:r.accentColor,colorHighlight:r.primaryColor,originalColors:a.originalColors,inverted:$i(a.inverted,a.originalColors,i),type:a.ditheringType,size:a.size,colorSteps:a.colorSteps},`${o}:dithering`)}})(),a.overlayEnabled&&a.overlayOpacity>0&&(0,R.jsx)(`div`,{className:`absolute inset-0`,style:{backgroundColor:r.backgroundColor,opacity:a.overlayOpacity}})]}):(0,R.jsx)(`div`,{className:`absolute inset-0 z-0`,style:{backgroundColor:r.backgroundColor}})}),oa=[`2x2`,`4x4`,`8x8`],sa=({t:e,tuning:t,onTuningChange:n,onSliderPointerDown:r,onSliderCommit:i})=>{let a={onDragStart:r,onDragEnd:i};return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(x,{label:e(`options.nomandBackgroundDitheringType`),children:(0,R.jsx)(ne,{value:t.ditheringType,options:oa.map(e=>({value:e,label:e})),onChange:e=>n?.({ditheringType:e})})}),(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundSize`),value:t.size,min:.5,max:20,step:.5,format:e=>e.toFixed(1),onChange:e=>n?.({size:e})}),(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundColorSteps`),value:t.colorSteps,min:1,max:7,step:1,format:e=>String(Math.round(e)),onChange:e=>n?.({colorSteps:e})}),(0,R.jsx)(j,{label:e(`options.nomandBackgroundOriginalColors`),checked:t.originalColors,onChange:e=>n?.({originalColors:e})}),(0,R.jsx)(j,{label:e(`options.nomandBackgroundInverted`),checked:t.inverted,onChange:e=>n?.({inverted:e})})]})},ca=e=>e.toFixed(2),la=({t:e,tuning:t,onTuningChange:n,onSliderPointerDown:r,onSliderCommit:i})=>{let a={onDragStart:r,onDragEnd:i};return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundFlutedGlassSize`),value:t.flutedGlassSize,min:.1,max:1,step:.05,format:ca,onChange:e=>n?.({flutedGlassSize:e})}),(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundFlutedGlassDistortion`),value:t.flutedGlassDistortion,min:0,max:1,step:.05,format:E,onChange:e=>n?.({flutedGlassDistortion:e})}),(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundFlutedGlassBlur`),value:t.flutedGlassBlur,min:0,max:1,step:.01,format:E,onChange:e=>n?.({flutedGlassBlur:e})})]})},ua=({t:e,tuning:t,onTuningChange:n,onSliderPointerDown:r,onSliderCommit:i})=>{let a={onDragStart:r,onDragEnd:i};return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundHalftoneDotsSize`),value:t.halftoneDotsSize,min:.1,max:1,step:.05,format:ca,onChange:e=>n?.({halftoneDotsSize:e})}),(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundHalftoneDotsRadius`),value:t.halftoneDotsRadius,min:.1,max:2,step:.05,format:ca,onChange:e=>n?.({halftoneDotsRadius:e})}),(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundHalftoneDotsContrast`),value:t.halftoneDotsContrast,min:0,max:1,step:.05,format:E,onChange:e=>n?.({halftoneDotsContrast:e})}),(0,R.jsx)(j,{label:e(`options.nomandBackgroundOriginalColors`),checked:t.halftoneDotsOriginalColors,onChange:e=>n?.({halftoneDotsOriginalColors:e})}),(0,R.jsx)(j,{label:e(`options.nomandBackgroundInverted`),checked:t.halftoneDotsInverted,onChange:e=>n?.({halftoneDotsInverted:e})})]})},da=({t:e,tuning:t,onTuningChange:n,onSliderPointerDown:r,onSliderCommit:i})=>{let a={onDragStart:r,onDragEnd:i};return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundLensDistortionSpread`),value:t.lensDistortionSpread,min:0,max:1,step:.05,format:E,onChange:e=>n?.({lensDistortionSpread:e})}),(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundLensDistortionBulge`),value:t.lensDistortionBulge,min:-1,max:1,step:.05,format:ca,onChange:e=>n?.({lensDistortionBulge:e})}),(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundLensDistortionDispersion`),value:t.lensDistortionDispersion,min:0,max:1,step:.05,format:E,onChange:e=>n?.({lensDistortionDispersion:e})})]})},fa=({t:e,tuning:t,onTuningChange:n,onSliderPointerDown:r,onSliderCommit:i})=>{let a={onDragStart:r,onDragEnd:i};return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundPaperTextureContrast`),value:t.paperTextureContrast,min:0,max:1,step:.01,format:E,onChange:e=>n?.({paperTextureContrast:e})}),(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundPaperTextureRoughness`),value:t.paperTextureRoughness,min:0,max:1,step:.01,format:E,onChange:e=>n?.({paperTextureRoughness:e})}),(0,R.jsx)(k,{...a,label:e(`options.nomandBackgroundPaperTextureFiber`),value:t.paperTextureFiber,min:0,max:1,step:.05,format:E,onChange:e=>n?.({paperTextureFiber:e})})]})},pa={id:`bg-nomand-effect`,titleKey:`options.nomandBackgroundEffect`},ma=[`dithering`,`fluted-glass`,`paper-texture`,`halftone-dots`,`lens-distortion`],ha={dithering:`options.nomandBackgroundEffectDithering`,"fluted-glass":`options.nomandBackgroundEffectFlutedGlass`,"paper-texture":`options.nomandBackgroundEffectPaperTexture`,"halftone-dots":`options.nomandBackgroundEffectHalftoneDots`,"lens-distortion":`options.nomandBackgroundEffectLensDistortion`},ga={dithering:{backgroundImage:`conic-gradient(var(--st-t2) 25%, transparent 0 50%, var(--st-t2) 0 75%, transparent 0)`,backgroundSize:`8px 8px`},"fluted-glass":{backgroundImage:`repeating-linear-gradient(90deg, transparent 0 2px, var(--st-t2) 5px, transparent 8px)`},"paper-texture":{backgroundImage:`repeating-linear-gradient(37deg, transparent 0 3px, var(--st-t3) 3px 4px), repeating-linear-gradient(-58deg, transparent 0 5px, var(--st-t3) 5px 6px)`},"halftone-dots":{backgroundImage:`radial-gradient(var(--st-t2) 32%, transparent 36%)`,backgroundSize:`8px 8px`},"lens-distortion":{backgroundImage:`radial-gradient(circle at 50% 50%, transparent 0 22%, var(--st-t2) 24% 28%, transparent 30% 46%, var(--st-t3) 48% 52%, transparent 54%)`}},_a=e=>(0,R.jsx)(`span`,{className:`absolute inset-0`,style:ga[e]}),va=e=>{let{t,tuning:n}=e;return(0,R.jsxs)(S,{def:pa,children:[(0,R.jsx)(x,{below:(0,R.jsx)(ie,{className:`-mx-4`,columns:3,label:t(`options.nomandBackgroundEffect`),value:n.effect,options:ma.map(e=>({value:e,label:t(ha[e])})),picture:_a,onChange:t=>e.onTuningChange?.({effect:t})})}),n.effect===`dithering`&&(0,R.jsx)(sa,{...e}),n.effect===`fluted-glass`&&(0,R.jsx)(la,{...e}),n.effect===`paper-texture`&&(0,R.jsx)(fa,{...e}),n.effect===`halftone-dots`&&(0,R.jsx)(ua,{...e}),n.effect===`lens-distortion`&&(0,R.jsx)(da,{...e})]})},ya={id:`bg-nomand`,titleKey:`options.nomandBackgroundSettings`},ba=({t:e,tuning:t,onTuningChange:n,monetBackgroundImage:r,onUploadMonetBackgroundImage:i,onClearMonetBackgroundImage:a,isLoadingMonetBackgroundImage:o=!1,onSliderPointerDown:s,onSliderCommit:l})=>{let u={...ze,...t},f=(0,L.useRef)(null),[p,m]=(0,L.useState)(``),h=e=>{n?.({imageSource:e})},g=async t=>{if(!t.length||!i)return;let n=await i(t);m(n.ok?e(`options.nomandBackgroundUploadSuccess`):n.error??e(`options.nomandBackgroundUploadFailed`)),n.ok&&h(`uploaded-global`)};return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsxs)(S,{def:ya,children:[(0,R.jsx)(x,{label:e(`options.nomandBackgroundSource`),children:(0,R.jsx)(ne,{value:u.imageSource,options:[{value:`cover-derived`,label:e(`options.monetBackgroundSourceCover`)},{value:`uploaded-global`,label:e(`options.monetBackgroundSourceUploaded`),disabled:!r&&!o}],onChange:h})}),(0,R.jsxs)(x,{label:e(`options.monetUploadBackground`),hint:p||r?.name||`-`,children:[(0,R.jsx)(y,{icon:d,disabled:o||!i,onClick:()=>f.current?.click(),children:e(`options.monetUploadBackground`)}),(0,R.jsx)(y,{icon:c,disabled:!r||!a,onClick:()=>void a?.(),children:e(`options.monetClearBackground`)}),(0,R.jsx)(`input`,{ref:f,type:`file`,accept:`image/png,image/jpeg,image/webp,image/gif`,className:`hidden`,onChange:e=>{g(Array.from(e.target.files??[])),e.target.value=``}})]}),(0,R.jsx)(j,{label:e(`options.nomandBackgroundOverlay`),note:e(`options.nomandBackgroundOverlayDesc`),checked:u.overlayEnabled,onChange:e=>n?.({overlayEnabled:e})}),(0,R.jsx)(D,{when:u.overlayEnabled,children:(0,R.jsx)(k,{sub:!0,label:e(`options.nomandBackgroundOverlayOpacity`),value:u.overlayOpacity,min:0,max:1,step:.05,format:E,onChange:e=>n?.({overlayOpacity:e}),onDragStart:s,onDragEnd:l})})]}),(0,R.jsx)(va,{t:e,tuning:u,onTuningChange:n,onSliderPointerDown:s,onSliderCommit:l})]})},xa=e({default:()=>wa}),Sa={"cover-derived":`options.monetBackgroundSourceCover`,"uploaded-global":`options.monetBackgroundSourceUploaded`},Ca=e=>e&&g(e),wa=xt({mode:`nomand`,order:30,labelKey:`options.visualizerBackgroundModeNomand`,labelFallback:`Nomand`,glyph:(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(`rect`,{x:`4`,y:`4`,width:`6.5`,height:`6.5`,rx:`0.8`}),(0,R.jsx)(`rect`,{x:`13.5`,y:`4`,width:`6.5`,height:`6.5`,rx:`0.8`,opacity:`0.45`}),(0,R.jsx)(`rect`,{x:`4`,y:`13.5`,width:`6.5`,height:`6.5`,rx:`0.8`,opacity:`0.45`}),(0,R.jsx)(`rect`,{x:`13.5`,y:`13.5`,width:`6.5`,height:`6.5`,rx:`0.8`})]}),command:{title:`Background: Nomand`,description:`Switch background to theme-colored image dithering`,keywords:[`nomand`,`dithering`,`dither`,`shader background`,`漫游`,`像素画`,`像素画背景`,`抖动背景`,`网点背景`,`主题色背景`]},song:({config:e,coverUrl:t})=>[ia(Ca(t),e?.customImage,{...ze,...e?.nomand?.tuning})??null],render:({config:e,coverUrl:t,theme:n,isDaylight:r})=>(0,R.jsx)(aa,{coverUrl:Ca(t),monetBackgroundImage:e?.customImage,tuning:e?.nomand?.tuning,theme:n,isDaylight:r}),renderSettingsPanel:({config:e,actions:t,...n})=>(0,R.jsx)(ba,{...n,tuning:e?.nomand?.tuning??ze,onTuningChange:t?.nomand?.onTuningChange,monetBackgroundImage:e?.customImage,onUploadMonetBackgroundImage:t?.customImage?.onUpload,onClearMonetBackgroundImage:t?.customImage?.onClear,isLoadingMonetBackgroundImage:t?.customImage?.isLoading}),renderQuickControls:({config:e,actions:t,t:n})=>{let r=e?.nomand?.tuning??ze,i=e=>t?.nomand?.onTuningChange?.(e),a=r.imageSource,o=n(Sa[a]),s=!!e?.customImage,c=n(ha[r.effect]);return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(M,{label:o,title:`${n(`options.nomandBackgroundSource`)}: ${o}`,disabled:!s&&a===`cover-derived`,onClick:()=>i({imageSource:s&&a===`cover-derived`?`uploaded-global`:`cover-derived`})}),(0,R.jsx)(M,{label:c,title:`${n(`options.nomandBackgroundEffect`)}: ${c}`,onClick:()=>i({effect:O(ma,r.effect)})}),(0,R.jsx)(C,{active:r.overlayEnabled,label:n(`options.nomandBackgroundOverlay`),onToggle:()=>i({overlayEnabled:!r.overlayEnabled}),children:(0,R.jsx)(p,{size:14})})]})},resetSettings:e=>e?.nomand?.onResetTuning?.()}),Ta=5120,Ea=5121,Da=5122,Oa=5123,ka=5124,Aa=5125,ja=5126,Ma=32819,Na=32820,Pa=33635,Fa=5131,Ia=33640,La=35899,Ra=35902,za=36269,Ba=34042,Va={};{let e=Va;e[Ta]=Int8Array,e[Ea]=Uint8Array,e[Da]=Int16Array,e[Oa]=Uint16Array,e[ka]=Int32Array,e[Aa]=Uint32Array,e[ja]=Float32Array,e[Ma]=Uint16Array,e[Na]=Uint16Array,e[Pa]=Uint16Array,e[Fa]=Uint16Array,e[Ia]=Uint32Array,e[La]=Uint32Array,e[Ra]=Uint32Array,e[za]=Uint32Array,e[Ba]=Uint32Array}function Ha(e){if(e instanceof Int8Array)return Ta;if(e instanceof Uint8Array||e instanceof Uint8ClampedArray)return Ea;if(e instanceof Int16Array)return Da;if(e instanceof Uint16Array)return Oa;if(e instanceof Int32Array)return ka;if(e instanceof Uint32Array)return Aa;if(e instanceof Float32Array)return ja;throw Error(`unsupported typed array type`)}function Ua(e){if(e===Int8Array)return Ta;if(e===Uint8Array||e===Uint8ClampedArray)return Ea;if(e===Int16Array)return Da;if(e===Uint16Array)return Oa;if(e===Int32Array)return ka;if(e===Uint32Array)return Aa;if(e===Float32Array)return ja;throw Error(`unsupported typed array type`)}function Wa(e){let t=Va[e];if(!t)throw Error(`unknown gl type`);return t}var Ga=typeof SharedArrayBuffer<`u`?function(e){return e&&e.buffer&&(e.buffer instanceof ArrayBuffer||e.buffer instanceof SharedArrayBuffer)}:function(e){return e&&e.buffer&&e.buffer instanceof ArrayBuffer};function Ka(...e){console.error(...e)}function qa(...e){console.warn(...e)}var Ja=new Map;function Ya(e,t){if(!e||typeof e!=`object`)return!1;let n=Ja.get(t);n||(n=new WeakMap,Ja.set(t,n));let r=n.get(e);if(r===void 0){let i=Object.prototype.toString.call(e);r=i.substring(8,i.length-1)===t,n.set(e,r)}return r}function Xa(e,t){return typeof WebGLBuffer<`u`&&Ya(t,`WebGLBuffer`)}function Za(e,t){return typeof WebGLTexture<`u`&&Ya(t,`WebGLTexture`)}var Qa=35044,$a=34962,eo=34963,to=34660,no=5120,ro=5121,io=5122,ao=5123,oo=5124,so=5125,co=5126,lo={attribPrefix:``};function uo(e,t,n,r,i){e.bindBuffer(t,n),e.bufferData(t,r,i||Qa)}function fo(e,t,n,r){if(Xa(e,t))return t;n||=$a;let i=e.createBuffer();return uo(e,n,i,t,r),i}function po(e){return e===`indices`}function mo(e){return e===Int8Array||e===Uint8Array}function ho(e){return e.length?e:e.data}var go=/coord|texture/i,_o=/color|colour/i;function vo(e,t){let n;if(n=go.test(e)?2:_o.test(e)?4:3,t%n>0)throw Error(`Can not guess numComponents for attribute '${e}'. Tried ${n} but ${t} values is not evenly divisible by ${n}. You should specify it.`);return n}function yo(e,t,n){return e.numComponents||e.size||vo(t,n||ho(e).length)}function bo(e,t){if(Ga(e))return e;if(Ga(e.data))return e.data;Array.isArray(e)&&(e={data:e});let n=e.type?So(e.type):void 0;return n||=po(t)?Uint16Array:Float32Array,new n(e.data)}function xo(e){return typeof e==`number`?e:e?Ua(e):co}function So(e){return typeof e==`number`?Wa(e):e||Float32Array}function Co(e,t){return{buffer:t.buffer,numValues:24,type:xo(t.type),arrayType:So(t.type)}}function wo(e,t){let n=t.data||t,r=So(t.type),i=n*r.BYTES_PER_ELEMENT,a=e.createBuffer();return e.bindBuffer($a,a),e.bufferData($a,i,t.drawType||Qa),{buffer:a,numValues:n,type:Ua(r),arrayType:r}}function To(e,t,n){let r=bo(t,n);return{arrayType:r.constructor,buffer:fo(e,r,void 0,t.drawType),type:Ha(r),numValues:0}}function Eo(e,t){let n={};return Object.keys(t).forEach(function(r){if(!po(r)){let i=t[r],a=i.attrib||i.name||i.attribName||lo.attribPrefix+r;if(i.value){if(!Array.isArray(i.value)&&!Ga(i.value))throw Error(`array.value is not array or typedarray`);n[a]={value:i.value}}else{let t;t=i.buffer&&i.buffer instanceof WebGLBuffer?Co:typeof i==`number`||typeof i.data==`number`?wo:To;let{buffer:o,type:s,numValues:c,arrayType:l}=t(e,i,r),u=i.normalize===void 0?mo(l):i.normalize,d=yo(i,r,c);n[a]={buffer:o,numComponents:d,type:s,normalize:u,stride:i.stride||0,offset:i.offset||0,divisor:i.divisor===void 0?void 0:i.divisor,drawType:i.drawType}}}}),e.bindBuffer($a,null),n}function Do(e,t){return t===no||t===ro?1:t===io||t===ao?2:t===oo||t===so||t===co?4:0}var Oo=[`position`,`positions`,`a_position`];function ko(e,t){let n,r=0;for(;r<Oo.length&&(n=Oo[r],!(n in t||(n=lo.attribPrefix+n,n in t)));++r);r===Oo.length&&(n=Object.keys(t)[0]);let i=t[n];if(!i.buffer)return 1;e.bindBuffer($a,i.buffer);let a=e.getBufferParameter($a,to);e.bindBuffer($a,null);let o=a/Do(e,i.type),s=i.numComponents||i.size,c=o/s;if(c%1!=0)throw Error(`numComponents ${s} not correct for length ${length}`);return c}function Ao(e,t,n){let r=Eo(e,t),i=Object.assign({},n||{});i.attribs=Object.assign({},n?n.attribs:{},r);let a=t.indices;if(a){let t=bo(a,`indices`);i.indices=fo(e,t,eo),i.numElements=t.length,i.elementType=Ha(t)}else i.numElements||=ko(e,i.attribs);return i}function jo(e){return!!e.texStorage2D}var Mo=function(){let e={},t={};function n(n){let r=n.constructor.name;if(!e[r]){for(let e in n)if(typeof n[e]==`number`){let r=t[n[e]];t[n[e]]=r?`${r} | ${e}`:e}e[r]=!0}}return function(e,r){return n(e),t[r]||(typeof r==`number`?`0x${r.toString(16)}`:r)}}();new Uint8Array([128,192,255,255]);var No=6406,Po=6407,Fo=6408,Io=6409,Lo=6410,Ro=6402,zo=34041,Bo=33319,Vo=33320,Ho=6403,Uo=36244,Wo=36248,Go=36249,Ko={};{let e=Ko;e[No]={numColorComponents:1},e[Io]={numColorComponents:1},e[Lo]={numColorComponents:2},e[Po]={numColorComponents:3},e[Fo]={numColorComponents:4},e[Ho]={numColorComponents:1},e[Uo]={numColorComponents:1},e[Bo]={numColorComponents:2},e[Vo]={numColorComponents:2},e[Po]={numColorComponents:3},e[Wo]={numColorComponents:3},e[Fo]={numColorComponents:4},e[Go]={numColorComponents:4},e[Ro]={numColorComponents:1},e[zo]={numColorComponents:2}}var qo=Ka;function Jo(e){return typeof document<`u`&&document.getElementById?document.getElementById(e):null}var Yo=33984,Xo=34962,Zo=34963,Qo=35713,$o=35714,es=35632,ts=35633,ns=35981,rs=35718,is=35721,as=35971,os=35382,ss=35396,cs=35398,ls=35392,us=35395,ds=5126,fs=35664,ps=35665,ms=35666,hs=5124,gs=35667,_s=35668,vs=35669,ys=35670,bs=35671,xs=35672,Ss=35673,Cs=35674,ws=35675,Ts=35676,Es=35678,Ds=35680,Os=35679,ks=35682,As=35685,js=35686,Ms=35687,Ns=35688,Ps=35689,Fs=35690,Is=36289,Ls=36292,Rs=36293,zs=5125,Bs=36294,Vs=36295,Hs=36296,Us=36298,Ws=36299,Gs=36300,Ks=36303,qs=36306,Js=36307,Ys=36308,Xs=36311,Zs=3553,Qs=34067,$s=32879,ec=35866,Y={};function tc(e,t){return Y[t].bindPoint}function nc(e,t){return function(n){e.uniform1f(t,n)}}function rc(e,t){return function(n){e.uniform1fv(t,n)}}function ic(e,t){return function(n){e.uniform2fv(t,n)}}function ac(e,t){return function(n){e.uniform3fv(t,n)}}function oc(e,t){return function(n){e.uniform4fv(t,n)}}function sc(e,t){return function(n){e.uniform1i(t,n)}}function cc(e,t){return function(n){e.uniform1iv(t,n)}}function lc(e,t){return function(n){e.uniform2iv(t,n)}}function uc(e,t){return function(n){e.uniform3iv(t,n)}}function dc(e,t){return function(n){e.uniform4iv(t,n)}}function fc(e,t){return function(n){e.uniform1ui(t,n)}}function pc(e,t){return function(n){e.uniform1uiv(t,n)}}function mc(e,t){return function(n){e.uniform2uiv(t,n)}}function hc(e,t){return function(n){e.uniform3uiv(t,n)}}function gc(e,t){return function(n){e.uniform4uiv(t,n)}}function _c(e,t){return function(n){e.uniformMatrix2fv(t,!1,n)}}function vc(e,t){return function(n){e.uniformMatrix3fv(t,!1,n)}}function yc(e,t){return function(n){e.uniformMatrix4fv(t,!1,n)}}function bc(e,t){return function(n){e.uniformMatrix2x3fv(t,!1,n)}}function xc(e,t){return function(n){e.uniformMatrix3x2fv(t,!1,n)}}function Sc(e,t){return function(n){e.uniformMatrix2x4fv(t,!1,n)}}function Cc(e,t){return function(n){e.uniformMatrix4x2fv(t,!1,n)}}function wc(e,t){return function(n){e.uniformMatrix3x4fv(t,!1,n)}}function Tc(e,t){return function(n){e.uniformMatrix4x3fv(t,!1,n)}}function X(e,t,n,r){let i=tc(e,t);return jo(e)?function(t){let a,o;!t||Za(e,t)?(a=t,o=null):(a=t.texture,o=t.sampler),e.uniform1i(r,n),e.activeTexture(Yo+n),e.bindTexture(i,a),e.bindSampler(n,o)}:function(t){e.uniform1i(r,n),e.activeTexture(Yo+n),e.bindTexture(i,t)}}function Z(e,t,n,r,i){let a=tc(e,t),o=new Int32Array(i);for(let e=0;e<i;++e)o[e]=n+e;return jo(e)?function(t){e.uniform1iv(r,o),t.forEach(function(t,r){e.activeTexture(Yo+o[r]);let i,s;!t||Za(e,t)?(i=t,s=null):(i=t.texture,s=t.sampler),e.bindSampler(n,s),e.bindTexture(a,i)})}:function(t){e.uniform1iv(r,o),t.forEach(function(t,n){e.activeTexture(Yo+o[n]),e.bindTexture(a,t)})}}Y[ds]={Type:Float32Array,size:4,setter:nc,arraySetter:rc},Y[fs]={Type:Float32Array,size:8,setter:ic,cols:2},Y[ps]={Type:Float32Array,size:12,setter:ac,cols:3},Y[ms]={Type:Float32Array,size:16,setter:oc,cols:4},Y[hs]={Type:Int32Array,size:4,setter:sc,arraySetter:cc},Y[gs]={Type:Int32Array,size:8,setter:lc,cols:2},Y[_s]={Type:Int32Array,size:12,setter:uc,cols:3},Y[vs]={Type:Int32Array,size:16,setter:dc,cols:4},Y[zs]={Type:Uint32Array,size:4,setter:fc,arraySetter:pc},Y[Bs]={Type:Uint32Array,size:8,setter:mc,cols:2},Y[Vs]={Type:Uint32Array,size:12,setter:hc,cols:3},Y[Hs]={Type:Uint32Array,size:16,setter:gc,cols:4},Y[ys]={Type:Uint32Array,size:4,setter:sc,arraySetter:cc},Y[bs]={Type:Uint32Array,size:8,setter:lc,cols:2},Y[xs]={Type:Uint32Array,size:12,setter:uc,cols:3},Y[Ss]={Type:Uint32Array,size:16,setter:dc,cols:4},Y[Cs]={Type:Float32Array,size:32,setter:_c,rows:2,cols:2},Y[ws]={Type:Float32Array,size:48,setter:vc,rows:3,cols:3},Y[Ts]={Type:Float32Array,size:64,setter:yc,rows:4,cols:4},Y[As]={Type:Float32Array,size:32,setter:bc,rows:2,cols:3},Y[js]={Type:Float32Array,size:32,setter:Sc,rows:2,cols:4},Y[Ms]={Type:Float32Array,size:48,setter:xc,rows:3,cols:2},Y[Ns]={Type:Float32Array,size:48,setter:wc,rows:3,cols:4},Y[Ps]={Type:Float32Array,size:64,setter:Cc,rows:4,cols:2},Y[Fs]={Type:Float32Array,size:64,setter:Tc,rows:4,cols:3},Y[Es]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:Zs},Y[Ds]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:Qs},Y[Os]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:$s},Y[ks]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:Zs},Y[Is]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:ec},Y[Ls]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:ec},Y[Rs]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:Qs},Y[Us]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:Zs},Y[Ws]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:$s},Y[Gs]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:Qs},Y[Ks]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:ec},Y[qs]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:Zs},Y[Js]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:$s},Y[Ys]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:Qs},Y[Xs]={Type:null,size:0,setter:X,arraySetter:Z,bindPoint:ec};function Ec(e,t){return function(n){if(n.value)switch(e.disableVertexAttribArray(t),n.value.length){case 4:e.vertexAttrib4fv(t,n.value);break;case 3:e.vertexAttrib3fv(t,n.value);break;case 2:e.vertexAttrib2fv(t,n.value);break;case 1:e.vertexAttrib1fv(t,n.value);break;default:throw Error(`the length of a float constant value must be between 1 and 4!`)}else e.bindBuffer(Xo,n.buffer),e.enableVertexAttribArray(t),e.vertexAttribPointer(t,n.numComponents||n.size,n.type||ds,n.normalize||!1,n.stride||0,n.offset||0),e.vertexAttribDivisor&&e.vertexAttribDivisor(t,n.divisor||0)}}function Dc(e,t){return function(n){if(n.value){if(e.disableVertexAttribArray(t),n.value.length===4)e.vertexAttrib4iv(t,n.value);else throw Error(`The length of an integer constant value must be 4!`)}else e.bindBuffer(Xo,n.buffer),e.enableVertexAttribArray(t),e.vertexAttribIPointer(t,n.numComponents||n.size,n.type||hs,n.stride||0,n.offset||0),e.vertexAttribDivisor&&e.vertexAttribDivisor(t,n.divisor||0)}}function Oc(e,t){return function(n){if(n.value){if(e.disableVertexAttribArray(t),n.value.length===4)e.vertexAttrib4uiv(t,n.value);else throw Error(`The length of an unsigned integer constant value must be 4!`)}else e.bindBuffer(Xo,n.buffer),e.enableVertexAttribArray(t),e.vertexAttribIPointer(t,n.numComponents||n.size,n.type||zs,n.stride||0,n.offset||0),e.vertexAttribDivisor&&e.vertexAttribDivisor(t,n.divisor||0)}}function kc(e,t,n){let r=n.size,i=n.count;return function(n){e.bindBuffer(Xo,n.buffer);let a=n.size||n.numComponents||r,o=a/i,s=n.type||ds,c=Y[s].size*a,l=n.normalize||!1,u=n.offset||0,d=c/i;for(let r=0;r<i;++r)e.enableVertexAttribArray(t+r),e.vertexAttribPointer(t+r,o,s,l,c,u+d*r),e.vertexAttribDivisor&&e.vertexAttribDivisor(t+r,n.divisor||0)}}var Q={};Q[ds]={size:4,setter:Ec},Q[fs]={size:8,setter:Ec},Q[ps]={size:12,setter:Ec},Q[ms]={size:16,setter:Ec},Q[hs]={size:4,setter:Dc},Q[gs]={size:8,setter:Dc},Q[_s]={size:12,setter:Dc},Q[vs]={size:16,setter:Dc},Q[zs]={size:4,setter:Oc},Q[Bs]={size:8,setter:Oc},Q[Vs]={size:12,setter:Oc},Q[Hs]={size:16,setter:Oc},Q[ys]={size:4,setter:Dc},Q[bs]={size:8,setter:Dc},Q[xs]={size:12,setter:Dc},Q[Ss]={size:16,setter:Dc},Q[Cs]={size:4,setter:kc,count:2},Q[ws]={size:9,setter:kc,count:3},Q[Ts]={size:16,setter:kc,count:4};var Ac=/ERROR:\s*\d+:(\d+)/gi;function jc(e,t=``,n=0){let r=[...t.matchAll(Ac)],i=new Map(r.map((e,n)=>{let i=parseInt(e[1]),a=r[n+1],o=a?a.index:t.length,s=t.substring(e.index,o);return[i-1,s]}));return e.split(`
`).map((e,t)=>{let r=i.get(t);return`${t+1+n}: ${e}${r?`\n\n^^^ ${r}`:``}`}).join(`
`)}var Mc=/^[ \t]*\n/;function Nc(e){let t=0;return Mc.test(e)&&(t=1,e=e.replace(Mc,``)),{lineOffset:t,shaderSource:e}}function Pc(e,t){return e.errorCallback(t),e.callback&&setTimeout(()=>{e.callback(`${t}\n${e.errors.join(`
`)}`)}),null}function Fc(e,t,n,r){if(r||=qo,!e.getShaderParameter(n,Qo)){let i=e.getShaderInfoLog(n),{lineOffset:a,shaderSource:o}=Nc(e.getShaderSource(n)),s=`${jc(o,i,a)}\nError compiling ${Mo(e,t)}: ${i}`;return r(s),s}return``}function Ic(e,t,n){let r,i,a;if(typeof t==`function`&&(n=t,t=void 0),typeof e==`function`)n=e,e=void 0;else if(e&&!Array.isArray(e)){let t=e;n=t.errorCallback,e=t.attribLocations,r=t.transformFeedbackVaryings,i=t.transformFeedbackMode,a=t.callback}let o=n||qo,s=[],c={errorCallback(e,...t){s.push(e),o(e,...t)},transformFeedbackVaryings:r,transformFeedbackMode:i,callback:a,errors:s};{let n={};Array.isArray(e)?e.forEach(function(e,r){n[e]=t?t[r]:r}):n=e||{},c.attribLocations=n}return c}var Lc=[`VERTEX_SHADER`,`FRAGMENT_SHADER`];function Rc(e,t){if(t.indexOf(`frag`)>=0)return es;if(t.indexOf(`vert`)>=0)return ts}function zc(e,t,n){let r=e.getAttachedShaders(t);for(let t of r)n.has(t)||e.deleteShader(t);e.deleteProgram(t)}var Bc=(e=0)=>new Promise(t=>setTimeout(t,e));function Vc(e,t,n){let r=e.createProgram(),{attribLocations:i,transformFeedbackVaryings:a,transformFeedbackMode:o}=Ic(n);for(let n=0;n<t.length;++n){let i=t[n];if(typeof i==`string`){let t=Jo(i),r=t?t.text:i,a=e[Lc[n]];t&&t.type&&(a=Rc(e,t.type)||a),i=e.createShader(a),e.shaderSource(i,Nc(r).shaderSource),e.compileShader(i)}e.attachShader(r,i)}Object.entries(i).forEach(([t,n])=>e.bindAttribLocation(r,n,t));{let t=a;t&&(t.attribs&&(t=t.attribs),Array.isArray(t)||(t=Object.keys(t)),e.transformFeedbackVaryings(r,t,o||ns))}return e.linkProgram(r),r}function Hc(e,t,n,r,i){let a=Ic(n,r,i),o=new Set(t),s=Vc(e,t,a);function c(e,t){let n=Wc(e,t,a.errorCallback);return n&&zc(e,t,o),n}if(a.callback){Uc(e,s).then(()=>{let t=c(e,s);a.callback(t,t?void 0:s)});return}return c(e,s)?void 0:s}async function Uc(e,t){let n=e.getExtension(`KHR_parallel_shader_compile`),r=n?(e,t)=>e.getProgramParameter(t,n.COMPLETION_STATUS_KHR):()=>!0,i=0;do await Bc(i),i=1e3/60;while(!r(e,t))}function Wc(e,t,n){if(n||=qo,!e.getProgramParameter(t,$o)){let r=e.getProgramInfoLog(t);return n(`Error in program linking: ${r}`),`${r}\n${e.getAttachedShaders(t).map(t=>Fc(e,e.getShaderParameter(t,e.SHADER_TYPE),t,n)).filter(e=>e).join(`
`)}`}}function Gc(e,t,n,r,i){return Hc(e,t,n,r,i)}function Kc(e){let t=e.name;return t.startsWith(`gl_`)||t.startsWith(`webgl_`)}var qc=/(\.|\[|]|\w+)/g,Jc=e=>e>=`0`&&e<=`9`;function Yc(e,t,n,r){let i=e.split(qc).filter(e=>e!==``),a=0,o=``;for(;;){let e=i[a++];o+=e;let s=Jc(e[0]),c=s?parseInt(e):e;if(s&&(o+=i[a++]),a===i.length){n[c]=t;break}{let e=i[a++],t=e===`[`,s=n[c]||(t?[]:{});n[c]=s,n=s,r[o]=r[o]||function(e){return function(t){$c(e,t)}}(s),o+=e}}}function Xc(e,t){let n=0;function r(t,r,i){let a=r.name.endsWith(`[0]`),o=r.type,s=Y[o];if(!s)throw Error(`unknown type: 0x${o.toString(16)}`);let c;if(s.bindPoint){let t=n;n+=r.size,c=a?s.arraySetter(e,o,t,i,r.size):s.setter(e,o,t,i,r.size)}else c=s.arraySetter&&a?s.arraySetter(e,i):s.setter(e,i);return c.location=i,c}let i={},a={},o=e.getProgramParameter(t,rs);for(let n=0;n<o;++n){let o=e.getActiveUniform(t,n);if(Kc(o))continue;let s=o.name;s.endsWith(`[0]`)&&(s=s.substr(0,s.length-3));let c=e.getUniformLocation(t,o.name);if(c){let e=r(t,o,c);i[s]=e,Yc(s,e,a,i)}}return i}function Zc(e,t){let n={},r=e.getProgramParameter(t,as);for(let i=0;i<r;++i){let r=e.getTransformFeedbackVarying(t,i);n[r.name]={index:i,type:r.type,size:r.size}}return n}function Qc(e,t){let n=e.getProgramParameter(t,rs),r=[],i=[];for(let a=0;a<n;++a){i.push(a),r.push({});let n=e.getActiveUniform(t,a);r[a].name=n.name}[[`UNIFORM_TYPE`,`type`],[`UNIFORM_SIZE`,`size`],[`UNIFORM_BLOCK_INDEX`,`blockNdx`],[`UNIFORM_OFFSET`,`offset`]].forEach(function(n){let a=n[0],o=n[1];e.getActiveUniforms(t,i,e[a]).forEach(function(e,t){r[t][o]=e})});let a={},o=e.getProgramParameter(t,os);for(let n=0;n<o;++n){let r=e.getActiveUniformBlockName(t,n),i={index:e.getUniformBlockIndex(t,r),usedByVertexShader:e.getActiveUniformBlockParameter(t,n,ss),usedByFragmentShader:e.getActiveUniformBlockParameter(t,n,cs),size:e.getActiveUniformBlockParameter(t,n,ls),uniformIndices:e.getActiveUniformBlockParameter(t,n,us)};i.used=i.usedByVertexShader||i.usedByFragmentShader,a[r]=i}return{blockSpecs:a,uniformData:r}}function $c(e,t){for(let n in t){let r=e[n];typeof r==`function`?r(t[n]):$c(e[n],t[n])}}function el(e,...t){let n=e.uniformSetters||e,r=t.length;for(let e=0;e<r;++e){let r=t[e];if(Array.isArray(r)){let e=r.length;for(let t=0;t<e;++t)el(n,r[t])}else for(let e in r){let t=n[e];t&&t(r[e])}}}function tl(e,t){let n={},r=e.getProgramParameter(t,is);for(let i=0;i<r;++i){let r=e.getActiveAttrib(t,i);if(Kc(r))continue;let a=e.getAttribLocation(t,r.name),o=Q[r.type],s=o.setter(e,a,o);s.location=a,n[r.name]=s}return n}function nl(e,t){for(let n in t){let r=e[n];r&&r(t[n])}}function rl(e,t,n){n.vertexArrayObject?e.bindVertexArray(n.vertexArrayObject):(nl(t.attribSetters||t,n.attribs),n.indices&&e.bindBuffer(Zo,n.indices))}function il(e,t){let n=Xc(e,t),r=tl(e,t),i={program:t,uniformSetters:n,attribSetters:r,uniformLocations:Object.fromEntries(Object.entries(n).map(([e,t])=>[e,t.location])),attribLocations:Object.fromEntries(Object.entries(r).map(([e,t])=>[e,t.location]))};return jo(e)&&(i.uniformBlockSpec=Qc(e,t),i.transformFeedbackInfo=Zc(e,t)),i}var al=/\s|{|}|;/;function ol(e,t,n,r,i){let a=Ic(n,r,i),o=[];if(t=t.map(function(e){if(!al.test(e)){let t=Jo(e);if(t)e=t.text;else{let t=`no element with id: ${e}`;a.errorCallback(t),o.push(t)}}return e}),o.length)return Pc(a,``);let s=a.callback;s&&(a.callback=(t,n)=>{s(t,t?void 0:il(e,n))});let c=Gc(e,t,a);return c?il(e,c):null}var sl=4,cl=5123;function ll(e,t,n,r,i,a){n=n===void 0?sl:n;let o=t.indices,s=t.elementType,c=r===void 0?t.numElements:r;i=i===void 0?0:i,s||o?a===void 0?e.drawElements(n,c,s===void 0?cl:t.elementType,i):e.drawElementsInstanced(n,c,s===void 0?cl:t.elementType,i,a):a===void 0?e.drawArrays(n,i,c):e.drawArraysInstanced(n,i,c,a)}var ul=6402,dl=33190,fl=36012,pl=35056,ml=36013,hl=32854,gl=32855,_l=36194,vl=33189,yl=6401,bl=36168,xl=34041,Sl=36096,Cl=36128,wl=33306,$={};$[xl]=wl,$[yl]=Cl,$[bl]=Cl,$[ul]=Sl,$[vl]=Sl,$[dl]=Sl,$[fl]=Sl,$[pl]=wl,$[ml]=wl;var Tl={};Tl[hl]=!0,Tl[gl]=!0,Tl[_l]=!0,Tl[xl]=!0,Tl[vl]=!0,Tl[yl]=!0,Tl[bl]=!0;var El={addExtensionsToContext:!0},Dl=/^(.*?)_/;function Ol(e,t){Mo(e,0);let n=e.getExtension(t);if(n){let r={},i=Dl.exec(t)[1],a=`_`+i;for(let t in n){let o=n[t],s=typeof o==`function`,c=s?i:a,l=t;t.endsWith(c)&&(l=t.substring(0,t.length-c.length)),e[l]===void 0?s?e[l]=function(e){return function(){return e.apply(n,arguments)}}(o):(e[l]=o,r[l]=o):!s&&e[l]!==o&&qa(l,e[l],o,t)}r.constructor={name:n.constructor.name},Mo(r,0)}return n}var kl=`ANGLE_instanced_arrays.EXT_blend_minmax.EXT_color_buffer_float.EXT_color_buffer_half_float.EXT_disjoint_timer_query.EXT_disjoint_timer_query_webgl2.EXT_frag_depth.EXT_sRGB.EXT_shader_texture_lod.EXT_texture_compression_bptc.EXT_texture_compression_rgtc.EXT_texture_filter_anisotropic.OES_element_index_uint.OES_standard_derivatives.OES_texture_float.OES_texture_float_linear.OES_texture_half_float.OES_texture_half_float_linear.OES_vertex_array_object.WEBGL_color_buffer_float.WEBGL_compressed_texture_atc.WEBGL_compressed_texture_etc1.WEBGL_compressed_texture_etc.WEBGL_compressed_texture_pvrtc.WEBGL_compressed_texture_s3tc.WEBGL_compressed_texture_s3tc_srgb.WEBGL_depth_texture.WEBGL_draw_buffers`.split(`.`);function Al(e){for(let t=0;t<kl.length;++t)Ol(e,kl[t])}function jl(e,t){let n=[`webgl2`,`webgl`,`experimental-webgl`],r=null;for(let i=0;i<n.length;++i)if(r=e.getContext(n[i],t),r){El.addExtensionsToContext&&Al(r);break}return r}function Ml(e,t){return jl(e,t)}function Nl(e,t){t||=1,t=Math.max(0,t);let n=e.clientWidth*t|0,r=e.clientHeight*t|0;return e.width!==n||e.height!==r?(e.width=n,e.height=r,!0):!1}var Pl=150,Fl=`
attribute float a_index;
uniform vec2 u_resolution;
uniform float u_time;
varying float v_color_type;
varying float v_intensity_base;

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  float seed = a_index * 123.456;
  
  float speed_rand = hash2(vec2(seed, 1.1));
  float size_rand = hash2(vec2(seed, 2.2));
  float y_rand = hash2(vec2(seed, 3.3));
  float x_rand = hash2(vec2(seed, 4.4));
  float blink_rand = hash2(vec2(seed, 5.5));
  float color_type_rand = hash2(vec2(seed, 6.6));

  float aspect = u_resolution.x / u_resolution.y;
  float speed = 0.008 + speed_rand * 0.024;
  float size = 0.0006 + 0.0032 * pow(size_rand, 3.8);
  
  float y = -0.45 + y_rand * 0.9;
  
  float margin = 0.05;
  float width = aspect + margin * 2.0;
  float x = fract(x_rand + u_time * speed);
  x = x * width - (aspect * 0.5 + margin);
  
  float wave = sin(u_time * 0.3 + y_rand * 6.283) * 0.005;
  
  float ndc_x = x / (aspect * 0.5);
  float ndc_y = (y + wave) / 0.5;
  
  gl_Position = vec4(ndc_x, ndc_y, 0.0, 1.0);
  
  // Point size in pixels. 
  float pointSize = size * u_resolution.y * 3.5;
  gl_PointSize = max(2.0, pointSize);
  
  float blink = 0.3 + 0.7 * sin(u_time * (1.0 + blink_rand * 2.5) + x_rand * 6.283);
  v_intensity_base = blink;
  v_color_type = color_type_rand;
}
`,Il=`
precision mediump float;
uniform vec3 u_particle_color;
uniform vec3 u_particle_accent_color;

varying float v_color_type;
varying float v_intensity_base;

void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float dist = length(pc);
  
  float alpha = smoothstep(0.5, 0.1, dist) * v_intensity_base;
  if (alpha < 0.01) discard;
  
  vec3 baseColor = v_color_type > 0.90 ? u_particle_accent_color : u_particle_color;
  
  // Pre-multiplied alpha blending
  gl_FragColor = vec4(baseColor * alpha, alpha);
}
`,Ll=({theme:e,isDaylight:t,paused:n=!1,blendMs:r=0,blendProgress:i})=>{let a=(0,L.useRef)(null),o=(0,L.useRef)(null),s=(0,L.useRef)(0),c=(0,L.useRef)(null),[l,u]=Pt([e.primaryColor,e.accentColor],r,i),d=Ge(l)||(t?{r:0,g:0,b:0}:{r:255,g:255,b:255}),f=[d.r/255,d.g/255,d.b/255],p=Ge(u)||d,m=[p.r/255,p.g/255,p.b/255],h=t?[1,1,1]:[0,0,0],g=(0,L.useRef)(n),_=(0,L.useRef)(f),v=(0,L.useRef)(m),y=(0,L.useRef)(h);return g.current=n,_.current=f,v.current=m,y.current=h,(0,L.useEffect)(()=>{let e=a.current;if(!e)return;let t=Ml(e,{alpha:!1,depth:!1,antialias:!1});if(!t)return;let n=ol(t,[Fl,Il],e=>{console.error(`SoraBackground twgl program error:`,e)});if(!n)return;let r=new Float32Array(Pl);for(let e=0;e<Pl;e++)r[e]=e;let i=Ao(t,{a_index:{numComponents:1,data:r}}),l=null,u=()=>{o.current===null&&(o.current=requestAnimationFrame(d))},d=r=>{if(o.current=null,!g.current&&l!==null){let e=(r-l)/1e3;s.current+=e}l=g.current?null:r,Nl(e),t.viewport(0,0,t.canvas.width,t.canvas.height);let a=y.current;t.clearColor(a[0],a[1],a[2],1),t.clear(t.COLOR_BUFFER_BIT),t.enable(t.BLEND),t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA);let c={u_resolution:[t.canvas.width,t.canvas.height],u_time:s.current,u_particle_color:_.current,u_particle_accent_color:v.current};t.useProgram(n.program),rl(t,n,i),el(n,c),ll(t,i,t.POINTS),g.current||u()},f=new ResizeObserver(u);return f.observe(e),c.current=u,u(),()=>{c.current=null,f.disconnect(),o.current!==null&&(cancelAnimationFrame(o.current),o.current=null),t.deleteProgram(n.program),i.attribs&&i.attribs.a_index&&i.attribs.a_index.buffer&&t.deleteBuffer(i.attribs.a_index.buffer)}},[]),(0,L.useEffect)(()=>{c.current?.()},[n,t,l,u]),(0,R.jsx)(`canvas`,{ref:a,className:`absolute inset-0 w-full h-full block pointer-events-none`,style:{width:`100%`,height:`100%`,willChange:`transform`,transform:`translateZ(0)`}})},Rl={id:`bg-sora`,titleKey:`options.soraBackgroundSettings`},zl=({t:e,tuning:t,onTuningChange:n})=>(0,R.jsx)(S,{def:Rl,children:(0,R.jsx)(j,{label:e(`options.soraBlank`),note:e(`options.soraBlankDesc`),checked:t.blank,onChange:e=>n?.({blank:e})})}),Bl=e({default:()=>Vl}),Vl=xt({mode:`sora`,order:50,labelKey:`options.visualizerBackgroundModeSora`,labelFallback:`Sora`,glyph:(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(`path`,{d:`M12 5.5l1.2 2.9 2.9 1.2-2.9 1.2L12 13.7l-1.2-2.9-2.9-1.2 2.9-1.2z`}),(0,R.jsx)(`path`,{d:`M5.5 16.5h.01M18 15.5h.01M7 7h.01`,strokeWidth:`2.2`,opacity:`0.5`})]}),command:{title:`Background: Sora`,description:`Switch background to Sora (starry sky) layout`,keywords:[`sora`,`starry sky`,`star`,`星空`,`空`,`背景切换到 空`,`背景切换到空`,`背景切换到Sora`,`背景切换到星空`]},render:({config:e,theme:t,isDaylight:n,paused:r,staticMode:i,blendMs:a,blendProgress:o})=>(0,R.jsx)(`div`,{className:`absolute inset-0 z-0`,style:{backgroundColor:n?`#ffffff`:`#000000`},children:!e?.sora?.tuning?.blank&&(0,R.jsx)(Ll,{theme:t,isDaylight:n,paused:r||i,blendMs:a,blendProgress:o})}),renderSettingsPanel:({config:e,actions:t,t:n})=>(0,R.jsx)(zl,{t:n,tuning:e?.sora?.tuning??Pe,onTuningChange:t?.sora?.onTuningChange}),renderQuickControls:({config:e,actions:t,t:n})=>{let r=e?.sora?.tuning??Pe;return(0,R.jsx)(C,{active:r.blank,label:n(`options.soraBlank`),onToggle:()=>t?.sora?.onTuningChange?.({blank:!r.blank}),children:(0,R.jsx)(a,{size:14})})},resetSettings:e=>e?.sora?.onResetTuning?.()}),Hl=({urlBackgroundList:e=[],urlBackgroundSelectedId:t=null})=>{let n=(0,L.useMemo)(()=>w(e.find(e=>e.id===t)),[e,t]),r=(0,L.useRef)(null),[i,a]=(0,L.useState)(!1);return(0,L.useEffect)(()=>{a(!1);let e=r.current;if(!e)return;let t=e.getBoundingClientRect();if(t.width>0&&t.height>0){a(!0);return}let n=new ResizeObserver(e=>{for(let t of e){let{width:e,height:r}=t.contentRect;e>0&&r>0&&(a(!0),n.disconnect())}});return n.observe(e),()=>{n.disconnect()}},[n]),n?.url?(0,R.jsxs)(`div`,{ref:r,className:`absolute inset-0 z-0 overflow-hidden`,children:[i&&(0,R.jsx)(`iframe`,{src:n.url,title:n.note||n.url,className:`w-full h-full border-0`,style:{pointerEvents:`none`},sandbox:`allow-scripts`,allowFullScreen:!0},n.url),(0,R.jsx)(`div`,{className:`absolute inset-0`,style:{background:`linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.35))`,pointerEvents:`none`}})]}):null},Ul={id:`bg-url`,titleKey:`options.urlBackgroundSettings`},Wl=()=>`url-bg-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,Gl=({t:e,urlBackgroundList:t=[],urlBackgroundSelectedId:n=null,onAddUrlBackgroundItem:r,onUpdateUrlBackgroundItem:i,onDeleteUrlBackgroundItem:a,onSetUrlBackgroundSelectedId:l})=>{let[u,d]=(0,L.useState)(!1),[f,p]=(0,L.useState)(null),[m,h]=(0,L.useState)(``),[g,_]=(0,L.useState)(``),v=(0,L.useCallback)(()=>{h(``),_(``),d(!1),p(null)},[]),b=(0,L.useCallback)(()=>{let e=te(m);if(!e)return;let t={id:Wl(),url:e,note:g.trim()||e};r?.(t),l?.(t.id),v()},[m,g,r,l,v]),C=(0,L.useCallback)(e=>{d(!1),p(e.id),h(e.url),_(e.note)},[]),w=(0,L.useCallback)(()=>{if(!f)return;let e=te(m);e&&(i?.(f,{url:e,note:g.trim()||e}),v())},[f,m,g,i,v]),E=t=>(0,R.jsx)(x,{below:(0,R.jsxs)(`div`,{className:`flex flex-col gap-2 [&>input]:w-full`,children:[(0,R.jsx)(re,{type:`url`,value:m,onChange:h,placeholder:`https://example.com`}),(0,R.jsx)(re,{value:g,onChange:_,placeholder:e(`options.urlBackgroundNotePlaceholder`)}),(0,R.jsxs)(`div`,{className:`flex justify-end gap-2`,children:[(0,R.jsx)(y,{onClick:v,children:e(`ui.cancel`)}),(0,R.jsx)(y,{variant:`primary`,onClick:t,disabled:!m.trim(),children:e(`options.save`)})]})]})});return(0,R.jsxs)(S,{def:Ul,foot:e(`options.urlBackgroundSettingsDesc`),children:[t.map(t=>f===t.id?(0,R.jsx)(L.Fragment,{children:E(w)},t.id):(0,R.jsxs)(x,{label:(0,R.jsxs)(`button`,{type:`button`,role:`radio`,"aria-checked":t.id===n,onClick:()=>l?.(t.id),className:`flex w-full min-w-0 items-center gap-2.5 rounded text-left`,children:[(0,R.jsx)(`span`,{"aria-hidden":!0,className:`st-t-fast h-4 w-4 shrink-0 rounded-full transition-shadow ${t.id===n?`shadow-[inset_0_0_0_5px_var(--st-accent)]`:`shadow-[inset_0_0_0_1.5px_var(--st-t3)]`}`}),(0,R.jsxs)(`span`,{className:`min-w-0`,children:[(0,R.jsx)(`span`,{className:`block truncate`,children:t.note}),(0,R.jsx)(`span`,{className:`block truncate text-xs leading-[18px] text-[color:var(--st-t2)]`,children:t.url})]})]}),children:[(0,R.jsx)(y,{icon:o,tip:e(`options.urlBackgroundEdit`),onClick:()=>C(t)}),(0,R.jsx)(y,{icon:c,tip:e(`options.urlBackgroundDelete`),onClick:()=>a?.(t.id)})]},t.id)),u?E(b):(0,R.jsx)(x,{label:t.length===0?(0,R.jsx)(T,{children:e(`options.urlBackgroundEmpty`)}):void 0,children:(0,R.jsx)(y,{icon:s,onClick:()=>{p(null),h(``),_(``),d(!0)},children:e(`options.urlBackgroundAdd`)})})]})},Kl=e({default:()=>ql}),ql=xt({mode:`url`,order:40,labelKey:`options.visualizerBackgroundModeUrl`,labelFallback:`Embed`,glyph:(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(`rect`,{x:`3.5`,y:`5`,width:`17`,height:`14`,rx:`2`}),(0,R.jsx)(`path`,{d:`M3.5 9.5h17`,opacity:`0.55`})]}),command:{title:`Background: Embedded Background`,description:`Switch background to embedded webpage mode`,keywords:[`embedded background`,`embed background`,`background embed`,`background url`,`url background`,`url`,`webpage`,`嵌入背景`,`网页背景`,`背景切换到 嵌入背景`,`背景切换到嵌入背景`]},render:({config:e})=>(0,R.jsx)(Hl,{urlBackgroundList:e?.url?.items,urlBackgroundSelectedId:e?.url?.selectedId}),renderSettingsPanel:({config:e,actions:t,...n})=>(0,R.jsx)(Gl,{...n,urlBackgroundList:e?.url?.items,urlBackgroundSelectedId:e?.url?.selectedId,onAddUrlBackgroundItem:t?.url?.onAdd,onUpdateUrlBackgroundItem:t?.url?.onUpdate,onDeleteUrlBackgroundItem:t?.url?.onDelete,onSetUrlBackgroundSelectedId:t?.url?.onSelect})}),{entries:Jl,byMode:Yl}=(e=>{let t=Object.entries(e).map(([e,t])=>{if(!t.default)throw Error(`[VisualizerBackgroundRegistry] Missing default export in ${e}`);return t.default}),n={};return t.forEach(e=>{if(n[e.mode])throw Error(`[VisualizerBackgroundRegistry] Duplicate background mode "${e.mode}"`);n[e.mode]=e}),{entries:[...t].sort((e,t)=>e.order-t.order),byMode:n}})(Object.assign({"./common/entry.tsx":sn,"./latent/entry.tsx":ur,"./monet/entry.tsx":Bi,"./nomand/entry.tsx":xa,"./sora/entry.tsx":Bl,"./url/entry.tsx":Kl}));Ie(`VisualizerBackgroundRegistry`,Jl.map(e=>e.mode),Re);var Xl=e=>Yl[e]??Yl.latent,Zl=e=>e.config?.transparent?null:Xl(e.config?.mode??`latent`).render(e),Ql=`video_layer_file_handle`,$l=()=>typeof window<`u`&&typeof window.showOpenFilePicker==`function`,eu=()=>new Promise(e=>{let t=document.createElement(`input`);t.type=`file`,t.accept=`video/*`,t.addEventListener(`change`,()=>e(t.files?.[0]??null),{once:!0}),t.addEventListener(`cancel`,()=>e(null),{once:!0}),t.click()}),tu=async()=>{let e=window.showOpenFilePicker;if(!e){let e=await eu();return e?{file:e,handle:null}:null}try{let[t]=await e({multiple:!1,types:[{description:`Video`,accept:{"video/*":[`.mp4`,`.webm`,`.mov`,`.m4v`,`.mkv`,`.ogv`]}}]});return t?{file:await t.getFile(),handle:t}:null}catch(e){if(e instanceof DOMException&&e.name===`AbortError`)return null;throw e}},nu=e=>h(Ql,e),ru=()=>m(Ql),iu=()=>_(Ql),au=async(e,t)=>{let n=e,r=await n.queryPermission?.({mode:`read`})??`granted`;if(r!==`granted`&&t&&n.requestPermission&&(r=await n.requestPermission({mode:`read`})),r!==`granted`)return{status:`needs-permission`};try{return{status:`ready`,file:await e.getFile()}}catch{return{status:`missing`}}},ou={min:.1,max:1},su=.6,cu=`video_layer_enabled`,lu=`video_layer_url`,uu=`video_layer_opacity`,du=`video_layer_fit`,fu=e=>Number.isFinite(e)?Math.max(ou.min,Math.min(ou.max,e)):su,pu=(e,t)=>{typeof window<`u`&&localStorage.setItem(e,t)},mu=!1,hu=Be((e,t)=>{let n=0,r=n=>{let r=t().localFileUrl;r&&URL.revokeObjectURL(r),e({localFileUrl:URL.createObjectURL(n),localFileName:n.name,localFileStatus:`ready`})},i=()=>{let n=t().localFileUrl;n&&URL.revokeObjectURL(n),e({localFileUrl:null,localFileName:null,localFileStatus:`none`})},a=async t=>{let a=n,o=await ru();if(!o||a!==n)return;let s;try{s=await au(o,t)}catch(e){console.warn(`[VideoLayer] Failed to read the stored video handle:`,e);return}a===n&&(s.status===`ready`?r(s.file):s.status===`needs-permission`?e({localFileName:o.name,localFileStatus:`needs-permission`}):(await iu(),a===n&&i()))};return{videoLayerEnabled:Ue(cu,!1),videoLayerUrl:He(lu,``),videoLayerOpacity:fu(Number(He(uu,String(su)))),videoLayerFit:He(du,`cover`)===`contain`?`contain`:`cover`,localFileUrl:null,localFileName:null,localFileStatus:`none`,canPersistLocalFile:$l(),setVideoLayerEnabled:t=>{e({videoLayerEnabled:t}),Ve(cu,t)},setVideoLayerUrl:t=>{let n=t.trim();e({videoLayerUrl:n}),pu(lu,n)},setVideoLayerOpacity:t=>{let n=fu(t);e({videoLayerOpacity:n}),pu(uu,String(n))},setVideoLayerFit:t=>{e({videoLayerFit:t}),pu(du,t)},pickLocalFile:async()=>{let e=await tu();return e?(n+=1,mu=!0,e.handle?await nu(e.handle):await iu(),r(e.file),t().setVideoLayerEnabled(!0),e.file.name):null},clearLocalFile:async()=>{n+=1,mu=!0,i(),await iu()},restoreLocalFile:()=>a(!1),regrantLocalFile:()=>a(!0)}}),gu=()=>{mu||(mu=!0,hu.getState().restoreLocalFile())},_u=2e3,vu=.35,yu=1,bu=({paused:e})=>{let t=(0,L.useRef)(null),n=(0,L.useRef)(e);n.current=e;let r=(0,L.useRef)(()=>{}),{enabled:i,url:a,opacity:o,fit:s,localFileUrl:c}=hu(A(e=>({enabled:e.videoLayerEnabled,url:e.videoLayerUrl,opacity:e.videoLayerOpacity,fit:e.videoLayerFit,localFileUrl:e.localFileUrl}))),l=c??(a||null),u=i&&!!l;return(0,L.useEffect)(()=>{gu()},[]),(0,L.useEffect)(()=>{let e=t.current;if(!u||!e)return;let i=()=>{if(n.current&&ot(it.getState())===Fe.PLAYING||!Number.isFinite(e.duration)||e.duration<=0||e.seeking)return;let t=Je.get()%e.duration;Math.abs(e.currentTime-t)>vu&&(e.currentTime=t)},a=()=>{ot(it.getState())===Fe.PLAYING&&!n.current?e.play().catch(()=>{}):e.pause()},o=()=>{i(),a()};r.current=i,e.addEventListener(`loadedmetadata`,o),e.readyState>=HTMLMediaElement.HAVE_METADATA&&o();let s=it.subscribe((e,t)=>{ot(e)!==ot(t)&&a(),rt(e)!==rt(t)&&i()}),c=Je.get(),l=Je.on(`change`,e=>{Math.abs(e-c)>yu&&i(),c=e}),d=window.setInterval(i,_u);return()=>{window.clearInterval(d),l(),s(),e.removeEventListener(`loadedmetadata`,o),e.pause()}},[u,l]),(0,L.useEffect)(()=>{let n=t.current;u&&n&&(e?n.pause():ot(it.getState())===Fe.PLAYING&&(r.current(),n.play().catch(()=>{})))},[u,e]),!u||!l?null:(0,R.jsx)(`video`,{ref:t,src:l,muted:!0,loop:!0,playsInline:!0,preload:`auto`,"aria-hidden":!0,className:`absolute inset-0 h-full w-full pointer-events-none`,style:{opacity:o,objectFit:s}},l)},xu=(e,t)=>{let n=(e.enter.delay??0)+e.enter.duration;return{leave:{...e.leave,delay:0,duration:n,easing:`linear`},enter:{...e.enter,delay:0,duration:n,easing:`linear`},progress:t}},Su=(e,t,n)=>{let r=Math.min(1,Math.max(0,t.get()));if(r>=1)return e.playState===`paused`&&e.play(),null;let i=!0,a=()=>{i=!1,s()},o=t=>{if(!i)return;let o=jt(t,r);if(o>=1){a(),e.finish();return}e.currentTime=o*n};e.pause();let s=t.on(`change`,o);return o(t.get()),()=>{i&&(a(),e.play())}},Cu=()=>{},wu=e=>e.map(e=>({...e,waits:!1})),Tu=(e,t,n,r)=>{let i=e[e.length-1],a=i.leaving&&e.length>1?e.slice(0,-1):e,o=a[a.length-1];if(o.value===t)return n?o.waits&&!r?wu(e):e:e.length===1&&!o.waits?e:[{...o,waits:!1}];let s={key:i.key+1,value:t,leaving:!1,comesIn:n,waits:n&&r};if(!n)return[s];let c=a.length>1?a[a.length-2]:null;return o.waits?c?c.value===t?[{...c,leaving:!1,waits:!1}]:[{...c,waits:s.waits},s]:[s]:c?.value===t?[{...c,leaving:!1,waits:!1},{...o,leaving:!0,waits:!1}]:[{...o,leaving:!0,waits:s.waits},s]},Eu=(e,t)=>{let n=e[e.length-1];return n.key===t&&n.waits?wu(e):e},Du=1e3,Ou=(e,t,n)=>{let[r,i]=(0,L.useState)(()=>[{key:0,value:e,leaving:!1,comesIn:!1,waits:!1}]),a=Tu(r,e,t,n);return a!==r&&i(a),[a,(0,L.useCallback)(e=>{i(t=>t.filter(t=>t.key!==e))},[]),(0,L.useCallback)(e=>{i(t=>Eu(t,e))},[])]},ku=(e,t,n,r,i)=>{let a=(0,L.useRef)(null),o=(0,L.useRef)(null),[s]=(0,L.useState)(()=>t.comesIn&&n?{...n.enter,progress:n.progress}:null),{key:c,leaving:l,waits:u}=t;(0,L.useLayoutEffect)(()=>{let t=e.current;if(!s||!t||typeof t.animate!=`function`)return;let{from:n,delay:r,duration:c,easing:l}=s,u=t.animate([{...n,offset:0}],{delay:r,duration:c,easing:l,fill:`backwards`});a.current=u;let d=i?.();return d&&u.finished.then(d,d),()=>{o.current?.(),u.cancel(),d?.()}},[e,s,i]);let d=u&&!l,f=!!s?.progress&&n?.progress===s?.progress;(0,L.useLayoutEffect)(()=>{let e=a.current;e&&(d?e.pause():f&&s?.progress?o.current??=Su(e,s.progress,(s.delay??0)+s.duration)??Cu:(o.current?.(),o.current=Cu,e.playState===`paused`&&e.play()))},[s,d,f]),(0,L.useLayoutEffect)(()=>{if(!l)return;let t=e.current;if(!n||!t||typeof t.animate!=`function`){r(c);return}if(u)return;let s=a.current;if(s?.playState===`running`||s?.playState===`paused`){try{s.commitStyles()}catch{}o.current?.(),s.cancel()}let{to:d,...f}=n.leave,p=t.animate([{...d,offset:1}],{...f,fill:`forwards`});p.onfinish=()=>r(c);let m=(f.delay??0)+f.duration,h=n.progress?Su(p,n.progress,m):null,g=h?void 0:window.setTimeout(()=>r(c),m+Du),_=i?.();return()=>{window.clearTimeout(g),h?.(),p.cancel(),_?.()}},[e,l,u,n,r,c,i])},Au=1e3,ju=(e,t)=>t&&!e?.transparent?e?.mode??`latent`:null,Mu=(e,t)=>ju(e,!0)===t?e:{...e,mode:t,transparent:!1},Nu=(e,t,n)=>{let r=ju(e.config,t);if(r===null)return null;let i=n?Xl(r).song?.({...e,config:Mu(e.config,r)})??[]:[];return JSON.stringify([r,...i])},Pu=e=>JSON.parse(e)[0],Fu=e=>({...e,leave:{to:{opacity:1,filter:`none`,transform:`none`},duration:(e.enter.delay??0)+e.enter.duration,easing:`linear`}}),Iu=({background:e,inputs:t,now:n,transition:r,styleWaits:i,onLeft:a,onStart:o,render:s})=>{let c=(0,L.useRef)(null);ku(c,e,r,a);let{key:l,value:u,leaving:d}=e,f=d||i||u!==n,p=(0,L.useRef)(t),m=p.current,h=f?{...t,config:m.config,coverUrl:m.coverUrl,seed:m.seed,theme:m.theme}:t;(0,L.useLayoutEffect)(()=>{p.current=h});let g=e.waits&&!d,_=(0,L.useRef)(!1),v=(0,L.useRef)(i),y=(0,L.useRef)(!1),b=(0,L.useRef)(!1),x=(0,L.useCallback)(()=>{_.current&&y.current&&!v.current&&o(l)},[o,l]),S=(0,L.useMemo)(()=>({claim:()=>{b.current=!0},drawn:()=>{y.current=!0,x()}}),[x]);if((0,L.useLayoutEffect)(()=>{b.current||(y.current=!0)},[]),(0,L.useLayoutEffect)(()=>(_.current=g,v.current=i,x(),()=>{_.current=!1}),[g,i,x]),(0,L.useEffect)(()=>{if(!g)return;let e=window.setTimeout(()=>S.drawn(),Au);return()=>window.clearTimeout(e)},[g,S]),u===null)return null;let C=Pu(u);return(0,R.jsx)(`div`,{ref:c,className:`absolute inset-0`,inert:d,"data-visualizer-background":C,children:(0,R.jsx)(Et.Provider,{value:S,children:(0,R.jsx)(Ot.Provider,{value:e.waits&&!d,children:s({...h,config:Mu(h.config,C)})})})})},Lu=({inputs:e,drawn:t,transition:n,waits:r,render:i})=>{let a=n!==null,o=Nu(e,t,a),[s,c,l]=Ou((0,L.useDeferredValue)(o),a,a),u=(0,L.useMemo)(()=>n?Fu(n):null,[n]),d=s.findIndex(e=>!e.leaving),f=d>=0&&s[d].value!==null;return(0,R.jsx)(R.Fragment,{children:s.map((t,a)=>(0,R.jsx)(Iu,{background:t,inputs:e,now:o,transition:t.leaving&&f&&a<d?u:n,styleWaits:r,onLeft:c,onStart:l,render:i},t.key))})},Ru=typeof window>`u`?new URLSearchParams:new URLSearchParams(window.location.search),zu=typeof window<`u`&&(Ru.get(`obs`)===`1`||window.location.pathname===`/obs`);Ru.get(`obsSource`);var Bu=!zu&&Ru.get(`remote`)===`1`,Vu=typeof window<`u`&&!zu&&!Bu,Hu=(0,L.createContext)(null),Uu=({theme:e,audioPower:t,audioBands:n,sharedProps:r,renderBackground:i,transition:a=null,waits:o=!1})=>{let s=r?.staticMode??!1,c=r?.paused??!1;return(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(Lu,{inputs:{config:r?.background,theme:e,isDaylight:r?.isDaylight??!1,coverUrl:v(r?.coverUrl,1024)||void 0,audioPower:t,audioBands:n,seed:r?.seed,staticMode:s||(r?.backgroundStaticMode??!1),paused:c,blendMs:a?(a.enter.delay??0)+a.enter.duration:0,blendProgress:a?.progress},drawn:i,transition:a,waits:o,render:e=>(0,R.jsx)(Zl,{...e})}),!r?.isPreviewMode&&!s&&Vu&&(0,R.jsx)(bu,{paused:c})]})},Wu=({entry:e,props:t,transition:n,waits:r,children:i})=>{let[a,o]=(0,L.useState)(null),s=(0,L.useMemo)(()=>({pointerArea:a}),[a]),c=!t.isPreviewMode&&!t.staticMode,l={theme:t.theme,isDaylight:t.isDaylight??!1,paused:t.paused??!1};return(0,R.jsxs)(`div`,{ref:o,className:`relative w-full h-full overflow-hidden`,style:{opacity:t.visualizerOpacity??1},children:[(0,R.jsx)(Uu,{theme:t.theme,audioPower:t.audioPower,audioBands:t.audioBands,sharedProps:e.background?{...t,background:e.background(t)}:t,renderBackground:e.background!==!1,transition:n,waits:r}),c&&(0,R.jsx)(at,{slot:`player.stage.back`,...l}),(0,R.jsx)(Hu.Provider,{value:s,children:i}),c&&(0,R.jsx)(at,{slot:`player.stage.front`,...l,className:`absolute inset-0 pointer-events-none z-20`})]})},Gu=(0,L.createContext)(!1),Ku=()=>(0,L.useContext)(Gu),qu=(0,L.createContext)(32),Ju=()=>(0,L.useContext)(qu),Yu=Object.freeze({top:0,right:0,bottom:0,left:0}),Xu=(e,t)=>{if(![e.left,e.top,e.width,e.height].every(Number.isFinite))return null;let n=Math.max(t.left,e.left),r=Math.max(t.top,e.top),i=Math.min(t.left+t.width,e.left+e.width),a=Math.min(t.top+t.height,e.top+e.height);return i<=n||a<=r?null:Object.freeze({left:n,top:r,width:i-n,height:a-r})},Zu=(e,t,n=Yu)=>{let r=new Map;for(let n of t){let t=Xu(n.rect,e);if(!t)continue;let i=r.get(n.key),a=i?{left:Math.min(i.rect.left,t.left),top:Math.min(i.rect.top,t.top),width:Math.max(i.rect.left+i.rect.width,t.left+t.width)-Math.min(i.rect.left,t.left),height:Math.max(i.rect.top+i.rect.height,t.top+t.height)-Math.min(i.rect.top,t.top)}:t;r.set(n.key,Object.freeze({role:n.role,kind:n.kind,rect:Object.freeze(a)}))}let i=(e,t)=>Number.isFinite(e)?Math.min(Math.max(0,e),t):0,a=i(n.top,e.height),o=i(n.left,e.width);return Object.freeze({bounds:Object.freeze({left:e.left,top:e.top,width:e.width,height:e.height}),insets:Object.freeze({top:a,left:o,right:i(n.right,e.width-o),bottom:i(n.bottom,e.height-a)}),obstacles:Object.freeze([...r.entries()].sort(([e],[t])=>e.localeCompare(t)).map(([,e])=>e))})},Qu=(e,t)=>{if(e===t)return!0;if(!e||!t||e.obstacles.length!==t.obstacles.length)return!1;let n=(e,t)=>e.left===t.left&&e.top===t.top&&e.width===t.width&&e.height===t.height;return n(e.bounds,t.bounds)&&[`top`,`right`,`bottom`,`left`].every(n=>e.insets[n]===t.insets[n])&&e.obstacles.every((e,r)=>{let i=t.obstacles[r];return e.role===i.role&&e.kind===i.kind&&n(e.rect,i.rect)})},$u=(()=>{let e=null,t=null,n=null,r=Yu,i,a,o=new Map,s=new Set,c=()=>{let i=e?.isConnected?e.getBoundingClientRect():null,a=i&&i.width>0&&i.height>0?Zu(i,[...o.values()].flatMap(({read:e})=>{let t=e(i);return t?[t]:[]}),r):null;return t===e&&Qu(n,a)?!1:(t=e,n=a,!0)},l=()=>{if(c())for(let e of[...s])try{e()}catch(e){console.warn(`[Folium] layout subscriber failed`,e)}},u=()=>{s.size&&i===void 0&&(e||n!==null)&&(i=setTimeout(()=>{i=void 0,l()},80))},d=()=>{if(a?.disconnect(),window.removeEventListener(`resize`,u),window.removeEventListener(`scroll`,u,!0),!e||!s.size){a=void 0;return}!a&&typeof ResizeObserver<`u`&&(a=new ResizeObserver(u)),a?.observe(e);for(let e of o.values())e.element&&a?.observe(e.element);window.addEventListener(`resize`,u),window.addEventListener(`scroll`,u,!0)};return{source:{get:()=>!e?.isConnected||!s.size?null:t===e?n:null,subscribe:e=>{s.add(e),s.size===1&&d(),u();let r=!1;return()=>{r||(r=!0,s.delete(e),s.size||(clearTimeout(i),i=void 0,d(),n=null,t=null))}}},invalidate:u,registerRoot:(t,n=Yu)=>(e=t,r={...n},d(),u(),()=>{e===t&&(e=null),d(),u()}),register:(e,t)=>{let n=Symbol();return o.set(n,{element:e,read:t}),d(),u(),()=>{o.delete(n),d(),u()}}}})(),ed=(e,t,n=!0)=>{let r=(0,L.useRef)(null),i=(0,L.useRef)(void 0),a=(0,L.useRef)(n);a.current=n;let o=(0,L.useCallback)(()=>{let n=r.current;n&&!i.current&&(i.current=$u.register(n,()=>n.isConnected&&a.current?{key:e,role:t,kind:`control`,rect:n.getBoundingClientRect()}:null))},[e,t]),s=(0,L.useCallback)(()=>{i.current?.(),i.current=void 0},[]),c=(0,L.useCallback)(e=>{s(),r.current=e,o()},[o,s]);return(0,L.useLayoutEffect)(()=>(o(),s),[o,s]),(0,L.useLayoutEffect)($u.invalidate,[n]),{ref:c,invalidate:$u.invalidate}},td=(e,t,n,r=!0,i)=>{(0,L.useLayoutEffect)(()=>{if(r)return $u.register(i?.current??null,r=>({key:e,role:t,kind:`reveal-area`,rect:n(r)}))},[e,t,n,r,i])};export{Dt as _,Wu as a,gt as b,Vu as c,Ou as d,Bn as f,Et as g,jt as h,Ju as i,xu as l,Xt as m,td as n,Hu as o,Vn as p,Ku as r,Uu as s,ed as t,ku as u,Tt as v,bt as y};