// 量测：18MB MusicXML 建 DOM 的时间与堆内存代价（决定「惰性序列化」是否可行）。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';
const DIGEST = process.env.PIANO_DIGEST || '291e591bee825433f1b9960df9ffe77a099bd58acfc2fe4404fc49070c7059d3';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--js-flags=--expose-gc'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });
    const out = await page.evaluate(async ({ digest }) => {
      const mb = () => Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576);
      const gc = () => { try { window.gc?.(); } catch { } };
      const item = await (await fetch('/api/scores/' + digest)).json();
      const xml = item.xml;
      gc(); const base = mb();
      let m = performance.now();
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const parseMs = Math.round(performance.now() - m);
      gc(); const afterParse = mb();
      const elements = doc.getElementsByTagName('*').length;
      // 序列化全部 measure 的耗时（当前 plan 的主要成本）
      const ser = new XMLSerializer();
      const parts = [...doc.documentElement.children].filter(n => n.localName === 'part');
      let n = 0; m = performance.now();
      for (const part of parts) for (const ms of [...part.children]) if (ms.localName === 'measure') { ser.serializeToString(ms); n++; }
      const serializeMs = Math.round(performance.now() - m);
      gc(); const afterSerialize = mb();
      return { xmlMB: Math.round(xml.length / 1048576), base, afterParse, afterSerialize, parseMs, serializeMs, elements, parts: parts.length, measures: n };
    }, { digest: DIGEST });
    console.log('\n=== 18MB XML 代价 ===');
    for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18), JSON.stringify(v));
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
