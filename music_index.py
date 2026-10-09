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
VERSION = 3   # v3 adds parts(first measure/notes) + chord counts -- old caches re-read

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


# ── mood / colour words -> chord qualities ─────────────────────────────────
# 「阴冷」「明亮」是**听觉色彩词**，落到具体和声上就是减三/减七/半减七/增三（不协和、
# 张力大）或大三/大七（明亮）。回复里会写明"把 X 理解为哪些和弦"，免得用户以为
# AI 真能"听"出情绪 —— 它只是把色彩词映射到和弦类型再检索。
COLOR_MAP = (
    ('阴冷', ('dim7', 'half-dim7', 'dim', 'aug')),
    ('阴暗', ('dim7', 'half-dim7', 'dim', 'aug')),
    ('阴沉', ('dim7', 'half-dim7', 'dim', 'aug')),
    ('冷色调', ('dim7', 'half-dim7', 'dim', 'aug')),
    ('清冷', ('dim7', 'half-dim7', 'dim', 'aug')),
    ('不协和', ('dim7', 'dim', 'aug', 'half-dim7')),
    ('张力', ('dim7', 'dom7', 'aug', 'half-dim7')),
    ('忧郁', ('min', 'min7', 'dim', 'half-dim7')),
    ('悲伤', ('min', 'min7', 'dim', 'half-dim7')),
    ('暗淡', ('min', 'min7', 'dim', 'half-dim7')),
    ('黯淡', ('min', 'min7', 'dim', 'half-dim7')),
    ('明亮', ('maj', 'maj7')),
    ('温暖', ('maj', 'maj7', 'min7')),
)


