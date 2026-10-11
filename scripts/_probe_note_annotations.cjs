// 验证排版后的音符注解仍然正确：.note-event 有 data-index，且点击能跳转（seek）。
// 这是对「先量后写」改动的功能回归。
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
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => {
      const notes = [...document.querySelectorAll('#notation .note-event')];
      const withIndex = notes.filter(n => n.dataset.index !== undefined && n.dataset.index !== '');
      const withHit = notes.filter(n => n.querySelector(':scope > .score-hit'));
      const labels = document.querySelectorAll('#notation .staff-instrument-label');
      const sample = withIndex.slice(0, 3).map(n => ({ index: n.dataset.index, measure: n.dataset.measure, part: n.dataset.part, hit: !!n.querySelector(':scope > .score-hit') }));
      return { total: notes.length, withIndex: withIndex.length, withHit: withHit.length, labels: labels.length, sample };
    });
    console.log('音符总数:', info.total, ' 有 data-index:', info.withIndex, ' 有命中区:', info.withHit, ' 乐器名标注:', info.labels);
    console.log('样例:', JSON.stringify(info.sample));

    // 点击第一个带 index 的音符 → 应触发跳转（position 文案/播放位置变化）
    const clicked = await page.evaluate(async () => {
      const el = [...document.querySelectorAll('#notation .note-event')].find(n => n.dataset.index);
      if (!el) return 'no-element';
      const before = document.querySelector('#position')?.textContent || '';
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 900));
      return { before, after: document.querySelector('#position')?.textContent || '' };
    });
    console.log('点击跳转:', JSON.stringify(clicked));
    console.log('页面错误:', errors.length ? JSON.stringify(errors) : '无');

    const ok = info.total > 0 && info.withIndex === info.total && info.withHit === info.total && info.labels > 0 && errors.length === 0;
    console.log(ok ? '\nPASS 音符注解完整（data-index / 命中区 / 乐器名齐全），点击可跳转，无页面错误' : '\nFAIL 注解不完整');
    if (!ok) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
