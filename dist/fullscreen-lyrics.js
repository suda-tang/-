/**
 * 云曲库「全屏歌词」—— Folia 原版渲染桥接层。
 *
 * 音频仍由云曲库 preview <audio> 播放；歌词原文交给同源 iframe 里的 Folia
 * （AGPL-3.0）用自己的 LyricParserFactory + VisualizerRenderer 渲染。
 * 本层只做：播放控制、与项目「四大金刚键」一致的控件、从按钮缩放展开。
 *
 * 控件样式来源（精确复刻，不另造一套玻璃）：
 *   adaptive-controls.css  .view-buttons button / .active
 *   glass.css              .workspace-nav
 *   liquid-optics.css      .optical-glass-highlight（跟随指针的高光）
 */

import { glassWheelPicker } from './glass-wheel-picker.js';

const FOLIA_URL = '/folia/folia-embed.html';
const CHANNEL = 'folia-embed';
const MODE_STORAGE_KEY = 'piano.folia.mode';
const THEME_STORAGE_KEY = 'piano.folia.theme';
const MODES = [
  ['classic', '经典'], ['nebbia', '薄雾'], ['hanabi', '花火'], ['lumiere', '流光'],
  ['monet', '莫奈'], ['cadenza', '华彩'], ['cappella', '无伴奏'], ['claddagh', '克拉达'],
  ['diorama', '立体'], ['fume', '烟霭'], ['machi', '街町'], ['partita', '组曲'],
  ['pendolo', '钟摆'], ['sonnet', '十四行'], ['still', '静帧'], ['tempera', '蛋彩'],
  ['tilt', '倾角'],
];
const MODE_IDS = MODES.map(([id]) => id);
const MODE_LABEL = Object.fromEntries(MODES);
// Folia 的背景层是独立于歌词动画的另一维，源码 BUILTIN_VISUALIZER_BACKGROUND_MODES：
// common/latent/monet/nomand/sora/url。url 需要自带图床，先不放出来。
const BGS = [
  ['common', '纯色'], ['latent', '潜像'], ['monet', '莫奈'],
  ['nomand', '游牧'], ['sora', '天空'],
];
const BG_LABEL = Object.fromEntries(BGS);
const BG_IDS = BGS.map(([id]) => id);
const BG_STORAGE_KEY = 'piano.folia.bg';
const OFFSET_KEY = 'piano.folia.offset';
const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let session = null;

const el = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
};

const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
};

// 网易云 LRC/YRC 开头常放「作词 : …」「作曲 : …」，Folia 会当歌词行，送入前剔除。
const META_LINE = /^(?:作词|作曲|词|曲|编曲|制作人|制作|和声|合声|配唱|录音|混音|母带|OP|SP|出品|发行|监制|统筹|企划|吉他|鼓|贝斯|键盘|弦乐|人声|乐器|演唱|原唱|Lyricist|Composer|Arranger|Producer|Mixed|Mastered|Recording)(?:编写|制作|监制|录音|混音|统筹|演奏|编排|工程|助理|指导)?\s*[:：]/i;
function stripMeta(text) {
  return String(text || '').split(/\r?\n/).filter((line) => {
    const lrc = line.match(/^\[(\d{1,3}):(\d{2})(?:\.(\d+))?\]/);
    const yrc = line.match(/^\[(\d+),\d+\]/);
    const sec = lrc ? (+lrc[1]) * 60 + (+lrc[2]) : (yrc ? (+yrc[1]) / 1000 : -1);
    if (sec < 0 || sec > 30) return true;
    const body = line.replace(/^\[[^\]]+\]/, '').replace(/\(\d+,\d+,\d+\)/g, '').trim();
    return !META_LINE.test(body);
  }).join('\n');
}

/* ------------------------------------------------------------------ *
 * 转谱面板（iOS 毛玻璃浮层）
 *
 * 以前「联网找歌与转谱」是云曲库里的一整块表单；现在歌已经在放了，
 * 选项就只剩两个下拉（音频内容 / 转谱类型），所以挪到全屏歌词顶栏，
 * 点一下弹面板、确认就开跑，进度实时显示，关掉面板只是最小化。
 * ------------------------------------------------------------------ */
const TX_RECORDING = [
  ['', '完整歌曲／多件乐器'], ['piano', '钢琴独奏'], ['voice', '人声清唱'],
  ['guitar', '吉他独奏'], ['melody', '单旋律乐器'],
];
const TX_BUSY = new Set(['queued', 'pending', 'running', 'processing', 'generating', 'analyzing']);

async function txApi(body) {
  const r = await fetch('/api/online-music', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch (_) { /* 非 JSON */ }
  if (!r.ok) throw new Error((data && data.error) || '转谱服务暂不可用');
  return data || {};
}

function buildTranscribePanel(s, { onActive } = {}) {
  const panel = el('div', 'fsl-tx');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '转成曲谱');

  const head = el('div', 'fsl-tx-head');
  const title = el('span', 'fsl-tx-title', '转成曲谱');
  const close = el('button', 'fsl-tx-close');
  close.type = 'button';
  close.title = '收起（转谱继续在后台进行）';
  close.setAttribute('aria-label', '收起面板');
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
    + ' stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  head.append(title, close);

  const recRow = el('div', 'fsl-tx-row');
  const recSel = document.createElement('select');
  recSel.setAttribute('aria-label', '音频内容');
  for (const [value, text] of TX_RECORDING) {
    const o = document.createElement('option');
    o.value = value; o.textContent = text; recSel.append(o);
  }
  recRow.append(glassWheelPicker(recSel, '音频内容'));

  const modeRow = el('div', 'fsl-tx-row');
  const modeSel = document.createElement('select');
  modeSel.setAttribute('aria-label', '转谱类型');
  const first = document.createElement('option');
  first.value = 'piano.full'; first.textContent = '钢琴原版（旋律与伴奏）';
  modeSel.append(first);
  modeRow.append(glassWheelPicker(modeSel, '转谱类型'));

  const go = el('button', 'fsl-tx-go', '开始转谱');
  go.type = 'button';
  const bar = el('div', 'fsl-tx-bar');
  const fill = el('i');
  bar.append(fill);
  bar.hidden = true;
  const note = el('p', 'fsl-tx-note', '');
  note.hidden = true;

  panel.append(head, recRow, modeRow, go, bar, note);

  const state = { id: null, status: 'idle', progress: 0, detail: '', scoreId: null, open: false, timer: null };
  let modesLoaded = false;

  async function loadModes() {
    if (modesLoaded) return;
    try {
      const data = await txApi({ action: 'modes' });
      const groups = data.instruments || [];
      if (!groups.length) return;
      modeSel.replaceChildren();
      for (const group of groups) {
        const og = document.createElement('optgroup');
        og.label = group.name;
        for (const style of group.styles || []) {
          const o = document.createElement('option');
          o.value = style.id; o.textContent = style.label; og.append(o);
        }
        modeSel.append(og);
      }
      if (modeSel.querySelector('option[value="piano.full"]')) modeSel.value = 'piano.full';
      modesLoaded = true;
    } catch (_) { /* 拿不到就留在静态兜底项 */ }
  }

  function syncButton() {
    const btn = s.txBtn;
    if (!btn) return;
    const pct = Math.max(0, Math.min(100, Math.round(state.progress || 0)));
    if (state.status === 'complete') {
      btn.textContent = '曲谱';
      btn.dataset.busy = '0';
      btn.style.removeProperty('--tx-progress');
    } else if (TX_BUSY.has(state.status)) {
      btn.textContent = '转谱 ' + pct + '%';
      btn.dataset.busy = '1';
      btn.style.setProperty('--tx-progress', pct + '%');
    } else {
      btn.textContent = '转谱';
      btn.dataset.busy = '0';
      btn.style.removeProperty('--tx-progress');
    }
  }

  function apply(job) {
    if (!job) return;
    state.status = job.status || state.status;
    state.progress = Number(job.progress) || state.progress;
    state.detail = job.detail || state.detail;
    if (job.scoreId) state.scoreId = job.scoreId;

    const busy = TX_BUSY.has(state.status);
    bar.hidden = state.status === 'idle';
    fill.style.width = Math.max(0, Math.min(100, state.progress)) + '%';
    note.hidden = !state.detail && state.status !== 'complete';
    note.classList.toggle('is-error', state.status === 'failed');
    if (state.status === 'complete') {
      note.textContent = '已生成曲谱，点下方按钮打开。';
      go.disabled = false; go.textContent = '打开曲谱';
    } else if (state.status === 'failed') {
      note.textContent = state.detail || '转谱失败，可换个类型重试。';
      go.disabled = false; go.textContent = '重试';
    } else if (busy) {
      note.textContent = (state.detail || '正在处理') + ' · ' + Math.round(state.progress) + '%';
      go.disabled = true; go.textContent = '处理中';
    } else {
      go.disabled = false; go.textContent = '开始转谱';
    }
    syncButton();
  }

  function poll() {
    clearInterval(state.timer);
    state.timer = setInterval(async () => {
      if (!state.id || !s.tx || s.tx.panel !== panel) { clearInterval(state.timer); return; }
      try {
        const cur = await txApi({ action: 'status', id: state.id });
        apply(cur);
        if (cur.status === 'complete' || cur.status === 'failed') clearInterval(state.timer);
      } catch (_) { /* 网络抖一下，下一轮再问 */ }
    }, 2500);
  }

  async function start() {
    go.disabled = true; go.textContent = '正在创建任务…';
    note.hidden = false; note.classList.remove('is-error');
    note.textContent = '正在提交…';
    try {
      const job = await txApi({
        action: 'start',
        itemId: s.catalogId,
        mode: modeSel.value,
        recording: recSel.value,
      });
      state.id = job.id;
      state.status = job.status || 'queued';
      state.progress = Number(job.progress) || 0;
      apply(job);
      poll();
    } catch (error) {
      note.classList.add('is-error');
      note.textContent = error.message || '转谱启动失败';
      go.disabled = false; go.textContent = '重试';
    }
  }

  go.onclick = () => {
    onActive?.();
    if (state.status === 'complete' && state.scoreId) {
      const id = state.scoreId;
      closeFolia();
      document.dispatchEvent(new CustomEvent('open-library-score', { detail: { id } }));
      return;
    }
    if (TX_BUSY.has(state.status)) return;
    void start();
  };
  close.onclick = () => { onActive?.(); hide(); };

  function hide() {
    state.open = false;
    panel.hidden = true;
  }
  function toggle() {
    onActive?.();
    state.open = !state.open;
    panel.hidden = !state.open;
    if (state.open) void loadModes();
  }

  return { panel, toggle, hide, state, apply };
}

