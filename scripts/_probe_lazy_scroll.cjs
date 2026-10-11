// 验证自适应分块后，滚动仍能触发后续分块的惰性渲染（我改了 engravingChunk 的默认 count 与占位高度）。
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

    const count = () => page.evaluate(() => ({
      chunks: document.querySelectorAll('#notation .notation-chunk').length,
      rendered: document.querySelectorAll('#notation .notation-chunk svg').length,
      pending: document.querySelectorAll('#notation [data-lazy-measure]').length,
    }));
    console.log('打开后:', JSON.stringify(await count()));

    for (const step of [1, 2, 3]) {
      await page.evaluate(() => { const s = document.querySelector('.sheet-scroll'); s.scrollTop = s.scrollTop + s.clientHeight * 1.6; });
      await page.waitForTimeout(3500);
      console.log(`第 ${step} 次下滚后:`, JSON.stringify(await count()));
    }

    // 跳到最后
    await page.evaluate(() => { const s = document.querySelector('.sheet-scroll'); s.scrollTop = s.scrollHeight; });
    await page.waitForTimeout(6000);
    const last = await count();
    console.log('滚到底后:', JSON.stringify(last));
    console.log('页面错误:', errors.length ? JSON.stringify(errors) : '无');

    const ok = last.rendered >= 4 && last.rendered > 1 && errors.length === 0;
    console.log(ok ? '\nPASS 滚动可触发后续分块惰性渲染' : '\nFAIL 惰性渲染异常');
    if (!ok) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
