// 验证「空闲预热排版引擎」生效：启动后不打开曲谱，等几秒应能看到 OSMD 全局已就绪；
// 然后再正常打开一次，确认排版仍正常（并记录首块出现时间）。
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

    const before = await page.evaluate(() => !!globalThis.opensheetmusicdisplay?.OpenSheetMusicDisplay);
    console.log('启动瞬间 OSMD 已就绪:', before);
    await page.waitForTimeout(7000);
    const after = await page.evaluate(() => !!globalThis.opensheetmusicdisplay?.OpenSheetMusicDisplay);
    console.log('等 7 秒后（空闲预热）OSMD 已就绪:', after);

    const target = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const s = d.scores.find(x => x.title.startsWith('Rienzi')) || d.scores.find(x => x.ready);
      return { id: s.id, title: s.title };
    });
    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    console.log(`打开 ${target.title} 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const svg = await page.evaluate(() => document.querySelectorAll('#notation .notation-chunk svg').length);
    console.log('首块 SVG:', svg, ' 页面错误:', errors.length ? JSON.stringify(errors) : '无');
    console.log(after && svg > 0 && errors.length === 0 ? '\nPASS 空闲预热生效且排版正常' : '\nFAIL');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
