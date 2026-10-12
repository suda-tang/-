// 验证琴谱库在「隧道/网络抖动」下的韧性：前两次 /api/scores 请求被模拟中断（abort），
// 第三次才放行。若 reload() 的重试逻辑生效，曲库应最终正常加载；否则会卡在「琴谱库暂不可用」。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const b = await chromium.launch({ headless: true, channel: 'msedge',proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});
  const page = await b.newPage({ viewport: { width: 1360, height: 1000 } });
  const failures = [];
  page.on('pageerror', e => failures.push('pageerror: ' + e.message));

  // 模拟隧道抖动：前 2 次请求中断，第 3 次起放行
  let n = 0;
  await page.route('**/api/scores', route => {
    n++;
    if (n <= 2) { console.log(`  [route] #${n} /api/scores -> abort (模拟抖动)`); return route.abort(); }
    console.log(`  [route] #${n} /api/scores -> continue (放行真实响应)`);
    return route.continue();
  });

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' }).catch(() => {});
  // 关引导层
  for (let i = 0; i < 6; i++) {
    const skipped = await page.evaluate(() => {
      const cands = [...document.querySelectorAll('button')].filter(x => /跳过|稍后|进入/.test(x.textContent));
      if (cands[0]) { cands[0].click(); return true; }
      const close = document.querySelector('.tour-home-intro [data-close],.guided-tour [data-skip]');
      if (close) { close.click(); return true; }
      return false;
    });
    if (skipped) await page.waitForTimeout(400);
  }

  // 打开曲库面板
  let opened = false;
  for (const sel of ['[data-panel="library"]', 'button:has-text("曲库")', '.library-expand']) {
    try { await page.click(sel, { timeout: 2500 }); opened = true; break; } catch {}
  }
  await page.waitForTimeout(500);

  // 等待卡片出现或「暂不可用」文案
  const start = Date.now();
  let cards = 0, unavailable = false;
  while (Date.now() - start < 30000) {
    const s = await page.evaluate(() => ({
      cards: document.querySelectorAll('.library-score').length,
      unavail: document.body.innerText.includes('琴谱库暂不可用'),
    }));
    cards = s.cards; unavailable = s.unavail;
    if (cards > 0 || unavailable) break;
    await page.waitForTimeout(400);
  }

  console.log(`route 命中次数 n=${n} | 卡片数=${cards} | 暂不可用=${unavailable} | pageerrors=${failures.length}`);
  if (failures.length) console.log('  ' + failures.join('\n  '));

  const pass = cards > 0 && !unavailable;
  console.log(pass ? 'RESULT: PASS（抖动下曲库仍正常加载）' : 'RESULT: FAIL（曲库卡在暂不可用）');
  await b.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('探针异常:', e.message); process.exit(2); });
