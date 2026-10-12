// 浏览器验证：AI 面板**不再显示任何计时提示**，且全程有「正在做什么」的进展。
// 真实浏览器 + 真实模型，逐秒采样状态行文案。
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ORIGIN = process.env.PIANO_ORIGIN || 'http://192.168.2.6:5173';
const TIME_PATTERNS = [/⏱/, /本次\s*[\d.]+\s*秒/, /已等待\s*\d+\s*秒/, /此阶段已等待/, /其中\s*AI\s*[\d.]+/, /已收到\s*\d+\s*个字符/];

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true,proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });
    const score = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      return (d.scores || []).filter(x => x.ready)[0] || null;
    });
    assert.ok(score, '曲库里没有 ready 的曲谱');
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), score.id);
    await page.waitForTimeout(3500);

    await page.locator('#workspace-ai').click();
    await page.waitForTimeout(900);

    // 边问边采样状态行
    const samples = [];
    const sampler = setInterval(async () => {
      try {
        const texts = await page.evaluate(() => [...document.querySelectorAll('.ai-operation-detail')]
          .map(el => el.textContent.trim()).filter(Boolean));
        if (texts.length) samples.push(...texts);
      } catch {}
    }, 300);

    const t0 = Date.now();
    await page.locator('.ai-conversation input').fill('请分析这首曲子的和声走向，并检查一下识谱有没有问题');
    await page.locator('.ai-conversation input').press('Enter');
    await page.waitForFunction(() => !document.querySelector('.ai-conversation')?.classList.contains('is-thinking'), null, { timeout: 180000 });
    await page.waitForTimeout(2500);
    clearInterval(sampler);
    const tookMs = Date.now() - t0;
    await page.evaluate(ms => { window.__slow = ms > 8000; }, tookMs);

    // 采样去重
    const uniq = [...new Set(samples)];
    console.log('\n=== 状态行出现过的措辞（' + uniq.length + ' 种）===');
    uniq.forEach(t => console.log('  ·', t));

    // 1) 全部采样不得含任何计时/计数
    for (const t of samples) {
      for (const p of TIME_PATTERNS) {
        assert.ok(!p.test(t), `状态行仍出现计时提示「${t}」`);
      }
    }
    console.log('\n✓ 采样 ' + samples.length + ' 条状态，零计时/计数提示');

    // 2) 状态必须真的在推进。
    //    注意别把「回得快」误判成缺陷：规则通道命中时整句 2~3 秒就回完，
    //    状态行只来得及显示 1~2 句，这是正常的。所以按实际耗时分级要求：
    //    走模型（>8 秒）必须轮换过 3 种以上；走规则只要有状态行即可。
    const elapsed = await page.evaluate(() => performance.now());
    const slow = await page.evaluate(() => window.__slow === true);
    assert.ok(uniq.length >= 2, `状态文案只有 ${uniq.length} 种（${JSON.stringify(uniq)}），用户会以为卡死`);
    if (slow) assert.ok(uniq.length >= 3, `走了模型通道（>8 秒）却只有 ${uniq.length} 种措辞，用户会觉得卡死`);

    // 3) 全对话区不得出现计时徽标
    const whole = await page.evaluate(() => [...document.querySelectorAll('.ai-conversation *')]
      .map(el => (el.className || '') + '|' + (el.textContent || '')).join('\n'));
    for (const p of TIME_PATTERNS) {
      assert.ok(!p.test(whole), `对话区仍存在计时元素（匹配 ${p}）`);
    }
    assert.ok(!await page.evaluate(() => !!document.querySelector('.ai-latency')), '仍存在 .ai-latency 计时徽标');
    console.log('✓ 整个对话区无计时徽标、无比表');

    // 4) 必须真的答了内容（不是只剩进度）
    const answer = await page.evaluate(() => [...document.querySelectorAll('.ai-messages .assistant')]
      .map(el => el.textContent.trim()).filter(Boolean).join('\n'));
    // 不校验回答的音乐内容（那是压测的事）；这里只要求「确实答了、且不是错误提示」。
    // 曲库里第一首 ready 曲目可能是没有逐音符数据的导入曲，AI 如实说「没识别出成型和弦」
    // 是正确行为，不该让这个纯 UI 检查变红。
    assert.ok(answer.length > 8, '没有拿到任何回答');
    assert.ok(!/操作未完成|暂时没有响应|请求等待超时/.test(answer), '回答是错误提示：' + answer.slice(0, 100));

    assert.deepEqual(errors, [], '页面出现脚本错误：' + errors.join(' | '));
    console.log('\nPASS AI 面板无计时提示 + 全程有进展说明（回答 ' + answer.length + ' 字）');
  } finally { await browser.close(); }
})().catch(error => { console.error('FAIL', error.message); process.exitCode = 1; });