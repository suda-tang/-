// 排版性能与结构回归：把这次优化测出来的关键不变量固化成测试，防止以后再退化。
//
// 用法（本机）：
//   set PIANO_PLAYWRIGHT_MODULE=<playwright 的 node_modules 绝对路径>
//   node tests/browser/check-engraving-performance.cjs
//
// 断言分两类：
//   ① 结构不变量（稳健，不会因机器负载抖动而误报）—— 分块数、只渲染首块、
//      占位高度与真实高度吻合、音符注解齐全；
//   ② 宽松的耗时上限（只用来抓「灾难性退化」，不做精确基准）——
//      打开耗时与最长长任务。具体数字会打印出来供人工对比趋势。
const { chromium } = require(process.env.PIANO_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

const OPEN_LIMIT_MS = Number(process.env.PIANO_OPEN_LIMIT_MS || 60000);
const LONG_TASK_LIMIT_MS = Number(process.env.PIANO_LONG_LIMIT_MS || 12000);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });

    const target = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const s = d.scores.find(x => x.title.startsWith('Rienzi')) || d.scores.find(x => x.ready);
      return { id: s.id, title: s.title, measures: s.measures || null };
    });

    await page.evaluate(() => {
      window.__long = [];
      try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch { }
    });
    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    const openMs = Date.now() - t0;

    const info = await page.evaluate(() => {
      const chunks = [...document.querySelectorAll('#notation .notation-chunk')];
      const rendered = chunks.filter(c => c.querySelector('svg'));
      const placeholders = chunks.filter(c => c.dataset.lazyMeasure);
      const notes = [...document.querySelectorAll('#notation .note-event')];
      return {
        chunks: chunks.length,
        rendered: rendered.length,
        placeholders: placeholders.length,
        renderedHeight: rendered[0] ? Math.round(rendered[0].getBoundingClientRect().height) : 0,
        placeholderHeight: placeholders[0] ? parseInt(placeholders[0].style.minHeight) || 0 : 0,
        notes: notes.length,
        notesWithIndex: notes.filter(n => n.dataset.index !== undefined && n.dataset.index !== '').length,
        labels: document.querySelectorAll('#notation .staff-instrument-label').length,
        longTasks: window.__long || [],
      };
    });

    const longMax = Math.max(0, ...info.longTasks);
    console.log(`曲目: ${target.title}`);
    console.log(`  打开耗时 ${(openMs / 1000).toFixed(1)}s（上限 ${(OPEN_LIMIT_MS / 1000).toFixed(0)}s）`);
    console.log(`  最长长任务 ${longMax} ms（上限 ${LONG_TASK_LIMIT_MS} ms）`);
    console.log(`  分块 ${info.chunks}（已渲染 ${info.rendered}，占位 ${info.placeholders}）`);
    console.log(`  首块高度 ${info.renderedHeight}px ／ 占位 ${info.placeholderHeight}px`);
    console.log(`  音符注解 ${info.notesWithIndex}/${info.notes}，乐器名 ${info.labels}`);

    // ① 结构不变量
    assert.ok(info.chunks > 1, '大谱应当分块');
    assert.equal(info.rendered, 1, '只应渲染首块（其余交给滚动惰性渲染）');
    assert.equal(info.rendered + info.placeholders, info.chunks, '其余分块应当都是占位');
    assert.ok(info.renderedHeight > 0, '首块应已渲染出内容');
    assert.ok(Math.abs(info.placeholderHeight - info.renderedHeight) / info.renderedHeight < 0.25,
      `占位高度应与真实高度接近，实际 ${info.placeholderHeight} vs ${info.renderedHeight}（差太多会导致滚动跳动）`);
    assert.ok(info.notes > 0 && info.notesWithIndex === info.notes, '音符应全部带 data-index（点击跳转依赖它）');
    assert.ok(info.labels > 0, '应渲染出乐器名标注');
    // ② 宽松的耗时上限
    assert.ok(openMs < OPEN_LIMIT_MS, `打开耗时 ${openMs}ms 超过上限 ${OPEN_LIMIT_MS}ms（疑似性能退化）`);
    assert.ok(longMax < LONG_TASK_LIMIT_MS, `最长长任务 ${longMax}ms 超过上限 ${LONG_TASK_LIMIT_MS}ms（界面会卡住）`);
    assert.deepEqual(errors, [], '页面出现脚本错误：' + errors.join(' | '));

    console.log('\nPASS 排版结构不变量与耗时上限均满足');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
