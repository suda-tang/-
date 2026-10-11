// 给 Node.prototype.textContent 的 setter 打桩：统计写入次数并采样调用栈，
// 用来确认「曲库建完卡片后是否被整库重写一遍」。
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
      window.__tc = { count: 0, byCaller: {} };
      const d = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      Object.defineProperty(Node.prototype, 'textContent', {
        configurable: true, enumerable: d.enumerable,
        get: d.get,
        set(v) {
          const e = window.__tc; e.count++;
          const caller = (new Error().stack.split('\n')[2] || '').replace(/https?:\/\/[^/]+/g, '').trim().slice(0, 90);
          e.byCaller[caller] = (e.byCaller[caller] || 0) + 1;
          return d.set.call(this, v);
        },
      });
    });

    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    console.log('打开耗时 %ss', ((Date.now() - t0) / 1000).toFixed(1));
    await page.waitForTimeout(4000);   // 再等一会儿，让后台轮询也跑过

    const tc = await page.evaluate(() => window.__tc);
    console.log('\n=== textContent 写入次数:', tc.count, '===');
    console.log('按调用者：');
    for (const [k, v] of Object.entries(tc.byCaller).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log('  ' + String(v).padStart(6) + '  ' + k);
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
