// 量「大谱切到简谱」的耗时（简谱渲染原来也在用 setTimeout(0) 让步）。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });
    const target = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const s = d.scores.find(x => x.title.startsWith('Rienzi')) || d.scores.find(x => x.ready);
      return { id: s.id, title: s.title };
    });
    console.log('目标:', target.title);
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    await page.waitForTimeout(1500);

    for (let i = 0; i < 2; i++) {
      let t = Date.now();
      await page.evaluate(() => document.querySelector('#simple-button').click());
      await page.waitForFunction(() => document.querySelector('#notation .simple-system'), null, { timeout: 120000 });
      const simple = Date.now() - t;
      t = Date.now();
      await page.evaluate(() => document.querySelector('#notation-button').click());
      await page.waitForFunction(() => document.querySelector('#notation svg'), null, { timeout: 120000 });
      const staff = Date.now() - t;
      const counts = await page.evaluate(() => ({
        systems: document.querySelectorAll('#notation .simple-system').length,
        notes: document.querySelectorAll('#notation .note-event').length,
      }));
      console.log(`第 ${i + 1} 轮：切简谱 ${simple}ms ／ 切五线谱 ${staff}ms ／ 简谱系统数 ${counts.systems}`);
    }
    console.log('页面错误:', errors.length ? JSON.stringify(errors) : '无');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
