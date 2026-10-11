// Bug4 回归：云曲库首屏流式渲染
// 曲库卡片在页面初始化时就渲染进首页的 .library-list（无需打开曲库面板）。
// 核心断言：第一张卡片出现时，列表卡片数应很小（首张单独先显，而非和全量一起涌出），
//           且首张出现明显早于全部加载完成（流式过程可见）。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const URL = 'http://127.0.0.1:5173/';
const THROTTLE = process.env.THROTTLE ? Number(process.env.THROTTLE) : 800; // 模拟弱网：/api/scores 延迟 ms

(async () => {
  const browser = await chromium.launch({
    headless: true, channel: 'msedge',
    // 走系统代理(Clash 7897)，但用 Chromium 原生 bypass 让 127.0.0.1/localhost 直连，避免 localhost 被当远程拖慢
    args: ['--proxy-server=http://127.0.0.1:7897', '--proxy-bypass-list=127.0.0.1;localhost']
  });
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  const scoresT = {};
  page.on('request', req => { if (req.url().includes('/api/scores')) scoresT[req.url()] = Date.now(); });
  page.on('response', resp => { const u = resp.request().url(); if (u.includes('/api/scores') && scoresT[u]) console.log('SCORES_NET', Date.now() - scoresT[u], 'ms, status', resp.status()); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // 模拟弱网：让曲库接口延迟返回，给用户"干等"的真实压力场景
  if (THROTTLE > 0) {
    await page.route('**/api/scores', route => setTimeout(() => route.continue(), THROTTLE));
  }

  // 页面一加载（DOM 就绪即可）立刻开始轮询，不点任何东西，直接测初始化首显
  await page.goto(URL, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(500);

  let firstCardAt = null, cardsAtFirst = 0, allDoneAt = null, peak = 0, busyAtFirst = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const r = await page.evaluate(() => {
      const l = document.querySelector('.library-list');
      const c = l ? l.querySelectorAll('.library-score').length : 0;
      return { c, b: l ? l.getAttribute('aria-busy') : null };
    }).catch(() => ({ c: 0, b: null }));
    if (r.c > 0 && firstCardAt === null) { firstCardAt = Date.now() - t0; cardsAtFirst = r.c; busyAtFirst = r.b; }
    if (r.c > peak) peak = r.c;
    if (firstCardAt !== null && r.b === 'false' && r.c > 0) { allDoneAt = Date.now() - t0; break; }
    await page.waitForTimeout(10);
  }

  const span = (allDoneAt !== null && firstCardAt !== null) ? (allDoneAt - firstCardAt) : null;
  console.log(JSON.stringify({ firstCardAt, cardsAtFirst, peak, allDoneAt, span, busyAtFirst, errors }, null, 1));

  // 判定：首张单独先显(cardsAtFirst 很小) + 最终全量(peak 大) + 首张明显早于全部完成(span 可观)
  const ok =
    firstCardAt !== null &&
    allDoneAt !== null &&
    cardsAtFirst < 30 &&
    peak > 1800 &&
    span > 120;

  console.log(ok
    ? `PASS: 云曲库首屏流式渲染生效（首张在 ${firstCardAt}ms 先显，仅 ${cardsAtFirst} 张；全部 ${peak} 张在 ${allDoneAt}ms 完成，跨度 ${span}ms）`
    : 'FAIL: 未观察到流式首显（可能仍一次性全量渲染）');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
