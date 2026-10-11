// 端到端浏览器验证：**不打桩**，走真实模型 + 真实页面。
// 前提：钢琴服务端 5173 在跑、本机网络可达。跑法见 check-ai-advanced-browser.cjs 顶部。
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ORIGIN = process.env.PIANO_ORIGIN || 'http://192.168.2.6:5173';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const passed = [];
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
    await page.waitForTimeout(4000);

    const read = () => page.evaluate(async () => {
      const host = await import('/capability-host.js');
      const p = host.livePlayer(), s = host.liveScore();
      return {
        volumes: p?.partVolumes ? [...p.partVolumes.entries()] : [],
        loop: p?.loop ? { from: Math.round(p.loop.from), to: Math.round(p.loop.to), once: !!p.loop.once } : null,
        tempoMapLen: Array.isArray(s?.tempoMap) ? s.tempoMap.length : 0,
        tempo: document.querySelector('#tempo')?.value || '',
        measures: s?.measures ?? null,
        parts: (s?.parts || s?.midiParts || []).map(x => ({ value: x.value ?? x.id, name: x.name })),
      };
    });

    const say = async text => {
      if (!await page.evaluate(() => !!document.querySelector('.ai-conversation')?.open)) {
        await page.locator('#workspace-ai').click();
        await page.waitForTimeout(900);
      }
      await page.locator('.ai-conversation input').fill(text);
      await page.locator('.ai-conversation input').press('Enter');
      await page.waitForFunction(() => !document.querySelector('.ai-conversation')?.classList.contains('is-thinking'), null, { timeout: 180000 });
      await page.waitForTimeout(1800);
      return page.evaluate(() => [...document.querySelectorAll('.ai-messages p')].slice(-3).map(x => x.textContent.trim()).join(' / '));
    };

    const partName = (await read()).parts[1]?.name || '钢琴';
    const half = Math.floor((await read()).measures / 2);

    // 1. 真实对话 → 声部音量真的变了
    let tail = await say(`把${partName}声部的音量调到 40%`);
    let st = await read();
    assert.ok(st.volumes.length > 0, '真实对话后 player 上没有任何声部音量记录：' + tail);
    const v = st.volumes[0];
    assert.ok(Math.abs(v[1] - 0.4) < 0.06, `声部音量应≈0.40，实际 ${v[1]}（${JSON.stringify(st.volumes)}）`);
    passed.push([`真实对话「${partName}音量 40%」→ 播放器音量=${v[1]}`, true]);

    // 2. 真实对话 → 循环真的设上了
    tail = await say(`第 2 小节到第 ${Math.max(6, half)} 小节循环播放`);
    st = await read();
    assert.ok(st.loop && st.loop.to > st.loop.from, '真实对话后没有循环：' + tail + ' | ' + JSON.stringify(st.loop));
    passed.push([`真实对话「循环 2→${Math.max(6, half)}」→ player.loop=${JSON.stringify(st.loop)}`, true]);

    // 3. 真实对话 → 取消循环
    tail = await say('取消循环');
    st = await read();
    assert.equal(st.loop, null, '「取消循环」没有真的取消：' + JSON.stringify(st.loop));
    passed.push(['真实对话「取消循环」→ player.loop=null', true]);

    // 4. 真实对话 → 速度渐变真的写入 tempoMap
    tail = await say('第 1 小节到第 8 小节速度从 70 渐快到 130');
    st = await read();
    assert.ok(st.tempoMapLen >= 3, '速度渐变没有写入 tempoMap：' + tail);
    passed.push([`真实对话「渐变 70→130」→ tempoMap ${st.tempoMapLen} 个节点`, true]);

    // 5. 真实对话 → 移调必须如实拒答，且**界面速度没被动过**
    const before = await read();
    tail = await say('把整首曲子整体升高两个半音');
    const after = await read();
    assert.ok(/做不到|不支持|无法|不能|没有.*能力/.test(tail), '移调请求没有如实拒答：' + tail);
    assert.deepEqual(after.volumes, before.volumes, '移调请求不应改动声部音量');
    assert.equal(after.tempo, before.tempo, '移调请求不应改动速度');
    passed.push(['真实对话「整体移调」→ 如实拒答且无任何副作用', true]);

    assert.deepEqual(errors, [], '页面出现脚本错误：' + errors.join(' | '));
    console.log('\n=== 端到端（真实模型 + 真实浏览器）验证：全部通过 ===');
    for (const [name] of passed) console.log('  ✓', name);
  } finally { await browser.close(); }
})().catch(error => { console.error('FAIL', error.message); process.exitCode = 1; });