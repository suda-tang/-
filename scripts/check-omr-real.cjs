const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:5173/');
    await page.locator('#pdf-input').setInputFiles('outputs/Dichterliebe01.pdf');
    await page.waitForFunction(() => document.querySelectorAll('#pdf-pages canvas').length === 2, null, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#score-subtitle').textContent.includes('组起音') || document.querySelector('#notice').textContent.includes('识别失败'), null, { timeout: 360000 });
    const result = await page.evaluate(() => ({
      notice: document.querySelector('#notice').textContent,
      title: document.querySelector('#score-title').textContent,
      notes: document.querySelectorAll('.note-event').length,
      playDisabled: document.querySelector('#play-button').disabled,
      service: document.querySelector('#service-state').textContent,
    }));
    console.log(JSON.stringify(result, null, 2));
    assert.match(result.notice, /自动演奏|识谱完成/);
    assert.ok(result.notes > 0, 'Audiveris should produce at least one note');
    assert.equal(result.playDisabled, false);
    assert.deepEqual(errors, []);
    console.log('PASS: real Audiveris PDF recognition reached playable MusicXML.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
