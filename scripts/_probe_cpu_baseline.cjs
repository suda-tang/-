// 基础 CPU/JS 吞吐基线：判断「剩余耗时」里有多少只是机器本身慢。
const { chromium } = require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ORIGIN = process.env.PIANO_ORIGIN || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('boot-ready'), null, { timeout: 90000 });

    const info = await page.evaluate(() => {
      const out = { 核心数: navigator.hardwareConcurrency, 设备内存GB: navigator.deviceMemory || null };
      let t = performance.now(), x = 0;
      for (let i = 0; i < 1e8; i++) x = (x + i) | 0;
      out['整型循环1e8_ms'] = Math.round(performance.now() - t);

      const big = JSON.stringify(Array.from({ length: 200000 }, (_, i) => ({ a: i, b: 'x'.repeat(20) })));
      out['JSON体积MB'] = +(big.length / 1048576).toFixed(1);
      t = performance.now(); JSON.parse(big);
      out['JSON.parse_ms'] = Math.round(performance.now() - t);

      const xml = '<root>' + '<m><n>1</n><d>4</d></m>'.repeat(120000) + '</root>';
      out['XML体积MB'] = +(xml.length / 1048576).toFixed(1);
      t = performance.now(); new DOMParser().parseFromString(xml, 'application/xml');
      out['DOMParser_ms'] = Math.round(performance.now() - t);

      t = performance.now(); new TextEncoder().encode(xml);
      out['TextEncoder_ms'] = Math.round(performance.now() - t);
      return out;
    });
    console.log('\n=== 机器/JS 基线 ===');
    for (const [k, v] of Object.entries(info)) console.log('  ' + k.padEnd(18), JSON.stringify(v));
    console.log('\n参考：现代桌面 CPU 上，1e8 次 `(x+i)|0` 大约 100~250 ms；若 >1000 ms 说明这台机器明显偏慢。');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
