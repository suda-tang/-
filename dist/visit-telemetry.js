// 导师访问全景采集：只在带 ?visit= / ?mentor= 的链接（及其后续页面）里启用。
// 采集：可见/有效时长、面板|视图|曲谱停留、导览每段停留、功能与点击、
//       AI 每轮对话（用户/助手）、课堂操作（/api/classroom/event 等）、
//       浏览器/设备/屏幕/语言/时区等可采集参数。
// 上报：POST /api/visit（start / heartbeat / event / end）；关页用 sendBeacon 兜底。
// 服务端按「累计值取 max」聚合，丢一两个心跳也不会少算。
(() => {
  try {
    const params = new URLSearchParams(location.search);
    const token = (params.get('visit') || '').trim();
    const mentor = (params.get('mentor') || '').trim();
    const STORE = 'mentorVisitIdentity';
    let stored = null;
    try { stored = JSON.parse(sessionStorage.getItem(STORE) || 'null'); } catch {}
    const who = {
      token: token || (stored && stored.token) || '',
      mentor: mentor || (stored && stored.mentor) || '',
    };
    // 不带参数的链接也统计：匿名访客由服务端按公网 IP 自动归类。
    // 每次页面加载算一次「打开」：会话号每次新生成（刷新也算一次打开）；
    // 身份（令牌/姓名）跨刷新保留，所以后续页面仍归到同一位老师。
    const identity = { ...who, session: newId() };
    try { sessionStorage.setItem(STORE, JSON.stringify(who)); } catch {}
    if (window.__mentorTelemetry) return;
    window.__mentorTelemetry = true;

    function newId() {
      try { return crypto.randomUUID(); } catch {}
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    // ---- 设备 / 浏览器参数 -------------------------------------------------
    function deviceInfo() {
      const ua = navigator.userAgent;
      const uad = navigator.userAgentData;
      const connection = navigator.connection || {};
      return {
        ua,
        mobile: uad ? !!uad.mobile : /Mobi|Android|iPhone|iPad/i.test(ua),
        platform: (uad && uad.platform) || navigator.platform || '',
        brands: (uad && uad.brands ? uad.brands.map(b => b.brand + ' ' + b.version).join(', ') : ''),
        screen: screen.width + 'x' + screen.height,
        viewport: innerWidth + 'x' + innerHeight,
        dpr: devicePixelRatio || 1,
        cores: navigator.hardwareConcurrency || 0,
        memoryGB: navigator.deviceMemory || 0,
        touch: navigator.maxTouchPoints || 0,
        language: navigator.language || '',
        languages: (navigator.languages || []).join(','),
        timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })(),
        network: connection.effectiveType || '',
        cookies: navigator.cookieEnabled ? 1 : 0,
      };
    }

    const started = Date.now();
    let visibleMs = 0, activeMs = 0, lastTick = Date.now(), lastInteraction = Date.now();
    const sectionMs = {}, features = {}, scores = new Set();
    let currentSection = '', lastSectionAt = Date.now(), lastView = '';

    // 导览分段计时
    let tourId = '', tourAt = 0;
    const tourMs = {};

    const touch = () => { lastInteraction = Date.now(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(name =>
      addEventListener(name, touch, { passive: true, capture: true }));

    function viewMode() {
      const on = id => document.getElementById(id)?.classList.contains('active');
      if (on('notation-button')) return 'engraved';
      if (on('simple-button')) return 'simple';
      if (on('pdf-button')) return 'pdf';
      if (on('daw-button')) return 'daw';
      return '';
    }

    function sectionKey() {
      const panel = (document.body && document.body.dataset.workspace) || 'home';
      return [panel, viewMode(), (document.body && document.body.dataset.currentScoreId) || '']
        .filter(Boolean).join('|');
    }

    function bump(key) {
      if (!key) return;
      features[key] = (features[key] || 0) + 1;
    }

    // ---- 身份透传：让服务端（AI/课堂接口）也知道是哪位老师 ----------------
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      let chatResponse = false;
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url && (url.startsWith('/') || url.startsWith(location.origin))) {
          init = Object.assign({}, init || {});
          const headers = new Headers(init.headers || {});
          if (identity.token) headers.set('X-Mentor-Token', identity.token);
          if (identity.mentor) headers.set('X-Mentor-Name', identity.mentor);
          init.headers = headers;
          // 课堂里的详细操作（翻页/讲解/提问/修改等）都走这些接口，直接记下来。
          if (/\/api\/classroom\/(event|chat|revise)/.test(url) && typeof init.body === 'string') {
            try {
              const payload = JSON.parse(init.body);
              const api = url.split('?')[0].split('/').pop();
              send('event', { action: 'classroom', detail: { api, request: cleanDetail(payload), ...contextNow() } });
              chatResponse = api === 'chat';
            } catch {}
          }
        }
      } catch {}
      const response = nativeFetch(input, init);
      // 课堂提问的回答也要留档（clone 一份读，不影响原响应）。
      if (chatResponse) {
        try {
          response.then(r => r.clone().json()).then(data => {
            const answer = data && (data.answer || data.reply || data.text || data.message || '');
            send('event', { action: 'classroom_reply', detail: { answer: String(answer).slice(0, 3000) } });
          }).catch(() => {});
        } catch {}
      }
      return response;
    };

    // ---- 导览分段 ---------------------------------------------------------
    document.addEventListener('mentor-tour-step', event => {
      const detail = event.detail || {};
      const now = Date.now();
      const id = String(detail.id || '');
      if (tourId) tourMs[tourId] = (tourMs[tourId] || 0) + Math.max(0, now - tourAt);
      const changed = id !== tourId;
      tourId = id; tourAt = now;
      if (id) bump('tour:' + id);
      if (changed && id) send('event', { action: 'tour_step', detail: {
        id, index: detail.index, total: detail.total, title: detail.title || '',
      } });
    });

    // ---- AI 对话：观察 .ai-messages 里的用户/助手消息 ---------------------
    const recordedAi = new Set(), aiTimers = new Map();
    function scheduleAi(el) {
      clearTimeout(aiTimers.get(el));
      aiTimers.set(el, setTimeout(() => {
        aiTimers.delete(el);
        const role = el.classList.contains('user') ? 'user' : el.classList.contains('assistant') ? 'assistant' : '';
        if (!role) return;
        const text = (el.textContent || '').trim();
        if (!text) return;
        const key = role + ':' + text;
        if (recordedAi.has(key)) return;
        recordedAi.add(key);
        send('event', { action: 'ai_chat', detail: { role, text: text.slice(0, 4000) } });
      }, 1600));
    }
    function observeAiLog(log) {
      if (!log || log.__mentorObserved) return;
      log.__mentorObserved = true;
      new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.type === 'childList') {
            for (const node of m.addedNodes) {
              if (node.nodeType !== 1) continue;
              if (node.matches && node.matches('p')) scheduleAi(node);
              if (node.querySelectorAll) node.querySelectorAll('p').forEach(scheduleAi);
            }
          } else {
            const node = m.target.nodeType === 3 ? m.target.parentElement : m.target;
            const p = node && node.closest ? node.closest('.ai-messages p') : null;
            if (p) scheduleAi(p);
          }
        }
      }).observe(log, { childList: true, subtree: true, characterData: true });
    }
    const aiProbe = setInterval(() => {
      const log = document.querySelector('.ai-messages');
      if (log) { observeAiLog(log); clearInterval(aiProbe); }
    }, 1000);

    // ---- 定时采样 ---------------------------------------------------------
    setInterval(() => {
      const now = Date.now();
      const delta = Math.min(now - lastTick, 5000);
      lastTick = now;
      if (document.visibilityState === 'visible') {
        visibleMs += delta;
        if (now - lastInteraction < 60000) activeMs += delta;
      }
    }, 1000);

    let lastPanelSeen = '', lastScoreSeen = '';
    setInterval(() => {
      const now = Date.now();
      const key = sectionKey();
      if (currentSection && document.visibilityState === 'visible') {
        sectionMs[currentSection] = (sectionMs[currentSection] || 0) + Math.min(now - lastSectionAt, 5000);
      }
      currentSection = key;
      lastSectionAt = now;
      const panel = (document.body && document.body.dataset.workspace) || 'home';
      const view = viewMode();
      const score = (document.body && document.body.dataset.currentScoreId) || '';
      if (panel !== lastPanelSeen) { send('event', { action: 'panel_change', detail: { from: lastPanelSeen, to: panel } }); lastPanelSeen = panel; }
      if (view && view !== lastView) { send('event', { action: 'view_change', detail: { from: lastView, to: view } }); lastView = view; bump('view:' + view); }
      if (score !== lastScoreSeen) { send('event', { action: 'score_change', detail: { from: lastScoreSeen, to: score } }); lastScoreSeen = score; }
    }, 2000);

    try {
      let lastScore = document.body.dataset.currentScoreId || '';
      if (lastScore) scores.add(lastScore);
      new MutationObserver(() => {
        const id = document.body.dataset.currentScoreId || '';
        if (id && id !== lastScore) { lastScore = id; scores.add(id); bump('score_open'); }
      }).observe(document.body, { attributes: true, attributeFilter: ['data-current-score-id'] });
    } catch {}

    // 把事件 detail 里不能序列化的 resolve/reject 等丢掉，并限制体积。
    function cleanDetail(value, depth) {
      depth = depth || 0;
      if (depth > 3 || value == null) return value;
      const t = typeof value;
      if (t === 'string') return value.slice(0, 600);
      if (t === 'number' || t === 'boolean') return value;
      if (t === 'function') return undefined;
      if (Array.isArray(value)) return value.slice(0, 20).map(v => cleanDetail(v, depth + 1));
      if (t === 'object') {
        const out = {}; let n = 0;
        for (const k of Object.keys(value)) {
          if (k === 'resolve' || k === 'reject') continue;
          if (n++ > 30) break;
          const v = cleanDetail(value[k], depth + 1);
          if (v !== undefined) out[k] = v;
        }
        return out;
      }
      return undefined;
    }
    function contextNow() {
      return {
        panel: (document.body && document.body.dataset.workspace) || '',
        view: viewMode(),
        score: (document.body && document.body.dataset.currentScoreId) || '',
      };
    }

    const AI_EVENTS = ['ai-open-score', 'ai-play-score', 'ai-transport', 'ai-set-view', 'ai-seek-measure',
      'ai-solo-part', 'ai-solo-group', 'ai-analyze-chords', 'ai-set-tempo', 'ai-practice-score', 'ai-loop',
      'ai-range-play', 'ai-export-score', 'ai-print-score', 'ai-generate-arrangement', 'ai-create-classroom',
      'ai-classroom-command', 'ai-compose', 'ai-part-volume', 'ai-tempo-curve', 'ai-set-metronome',
      'ai-set-instrument', 'ai-set-arrangement'];
    // 每个动作都写成一条带参数的事件（跳到第几小节、速度多少、哪个声部…）。
    AI_EVENTS.forEach(name => document.addEventListener(name, event => {
      bump('ai:' + name);
      send('event', { action: 'ai_action', detail: {
        type: name, ...(cleanDetail(event.detail) || {}), ...contextNow(),
      } });
    }, true));

    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const control = target.closest('button, a, [role=button], summary, input, select, label, [data-panel]');
      if (!control) return;
      const text = (control.getAttribute('aria-label') || control.textContent || '').trim().slice(0, 60);
      const id = control.id || '';
      const label = id || control.dataset.view || control.dataset.panel || text || control.tagName.toLowerCase();
      bump('click:' + label.slice(0, 40));
      send('event', { action: 'click', detail: {
        tag: control.tagName.toLowerCase(), id, cls: String(control.className || '').slice(0, 60),
        text, x: Math.round(event.clientX), y: Math.round(event.clientY), ...contextNow(),
      } });
    }, true);

    // 控件值变化：速度滑杆、音量、音色、编制、节拍器、勾选框、输入框…
    let controlTimer = 0;
    function logControl(el) {
      const value = el.type === 'checkbox' ? (el.checked ? 'on' : 'off') : String(el.value == null ? '' : el.value).slice(0, 80);
      send('event', { action: 'control', detail: {
        tag: el.tagName.toLowerCase(), id: el.id || '', name: el.getAttribute('name') || '',
        type: el.getAttribute('type') || '', value, ...contextNow(),
      } });
    }
    document.addEventListener('change', event => {
      const el = event.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) logControl(el);
    }, true);
    document.addEventListener('input', event => {
      const el = event.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (!['range', 'text', 'search', 'number'].includes(el.type)) return;
      clearTimeout(controlTimer);
      controlTimer = setTimeout(() => logControl(el), 500);
    }, true);

    // ---- 公网 IP：经隧道/反代后服务端只看到 127.0.0.1，这里补一个真实出口 IP ----
    let publicIp = '', publicGeo = '';
    function lookupIp(attempt) {
      try {
        fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(4000) })
          .then(r => r.json())
          .then(d => {
            publicIp = String((d && d.ip) || '').slice(0, 64);
            publicGeo = [d.city, d.region, d.country, d.org].filter(Boolean).join(' / ').slice(0, 120);
            if (publicIp) send('heartbeat');  // 拿到公网 IP 立刻补报，便于按 IP 归类
          })
          .catch(() => { if (attempt < 2) setTimeout(() => lookupIp(attempt + 1), 1200); });
      } catch {
        if (attempt < 2) setTimeout(() => lookupIp(attempt + 1), 1200);
      }
    }
    lookupIp(0);

    // ---- 上报 -------------------------------------------------------------
    function snapshot() {
      return {
        token: identity.token, mentor: identity.mentor, session: identity.session,
        panel: (document.body && document.body.dataset.workspace) || '',
        view: viewMode(), score: (document.body && document.body.dataset.currentScoreId) || '',
        visibleMs: Math.round(visibleMs), activeMs: Math.round(activeMs),
        sectionMs: { ...sectionMs }, tourMs: { ...tourMs }, features: { ...features },
        device: deviceInfo(), publicIp, publicGeo,
      };
    }

    function send(kind, extra) {
      const body = JSON.stringify({ kind, ...snapshot(), ...(extra || {}) });
      if ((kind === 'end' || kind === 'heartbeat') && navigator.sendBeacon) {
        try { navigator.sendBeacon('/api/visit', new Blob([body], { type: 'application/json' })); return; } catch {}
      }
      try {
        nativeFetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      } catch {}
    }

    send('start');
    setInterval(() => { if (document.visibilityState === 'visible') send('heartbeat'); }, 30000);
    document.addEventListener('visibilitychange', () => {
      send('event', { action: 'visibility', detail: { state: document.visibilityState } });
      if (document.visibilityState === 'hidden') send('heartbeat');
    });
    let errorCount = 0;
    addEventListener('error', event => {
      if (errorCount++ > 50) return;
      send('event', { action: 'error', detail: {
        message: String(event.message || '').slice(0, 200),
        source: String(event.filename || '').slice(0, 120), line: event.lineno || 0,
      } });
    });
    addEventListener('unhandledrejection', event => {
      if (errorCount++ > 50) return;
      const reason = event.reason;
      send('event', { action: 'error', detail: {
        message: String((reason && reason.message) || reason || '').slice(0, 200), kind: 'unhandledrejection',
      } });
    });
    addEventListener('pagehide', () => {
      if (tourId) tourMs[tourId] = (tourMs[tourId] || 0) + Math.max(0, Date.now() - tourAt);
      send('end');
    });
    window.mentorTelemetry = { snapshot, send };
  } catch (error) {
    console.warn('访问采集未启用', error);
  }
})();