def resolve_color(text):
    """Return (word, qualities) for a colour/mood word, or (None, ())."""
    text = str(text or '')
    for word, qualities in COLOR_MAP:
        if word in text:
            return word, qualities
    return None, ()


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
    """Extract per-score facts from one MusicXML string.

    Returns:
      instruments : [label]            normalised part names
      chords      : [quality]          qualities anywhere in the score
      by_part     : {label: [quality]} qualities **within that part only**

    ``by_part`` is what makes "which pieces have a *violin* part with a
    dark/diminished colour" answerable -- the colour has to belong to the
    named instrument, not merely to the piece as a whole.
    """
    empty = {'instruments': [], 'chords': [], 'by_part': {}, 'parts': [],
             'chordCounts': {}, 'partChordCounts': {}, 'measureCount': 0}
    if not xml or '<part' not in xml:
        return empty
    root = ET.fromstring(xml)
    for node in root.iter():
        node.tag = node.tag.rsplit('}', 1)[-1]
    names = {p.get('id'): p.findtext('part-name', '') for p in root.findall('part-list/score-part')}
    instruments = set()
    for value in names.values():
        label = normalize_instrument(value)
        if label:
            instruments.add(label)
    chords = set()
    by_part = {}
    parts = []
    chord_counts = defaultdict(int)
    part_chord_counts = {}
    measure_count = 0
    for part in root.findall('part'):
        pid = part.get('id')
        raw_name = (names.get(pid, '') or '').strip()
        label = normalize_instrument(raw_name) or raw_name or str(pid or '')
        divisions = 1.0
        part_chords = defaultdict(int)
        first = None
        last = None
        notes = 0
        part_measures = part.findall('measure')
        measure_count = max(measure_count, len(part_measures))
        for index, measure in enumerate(part_measures, 1):
            attrs = measure.find('attributes')
            if attrs is not None:
                raw = attrs.findtext('divisions')
                if raw is not None and _num(raw) > 0:
                    divisions = _num(raw)
            cursor = 0.0
            last_start = 0.0
            groups = {}
            sounded = False
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
                    start = last_start
                else:
                    start = cursor
                    last_start = start
                    cursor += duration
                if node.find('rest') is not None:
                    continue
                pitch = node.find('pitch')
                if pitch is None:
                    continue
                sounded = True
                notes += 1
                midi = (12 * (int(_num(pitch.findtext('octave'), 4)) + 1)
                        + {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}.get(pitch.findtext('step'), 0)
                        + _num(pitch.findtext('alter')))
                groups.setdefault(round(start, 4), set()).add(int(midi) % 12)
            if sounded:
                if first is None:
                    first = index
                last = index
            for pcs in groups.values():
                quality = chord_of(pcs)
                if quality:
                    part_chords[quality] += 1
                    chord_counts[quality] += 1
                    chords.add(quality)
        parts.append({'label': label, 'name': raw_name, 'first': first, 'last': last, 'notes': notes})
        if part_chords:
            part_chord_counts[label] = dict(part_chords)
            by_part[label] = sorted(part_chords)
    return {'instruments': sorted(instruments), 'chords': sorted(chords), 'by_part': by_part,
            'parts': parts, 'chordCounts': dict(chord_counts),
            'partChordCounts': part_chord_counts, 'measureCount': measure_count}


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
    part_chords = defaultdict(lambda: defaultdict(list))
    songs = {}
    covered = 0
    for i, path in enumerate(files, 1):
        facts = facts_for(path, use_cache=not force)
        if facts['instruments'] or facts['chords']:
            covered += 1
        for label in facts['instruments']:
            instruments[label].append(path.stem)
        for quality in facts['chords']:
            chords[quality].append(path.stem)
        for label, qualities in (facts.get('by_part') or {}).items():
            for quality in qualities:
                part_chords[label][quality].append(path.stem)
        songs[path.stem] = {
            'parts': facts.get('parts') or [],
            'chordCounts': facts.get('chordCounts') or {},
            'partChordCounts': facts.get('partChordCounts') or {},
            'measureCount': facts.get('measureCount') or 0,
        }
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
        'partChords': {label: {q: sorted(set(v)) for q, v in sorted(qualities.items())}
                       for label, qualities in sorted(part_chords.items())},
        'songs': songs,
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
    part_chords = defaultdict(lambda: defaultdict(set))
    songs = {}
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
            for label, qualities in (facts.get('by_part') or {}).items():
                for quality in qualities:
                    part_chords[label][quality].add(p.stem)
            songs[p.stem] = {
                'parts': facts.get('parts') or [],
                'chordCounts': facts.get('chordCounts') or {},
                'partChordCounts': facts.get('partChordCounts') or {},
                'measureCount': facts.get('measureCount') or 0,
            }
    return {
        'builtAt': time.time(),
        'scores': total,
        'covered': covered,
        'cached': cached,
        'building': cached < total,
        'instruments': {k: sorted(v) for k, v in sorted(instruments.items())},
        'chords': {k: sorted(v) for k, v in sorted(chords.items())},
        'partChords': {label: {q: sorted(v) for q, v in sorted(qualities.items())}
                       for label, qualities in sorted(part_chords.items())},
        'songs': songs,
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


# ── generic query engine ────────────────────────────────────────────────────
# 把「问题」变成一份**结构化查询**（op + 过滤条件），再对事实库求值。
# 这样新增一种问法只需要多解析一个字段，不必再为每句话写一条正则。
#
# 支持的 op：
#   find       按条件筛曲目（instrument / part / chord / qualities / minParts / measure）
#   top_chord  某首曲子里出现次数最多的和弦（scope=current 用当前曲目）
QUERY_OPS = ('find', 'top_chord')


def _parts_of(facts):
    return facts.get('parts') or []


def match_song(facts, spec):
    """True if one score's facts satisfy the structured filters in spec."""
    inst = spec.get('instrument')
    part = spec.get('part') or inst
    qualities = list(spec.get('qualities') or ([spec['chord']] if spec.get('chord') else []))
    min_parts = spec.get('minParts')
    measure = spec.get('measure')
    only = spec.get('only')            # 只要这一个声部（独奏）
    parts = _parts_of(facts)
    if inst and not any(p.get('label') == inst for p in parts):
        return False
    if min_parts is not None:
        target = part or inst
        if sum(1 for p in parts if p.get('label') == target) < int(min_parts):
            return False
    if measure is not None:
        target = part or inst
        if not any(p.get('label') == target and p.get('first') == int(measure) for p in parts):
            return False
    if only and len([p for p in parts if p.get('label') != '全部乐器']) > 1:
        return False
    if qualities:
        if part:
            table = (facts.get('partChordCounts') or {}).get(part) or {}
        else:
            table = facts.get('chordCounts') or {}
        if not any(table.get(q) for q in qualities):
            return False
    return True


def run_query(index, spec):
    """Execute a structured query. Returns (ids, description-fragment)."""
    op = str(spec.get('op') or 'find')
    songs = index.get('songs') or {}
    if op == 'top_chord':
        sid = str(spec.get('id') or '')
        facts = songs.get(sid) or {}
        counts = facts.get('chordCounts') or {}
        if not counts:
            return [], '这首曲子的谱面里没有识别出成型的和弦'
        top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
        desc = '、'.join('%s（%d 次）' % (CHORD_LABEL.get(q, q), c) for q, c in top)
        return [sid], '出现最多的和弦是：' + desc
    ids = [sid for sid, facts in songs.items() if match_song(facts, spec)]
    return sorted(ids), ''


# 中文名（给回复用；和 ai_workspace 里的 _CHORD_LABEL 保持同一套口径）
CHORD_LABEL = {
    'dim7': '减七和弦', 'dom7': '属七和弦', 'min7': '小七和弦', 'maj7': '大七和弦',
    'half-dim7': '半减七和弦', 'dim': '减三和弦', 'aug': '增三和弦',
    'min': '小三和弦', 'maj': '大三和弦',
}


def chord_label(quality):
    return CHORD_LABEL.get(quality, quality)
