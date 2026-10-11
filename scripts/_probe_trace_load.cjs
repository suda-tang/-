// 把「EventDispatch type=load」这个 6 秒长任务**拆开**：
// 只统计落在这个切片时间窗内的事件，看它到底由什么组成。
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
    await page.waitForTimeout(1500);

    const cdp = await page.context().newCDPSession(page);
    const events = [];
    let done = false;
    cdp.on('Tracing.dataCollected', ({ value }) => { for (const e of value) events.push(e); });
    cdp.on('Tracing.tracingComplete', () => { done = true; });
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing', transferMode: 'ReportEvents' });
    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    const wall = (Date.now() - t0) / 1000;
    await cdp.send('Tracing.end');
    for (let i = 0; i < 100 && !done; i++) await page.waitForTimeout(100);
    console.log(`打开耗时 ${wall.toFixed(1)}s`);

    // 主线程
    const perThread = new Map();
    for (const e of events) if (e.dur) { const k = e.pid + ':' + e.tid; perThread.set(k, (perThread.get(k) || 0) + e.dur); }
    const [mainPid, mainTid] = [...perThread.entries()].sort((a, b) => b[1] - a[1])[0][0].split(':').map(Number);
    const onMain = events.filter(e => e.pid === mainPid && e.tid === mainTid && e.dur);

    const load = onMain.filter(e => e.name === 'EventDispatch' && e.args?.data?.type === 'load').sort((a, b) => b.dur - a.dur)[0];
    if (!load) { console.log('没找到 load 事件'); return; }
    const from = load.ts, to = load.ts + load.dur;
    console.log(`\nload 切片：${(load.dur / 1000).toFixed(0)} ms`);
    const inside = onMain.filter(e => e.ts >= from && e.ts <= to);

    const agg = (name) => {
      const m = new Map();
      for (const e of inside) {
        if (e.name !== name) continue;
        const k = e.args?.data?.functionName || e.args?.data?.type || '(无)';
        const c = m.get(k) || { ms: 0, n: 0 }; c.ms += e.dur / 1000; c.n++; m.set(k, c);
      }
      return [...m.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10);
    };

    console.log('\n=== 落在 load 切片内的事件（按名字聚合）===');
    const byName = new Map();
    for (const e of inside) { const c = byName.get(e.name) || { ms: 0, n: 0 }; c.ms += e.dur / 1000; c.n++; byName.set(e.name, c); }
    for (const [k, v] of [...byName.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 18)) console.log('  ' + (v.ms / 1000).toFixed(2).padStart(7) + ' s  ' + String(v.n).padStart(6) + ' 次  ' + k);

    console.log('\n=== 切片内 FunctionCall 按函数名（JS 侧）===');
    for (const [k, v] of agg('FunctionCall')) console.log('  ' + (v.ms / 1000).toFixed(2).padStart(7) + ' s  ' + String(v.n).padStart(5) + ' 次  ' + String(k).slice(0, 80));

    console.log('\n=== 切片内单个最长事件 Top 18 ===');
    const desc = e => {
      const a = e.args || {};
      const bits = [];
      if (a.data?.type) bits.push('type=' + a.data.type);
      if (a.data?.functionName) bits.push('fn=' + a.data.functionName);
      if (a.data?.url) bits.push(String(a.data.url).split('/').pop().slice(0, 34));
      if (a.beginData?.frame) bits.push('frame=' + String(a.beginData.frame).split('/').pop().slice(0, 34));
      return bits.join(' ');
    };
    for (const e of [...inside].sort((a, b) => b.dur - a.dur).slice(0, 18))
      console.log('  ' + (e.dur / 1000).toFixed(0).padStart(6) + ' ms  ' + e.name.padEnd(32) + ' ' + desc(e));
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
