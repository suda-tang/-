#!/usr/bin/env node
// 精准诊断：AI 请求到底卡在哪一步
//
// 背景（2026-10-11 音乐家多轮对话实测）：
//   轮1「打开《知足》」18.3s 后报「请求等待超时或连接被中止…请检查外网隧道连接」；
//   轮3 之后每轮都回「已停止这次请求，界面没有变化」—— 即 busy 卡死，
//   AI 从此不可用，只能刷新页面。
//
// 本脚本回答三个问题：
//   ① 慢的是 /api/scores（722KB 曲库）还是 /api/workspace-ai（真打模型）？
//   ② readCloudLibrary 的 60s 缓存有没有命中？
//   ③ 失败后 busy 是否卡死（第二句话是否只能"停止"）？
//
// ★ 必须串行跑，别和其它浏览器脚本同时开。

const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = 'http://127.0.0.1:5173/';

(async () => {
  const browser = await chromium.launch({
    headless: true, channel: 'msedge',
    proxy: { server: 'http://127.0.0.1:7897', bypass: '<-loopback>' }
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });

  const reqs = [];
  page.on('request', r => {
    const u = r.url();
    if (/\/api\/(scores|workspace-ai|ai-tasks)/.test(u)) reqs.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), method: r.method(), t0: Date.now(), status: null, ms: null, failed: null });
  });
  page.on('response', r => {
    const u = r.url();
    if (/\/api\/(scores|workspace-ai|ai-tasks)/.test(u)) {
      const rec = [...reqs].reverse().find(x => x.url === u.replace(/^https?:\/\/[^/]+/, '') && x.ms == null);
      if (rec) { rec.status = r.status(); rec.ms = Date.now() - rec.t0; }
    }
  });
  page.on('requestfailed', r => {
    const u = r.url();
    if (/\/api\/(scores|workspace-ai|ai-tasks)/.test(u)) {
      const rec = [...reqs].reverse().find(x => x.url === u.replace(/^https?:\/\/[^/]+/, '') && x.ms == null);
      if (rec) { rec.failed = r.failure()?.errorText; rec.ms = Date.now() - rec.t0; }
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(4000);
  for (const t of ['跳过', '跳过选曲']) await page.click('button:has-text("' + t + '")', { timeout: 2000 }).catch(() => {});
  await sleep(1500);

  // ② 曲库缓存命中情况
  const cacheInfo = await page.evaluate(() => {
    const s = window.cloudLibrarySnapshot;
    const ls = (() => { try { return JSON.parse(localStorage.getItem('cloudLibrarySnapshot') || 'null'); } catch { return null; } })();
    return {
      memHas: !!(s && s.scores), memCount: s?.scores?.length || 0,
      memAgeSec: s ? Math.round((Date.now() - s.saved) / 1000) : null,
      lsHas: !!(ls && ls.scores), lsCount: ls?.scores?.length || 0,
    };
  });
  console.log('【曲库缓存】', JSON.stringify(cacheInfo));

  await page.click('#workspace-ai', { timeout: 8000 }).catch(() => {});
  await sleep(800);

  const lastReply = () => page.evaluate(() => {
    const items = [...document.querySelectorAll('dialog.ai-conversation .ai-messages > *')];
    for (let i = items.length - 1; i >= 0; i--) if (items[i].classList.contains('assistant')) return items[i].textContent.trim();
    return '';
  });

  // ① 第一条：需要曲库上下文的指令
  console.log('\n【第 1 句】打开《知足》');
  const mark = reqs.length;
  let t0 = Date.now();
  await page.fill('dialog.ai-conversation input', '打开《知足》').catch(() => {});
  await page.click('dialog.ai-conversation button[type=submit]').catch(async () => {
    await page.evaluate(() => document.querySelector('dialog.ai-conversation form')?.requestSubmit());
  });
  let prev = '', stable = 0, reply = '';
  while (Date.now() - t0 < 120000) {
    await sleep(1500);
    reply = await lastReply().catch(() => '');
    if (reply && reply === prev) { stable++; if (stable >= 2) break; } else stable = 0;
    prev = reply;
  }
  console.log('  用时 %.1fs 回复: %s', (Date.now() - t0) / 1000, reply.slice(0, 160).replace(/\n/g, ' '));
  console.log('  期间请求:');
  for (const r of reqs.slice(mark)) console.log('    ' + (r.method + ' ' + r.url).padEnd(46) + ' ' + String(r.status ?? r.failed ?? '-').padEnd(18) + (r.ms != null ? r.ms + 'ms' : ''));

  // ③ 第二条：看是否 busy 卡死（只能"停止"）
  console.log('\n【第 2 句】速度调到 92（检测 busy 是否卡死）');
  t0 = Date.now();
  const mark2 = reqs.length;
  await page.fill('dialog.ai-conversation input', '速度调到 92').catch(() => {});
  await page.click('dialog.ai-conversation button[type=submit]').catch(async () => {
    await page.evaluate(() => document.querySelector('dialog.ai-conversation form')?.requestSubmit());
  });
  prev = ''; stable = 0; reply = '';
  while (Date.now() - t0 < 90000) {
    await sleep(1500);
    reply = await lastReply().catch(() => '');
    if (reply && reply === prev) { stable++; if (stable >= 2) break; } else stable = 0;
    prev = reply;
  }
  console.log('  用时 %.1fs 回复: %s', (Date.now() - t0) / 1000, reply.slice(0, 160).replace(/\n/g, ' '));
  console.log('  ★ 若这里是「已停止这次请求」= busy 卡死，AI 必须刷新页面才能再用');
  for (const r of reqs.slice(mark2)) console.log('    ' + (r.method + ' ' + r.url).padEnd(46) + ' ' + String(r.status ?? r.failed ?? '-').padEnd(18) + (r.ms != null ? r.ms + 'ms' : ''));

  const tempo = await page.evaluate(() => Number(document.querySelector('#tempo')?.value));
  console.log('\n当前速度 #tempo =', tempo);
  await browser.close();
})().catch(e => { console.error('诊断异常:', e.message); process.exit(1); });
