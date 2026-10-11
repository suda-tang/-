#!/usr/bin/env node
// 定位「打开曲谱」动作卡在哪个请求上。
// 已知：AI 请求本身 0.1~0.5s 就返回（后端正常），所以 >90s 的卡死发生在
//        runActions 执行 open 动作（下载谱面 / 渲染）的阶段。
// 本脚本：发一句「打开《知足》」，全程监听所有 /api 请求，列出已完成的和**一直挂着没回来的**。
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

  const pend = new Map();
  const done = [];
  page.on('request', r => {
    const u = r.url();
    if (/\/api\/|\/workspace-ai|\.js|\.mxl|\.musicxml|\.xml/.test(u)) pend.set(r, { u: u.replace(/^https?:\/\/[^/]+/, ''), m: r.method(), t0: Date.now() });
  });
  const finish = (r, tag, extra) => { const x = pend.get(r); if (x) { pend.delete(r); done.push({ ...x, ms: Date.now() - x.t0, tag, extra }); } };
  page.on('response', r => finish(r, 'ok', r.status()));
  page.on('requestfailed', r => finish(r, 'failed', r.failure()?.errorText));

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
  const title = () => page.evaluate(() => (document.querySelector('#score-title')?.textContent || '').trim());

  console.log('>>> 发送：打开《知足》');
  const t0 = Date.now();
  await page.fill('dialog.ai-conversation input', '打开《知足》').catch(() => {});
  await page.click('dialog.ai-conversation button[type=submit]').catch(async () => {
    await page.evaluate(() => document.querySelector('dialog.ai-conversation form')?.requestSubmit());
  });

  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    const b = await busy(), t = await title();
    const hanging = [...pend.values()].filter(x => Date.now() - x.t0 > 3000);
    console.log(`t=${((Date.now() - t0) / 1000).toFixed(0)}s busy='${b}' 曲名='${t}' 挂起请求=${hanging.length}`);
    for (const h of hanging) console.log(`    挂起 ${Math.round((Date.now() - h.t0) / 1000)}s: ${h.m} ${h.u.slice(0, 90)}`);
    if (b === '↑') { console.log(`busy 在 ${((Date.now() - t0) / 1000).toFixed(1)}s 复位`); break; }
  }

  console.log('\n=== 已完成请求（按耗时降序，前 12）===');
  for (const d of done.sort((a, b) => b.ms - a.ms).slice(0, 12)) {
    console.log(`  ${String(d.ms).padStart(6)}ms ${d.m.padEnd(5)} ${String(d.extra || d.tag).padEnd(8)} ${d.u.slice(0, 88)}`);
  }
  console.log('\n=== 最后仍挂起未完成 ===');
  for (const h of pend.values()) console.log(`  ${Math.round((Date.now() - h.t0) / 1000)}s ${h.m} ${h.u.slice(0, 88)}`);
  await browser.close();
})().catch(e => { console.error('异常:', e.message); process.exit(1); });
