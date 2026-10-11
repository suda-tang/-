// 等价性验证：把旧算法（建计划时一次性序列化全部小节）内联复刻，
// 与新的惰性实现 engravingChunk 的输出做逐字节对比。任何一处不一致都会打印出来。
// 只读，不改数据。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';
const DIGEST = process.env.PIANO_DIGEST || '291e591bee825433f1b9960df9ffe77a099bd58acfc2fe4404fc49070c7059d3';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });

    const out = await page.evaluate(async ({ digest }) => {
      const planMod = await import('/engraving-plan.js?v=1');
      const item = await (await fetch('/api/scores/' + digest)).json();
      const xml = item.xml;

      // —— 旧算法（内联复刻，逐字来自改动前的 engraving-plan.js）——
      function oldPlan(doc) {
        const serializer = new XMLSerializer(), root = doc.documentElement;
        const open = serializer.serializeToString(root.cloneNode(false)).replace(/\s*\/>$/, '>');
        const headers = [...root.children].filter(n => n.localName !== 'part').map(n => serializer.serializeToString(n)).join('');
        const parts = [];
        for (const part of [...root.children].filter(n => n.localName === 'part')) {
          const measures = [], changes = [], state = new Map();
          for (const measure of [...part.children].filter(n => n.localName === 'measure')) {
            const attributes = measure.querySelector(':scope > attributes');
            if (attributes) { for (const attr of attributes.children) state.set(attr.localName + ':' + (attr.getAttribute('number') || ''), serializer.serializeToString(attr)); changes.push({ at: measures.length, state: new Map(state) }); }
            measures.push(serializer.serializeToString(measure));
          }
          parts.push({ open: serializer.serializeToString(part.cloneNode(false)).replace(/\s*\/>$/, '>'), measures, changes });
        }
        return { open, headers, parts, close: '</' + root.tagName + '>' };
      }
      function oldChunk(plan, start, count) {
        const raw = plan.open + plan.headers + plan.parts.map(part => part.open + part.measures.slice(start, start + count).join('') + '</part>').join('') + plan.close;
        const doc = new DOMParser().parseFromString(raw, 'application/xml');
        if (start) for (const [index, part] of [...doc.documentElement.children].filter(n => n.localName === 'part').entries()) {
          const source = plan.parts[index]; let inherited;
          for (const change of source.changes) { if (change.at >= start) break; inherited = change.state; }
          const first = part.querySelector('measure'); if (!first || !inherited) continue;
          let attributes = first.querySelector(':scope > attributes'); if (!attributes) { attributes = doc.createElement('attributes'); first.prepend(attributes); }
          const existing = new Set([...attributes.children].map(n => n.localName + ':' + (n.getAttribute('number') || '')));
          for (const [key, value] of inherited) if (!existing.has(key)) { const node = new DOMParser().parseFromString(value, 'application/xml').documentElement; attributes.append(doc.importNode(node, true)); }
        }
        return new XMLSerializer().serializeToString(doc);
      }

      const reference = oldPlan(new DOMParser().parseFromString(xml, 'application/xml'));
      const fresh = { xml, measures: reference.count };   // 新实现按 score.xml 自建计划
      const starts = [0, 16, 32, 48, 64, 96, 400, 1616];
      const report = [];
      for (const start of starts) {
        const a = oldChunk(reference, start, 16);
        const b = await planMod.engravingChunk(fresh, start, 16);
        report.push({ start, same: a === b, oldLen: a.length, newLen: b.length, diffAt: a === b ? -1 : (() => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i; return n; })() });
      }
      return { count: reference.count, parts: reference.parts.length, report };
    }, { digest: DIGEST });

    console.log('\n=== 分块输出等价性（旧全量算法 vs 新惰性算法）===');
    console.log('  小节数:', out.count, ' 声部数:', out.parts);
    let ok = true;
    for (const r of out.report) { if (!r.same) ok = false; console.log(`  start=${String(r.start).padStart(4)}  ${r.same ? '✓ 完全一致' : '✗ 不一致'}  旧 ${r.oldLen} / 新 ${r.newLen}  diffAt=${r.diffAt}`); }
    console.log(ok ? '\n结论：全部一致，惰性实现与旧实现输出逐字节相同。' : '\n结论：存在不一致，需要修复！');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
