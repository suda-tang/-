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

// ---- 百分比进度：纯时间驱动 ----
// 之前是「显示值去追一个 target」，而 target 由资源计数、加载阶段、爬行定时器
// 反复改写。于是进度条走到某个数字就停下来等资源，资源到了又猛冲一下，
// 一顿一顿；而且那个爬行定时器把 target 封顶在 92，网络再慢也永远上不去 ——
// 就是「卡在 92」的由来。
//
// 现在彻底解耦：显示值只跟时间走，跟真实下载状态无关。
//   0→90%  快速推进（约 1.5 秒走完），正常的加载过程都落在这段里；
//   90→99.4% 仍然缓慢前进，加载再慢进度条也不会僵住；
//   100% 只在真正全部就绪后，用一段与剩余距离匹配的收尾动画走到。
const bar = () => document.querySelector('#boot-bar');
const percent = () => document.querySelector('#boot-percent');
const FAST_RATE = 62, SLOW_RATE = 1.7, FAST_UNTIL = 90, CEILING = 99.4;
let shown = 0, raf = 0, finishing = false, last = performance.now();
function paint() {
  const line = bar(), text = percent();
  if (line) line.style.width = shown.toFixed(1) + '%';
  if (text) text.textContent = Math.round(shown) + '%';
}
function tick(now) {
  const stamp = now || performance.now();
  const dt = Math.min(0.12, (stamp - last) / 1000);
  last = stamp;
  if (!finishing && !finished) {
    shown = Math.min(CEILING, shown + (shown < FAST_UNTIL ? FAST_RATE : SLOW_RATE) * dt);
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
  // 字体就绪前进度条照常匀速前进，这里只等一小会儿，不让它拖住收尾。
  await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 800))]);
  finishing = true;
  // 收尾时长跟剩余距离挂钩：加载得快时不会从三四成「唰」地跳满，
  // 加载慢时也不会拖成一条长尾巴。
  const remain = 100 - shown;
  const duration = Math.min(1200, Math.max(320, remain * 12));
  await new Promise(resolve => {
    const from = shown, start = performance.now();
    (function step(now) {
      const t = Math.min(1, ((now || performance.now()) - start) / duration);
      shown = from + (100 - from) * t;
      paint();
      if (t < 1) requestAnimationFrame(step); else resolve();
    })(performance.now());
  });
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