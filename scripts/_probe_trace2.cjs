// 细化归因：EventDispatch 按事件类型聚合；TimerFire / IntersectionObserver 也一并列出。
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

    // 主线程判定
    const perThread = new Map();
    for (const e of events) if (e.dur) { const k = e.pid + ':' + e.tid; perThread.set(k, (perThread.get(k) || 0) + e.dur); }
    const busiest = [...perThread.entries()].sort((a, b) => b[1] - a[1])[0];
    const [mainPid, mainTid] = busiest[0].split(':').map(Number);
    const onMain = e => e.pid === mainPid && e.tid === mainTid && e.dur;

    const agg = (name, keyFn) => {
      const m = new Map();
      for (const e of events) {
        if (e.name !== name || !onMain(e)) continue;
        const k = keyFn(e) || '(未知)';
        const cur = m.get(k) || { ms: 0, n: 0 }; cur.ms += e.dur / 1000; cur.n += 1; m.set(k, cur);
      }
      return [...m.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 14);
    };

    console.log('\n=== EventDispatch 按事件类型（主线程）===');
    for (const [k, v] of agg('EventDispatch', e => e.args?.data?.type)) console.log('  ' + (v.ms / 1000).toFixed(2).padStart(7) + ' s  ' + String(v.n).padStart(5) + ' 次  ' + k);
    console.log('\n=== TimerFire（谁在跑定时器）===');
    for (const [k, v] of agg('TimerFire', e => e.args?.data?.timerId !== undefined ? 'timerId=' + e.args.data.timerId : '(无)')) console.log('  ' + (v.ms / 1000).toFixed(2).padStart(7) + ' s  ' + String(v.n).padStart(5) + ' 次  ' + k);
    console.log('\n=== 事件总时长 Top10（所有类型，含嵌套）===');
    const byName = new Map();
    for (const e of events) if (onMain(e)) { const c = byName.get(e.name) || { ms: 0, n: 0 }; c.ms += e.dur / 1000; c.n++; byName.set(e.name, c); }
    for (const [k, v] of [...byName.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10)) console.log('  ' + (v.ms / 1000).toFixed(2).padStart(7) + ' s  ' + String(v.n).padStart(5) + ' 次  ' + k);
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
