// 量「异步解析的让步开销」：对比 sync parseMusicXML 与 parseMusicXMLAsync（每 8ms 用 setTimeout(0) 让步）。
// 顺带量 doc.querySelectorAll('part > measure') 这类全文档查询的代价。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    // 把曲库列表缩成「只有 Rienzi 一首」，避免后台整库渲染抢主线程、污染测量
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.pathname !== '/api/scores') return route.continue();
      const resp = await route.fetch();
      const data = await resp.json();
      await route.fulfill({ json: { scores: (data.scores || []).filter(s => s.title.startsWith('Rienzi')) } });
    });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });
    const target = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const s = d.scores.find(x => x.title.startsWith('Rienzi')) || d.scores.find(x => x.ready);
      return { id: s.id, title: s.title };
    });
    console.log('目标:', target.title);

    const out = await page.evaluate(async ({ id }) => {
      const m = await import('/score.js?v=chunk-plan4');
      const item = await (await fetch('/api/scores/' + id)).json();
      const xml = item.xml;
      const res = { xmlMB: Math.round(xml.length / 1048576) };

      // ① 同步解析
      let t = performance.now();
      const sync = m.parseMusicXML(xml, 'probe');
      res.sync = Math.round(performance.now() - t);
      res.measures = sync.measures; res.events = sync.events.length;

      // ② 异步解析（每 8ms 让步）
      let yields = 0;
      t = performance.now();
      await m.parseMusicXMLAsync(xml, 'probe', () => { yields++; });
      res.async = Math.round(performance.now() - t);
      res.progressCalls = yields;
      res.asyncMinusSync = res.async - res.sync;

      // ③ 全文档查询代价（parseMusicXMLSteps 里用它数小节）
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      t = performance.now();
      const n1 = doc.querySelectorAll('part > measure').length;
      res.querySelectorAll_part_measure = Math.round(performance.now() - t);
      res.count = n1;
      t = performance.now();
      let n2 = 0;
      for (const part of [...doc.documentElement.children]) if (part.localName === 'part') for (const c of part.children) if (c.localName === 'measure') n2++;
      res.manualCount = Math.round(performance.now() - t);
      res.manualCountValue = n2;

      // ④ 让步机制对比：setTimeout(0) vs MessageChannel，各跑 300 次
      const bench = async (yieldFn, times) => {
        const t0 = performance.now();
        for (let i = 0; i < times; i++) await yieldFn();
        return Math.round(performance.now() - t0);
      };
      const ch = new MessageChannel();
      res.yield_setTimeout300 = await bench(() => new Promise(r => setTimeout(r, 0)), 300);
      res.yield_messageChannel300 = await bench(() => new Promise(r => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); }), 300);
      return res;
    }, { id: target.id });

    console.log('\n=== 解析与让步开销（ms）===');
    for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28), JSON.stringify(v));
    console.log('\n  异步比同步多花：', out.asyncMinusSync, 'ms');
    console.log('  300 次让步：setTimeout(0) =', out.yield_setTimeout300, 'ms  vs  MessageChannel =', out.yield_messageChannel300, 'ms');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
