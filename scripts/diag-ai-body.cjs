#!/usr/bin/env node
// 抓 AI 响应体：后端到底返回了什么 actions？（打开曲谱 / 列候选 / 还是空）
// 用 page.route 中转，既能看请求 context 大小，也能拿到完整响应文本。
// ★ 必须串行跑。

const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = 'http://127.0.0.1:5173/';

(async () => {
  const browser = await chromium.launch({
    headless: true, channel: 'msedge',
    proxy: { server: 'http://127.0.0.1:7897', bypass: '<-loopback>' }
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });

  let ctxSize = 0;
  await page.route('**/api/workspace-ai', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const pd = route.request().postData() || '';
    ctxSize = pd.length;
    try {
      const parsed = JSON.parse(pd);
      const c = parsed.context || {};
      console.log('请求 context 字段:', Object.keys(c).join(','));
      console.log('  library(index) 长度:', String(c.library || '').length);
      console.log('  scores 条数:', Array.isArray(c.scores) ? c.scores.length : 0);
      console.log('  messages 条数:', Array.isArray(parsed.messages) ? parsed.messages.length : 0);
      console.log('  请求体总大小: %d KB', Math.round(pd.length / 1024));
    } catch (e) { console.log('请求体非 JSON'); }
    const res = await route.fetch();
    const txt = await res.text();
    console.log('响应 HTTP', res.status(), '大小 %d KB', Math.round(txt.length / 1024));
    // 流式 SSE：找最后一个完整 JSON
    const chunks = txt.split(/\n(?=data:)/).map(s => s.replace(/^data:\s*/, '').trim()).filter(Boolean);
    let last = null;
    for (const c of chunks) { try { const j = JSON.parse(c); if (j && (j.actions || j.reply)) last = j; } catch {} }
    if (!last) { try { last = JSON.parse(txt); } catch {} }
    if (last) {
      console.log('★ actions:', JSON.stringify(last.actions || []).slice(0, 600));
      console.log('★ reply:', String(last.reply || '').slice(0, 300));
    } else {
      console.log('响应片段:', txt.slice(0, 600));
    }
    await route.fulfill({ response: res, body: txt });
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForSelector('.library-score', { timeout: 90000 }).catch(() => {});
  await sleep(2000);
  for (const t of ['跳过', '跳过选曲']) await page.click('button:has-text("' + t + '")', { timeout: 2000 }).catch(() => {});
  await sleep(1000);
  await page.click('#workspace-ai', { timeout: 8000 }).catch(() => {});
  await sleep(800);

  const say = process.argv[2] || '打开《知足》';
  console.log('\n>>> 发送:', say);
  await page.fill('dialog.ai-conversation input', say).catch(() => {});
  await page.click('dialog.ai-conversation button[type=submit]').catch(async () => {
    await page.evaluate(() => document.querySelector('dialog.ai-conversation form')?.requestSubmit());
  });

  // 观察 90s：状态变化 + busy
  const t0 = Date.now();
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    const info = await page.evaluate(() => {
      const b = document.querySelector('dialog.ai-conversation button[type=submit]');
      return {
        busy: b ? b.textContent.trim() : null,
        title: (document.querySelector('#score-title')?.textContent || '').trim(),
        tempo: Number(document.querySelector('#tempo')?.value),
      };
    }).catch(() => null);
    if (info) console.log(`  t=${((Date.now() - t0) / 1000).toFixed(0)}s busy='${info.busy}' 曲名='${info.title}' 速度=${info.tempo}`);
    if (info && info.busy === '↑' && i > 0) break;
  }
  await browser.close();
})().catch(e => { console.error('异常:', e.message); process.exit(1); });