/* iframe 里的手势桥接：同源文档可以直接监听。
   轻点（<420ms 且位移 <6px）→ 切换控件；其余交给 Folia 自己处理拖动。 */
function bindFrameTaps(s) {
  const bind = () => {
    let doc = null;
    try { doc = s.frame && s.frame.contentDocument; } catch (_) { return; }
    if (!doc || doc.__fslTapBound) return;
    doc.__fslTapBound = true;
    let t0 = 0, x0 = 0, y0 = 0, moved = false;
    doc.addEventListener('pointerdown', (e) => {
      t0 = Date.now(); x0 = e.clientX; y0 = e.clientY; moved = false;
    }, true);
    doc.addEventListener('pointermove', (e) => {
      if (!t0) return;
      if (Math.hypot(e.clientX - x0, e.clientY - y0) > 6) moved = true;
    }, true);
    const end = () => {
      const tap = t0 && !moved && Date.now() - t0 < 420;
      t0 = 0;
      if (!tap || session !== s) return;
      if (s.root.classList.contains('is-idle')) s.markActive();
      else s.toggleControls(true);
    };
    doc.addEventListener('pointerup', end, true);
    doc.addEventListener('pointercancel', () => { t0 = 0; }, true);
  };
  if (s.frame) {
    s.frame.addEventListener('load', bind);
    bind();
  }
}

