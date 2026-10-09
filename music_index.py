"""Library-wide music-theory index: instrumentation + chord qualities.

Why this exists
---------------
The cloud library only stores a title and an artist. That is why the model
could never answer "find songs with a violin" or "find songs that use a
diminished-7th chord" -- it had nothing to search, and ended up either
refusing honestly or *inventing* a song list.

This module actually reads every score's MusicXML once and records two facts
per score:

  * instruments -- normalised part names (from <part-list><part-name>)
  * chords      -- chord qualities found at simultaneous-note onsets,
                   matched against standard tertian templates

Facts are cached per score under .sites-runtime/theory-cache/<id>.json and
keyed by the score file's mtime, so a rebuild only re-reads what changed.
The inverted index (instrument -> ids, chord -> ids) is assembled from that
cache, so answering a query is a dictionary lookup.

Nothing here writes to the score itself.
"""
import json
import re
import time
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / '.sites-runtime' / 'score-cache'
STORE = ROOT / '.sites-runtime' / 'theory-cache'
VERSION = 1

# ── instrument normalisation ────────────────────────────────────────────────
# Order matters: the narrower family must be tested before its parent
# (小提琴/中提琴/大提琴/低音提琴 before 弦乐; 电钢琴/古钢琴 before 钢琴).
INSTRUMENT_RULES = (
    ('小提琴', r'小提琴|violin'),
    ('中提琴', r'中提琴|viola(?!\s*bass)'),
    ('大提琴', r'大提琴|cello'),
    ('低音提琴', r'低音提琴|contrabass|double\s*bass'),
    ('弦乐', r'弦乐|string'),
    ('电钢琴', r'电钢琴|electric\s*piano'),
    ('古钢琴', r'古钢琴|clavichord'),
    ('钢琴', r'钢琴|piano|pianoforte'),
    ('竖琴', r'竖琴|harp'),
    ('管风琴', r'管风琴|organ'),
    ('羽管键琴', r'羽管键琴|harpsichord'),
    ('吉他', r'吉他|guitar'),
    ('贝司', r'贝司|贝斯|bass(?!\s*oon)'),
    ('长笛', r'长笛|flute|笛类'),
    ('短笛', r'短笛|piccolo'),
    ('双簧管', r'双簧管|oboe'),
    ('单簧管', r'单簧管|clarinet'),
    ('巴松', r'巴松|大管|bassoon'),
    ('萨克斯', r'萨克斯|sax'),
    ('小号', r'小号|trumpet'),
    ('长号', r'长号|trombone'),
    ('圆号', r'圆号|french\s*horn|horn'),
    ('大号', r'大号|tuba'),
    ('木管', r'木管'),
    ('铜管', r'铜管'),
    ('人声', r'人声|vocal|choir|合唱'),
    ('鼓组', r'鼓|drum|percussion'),
    ('钟琴', r'钟琴|glockenspiel'),
    ('管钟', r'管钟|tubular'),
    ('钢片琴', r'钢片琴|celesta'),
    ('合成器', r'合成|synth'),
)

# ── chord templates (pitch-class sets, checked against every rotation) ──────
CHORD_TEMPLATES = (
    ('dim7', (0, 3, 6, 9)),
    ('dom7', (0, 4, 7, 10)),
    ('min7', (0, 3, 7, 10)),
    ('maj7', (0, 4, 7, 11)),
    ('half-dim7', (0, 3, 6, 10)),
    ('dim', (0, 3, 6)),
    ('aug', (0, 4, 8)),
    ('min', (0, 3, 7)),
    ('maj', (0, 4, 7)),
)

