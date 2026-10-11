// 分阶段计时（不走 UI 打开）：直接取 XML → parseMusicXML → engravingPlan → chunk → renderEngraved。
// 目的：定位「排版完整五线谱」到底慢在哪一段，并观察长任务。只读，不改任何数据。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });

    const target = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const s = d.scores.find(x => x.title.startsWith('Rienzi')) || d.scores.find(x => x.title.startsWith('The Blue Danube')) || d.scores.find(x => x.ready);
      return { id: s.id, title: s.title };
    });
    console.log('目标:', target.title, target.id.slice(0, 12));

    const out = await page.evaluate(async ({ digest }) => {
      const scoreMod = await import('/score.js?v=chunk-plan4');
      const planMod = await import('/engraving-plan.js?v=1');
      const eng = await import('/engraving.js?v=chunk-plan4');

      const item = await (await fetch('/api/scores/' + digest)).json();
      const xml = item.xml;
      const res = { xmlBytes: xml.length };

      let m = performance.now();
      const score = scoreMod.parseMusicXML(xml, item.title || 'probe');
      res['1_parseMusicXML'] = Math.round(performance.now() - m);
      res.measures = score.measures; res.events = score.events.length; res.parts = (score.midiParts || []).length;

      m = performance.now();
      const plan = await planMod.engravingPlan(score, null);
      res['2_engravingPlan_cold'] = Math.round(performance.now() - m);
      res.planCount = plan.count;

      m = performance.now();
      const chunk = await planMod.engravingChunk(score, 0, 16);
      res['3_chunk0'] = Math.round(performance.now() - m);
      res.chunkBytes = chunk.length;

      window.__long = [];
      try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch { }

      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;left:-20000px;top:0;width:1000px';
      document.body.append(div);
      m = performance.now();
      await eng.renderEngraved(div, score);
      res['4_renderEngraved_cold'] = Math.round(performance.now() - m);
      res.long = window.__long.slice(0, 12); res.longMax = Math.max(0, ...(window.__long || []));
      res.chunks = div.querySelectorAll('.notation-chunk').length;
      res.rendered = div.querySelectorAll('.notation-chunk svg').length;
      div.remove();

      // 第二次：计划与 OSMD 均已就绪，测「热」成本
      window.__long = [];
      const div2 = document.createElement('div');
      div2.style.cssText = 'position:fixed;left:-20000px;top:0;width:1000px';
      document.body.append(div2);
      m = performance.now();
      await eng.renderEngraved(div2, { ...score });
      res['5_renderEngraved_warm'] = Math.round(performance.now() - m);
      res.longWarm = window.__long.slice(0, 12);
      div2.remove();
      return res;
    }, { digest: target.id });

    console.log('\n=== 分阶段耗时（ms）===');
    for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(26), JSON.stringify(v));
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