function injectStyles() {
  if (document.getElementById('fsl-folia-styles')) return;
  const style = document.createElement('style');
  style.id = 'fsl-folia-styles';
  style.textContent = `
/* 最上层 UI：盖住项目内所有面板、导航、浮层 */
/* 云曲库是 <dialog>.showModal()，在浏览器 top layer 里 —— 只靠 z-index 压不住。
   自己也进 top layer（popover=manual，不会被 Esc 自动关），才能盖在它上面。 */
.fsl-folia-root{position:fixed;inset:0;z-index:2147483647;background:#09090b;color:#5e4b58;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  overflow:hidden;-webkit-font-smoothing:antialiased}
/* 自己也是一个 modal dialog：后 showModal 的 dialog 一定在 top layer 栈顶，
   才能盖住云曲库那个同样 showModal 的 dialog（popover 实测压不住）。
   ⚠ 项目 media-import.css 有 .studio dialog{border-radius:25px;padding:24px;
     background:#f8f5fa;box-shadow:...}，特异性 (0,1,1) 高于单个 class (0,1,0)，
     会把整屏套成浅色圆角卡片 —— 所以这里重复 class 把特异性提到 (0,2,0) 再全部清零。 */
.fsl-folia-root.fsl-folia-root{border:0;padding:0;margin:0;max-width:none;max-height:none;
  width:100vw;height:100dvh;inset:0;overflow:hidden;background:#09090b;
  border-radius:0;box-shadow:none}
.fsl-folia-root.fsl-folia-root:modal{width:100vw;height:100dvh;max-width:none;max-height:none;
  margin:0;inset:0;border-radius:0;padding:0}
.fsl-folia-root.fsl-folia-root::backdrop{background:transparent}
/* 1:1 铺满。Folia 的画布是归一化的（实测 200% 缩放后 canvas 仍是 1215×759，
   画质不会提升），但 200%+scale(.5) 会让合成层面积翻 4 倍 —— 这是卡顿的主因。
   事件要留给 Folia 自己（街町等模式支持拖动改 3D 视角），
   所以这里放开 pointer-events，改由 bindFrameTaps() 在同源 iframe 文档里
   区分「轻点」和「拖动」：轻点切控件，拖动交给 Folia。 */
.fsl-folia-frame{position:absolute;left:0;top:0;width:100%;height:100%;border:0;background:#09090b;
  pointer-events:auto}

/* ---- 面板：直接沿用云曲库「改编」按钮所在容器的样式 ----
   score-classroom.css → .library-online-music
   {background:#ffffff70;border:1px solid #ffffffc9;border-radius:20px;box-shadow:0 4px 18px #49374708}
   半透明白压在 Folia 深色画面上会发灰，所以叠一层同色系模糊兜住。 */
.fsl-panel{position:relative;isolation:isolate;--glass-x:50%;--glass-y:0%;
  background:#ffffff70;
  border:1px solid #ffffffc9;
  box-shadow:0 4px 18px #49374708;
  backdrop-filter:blur(20px) saturate(1.5);
  -webkit-backdrop-filter:blur(20px) saturate(1.5);
  border-radius:20px}
/* liquid-optics.css 的指针跟随高光 */
.fsl-panel::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;border-radius:inherit;
  background:radial-gradient(ellipse at var(--glass-x) var(--glass-y),#ffffff70 0,transparent 62%);
  opacity:.42;transition:opacity .24s ease;
  box-shadow:inset 1px 1px 0 #ffffff9c,inset -1px -1px 0 #94859a16}
.fsl-panel:hover::before{opacity:.8}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .fsl-panel{background:#f6f2f7}}

/* ---- 按钮：胶囊形（两端全圆，侧面没有直边）+ 内容绝对居中 ----
   底色/描边/文字色仍是云曲库「改编」按钮那一套
   （score-classroom.css → .library-online-music button，#87435728 边 + #fff9 底 + #874357 字），
   只是把 20px 直角圆角换成 999px 胶囊，并用 flex 保证图标和文字都真正居中。 */
.fsl-key{position:relative;z-index:2;box-sizing:border-box;
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  border:1px solid #87435728;border-radius:999px;
  background:#fff9;
  color:#874357;
  min-width:0;min-height:36px;height:clamp(36px,3.6vw,42px);padding:0 clamp(14px,1.4vw,18px);
  font-size:clamp(11px,1.1vw,13px);font-family:inherit;font-weight:500;line-height:1;
  white-space:nowrap;cursor:pointer;
  backdrop-filter:blur(12px) saturate(1.4);-webkit-backdrop-filter:blur(12px) saturate(1.4);
  transition:background .24s,color .24s,border-color .24s,scale .18s}
.fsl-key:hover{background:#fffc}
.fsl-key:active{scale:.97}
.fsl-key:focus-visible{outline:2px solid #874357;outline-offset:2px}
.fsl-key.is-on{background:#874357;border-color:#874357;color:#fff}
.fsl-key:disabled{opacity:.45}
/* 图标统一 18px，且不参与 flex 的伸缩，避免不同图标的视觉重心不一致 */
.fsl-key svg{width:18px;height:18px;flex:0 0 auto;display:block;pointer-events:none}

/* 顶栏：返回 / 曲名 / 明暗 / 模式 */
.fsl-top{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));
  left:calc(16px + env(safe-area-inset-left,0px));right:calc(16px + env(safe-area-inset-right,0px));
  z-index:3;display:flex;align-items:center;gap:10px;max-width:1180px;margin:0 auto;padding:12px}
/* 三个圆钮统一 44×44、padding 0，靠上面的 flex 居中 */
.fsl-round{flex:0 0 auto;width:44px;height:44px;min-width:44px;min-height:44px;padding:0}
.fsl-title{flex:1;min-width:0;position:relative;z-index:2;font-size:14px;font-weight:600;
  color:#5e4b58;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-shadow:0 1px 0 #fff9}
.fsl-mode-btn{flex:0 0 auto;min-width:76px}

/* 模式面板 */
.fsl-modes{position:absolute;z-index:5;top:calc(72px + env(safe-area-inset-top,0px));
  right:calc(16px + env(safe-area-inset-right,0px));width:min(340px,calc(100vw - 32px));
  max-height:min(62vh,460px);overflow:auto;padding:12px;display:block;
  overscroll-behavior:contain}
.fsl-modes[hidden]{display:none}
.fsl-modes-group+.fsl-modes-group{margin-top:12px}
.fsl-modes-label{position:relative;z-index:2;font-size:11px;font-weight:600;letter-spacing:.06em;
  color:#8d7691;margin:0 2px 7px}
.fsl-modes-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.fsl-modes .fsl-key{width:100%;height:34px;min-height:34px;padding:0 8px;font-size:12px}
.fsl-folia-root.is-dark .fsl-modes-label{color:rgba(244,240,246,.62)}

/* 底栏：播放 / 进度 / 时间（同一行，无信息标签行） */
.fsl-bottom{position:absolute;z-index:3;bottom:calc(18px + env(safe-area-inset-bottom,0px));
  left:50%;transform:translateX(-50%);width:min(760px,calc(100vw - 32px));
  display:flex;align-items:center;gap:12px;padding:12px}

/* 播放中 3 秒无操作 → 上下控件淡出；点上下区域唤回 */
.fsl-hot{position:absolute;left:0;right:0;z-index:2;background:transparent}
.fsl-hot-top{top:0;height:calc(94px + env(safe-area-inset-top,0px))}
.fsl-hot-bottom{bottom:0;height:calc(104px + env(safe-area-inset-bottom,0px))}
/* 播放中/暂停时 3 秒无操作 → 上下控件淡出；点任意位置唤回。
   特异性要压过下面那条统一 transition（它没有 transform，会让淡出变硬跳）。 */
.fsl-folia-root .fsl-top,.fsl-folia-root .fsl-bottom{transition:opacity .34s ease,transform .34s ease,
  background .45s ease,border-color .45s ease,box-shadow .45s ease}
/* 注意底栏本来就有 translateX(-50%) 用来居中 —— 淡出时必须带上，否则会横跳 */
.fsl-folia-root.is-idle .fsl-top{opacity:0;transform:translateY(-14px);pointer-events:none}
.fsl-folia-root.is-idle .fsl-bottom{opacity:0;transform:translate(-50%,14px);pointer-events:none}
/* 播放/暂停也用 SVG，别用 ▶ ❚❚ 字符：不同字体的符号基线与内边距不一样，
   在圆钮里永远看着偏上/偏左。 */
.fsl-play{flex:0 0 auto;width:44px;height:44px;min-width:44px;min-height:44px;padding:0}
.fsl-play svg{width:17px;height:17px}
.fsl-play[data-state="play"] svg{margin-left:2px}   /* 三角形视觉重心偏左，补 2px */
/* 自定义进度条：knob 用 top:50% + translateY(-50%) 严格居中，
   原生 range 的 margin-top 会因 track 高度不同而错位。 */
.fsl-seek{position:relative;z-index:2;flex:1;min-width:0;height:26px;display:flex;align-items:center;
  cursor:pointer;touch-action:none;outline:none}
.fsl-seek:focus-visible{outline:2px solid #806482;outline-offset:3px;border-radius:100px}
.fsl-track{position:relative;width:100%;height:6px;border-radius:100px;background:#d8ced9;
  box-shadow:inset 0 1px 2px #54324c22}
.fsl-fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:100px;
  background:linear-gradient(90deg,#c49bb4,#806482)}
.fsl-knob{position:absolute;top:50%;left:0;width:14px;height:14px;margin:0 0 0 -7px;
  transform:translateY(-50%);border-radius:50%;border:1px solid #fff;
  background:linear-gradient(140deg,#fff,#ede5ee);box-shadow:0 1px 4px #54324830;pointer-events:none}
.fsl-time{position:relative;z-index:2;flex:0 0 auto;font-size:12px;color:#67546a;
  font-variant-numeric:tabular-nums;white-space:nowrap;text-shadow:0 1px 0 #fff9}

/* 只在真的失败时出现，用项目 .primary 的深红紫，不常驻、不刷屏 */
.fsl-alert{position:absolute;z-index:6;bottom:calc(92px + env(safe-area-inset-bottom,0px));
  left:50%;transform:translateX(-50%);width:min(520px,calc(100vw - 32px));
  padding:12px 18px;border-radius:20px;font-size:13px;line-height:1.55;text-align:center;color:#fff;
  background:linear-gradient(155deg,#aa596d,#83394e);
  border:1px solid #ffffff78;box-shadow:0 5px 14px #87364b26,inset 0 1px #ffffff55}
.fsl-alert[hidden]{display:none}

/* ---- 转谱面板：iOS 毛玻璃浮层（可从顶栏按钮打开，关闭只是最小化，任务继续跑） ---- */
.fsl-tx{position:absolute;z-index:8;left:50%;bottom:calc(98px + env(safe-area-inset-bottom,0px));
  transform:translateX(-50%);width:min(430px,calc(100vw - 28px));
  border-radius:30px;padding:14px 16px 15px;box-sizing:border-box;
  background:rgba(26,23,31,.60);
  border:1px solid rgba(255,255,255,.16);
  box-shadow:0 26px 70px rgba(0,0,0,.52),inset 0 1px 0 rgba(255,255,255,.16);
  backdrop-filter:blur(44px) saturate(190%);-webkit-backdrop-filter:blur(44px) saturate(190%);
  color:#f4f0f6;font-size:13px}
.fsl-tx[hidden]{display:none}
.fsl-tx-head{display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:0 2px}
.fsl-tx-title{flex:1;min-width:0;font-size:14px;font-weight:600;letter-spacing:.01em}
.fsl-tx-close{flex:0 0 auto;width:30px;height:30px;padding:0;border-radius:999px;
  display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
  border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.12);color:#f4f0f6;
  transition:background .2s}
.fsl-tx-close:hover{background:rgba(255,255,255,.2)}
.fsl-tx-close svg{width:14px;height:14px}
.fsl-tx-row{display:grid;gap:6px;margin-bottom:10px}
.fsl-tx-row>span{font-size:11px;letter-spacing:.05em;color:rgba(244,240,246,.58)}
/* 面板里的两个下拉 = 云曲库那套 glassWheelPicker，形状/尺寸/轮盘样式一律沿用全局定义，
   一个字都不覆盖（以前在这里另写了一套胶囊触发器，所以两边长得不一样）。
   深色面板上只把标签提亮，别让它糊进背景。 */
.fsl-tx .music-wheel-picker{width:100%;display:grid;gap:6px}
.fsl-folia-root.is-dark .fsl-tx .music-wheel-label{color:rgba(244,240,246,.66)}
.fsl-tx-go{width:100%;min-height:44px;border-radius:999px;cursor:pointer;
  border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.92);color:#40253a;
  font-size:14px;font-weight:600;font-family:inherit;
  transition:background .2s,opacity .2s}
.fsl-tx-go:hover{background:#fff}
.fsl-tx-go:disabled{opacity:.55;cursor:default}
.fsl-tx-bar{position:relative;height:6px;border-radius:999px;margin:2px 0 0;
  background:rgba(255,255,255,.16);overflow:hidden}
.fsl-tx-bar>i{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:999px;
  background:linear-gradient(90deg,#cba9c6,#fff);transition:width .45s ease}
.fsl-tx-note{margin:9px 2px 0;font-size:12px;line-height:1.5;text-align:center;
  color:rgba(244,240,246,.72);min-height:1.5em}
.fsl-tx-note.is-error{color:#ffc4cf}
/* 浅色控件态 */
.fsl-folia-root:not(.is-dark) .fsl-tx{
  background:rgba(252,250,253,.72);border-color:rgba(255,255,255,.9);
  box-shadow:0 26px 70px rgba(72,52,74,.22),inset 0 1px 0 #fff;color:#4a3548}
.fsl-folia-root:not(.is-dark) .fsl-tx-row>span{color:#8d7691}
.fsl-folia-root:not(.is-dark) .fsl-tx-close{border-color:#87435728;background:#fff9;color:#874357}
.fsl-folia-root:not(.is-dark) .fsl-tx-go{background:#874357;border-color:#874357;color:#fff}
.fsl-folia-root:not(.is-dark) .fsl-tx-bar{background:rgba(135,67,87,.16)}
.fsl-folia-root:not(.is-dark) .fsl-tx-bar>i{background:linear-gradient(90deg,#c49bb4,#874357)}
.fsl-folia-root:not(.is-dark) .fsl-tx-note{color:#7a6379}
/* 顶栏转谱按钮的进度态 */
.fsl-tx-btn[data-busy="1"]{position:relative;overflow:hidden}
.fsl-tx-btn[data-busy="1"]::after{content:'';position:absolute;left:0;bottom:0;height:2px;
  width:var(--tx-progress,0%);background:currentColor;opacity:.65;transition:width .5s ease}

/* Folia 默认暗色主题，加载层也用深色，避免展开瞬间闪一片白 */
.fsl-loading{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;
  background:rgba(10,9,13,.66);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px)}
.fsl-loading>div{padding:16px 24px;border-radius:20px;font-size:13px;color:#f2eef5;text-align:center;
  background:linear-gradient(135deg,rgba(38,33,42,.88),rgba(22,19,26,.80));
  border:1px solid rgba(255,255,255,.16);
  box-shadow:0 10px 30px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.14)}

@media (max-width:640px){
  .fsl-top{left:calc(10px + env(safe-area-inset-left,0px));right:calc(10px + env(safe-area-inset-right,0px));
    gap:7px;padding:10px;border-radius:20px}
  .fsl-title{font-size:13px}
  .fsl-key{font-size:12px;padding:0 12px}     /* 只缩左右，别动高度，胶囊才不变形 */
  .fsl-mode-btn{min-width:auto}
  .fsl-bottom{width:calc(100vw - 20px);bottom:calc(10px + env(safe-area-inset-bottom,0px));
    gap:9px;padding:10px;border-radius:20px}
  .fsl-round{width:42px;height:42px;min-width:42px;min-height:42px}
  .fsl-play{width:42px;height:42px;min-width:42px;min-height:42px}
  .fsl-time{font-size:11px}
  .fsl-alert{bottom:calc(86px + env(safe-area-inset-bottom,0px));font-size:12px}
  .fsl-tx{width:calc(100vw - 20px);bottom:calc(88px + env(safe-area-inset-bottom,0px));
    border-radius:26px;padding:12px 14px 13px}
  .fsl-modes{top:calc(64px + env(safe-area-inset-top,0px));right:calc(10px + env(safe-area-inset-right,0px));
    grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:10px}
}
@media (max-width:380px){.fsl-time{font-size:10px}.fsl-title{font-size:12px}}
@media (max-height:520px){
  .fsl-top{top:calc(8px + env(safe-area-inset-top,0px));padding:6px 9px}
  .fsl-bottom{bottom:calc(8px + env(safe-area-inset-bottom,0px));padding:7px 10px}
  .fsl-alert{bottom:calc(74px + env(safe-area-inset-bottom,0px))}
  .fsl-modes{max-height:44vh;top:calc(56px + env(safe-area-inset-top,0px))}
}
/* ---- 跟随 Folia 背景深浅自动切换的深色模式 ---- */
/* 注意不要把 .fsl-key / .fsl-top / .fsl-bottom 放进来：这条在文件后面，
   会覆盖它们各自的 transition（含没有的 scale/transform），让按压和淡出变硬跳。 */
.fsl-panel,.fsl-title,.fsl-time,.fsl-track,.fsl-fill,.fsl-knob,.fsl-panel::before{
  transition:background .45s ease,color .45s ease,border-color .45s ease,box-shadow .45s ease,opacity .3s}
.fsl-folia-root.is-dark .fsl-panel{
  background:linear-gradient(135deg,rgba(26,23,30,.74),rgba(18,16,22,.64));
  border-color:rgba(255,255,255,.22);
  box-shadow:0 8px 26px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.16),inset 0 -1px 0 rgba(255,255,255,.05)}
.fsl-folia-root.is-dark .fsl-panel::before{opacity:.16}
.fsl-folia-root.is-dark .fsl-title{color:#f4f0f6;text-shadow:0 1px 4px rgba(0,0,0,.55)}
.fsl-folia-root.is-dark .fsl-time{color:rgba(244,240,246,.76);text-shadow:0 1px 4px rgba(0,0,0,.55)}
.fsl-folia-root.is-dark .fsl-key{
  background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.26);color:#f6f2f8;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20),0 3px 12px rgba(0,0,0,.30)}
.fsl-folia-root.is-dark .fsl-key:hover{background:rgba(255,255,255,.17)}
.fsl-folia-root.is-dark .fsl-key.is-on{
  background:rgba(255,255,255,.26);border-color:rgba(255,255,255,.42);color:#fff}
.fsl-folia-root.is-dark .fsl-track{background:rgba(255,255,255,.20);box-shadow:inset 0 1px 2px rgba(0,0,0,.35)}
.fsl-folia-root.is-dark .fsl-fill{background:linear-gradient(90deg,rgba(255,255,255,.55),#fff)}
.fsl-folia-root.is-dark .fsl-knob{background:#fff;border-color:rgba(255,255,255,.92)}
.fsl-folia-root.is-dark .fsl-alert{background:linear-gradient(155deg,#b36276,#8d4056)}

/* 音频迟迟没开始时，让播放键轻微呼吸，提示这里可以点 */
.fsl-key.is-attention{animation:fsl-breathe 1.5s ease-in-out infinite}
@keyframes fsl-breathe{
  0%,100%{box-shadow:inset 0 1px #fff,0 3px 12px #54324c12,0 0 0 0 rgba(128,100,130,.45)}
  50%{box-shadow:inset 0 1px #fff,0 3px 12px #54324c12,0 0 0 9px rgba(128,100,130,0)}
}

@media (prefers-reduced-motion:reduce){
  .fsl-key,.fsl-panel,.fsl-panel::before,.fsl-title,.fsl-time,.fsl-track,.fsl-fill,.fsl-knob{transition:none}
  .fsl-key.is-attention{animation:none}}
`;
  document.head.append(style);
}

