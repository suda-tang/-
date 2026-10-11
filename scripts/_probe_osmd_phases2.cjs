// 在真实路径上给 OSMD 的 load / render / 构造 打桩计时。
// 先打开内置示例谱逼 OSMD 加载完成，再打桩，然后打开 Rienzi 量真实耗时。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });

    // 1) 先把 OSMD 脚本加载起来（与 engraving.js 的 ensureOsmd 同路径），这样后面能给它打桩
    await page.evaluate(() => new Promise((res, rej) => {
      if (globalThis.opensheetmusicdisplay?.OpenSheetMusicDisplay) return res();
      const s = document.createElement('script');
      s.src = '/vendor/opensheetmusicdisplay.min.js';
      s.onload = () => res();
      s.onerror = () => rej(Error('OSMD 脚本加载失败'));
      document.head.append(s);
    }));
    console.log('OSMD 已加载');

    // 2) 给真实路径上的 OSMD 打桩
    const patched = await page.evaluate(() => {
      const ns = globalThis.opensheetmusicdisplay;
      const C = ns?.OpenSheetMusicDisplay;
      if (!C) return false;
      window.__osmd = { ctor: [], load: [], render: [] };
      const proto = C.prototype;
      const origLoad = proto.load, origRender = proto.render;
      proto.load = function (xml) {
        const t = performance.now();
        const p = origLoad.call(this, xml);
        return Promise.resolve(p).then(r => { window.__osmd.load.push({ ms: Math.round(performance.now() - t), kb: Math.round(String(xml || '').length / 1024) }); return r; });
      };
      proto.render = function (...a) {
        const t = performance.now();
        try { return origRender.apply(this, a); }
        finally { window.__osmd.render.push({ ms: Math.round(performance.now() - t) }); }
      };
      try {
        ns.OpenSheetMusicDisplay = class extends C {
          constructor(...a) { const t = performance.now(); super(...a); window.__osmd.ctor.push({ ms: Math.round(performance.now() - t) }); }
        };
      } catch { /* 命名空间属性可能只读，构造计时拿不到也不影响 load/render */ }
      return true;
    });
    console.log('打桩:', patched ? 'OK' : '失败（拿不到全局 OpenSheetMusicDisplay）');
    if (!patched) { process.exitCode = 1; return; }

    // 3) 打开大谱
    const target = await page.evaluate(async () => {
      const r = await fetch('/api/scores'); const d = await r.json();
      const s = d.scores.find(x => x.title.startsWith('Rienzi')) || d.scores.find(x => x.ready);
      return { id: s.id, title: s.title };
    });
    const t0 = Date.now();
    await page.evaluate(id => new Promise((res, rej) => document.dispatchEvent(new CustomEvent('ai-open-score', { detail: { id, resolve: res, reject: rej } }))), target.id);
    console.log(`目标 ${target.title} 打开耗时 %ss`, ((Date.now() - t0) / 1000).toFixed(1));
    await page.waitForTimeout(1500);

    const rec = await page.evaluate(() => window.__osmd);
    const sum = a => a.reduce((s, x) => s + x.ms, 0);
    console.log('\n=== 真实路径上的 OSMD 耗时 ===');
    console.log('  构造 new OSMD :', rec.ctor.length, '次, 合计', sum(rec.ctor), 'ms', JSON.stringify(rec.ctor.slice(0, 6)));
    console.log('  osmd.load     :', rec.load.length, '次, 合计', sum(rec.load), 'ms', JSON.stringify(rec.load.slice(0, 6)));
    console.log('  osmd.render   :', rec.render.length, '次, 合计', sum(rec.render), 'ms', JSON.stringify(rec.render.slice(0, 6)));
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
