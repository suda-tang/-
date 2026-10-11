// 用 Chrome Tracing 做最终归因：按事件名聚合主线程耗时（ParseXML / GC / Layout / FunctionCall …）。
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
    await cdp.send('Tracing.start', {
      categories: 'devtools.timeline,v8,blink.user_timing,loading',
      transferMode: 'ReportEvents',
    });

    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    const wall = (Date.now() - t0) / 1000;
    await cdp.send('Tracing.end');
    for (let i = 0; i < 100 && !done; i++) await page.waitForTimeout(100);

    // 只看主线程（有 dur 的完整事件），按名字聚合
    const byName = new Map();
    let mainTid = null, mainPid = null;
    const durEvents = events.filter(e => typeof e.dur === 'number' && e.dur > 0);
    // 取「耗时最长的那个线程」当作渲染主线程
    const perThread = new Map();
    for (const e of durEvents) { const k = e.pid + ':' + e.tid; perThread.set(k, (perThread.get(k) || 0) + e.dur); }
    const busiest = [...perThread.entries()].sort((a, b) => b[1] - a[1])[0];
    if (busiest) { const [pid, tid] = busiest[0].split(':').map(Number); mainPid = pid; mainTid = tid; }
    for (const e of durEvents) {
      if (mainPid !== null && (e.pid !== mainPid || e.tid !== mainTid)) continue;
      const k = e.name;
      const cur = byName.get(k) || { ms: 0, n: 0 };
      cur.ms += e.dur / 1000; cur.n += 1;
      byName.set(k, cur);
    }
    const rows = [...byName.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 28);
    const total = [...byName.values()].reduce((s, v) => s + v.ms, 0);
    console.log(`\n打开耗时 ${wall.toFixed(1)}s；trace 事件 ${events.length} 个；主线程可归因总时长 ${(total / 1000).toFixed(2)}s`);
    console.log('\n=== 主线程耗时 Top28（按事件名聚合）===');
    for (const [name, v] of rows) console.log('  ' + (v.ms / 1000).toFixed(2).padStart(8) + ' s  ' + String(v.n).padStart(6) + ' 次  ' + name);
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
