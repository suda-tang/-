// Keep the first paint stable while the workspace groups its controls.
const root = document.documentElement;
root.classList.add('booting');
if(new URLSearchParams(location.search).get('tour')==='1')root.classList.add('tour-arrival');
let finished = false, completing = false, bootFailure = false;
document.addEventListener('click',event=>{if(event.target.closest?.('#boot-retry'))location.reload();});

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
const RATE = 20, CEILING = 95;
let shown = 0, raf = 0, finishing = false, last = performance.now();
function paint() {
  const line = bar(), text = percent();
  if (line) line.style.width = shown.toFixed(1) + '%';
  if (text) text.textContent = !finishing && shown >= CEILING ? '等待工作区就绪' : Math.floor(shown) + '%';
}
function tick(now) {
  const stamp = now || performance.now();
  const dt = Math.min(0.12, (stamp - last) / 1000);
  last = stamp;
  if (!finishing && !finished) {
    shown = Math.min(CEILING, shown + RATE * dt);
    paint();
  }
  raf = requestAnimationFrame(tick);
}
paint();
raf = requestAnimationFrame(tick);

const timeout = setTimeout(() => {
  if (finished) return;
  const label = document.querySelector('#boot-label');
  if (label&&!bootFailure) label.textContent = '工作区资源仍在下载，请稍候；若网络已中断，可重新载入。';
  document.querySelector('#boot-retry')?.removeAttribute('hidden');
}, 15000);

async function completeWorkspace() {
  if (finished || completing) return;
  completing = true;
  finishing = true;
  cancelAnimationFrame(raf);
  const line=bar();if(line)line.style.transition='none';
  shown=100;paint();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    finished = true;
    clearTimeout(timeout);
    cancelAnimationFrame(raf);
    shown = 100; paint();
    root.classList.remove('booting');
    root.classList.add('boot-ready');
    const loader = document.querySelector('#startup');
    if (loader) { loader.inert = true; setTimeout(() => loader.remove(), 500); }
  }));
}
window.addEventListener('workspace-ready',completeWorkspace,{once:true});
const readyCheck=setInterval(()=>{if(finished){clearInterval(readyCheck);return;}if(root.dataset.workspaceReady==='true')void completeWorkspace();},500);

function showBootFailure(reason){if(finished)return;bootFailure=true;const label=document.querySelector('#boot-label');if(label)label.textContent='工作区未能启动：'+reason;document.querySelector('#boot-retry')?.removeAttribute('hidden');}
window.addEventListener('error',event=>{
 if(finished)return;
 if(/^ResizeObserver loop (completed with undelivered notifications|limit exceeded)\.?$/.test(event.message||''))return;
 if(event.message)showBootFailure(event.message);
 else if(event.target?.tagName==='SCRIPT')showBootFailure('脚本下载失败：'+(event.target.src||'未知脚本').split('/').pop());
},true);
window.addEventListener('workspace-error',event=>showBootFailure(String(event.detail||'初始化异常')));