/** 从按钮位置缩放展开 / 收起。不调用浏览器 requestFullscreen —— 它会打断动画，也会干扰音频。 */
function originTransform(root, originEl) {
  if (!originEl || !originEl.isConnected) return null;
  const r = originEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const scale = Math.max(0.03, Math.min(r.width / window.innerWidth, r.height / window.innerHeight));
  return { origin: `${cx}px ${cy}px`, scale };
}

/**
 * 用 Web Animations 而不是 CSS transition：只动 transform/opacity 两个合成属性，
 * 不会被 iframe 加载抢走主线程（之前的 CSS 版本实测被卡了 700ms 才起步）。
 */
function animateOpen(root, originEl) {
  const t = originTransform(root, originEl);
  if (!t || REDUCED() || typeof root.animate !== 'function') return Promise.resolve();
  root.style.transformOrigin = t.origin;
  root.style.willChange = 'transform, opacity';
  let anim;
  try {
    anim = root.animate(
      [{ transform: `scale(${t.scale})`, opacity: 0.15 },
       { transform: 'scale(1)', opacity: 1 }],
      { duration: 420, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'both' },
    );
  } catch (_) { return Promise.resolve(); }
  return anim.finished.then(() => {
    try { anim.cancel(); } catch (_) {}
    root.style.transformOrigin = '';
    root.style.willChange = '';
  }).catch(() => {});
}

