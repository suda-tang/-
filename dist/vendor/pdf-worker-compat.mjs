// Workers have their own globals; page-level shims do not reach this realm.
import './typedarray-compat.mjs';
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new this((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}
if (typeof Promise.try !== 'function') {
  Promise.try = function (fn, ...args) {
    return new this(resolve => resolve(fn(...args)));
  };
}
if (typeof URL.parse !== 'function') {
  URL.parse = (url, base) => { try { return new URL(url, base); } catch { return null; } };
}
const { WorkerMessageHandler } = await import('./pdf.worker.mjs');
export { WorkerMessageHandler };
