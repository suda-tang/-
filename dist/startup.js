// Keep the first paint stable while the workspace groups its controls.
const root = document.documentElement;
root.classList.add('booting');
if(new URLSearchParams(location.search).get('tour')==='1')root.classList.add('tour-arrival');
let finished = false, completing = false, bootFailure = false;
document.addEventListener('click',event=>{if(event.target.closest?.('#boot-retry'))location.reload();});

// ---- 校徽与外圈要同时出现 ----
// 外圈是 CSS 生成的、页面一开始就有；校徽却是一张要下载的图片。
// 两者不统一控制的话，会先看到一个空转的圈，校徽随后才补上来 —— 看着像
// 两个东西先后冒出来。这里等校徽真正就位后，再把它们一起淡入。
function revealMark(mark) {
  const img = mark.querySelector('img');
  const show = () => mark.classList.add('is-ready');
  if (!img || (img.complete && img.naturalWidth)) return show();
  img.addEventListener('load', show, { once: true });
  img.addEventListener('error', show, { once: true });
}
// 本脚本在 <head> 里同步执行，此刻 #boot-mark 还没解析出来；但也不能等
// DOMContentLoaded —— 它会被 module 脚本一路推迟到 app.js 下载完，
// 那样校徽反而露面更晚。所以元素一出现就接上。
(function watchMark() {
  const mark = document.querySelector('#boot-mark');
  if (mark) return revealMark(mark);
  if (document.readyState === 'loading') requestAnimationFrame(watchMark);
})();

// ---- 百分比进度 ----
// 只靠 DOMContentLoaded / load / workspace-ready 推进度是不够的：这几个事件
// 全挤在 app.js 下载完的那一刻接连触发，结果进度条前面慢慢挪、最后半秒
// 一口气从两成冲到满格。这里改用「真实已加载的资源数」托底，让它跟着
// 实际下载走，阶段事件只负责保底不倒退。
const bar = () => document.querySelector('#boot-bar');
const percent = () => document.querySelector('#boot-percent');
// 首屏实测约 43 个请求（含 module 动态 import 进来的模块），估计值取略小一点。
const EXPECTED = 40;
let shown = 0, target = 6, raf = 0, speed = 55, last = performance.now();
function paint() {
  const line = bar(), text = percent();
  if (line) line.style.width = shown.toFixed(1) + '%';
  if (text) text.textContent = Math.round(shown) + '%';
}
function resourceFloor() {
  try {
    const done = performance.getEntriesByType('resource').length;
    // 资源全下完也就到 88；剩下的留给工作区初始化和收尾，别一口气占满，
    // 否则真正还在等的时候进度条已经顶到头了。
    return Math.min(88, 6 + (done / EXPECTED) * 82);
  } catch (error) { return 0; }
}
// 匀速推进。原先是按「离目标还差多少的比例」逼近：差得多时冲得飞快、
// 快到了又磨磨蹭蹭，看起来一顿一顿。改成每秒固定走固定的百分点。
function tick(now) {
  const stamp = now || performance.now();
  const dt = Math.min(0.12, (stamp - last) / 1000);
  last = stamp;
  if (!finished) target = Math.max(target, resourceFloor());
  if (shown < target) shown = Math.min(target, shown + speed * dt);
  paint();
  if (!finished) raf = requestAnimationFrame(tick);
}
function advance(to, fast) {
  target = Math.max(target, Math.min(100, to));
  // 收尾时提速：东西其实已经都好了，别让进度条还在那儿慢慢挪。
  if (fast) speed = 260;
}
paint();
raf = requestAnimationFrame(tick);
// 迟迟等不到下一个阶段时（典型是 app.js 下载慢，DOMContentLoaded 和 load
// 都被推迟），也让进度条自己缓缓往前挪，免得看上去卡死在某个数字上。
const creep = setInterval(() => {
  if (finished) { clearInterval(creep); return; }
  // 资源都下完了、工作区还在初始化时也要有进展，不能僵在一个数字上不动。
  if (target < 92) target = Math.min(92, target + 1.2);
}, 350);

const timeout = setTimeout(() => {
  if (finished) return;
  const label = document.querySelector('#boot-label');
  if (label&&!bootFailure) label.textContent = '工作区资源仍在下载，请稍候；若网络已中断，可重新载入。';
  document.querySelector('#boot-retry')?.removeAttribute('hidden');
}, 15000);

// 本脚本在 <head> 里同步执行，此刻 body 还没解析，DOM 查询必须等 DOMContentLoaded。
function onDomReady() {
  advance(22);
  document.querySelector('#boot-retry')?.addEventListener('click', () => location.reload());
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
} else {
  onDomReady();
}
window.addEventListener('load', () => advance(48));
async function completeWorkspace() {
  if (finished||completing) return;completing=true;
  advance(72);
  await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]);
  advance(90);
  // 收尾固定用 450ms 匀速走到 100%：既不会一闪而过，也不会因为剩下多少而
  // 忽快忽慢 —— 之前"停在六十几就一下全好了"，毛病就出在这一段没管住。
  await new Promise(resolve => {
    const from = shown, start = performance.now(), duration = 450;
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
    clearInterval(creep);
    cancelAnimationFrame(raf);
    shown = 100; target = 100; paint();
    root.classList.remove('booting');
    root.classList.add('boot-ready');
    const loader = document.querySelector('#startup');
    if (loader) { loader.inert = true; setTimeout(() => loader.remove(), 500); }
  }));
}
window.addEventListener('workspace-ready',completeWorkspace,{once:true});
const readyCheck=setInterval(()=>{if(finished){clearInterval(readyCheck);return;}if(root.dataset.workspaceReady==='true')void completeWorkspace();},500);

window.addEventListener('workspace-error',event=>{const label=document.querySelector('#boot-label');if(label)label.textContent='工作区加载失败：'+event.detail;document.querySelector('#boot-retry')?.removeAttribute('hidden');});

function showBootFailure(reason){if(finished)return;bootFailure=true;const label=document.querySelector('#boot-label');if(label)label.textContent='工作区未能启动：'+reason;document.querySelector('#boot-retry')?.removeAttribute('hidden');}
window.addEventListener('error',event=>{
 if(finished)return;
 if(/^ResizeObserver loop (completed with undelivered notifications|limit exceeded)\.?$/.test(event.message||''))return;
 if(event.message)showBootFailure(event.message);
 else if(event.target?.tagName==='SCRIPT')showBootFailure('脚本下载失败：'+(event.target.src||'未知脚本').split('/').pop());
},true);
window.addEventListener('workspace-error',event=>showBootFailure(String(event.detail||'初始化异常')));