function animateClose(root, originEl) {
  if (!root) return;
  const done = () => {
    try { root.close?.(); } catch (_) {}
    root.remove();
  };
  const t = originTransform(root, originEl);
  if (!t || REDUCED() || typeof root.animate !== 'function') { done(); return; }
  root.style.transformOrigin = t.origin;
  let anim;
  try {
    anim = root.animate(
      [{ transform: 'scale(1)', opacity: 1 },
       { transform: `scale(${t.scale})`, opacity: 0 }],
      { duration: 280, easing: 'cubic-bezier(.4,0,.9,.4)', fill: 'both' },
    );
  } catch (_) { done(); return; }
  anim.finished.then(done).catch(done);
}

function closeFolia() {
  if (!session) return;
  const s = session;
  session = null;
  clearInterval(s.clockTimer);
  clearInterval(s.uiTimer);
  clearInterval(s.watchTimer);
  clearInterval(s.tx?.state?.timer);
  clearTimeout(s.loadTimer);
  clearTimeout(s.themeLockTimer);
  clearTimeout(s.alertTimer);
  clearTimeout(s.idleTimer);
  if (s.markActive) s.audio.removeEventListener('play', s.markActive);
  if (s.onPauseReset) s.audio.removeEventListener('pause', s.onPauseReset);
  if (s.onMessage) window.removeEventListener('message', s.onMessage);
  if (s.onKey) document.removeEventListener('keydown', s.onKey, true);
  if (s.syncToggle) {
    s.audio.removeEventListener('play', s.syncToggle);
    s.audio.removeEventListener('pause', s.syncToggle);
  }
  if (s.sendClock) {
    for (const evt of ['play', 'pause', 'seeked', 'timeupdate', 'durationchange']) {
      s.audio.removeEventListener(evt, s.sendClock);
    }
  }
  for (const [evt, fn] of s.audioGuards || []) s.audio.removeEventListener(evt, fn);
  try { s.audio.removeAttribute('data-folia-audio'); } catch (_) {}
  animateClose(s.root, s.originEl);
}

function showAlert(s, text, persistent = false) {
  if (!s.alert || !session || session !== s) return;
  s.alert.textContent = text;
  s.alert.hidden = false;
  clearTimeout(s.alertTimer);
  if (!persistent) s.alertTimer = setTimeout(() => { s.alert.hidden = true; }, 6000);
}

/** 单一播放入口，避免 pointerdown 与 click 两次 play() 撞出 AbortError。 */
function playAudio(s) {
  const a = s.audio;
  if (!a.paused) return Promise.resolve();
  if (s.playPromise) return s.playPromise;
  let p;
  try { p = a.play(); } catch (error) { return Promise.reject(error); }
  if (!p || typeof p.then !== 'function') return Promise.resolve();
  s.playPromise = p;
  const clear = () => { if (s.playPromise === p) s.playPromise = null; };
  p.then(clear, clear);
  return p;
}

/** 按真实 error.name 给提示，不再用一句「被浏览器拦截」包打天下。 */
function handlePlayError(s, error) {
  if (!error || error.name === 'AbortError') return;   // 并发/切歌导致的中断，不是故障
  if (error.name === 'NotSupportedError' || s.audio.error) {
    showAlert(s, '该版本无法试听（音频加载失败），请返回换一个版本。', true);
    return;
  }
  if (error.name === 'NotAllowedError') {
    showAlert(s, '播放被浏览器拦下，再轻触一次播放键即可。');
    return;
  }
  showAlert(s, '播放失败：' + (error.message || error.name));
}

function attachPlaybackGuards(s) {
  const a = s.audio;
  const onError = () => showAlert(s, '该版本无法试听（音频加载失败），请返回换一个版本。', true);
  const onPlaying = () => { if (s.alert) s.alert.hidden = true; };
  const guards = [['error', onError], ['playing', onPlaying]];
  for (const [evt, fn] of guards) a.addEventListener(evt, fn);
  s.audioGuards = guards;
  if (a.error) onError();

  // 用户第一次点界面任意位置时补播（只走单一入口，不会与按钮点击并发）。
  s.onFirstPointer = () => {
    if (a.paused) playAudio(s).catch((error) => handlePlayError(s, error));
  };
  s.root.addEventListener('pointerdown', s.onFirstPointer, { once: true });
}

/**
 * 播放看护：真实使用里 0:00 通常来自三种静默失败 ——
 * 源被列表页 stopPreview 清掉、play() 在异步链里被拦、缓冲卡住不动。
 * 这里统一兜住，并把卡住的状态显式呈现出来。
 */
function startPlaybackWatch(s) {
  s.watchTimer = setInterval(() => {
    if (!session || session !== s) return;
    const a = s.audio;

    // 1) 源被外部清空（列表页 stopPreview / 切歌）
    if (!a.getAttribute('src') && s.mediaSrc) {
      a.src = s.mediaSrc;
      try { a.load(); } catch (_) {}
      playAudio(s).catch((error) => handlePlayError(s, error));
      return;
    }

    // 2) 正常在播，或还没到判定的阶段
    if (a.paused || a.currentTime > 0.25 || a.readyState >= 3) {
      s.stuckSince = 0;
      s.playBtn?.classList.remove('is-attention');
      return;
    }

    // 3) 显示"在播"但时间一直是 0 —— 缓冲或播放管线卡住
    if (!s.stuckSince) s.stuckSince = Date.now();
    const stuck = Date.now() - s.stuckSince;
    if (stuck > 4000 && !s.autoRetried) {
      s.autoRetried = true;
      try { a.load(); } catch (_) {}
      playAudio(s).catch((error) => handlePlayError(s, error));
    } else if (stuck > 9000) {
      s.playBtn?.classList.add('is-attention');
      showAlert(s, '音频没有开始，点播放键重试；或返回换一个版本。', true);
    }
  }, 1000);
}

