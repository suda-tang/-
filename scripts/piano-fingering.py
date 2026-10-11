"""Adapter for the unmodified MIT PianoPlayer optimizer."""
import json
import sys
from collections import defaultdict
from dataclasses import replace
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'vendor'))
sys.path.insert(0, str(ROOT))
from pianoplayer.hand import Hand
from pianoplayer.models import INote, keypos
from storage import write_json

def generate(payload, progress=lambda *args: None):
    result, review = {}, []
    all_notes = payload['notes']
    completed = 0
    names = ('C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B')
    for side in ('right', 'left'):
        groups = defaultdict(list)
        for n in all_notes:
            if n['hand'] == side:
                groups[round(n['beat'], 7)].append(n)
        seq, links = [], []
        for chord_id, (beat, chord) in enumerate(sorted(groups.items())):
            pitches = defaultdict(list)
            for n in chord:
                pitches[n['midi']].append(n)
            if len(pitches) > 5:
                review.append({'measure': chord[0]['measure'], 'hand': side, 'reason': '同一只手同时超过五个琴键，请核对分手或减音'})
                for n in chord:
                    if n['finger']: result[n['id']] = n['finger']
                completed += len(chord)
                continue
            for rank, (pitch, same) in enumerate(sorted(pitches.items())):
                anchors = {n['finger'] for n in same if n['finger']}
                if len(anchors) > 1:
                    raise ValueError('同一琴键同时出现不同指法，请先校对原谱')
                n = INote(name=names[pitch % 12], octave=pitch // 12 - 1, pitch=pitch, time=beat, duration=max(n['duration'] for n in same), measure=int(same[0]['measure']), fingering=next(iter(anchors), 0), isBlack=pitch % 12 in (1,3,6,8,10), isChord=len(pitches)>1, chordnr=rank, NinChord=len(pitches), chordID=chord_id)
                n.x = keypos(n)
                seq.append(n); links.append(same)
        if not seq: continue
        hand = Hand(seq, side=side, size=payload['size'])
        hand.verbose = False
        hand.autodepth = False
        hand.depth = 6
        original_skip = hand.skip
        def constrained_skip(a, b, previous, following, *args):
            if following.fingering and b != following.fingering:
                return True
            return original_skip(a, b, previous, following, *args)
        hand.skip = constrained_skip
        base = completed
        counts = [0]
        for linked in links: counts.append(counts[-1]+len(linked))
        def update(done, total, measure):
            progress(min(99, int((base + counts[done]) / len(all_notes) * 100)), f'计算{"右" if side=="right" else "左"}手，第 {measure} 小节')
        # Receding look-ahead avoids upstream generate() reusing zero-filled
        # tail slots when a manual depth below nine is selected. Keep upstream
        # costs/constraints intact, and solve every actual attack explicitly.
        if side == 'left':
            for n in seq: n.x = -n.x
        carry, planned = 0, {}
        for i, note in enumerate(seq):
            window = seq[i:i+9]
            tail = window[-1]
            window += [replace(tail, time=tail.time+tail.duration*(k+1), fingering=0, isChord=False, chordID=tail.chordID+k+1, chordnr=0, NinChord=1) for k in range(9-len(window))]
            hand.depth = max(3, min(7, len(seq)-i))
            fixed = note.fingering or planned.get(i, 0)
            out, cost = hand.optimize_seq(window, fixed or carry)
            if not 1 <= out[0] <= 5:
                out, cost = hand.optimize_seq(window, fixed or 0)
            if not 1 <= out[0] <= 5:
                review.append({'measure': note.measure, 'hand': side, 'reason': '此处未找到可行指法，请人工校对'})
                continue
            note.fingering = out[0]
            if note.isChord and note.chordnr == 0:
                chord_fingers = out[:note.NinChord]
                if len(set(chord_fingers)) == note.NinChord and all(1 <= f <= 5 for f in chord_fingers):
                    planned.update({i+k: finger for k, finger in enumerate(chord_fingers)})
            hand.set_fingers_positions(out, window, 0)
            carry = out[1] if 1 <= out[1] <= 5 else 0
            update(i+1, len(seq), note.measure)
        for note, same in zip(seq, links):
            for original in same:
                if note.fingering: result[original['id']] = int(note.fingering)
        completed += sum(map(len, links))
    return {'fingers': result, 'review': review, 'engine': 'PianoPlayer 3.0.2', 'size': payload['size']}

if __name__ == '__main__':
    request, target = map(Path, sys.argv[1:])
    progress_path = target.with_name(target.stem+'.progress.json')
    last = [-1]
    def progress(value, detail):
        if value != last[0]:
            write_json(progress_path, {'progress': value, 'detail': detail}); last[0] = value
    write_json(target, generate(json.loads(request.read_text(encoding='utf-8')), progress))
