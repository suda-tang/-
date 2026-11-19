// Language-guided, source-preserving score editing.
//
// Self-contained capability module.  It registers the `ai-edit-score` action
// dispatched by workspace-ai.js, draws a review panel, calls the local
// /api/sera-edit/* endpoints, and swaps the in-memory score through the
// `ai-sera-replace-score` listener installed in app.js.
//
// Safety contract:
//   * The authoritative source MusicXML is kept in `originalXml` and never
//     overwritten in the cloud library.  Edits only replace the on-screen
//     score object.
//   * Every proposal must be explicitly applied by the user.
//   * Undo restores the previous revision, or the pristine source XML.
//   * Sera's strict validation findings are shown as advisory warnings,
//     never used to silently reject an edit (project decision).

import { liveScore } from './capability-host.js';
import { exportXML } from './score-editing.js';

const SESSION_ID = 'sera-' + Math.random().toString(36).slice(2, 10);
let panel = null;
let pending = null;
let originalXml = null;
let busy = false;

const ESCAPE = text => String(text ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function currentXml() {
  const score = liveScore();
  if (!score) throw Error('请先打开一首曲谱');
  // Prefer the authoritative MusicXML; fall back to the front-end exporter.
  const xml = score.xml || exportXML(score);
  if (!xml || !xml.startsWith('<?xml')) throw Error('当前曲谱没有可用的 MusicXML');
  return xml;
}

async function post(action, body) {
  const response = await fetch('/api/sera-edit/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await response.json(); }
  catch { throw Error('编辑引擎返回了无法解析的结果'); }
  if (!response.ok || data.ok === false) {
    throw Error(data.error || data.reason || '编辑引擎未能完成请求');
  }
  return data;
}

function ensurePanel() {
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = 'sera-edit-panel';
  panel.setAttribute('aria-label', '乐谱精准编辑');
  panel.innerHTML = `
    <style>
      #sera-edit-panel{position:relative;z-index:60;margin:14px 0;padding:16px 18px;
        border:1px solid rgba(24,95,165,.28);border-radius:12px;background:var(--color-background-secondary,#fff);
        box-shadow:none;font-size:13px;line-height:1.6}
      #sera-edit-panel h3{margin:0 0 4px;font-size:14px;font-weight:500}
      #sera-edit-panel .sera-sub{color:var(--color-text-secondary,#666);font-size:12px;margin:0 0 12px}
      #sera-edit-panel .sera-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
      #sera-edit-panel input[type=text]{flex:1 1 260px;min-width:180px;padding:8px 10px;
        border:1px solid rgba(0,0,0,.2);border-radius:8px;background:var(--color-background-primary,#fff);
        color:var(--color-text-primary,#222);font-size:13px}
      #sera-edit-panel button{padding:8px 14px;border-radius:8px;border:1px solid rgba(24,95,165,.4);
        background:var(--color-background-primary,#fff);color:var(--color-text-primary,#222);
        cursor:pointer;font-size:13px}
      #sera-edit-panel button:hover:not(:disabled){background:rgba(24,95,165,.08)}
      #sera-edit-panel button:disabled{opacity:.5;cursor:not-allowed}
      #sera-edit-panel button.sera-primary{background:#185FA5;color:#fff;border-color:#185FA5}
      #sera-edit-panel .sera-review{margin-top:10px;padding:12px;border-radius:8px;
        background:var(--color-background-tertiary,#f6f7f9);border:1px solid rgba(0,0,0,.08)}
      #sera-edit-panel .sera-review h4{margin:0 0 6px;font-size:13px;font-weight:500}
      #sera-edit-panel .sera-warn{margin-top:8px;padding:8px 10px;border-radius:6px;
        background:rgba(186,117,23,.1);color:var(--color-text-primary,#222);font-size:12px}
      #sera-edit-panel .sera-msg{margin-top:8px;font-size:12px;color:var(--color-text-secondary,#666)}
      #sera-edit-panel .sera-msg.error{color:#A32D2D}
      #sera-edit-panel .sera-ops{margin:6px 0 0;padding-left:18px;color:var(--color-text-secondary,#666);font-size:12px}
      #sera-edit-panel .sera-hidden{display:none}
    </style>
    <h3>乐谱精准编辑</h3>
    <p class="sera-sub">用一句话修改谱面，例如「把第 3 小节升高一个半音」。原谱永不覆盖，所有修改都要你确认，可随时撤销。</p>
    <div class="sera-row">
      <input type="text" id="sera-instruction" placeholder="输入编辑指令，如：把第 1 小节升高一个半音" autocomplete="off">
      <button id="sera-preview" class="sera-primary">生成提案</button>
      <button id="sera-undo">撤销上次编辑</button>
    </div>
    <div id="sera-msg" class="sera-msg"></div>
    <div id="sera-review" class="sera-review sera-hidden">
      <h4 id="sera-summary"></h4>
      <div id="sera-ops" class="sera-ops"></div>
      <div id="sera-warn" class="sera-warn sera-hidden"></div>
      <div class="sera-row" style="margin-top:10px;margin-bottom:0">
        <button id="sera-apply" class="sera-primary">应用到当前谱面</button>
        <button id="sera-reject">放弃提案</button>
      </div>
    </div>`;
  const host = document.querySelector('.workspace') || document.body;
  host.append(panel);

  const $ = id => panel.querySelector('#' + id);
  $('sera-preview').onclick = () => runPreview($('sera-instruction').value);
  $('sera-instruction').onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runPreview($('sera-instruction').value); }
  };
  $('sera-apply').onclick = runApply;
  $('sera-reject').onclick = () => { pending = null; $('sera-review').classList.add('sera-hidden'); setMsg('已放弃提案，谱面未改动。'); };
  $('sera-undo').onclick = runUndo;
  return panel;
}

