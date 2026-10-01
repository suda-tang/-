import {openingNarration} from './narration-opening.js?v=playlist3';
export function pinTourHeader(){
 const header=document.querySelector('.top');if(!header)return()=>{};
 const spacer=document.createElement('div');spacer.className='tour-header-space';header.before(spacer);
 header.classList.add('tour-pinned-header');header.setAttribute('popover','manual');
 const measure=()=>{const h=header.getBoundingClientRect().height;spacer.style.height=h+'px';document.documentElement.style.setProperty('--tour-header-height',h+'px');};
 const raise=()=>{if(!header.showPopover)return;if(header.matches(':popover-open'))header.hidePopover();header.showPopover();measure();};
 raise();const observer=new ResizeObserver(measure);observer.observe(header);
 for(const event of ['library-tour-opened','library-flight-layer'])document.addEventListener(event,raise);
 return()=>{observer.disconnect();for(const event of ['library-tour-opened','library-flight-layer'])document.removeEventListener(event,raise);if(header.matches(':popover-open'))header.hidePopover();header.removeAttribute('popover');header.classList.remove('tour-pinned-header');spacer.remove();document.documentElement.style.removeProperty('--tour-header-height');};
}

// One scroll owner for the entrance and every guided chapter.
export async function glideTo(element,{cancelled=()=>false,duration=1500}={}){
 if(!element)return;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const start=scrollY,desired=Math.max(0,start+element.getBoundingClientRect().top-(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tour-header-height'))||0)-124);
 const end=Math.min(desired,Math.max(0,document.documentElement.scrollHeight-innerHeight));
 if(reduce){scrollTo({top:end,behavior:'instant'});return;}
 await new Promise(resolve=>{let startTime;function frame(now){if(cancelled()){resolve();return;}startTime??=now;const t=Math.min(1,(now-startTime)/duration),e=t*t*t*(t*(t*6-15)+10);scrollTo({top:start+(end-start)*e,behavior:'instant'});if(t<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
}
export async function presentWelcome({mentor,visit,focus}) {
 const root=document.documentElement;root.classList.add('tour-arrival');
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const scene=document.createElement('section');scene.className='tour-home-intro';scene.setAttribute('aria-label','唐秋鸣课题介绍');
 scene.innerHTML='<div class="home-intro-content"><p class="premiere-name"></p><h1>唐秋鸣<span>课题设计实例</span></h1><p class="premiere-topic"></p><p class="premiere-caption">我在苏州大学读音乐教育，主项是钢琴。<br>想借这个工作区，向您介绍我正在做的事。</p><button type="button">往下看看 <span aria-hidden="true">↓</span></button></div>';
 scene.querySelector('.premiere-name').textContent=mentor?`${mentor}老师，您好。`:'老师，您好。';
 scene.querySelector('.premiere-topic').textContent=focus;
 (document.querySelector('.tour-header-space')||document.querySelector('.top')).after(scene);
 const previousRestoration=history.scrollRestoration;history.scrollRestoration='manual';
 scrollTo({top:0,behavior:'instant'});
 while(root.classList.contains('booting'))await wait(80);
 scrollTo({top:0,behavior:'instant'});scene.classList.add('is-visible');
 await openingNarration(scene);
 scene.querySelector('button').onclick=()=>void glideTo(document.querySelector('.score-library'));
 root.classList.remove('tour-arrival');root.classList.add('tour-travelling');
 await glideTo(document.querySelector('.score-library'),{duration:1900});
 root.classList.remove('tour-travelling');history.scrollRestoration=previousRestoration;
}

export async function researchFor(mentor,visit){
 try{const r=await fetch('/mentor-research.json',{signal:AbortSignal.timeout(4000)});if(!r.ok)return null;const profiles=await r.json();return profiles.find(p=>p.names.includes(mentor)&&(!visit?.institution||visit.institution.includes(p.institution)))||null;}catch{return null;}
}
