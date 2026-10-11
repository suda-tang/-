#!/usr/bin/env node
// 验证：POST /api/workspace-ai 到底有没有发出？是服务端不返回，还是前端主线程被阻塞？
//
// 上一版诊断只监听 response（看不到"已发出但没响应"的请求），所以显示"0 次调用"。
// 这一版同时监听 request / response / requestfailed，并每 1s 探一次主线程响应延迟
// （evaluate 往返时间变大 = 主线程被同步重活阻塞）。
//
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

  const sent = [], got = [], failed = [];
  page.on('request', r => { if (r.url().includes('/api/workspace-ai') && r.method() === 'POST') sent.push({ t: Date.now(), size: (r.postData() || '').length }); });
  page.on('response', r => { if (r.url().includes('/api/workspace-ai')) got.push({ t: Date.now(), status: r.status() }); });
  page.on('requestfailed', r => { if (r.url().includes('/api/workspace-ai')) failed.push({ t: Date.now(), err: r.failure()?.errorText }); });

  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForSelector('.library-score', { timeout: 90000 }).catch(() => {});
  await sleep(2000);
  for (const t of ['跳过', '跳过选曲']) await page.click('button:has-text("' + t + '")', { timeout: 2000 }).catch(() => {});
  await sleep(1000);
  await page.click('#workspace-ai', { timeout: 8000 }).catch(() => {});
  await sleep(800);

  const libSize = await page.evaluate(() => window.cloudLibrarySnapshot?.scores?.length || 0);
  console.log('曲库首数:', libSize);

  const t0 = Date.now();
  await page.fill('dialog.ai-conversation input', '打开《知足》').catch(() => {});
  await page.click('dialog.ai-conversation button[type=submit]').catch(async () => {
    await page.evaluate(() => document.querySelector('dialog.ai-conversation form')?.requestSubmit());
  });
  console.log('已点击发送 t=0');

  // 每 1s 探一次主线程：evaluate 往返延迟 + busy 标志
  let lastBusy = null;
  for (let i = 1; i <= 60; i++) {
    const s = Date.now();
    const info = await page.evaluate(() => {
      const b = document.querySelector('dialog.ai-conversation button[type=submit]');
      return { busy: b ? b.textContent.trim() : null, now: Date.now() };
    }).catch(() => null);
    const rtt = Date.now() - s;
    if (info && info.busy !== lastBusy) { console.log(`  t=${((Date.now() - t0) / 1000).toFixed(1)}s busy='${info.busy}'`); lastBusy = info.busy; }
    if (rtt > 800) console.log(`  ⚠ t=${((Date.now() - t0) / 1000).toFixed(1)}s 主线程卡顿：evaluate 往返 ${rtt}ms`);
    if (info && info.busy === '↑' && i > 3) { console.log(`  busy 已在 ${((Date.now() - t0) / 1000).toFixed(1)}s 复位`); break; }
    await sleep(1000);
  }

  console.log('\n=== 请求观测 ===');
  console.log('POST 发出:', sent.length, sent.map(s => ({ at: ((s.t - t0) / 1000).toFixed(1) + 's', bodyKB: Math.round(s.size / 1024) })));
  console.log('响应到达:', got.length, got.map(g => ({ at: ((g.t - t0) / 1000).toFixed(1) + 's', status: g.status })));
  console.log('请求失败:', failed.length, failed.map(f => ({ at: ((f.t - t0) / 1000).toFixed(1) + 's', err: f.err })));

  if (sent.length && !got.length) console.log('\n★ 结论：请求已发出但服务端一直没有响应 → 前端 await 挂起（用户看到卡死）');
  else if (!sent.length) console.log('\n★ 结论：请求压根没发 → 卡在 workspaceContext 构造阶段');
  else console.log('\n★ 结论：请求发出且有响应，响应耗时见上');
  await browser.close();
})().catch(e => { console.error('异常:', e.message); process.exit(1); });
