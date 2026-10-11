// 缓存优先回归探针（Bug5）
// 场景 A：清空缓存 + 接口被人为延迟 2s —— 首屏必须等 fetch，首卡出现时刻 ≈ 延迟后
// 场景 B：保留 A 写入的 localStorage 缓存 + 接口直接 abort —— 首屏应来自缓存秒显，
//         且后台更新失败时必须保留缓存（显示卡片），绝不能出现"暂不可用"
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const URL = 'http://127.0.0.1:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pollCards(page) {
  const t0 = Date.now();
  let firstCardAt = null, last = 0;
  for (let i = 0; i < 240; i++) {
    const r = await page.evaluate(() => {
      const l = document.querySelector('.library-list');
      return {
        c: l ? l.querySelectorAll('.library-score').length : 0,
        busy: l ? l.getAttribute('aria-busy') : null,
        dead: !!document.querySelector('.library-list') && /暂不可用/.test(document.body.innerText)
      };
    }).catch(() => ({ c: 0, busy: null, dead: false }));
    if (r.c > 0 && firstCardAt === null) firstCardAt = Date.now() - t0;
    last = r.c;
    if (r.dead) return { firstCardAt, last, dead: true, elapsed: Date.now() - t0 };
    if (r.c > 0 && !r.busy) return { firstCardAt, last, dead: false, elapsed: Date.now() - t0 };
    await sleep(100);
  }
  return { firstCardAt, last, dead: false, elapsed: Date.now() - t0 };
}

(async () => {
  // 预取真实接口数据，供 route.fulfill 使用（node 直连 127.0.0.1，不经代理）
  let REAL = '';
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 20000);
    REAL = await (await fetch('http://127.0.0.1:5173/api/scores', { signal: ctrl.signal })).text();
    clearTimeout(to);
  } catch (e) { console.error('预取 /api/scores 失败:', e.message); process.exit(2); }
  const realCount = (JSON.parse(REAL).scores || []).length;
  console.log('预取真实曲目数 =', realCount);

  const browser = await chromium.launch({
    headless: true, channel: 'msedge',
    proxy: { server: 'http://127.0.0.1:7897', bypass: '<-loopback>' }
  });
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();

  // ===== 场景 A：清缓存 + 接口人为延迟 2s =====
  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.route('**/api/scores', async route => {
    await sleep(2000); // 模拟慢接口
    await route.fulfill({ status: 200, contentType: 'application/json', body: REAL });
  });
  // 触发一次新加载（reload 已在模块初始化跑过，这里再 goto 一次确保走新逻辑）
  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const a = await pollCards(page);
  console.log('场景A(清缓存+延迟2s):', JSON.stringify(a));

  // ===== 场景 B：保留 localStorage 缓存 + 接口直接 abort =====
  await page.route('**/api/scores', route => route.abort()); // 覆盖上面的延迟路由
  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const b = await pollCards(page);
  console.log('场景B(缓存+接口abort):', JSON.stringify(b));

  await browser.close();

  // ===== 断言 =====
  const passA = a.last > 0 && !a.dead;
  const passB = b.last > 0 && !b.dead;            // 接口挂了仍有卡片、无"暂不可用"
  const passCacheFaster = a.firstCardAt !== null && b.firstCardAt !== null
    && b.firstCardAt < a.firstCardAt;             // 缓存首显明显快于首次 fetch
  console.log('断言 A(首屏正常加载):', passA);
  console.log('断言 B(接口挂仍显示缓存,无暂不可用):', passB);
  console.log('断言 C(缓存首显更快 firstCardAt B<A):', passCacheFaster, `(A=${a.firstCardAt}ms B=${b.firstCardAt}ms)`);
  const ok = passA && passB && passCacheFaster;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('探针异常:', e.message); process.exit(1); });
