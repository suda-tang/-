// 在页面里给关键 DOM API 打桩：统计调用次数与累计耗时。
// 目的：确认「排版完整五线谱」阶段的 8 秒到底花在哪个原生 API 上。
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
      const rec = label => window.__dom[label] || (window.__dom[label] = { calls: 0, ms: 0 });
      const wrap = (obj, name, label) => {
        const orig = obj?.[name]; if (typeof orig !== 'function') return;
        rec(label);
        obj[name] = function (...a) { const t = performance.now(); try { return orig.apply(this, a); } finally { const e = rec(label); e.calls++; e.ms += performance.now() - t; } };
      };
      for (const proto of [globalThis.SVGGraphicsElement?.prototype, globalThis.SVGElement?.prototype]) if (proto) wrap(proto, 'getBBox', 'getBBox');
      wrap(Element.prototype, 'getBoundingClientRect', 'getBoundingClientRect');
      wrap(Element.prototype, 'prepend', 'prepend');
      wrap(Element.prototype, 'append', 'append');
      wrap(Element.prototype, 'replaceChildren', 'replaceChildren');
      wrap(Element.prototype, 'setAttribute', 'setAttribute');
      wrap(Element.prototype, 'cloneNode', 'cloneNode');
      wrap(Element.prototype, 'querySelectorAll', 'querySelectorAll');
      wrap(Element.prototype, 'querySelector', 'querySelector');
      wrap(Document.prototype, 'createElementNS', 'createElementNS');
      wrap(Document.prototype, 'createElement', 'createElement');
      wrap(Document.prototype, 'querySelectorAll', 'document.querySelectorAll');
      // innerHTML 是访问器属性，单独包 setter
      try {
        const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        rec('innerHTML.set'); rec('innerHTML.get');
        Object.defineProperty(Element.prototype, 'innerHTML', {
          configurable: true, enumerable: d.enumerable,
          get() { const t = performance.now(); try { return d.get.call(this); } finally { const e = rec('innerHTML.get'); e.calls++; e.ms += performance.now() - t; } },
          set(v) { const t = performance.now(); try { return d.set.call(this, v); } finally { const e = rec('innerHTML.set'); e.calls++; e.ms += performance.now() - t; } }
        });
      } catch { }
    });

    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    console.log('打开耗时 %ss', ((Date.now() - t0) / 1000).toFixed(1));

    const dom = await page.evaluate(() => window.__dom);
    console.log('\n=== DOM API 调用统计 ===');
    const rows = Object.entries(dom).sort((a, b) => b[1].ms - a[1].ms);
    for (const [k, v] of rows) if (v.calls) console.log('  ' + k.padEnd(22) + String(v.calls).padStart(9) + ' 次   ' + (v.ms / 1000).toFixed(2).padStart(8) + ' s');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
