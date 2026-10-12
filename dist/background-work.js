// Optional work starts after the first usable workspace frame and yields to score opening.
export function afterWorkspace(task,{delay=0,timeout=2000}={}){
 let cancelled=false,started=false;
 const run=()=>{if(cancelled||started)return;started=true;Promise.resolve().then(task).catch(error=>console.warn('后台准备未完成',error));};
 const idle=()=>{if(cancelled||started)return;if(document.documentElement.classList.contains('booting')||document.querySelector('.score-loading-overlay:not([hidden])')){setTimeout(idle,250);return}const attempt=()=>{if(document.documentElement.classList.contains('booting')||document.querySelector('.score-loading-overlay:not([hidden])')){setTimeout(idle,250);return}run()};if(globalThis.requestIdleCallback)requestIdleCallback(attempt,{timeout});else setTimeout(attempt,0)};
 const ready=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(idle,delay)));
 if(document.documentElement.dataset.workspaceReady==='true')ready();else window.addEventListener('workspace-ready',ready,{once:true});
 return{run,cancel(){cancelled=true;window.removeEventListener('workspace-ready',ready)}};
}