CHORD_ALIASES = {
    '减七': 'dim7', '减七和弦': 'dim7', 'dim7': 'dim7', 'diminished7': 'dim7',
    '属七': 'dom7', '属七和弦': 'dom7', 'dom7': 'dom7', '大小七': 'dom7',
    '小七': 'min7', '小七和弦': 'min7', 'min7': 'min7',
    '大七': 'maj7', '大七和弦': 'maj7', 'maj7': 'maj7',
    '半减七': 'half-dim7', '减小七': 'half-dim7',
    '减三': 'dim', '减三和弦': 'dim', '减和弦': 'dim', 'dim': 'dim',
    '增三': 'aug', '增三和弦': 'aug', 'aug': 'aug',
    '小三': 'min', '小三和弦': 'min',
    '大三': 'maj', '大三和弦': 'maj',
}


def _num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_instrument(name):
    text = str(name or '').strip()
    if not text:
        return None
    for label, pattern in INSTRUMENT_RULES:
        if re.search(pattern, text, re.I):
            return label
    return None


def chord_of(pitch_classes):
    """Return a chord-quality label for a set of pitch classes, or None.

    Only simultaneous groups are tested, so a melodic run (one note per onset)
    never yields a chord. Every rotation is tried so inversions count.
    """
    pcs = {int(p) % 12 for p in pitch_classes}
    if len(pcs) < 3:
        return None
    for label, tpl in CHORD_TEMPLATES:
        if len(pcs) != len(tpl):
            continue
        want = set(tpl)
        for root in pcs:
            if {(p - root) % 12 for p in pcs} == want:
                return label
    return None


def analyze_xml(xml):
    """Extract {'instruments': [...], 'chords': [...]} from one MusicXML string."""
    if not xml or '<part' not in xml:
        return {'instruments': [], 'chords': []}
    root = ET.fromstring(xml)
    for node in root.iter():
        node.tag = node.tag.rsplit('}', 1)[-1]
    instruments = set()
    for p in root.findall('part-list/score-part'):
        label = normalize_instrument(p.findtext('part-name', ''))
        if label:
            instruments.add(label)
    chords = set()
    for part in root.findall('part'):
        divisions = 1.0
        for measure in part.findall('measure'):
            attrs = measure.find('attributes')
            if attrs is not None:
                raw = attrs.findtext('divisions')
                if raw is not None and _num(raw) > 0:
                    divisions = _num(raw)
            cursor = 0.0
            last = 0.0
            groups = {}
            for node in measure:
                if node.tag == 'backup':
                    cursor -= _num(node.findtext('duration')) / divisions
                    continue
                if node.tag == 'forward':
                    cursor += _num(node.findtext('duration')) / divisions
                    continue
                if node.tag != 'note' or node.find('grace') is not None:
                    continue
                duration = _num(node.findtext('duration')) / divisions
                if node.find('chord') is not None:
                    start = last
                else:
                    start = cursor
                    last = start
                    cursor += duration
                if node.find('rest') is not None:
                    continue
                pitch = node.find('pitch')
                if pitch is None:
                    continue
                midi = (12 * (int(_num(pitch.findtext('octave'), 4)) + 1)
                        + {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}.get(pitch.findtext('step'), 0)
                        + _num(pitch.findtext('alter')))
                groups.setdefault(round(start, 4), set()).add(int(midi) % 12)
            for pcs in groups.values():
                quality = chord_of(pcs)
                if quality:
                    chords.add(quality)
    return {'instruments': sorted(instruments), 'chords': sorted(chords)}


# ── per-score cache ─────────────────────────────────────────────────────────
def _score_files():
    if not CACHE.exists():
        return []
    return [p for p in CACHE.glob('*.json')
            if not p.name.endswith('.metadata.json') and not p.name.endswith('.photo-book.json')]


def _stamp(path):
    try:
        s = path.stat()
        return [s.st_mtime_ns, s.st_size]
    except OSError:
        return None


def facts_for(path, use_cache=True):
    """Return cached facts for one score file, computing them if needed."""
    ident = path.stem
    dest = STORE / (ident + '.json')
    stamp = _stamp(path)
    if use_cache:
        try:
            cached = json.loads(dest.read_text(encoding='utf-8'))
            if cached.get('version') == VERSION and cached.get('stamp') == stamp:
                return cached['facts']
        except (OSError, ValueError, KeyError):
            pass
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        facts = analyze_xml(data.get('xml') or '')
    except (OSError, ValueError, ET.ParseError):
        facts = {'instruments': [], 'chords': []}
    STORE.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix('.tmp')
    try:
        tmp.write_text(json.dumps({'version': VERSION, 'stamp': stamp, 'facts': facts}, ensure_ascii=False),
                       encoding='utf-8')
        tmp.replace(dest)
    except OSError:
        pass
    return facts


