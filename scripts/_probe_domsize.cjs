// 量启动后页面的 DOM 规模（这决定每次样式重算/布局有多贵）。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });
    const snap = label => page.evaluate(() => {
      const all = document.getElementsByTagName('*').length;
      const cards = document.querySelectorAll('.library-score').length;
      const imgs = document.querySelectorAll('img').length;
      const host = document.querySelector('#notation');
      return { 元素总数: all, 曲库卡片: cards, 图片: imgs, 排版容器: host ? host.getElementsByTagName('*').length : 0 };
    });
    console.log('启动后（未打开曲谱）:', JSON.stringify(await snap()));
    const target = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const s = d.scores.find(x => x.title.startsWith('Rienzi')) || d.scores.find(x => x.ready);
      return { id: s.id, title: s.title };
    });
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    await page.waitForTimeout(1500);
    console.log('打开大谱后:', JSON.stringify(await snap()));
    // 强制一次全量布局，看代价
    const t = await page.evaluate(() => { const s = performance.now(); document.body.getBoundingClientRect(); return Math.round(performance.now() - s); });
    console.log('强制一次全量布局(ms):', t);
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
