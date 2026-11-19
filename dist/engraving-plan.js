// 惰性排版计划：把「把每个小节序列化成字符串」推迟到真正要用它的那一个分块。
//
// 背景（2026-10-10 实测，唐老师报「大曲子切到完整五线谱卡好久好久」）：
//   整部管弦乐总谱的 MusicXML 可以到 18MB / 28 个声部 / 4.5 万个 <measure>，
//   而首屏只用到前 16 小节。旧实现建计划时把**全部**小节一次性 serializeToString，
//   还每 96 小节 setTimeout(0) 让步一次（4.5 万 / 96 ≈ 476 次 × 浏览器 4ms 下限 ≈ 2 秒），
//   叠加逐小节的 querySelector(':scope > attributes') 与 new Map(state) 克隆，
//   实测 engravingPlan 单步就要 9.2 秒 —— 首块出现前用户一直卡在「正在排版完整五线谱」。
//   改成按需序列化 + 按需构建属性继承表后，建计划只剩一次 DOM 解析（约 1.3 秒）。
//
// 内存权衡：为了能按需序列化，计划会持有解析后的 DOM（大谱约 4.5 万个节点）。
//   某个声部的小节全部序列化、且属性表也扫完之后会立刻丢掉它的节点；
//   整份计划挂在 WeakMap 上，score 对象被替换后即随 GC 释放。
// 共享 DOM：见 score-document.js。同一份 XML 只解析一次，供多个消费者复用。
import { scoreDocument, rememberScoreDocument } from './score-document.js?v=1';
const plans = new WeakMap();

// ★ 2026-10-10：解析阶段（score.js 的 parseMusicXMLSteps）刚建好的 DOM，可以直接交给排版计划复用，
//   省掉第二次 18MB 全量 DOMParser（实测约 1.3 秒）。只保留「最近一次」并带 xml 校验，
//   计划取走后立即清引用，不会长期钉住一个大 DOM。
let lastSourceDocument = null;
export function rememberSourceDocument(xml, doc) { if (xml && doc) lastSourceDocument = { xml, doc }; }
function takeSourceDocument(xml) {
  const held = lastSourceDocument;
  if (!held) return null;
  lastSourceDocument = null;                       // 无论匹配与否都清掉，避免留着一个大 DOM
  return held.xml === xml ? held.doc : null;       // xml 被改写过（MIDI/变体）时不复用
}

export function engravingPlan(score, sourceDocument) {
  const hit = plans.get(score);
  if (hit?.xml === score.xml) return hit.promise;
  const promise = (async () => {
    const doc = sourceDocument || takeSourceDocument(score.xml) || scoreDocument(score.xml);
    // 把这份 DOM 登记给共享记忆：后面的演奏表情 / PDF 坐标 / 声部名都复用它，不再各自重解析 18MB。
    rememberScoreDocument(score.xml, doc);
    const serializer = new XMLSerializer(), root = doc.documentElement;
    const open = serializer.serializeToString(root.cloneNode(false)).replace(/\s*\/>$/, '>');
    const headers = [...root.children].filter(n => n.localName !== 'part').map(n => serializer.serializeToString(n)).join('');
    const parts = [];
    for (const part of [...root.children].filter(n => n.localName === 'part')) {
      const nodes = [...part.children].filter(n => n.localName === 'measure');
      parts.push({
        open: serializer.serializeToString(part.cloneNode(false)).replace(/\s*\/>$/, '>'),
        nodes, total: nodes.length, cache: new Array(nodes.length),
        changes: null, scanned: 0,
      });
    }
    // 一个声部的节点只在「还没序列化的小节」和「还没扫过的属性」两处有用。
    // 两件事都做完就把它丢掉，别让整棵 4.5 万节点的树一直占内存。
    const release = part => {
      if (!part.nodes.length || part.scanned < part.total) return;
      for (let i = 0; i < part.cache.length; i++) if (part.cache[i] === undefined) return;
      part.nodes = [];
    };
    const measuresText = (part, start, count) => {
      const end = Math.min(part.total, start + count), out = [];
      for (let i = start; i < end; i++) {
        let text = part.cache[i];
        if (text === undefined) text = part.cache[i] = serializer.serializeToString(part.nodes[i]);
        out.push(text);
      }
      release(part);
      return out.join('');
    };
    // 属性继承表按需构建：只扫到本次分块的起点，避免一上来就遍历全曲。
    // 调用点只会用 at < start 的最后一条快照，所以这里保证 changes 按 at 升序。
    const changesUpTo = (part, limit) => {
      if (part.changes === null) { part.changes = []; part.scanned = 0; }
      const reach = Math.min(limit, part.total);
      if (reach > part.scanned && part.nodes.length) {
        const state = new Map(part.changes.length ? part.changes.at(-1).state : []);
        for (let i = part.scanned; i < reach; i++) {
          const attributes = part.nodes[i]?.querySelector?.(':scope > attributes');
          if (attributes) {
            for (const attr of attributes.children) state.set(attr.localName + ':' + (attr.getAttribute('number') || ''), serializer.serializeToString(attr));
            part.changes.push({ at: i, state: new Map(state) });
          }
        }
        part.scanned = reach;
        release(part);
      }
      return part.changes;
    };
    // 每块小节数按声部数收敛。实测：整部管弦乐总谱（28 声部）若每块仍排 16 小节 = 4 个系统、
    // 上百行谱表，OSMD 一次要生成约 7000 个 SVG 元素、画成近 6700px 高，
    // 主线程被锁住好几秒（唐老师说的「卡好久好久」）。声部越多，每块越小。
    const chunk = 4; // Render one short system first; retain every later measure as a lazy chunk.
    return { open, headers, parts, count: parts[0]?.total || 0, chunk, close: '</' + root.tagName + '>', measuresText, changesUpTo };
  })();
  plans.set(score, { xml: score.xml, promise });
  promise.catch(() => plans.delete(score));
  return promise;
}

export async function engravingChunk(score, start, count) {
  const plan = await engravingPlan(score);
  count = count || plan.chunk || 16;
  const raw = plan.open + plan.headers + plan.parts.map(part => part.open + plan.measuresText(part, start, count) + '</part>').join('') + plan.close;
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (start) for (const [index, part] of [...doc.documentElement.children].filter(n => n.localName === 'part').entries()) {
    const source = plan.parts[index]; let inherited;
    for (const change of plan.changesUpTo(source, start)) { if (change.at >= start) break; inherited = change.state; }
    const first = part.querySelector('measure'); if (!first || !inherited) continue;
    let attributes = first.querySelector(':scope > attributes'); if (!attributes) { attributes = doc.createElement('attributes'); first.prepend(attributes); }
    const existing = new Set([...attributes.children].map(n => n.localName + ':' + (n.getAttribute('number') || '')));
    for (const [key, value] of inherited) if (!existing.has(key)) { const node = new DOMParser().parseFromString(value, 'application/xml').documentElement; attributes.append(doc.importNode(node, true)); }
  }
  return new XMLSerializer().serializeToString(doc);
}
