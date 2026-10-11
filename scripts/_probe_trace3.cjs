// 直接列出「单个耗时最长的事件」，并单独看 EventDispatch 的类型分布（取前 14 条）。
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

    const perThread = new Map();
    for (const e of events) if (e.dur) { const k = e.pid + ':' + e.tid; perThread.set(k, (perThread.get(k) || 0) + e.dur); }
    const [mainPid, mainTid] = [...perThread.entries()].sort((a, b) => b[1] - a[1])[0][0].split(':').map(Number);
    const onMain = events.filter(e => e.pid === mainPid && e.tid === mainTid && e.dur);

    const desc = e => {
      const a = e.args || {};
      const bits = [];
      if (a.data?.type) bits.push('type=' + a.data.type);
      if (a.data?.functionName) bits.push('fn=' + a.data.functionName);
      if (a.data?.url) bits.push(String(a.data.url).split('/').pop().slice(0, 40));
      if (a.beginData?.frame) bits.push('frame=' + String(a.beginData.frame).split('/').pop().slice(0, 40) + ':' + a.beginData.lineNumber);
      if (a.data?.timerId !== undefined) bits.push('timer=' + a.data.timerId);
      if (a.data?.nodeName) bits.push('node=' + a.data.nodeName);
      return bits.join(' ') || '';
    };

    console.log('\n=== 单个耗时最长的 22 个事件 ===');
    for (const e of [...onMain].sort((a, b) => b.dur - a.dur).slice(0, 22))
      console.log('  ' + (e.dur / 1000).toFixed(0).padStart(6) + ' ms  ' + e.name.padEnd(34) + ' ' + desc(e));

    const m = new Map();
    for (const e of onMain) { if (e.name !== 'EventDispatch') continue; const k = e.args?.data?.type || '(未知)'; const c = m.get(k) || { ms: 0, n: 0 }; c.ms += e.dur / 1000; c.n++; m.set(k, c); }
    console.log('\n=== EventDispatch 按类型（前 14，降序）===');
    for (const [k, v] of [...m.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 14)) console.log('  ' + (v.ms / 1000).toFixed(2).padStart(7) + ' s  ' + String(v.n).padStart(5) + ' 次  ' + k);
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
