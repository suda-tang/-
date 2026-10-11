const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const URL = 'http://127.0.0.1:5173/';
(async () => {
  const b = await chromium.launch({ headless: true, channel: 'msedge' });
  const p = await b.newPage({ viewport: { width: 1360, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(3000);

  const diag = async (tag) => {
    const s = await p.evaluate(() => {
      const browser = document.querySelector('.library-browser');
      const list = document.querySelector('.library-list');
      const panel = document.querySelector('.score-library');
      return {
        libraryBrowserExists: !!browser,
        browserOpen: browser ? browser.matches(':open') : false,
        listExists: !!list,
        listCards: list ? list.querySelectorAll('.library-score').length : -1,
        listBusy: list ? list.getAttribute('aria-busy') : null,
        panelExists: !!panel,
        panelHidden: panel ? panel.hidden : null,
        dataPanelLibrary: !!document.querySelector('[data-panel="library"]'),
        buttons: [...document.querySelectorAll('button')].map(x => x.textContent.trim()).filter(Boolean).slice(0, 25),
        guidedTour: !!document.querySelector('.guided-tour,.tour-home-intro,.score-loading-overlay'),
        startup: window.__startupLog ? window.__startupLog : 'n/a'
      };
    });
    console.log(`[${tag}]`, JSON.stringify(s));
  };

  await diag('init-3s');
  // 尝试关闭引导层
  for (const t of ['跳过', '跳过选曲', '进入曲库']) await p.click(`button:has-text("${t}")`, { timeout: 1500 }).catch(() => {});
  await p.evaluate(() => { for (const sel of ['.guided-tour [data-skip]', '.tour-home-intro [data-close]']) { const el = document.querySelector(sel); if (el) { el.click(); break; } } });
  await diag('after-dismiss');

  // 点击曲库导航
  await p.click('[data-panel="library"]', { timeout: 4000 }).catch(() => {});
  await p.click('button:has-text("曲库")', { timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(2000);
  await diag('after-click-library');

  // 等卡片
  try { await p.waitForSelector('.library-score', { timeout: 8000 }); console.log('library-score appeared'); } catch { console.log('library-score NEVER appeared'); }
  await diag('after-wait-score');

  console.log('PAGE_ERRORS', JSON.stringify(errs));
  await b.close();
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
