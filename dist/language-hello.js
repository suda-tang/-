// A single small text layer; no page-wide filters or layout changes.
export function animateLanguageNames(trigger, wheel, languages) {
  const label=trigger.querySelector('span');
  label.setAttribute('aria-hidden','true');
  let index=0,timer=0,motion=null,revision=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function show(){const [id,name,lang]=languages[index];label.textContent=name;label.lang=lang;trigger.dataset.displayLocale=id;}
  function schedule(){clearTimeout(timer);if(!document.hidden&&!reduced.matches)timer=setTimeout(next,2400);}
  async function next(){
    if(wheel.open||document.hidden||reduced.matches){schedule();return;}
    const version=revision;
    motion=label.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-5px)'}],{duration:180,easing:'ease-in',fill:'forwards'});
    await motion.finished.catch(()=>{});if(version!==revision)return;
    motion.cancel();index=(index+1)%languages.length;show();
    motion=label.animate([{opacity:0,clipPath:'inset(0 100% 0 0)',transform:'translateY(5px)'},{opacity:1,clipPath:'inset(0)',transform:'translateY(0)'}],{duration:650,easing:'cubic-bezier(.22,1,.36,1)'});
    schedule();
  }
  function reset(locale){revision++;clearTimeout(timer);motion?.cancel();index=Math.max(0,languages.findIndex(item=>item[0]===locale));show();schedule();}
  document.addEventListener('visibilitychange',()=>{revision++;motion?.cancel();schedule();});
  reduced.addEventListener('change',()=>{revision++;motion?.cancel();schedule();});
  reset(languages[0][0]);return reset;
}
