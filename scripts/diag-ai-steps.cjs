#!/usr/bin/env node
// 按"等 busy 复位"的正确节奏，实测音乐家日常 AI 操作到底生不生效。
// 上一版判"未生效"是假象：打开大谱要 10~17s，而我在 7.8s 就读了状态；
// 且下一句话若在上一次动作执行期间发出，会被当成"停止上一次请求"。
//
// 本脚本：每步发完后**一直等到 busy 复位**（最多 90s）再读状态，并计时。
// ★ 必须串行跑。

const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = 'http://127.0.0.1:5173/';

const STEPS = [
  { say: '打开《知足》', check: s => /知足/.test(s.title || ''), want: '曲名含「知足」' },
  { say: '速度调到 92', check: s => s.tempo === 92, want: '速度 = 92' },
  { say: '播放', check: s => s.playing === true, want: 'playing = true' },
  { say: '切到音轨视图', check: s => s.view === 'daw', want: 'view = daw' },
  { say: '打开节拍器', check: s => s.metronome === true, want: '节拍器 = on' },
];

(async () => {
  const browser = await chromium.launch({
    headless: true, channel: 'msedge',
    proxy: { server: 'http://127.0.0.1:7897', bypass: '<-loopback>' }
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForSelector('.library-score', { timeout: 90000 }).catch(() => {});
  await sleep(2000);
  for (const t of ['跳过', '跳过选曲']) await page.click('button:has-text("' + t + '")', { timeout: 2000 }).catch(() => {});
  await sleep(1000);
  await page.click('#workspace-ai', { timeout: 8000 }).catch(() => {});
  await sleep(800);

  const busy = () => page.evaluate(() => {
    const b = document.querySelector('dialog.ai-conversation button[type=submit]');
    return b ? b.textContent.trim() : null;
  });
  const state = () => page.evaluate(() => {
    const live = new Promise(r => document.dispatchEvent(new CustomEvent('ai-workspace-context', { detail: { resolve: r } })));
    return Promise.race([live, new Promise(r => setTimeout(() => r(null), 3000))]).then(l => ({
      title: (document.querySelector('#score-title')?.textContent || '').trim(),
      tempo: Number(document.querySelector('#tempo')?.value),
      playing: !!l?.playing, view: l?.view || '',
      metronome: !!document.querySelector('#metronome')?.checked,
    }));
  }).catch(() => ({}));

  const rows = [];
  for (const s of STEPS) {
    const before = await state();
    const t0 = Date.now();
    await page.fill('dialog.ai-conversation input', s.say).catch(() => {});
    await page.click('dialog.ai-conversation button[type=submit]').catch(async () => {
      await page.evaluate(() => document.querySelector('dialog.ai-conversation form')?.requestSubmit());
    });
    let doneMs = null;
    while (Date.now() - t0 < 90000) {
      await sleep(1000);
      if ((await busy()) === '↑') { doneMs = Date.now() - t0; break; }
    }
    await sleep(1500);
    const after = await state();
    const ok = s.check(after);
    rows.push({ say: s.say, want: s.want, ok, doneMs, after });
    console.log(`${ok ? '✅生效' : '❌未生效'} 「${s.say}」 期望 ${s.want} | busy 复位 ${doneMs == null ? '>90s(卡死)' : (doneMs / 1000).toFixed(1) + 's'}`);
    console.log(`      before=${JSON.stringify(before)}`);
    console.log(`      after =${JSON.stringify(after)}`);
  }
  console.log('\n──────── 汇总 ────────');
  for (const r of rows) console.log(`${r.ok ? '✅' : '❌'} ${r.say.padEnd(14)} 期望 ${r.want.padEnd(16)} 耗时 ${r.doneMs == null ? '>90s' : (r.doneMs / 1000).toFixed(1) + 's'}`);
  const bad = rows.filter(r => !r.ok);
  console.log(`生效 ${rows.length - bad.length}/${rows.length}`);
  await browser.close();
})().catch(e => { console.error('异常:', e.message); process.exit(1); });
