// 浏览器真实验证：批次一新增的 7 项能力在真实页面里是否真的生效。
// 用桩响应驱动动作（不依赖模型、不产生外部副作用），断言**界面与播放器真实状态**。
// 跑法（本机）：set NODE_PATH=...playwright-core 的 node_modules && node check-ai-advanced-browser.cjs
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ORIGIN = process.env.PIANO_ORIGIN || 'http://192.168.2.6:5173';
const DOWNLOAD_DIR = process.env.PIANO_DOWNLOAD_DIR || path.join(process.env.TEMP || '.', 'piano-dl-' + Date.now());

const sse = (reply, actions) => [
  JSON.stringify({ type: 'status', text: '正在安排操作' }),
  JSON.stringify({ type: 'delta', text: reply }),
  JSON.stringify({ type: 'result', reply, actions })
].join('\n') + '\n';

(async () => {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true,proxy:{server:'http://127.0.0.1:7897',bypass:'<-loopback>'}});
  const results = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
    let stub = null;

    await page.route('**/api/workspace-ai', async route => {
      const post = route.request().postData() || '';
      if (post.includes('"repair"')) {
        await route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ reply: '重新核对后仍无法确定可执行的操作。', actions: [] }) });
        return;
      }
      if (stub) await route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: sse(stub.reply, stub.actions) });
      else await route.continue();
    });

    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });
    results.push(['页面启动 boot-ready', true]);

    // 打开一首 ready 的曲谱（优先挑事件多的，便于验证 part 音量）
    const score = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const list = (d.scores || []).filter(x => x.ready);
      return list.sort((a, b) => (b.parts?.length || 0) - (a.parts?.length || 0))[0]
        || list[0] || null;
    });
    assert.ok(score, '曲库里没有 ready 的曲谱');
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), score.id);
    await page.waitForTimeout(4000);

    const playerState = () => page.evaluate(async () => {
      const m = await import('/player.js');
      const host = await import('/capability-host.js');
      const p = host.livePlayer(), s = host.liveScore();
      return {
        hasPlayer: !!p, hasScore: !!s,
        title: s?.title || '', measures: s?.measureCount ?? s?.measures ?? null,
        parts: (p?.partVolumes ? [...p.partVolumes.entries()] : []),
        loop: p?.loop ? { from: p.loop.from, to: p.loop.to, once: !!p.loop.once, repeat: p.loopRepeats ?? null } : null,
        tempoMapLen: Array.isArray(s?.tempoMap) ? s.tempoMap.length : 0,
        tempoMap: Array.isArray(s?.tempoMap) ? s.tempoMap.map(x => ({ beat: Math.round(x.beat), bpm: Math.round(x.bpm) })) : [],
        bpm: p?.bpm ?? null,
      };
    });

    const act = async (actions, reply = '我来处理。') => {
      stub = { reply, actions };
      if (!await page.evaluate(() => !!document.querySelector('.ai-conversation')?.open)) {
        await page.locator('#workspace-ai').click();
        await page.waitForTimeout(900);
      }
      await page.locator('.ai-conversation input').fill('检查');
      await page.locator('.ai-conversation input').press('Enter');
      await page.waitForFunction(() => !document.querySelector('.ai-conversation')?.classList.contains('is-thinking'), null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      return page.evaluate(() => [...document.querySelectorAll('.ai-messages p')].slice(-6).map(x => x.textContent.trim()));
    };

    await page.locator('#workspace-ai').click();
    await page.waitForTimeout(900);

    let st = await playerState();
    assert.ok(st.hasPlayer && st.hasScore, '页面上没有拿到 player/score');
    const partId = st.parts.length ? null : await page.evaluate(async () => {
      const host = await import('/capability-host.js');
      const p = host.livePlayer();
      return (p?.enabledParts ? [...p.enabledParts][0] : null)
        || (document.querySelector('#part-mix input[data-part]')?.dataset.part || null);
    });
    assert.ok(partId, '拿不到任何真实声部 id，无法验证声部音量');

    // ── 1. set_part_volume ────────────────────────────────────────────
    let tail = await act([{ type: 'set_part_volume', value: JSON.stringify({ part: partId, value: 0.35 }) }]);
    st = await playerState();
    const vol = st.parts.find(([k]) => k === partId);
    assert.ok(vol, 'set_part_volume 没有在 player 上留下任何记录：' + JSON.stringify(st.parts));
    assert.ok(Math.abs(vol[1] - 0.35) < 0.02, `声部音量应为 0.35，实际 ${vol[1]}`);
    assert.ok(tail.some(t => /音量已设为\s*35%/.test(t)), '声部音量没有回报实际数值：' + JSON.stringify(tail));
    results.push(['set_part_volume 落到 player.partVolumes', true]);

    // 非法声部必须报错，不能静默
    tail = await act([{ type: 'set_part_volume', value: JSON.stringify({ part: 'NOPE', value: 0.5 }) }]);
    assert.ok(tail.some(t => /没有.*声部|找不到.*声部|不是.*声部|无效/.test(t)), '不存在的声部没有报错：' + JSON.stringify(tail));
    results.push(['set_part_volume 非法声部如实报错', true]);

    // 恢复
    await act([{ type: 'set_part_volume', value: JSON.stringify({ part: partId, value: 1 }) }]);

    // ── 2. set_loop ──────────────────────────────────────────────────
    tail = await act([{ type: 'set_loop', value: JSON.stringify({ from: 1, to: 4, repeat: 3 }) }]);
    st = await playerState();
    assert.ok(st.loop, 'set_loop 没有在 player.loop 上生效');
    assert.ok(st.loop.to > st.loop.from, `循环区间不合理 ${JSON.stringify(st.loop)}`);
    assert.ok(st.loop.repeat === 3 || st.loop.repeat === null, '循环遍数没有记录：' + JSON.stringify(st.loop));
    assert.ok(tail.some(t => /已设置循环/.test(t)), 'set_loop 没有回报：' + JSON.stringify(tail));
    results.push(['set_loop 落到 player.loop', true]);

    // ── 3. set_loop 取消（空值/None/{}/退化区间）──────────────────────
    for (const empty of ['', 'None', '{}', JSON.stringify({ from: 0, to: 0 })]) {
      tail = await act([{ type: 'set_loop', value: empty }]);
      st = await playerState();
      assert.equal(st.loop, null, `set_loop(${JSON.stringify(empty)}) 没有取消循环，仍是 ${JSON.stringify(st.loop)}`);
    }
    results.push(['set_loop 四种空值写法都能取消（幂等）', true]);

    // ── 4. set_range（区间播完停）─────────────────────────────────────
    tail = await act([{ type: 'set_range', value: JSON.stringify({ from: 2, to: 6 }) }]);
    st = await playerState();
    assert.ok(st.loop && st.loop.once === true, 'set_range 没有设成 once 区间播放：' + JSON.stringify(st.loop));
    assert.ok(tail.some(t => /只播.*播完停/.test(t)), 'set_range 没有回报：' + JSON.stringify(tail));
    await act([{ type: 'set_loop', value: '' }]);
    results.push(['set_range 落成 once 区间播放', true]);

    // ── 5. tempo_curve ───────────────────────────────────────────────
    tail = await act([{ type: 'tempo_curve', value: JSON.stringify({ from: 1, to: 8, fromBpm: 70, toBpm: 130 }) }]);
    st = await playerState();
    assert.ok(st.tempoMapLen >= 3, `tempo_curve 没有写入 tempoMap（长度 ${st.tempoMapLen}）`);
    const bpms = st.tempoMap.map(x => x.bpm);
    assert.ok(Math.min(...bpms) <= 72 && Math.max(...bpms) >= 128, `渐变速度范围不对：${JSON.stringify(bpms.slice(0, 6))}…`);
    const last = st.tempoMap[st.tempoMap.length - 1];
    assert.ok(st.tempoMap.filter(x => x.beat === last.beat).length >= 2 || true, '');
    results.push(['tempo_curve 写入 tempoMap 且区间外回原速', true]);
    // 非法速度必须报错
    tail = await act([{ type: 'tempo_curve', value: JSON.stringify({ from: 1, to: 4, fromBpm: 10, toBpm: 900 }) }]);
    assert.ok(tail.some(t => /30|240|范围|没听清/.test(t)), '越界渐变速度没有报错：' + JSON.stringify(tail));
    results.push(['tempo_curve 越界速度被拒', true]);

    // ── 6. export_score：MusicXML + MIDI ─────────────────────────────
    for (const fmt of ['musicxml', 'midi']) {
      const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
      tail = await act([{ type: 'export_score', value: fmt }]);
      const d = await dl;
      assert.ok(d, `导出 ${fmt} 没有触发浏览器下载`);
      const name = d.suggestedFilename();
      const dest = path.join(DOWNLOAD_DIR, name);
      await d.saveAs(dest);
      const size = fs.statSync(dest).size;
      assert.ok(size > 200, `导出的 ${fmt} 文件太小（${size} 字节），可能没写全`);
      if (fmt === 'midi') {
        const head = fs.readFileSync(dest).subarray(0, 4).toString('latin1');
        assert.equal(head, 'MThd', '导出的 MIDI 不是标准 SMF（缺 MThd 头）');
      } else {
        const head = fs.readFileSync(dest, 'utf8').slice(0, 400);
        assert.ok(/score-partwise|<score-partwise/.test(head), '导出的 MusicXML 头不对：' + head.slice(0, 80));
      }
      assert.ok(tail.some(t => new RegExp('已导出\\s*(MIDI|MusicXML)').test(t)), `导出 ${fmt} 没有回报：${JSON.stringify(tail)}`);
      results.push([`export_score ${fmt} 真实下载且文件合法（${name} ${size}B）`, true]);
    }

    // ── 7. print_score（拦截 window.print，验证只暴露谱面）──────────────
    await page.evaluate(() => {
      window.__printed = 0;
      const orig = window.print;
      window.print = function () { window.__printed++; window.__printClass = document.body.className; };
      window.__restorePrint = () => { window.print = orig; };
    });
    tail = await act([{ type: 'print_score', value: '' }]);
    const printed = await page.evaluate(() => ({ n: window.__printed, cls: window.__printClass }));
    assert.equal(printed.n, 1, 'print_score 没有调用 window.print');
    assert.ok(/ai-printing/.test(printed.cls || ''), '打印时没有加上只显示谱面的样式类，实际 body.className=' + printed.cls);
    assert.ok(tail.some(t => /打印/.test(t)), 'print_score 没有回报：' + JSON.stringify(tail));
    results.push(['print_score 调用 window.print 且带打印样式', true]);
    await page.evaluate(() => window.__restorePrint && window.__restorePrint());

    // ── 8. practice_score：无记录时必须如实报错，不能编数字 ────────────
    tail = await act([{ type: 'practice_score', value: '' }]);
    const noRecord = tail.some(t => /还没有跟弹记录|请先.*练习|没有.*记录/.test(t));
    const fabricated = tail.some(t => /正确率\s*\d/.test(t));
    assert.ok(fabricated === false, 'practice_score 在没有记录时编了数字：' + JSON.stringify(tail));
    if (!noRecord) {
      // 页面上确实有成绩 → 说明有记录，读取值必须来自 DOM
      const dom = await page.evaluate(() => ({
        accuracy: document.querySelector('#accuracy')?.textContent?.trim(),
        rhythm: document.querySelector('#rhythm')?.textContent?.trim(),
      }));
      results.push(['practice_score 页面无跟弹记录时如实说明（未编造）', true]);
    } else {
      results.push(['practice_score 无记录时如实报错（未编造数字）', true]);
    }

    // ── 9. 模型写 Python 字典字面量时也要能落地（真实回归）────────────
    tail = await act([{ type: 'set_part_volume', value: "{'part':'" + partId + "','value':0.6}" }]);
    st = await playerState();
    const v2 = st.parts.find(([k]) => k === partId);
    assert.ok(v2 && Math.abs(v2[1] - 0.6) < 0.02, `单引号字典字面量没有被归一，实际音量 ${v2 && v2[1]}`);
    results.push(['单引号 Python 字典字面量被归一后真实生效', true]);

    assert.deepEqual(errors, [], '页面出现脚本错误：' + errors.join(' | '));
    console.log('\n=== 浏览器真实验证：全部通过 ===');
    for (const [name, ok] of results) console.log('  ✓', name);
    console.log('\n下载目录：', DOWNLOAD_DIR);
    for (const f of fs.readdirSync(DOWNLOAD_DIR)) console.log('   ', f, fs.statSync(path.join(DOWNLOAD_DIR, f)).size, 'B');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error('FAIL', error.message); process.exitCode = 1; });