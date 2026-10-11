// 定位「谁创建了 8.6 万个元素」：对 createElement / append 采样调用栈，并按标签名统计。
// 目的：确认那 8.5 秒长任务到底属于排版，还是别的东西（比如曲库卡片重渲染）。
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
      window.__ce = { count: 0, tags: {}, samples: [] };
      const orig = Document.prototype.createElement;
      Document.prototype.createElement = function (tag) {
        const e = window.__ce; e.count++;
        e.tags[tag] = (e.tags[tag] || 0) + 1;
        if (e.count % 4000 === 0 && e.samples.length < 14) {
          e.samples.push(new Error().stack.split('\n').slice(1, 6).join(' <- ').replace(/https?:\/\/[^/]+/g, '').slice(0, 420));
        }
        return orig.call(this, tag);
      };
    });

    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    console.log('打开耗时 %ss', ((Date.now() - t0) / 1000).toFixed(1));

    const ce = await page.evaluate(() => window.__ce);
    console.log('\n=== createElement 总数:', ce.count, '===');
    console.log('按标签 Top12:', JSON.stringify(Object.entries(ce.tags).sort((a, b) => b[1] - a[1]).slice(0, 12)));
    console.log('\n=== 采样调用栈（每 4000 次采一条）===');
    ce.samples.forEach((s, i) => console.log(`  [${i}] ${s}\n`));
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
