// Keep the first paint stable while the workspace groups its controls.
const root = document.documentElement;
root.classList.add('booting');
if(new URLSearchParams(location.search).get('tour')==='1')root.classList.add('tour-arrival');
let finished = false, completing = false, bootFailure = false;


// Keep only the current stage. Resource progress counts completed module bytes.
const moduleSizes={"project-entry.js":2325,"app.js":126309,"practice-evidence.js":963,"range-fill.js":523,"vocal-transport.js":9854,"midi-engraving.js":6954,"midi-loader.js":2345,"drum-layout.js":1325,"duplicate-score.js":1314,"written-expression.js":644,"daw.js":20430,"arrangements.js":8501,"title-candidates.js":1128,"library.js":50156,"library-decks.js":6880,"task-center.js":18100,"instruments.js":2994,"piano-samples.js":3817,"harmony.js":4555,"score.js":14075,"engraving.js":20901,"engraving-plan.js":2748,"midi-notation-layout.js":4869,"midi.js":14290,"import-title.js":1056,"simple-notation.js":11786,"engine.js":6970,"player.js":18782,"performance.js":4397,"score-editing.js":3473,"media-import.js":8603,"workspace.js":14494};
const downloadedModules=new Set();
let downloadedBytes=0,downloadComplete=false;
const totalModuleBytes=Object.values(moduleSizes).reduce((sum,size)=>sum+size,0);
window.reportStartupActivity=({id,label,state='running'})=>{
 if(finished||bootFailure)return;
 if(id==='app'&&label.startsWith('初始化'))downloadComplete=true;
 if(state==='running'){
  const node=document.querySelector('#boot-label');if(node)node.textContent=label;
 }
};
let resourceObserver;
try{resourceObserver=new PerformanceObserver(list=>{
 if(finished)return;
 for(const entry of list.getEntries()){
  const url=new URL(entry.name,location.href),name=decodeURIComponent(url.pathname).replace(/^\//,'');
  if(url.origin===location.origin&&moduleSizes[name]&&!downloadedModules.has(name)){
   downloadedModules.add(name);downloadedBytes+=moduleSizes[name];
  }
 }
});resourceObserver.observe({type:'resource',buffered:true});}catch{}

// ---- 校徽与外圈要同时出现 ----
// 外圈是 CSS 生成的、页面一开始就有；校徽却是一张要下载的图片。
// 两者不统一控制的话，会先看到一个空转的圈，校徽随后才补上来。
function revealMark(mark) {
  const img = mark.querySelector('img');
  const show = () => mark.classList.add('is-ready');
  if (!img || (img.complete && img.naturalWidth)) return show();
  img.addEventListener('load', show, { once: true });
  img.addEventListener('error', show, { once: true });
}
// 本脚本在 <head> 里同步执行，此刻 #boot-mark 还没解析出来；但也不能等
// DOMContentLoaded —— 它会被 module 脚本一路推迟到 app.js 下载完。
(function watchMark() {
  const mark = document.querySelector('#boot-mark');
  if (mark) return revealMark(mark);
  if (document.readyState === 'loading') requestAnimationFrame(watchMark);
})();

// One linear visual rate; show a waiting state rather than a frozen 99%.
const bar = () => document.querySelector('#boot-bar');
const percent = () => document.querySelector('#boot-percent');

let shown = 0, raf = 0, finishing = false, last = performance.now();
function paint() {
  const line = bar(), text = percent();
  if (line) line.style.width = shown.toFixed(1) + '%';
  if (text) text.textContent = finishing ? '100%' : downloadComplete ? '正在初始化' : '模块下载 '+Math.floor(shown)+'%';
}
function tick(now) {
  const stamp = now || performance.now();
  const dt = Math.min(0.12, (stamp - last) / 1000);
  last = stamp;
  if (!finishing && !finished) {
    shown = Math.min(100, downloadedBytes / Math.max(1,totalModuleBytes) * 100);
    paint();
  }
  raf = requestAnimationFrame(tick);
}
paint();
raf = requestAnimationFrame(tick);

async function completeWorkspace() {
  if (finished || completing) return;
  completing = true;
  finishing = true;
  cancelAnimationFrame(raf);
  const line=bar();if(line)line.style.transition='none';
  shown=100;paint();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    finished = true;
    resourceObserver?.disconnect();
    cancelAnimationFrame(raf);
    shown = 100; paint();
    root.classList.remove('booting');
    root.classList.add('boot-ready');
    const loader = document.querySelector('#startup');
    if (loader) { loader.inert = true; setTimeout(() => loader.remove(), 500); }
  }));
}
window.addEventListener('workspace-ready',completeWorkspace,{once:true});
window.addEventListener('mentor-stage-ready',completeWorkspace,{once:true});
const readyCheck=setInterval(()=>{if(finished){clearInterval(readyCheck);return;}if(root.dataset.workspaceReady==='true')void completeWorkspace();},500);

function showBootFailure(reason){if(finished)return;bootFailure=true;const label=document.querySelector('#boot-label');if(label)label.textContent='工作区未能启动：'+reason;}
window.addEventListener('error',event=>{
 if(finished)return;
 if(/^ResizeObserver loop (completed with undelivered notifications|limit exceeded)\.?$/.test(event.message||''))return;
 if(event.message)showBootFailure(event.message);
 else if(event.target?.tagName==='SCRIPT')showBootFailure('脚本下载失败：'+(event.target.src||'未知脚本').split('/').pop());
},true);
window.addEventListener('workspace-error',event=>showBootFailure(String(event.detail||'初始化异常')));