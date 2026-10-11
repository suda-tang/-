// 给 DOMParser.parseFromString 打桩：数出「打开一次曲谱到底解析了几遍、每遍多大、共多少毫秒」。
// 用来验证「共享 DOM」是否真的把重复的 18MB 解析消掉了。
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
      window.__dp = { calls: [], total: 0 };
      const orig = DOMParser.prototype.parseFromString;
      DOMParser.prototype.parseFromString = function (text, type) {
        const t = performance.now();
        try { return orig.call(this, text, type); }
        finally {
          const ms = performance.now() - t;
          window.__dp.calls.push({ mb: +(String(text).length / 1048576).toFixed(2), ms: Math.round(ms) });
          window.__dp.total += ms;
        }
      };
    });

    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    console.log(`打开耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await page.waitForTimeout(2000);

    const dp = await page.evaluate(() => window.__dp);
    const big = dp.calls.filter(c => c.mb >= 5);
    console.log(`\nDOMParser.parseFromString 共调用 ${dp.calls.length} 次，合计 ${Math.round(dp.total)} ms`);
    console.log(`其中「大文档（≥5MB）」${big.length} 次，合计 ${big.reduce((s, c) => s + c.ms, 0)} ms`);
    console.log('\n=== 逐次（前 20）===');
    dp.calls.slice(0, 20).forEach((c, i) => console.log(`  #${String(i + 1).padStart(2)}  ${String(c.mb).padStart(6)} MB  ${String(c.ms).padStart(6)} ms`));
    const ok = big.length <= 2;
    console.log(ok ? '\nPASS 大文档解析已收敛到 1~2 次（共享 DOM 生效）' : `\nFAIL 大文档仍被解析 ${big.length} 次`);
    if (!ok) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
