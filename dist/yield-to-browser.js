// 让出主线程一次的通用工具。
//
// ★ 2026-10-10 实测：**不要用 `setTimeout(resolve, 0)` 做让步**。
//   浏览器对嵌套定时器有 4ms 下限，凡是「每 N 毫秒让步一次」的分片循环都在交这个税。
//   各跑 300 次的对比：
//     setTimeout(0)    → 2122 ms / 4500 ms（两次运行）
//     MessageChannel   → 3 ms / 11 ms          （265 倍以上差距）
//   实例：18MB 大谱的异步解析原本因此比同步解析还慢约 1.2 秒。
//
// 注意：`requestAnimationFrame(() => setTimeout(r, 0))` 那种是**故意等一帧**
// （要拿到布局后的尺寸），不要换成这个。
export function yieldToBrowser() {
  return new Promise(resolve => {
    if (typeof MessageChannel !== 'function') return void setTimeout(resolve, 0);
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
    channel.port2.postMessage(0);
  });
}