/** 控件明暗：优先用 Folia 上报的「画面」亮度，取不到才退回主题底色。 */
/** Folia 内部只报「画面亮度」这一个数字，父页面不读 iframe 样式 ——
 *  getComputedStyle 会强制跨文档样式重算，700ms 轮询一次就是白烧 CPU。 */
function paintTheme(s) {
  if (!session || session !== s) return;
  // 采样值会有 ±0.05 的抖动，跨过阈值就会来回闪。
  // 画面主题在一个模式里是固定的，所以前 12 秒定下来后就锁死。
  if (s.themeLocked) return;
  const lum = typeof s.screenLum === 'number' ? s.screenLum : null;
  if (lum == null) return;
  // captureStream 从 WebGL 画布取帧很不稳（太多帧带透明底/未合成），
  // 实测同一模式会在 0.18~0.70 之间跳，按中间阈值切会闪。
  // 所以策略改成「深色为默认，只有明显亮（>0.62）才转浅色」——
  // 深色玻璃在深浅背景上都清晰，是稳妥的一侧；用户也能用顶栏按钮手动锁定。
  const dark = s.dark ? lum < 0.62 : lum < 0.55;
  if (dark === s.dark) return;
  s.dark = dark;
  s.root.classList.toggle('is-dark', dark);
  s.paintThemeBtn?.();          // 自动切换时把太阳/月亮图标同步过来
}

function startThemeWatch(s) {
  // 不再轮询：亮度由 iframe 采样后 postMessage 推过来，收到才算一次。
  paintTheme(s);
  s.themeLockTimer = setTimeout(() => { if (session === s) s.themeLocked = true; }, 12000);
}

function attachSession(s, lyricPayload) {
  const post = (msg) => {
    try { s.frame.contentWindow?.postMessage({ channel: CHANNEL, ...msg }, '*'); }
    catch (_) { /* iframe 尚未就绪 */ }
  };
  s.post = post;

  s.sendClock = () => {
    if (!session || session !== s) return;
    post({
      type: 'clock',
      positionSec: s.audio.currentTime || 0,
      durationSec: Number.isFinite(s.audio.duration) ? s.audio.duration : 0,
      anchoredAtMs: Date.now(),
      playing: !s.audio.paused && !s.audio.ended,
    });
  };

  s.onMessage = (event) => {
    const d = event.data;
    if (!d || d.channel !== CHANNEL) return;
    if (event.source !== s.frame.contentWindow) return;
    if (d.type === 'ready') {
      s.ready = true;
      post({
        type: 'track',
        name: s.title, artist: s.artist, coverUrl: s.coverUrl, seed: s.catalogId,
        lrc: stripMeta(lyricPayload.lrc),
        yrc: stripMeta(lyricPayload.yrc),
        tlyric: stripMeta(lyricPayload.tlyric),
        // songId / kuwoRid = 本曲匹配（逐字轴和这首对得上）；title = 曲名兜底，
        // 歌词来自别的版本，逐字轴只会越唱越歪 —— iframe 据此决定要不要整句同步。
        matchMode: lyricPayload.matchMode || '',
        durationSec: Number.isFinite(s.audio.duration) ? s.audio.duration : 0,
      });
      if (s.lyricOffset) post({ type: 'offset', offsetSec: s.lyricOffset });
      s.sendClock();
      s.loading.remove();
    } else if (d.type === 'luminance') {
      s.screenLum = typeof d.value === 'number' ? d.value : null;
      paintTheme(s);
    } else if (d.type === 'sync') {
      // 仅供诊断：iframe 用的歌词时间 vs 宿主 audio 的 currentTime。
      s.syncProbe = d;
      window.__foliaSync = d;
    } else if (d.type === 'error') {
      showAlert(s, d.message || 'Folia 渲染失败');
      s.loading.remove();
    }
  };

  window.addEventListener('message', s.onMessage);
  for (const evt of ['play', 'pause', 'seeked', 'timeupdate', 'durationchange']) {
    s.audio.addEventListener(evt, s.sendClock);
  }
  // 位置本身现在由 iframe 直接读宿主 <audio>.currentTime，这条消息只负责
  // playing / duration 这类状态；150ms 一次足够兜住 iframe 读不到 audio 的降级路径
  // （旧值 500ms 时，一旦走外推，主线程一卡就会累积到肉眼可见的偏差）。
  s.clockTimer = setInterval(s.sendClock, 150);
}