def build_all(progress=lambda text: None, force=False):
    """Compute facts for every score and return the assembled index."""
    files = _score_files()
    total = len(files)
    instruments = defaultdict(list)
    chords = defaultdict(list)
    covered = 0
    for i, path in enumerate(files, 1):
        facts = facts_for(path, use_cache=not force)
        if facts['instruments'] or facts['chords']:
            covered += 1
        for label in facts['instruments']:
            instruments[label].append(path.stem)
        for quality in facts['chords']:
            chords[quality].append(path.stem)
        if total and (i % 200 == 0 or i == total):
            progress(f'正在建立全库乐理索引… {i}/{total}')
    return {
        'builtAt': time.time(),
        'scores': total,
        'covered': covered,
        'cached': len(list(STORE.glob('*.json'))) if STORE.exists() else 0,
        'building': False,
        'instruments': {k: sorted(set(v)) for k, v in sorted(instruments.items())},
        'chords': {k: sorted(set(v)) for k, v in sorted(chords.items())},
    }


_INDEX_CACHE = {'at': 0.0, 'index': None}
_INDEX_TTL = 60.0


INDEX_PATH = ROOT / '.sites-runtime' / 'theory-index.json'


def _scan_cache():
    """Assemble the index by reading every per-score fact file.

    SLOW on Windows (~90 s for ~3000 files) -- only used when the pre-built
    theory-index.json is missing. Normal reads go through load_index, which
    prefers that file.
    """
    files = _score_files()
    total = len(files)
    instruments = defaultdict(set)
    chords = defaultdict(set)
    covered = 0
    cached = 0
    if STORE.exists():
        for p in STORE.glob('*.json'):
            try:
                data = json.loads(p.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                continue
            cached += 1
            facts = data.get('facts') or {}
            if facts.get('instruments') or facts.get('chords'):
                covered += 1
            for label in facts.get('instruments', []):
                instruments[label].add(p.stem)
            for quality in facts.get('chords', []):
                chords[quality].add(p.stem)
    return {
        'builtAt': time.time(),
        'scores': total,
        'covered': covered,
        'cached': cached,
        'building': cached < total,
        'instruments': {k: sorted(v) for k, v in sorted(instruments.items())},
        'chords': {k: sorted(v) for k, v in sorted(chords.items())},
    }


def load_index(max_age=_INDEX_TTL):
    """Return the inverted index. FAST and NON-BLOCKING.

    Prefers the pre-built theory-index.json (one file read). Only if that is
    missing does it fall back to scanning the per-score cache -- and even then
    it never parses MusicXML, so a query can never hang.
    """
    now = time.time()
    if _INDEX_CACHE['index'] is not None and now - _INDEX_CACHE['at'] < max_age:
        return _INDEX_CACHE['index']
    index = None
    try:
        index = json.loads(INDEX_PATH.read_text(encoding='utf-8'))
        index.setdefault('building', False)
    except (OSError, ValueError):
        index = None
    if index is None:
        index = _scan_cache()
        try:
            INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False), encoding='utf-8')
        except OSError:
            pass
    _INDEX_CACHE['at'] = now
    _INDEX_CACHE['index'] = index
    return index


def resolve_instrument(text):
    """Map a user phrase to a normalised instrument label (or None)."""
    for label, pattern in INSTRUMENT_RULES:
        if re.search(pattern, str(text or ''), re.I):
            return label
    return None


def resolve_chord(text):
    """Map a user phrase to a chord-quality label (or None)."""
    text = str(text or '')
    for alias, label in CHORD_ALIASES.items():
        if alias in text:
            return label
    return None
