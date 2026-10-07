const http = require('http');
function post(message, context) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ messages: [{ role: 'user', content: message }], context });
    const req = http.request({
      host: '127.0.0.1', port: 5173, path: '/api/workspace-ai', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data.slice(0, 300) }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('timeout')));
    req.write(body); req.end();
  });
}
(async () => {
  const scoresRes = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:5173/api/scores', r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const scores = scoresRes.scores || [];
  const ready = scores.filter(s => s.ready);
  console.log('[曲库] 返回 ' + scores.length + ' 首, ready ' + ready.length + ' 首, current=' + (ready[0] && ready[0].title));
  const ctx = {
    scores: scores.map(s => ({ id: s.id, title: s.title, ready: s.ready, status: s.status || '' })),
    currentId: ready[0] && ready[0].id, playing: true, measure: 5, measureCount: 200,
    measureNumbers: Array.from({ length: 201 }, (_, i) => i + 1),
    parts: [{ id: 'P1-1', name: '钢琴' }, { id: 'P2-1', name: '弦乐组' }, { id: 'all', name: '全部' }],
    current: ready[0] && ready[0].title, currentChord: '', controls: [],
    settings: { tempo: 80, metronome: false, instrument: '三角钢琴', arrangement: 'original' }
  };
  const cases = [
    ['跳到第-1小节', 'G2畸形'], ['跳到第15.2小节', 'G2小数'], ['跳到第 88 小节', '正常跳'],
    ['只听全部乐器', 'G4-all'], ['钢琴音量小一点', 'G5音量'], ['把速度调到 250', 'G3越界'],
    ['慢一点', '相对变速'], ['打开《' + (ready[1] && ready[1].title || '知足') + '》', '打开另一首'],
    ['切换到简谱', '简谱'], ['这首歌的曲式结构是怎样的', '曲式(模型)'],
  ];
  for (const [msg, tag] of cases) {
    const s = Date.now();
    try {
      const r = await post(msg, ctx);
      const dt = ((Date.now() - s) / 1000).toFixed(1);
      const reply = (r.json && r.json.reply || '').slice(0, 80);
      const acts = JSON.stringify(r.json && r.json.actions || []);
      const clipped = /已省略|被裁剪/.test(reply) ? ' ⚠含省略标记' : '';
      console.log('[' + tag + '] (' + dt + 's) ' + msg);
      console.log('  状态=' + r.status + ' 回复=' + reply + clipped);
      console.log('  动作=' + acts.slice(0, 160));
    } catch (e) { console.log('[' + tag + '] ' + msg + '  ✗ ' + e.message); }
  }
})().catch(e => console.log('FATAL ' + e.message));
