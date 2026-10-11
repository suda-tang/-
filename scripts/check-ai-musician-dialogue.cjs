#!/usr/bin/env node
// 音乐家视角的 AI 连续多轮对话 + 日常 AI 操作 真实浏览器测试
//
// 和 check-ai-longflow 的区别：longflow 是 60 条**互相独立**的长流程用例；
// 这一份专测**同一个会话里的连续追问** —— 代词指代（"它"/"刚才那首"）、
// 增量指令（"再快一点"）、话题切换后再回来、以及日常 AI 操作（联网找谱），
// 并且每轮都断言**动作是否真的在界面上生效**（历史 48 条失败全集中在这里）。
//
// 用法：
//   node scripts/check-ai-musician-dialogue.cjs
//   node scripts/check-ai-musician-dialogue.cjs --out x.jsonl
//
// ★ 必须串行跑（后端单页面串行处理，并发会互相排队超时）。

const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const URL = 'http://127.0.0.1:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const outArg = process.argv.indexOf('--out');
const OUT = path.join(ROOT, 'scripts',
  outArg >= 0 ? process.argv[outArg + 1]
    : '_musician-dialogue-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.jsonl');

// 一个音乐家从打开谱子到练琴、问乐理、找新谱的真实一天（连续 9 轮，同一会话）
const SCRIPT = [
  { say: '打开《知足》', kind: 'control', note: '打开曲谱（★《知足》在库里有重名，看是否命中正确）', expect: { titleIncludes: '知足' } },
  { say: '它的速度是多少？', kind: 'context', note: '★上下文：代词"它"指上一轮的《知足》' },
  { say: '再快一点，调到 92，然后播放', kind: 'incremental', note: '★增量指令：改速度 + 播放', expect: { tempo: 92, playing: true } },
  { say: '把钢琴静音，我只想听弦乐', kind: 'control', note: '混音控制', expect: { mutedNonEmpty: true } },
  { say: '刚才那首在第几小节转调了？', kind: 'context-long', note: '★跨 4 轮长程上下文追问曲子本身' },
  { say: '什么是属七和弦？简单说一下', kind: 'knowledge', note: '★话题切换：乐理问答（无关当前曲子）' },
  { say: '回到刚才的曲子，帮我标出练琴重点', kind: 'context-back', note: '★切回：从乐理回到刚才那首曲子' },
  { say: '联网帮我找一下《卡农》的钢琴谱', kind: 'web', note: '★日常 AI 操作：联网找谱' },
  { say: '停止播放', kind: 'control', note: '收尾控制', expect: { playing: false } },
];

// ── 读界面状态（与 check-ai-longflow 同款：一次 evaluate 拿全，避免状态漂移）──
async function readState(page) {
  return page.evaluate(() => {
    const live = new Promise(resolve => document.dispatchEvent(
      new CustomEvent('ai-workspace-context', { detail: { resolve } })));
    const fallback = new Promise(r => setTimeout(() => r(null), 3000));
    return Promise.race([live, fallback]).then(l => ({
      title: (document.querySelector('#score-title')?.textContent || '').trim(),
      currentId: l?.currentId || null,
      playing: !!l?.playing,
      measure: l?.measure ?? null,
      measureCount: l?.measureCount ?? null,
      view: l?.view || '',
      solo: l?.solo || '',
      muted: Array.isArray(l?.disabledParts) ? l.disabledParts : [],
      panel: document.body.dataset.workspace || '',
      tempo: Number(document.querySelector('#tempo')?.value),
      metronome: !!document.querySelector('#metronome')?.checked,
      msgs: document.querySelectorAll('dialog.ai-conversation .ai-messages > *').length,
    }));
  }).catch(() => ({}));
}

function checkExpect(expect, after) {
  const fails = [];
  if (!expect) return fails;
  if (expect.titleIncludes && !(after.title || '').includes(expect.titleIncludes)) {
    fails.push(`曲名应含「${expect.titleIncludes}」，实际「${after.title || '(空)'}」`);
  }
  if (expect.tempo != null && after.tempo !== expect.tempo) {
    fails.push(`速度应为 ${expect.tempo}，实际 ${after.tempo}`);
  }
  if (expect.playing != null && after.playing !== expect.playing) {
    fails.push(`playing 应为 ${expect.playing}，实际 ${after.playing}`);
  }
  if (expect.mutedNonEmpty && !(after.muted || []).length) {
    fails.push(`应有声部被静音，实际 muted=[]`);
  }
  return fails;
}

