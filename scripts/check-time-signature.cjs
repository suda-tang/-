// 验证 score.js 的拍号判定修复：不能取「第一个 <time>」。
// 直接在真实浏览器里解析两份 MusicXML：一份多拍号变奏（应取管辖小节最多的 4/4），
// 一份单拍号（应保持不变）。用页面里的 parseMusicXML，不做手工模拟。
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ORIGIN = process.env.PIANO_ORIGIN || 'http://192.168.2.6:5173';
const MULTI = '8ec8df6d0973fd0485ca38c5c328b7cd800ad7ab80bee45f32281953dcfebb6f';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  try {
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
    await page.goto(ORIGIN + '/dist/score.js', { waitUntil: 'load' }).catch(() => {});
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });

    // 1. 多拍号变奏：全曲应为 4/4（4/4 管辖 763 小节，1/4 只管辖 7 小节）
    //接口返回的是 {version, xml} 包装，要取 .xml 才是 MusicXML 本体
    const xml = await page.evaluate(async id => (await (await fetch('/api/scores/' + id)).json()).xml, MULTI);
    assert.ok(String(xml).startsWith('<?xml'), '没有取到 MusicXML 本体：' + String(xml).slice(0, 80));
    const r = await page.evaluate(async xml => {
      const m = await import('/score.js');
      const s = m.parseMusicXML(xml, '变奏测试');
      return { timeSignature: s.timeSignature, timeSignatures: s.timeSignatures, measures: s.measures, events: s.events.length };
    }, xml);
    assert.equal(r.measures, 110, '单声部小节数变了：' + r.measures);
    assert.equal(r.timeSignature, '4/4', '★ 回归：多拍号变奏仍被取成第一个 <time> → ' + r.timeSignature);
    // 每个 part 110 小节：#1 是 1/4，#2–#109 是 4/4（108 小节），#110 又回到 1/4
    assert.equal(r.timeSignatures?.['4/4'], 108, '4/4 管辖小节数不对：' + JSON.stringify(r.timeSignatures));
    assert.equal(r.timeSignatures?.['1/4'], 2, '1/4 管辖小节数不对：' + JSON.stringify(r.timeSignatures));
    console.log('✓ 多拍号变奏《央金梅朵》单 part 110 小节：timeSignature =', r.timeSignature, '| 逐小节分布', JSON.stringify(r.timeSignatures), '| 事件', r.events);

    // 2. 单拍号谱：应保持原样（不能被加权逻辑带偏）
    const single = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>6/8 单拍号</work-title></work>
<part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>2</divisions><time><beats>6</beats><beat-type>8</beat-type></time></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note></measure>
<measure number="2"><note><pitch><step>F</step><octave>4</octave></pitch><duration>6</duration><type>quarter</type></note></measure>
</part></score-partwise>`;
    const r2 = await page.evaluate(async xml => {
      const m = await import('/score.js');
      const s = m.parseMusicXML(xml, '单拍号');
      return { timeSignature: s.timeSignature, measures: s.measures };
    }, single);
    assert.equal(r2.timeSignature, '6/8', '单拍号谱被带偏了：' + r2.timeSignature);
    console.log('✓ 单拍号 6/8 谱保持不变：', r2.timeSignature);

    assert.deepEqual(errors, [], '页面出现脚本错误：' + errors.join(' | '));
    console.log('\nPASS 拍号判定修复验证');
  } finally { await browser.close(); }
})().catch(error => { console.error('FAIL', error.message); process.exitCode = 1; });