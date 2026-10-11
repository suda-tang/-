// 复刻 check-full-large-switch.cjs 的步骤，但每步打印，定位卡在哪一步。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(45000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message.slice(0, 300)));
    page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.log('  [console.' + m.type() + ']', m.text().slice(0, 200)); });
    const id = 'a'.repeat(64);
    const xml = '<score-partwise version="3.1"><work><work-title>Large ensemble</work-title></work><part-list>' + Array.from({ length: 8 }, (_, i) => '<score-part id="P' + i + '"><part-name>Piano ' + i + '</part-name></score-part>').join('') + '</part-list>' + Array.from({ length: 8 }, (_, i) => '<part id="P' + i + '">' + Array.from({ length: 256 }, (_, m) => '<measure number="' + (m + 1) + '">' + (m === 0 ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : '') + Array.from({ length: 4 }, (_, n) => '<note><pitch><step>' + ['C', 'D', 'E', 'F'][n] + '</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>').join('') + '</measure>').join('') + '</part>').join('') + '</score-partwise>';
    await page.route('**/api/scores', r => r.fulfill({ json: { scores: [] } }));
    await page.route('**/api/scores/' + id, r => r.fulfill({ json: { id, xml, metadata: { title: 'Large ensemble' } } }));
    await page.goto(ORIGIN + '/');
    await page.waitForFunction(() => document.documentElement.dataset.workspaceReady === 'true');
    console.log('1 workspaceReady OK');

    const t0 = Date.now();
    await page.evaluate(id => new Promise((resolve, reject) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve, reject } }))), id);
    console.log('2 ai-open-score OK  %ss', ((Date.now() - t0) / 1000).toFixed(1));
    const state = await page.evaluate(() => ({
      notationSvg: document.querySelectorAll('#notation svg').length,
      chunks: document.querySelectorAll('#notation .notation-chunk').length,
      caption: document.querySelector('#notation .notation-note')?.textContent || '',
      dawNotes: document.querySelectorAll('#daw-view .daw-note').length,
      hidden: document.querySelector('#notation')?.hidden,
    }));
    console.log('   状态:', JSON.stringify(state));

    for (let i = 0; i < 2; i++) {
      let t = Date.now();
      await page.locator('#simple-button').click();
      await page.waitForFunction(() => document.querySelector('#notation .simple-system'));
      console.log(`3.${i} simple OK  ${Date.now() - t}ms`);

      t = Date.now();
      await page.locator('#daw-button').click();
      try { await page.waitForFunction(() => document.querySelectorAll('#daw-view .daw-note').length === 8192, null, { timeout: 45000 }); console.log(`4.${i} daw OK  ${Date.now() - t}ms`); }
      catch (e) { console.log(`4.${i} daw 超时  ${Date.now() - t}ms  实际 daw-note=${await page.evaluate(() => document.querySelectorAll('#daw-view .daw-note').length)}`); }

      t = Date.now();
      await page.locator('#notation-button').click();
      try { await page.waitForFunction(() => document.querySelector('#notation svg'), null, { timeout: 45000 }); console.log(`5.${i} staff OK  ${Date.now() - t}ms`); }
      catch (e) {
        console.log(`5.${i} staff 超时  ${Date.now() - t}ms`);
        console.log('   ', JSON.stringify(await page.evaluate(() => ({
          svg: document.querySelectorAll('#notation svg').length,
          chunks: document.querySelectorAll('#notation .notation-chunk').length,
          rendered: document.querySelectorAll('#notation .notation-chunk svg').length,
          caption: document.querySelector('#notation .notation-note')?.textContent || '',
          lazy: document.querySelectorAll('#notation [data-lazy-measure]').length,
        }))));
      }
    }
    console.log('errors:', JSON.stringify(errors));
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
