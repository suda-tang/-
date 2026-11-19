// Start the catalog request alongside module downloads, not after app initialization.
const catalogController=new AbortController(),catalogTimeout=setTimeout(()=>catalogController.abort(),45000);
window.cloudLibraryRequest=fetch('/api/scores',{signal:catalogController.signal}).then(r=>{if(!r.ok)throw Error('Catalog HTTP '+r.status);return r.json();}).finally(()=>clearTimeout(catalogTimeout));
window.cloudLibraryRequest.catch(()=>{});
// Keep the first paint stable while the workspace groups its controls.
const root = document.documentElement;
root.classList.add('booting');
if(new URLSearchParams(location.search).get('tour')==='1')root.classList.add('tour-arrival');
let finished = false, completing = false, bootFailure = false;


// Keep only the current stage. Resource progress counts completed module bytes.
const moduleSizes={"project-entry.js":2325,"app.js":126309,"practice-evidence.js":963,"range-fill.js":523,"vocal-transport.js":9854,"midi-engraving.js":6954,"midi-loader.js":2345,"drum-layout.js":1325,"duplicate-score.js":1314,"written-expression.js":644,"daw.js":20430,"arrangements.js":8501,"title-candidates.js":1128,"library.js":50156,"library-decks.js":6880,"task-center.js":18100,"instruments.js":2994,"piano-samples.js":3817,"harmony.js":4555,"score.js":14075,"engraving.js":20901,"engraving-plan.js":2748,"midi-notation-layout.js":4869,"midi.js":14290,"import-title.js":1056,"simple-notation.js":11786,"engine.js":6970,"player.js":18782,"performance.js":4397,"score-editing.js":3473,"media-import.js":8603,"workspace.js":14494};
const tourStartup=new URLSearchParams(location.search).get('tour')==='1';
if(tourStartup){for(const key of Object.keys(moduleSizes))delete moduleSizes[key];const cartoon=/^zh(?:-(?:CN|Hans)(?:-CN)?)?$/i.test((new URLSearchParams(location.search).get('lang')||'zh').replaceAll('_','-'));Object.assign(moduleSizes,cartoon?{"project-entry.js":3055,"tour-presentation.js":4722,"narration-opening.js":24105,"narration-avatar.js":18892,"mentor-classroom.js":8962,"mentor-portrait-model.js":12884,"mentor-arrival.js":48192,"vendor/three/three.module.js":603113,"vendor/three/OrbitControls.js":38717,"mentor-cartoon-model.js":97,"mentor-rigged-teacher.js":6991,"mentor-resource-progress.js":947,"vendor/three/GLTFLoader.js":114746,"narration/models/teacher-cc0/woman-casual.glb":586108}:{"project-entry.js":3055,"tour-presentation.js":4722,"narration-opening.js":24105,"narration-avatar.js":18892,"mentor-classroom.js":8962,"mentor-portrait-model.js":12884,"mentor-arrival.js":48192,"vendor/three/three.module.js":603113,"vendor/three/OrbitControls.js":38717,"narration/models/mentor-portrait-surface.json":538220,"narration/models/mentor-reference-face.png":119637});}
const downloadedModules=new Set(),partialModuleBytes=new Map();
let downloadedBytes=0,downloadComplete=false;
const totalModuleBytes=Object.values(moduleSizes).reduce((sum,size)=>sum+size,0);
window.reportStartupActivity=({id,label,state='running'})=>{
 if(finished||bootFailure)return;
 if(id==='app'&&label.startsWith('初始化'))downloadComplete=true;
 if(state==='running'){
  const node=document.querySelector('#boot-label');if(node)node.textContent=label;
 }
};
function accountResource(name,bytes){if(!moduleSizes[name])return;const next=Math.min(moduleSizes[name],Math.max(partialModuleBytes.get(name)||0,bytes));downloadedBytes+=next-(partialModuleBytes.get(name)||0);partialModuleBytes.set(name,next);}
window.addEventListener('mentor-resource-progress',event=>{const {id,loaded,total}=event.detail||{};if(finished||!moduleSizes[id])return;accountResource(id,total?loaded/total*moduleSizes[id]:loaded);});
let resourceObserver;
try{resourceObserver=new PerformanceObserver(list=>{
 if(finished)return;
 for(const entry of list.getEntries()){
  const url=new URL(entry.name,location.href),name=decodeURIComponent(url.pathname).replace(/^\//,'');
  if(url.origin===location.origin&&moduleSizes[name]&&!downloadedModules.has(name)){
   downloadedModules.add(name);accountResource(name,moduleSizes[name]);
   if(downloadedModules.size===Object.keys(moduleSizes).length){downloadComplete=true;const label=document.querySelector('#boot-label');if(label)label.textContent=tourStartup?'数字人资源已下载，正在初始化舞台':'模块已下载，正在初始化工作区';}
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
  if (mark) {const curtain=document.querySelector('#startup');if(curtain?.showPopover){curtain.setAttribute('popover','manual');curtain.showPopover();}return revealMark(mark);}
  if (document.readyState === 'loading') requestAnimationFrame(watchMark);
})();

// One linear visual rate; show a waiting state rather than a frozen 99%.
const bar = () => document.querySelector('#boot-bar');
const percent = () => document.querySelector('#boot-percent');

let shown = 0, raf = 0, finishing = false, last = performance.now();
function paint() {
  const line = bar(), text = percent();
  if (line) line.style.width = shown.toFixed(1) + '%';
  if (text) text.textContent = finishing ? '100%' : downloadComplete ? '正在初始化' : (tourStartup?'数字人资源下载 ':'模块下载 ')+Math.floor(shown)+'%';
}
function tick(now) {
  const stamp = now || performance.now();
  const dt = Math.min(0.12, (stamp - last) / 1000);
  last = stamp;
  if (!finishing && !finished) {
    const target=Math.min(96,downloadedBytes/Math.max(1,totalModuleBytes)*96);
    shown=Math.min(target,shown+Math.max(12,(target-shown)*4)*dt);
    paint();
  }
  raf = requestAnimationFrame(tick);
}
paint();
raf = requestAnimationFrame(tick);

async function completeWorkspace() {
  if (finished || completing) return;
  completing = true;
  await (tourStartup?window.coreStylesReady:window.homeStylesReady);
  const stylesheet=document.querySelector('link[href*="/bundle.css"]');
  if(stylesheet&&!stylesheet.sheet&&!window.workspaceStylesSettled)await new Promise(resolve=>{stylesheet.addEventListener('load',resolve,{once:true});stylesheet.addEventListener('error',resolve,{once:true});});
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
    if (loader) { loader.hidePopover?.();loader.inert = true; setTimeout(() => loader.remove(), 500); }
  }));
}
window.addEventListener('workspace-ready',completeWorkspace,{once:true});
window.addEventListener('mentor-stage-ready',completeWorkspace,{once:true});
if(tourStartup&&window.mentorStageState)void completeWorkspace();
const readyCheck=setInterval(()=>{if(finished){clearInterval(readyCheck);return;}if(root.dataset.workspaceReady==='true')void completeWorkspace();},500);

function showBootFailure(reason){if(finished)return;bootFailure=true;const label=document.querySelector('#boot-label');if(label)label.textContent='工作区未能启动：'+reason;}
window.addEventListener('error',event=>{
 if(finished)return;
 if(/^ResizeObserver loop (completed with undelivered notifications|limit exceeded)\.?$/.test(event.message||''))return;
 if(event.message)showBootFailure(event.message);
 else if(event.target?.tagName==='SCRIPT')showBootFailure('脚本下载失败：'+(event.target.src||'未知脚本').split('/').pop());
},true);
window.addEventListener('workspace-error',event=>showBootFailure(String(event.detail||'初始化异常')));