// 补齐上一版 DOM 打桩漏掉的「强制样式重算/布局」类 API：
// getComputedStyle、以及 clientHeight/clientWidth/offsetHeight/offsetWidth/scrollHeight/scrollWidth/offsetTop/offsetLeft。
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
      window.__dom = {};
      const rec = l => window.__dom[l] || (window.__dom[l] = { calls: 0, ms: 0 });
      const wrapFn = (obj, name, label) => {
        const o = obj?.[name]; if (typeof o !== 'function') return;
        rec(label);
        obj[name] = function (...a) { const t = performance.now(); try { return o.apply(this, a); } finally { const e = rec(label); e.calls++; e.ms += performance.now() - t; } };
      };
      const wrapProp = (obj, name, label) => {
        const d = Object.getOwnPropertyDescriptor(obj, name); if (!d?.get) return;
        rec(label);
        Object.defineProperty(obj, name, {
          configurable: true, enumerable: d.enumerable,
          get() { const t = performance.now(); try { return d.get.call(this); } finally { const e = rec(label); e.calls++; e.ms += performance.now() - t; } },
        });
      };
      wrapFn(globalThis, 'getComputedStyle', 'getComputedStyle');
      for (const name of ['clientHeight', 'clientWidth', 'offsetHeight', 'offsetWidth', 'scrollHeight', 'scrollWidth', 'offsetTop', 'offsetLeft']) {
        wrapProp(Element.prototype, name, name);
      }
      // 顺带统计观察器与动画
      const origObserve = IntersectionObserver.prototype.observe;
      IntersectionObserver.prototype.observe = function (...a) { const e = rec('IO.observe'); e.calls++; return origObserve.apply(this, a); };
      const origAnimate = Element.prototype.animate;
      Element.prototype.animate = function (...a) { const t = performance.now(); try { return origAnimate.apply(this, a); } finally { const e = rec('animate'); e.calls++; e.ms += performance.now() - t; } };
      wrapFn(Element.prototype, 'remove', 'remove');
      wrapFn(Element.prototype, 'getBoundingClientRect', 'getBoundingClientRect');
    });

    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    console.log('打开耗时 %ss', ((Date.now() - t0) / 1000).toFixed(1));
    const dom = await page.evaluate(() => window.__dom);
    console.log('\n=== 强制样式重算/布局类 API ===');
    for (const [k, v] of Object.entries(dom).sort((a, b) => b[1].ms - a[1].ms)) if (v.calls) console.log('  ' + k.padEnd(24) + String(v.calls).padStart(9) + ' 次   ' + (v.ms / 1000).toFixed(2).padStart(8) + ' s');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
