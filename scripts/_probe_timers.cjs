// 给 setTimeout / setInterval 打桩：记录每个回调的执行耗时与创建时的调用栈。
// 目的：定死「1.3 秒的单个定时器回调」到底是谁。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

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

    await page.evaluate(() => {
      window.__timers = { slow: [], count: 0 };
      const wrap = (name) => {
        const orig = window[name];
        window[name] = function (fn, delay, ...args) {
          if (typeof fn !== 'function') return orig.apply(this, arguments);
          const stack = (new Error().stack || '').split('\n').slice(1, 5)
            .map(s => s.replace(/https?:\/\/[^/]+/g, '').trim()).join(' <- ').slice(0, 260);
          const wrapped = function (...a) {
            const t = performance.now();
            let syncMs = 0;
            const push = (asyncMs) => {
              window.__timers.count++;
              if (asyncMs > 60 || syncMs > 60) window.__timers.slow.push({ ms: Math.round(asyncMs), syncMs: Math.round(syncMs), via: name, delay, stack });
            };
            let r;
            try { r = fn.apply(this, a); }
            catch (e) { syncMs = performance.now() - t; push(syncMs); throw e; }
            syncMs = performance.now() - t;                 // 同步部分（到第一个 await 为止）
            if (r && typeof r.then === 'function') return r.then(v => { push(performance.now() - t); return v; }, e => { push(performance.now() - t); throw e; });
            push(syncMs);
            return r;
          };
          return orig.call(this, wrapped, delay, ...args);
        };
      };
      wrap('setTimeout'); wrap('setInterval');
    });

    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    console.log('打开耗时 %ss', ((Date.now() - t0) / 1000).toFixed(1));
    await page.waitForTimeout(6000);   // 多等一会儿，让后台轮询/防抖定时器都跑到

    const t = await page.evaluate(() => window.__timers);
    const syncTotal = t.slow.reduce((s, x) => s + (x.syncMs || 0), 0);
    const asyncTotal = t.slow.reduce((s, x) => s + x.ms, 0);
    console.log(`\n定时器回调总数: ${t.count}；耗时 >60ms 的 ${t.slow.length} 个`);
    console.log(`这些回调的「同步」合计 ${syncTotal} ms ／「异步总时长」合计 ${asyncTotal} ms`);
    console.log('（同步 = 到第一个 await 为止，即真正占用主线程的部分；异步总时长包含在等网络/动画）');
    console.log('\n=== 最慢的定时器回调（async 总时长 / 其中同步）===');
    for (const s of t.slow.sort((a, b) => b.ms - a.ms).slice(0, 12)) {
      console.log(`\n  async ${String(s.ms).padStart(6)} ms   同步 ${String(s.syncMs || 0).padStart(5)} ms  (${s.via}, delay=${s.delay})`);
      console.log('    ' + s.stack);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
