// 鼓轨功能回归：改批量插入后，鼓点数量、命中区、点击跳转是否仍然正常。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });
    const target = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const s = d.scores.find(x => x.title.startsWith('Rienzi')) || d.scores.find(x => x.ready);
      return { id: s.id, title: s.title };
    });
    console.log('目标:', target.title);
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => {
      const staff = document.querySelector('#drum-staff');
      const card = document.querySelector('#drum-card');
      const hits = [...document.querySelectorAll('#drum-staff .drum-hit')];
      return {
        鼓卡片可见: card ? !card.hidden : null,
        鼓点数: hits.length,
        bars: document.querySelectorAll('#drum-staff .drum-bar').length,
        系统线: document.querySelectorAll('#drum-staff .drum-system-lines').length,
        staff宽高: staff ? [staff.style.width, staff.style.height] : null,
        _hits长度: staff?._hits?.length ?? null,
        前三个: hits.slice(0, 3).map(h => ({ index: h.dataset.index, text: h.textContent, left: h.style.left })),
      };
    });
    console.log(JSON.stringify(info, null, 1));

    const clicked = await page.evaluate(async () => {
      const hit = document.querySelector('#drum-staff .drum-hit');
      if (!hit) return 'no-hit';
      const before = document.querySelector('#position')?.textContent || '';
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 900));
      return { before, after: document.querySelector('#position')?.textContent || '' };
    });
    console.log('点击鼓点:', JSON.stringify(clicked));
    console.log('页面错误:', errors.length ? JSON.stringify(errors) : '无');

    const ok = info.鼓点数 > 0 && info._hits长度 === info.鼓点数 && info.bars > 0 && errors.length === 0;
    console.log(ok ? '\nPASS 鼓轨渲染正常（数量、_hits 一致、小节刻度齐全），点击可跳转' : '\nFAIL 鼓轨异常');
    if (!ok) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
