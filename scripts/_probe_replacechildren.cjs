// 统计 Element.prototype.replaceChildren 的调用次数与调用者（draw() 每次重绘都会调用它）。
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
      window.__rc = { count: 0, byCaller: {}, samples: [] };
      const orig = Element.prototype.replaceChildren;
      Element.prototype.replaceChildren = function (...a) {
        const e = window.__rc; e.count++;
        const caller = (new Error().stack.split('\n')[2] || '').replace(/https?:\/\/[^/]+/g, '').trim().slice(0, 120);
        e.byCaller[caller] = (e.byCaller[caller] || 0) + 1;
        if (e.count <= 3) e.samples.push(caller);
        return orig.apply(this, a);
      };
    });

    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    console.log('打开耗时 %ss', ((Date.now() - t0) / 1000).toFixed(1));
    const rc = await page.evaluate(() => window.__rc);
    console.log('\n=== replaceChildren 总调用:', rc.count, '===');
    console.log('按调用者：');
    Object.entries(rc.byCaller).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log('  ' + String(v).padStart(6) + '  ' + k));
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
