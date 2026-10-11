#!/usr/bin/env node
// 对照实验：曲库**先加载就绪**后，AI 是否就正常？顺带实测日常 AI 操作是否真生效。
//
// 假设：轮1 失败的根因是 readCloudLibrary() 冷启动时 /api/scores(722KB) >15s 被 abort。
//   若"先等曲库渲染完（cloudLibrarySnapshot 就绪）再问 AI"就一切正常 → 根因确证为
//   **冷启动竞态**，而不是模型或后端坏了。
//
// 同时复测历史 48 条音乐家用例里最常失败的四项日常操作：
//   打开曲谱 / 改速度 / 播放 / 切音轨视图 / 节拍器
//
// ★ 必须串行跑。

const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = 'http://127.0.0.1:5173/';

const STEPS = [
  { say: '打开《知足》', expect: s => s.title && s.title.includes('知足'), want: '曲名含「知足」' },
  { say: '速度调到 92', expect: s => s.tempo === 92, want: '速度 = 92' },
  { say: '播放', expect: s => s.playing === true, want: 'playing = true' },
  { say: '切到音轨视图', expect: s => s.view === 'daw', want: 'view = daw' },
  { say: '打开节拍器', expect: s => s.metronome === true, want: '节拍器 = on' },
];

(async () => {
  const browser = await chromium.launch({
    headless: true, channel: 'msedge',
    proxy: { server: 'http://127.0.0.1:7897', bypass: '<-loopback>' }
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });

  const reqs = [];
  const track = (u, m) => /\/api\/(scores|workspace-ai)/.test(u);
  page.on('request', r => { if (track(r.url())) reqs.push({ u: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 40), m: r.method(), t0: Date.now(), st: null, ms: null, f: null }); });
  page.on('response', r => { if (track(r.url())) { const x = [...reqs].reverse().find(q => q.ms == null && q.u === r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 40)); if (x) { x.st = r.status(); x.ms = Date.now() - x.t0; } } });
  page.on('requestfailed', r => { if (track(r.url())) { const x = [...reqs].reverse().find(q => q.ms == null && q.u === r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 40)); if (x) { x.f = r.failure()?.errorText; x.ms = Date.now() - x.t0; } } });

  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});

  // ★ 关键：先等曲库首屏渲染完，让 window.cloudLibrarySnapshot 就绪
  console.log('等待曲库首屏加载…');
  const tLib = Date.now();
  await page.waitForSelector('.library-score', { timeout: 90000 }).catch(() => console.log('  (未等到 .library-score)'));
  await sleep(2000);
  const cache = await page.evaluate(() => {
    const s = window.cloudLibrarySnapshot;
    return { has: !!(s && s.scores), count: s?.scores?.length || 0, ageSec: s ? Math.round((Date.now() - s.saved) / 1000) : null };
  });
  console.log('曲库就绪用时 %.1fs，缓存: %s', (Date.now() - tLib) / 1000, JSON.stringify(cache));

  for (const t of ['跳过', '跳过选曲']) await page.click('button:has-text("' + t + '")', { timeout: 2000 }).catch(() => {});
  await sleep(1000);
  await page.click('#workspace-ai', { timeout: 8000 }).catch(() => {});
  await sleep(800);

  const readState = () => page.evaluate(() => {
    const live = new Promise(r => document.dispatchEvent(new CustomEvent('ai-workspace-context', { detail: { resolve: r } })));
    return Promise.race([live, new Promise(r => setTimeout(() => r(null), 3000))]).then(l => ({
      title: (document.querySelector('#score-title')?.textContent || '').trim(),
      playing: !!l?.playing, view: l?.view || '',
      tempo: Number(document.querySelector('#tempo')?.value),
      metronome: !!document.querySelector('#metronome')?.checked,
    }));
  }).catch(() => ({}));

  const lastReply = () => page.evaluate(() => {
    const it = [...document.querySelectorAll('dialog.ai-conversation .ai-messages > *')];
    for (let i = it.length - 1; i >= 0; i--) if (it[i].classList.contains('assistant')) return it[i].textContent.trim();
    return '';
  });

  const out = [];
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    const mark = reqs.length;
    const t0 = Date.now();
    await page.fill('dialog.ai-conversation input', s.say).catch(() => {});
    await page.click('dialog.ai-conversation button[type=submit]').catch(async () => {
      await page.evaluate(() => document.querySelector('dialog.ai-conversation form')?.requestSubmit());
    });
    let prev = '', stable = 0, reply = '';
    while (Date.now() - t0 < 100000) {
      await sleep(1500);
      reply = await lastReply().catch(() => '');
      if (reply && reply === prev) { stable++; if (stable >= 2) break; } else stable = 0;
      prev = reply;
    }
    await sleep(800);
    const st = await readState();
    const ms = Date.now() - t0;
    const posted = reqs.slice(mark).filter(r => r.u.includes('workspace-ai'));
    const ok = s.expect(st);
    out.push({ step: i + 1, say: s.say, want: s.want, ok, ms, reply: reply.slice(0, 160), state: st, aiPosted: posted.length, postedMs: posted.map(p => p.ms) });
    console.log(`\n[${ok ? '生效' : '未生效'}] 第${i + 1}步「${s.say}」→ 期望 ${s.want}，实际 ${JSON.stringify(st)}`);
    console.log(`   耗时 ${(ms / 1000).toFixed(1)}s | AI 请求发出: ${posted.length} 次 ${JSON.stringify(posted.map(p => p.ms))}`);
    console.log(`   回复: ${reply.slice(0, 130).replace(/\n/g, ' ')}`);
    if (/已停止这次请求|请求等待超时/.test(reply)) console.log('   ★ AI 未真正响应（卡死或超时）');
  }

  console.log('\n' + '─'.repeat(70));
  const bad = out.filter(o => !o.ok);
  console.log(`日常 AI 操作 ${out.length} 步，未生效 ${bad.length} 步`);
  for (const b of bad) console.log(`  「${b.say}」期望 ${b.want}，实际 ${JSON.stringify(b.state)}`);
  console.log('曲库就绪后 AI 请求发出次数:', out.map(o => o.aiPosted).join(','));
  await browser.close();
})().catch(e => { console.error('异常:', e.message); process.exit(1); });
