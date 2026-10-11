// 标定用：量出「已渲染分块的真实高度」与「占位块高度」的差距，
// 为「按声部数自适应分块」确定占位高度公式，避免滚动跳动。
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
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    await page.waitForTimeout(2000);

    const info = await page.evaluate(() => {
      const chunks = [...document.querySelectorAll('#notation .notation-chunk')];
      const rendered = chunks.filter(c => c.querySelector('svg'));
      const placeholders = chunks.filter(c => c.dataset.lazyMeasure);
      const scroll = document.querySelector('.sheet-scroll');
      return {
        分块总数: chunks.length,
        已渲染: rendered.length,
        占位: placeholders.length,
        已渲染高度: rendered.map(c => Math.round(c.getBoundingClientRect().height)),
        占位minHeight: placeholders.slice(0, 3).map(c => c.style.minHeight),
        滚动区高度: scroll ? Math.round(scroll.scrollHeight) : null,
        视口高: scroll ? Math.round(scroll.clientHeight) : null,
        svg数: document.querySelectorAll('#notation .notation-chunk svg').length,
        单块内svg元素数: rendered[0] ? rendered[0].querySelectorAll('*').length : 0,
      };
    });
    console.log(JSON.stringify(info, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
