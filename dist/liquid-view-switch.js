const group=document.querySelector('.view-buttons');
if(group){
 const lens=document.createElement('span');lens.className='view-liquid-lens';lens.setAttribute('aria-hidden','true');group.prepend(lens);let frame=0;
 const update=()=>{frame=0;const active=group.querySelector('button.active')||group.querySelector('button');if(!active)return;lens.style.width=active.offsetWidth+'px';lens.style.height=active.offsetHeight+'px';lens.style.transform=`translate3d(${active.offsetLeft}px,${active.offsetTop}px,0)`;};
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
 new ResizeObserver(schedule).observe(group);const observer=new MutationObserver(schedule);for(const button of group.querySelectorAll('button'))observer.observe(button,{attributes:true,attributeFilter:['class','aria-pressed']});
 document.addEventListener('languagechange',schedule);schedule();
}
