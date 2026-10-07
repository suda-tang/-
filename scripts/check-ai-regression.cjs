#!/usr/bin/env node
// 一条命令跑完 AI 工作区的全部回归。
//
// 为什么需要它：AI 工作区现在有 12 个专项检查 + 60 条长流程用例，命令散在
//   skills 文档里，改完代码很容易漏跑某一项（长流程验收这一轮就漏过一次）。
//   这个脚本按「快 → 慢」串行跑完，最后给一张汇总表；退出码非 0 = 有失败。
//
// 用法：
//   node scripts/check-ai-regression.cjs                   # 快的 12 项（约 6 分钟）
//   node scripts/check-ai-regression.cjs --long            # 再加 60 条长流程（约 30 分钟）
//   node scripts/check-ai-regression.cjs --only library    # 只跑名字里含 library 的
//   node scripts/check-ai-regression.cjs --list            # 只列出会跑哪些，不执行
//
// ★ 为什么不写成 bash 串：`check-ai-control-actions` 单跑就约 1 分钟，几条串起来
//   会撞 bash 超时；node 里 spawnSync 子进程没有这个限制，还能各自设超时。
// ★ 长流程（--long）必须**串行**跑 —— 后端是单页面串行处理的，并发会互相排队超时。

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const PY_CANDIDATES = [
  'C:/Users/mail/AppData/Local/Programs/Python/Python312/python.exe',            // 服务用的就是 3.12
  'C:/Users/mail/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe',     // 托管版兜底
];
const PYTHON = PY_CANDIDATES.find(p => fs.existsSync(p)) || 'python';

// { name, file, run, about, timeout(秒), args? }
const CHECKS = [
  { name: 'frontend-syntax',   file: 'scripts/check-frontend-syntax.cjs',      run: 'node',   about: '67 个前端文件语法',                                  timeout: 120 },
  { name: 'action-guard',      file: 'scripts/check-ai-action-guard.cjs',      run: 'node',   about: '空转报警 / 不误报 / 面板名归一 / 未知动作不静默',      timeout: 240 },
  { name: 'library-visibility',file: 'scripts/check-ai-library-visibility.cjs',run: 'node',   about: '索引 + 完整 id 并存、上下文 < 20000（预警线）',        timeout: 180 },
  { name: 'retract',           file: 'scripts/check-ai-retract.cjs',           run: 'node',   about: '面板收回 / 待选时保留 / 删除类回绝且不重试',            timeout: 180 },
  { name: 'control-actions',   file: 'scripts/check-ai-control-actions.cjs',   run: 'node',   about: '暂停不误播 / 控件动作 / 视图四值 / 全部静音',          timeout: 300 },
  { name: 'identity',          file: 'scripts/check-ai-identity.cjs',          run: 'node',   about: '★真打模型★ 三问必须自称 SUPERTANG AI',                timeout: 300 },
  { name: 'stream-progress',   file: 'scripts/check-ai-stream-progress.cjs',   run: 'node',   about: '★真打模型★ 逐字增长 + 首字秒表',                      timeout: 300 },
  { name: 'locate',            file: 'scripts/check-ai-locate.py',             run: 'python', about: '「X 最早出现的地方」（直打 planner）',                timeout: 180 },
  { name: 'no-delete',         file: 'scripts/check-ai-no-delete.py',          run: 'python', about: '禁删：后端回绝 + 前后端清单一致',                    timeout: 180 },
  { name: 'stream-reply',      file: 'scripts/check-ai-stream-reply.py',       run: 'python', about: '流式提取器（纯函数）',                              timeout: 120 },
  { name: 'task-ttl',          file: 'scripts/check-ai-task-ttl.py',           run: 'python', about: '任务 TTL（纯函数）',                                timeout: 120 },
  { name: 'web-search',        file: 'scripts/check-ai-web-search.py',         run: 'python', about: '联网找谱（需外网，可降级）',                        timeout: 180 },
];

// --long 才跑（真打模型，很慢）
const LONG = {
  name: 'longflow', file: 'scripts/check-ai-longflow.cjs', run: 'node',
  about: '★真打模型★ 60 条长流程（约 30 分钟，必须串行）', timeout: 3000,
  args: ['--from', '1', '--to', '60'],
};

const argv = process.argv.slice(2);
const has = flag => argv.includes(flag);
const valueOf = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };

const only = valueOf('--only');
let plan = CHECKS.slice();
if (has('--long')) plan = plan.concat([LONG]);
if (only) plan = plan.filter(c => c.name.includes(only));

if (has('--list')) {
  console.log('会跑这些（' + plan.length + ' 项）：');
  for (const c of plan) console.log('  ' + c.name.padEnd(20) + c.about);
  process.exit(0);
}
if (!plan.length) {
  console.log('没有匹配的检查项（--only ' + only + '）。用 --list 看全部。');
  process.exit(2);
}

console.log('AI 回归：' + plan.length + ' 项，串行执行' + (has('--long') ? '（含 56 条长流程，请耐心等）' : ''));
console.log('─'.repeat(78));

const results = [];
for (const c of plan) {
  process.stdout.write('▶ ' + c.name.padEnd(20) + c.about.padEnd(44) + ' … ');
  const started = Date.now();
  const cmd = c.run === 'python' ? PYTHON : NODE;
  const res = spawnSync(cmd, [path.join(ROOT, c.file)].concat(c.args || []), {
    cwd: ROOT, encoding: 'utf-8', timeout: c.timeout * 1000, maxBuffer: 64 * 1024 * 1024,
  });
  const ms = Date.now() - started;
  const out = String(res.stdout || '') + String(res.stderr || '');
  // ★ 不看退出码就下结论是不行的：这些检查脚本都会在失败时 exit 非 0，
  //   但 stdout 里还有各自的「PASS …」行 —— 两个都记下来，失败时把尾巴打出来。
  const ok = res.status === 0;
  results.push({ name: c.name, ok, ms, out, status: res.status, signal: res.signal });
  console.log((ok ? 'PASS' : 'FAIL') + '  (' + (ms / 1000).toFixed(1) + 's)');
  if (!ok) {
    const tail = out.trim().split('\n').slice(-12).join('\n');
    console.log('   ┌── 输出尾部 ─────────────────────────────');
    console.log(tail.replace(/^/gm, '   │ '));
    console.log('   └─────────────────────────────────────────');
    if (res.signal === 'SIGTERM') console.log('   ⚠ 超时被 kill（' + c.timeout + 's）—— 检查是不是有别的会话在压测');
  }
}

console.log('─'.repeat(78));
for (const r of results) {
  console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name.padEnd(20) + (r.ms / 1000).toFixed(1) + 's');
}
const bad = results.filter(r => !r.ok);
console.log('');
console.log((results.length - bad.length) + '/' + results.length + ' PASS' +
  (bad.length ? '　失败：' + bad.map(b => b.name).join('、') : '　全绿 ✓'));
process.exit(bad.length ? 1 : 0);
