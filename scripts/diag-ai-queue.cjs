#!/usr/bin/env node
// 验证修复①：在上一轮还在执行（busy）时发下一句，是"排队"还是被当成"停止"？
//   修复前：回「已停止这次请求，界面没有变化」→ 用户的话被吞掉
//   修复后：应出现「上一条还在处理，这句先排队，马上就轮到。」
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
  const feed = () => page.evaluate(() =>
    [...document.querySelectorAll('dialog.ai-conversation .ai-messages > *')].map(e => e.textContent.trim()).join('\n'));

  // 第 1 句：启动一个耗时动作
  await page.fill('dialog.ai-conversation input', '打开《知足》').catch(() => {});
  await page.click('dialog.ai-conversation button[type=submit]').catch(async () => {
    await page.evaluate(() => document.querySelector('dialog.ai-conversation form')?.requestSubmit());
  });
  // 等到 busy 确实为真（说明动作在执行中）
  let sawBusy = false;
  for (let i = 0; i < 20; i++) { await sleep(500); if ((await busy()) === '■') { sawBusy = true; break; } }
  console.log('第1句已进入执行中(busy=■):', sawBusy);

  // 第 2 句：故意在 busy 期间发送
  await page.fill('dialog.ai-conversation input', '速度调到 92').catch(() => {});
  await page.click('dialog.ai-conversation button[type=submit]').catch(async () => {
    await page.evaluate(() => document.querySelector('dialog.ai-conversation form')?.requestSubmit());
  });
  await sleep(3000);
  const mid = await feed();
  const queued = /先排队/.test(mid);
  const stopped = /已停止这次请求/.test(mid);
  console.log('\n── busy 期间发第 2 句的结果 ──');
  console.log('出现「先排队」提示 :', queued, queued ? '✅ 修复①生效（排队，不再被吞）' : '');
  console.log('出现「已停止」提示 :', stopped, stopped ? '❌ 仍被当成停止（修复未生效）' : '');

  // 等整体结束
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) { await sleep(2000); if ((await busy()) === '↑') break; }
  const finalFeed = await feed();
  console.log('\n最终对话尾部:');
  console.log(finalFeed.split('\n').slice(-6).map(s => '  ' + s.slice(0, 120)).join('\n'));
  await browser.close();
  process.exit(queued && !stopped ? 0 : 1);
})().catch(e => { console.error('异常:', e.message); process.exit(2); });
