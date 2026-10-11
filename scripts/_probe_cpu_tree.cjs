// 按调用栈归属的 CPU 分析：把每个采样点的时间归到「栈里最深的业务函数」上，
// 这样连原生 (program) 时间也能落到具体函数，避免只看 self 时间看不出凶手。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';
const DIGEST = process.env.PIANO_DIGEST || '291e591bee825433f1b9960df9ffe77a099bd58acfc2fe4404fc49070c7059d3';

const APP_MODULES = ['app.js', 'engraving.js', 'engraving-plan.js', 'score.js', 'practice-instrument.js', 'harmony.js', 'daw.js', 'player.js', 'task-center.js', 'performance.js', 'library.js', 'workspace.js', 'simple-notation.js', 'midi.js', 'arrangements.js', 'vocal-transport.js', 'score-editing.js', 'capability-host.js', 'project-entry.js', 'ai-advanced-actions.js', 'opensheetmusicdisplay', 'vexflow'];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });
    const target = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const s = d.scores.find(x => x.title.startsWith('Rienzi')) || d.scores.find(x => x.ready);
      return { id: s.id, title: s.title };
    });
    console.log('目标:', target.title);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 300 });
    await cdp.send('Profiler.start');
    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    console.log('打开耗时 %ss', ((Date.now() - t0) / 1000).toFixed(1));
    const { profile } = await cdp.send('Profiler.stop');

    const byId = new Map(); profile.nodes.forEach(n => byId.set(n.id, n));
    const parent = new Map();
    profile.nodes.forEach(n => (n.children || []).forEach(c => parent.set(c, n.id)));
    const isApp = url => APP_MODULES.some(m => String(url || '').includes(m));
    const key = n => {
      const f = n.callFrame; const file = String(f.url || '').split('/').pop().split('?')[0] || '(inline)';
      return (f.functionName || '(anonymous)') + ' @ ' + file + ':' + f.lineNumber;
    };
    const acc = new Map(); let total = 0, unattributed = 0;
    const dt = profile.timeDeltas, samples = profile.samples;
    for (let i = 0; i < samples.length; i++) {
      const d = dt[i] || 0; total += d;
      let id = samples[i], found = null;
      while (id !== undefined) {
        const n = byId.get(id);
        if (!n) break;
        if (isApp(n.callFrame.url)) { found = n; break; }
        id = parent.get(id);
      }
      if (!found) { unattributed += d; continue; }
      const k = key(found);
      acc.set(k, (acc.get(k) || 0) + d);
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
    console.log('\n=== 时间归属（按栈里最深的业务函数，总 %ss）===', (total / 1e6).toFixed(1));
    for (const [k, v] of top) console.log('  ' + (v / 1e6).toFixed(2).padStart(7) + 's  ' + (v / total * 100).toFixed(1).padStart(5) + '%  ' + k.slice(0, 95));
    console.log('  ' + (unattributed / 1e6).toFixed(2).padStart(7) + 's  ' + (unattributed / total * 100).toFixed(1).padStart(5) + '%  (非业务代码：原生/GC/浏览器)');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
