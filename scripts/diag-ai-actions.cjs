#!/usr/bin/env node
// 深挖：AI 返回的 actions 到底是什么？busy 什么时候才复位？
//
// 观测手段：
//   ① 抓 POST /api/workspace-ai 的**响应体**（含 actions 数组）—— 判断后端有没有给动作
//   ② 读发送按钮文本：busy 时是 '■'、空闲是 '↑'（workspace-ai.js 第 516/539 行）
//      —— 用它精确测「上一轮动作卡多久才释放」，解释连续对话为什么被判"停止"
//
// ★ 必须串行跑。

const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = 'http://127.0.0.1:5173/';
const STEPS = ['打开《知足》', '速度调到 92', '播放'];

(async () => {
  const browser = await chromium.launch({
    headless: true, channel: 'msedge',
    proxy: { server: 'http://127.0.0.1:7897', bypass: '<-loopback>' }
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });

  const aiCalls = [];
  page.on('response', async r => {
    if (r.url().includes('/api/workspace-ai') && r.request().method() === 'POST') {
      let body = '';
      try { body = await r.text(); } catch { body = '(读不到)'; }
      aiCalls.push({ status: r.status(), body: body.slice(0, 1200), at: Date.now() });
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForSelector('.library-score', { timeout: 90000 }).catch(() => {});
  await sleep(2000);
  for (const t of ['跳过', '跳过选曲']) await page.click('button:has-text("' + t + '")', { timeout: 2000 }).catch(() => {});
  await sleep(1000);
  await page.click('#workspace-ai', { timeout: 8000 }).catch(() => {});
  await sleep(800);

  // busy 标志：发送按钮 '■' = 忙，'↑' = 空闲
  const busyFlag = () => page.evaluate(() => {
    const b = document.querySelector('dialog.ai-conversation button[type=submit]');
    return b ? b.textContent.trim() : null;
  });
  const readState = () => page.evaluate(() => {
    const live = new Promise(r => document.dispatchEvent(new CustomEvent('ai-workspace-context', { detail: { resolve: r } })));
    return Promise.race([live, new Promise(r => setTimeout(() => r(null), 3000))]).then(l => ({
      title: (document.querySelector('#score-title')?.textContent || '').trim(),
      tempo: Number(document.querySelector('#tempo')?.value),
      playing: !!l?.playing, view: l?.view || '',
    }));
  }).catch(() => ({}));

  for (let i = 0; i < STEPS.length; i++) {
    const say = STEPS[i];
    const before = await readState();
    const flagBefore = await busyFlag();
    const nBefore = aiCalls.length;
    const t0 = Date.now();

    console.log(`\n=== 第${i + 1}步「${say}」 发之前 busy='${flagBefore}' 状态=${JSON.stringify(before)}`);
    await page.fill('dialog.ai-conversation input', say).catch(() => {});
    await page.click('dialog.ai-conversation button[type=submit]').catch(async () => {
      await page.evaluate(() => document.querySelector('dialog.ai-conversation form')?.requestSubmit());
    });

    // 等 busy 复位（'↑'），最多 150s，记录耗时
    let releasedAt = null;
    while (Date.now() - t0 < 150000) {
      await sleep(500);
      const f = await busyFlag();
      if (f === '↑') { releasedAt = Date.now() - t0; break; }
    }
    const after = await readState();
    console.log(`   busy 复位耗时: ${releasedAt == null ? '>150s 未复位(卡死)' : (releasedAt / 1000).toFixed(1) + 's'}`);
    console.log(`   状态: ${JSON.stringify(after)}`);
    const calls = aiCalls.slice(nBefore);
    console.log(`   /api/workspace-ai 调用 ${calls.length} 次`);
    for (const c of calls) {
      let acts = null, reply = null;
      try {
        // 流式响应是 SSE：逐行 data:，找含 actions 的
        const m = c.body.match(/\{[\s\S]*"actions"[\s\S]*?\}/);
        if (m) { const j = JSON.parse(m[0]); acts = j.actions; reply = (j.reply || '').slice(0, 80); }
        else { const j = JSON.parse(c.body); acts = j.actions; reply = (j.reply || '').slice(0, 80); }
      } catch { /* 流式片段，下面回退到文本搜索 */ }
      console.log(`     HTTP ${c.status} actions=${acts == null ? '(解析不出)' : JSON.stringify(acts).slice(0, 300)}`);
      if (reply) console.log(`     reply=${reply}`);
      if (acts == null) console.log(`     原文片段: ${c.body.slice(0, 300)}`);
    }
  }

  await browser.close();
})().catch(e => { console.error('异常:', e.message); process.exit(1); });
