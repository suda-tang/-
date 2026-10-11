const { chromium } = require('playwright');
const path = require('path');

const CHROME = 'C:/Users/mail/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const CSS = path.resolve(__dirname, '../dist/workspace-ai.css');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 380, height: 800 } }); // narrow chat column
  await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="file://${CSS}"></head><body style="margin:0;background:#caa">
    <div style="width:340px;padding:8px;box-sizing:border-box">
      <section class="ai-search-card">
        <strong>曲库里暂未找到</strong>
        <p>所需作品</p>
        <button type="button">联网找谱</button>
        <a href="#">用音视频链接转谱</a>
      </section>
    </div>
  </body></html>`);
  await page.waitForTimeout(300);
  const data = await page.evaluate(() => {
    const card = document.querySelector('.ai-search-card');
    const btn = card.querySelector('button');
    const link = card.querySelector('a');
    const measure = (el) => ({ sw: el.scrollWidth, cw: el.clientWidth, overflow: el.scrollWidth > el.clientWidth + 1, txt: el.textContent.trim() });
    return {
      card: measure(card),
      btn: measure(btn),
      link: measure(link),
      btnRect: btn.getBoundingClientRect(),
    };
  });
  console.log(JSON.stringify(data, null, 2));
  await page.screenshot({ path: path.resolve(__dirname, '_probe_searchcard.png'), fullPage: true });
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
