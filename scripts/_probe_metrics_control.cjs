// 对照实验：分别量「打开 4 小节示例谱」与「打开 28 声部大谱」的浏览器累计指标。
// 若小谱的 TaskDuration 也远大于 Script+Layout+Style，说明这台机器本身在被抢占（CPU 争用）。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

const KEYS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const read = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

    const report = async (label, action) => {
      await page.waitForTimeout(1200);
      const before = await read();
      const t0 = Date.now();
      await action();
      const wall = (Date.now() - t0) / 1000;
      const after = await read();
      const d = {};
      for (const k of KEYS) d[k] = after[k] - before[k];
      const known = (d.ScriptDuration + d.LayoutDuration + d.RecalcStyleDuration) * 1000;
      console.log(`\n--- ${label} ---  墙钟 ${wall.toFixed(1)}s`);
      console.log('  TaskDuration       ' + (d.TaskDuration * 1000).toFixed(0).padStart(8) + ' ms');
      console.log('  ScriptDuration     ' + (d.ScriptDuration * 1000).toFixed(0).padStart(8) + ' ms');
      console.log('  LayoutDuration     ' + (d.LayoutDuration * 1000).toFixed(0).padStart(8) + ' ms');
      console.log('  RecalcStyleDur     ' + (d.RecalcStyleDuration * 1000).toFixed(0).padStart(8) + ' ms');
      console.log('  Script+Layout+Style' + known.toFixed(0).padStart(8) + ' ms');
      console.log('  「无法归因」的忙碌 ' + ((d.TaskDuration * 1000) - known).toFixed(0).padStart(8) + ' ms');
      console.log('  Layout/Recalc 次数 ' + d.LayoutCount + ' / ' + d.RecalcStyleCount);
    };

    await report('打开内置 4 小节示例谱', async () => {
      await page.evaluate(() => document.querySelector('#sample-button').click());
      await page.waitForFunction(() => document.querySelector('#notation svg'), null, { timeout: 60000 });
    });

    const target = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const s = d.scores.find(x => x.title.startsWith('Rienzi')) || d.scores.find(x => x.ready);
      return { id: s.id, title: s.title };
    });
    await report('打开 28 声部大谱 ' + target.title, async () => {
      await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    });
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
