// 用 CDP Performance.getMetrics 直接读浏览器的累计指标：
// ScriptDuration / LayoutDuration / RecalcStyleDuration / TaskDuration / LayoutCount / RecalcStyleCount。
// 这是判定「剩下几秒到底花在脚本、布局还是样式重算」最权威的手段。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const read = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

    const target = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const s = d.scores.find(x => x.title.startsWith('Rienzi')) || d.scores.find(x => x.ready);
      return { id: s.id, title: s.title };
    });
    console.log('目标:', target.title);
    await page.waitForTimeout(1500);

    const before = await read();
    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    const wall = (Date.now() - t0) / 1000;
    const after = await read();

    const keys = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount', 'JSHeapUsedSize', 'Nodes', 'Documents'];
    console.log(`\n打开耗时 ${wall.toFixed(1)}s`);
    console.log('\n=== 浏览器累计指标（打开前后差值）===');
    for (const k of keys) {
      const a = before[k], b = after[k];
      if (a === undefined || b === undefined) continue;
      const d = b - a;
      const shown = ['LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'].includes(k) ? (d * 1000).toFixed(0) + ' ms' : Math.round(d);
      console.log('  ' + k.padEnd(22) + String(shown).padStart(12));
    }
    console.log('\n  说明：TaskDuration 是主线程总忙碌时间；Script+Layout+RecalcStyle 是其可见组成。');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