/** 让面板高光跟随指针，与项目 liquid-optics.js 的行为一致。 */
function trackGlass(panel) {
  let frame = 0;
  panel.addEventListener('pointermove', (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const r = panel.getBoundingClientRect();
      panel.style.setProperty('--glass-x', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      panel.style.setProperty('--glass-y', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  }, { passive: true });
}

function buildUi(s, lyricPayload) {
  const root = s.root;               // 复用已经在做展开动画的容器，避免换层闪烁
  const frame = el('iframe', 'fsl-folia-frame');
  frame.title = 'Folia 动态歌词';
  frame.allow = 'autoplay; fullscreen';
  // 先不加载：iframe 那 16MB 会把展开动画的帧堵死，等动画跑完再设 src。
  s.foliaSrc = FOLIA_URL + '?lang=zh-CN&visualizer=' + encodeURIComponent(s.mode)
    + '&bg=' + encodeURIComponent(s.bg);

  // 歌词是按曲名兜底匹配来的（翻唱/伴奏/remix 常这样），版本可能和试听不是同一支。
  // 只提示一次，6 秒自动消失，不占顶栏。
  if (lyricPayload.matchMode === 'title') {
    setTimeout(() => {
      if (session === s) showAlert(s, '歌词按曲名匹配，若不同步可在「模式」面板里微调歌词时间');
    }, 1200);
  }

  // 顶栏：只有圆形返回、曲名、模式名。没有任何说明/状态标签行。
  const top = el('div', 'fsl-top fsl-panel');
  const back = el('button', 'fsl-key fsl-round');
  back.type = 'button';
  back.setAttribute('aria-label', '返回');
  back.title = '返回（Esc）';
  back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
  const title = el('div', 'fsl-title', [s.title, s.artist].filter(Boolean).join(' · '));
  const modeBtn = el('button', 'fsl-key fsl-mode-btn', MODE_LABEL[s.mode] || s.mode);
  modeBtn.type = 'button'; modeBtn.setAttribute('aria-expanded', 'false');

  // 控件明暗：自动判定不可靠（WebGL 帧采样会抖），所以给一个手动锁定。
  // 深色时显示月亮、浅色时显示太阳，一眼看出当前态。
  const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
    + ' stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.1"/>'
    + '<path d="M12 2.7v2M12 19.3v2M2.7 12h2M19.3 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4'
    + 'M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"/></svg>';
  const MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M20.2 14.4A8.3 8.3 0 0 1 9.6 3.8a8.4 8.4 0 1 0 10.6 10.6z"/></svg>';
  const themeBtn = el('button', 'fsl-key fsl-round fsl-theme');
  themeBtn.type = 'button';
  const paintThemeBtn = () => {
    themeBtn.innerHTML = s.dark ? MOON_SVG : SUN_SVG;
    themeBtn.setAttribute('aria-label', s.dark ? '控件切到浅色' : '控件切到深色');
    themeBtn.title = themeBtn.getAttribute('aria-label');
  };
  themeBtn.onclick = () => {
    s.dark = !s.dark;
    s.root.classList.toggle('is-dark', s.dark);
    s.themeLocked = true;                  // 手动选过就不再被自动判定改回去
    try { localStorage.setItem(THEME_STORAGE_KEY, s.dark ? 'dark' : 'light'); } catch (_) {}
    paintThemeBtn();
    s.markActive?.();
  };
  s.paintThemeBtn = paintThemeBtn;
  const txBtn = el('button', 'fsl-key fsl-tx-btn', '转谱');
  txBtn.type = 'button';
  txBtn.title = '把这首歌转成可演奏的曲谱';
  s.txBtn = txBtn;
  top.append(back, title, themeBtn, modeBtn, txBtn);
  paintThemeBtn();        // 首帧就要有图标和 aria-label
  trackGlass(top);

  // 模式面板：两组 —— 歌词动画 17 种 + 背景 5 种（Folia 把这两层分开的）
  const modePanel = el('div', 'fsl-modes fsl-panel');
  modePanel.hidden = true;
  trackGlass(modePanel);

  const buildFoliaSrc = () => FOLIA_URL
    + '?lang=zh-CN&visualizer=' + encodeURIComponent(s.mode)
    + '&bg=' + encodeURIComponent(s.bg);
  const reloadFolia = () => {
    s.ready = false;
    s.screenLum = null;
    s.themeLocked = false;
    clearTimeout(s.themeLockTimer);
    s.themeLockTimer = setTimeout(() => { if (session === s) s.themeLocked = true; }, 12000);
    frame.src = buildFoliaSrc() + '&t=' + Date.now();
    s.loading?.remove();
  };

  const modeGroup = el('div', 'fsl-modes-group');
  modeGroup.append(el('div', 'fsl-modes-label', '歌词'));
  const modeGrid = el('div', 'fsl-modes-grid');
  for (const [id, label] of MODES) {
    const item = el('button', 'fsl-key' + (id === s.mode ? ' is-on' : ''), label);
    item.type = 'button'; item.dataset.mode = id;
    item.onclick = () => {
      s.mode = id;
      try { localStorage.setItem(MODE_STORAGE_KEY, id); } catch (_) {}
      modeBtn.textContent = label;                 // 只有模式名，没有「风格 ·」
      modeBtn.setAttribute('aria-expanded', 'false');
      modePanel.hidden = true;
      for (const x of modeGrid.children) x.classList.toggle('is-on', x.dataset.mode === id);
      reloadFolia();
    };
    modeGrid.append(item);
  }
  modeGroup.append(modeGrid);

  const bgGroup = el('div', 'fsl-modes-group');
  bgGroup.append(el('div', 'fsl-modes-label', '背景'));
  const bgGrid = el('div', 'fsl-modes-grid fsl-modes-grid-bg');
  for (const [id, label] of BGS) {
    const item = el('button', 'fsl-key' + (id === s.bg ? ' is-on' : ''), label);
    item.type = 'button'; item.dataset.bg = id;
    item.onclick = () => {
      s.bg = id;
      try { localStorage.setItem(BG_STORAGE_KEY, id); } catch (_) {}
      for (const x of bgGrid.children) x.classList.toggle('is-on', x.dataset.bg === id);
      reloadFolia();
    };
    bgGrid.append(item);
  }
  bgGroup.append(bgGrid);

  modePanel.append(modeGroup, bgGroup);

  modeBtn.onclick = () => {
    modePanel.hidden = !modePanel.hidden;
    modeBtn.setAttribute('aria-expanded', String(!modePanel.hidden));
  };

  // 底栏：播放 / 进度 / 时间，三者同一行
  const bottom = el('div', 'fsl-bottom fsl-panel');
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    + '<path d="M8.4 5.3c0-.95 1.05-1.53 1.86-1.03l9.1 5.9a1.2 1.2 0 0 1 0 2.06l-9.1 5.9'
    + 'c-.81.5-1.86-.08-1.86-1.03z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    + '<rect x="7.1" y="5" width="3.5" height="14" rx="1.5"/>'
    + '<rect x="13.4" y="5" width="3.5" height="14" rx="1.5"/></svg>';
  const play = el('button', 'fsl-key fsl-play');
  play.type = 'button'; play.title = '播放 / 暂停';
  const seek = el('div', 'fsl-seek');
  seek.setAttribute('role', 'slider'); seek.setAttribute('aria-label', '播放进度');
  seek.setAttribute('aria-valuemin', '0'); seek.setAttribute('aria-valuemax', '100');
  seek.setAttribute('aria-valuenow', '0'); seek.tabIndex = 0;
  const trackEl = el('div', 'fsl-track');
  const fill = el('div', 'fsl-fill');
  const knob = el('div', 'fsl-knob');
  trackEl.append(fill, knob);
  seek.append(trackEl);
  const time = el('span', 'fsl-time', '--:-- / --:--');
  bottom.append(play, seek, time);
  trackGlass(bottom);

  const paintSeek = (ratio) => {
    const pct = Math.min(1, Math.max(0, ratio)) * 100;
    fill.style.width = pct + '%';
    knob.style.left = pct + '%';
    seek.setAttribute('aria-valuenow', String(Math.round(pct)));
  };
  const ratioAt = (clientX) => {
    const r = trackEl.getBoundingClientRect();
    if (!r.width) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  let dragging = false;
  seek.addEventListener('pointerdown', (e) => {
    if (!Number.isFinite(s.audio.duration)) return;
    dragging = true;
    try { seek.setPointerCapture(e.pointerId); } catch (_) {}
    const ratio = ratioAt(e.clientX);
    s.audio.currentTime = s.audio.duration * ratio;
    paintSeek(ratio);
  });
  seek.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const ratio = ratioAt(e.clientX);
    s.audio.currentTime = s.audio.duration * ratio;
    paintSeek(ratio);
  });
  const endDrag = (e) => {
    dragging = false;
    try { seek.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  seek.addEventListener('pointerup', endDrag);
  seek.addEventListener('pointercancel', endDrag);
  seek.addEventListener('keydown', (e) => {
    const d = s.audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    if (e.key === 'ArrowRight') { s.audio.currentTime = Math.min(d, s.audio.currentTime + 5); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { s.audio.currentTime = Math.max(0, s.audio.currentTime - 5); e.preventDefault(); }
  });
  s.paintSeek = paintSeek;

  const alert = el('div', 'fsl-alert');
  alert.hidden = true;
  const loading = s.loading;
  if (loading?.firstChild) loading.firstChild.textContent = '正在载入动态歌词…';

  const hotTop = el('div', 'fsl-hot fsl-hot-top');
  const hotBottom = el('div', 'fsl-hot fsl-hot-bottom');
  root.prepend(frame);
  const tx = buildTranscribePanel(s, { onActive: () => s.markActive?.() });
  s.tx = tx;
  root.append(hotTop, hotBottom, top, modePanel, bottom, alert, tx.panel);
  txBtn.onclick = () => tx.toggle();

  // 3 秒无操作就淡出上下控件（播放中或暂停都一样，用户要的是「无操作就收」）。
  // 只有模式面板展开时保持显示，否则点开列表会被自己的计时器收掉。
  s.markActive = () => {
    if (!session || session !== s) return;
    s.root.classList.remove('is-idle');
    clearTimeout(s.idleTimer);
    // 模式面板或转谱面板开着时都不倒计时，收起后再起
    if (!modePanel.hidden || !tx.panel.hidden) return;
    s.idleTimer = setTimeout(() => {
      if (session !== s || !modePanel.hidden || !tx.panel.hidden) return;
      s.root.classList.add('is-idle');
    }, 3000);
  };
  s.onPauseReset = s.markActive;            // 暂停也走同一套：先亮 3 秒，再收
  // 只有「在控件上操作」才算活动。画面空白处的点击要留给下面的切换逻辑，
  // 否则一按下就 markActive、抬起再 toggle，点一下等于没反应。
  for (const zone of [top, modePanel, bottom]) {
    zone.addEventListener('pointerdown', s.markActive);
    zone.addEventListener('pointermove', s.markActive);
    // 鼠标停在控件上时别倒计时 —— 3 秒就消失的话，手还没移到按钮上它已经淡了。
    // 触屏没有 hover，行为不变（仍然是「无操作 3 秒收起」）。
    zone.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      clearTimeout(s.idleTimer);
    });
    zone.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      if (!s.root.classList.contains('is-idle')) s.markActive();
    });
  }
  root.addEventListener('wheel', s.markActive, { passive: true });
  s.audio.addEventListener('play', s.markActive);
  s.audio.addEventListener('pause', s.onPauseReset);

  /* 点画面中间：控件可见 → 立刻全部收起；已收起 → 唤出并重新计时。
     这正是「点一下看纯净歌词、再点一下要继续操作」的用法。 */
  s.toggleControls = (forceHide) => {
    if (!session || session !== s) return;
    const hide = forceHide !== undefined ? forceHide : !s.root.classList.contains('is-idle');
    clearTimeout(s.idleTimer);
    if (hide) {
      modePanel.hidden = true;
      tx.hide();
      modeBtn.setAttribute('aria-expanded', 'false');
      s.root.classList.add('is-idle');
    } else {
      s.markActive();
    }
  };
  root.addEventListener('pointerup', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const t = e.target;
    // 点在控件、面板、进度条上都不算「点画面」
    if (t !== root && !(t instanceof Element && t.classList.contains('fsl-hot'))) return;
    if (s.root.classList.contains('is-idle')) s.markActive();
    else s.toggleControls(true);
  });

  back.onclick = closeFolia;
  play.onclick = () => {
    if (s.audio.paused) playAudio(s).catch((error) => handlePlayError(s, error));
    else s.audio.pause();
    syncToggle();
  };
  const syncToggle = () => {
    const playing = !s.audio.paused;
    play.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    play.dataset.state = playing ? 'pause' : 'play';
    play.setAttribute('aria-label', playing ? '暂停' : '播放');
  };
  s.syncToggle = syncToggle;
  syncToggle();                       // 首帧就要有图标，否则按钮是空的
  s.audio.addEventListener('play', syncToggle);
  s.audio.addEventListener('pause', syncToggle);

  s.uiTimer = setInterval(() => {
    if (!session || session !== s) return;
    const dur = s.audio.duration;
    const known = Number.isFinite(dur) && dur > 0;
    if (known && !dragging) paintSeek(s.audio.currentTime / dur);
    // 时长未知就别显示 0:00，那看起来就像一直没播
    time.textContent = fmtTime(s.audio.currentTime) + ' / ' + (known ? fmtTime(dur) : '--:--');
  }, 250);

  // 先按存档/默认深色渲染，避免打开瞬间闪一层浅色再渐变过去。
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_STORAGE_KEY); } catch (_) {}
  s.dark = savedTheme ? savedTheme === 'dark' : true;
  root.classList.toggle('is-dark', s.dark);
  if (savedTheme) s.themeLocked = true;      // 用户手动选过，不再自动判定
  s.frame = frame; s.alert = alert; s.playBtn = play;
  bindFrameTaps(s);        // 必须在 s.frame 赋值之后，否则绑不上
  s.onKey = (e) => {
    if (e.key !== 'Escape') return;
    // 必须拦死：否则 Esc 会冒到云曲库的 <dialog>，把它关掉，
    // 列表随之触发 close → ++revision，搜索结果就只剩已经渲染出来的那几首。
    e.preventDefault();
    e.stopPropagation();
    if (!modePanel.hidden) { modePanel.hidden = true; modeBtn.setAttribute('aria-expanded', 'false'); return; }
    closeFolia();
  };
  document.addEventListener('keydown', s.onKey, true);

  s.loadTimer = setTimeout(() => {
    if (session !== s || s.ready) return;
    loading.firstChild.textContent = '动态歌词资源尚未就绪，请刷新页面后重试（Esc 返回）。';
  }, 12000);
}

