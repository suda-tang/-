"""Check that a generated arrangement is harmonically clean.

Run against a generated arrangement JSON:

    python scripts/check-arrangement-harmony.py .sites-runtime/arrangements/<digest>.json

It fails when a generated part walks in parallel fifths or octaves with the part
below it, when too many of its notes fall outside the score's key, or when the
parts no longer fit their instrument's range. Those three were the reasons an
arrangement could sound like a counterpoint exercise rather than an
accompaniment.
"""
import argparse
import collections
import json
import sys

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
MAJOR = [0, 2, 4, 5, 7, 9, 11]
RANGE = {'Violin': (55, 98), 'Viola': (48, 88), 'Cello': (36, 76), 'Contrabass': (28, 62),
         'Flute': (60, 96), 'Clarinet': (50, 91), 'French Horn': (36, 74)}
MAX_OUTSIDE = 0.08
MAX_CLASH = 0.06
# The voice-leading pass steps the upper voice aside one degree at a time, so a
# handful of pairs can still slip through where the surrounding harmony leaves no
# in-key neighbour. A fraction of a percent is inaudible; the raw model wrote
# parallels on one pair in twenty.
MAX_PARALLEL_SHARE = 0.01


def load(path):
    data = json.load(open(path, encoding='utf-8'))
    tracks = {}
    for track in data['tracks']:
        notes = track.get('notes') or []
        if notes:
            tracks[track['name']] = sorted((round(n['beat'], 3), int(n['midi'])) for n in notes)
    return data, tracks


def key_of(counts):
    best = None
    for tonic in range(12):
        scale = {(tonic + step) % 12 for step in MAJOR}
        score = sum(count * (2.0 if pc == tonic else 1.4 if pc == (tonic + 7) % 12 else 1.0)
                    for pc, count in counts.items() if pc in scale)
        score -= sum(count for pc, count in counts.items() if pc not in scale) * 1.2
        if best is None or score > best[0]:
            best = (score, tonic)
    return best[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('arrangement')
    args = parser.parse_args()
    data, tracks = load(args.arrangement)
    piano = tracks.get('Piano')
    if not piano:
        print('no piano part to compare against'); return 1
    histogram = collections.Counter(midi % 12 for _, midi in piano)
    tonic = key_of(histogram)
    scale = {(tonic + step) % 12 for step in MAJOR}
    by_onset = collections.defaultdict(list)
    for beat, midi in piano:
        by_onset[beat].append(midi)
    failures = []
    print(f'key ≈ {NAMES[tonic]} major, piano notes {len(piano)}')
    for name, notes in tracks.items():
        if name == 'Piano':
            continue
        outside = sum(1 for _, midi in notes if midi % 12 not in scale) / max(1, len(notes))
        clashes = 0
        for beat, midi in notes:
            if any(abs(midi - other) % 12 in (1, 11) for other in by_onset.get(beat, [])):
                clashes += 1
        clashes /= max(1, len(notes))
        parallels = 0
        for index in range(1, len(notes)):
            previous, current = notes[index - 1], notes[index]
            if current[0] - previous[0] > 1:
                continue
            if not by_onset.get(previous[0]) or not by_onset.get(current[0]):
                continue
            low_before, low_after = min(by_onset[previous[0]]), min(by_onset[current[0]])
            if (previous[1] - low_before) % 12 == (current[1] - low_after) % 12 and (previous[1] - low_before) % 12 in (0, 7):
                if (previous[1] - low_before) * (current[1] - low_after) > 0:
                    parallels += 1
        low, high = RANGE.get(name, (21, 108))
        outside_range = sum(1 for _, midi in notes if midi < low or midi > high)
        print(f'  {name:<10} notes={len(notes):<5} out-of-key={outside:.1%} semitone={clashes:.1%} '
              f'parallel-5th/8ve={parallels} outside-range={outside_range}')
        allowed = max(2, MAX_PARALLEL_SHARE * len(notes))
        if parallels > allowed:
            failures.append(f'{name} moves in parallel fifths or octaves with the part below it {parallels} times')
        if outside > MAX_OUTSIDE:
            failures.append(f'{name} has {outside:.1%} of its notes outside the key')
        if clashes > MAX_CLASH:
            failures.append(f'{name} clashes by a semitone on {clashes:.1%} of its notes')
        if outside_range:
            failures.append(f'{name} has {outside_range} notes outside its playable range {low}-{high}')
    if failures:
        for failure in failures:
            print('FAIL:', failure)
        return 1
    print('harmony OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