function setMsg(text, isError = false) {
  const el = ensurePanel().querySelector('#sera-msg');
  el.textContent = text || '';
  el.className = 'sera-msg' + (isError ? ' error' : '');
}

function setBusy(value) {
  busy = value;
  const p = ensurePanel();
  for (const id of ['sera-preview', 'sera-apply', 'sera-undo', 'sera-reject']) {
    const b = p.querySelector('#' + id); if (b) b.disabled = value;
  }
}

function fillInstruction(instruction) {
  const input = ensurePanel().querySelector('#sera-instruction');
  if (instruction && input) input.value = String(instruction);
}

function showProposal(data) {
  pending = data;
  const p = ensurePanel();
  const box = p.querySelector('#sera-review');
  box.classList.remove('sera-hidden');
  p.querySelector('#sera-summary').textContent = data.summary || '已生成编辑提案';
  p.querySelector('#sera-ops').innerHTML =
    (data.operations || []).slice(0, 6).map(op =>
      `<li>${ESCAPE(op.type)} · ${ESCAPE(JSON.stringify(op.arguments || {}))}</li>`).join('') || '';
  const warn = p.querySelector('#sera-warn');
  if (data.warnings?.length) {
    warn.classList.remove('sera-hidden');
    warn.innerHTML = `<strong>${ESCAPE(data.warnings_note || '校验提示')}</strong><br>` +
      data.warnings.map(w => '· ' + ESCAPE(w)).join('<br>') +
      '<br><span>按本项目设置，这些提示不阻断编辑；如谱面有误请先在教学软件中校对。</span>';
  } else {
    warn.classList.add('sera-hidden');
  }
}

async function runPreview(instruction) {
  if (busy) return;
  const text = String(instruction || '').trim();
  if (!text) return setMsg('请先输入编辑指令。', true);
  setBusy(true); setMsg('正在生成编辑提案…');
  try {
    const xml = currentXml();
    if (originalXml === null) originalXml = xml;
    const score = liveScore();
    const data = await post('preview', {
      xml, instruction: text,
      target_scope: score?.seraTargetScope || null,
    });
    if (!data.ok) throw Error(data.reason || data.detail || '无法生成提案');
    showProposal(data);
    setMsg(`提案已就绪：${data.change_count} 处变化。请核对后点击「应用到当前谱面」。`);
  } catch (error) {
    pending = null;
    ensurePanel().querySelector('#sera-review').classList.add('sera-hidden');
    setMsg('提案失败：' + error.message, true);
  } finally { setBusy(false); }
}