/**
 * 打开 Folia 全屏动态歌词。
 * @param {{catalogId:string,title?:string,artist?:string,audio:HTMLAudioElement,originEl?:HTMLElement}} options
 */
export async function openFullscreenLyrics({ catalogId, title = '', artist = '', audio, originEl = null } = {}) {
  if (!catalogId || !audio) throw new Error('缺少试听曲目或音频');
  if (session) closeFolia();

  injectStyles();
  let saved = 'classic';
  try { saved = localStorage.getItem(MODE_STORAGE_KEY) || 'classic'; } catch (_) {}
  if (!MODE_IDS.includes(saved)) saved = 'classic';
  let savedBg = 'latent';
  try { savedBg = localStorage.getItem(BG_STORAGE_KEY) || 'latent'; } catch (_) {}
  if (!BG_IDS.includes(savedBg)) savedBg = 'latent';

  // 手动微调档位已按用户要求移除；这里固定 0，并清掉可能残留的旧值。
  try { localStorage.removeItem(OFFSET_KEY); } catch (_) {}
  const savedOffset = 0;
  const s = {
    catalogId, title, artist, audio, originEl, coverUrl: null, mode: saved, bg: savedBg,
    lyricOffset: savedOffset,
    ready: false, post: null, clockTimer: null, uiTimer: null, playPromise: null,
    onMessage: null, onKey: null, sendClock: null,
  };
  // iframe 会通过这个标记找到「正在放音的 audio」，直接读它的 currentTime，
  // 不再依赖每 500ms 一次的消息外推（那是歌词慢半拍的根源）。
  try { audio.setAttribute('data-folia-audio', '1'); } catch (_) {}
  session = s;

  // 还在点击手势的同步上下文里，先发起播放（外部组件通常已经调过一次，这里只是兜底）。
  // 失败不在这里弹提示：交给播放看护统一判定，避免刚打开就冒红字。
  if (audio.paused) audio.play().catch((error) => { s.playError = error; });

  const root = el('dialog', 'fsl-folia-root');
  const loading = el('div', 'fsl-loading');
  loading.append(el('div', '', '正在读取歌词…'));
  root.append(loading);
  document.body.append(root);
  // 后 showModal 的 dialog 在 top layer 栈顶，压得住云曲库那个 dialog。
  root.addEventListener('cancel', (e) => e.preventDefault());
  try { root.showModal?.(); } catch (_) { root.setAttribute('open', ''); }
  s.root = root; s.loading = loading;
  // 容器一出现就起动画，不能等歌词接口 —— 否则用户先看到整屏、再莫名缩一下。
  s.openAnim = animateOpen(root, originEl);

  let res;
  try {
    res = await fetch('/api/online-music/lyric?id=' + encodeURIComponent(catalogId));
  } catch (_) { closeFolia(); throw new Error('歌词接口连接失败'); }
  let payload;
  try { payload = await res.json(); }
  catch (_) { closeFolia(); throw new Error('歌词接口返回异常'); }
  if (!res.ok || !payload.ok) {
    closeFolia();
    throw new Error(payload?.reason || '这首歌没有可用歌词');
  }
  if (!session || session !== s) return;

  // 同一个容器里补齐 UI，展开动画不中断、不闪黑。
  s.mediaSrc = '/api/online-music/preview?id=' + encodeURIComponent(catalogId);
  // 封面：Folia 的「莫奈」等模式会拿它画专辑卡，缺了右侧那块就是空白。
  s.coverUrl = payload.coverUrl || null;
  buildUi(s, payload);
  attachSession(s, payload);
  attachPlaybackGuards(s);
  startPlaybackWatch(s);
  startThemeWatch(s);
  s.markActive?.();

  // 动画先跑完，再让 iframe 开始下载，避免 16MB 资源把合成帧挤掉。
  await s.openAnim;
  if (!session || session !== s || !s.frame) return;
  s.frame.src = s.foliaSrc;
}
