// Minimal Standard MIDI File writer (SMF format 1).
// The project could already *read* .mid (midi.js) but had no way to write one,
// so scores could only leave the app as MusicXML. This builds a type-1 file
// from the same in-memory event list the player and the engraver use.
//
// Beat/time model matches dist/score.js: `event.beat` and `note.duration` are
// quarter-note beats, `note.midi` is a 0–127 key number.

const PPQ = 480;

function vlq(value) {
  let v = Math.max(0, Math.round(value));
  const out = [v & 0x7f];
  v >>>= 7;
  while (v > 0) { out.unshift((v & 0x7f) | 0x80); v >>>= 7; }
  return out;
}

function u16(value) { return [(value >>> 8) & 0xff, value & 0xff]; }
function u24(value) { const v = Math.max(0, Math.min(0xffffff, Math.round(value))); return [(v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]; }
function u32(value) { return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]; }
function ascii(text) { return [...String(text)].map(c => c.charCodeAt(0) & 0xff); }

function isPercussion(part, note) {
  return !!(note && note.percussion) || /drum|percussion|鼓/i.test(String(part || ''));
}

function velocityOf(note) {
  const raw = Number(note.velocity);
  if (Number.isFinite(raw) && raw > 1) return Math.max(1, Math.min(127, Math.round(raw)));
  if (Number.isFinite(raw) && raw > 0) return Math.max(1, Math.min(127, Math.round(raw * 127)));
  return 90;
}

function tempoTrack(tempo, timeSignature) {
  const bytes = [];
  bytes.push(...vlq(0), 0xff, 0x51, 0x03, ...u24(60000000 / tempo));
  const [beats, unit] = String(timeSignature || '4/4').split('/').map(Number);
  const numerator = Number.isFinite(beats) && beats > 0 ? Math.round(beats) : 4;
  const denominator = Number.isFinite(unit) && unit > 0 ? Math.round(unit) : 4;
  const power = Math.max(0, Math.min(8, Math.round(Math.log2(denominator))));
  bytes.push(...vlq(0), 0xff, 0x58, 0x04, numerator, power, 24, 8);
  bytes.push(...vlq(0), 0xff, 0x2f, 0x00);
  return bytes;
}

function noteTrack(items, channel, program) {
  const bytes = [];
  if (program !== null && program !== undefined) bytes.push(...vlq(0), 0xc0 | channel, program & 0x7f);
  let position = 0;
  for (const item of items) {
    bytes.push(...vlq(item.tick - position), 0x90 | channel, item.midi & 0x7f, item.velocity);
    position = item.tick;
    bytes.push(...vlq(item.length), 0x80 | channel, item.midi & 0x7f, 0x40);
    position = item.tick + item.length;
  }
  bytes.push(...vlq(0), 0xff, 0x2f, 0x00);
  return bytes;
}

/** Build a .mid file from a parsed score. Returns {bytes, tracks, notes}. */
export function scoreToMidi(score, { division = PPQ } = {}) {
  if (!score || !Array.isArray(score.events) || !score.events.length) throw Error('这份曲谱没有可导出的音符');
  const tempo = Math.max(20, Math.min(300, Number(score.tempo) || 80));
  const byPart = new Map();

  for (const event of score.events) {
    const startBeat = Number(event.beat) || 0;
    for (const note of event.notes || []) {
      const midi = Number(note.midi);
      if (!Number.isFinite(midi) || midi < 0 || midi > 127) continue;
      const key = String(note.part || 'default');
      if (!byPart.has(key)) byPart.set(key, { percussion: false, items: [] });
      const bucket = byPart.get(key);
      if (isPercussion(key, note)) bucket.percussion = true;
      bucket.items.push({
        tick: Math.max(0, Math.round(startBeat * division)),
        length: Math.max(1, Math.round((Number(note.duration) || 0.25) * division)),
        midi: Math.round(midi),
        velocity: velocityOf(note),
      });
    }
  }
  if (![...byPart.values()].some(b => b.items.length)) throw Error('这份曲谱没有可导出的音符');

  const tracks = [tempoTrack(tempo, score.timeSignature)];
  // Percussion is pinned to channel 9; melodic parts take 0–8 then 10–15.
  const melodicChannels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  let channelCursor = 0;
  let notes = 0;
  for (const [, bucket] of byPart) {
    if (!bucket.items.length) continue;
    const channel = bucket.percussion ? 9 : melodicChannels[channelCursor++ % melodicChannels.length];
    bucket.items.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
    notes += bucket.items.length;
    tracks.push(noteTrack(bucket.items, channel, bucket.percussion ? null : 0));
  }

  const chunks = [...ascii('MThd'), ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(division)];
  for (const data of tracks) chunks.push(...ascii('MTrk'), ...u32(data.length), ...data);
  return { bytes: new Uint8Array(chunks), tracks: tracks.length, notes };
}

export function midiFilename(score) {
  const base = String((score && score.title) || 'score').replace(/[\\/:*?"<>|]/g, '_').trim() || 'score';
  return base + '.mid';
}

export function downloadMidi(score) {
  const { bytes } = scoreToMidi(score);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = midiFilename(score);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
