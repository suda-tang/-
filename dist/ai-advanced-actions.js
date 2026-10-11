// Capabilities the AI previously had to refuse: per-part volume, A–B loop,
// range playback, tempo curve, MIDI export, printing and the live practice
// score. Each one is exposed as an `ai-*` CustomEvent so workspace-ai.js only
// has to dispatch; all state lives here.
//
// Nothing here writes to the cloud library. Exports are local downloads.
import { liveScore, livePlayer } from './capability-host.js';
import { downloadMidi, midiFilename, scoreToMidi } from './midi-writer.js';
import { exportXML } from './score-editing.js';

const SEMITONE_NAMES = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];

// The model frequently emits Python-style dicts — "{'part': 'P1', 'value': 0.5}"
// with single quotes — which is not valid JSON. Accept it anyway; refusing here
// would turn a correct plan into「没听清参数」.
function looseObject(raw) {
  if (raw && typeof raw === 'object') return raw;
  const text = String(raw ?? '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* fall through */ }
  try { return JSON.parse(text.replace(/'/g, '"')); } catch { /* fall through */ }
  const out = {};
  for (const match of text.replace(/^[{[]|[}\]]$/g, '').matchAll(/([A-Za-z_][\w]*)\s*[:=]\s*("[^"]*"|'[^']*'|-?\d+(?:\.\d+)?|true|false|null)/g)) {
    let value = match[2];
    if (/^['"]/.test(value)) value = value.slice(1, -1);
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null') value = null;
    else value = Number(value);
    out[match[1]] = value;
  }
  return Object.keys(out).length ? out : null;
}

function requireScore() {
  const score = liveScore();
  if (!score || !score.events?.length) throw Error('请先打开一首曲谱');
  return score;
}

function requirePlayer() {
  const player = livePlayer();
  if (!player) throw Error('播放器还没有准备好');
  return player;
}

/** measure number -> {start, end} in beats, taken from the real events. */
function measureBounds(score) {
  const map = new Map();
  for (const event of score.events || []) {
    const measure = Number(event.measure);
    if (!Number.isFinite(measure)) continue;
    const entry = map.get(measure) || { start: Infinity, end: -Infinity };
    entry.start = Math.min(entry.start, Number(event.beat) || 0);
    for (const note of event.notes || []) entry.end = Math.max(entry.end, (Number(event.beat) || 0) + (Number(note.duration) || 0));
    map.set(measure, entry);
  }
  return map;
}

function rangeOf(score, fromMeasure, toMeasure) {
  const bounds = measureBounds(score);
  const numbers = [...bounds.keys()].sort((a, b) => a - b);
  if (!numbers.length) throw Error('这份曲谱没有可识别的小节');
  const lowest = numbers[0], highest = numbers[numbers.length - 1];
  const from = Math.max(lowest, Math.min(highest, Math.round(fromMeasure)));
  const to = Math.max(from, Math.min(highest, Math.round(toMeasure)));
  const startBeat = bounds.get(from).start;
  const next = bounds.get(to + 1);
  const endBeat = next ? next.start : bounds.get(to).end;
  return { from, to, startBeat, endBeat, lowest, highest };
}

function parseRange(value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value || {});
  const data = looseObject(raw);
  if (!data || typeof data !== 'object') {
    // 「第5到第8小节」这类自然语言兜底：抽两个数字。
    const numbers = String(raw).match(/-?\d+(\.\d+)?/g);
    if (!numbers || numbers.length < 2) throw Error('没听清要循环哪一段，请说「第5到第8小节循环」');
    data = { from: numbers[0], to: numbers[1] };
  }
  const from = Number(data.from ?? data.start ?? data.begin);
  const to = Number(data.to ?? data.end ?? data.stop);
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw Error('没听清要循环哪一段，请说「第5到第8小节循环」');
  return { from, to };
}

function partLabel(part) {
  const list = partList();
  const hit = list.find(p => String(p.value ?? p.id) === String(part));
  return hit?.name || hit?.label || String(part);
}

/** 当前谱面真实存在的声部 id 列表（拿不到就返回 null，表示"无法校验"）。 */
function partList() {
  const score = liveScore();
  const list = score?.parts || score?.midiParts || [];
  return Array.isArray(list) ? list : [];
}

// ---- 单个声部音量 -------------------------------------------------------
function setPartVolume(value) {
  const player = requirePlayer();
  let data = looseObject(value);
  if (!data || typeof data !== 'object') {
    // 「钢琴 0.5」/「钢琴小一点」的兜底：认名字 + 可选数字。
    const text = String(value || '');
    const number = Number((text.match(/\d+(\.\d+)?/) || [])[0]);
    data = { part: text.replace(/[\d.]+/g, '').trim(), value: Number.isFinite(number) ? (number > 1 ? number / 100 : number) : 0.5 };
  }
  const part = String(data.part ?? data.id ?? '').trim();
  if (!part) throw Error('没听清要调哪个声部的音量');
  // ★ 浏览器实测：模型偶尔会编一个不存在的声部 id（实测「NOPE」），以前照样设进去，
  //   回复还写「「NOPE」的音量已设为 50%」——界面其实一点没变。必须在这里挡住。
  const list = partList();
  let target = part;
  if (list.length && part !== 'all') {
    const byId = list.find(p => String(p.value ?? p.id) === part);
    const byName = list.find(p => String(p.name ?? p.label ?? '') === part);
    if (!byId && !byName) {
      const names = list.map(p => p.name || p.label || p.value).filter(Boolean);
      throw Error('这首没有「' + part + '」这个声部。可用的是：' + names.join('、'));
    }
    // 模型有时给的是声部**名字**而不是 id；不归一的话音量会挂在一个永远匹配不上的键上，
    // 界面照样不动。统一换成真实 id。
    target = String((byId ?? byName).value ?? (byId ?? byName).id);
  }
  let level = Number(data.value ?? data.level ?? data.volume);
  if (!Number.isFinite(level)) throw Error('没听清要调到多大，请说 0 到 1 之间的数或百分比');
  if (level > 1) level = level / 100;                     // 允许「50」表示 50%
  level = Math.max(0, Math.min(1, level));
  player.setPartVolume(target, level);
  return { part: target, level, label: partLabel(target) };
}

// ---- A–B 循环 / 区间播放 ------------------------------------------------
function setLoop(value, { once = false } = {}) {
  const score = requireScore();
  const player = requirePlayer();
  // 千轮实测 11 次：模型用 set_loop 的**空值**（"" / "None" / "{}"）表达「取消循环」。
  // 以前这里当成参数错误抛出去，于是「取消循环」也要白跑一遍失败重试。空值 = 取消，幂等。
  const parsed = looseObject(value);
  const from = Number(parsed?.from ?? parsed?.start);
  const to = Number(parsed?.to ?? parsed?.end);
  // 空值、None、{}、以及 {"from":0,"to":0} 这类退化区间，模型都是想表达「取消」。
  const hasRange = Number.isFinite(from) && Number.isFinite(to) && from >= 1 && to >= 1 && from < to;
  if (!hasRange) {
    const had = !!player.loop;
    player.clearLoop();
    return { cleared: true, had };
  }
  const range = rangeOf(score, from, to);
  if (!(range.endBeat > range.startBeat)) throw Error('这个区间里没有可播放的音符');
  const data = looseObject(value) || {};
  const repeats = Number(data.repeat ?? data.times);
  player.setLoop(range.startBeat, range.endBeat, { once, repeat: Number.isFinite(repeats) ? Math.max(1, Math.round(repeats)) : null });
  return range;
}

// ---- 速度渐变 -----------------------------------------------------------
function setTempoCurve(value) {
  const score = requireScore();
  const player = requirePlayer();
  const data = looseObject(value);
  if (!data || typeof data !== 'object') throw Error('没听清速度怎么变，请说「第5到第8小节从 80 渐快到 120」');
  const { from, to } = parseRange(data);
  const range = rangeOf(score, from, to);
  const base = Number(score.tempo) || player.bpm || 80;
  const startBpm = Number(data.fromBpm ?? data.startBpm ?? data.from ?? base);
  const endBpm = Number(data.toBpm ?? data.endBpm ?? data.to ?? startBpm);
  if (![startBpm, endBpm].every(v => Number.isFinite(v) && v >= 30 && v <= 240)) throw Error('渐变速度也要落在 30–240 BPM 之间');
  const steps = Math.max(2, Math.min(48, Number(data.steps) || 12));
  const curve = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    curve.push({ beat: range.startBeat + (range.endBeat - range.startBeat) * t, bpm: startBpm + (endBpm - startBpm) * t });
  }
  // 区间之后必须回到原速，否则后半首会一直停在终点速度上。
  curve.push({ beat: range.endBeat, bpm: base });
  score.tempoMap = curve;
  if (player.playing) player.restorePosition(player.beat, true);
  else player.restorePosition(player.beat, false);
  return { ...range, startBpm, endBpm, base };
}

// ---- 导出 ---------------------------------------------------------------
function exportScore(value) {
  const score = requireScore();
  const format = String(value || 'musicxml').toLowerCase();
  if (/mid/i.test(format)) {
    const { notes, tracks } = scoreToMidi(score);
    downloadMidi(score);
    return { format: 'midi', file: midiFilename(score), notes, tracks };
  }
  const xml = exportXML(score);
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = String(score.title || 'score').replace(/[\\/:*?"<>|]/g, '_') + '.musicxml';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { format: 'musicxml', file: link.download };
}

// ---- 打印 ---------------------------------------------------------------
// 直接 window.print() 会把导航、输入框和 AI 面板一起打进去。这里只让谱面容器
// 可见（用 visibility 而不是 display，避免打印时布局塌掉），打完立刻还原。
const PRINT_CSS = `
@media print{
 body.ai-printing *{visibility:hidden;}
 body.ai-printing #notation,body.ai-printing #notation *{visibility:visible;}
 body.ai-printing #notation{position:static;inset:auto;width:auto;max-height:none;overflow:visible;}
}`;
function ensurePrintStyle() {
  if (document.querySelector('#ai-print-style')) return;
  const style = document.createElement('style');
  style.id = 'ai-print-style';
  style.textContent = PRINT_CSS;
  document.head.append(style);
}
function printScore() {
  requireScore();
  if (!document.querySelector('#notation')) throw Error('界面上找不到可打印的谱面');
  ensurePrintStyle();
  document.body.classList.add('ai-printing');
  const cleanup = () => document.body.classList.remove('ai-printing');
  window.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(cleanup, 30000);
  window.print();
  return { printed: true };
}

// ---- 读取当前跟弹评分 ---------------------------------------------------
function practiceScore() {
  const read = id => { const el = document.querySelector('#' + id); const text = el?.textContent?.trim(); return text && text !== '—' ? text : null; };
  const accuracy = read('accuracy'), rhythm = read('rhythm'), tempo = read('current-tempo');
  if (!accuracy && !rhythm && !tempo) {
    throw Error('这一轮还没有跟弹记录 —— 请先在跟弹区域开始练习，我再读这里的正确率、节奏和速度。');
  }
  return { accuracy, rhythm, bpm: tempo };
}

const HANDLERS = {
  'ai-part-volume': setPartVolume,
  'ai-loop': value => setLoop(value, { once: false }),
  'ai-range-play': value => setLoop(value, { once: true }),
  'ai-tempo-curve': setTempoCurve,
  'ai-export-score': exportScore,
  'ai-print-score': printScore,
  'ai-practice-score': practiceScore,
};

for (const [name, handler] of Object.entries(HANDLERS)) {
  document.addEventListener(name, async event => {
    try { event.detail?.resolve?.(await handler(event.detail?.value)); }
    catch (error) { event.detail?.reject?.(error); }
  });
}

export { setPartVolume, setLoop, setTempoCurve, exportScore, printScore, practiceScore, measureBounds, rangeOf, SEMITONE_NAMES };