function replaceScore(xml) {
  return new Promise((resolve, reject) => {
    document.dispatchEvent(new CustomEvent('ai-sera-replace-score', {
      detail: { xml, resolve, reject },
    }));
    setTimeout(() => reject(Error('谱面载入超时，请核对当前视图')), 20000);
  });
}

async function runApply() {
  if (busy || !pending) return;
  setBusy(true); setMsg('正在应用修订…');
  try {
    const saved = await post('apply', {
      session_id: SESSION_ID,
      source_xml: originalXml,
      revised_xml: pending.revised_xml,
      instruction: pending.instruction,
    });
    await replaceScore(saved.xml || pending.revised_xml);
    pending = null;
    ensurePanel().querySelector('#sera-review').classList.add('sera-hidden');
    setMsg(`已应用修订（${saved.depth} 层）。原谱未改动，可点「撤销上次编辑」还原。`);
  } catch (error) {
    setMsg('应用失败：' + error.message, true);
  } finally { setBusy(false); }
}

async function runUndo() {
  if (busy) return;
  setBusy(true); setMsg('正在撤销…');
  try {
    const data = await post('undo', { session_id: SESSION_ID });
    if (!data.ok) return setMsg(data.reason || '没有可撤销的编辑');
    const xml = data.xml || originalXml;
    if (!xml) return setMsg('找不到可还原的原始谱面', true);
    // 前端只认 <?xml 开头；原谱缓存可能在导出时缺声明，补上再载入。
    await replaceScore(xml.startsWith('<?xml') ? xml : '<?xml version="1.0" encoding="UTF-8"?>\n' + xml);
    pending = null;
    ensurePanel().querySelector('#sera-review').classList.add('sera-hidden');
    setMsg(data.restored_original ? '已还原到编辑前的原谱。' : `已撤销，回到第 ${data.depth} 层修订。`);
  } catch (error) {
    setMsg('撤销失败：' + error.message, true);
  } finally { setBusy(false); }
}

// AI action entry point.  workspace-ai.js dispatches `ai-edit-score` with
// {value, resolve, reject}; `value` may be a plain instruction string or an
// object {instruction, auto_apply}.  Proposals always require review first
// unless the caller explicitly asks for auto_apply.
document.addEventListener('ai-edit-score', async event => {
  const detail = event.detail || {};
  try {
    const raw = detail.value;
    let instruction = raw, autoApply = false;
    if (raw && typeof raw === 'object') {
      instruction = raw.instruction || raw.text || '';
      autoApply = Boolean(raw.auto_apply);
    } else if (typeof raw === 'string' && raw.trim().startsWith('{')) {
      try { const o = JSON.parse(raw); instruction = o.instruction || o.text || raw; autoApply = !!o.auto_apply; }
      catch { /* keep raw string */ }
    }
    instruction = String(instruction || '').trim();
    if (!instruction) throw Error('没有给出编辑指令');
    fillInstruction(instruction);
    ensurePanel().scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    await runPreview(instruction);
    if (autoApply && pending) await runApply();
    const p = ensurePanel();
    const summary = pending ? pending.summary : p.querySelector('#sera-msg').textContent;
    detail.resolve?.({
      ok: true,
      applied: !pending,
      summary: summary || instruction,
      instruction,
      note: pending ? '提案已生成，等待用户在「乐谱精准编辑」面板确认应用' : '已应用到当前谱面',
    });
  } catch (error) {
    detail.reject?.(error);
  }
});

export { runPreview, runApply, runUndo, ensurePanel };
