// 隔离测量「18MB XML 本身」的代价：只 fetch + JSON.parse，不渲染。
// 用来验证「根因是那份 18MB 文档」这个假设。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

const KEYS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];

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

    const step = async (label, fn) => {
      await page.waitForTimeout(800);
      const before = await read();
      const t0 = Date.now();
      const extra = await fn();
      const wall = (Date.now() - t0) / 1000;
      const after = await read();
      const d = {}; for (const k of KEYS) d[k] = (after[k] - before[k]) * 1000;
      console.log(`\n--- ${label} ---  墙钟 ${wall.toFixed(2)}s`);
      console.log('  TaskDuration ' + d.TaskDuration.toFixed(0).padStart(8) + ' ms   Script ' + d.ScriptDuration.toFixed(0).padStart(7) + ' ms   Layout ' + d.LayoutDuration.toFixed(0).padStart(6) + ' ms   Style ' + d.RecalcStyleDuration.toFixed(0).padStart(6) + ' ms');
      if (extra !== undefined) console.log('  →', JSON.stringify(extra).slice(0, 300));
    };

    await step('① 只 fetch + JSON.parse 18MB 曲谱详情', async () => page.evaluate(async id => {
      const t = performance.now();
      const r = await fetch('/api/scores/' + id);
      const j = await r.json();
      return { xmlMB: Math.round((j.xml || '').length / 1048576), ms: Math.round(performance.now() - t) };
    }, target.id));

    await step('② 再 parseMusicXML（DOM 解析 + 抽音符）', async () => page.evaluate(async id => {
      const m = await import('/score.js?v=chunk-plan4');
      const j = await (await fetch('/api/scores/' + id)).json();
      const t = performance.now();
      const s = m.parseMusicXML(j.xml, 'probe');
      return { events: s.events.length, measures: s.measures, ms: Math.round(performance.now() - t) };
    }, target.id));

    await step('③ 再 engravingPlan（第二次全量 DOM 解析 + 建计划）', async () => page.evaluate(async id => {
      const m = await import('/score.js?v=chunk-plan4');
      const p = await import('/engraving-plan.js?v=1');
      const j = await (await fetch('/api/scores/' + id)).json();
      const s = m.parseMusicXML(j.xml, 'probe');
      const t = performance.now();
      const plan = await p.engravingPlan(s, null);
      return { parts: plan.parts.length, count: plan.count, chunk: plan.chunk, ms: Math.round(performance.now() - t) };
    }, target.id));
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
