// 时间线关联：把「导入进度文案变化」和「longtask 长任务」放在同一条时间轴上，
// 直接看出十几秒的长任务发生在哪个阶段。
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
      window.__tl = [];
      try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__tl.push({ t: Math.round(e.startTime), kind: 'LONG', ms: Math.round(e.duration) }); }).observe({ entryTypes: ['longtask'] }); } catch { }
      const el = document.querySelector('#import-progress-status');
      if (el) new MutationObserver(() => window.__tl.push({ t: Math.round(performance.now()), kind: 'STAGE', ms: 0, text: el.textContent })).observe(el, { childList: true, characterData: true, subtree: true });
      window.__t0 = performance.now();
    });
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    const tl = await page.evaluate(() => ({ list: window.__tl, t0: window.__t0, end: performance.now() }));
    console.log('打开耗时 %ss', ((tl.end - tl.t0) / 1000).toFixed(1));
    console.log('\n=== 时间线（相对打开起点）===');
    const seen = new Map();
    for (const e of tl.list) {
      const rel = ((e.t - tl.t0) / 1000).toFixed(1);
      if (e.kind === 'LONG') console.log(`  +${rel.padStart(6)}s  ██ 长任务 ${e.ms}ms`);
      else { const key = e.text; if (seen.get(key) === rel) continue; seen.set(key, rel); console.log(`  +${rel.padStart(6)}s  阶段：${e.text}`); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