(async () => {
  const browser = await chromium.launch({
    headless: true, channel: 'msedge',
    proxy: { server: 'http://127.0.0.1:7897', bypass: '<-loopback>' }
  });
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();

  const pageErrors = [], badApi = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('response', r => {
    const u = r.url();
    if (/\/api\/(workspace-ai|ai-tasks|workspace-ai\/web)/.test(u) && r.status() >= 400) {
      badApi.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), status: r.status() });
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(3000);
  for (const t of ['跳过', '跳过选曲']) await page.click('button:has-text("' + t + '")', { timeout: 2000 }).catch(() => {});
  await sleep(1200);

  // 打开 AI 对话框
  await page.click('#workspace-ai', { timeout: 8000 }).catch(() => {});
  await sleep(800);
  const opened = await page.evaluate(() => {
    const d = document.querySelector('dialog.ai-conversation');
    if (d && !d.open) { try { d.showModal(); } catch {} }
    return !!(d && d.open);
  });
  console.log('AI 对话框已打开:', opened);
  if (!opened) { console.log('FAIL 打不开 AI 对话框'); await browser.close(); process.exit(1); }

  const lastReply = () => page.evaluate(() => {
    const items = [...document.querySelectorAll('dialog.ai-conversation .ai-messages > *')];
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].classList.contains('assistant')) return items[i].textContent.trim();
    }
    return '';
  });

  const results = [];
  for (let i = 0; i < SCRIPT.length; i++) {
    const turn = SCRIPT[i];
    const errBefore = pageErrors.length;
    const before = await readState(page);
    const beforeCount = before.msgs || 0;
    const t0 = Date.now();

    await page.fill('dialog.ai-conversation input', turn.say, { timeout: 10000 }).catch(async () => {
      await page.evaluate(t => { const d = document.querySelector('dialog.ai-conversation'); if (d) d.querySelector('input').value = t; }, turn.say);
    });
    await page.click('dialog.ai-conversation button[type=submit]', { timeout: 8000 }).catch(async () => {
      await page.evaluate(() => document.querySelector('dialog.ai-conversation form')?.requestSubmit());
    });

    // 等回复稳定：文本连续 2 次不变且消息数已增长
    let prev = '', stable = 0, reply = '';
    const deadline = Date.now() + 160000;
    while (Date.now() < deadline) {
      await sleep(1500);
      reply = await lastReply().catch(() => '');
      const grew = await page.evaluate(c => document.querySelectorAll('dialog.ai-conversation .ai-messages > *').length > c, beforeCount).catch(() => false);
      if (reply && reply === prev) { stable++; if (stable >= 2 && grew) break; }
      else stable = 0;
      prev = reply;
    }
    const ms = Date.now() - t0;
    await sleep(600); // 让动作落地
    const after = await readState(page);

    const why = [];
    if (!reply) why.push('没有回复');
    else if (reply.length < 2) why.push('回复过短');
    // ★ AI 没真正干活时会回这几种固定话术，不能算"有回复就算过"
    if (/已停止这次请求|界面没有变化/.test(reply)) why.push('AI 处于卡死状态：本次发送只起到"停止上一次请求"的作用');
    if (/请求等待超时|连接被中止|外网隧道/.test(reply)) why.push('请求被中止/超时（文案误报成外网隧道问题）');
    why.push(...checkExpect(turn.expect, after));
    if (pageErrors.length > errBefore) why.push('新 JS 报错: ' + pageErrors.slice(errBefore).join(' | ').slice(0, 160));

    const rec = {
      turn: i + 1, kind: turn.kind, say: turn.say, note: turn.note,
      ms, ok: why.length === 0, why,
      reply: reply.slice(0, 500), replyLen: reply.length,
      before: { title: before.title, tempo: before.tempo, playing: before.playing, view: before.view, muted: before.muted },
      after: { title: after.title, tempo: after.tempo, playing: after.playing, view: after.view, muted: after.muted },
    };
    results.push(rec);
    fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
    console.log(`轮${rec.turn} [${rec.kind}] ${(rec.ms / 1000).toFixed(1)}s ${rec.ok ? 'OK' : 'FAIL'} ${rec.say}`);
    if (!rec.ok) console.log('    ✗ ' + rec.why.join(' / '));
    console.log('    回复: ' + rec.reply.slice(0, 150).replace(/\n/g, ' '));
    console.log('    状态: ' + JSON.stringify(rec.after));
  }

  await browser.close();

  console.log('\n' + '─'.repeat(78));
  const failed = results.filter(r => !r.ok);
  console.log(`连续对话 ${results.length} 轮，失败 ${failed.length} 轮`);
  for (const r of failed) console.log(`  轮${r.turn} ${r.say}  →  ${r.why.join(' / ')}`);
  if (pageErrors.length) console.log('JS 报错 ' + pageErrors.length + ' 条:\n  ' + pageErrors.slice(0, 5).join('\n  '));
  if (badApi.length) console.log('AI 接口 4xx/5xx ' + badApi.length + ' 条:\n  ' + JSON.stringify(badApi.slice(0, 8)));
  console.log('明细:', OUT);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('探针异常:', e.message, e.stack); process.exit(2); });
