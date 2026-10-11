// 把「排版」拆开量：new OSMD / osmd.load / osmd.render 各占多少，并看它随每块小节数怎么变。
// 目的：判定剩下那 5.7 秒是「MusicXML 导入」还是「排版绘制」还是「每个分块都新建实例」的固定开销。
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

    // 先正常打开一次，确保 OSMD 已加载并完成首次编译
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    await page.waitForTimeout(1500);

    const out = await page.evaluate(async () => {
      const planMod = await import('/engraving-plan.js?v=1');
      const host = await import('/capability-host.js');
      const score = host.liveScore();
      const OSMD = globalThis.opensheetmusicdisplay?.OpenSheetMusicDisplay;
      if (!OSMD) return { error: 'OSMD 未就绪' };
      const plan = await planMod.engravingPlan(score);
      const res = { partCount: plan.parts.length, measures: plan.count, chunk: plan.chunk, rows: [] };

      for (const n of [2, 4, 8, 16]) {
        const xml = await planMod.engravingChunk(score, 0, n);
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:-20000px;top:0;width:1000px';
        document.body.append(box);
        let m = performance.now();
        const osmd = new OSMD(box, { backend: 'svg', autoResize: false, drawTitle: false, drawPartNames: false, drawPartAbbreviations: false, newSystemFromXML: true, newPageFromXML: false });
        const ctor = performance.now() - m;
        m = performance.now();
        await osmd.load(xml);
        const load = performance.now() - m;
        m = performance.now();
        osmd.Zoom = 0.7; osmd.render();
        const render = performance.now() - m;
        res.rows.push({ 每块小节数: n, xmlKB: Math.round(xml.length / 1024), newOSMD: Math.round(ctor), load: Math.round(load), render: Math.round(render), svgEls: box.querySelectorAll('svg *').length, 高度: Math.round(box.getBoundingClientRect().height) });
        box.remove();
      }
      return res;
    });
    if (out.error) { console.log('FAIL', out.error); process.exitCode = 1; return; }
    console.log('\n声部数:', out.partCount, ' 小节数:', out.measures, ' 当前每块:', out.chunk);
    console.log('\n=== 拆开计时（ms）===');
    console.table(out.rows);
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
