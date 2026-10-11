// 最小启动检查：抓页面错误与控制台错误，确认前端能正常 boot。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = [], logs = [];
    page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 400)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 400)); else logs.push(m.type() + ': ' + m.text().slice(0, 200)); });
    page.on('requestfailed', r => errs.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText || '')));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    let ok = false;
    try { await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 45000 }); ok = true; } catch { }
    console.log('boot-ready:', ok);
    console.log('html classes:', await page.evaluate(() => document.documentElement.className));
    console.log('workspaceReady:', await page.evaluate(() => document.documentElement.dataset.workspaceReady));
    console.log('\n--- 错误 ---'); errs.slice(0, 20).forEach(e => console.log(' ', e));
    if (!errs.length) console.log('  （无）');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
