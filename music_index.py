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


# ── 时期（作曲家在曲名里，例如 "BWV 1043 - 巴赫"）────────────────────────────
# ★ 这是**作曲家人名到时期的映射**，不是作品本身的历史考证：曲库只有标题+作曲家，
#   所以"巴洛克时期的曲子"只能按作曲家归类。回复里会写明这一点。
PERIODS = {
    '巴洛克': ('巴赫', '维瓦尔第', '亨德尔', '科雷利', '泰勒曼', '斯卡拉蒂', '珀塞尔', '普赛尔',
              '拉莫', '阿尔比诺尼', '帕赫贝尔', '库普兰', '塔蒂尼', '博凯里尼', '加布里埃利',
              '蒙特威尔第', '吕利', 'buxtehude', 'bach', 'vivaldi', 'handel', 'corelli',
              'telemann', 'scarlatti', 'purcell', 'rameau', 'albinoni', 'pachelbel'),
    '古典': ('莫扎特', '海顿', '贝多芬', '克莱门蒂', '胡梅尔', '库劳', '迪亚贝利',
            'mozart', 'haydn', 'beethoven', 'clementi'),
    '浪漫': ('肖邦', '李斯特', '勃拉姆斯', '柴可夫斯基', '舒曼', '舒伯特', '门德尔松', '瓦格纳',
            '柏辽兹', '格里格', '德沃夏克', '拉赫玛尼诺夫', '圣桑', '圣-桑', '比才', '威尔第',
            '普契尼', '弗兰克', '福雷', '萨拉萨蒂', '帕格尼尼', '布鲁赫', '埃尔加', '马勒',
            '理查·施特劳斯', '施特劳斯', '奥芬巴赫', '罗西尼', '多尼采蒂', '贝利尼', '斯美塔那',
            '西贝柳斯', '柴科夫斯基', 'chopin', 'liszt', 'brahms', 'tchaikovsky', 'schumann',
            'schubert', 'mendelssohn', 'wagner', 'berlioz', 'grieg', 'dvorak', 'rachmaninoff'),
    '印象': ('德彪西', '拉威尔', '萨蒂', 'debussy', 'ravel', 'satie'),
    '现代': ('普罗科菲耶夫', '肖斯塔科维奇', '斯特拉文斯基', '巴托克', '欣德米特', '勋伯格',
            '贝尔格', '韦伯恩', '梅西安', '布里顿', '科普兰', '格什温', '拉赫玛尼诺夫',
            'prokofiev', 'shostakovich', 'stravinsky', 'bartok', 'britten', 'copland',
            'gershwin', 'messiaen'),
}


def resolve_period(text):
    """把「巴洛克 / 古典时期 / 浪漫主义」等说法映射到时期标签，返回 (period, 别名)。"""
    text = str(text or '')
    aliases = {
        '巴洛克': '巴洛克', '巴罗克': '巴洛克',
        '古典时期': '古典', '古典主义': '古典', '维也纳古典': '古典',
        '浪漫主义': '浪漫', '浪漫时期': '浪漫', '浪漫乐派': '浪漫', '晚期浪漫': '浪漫',
        '印象主义': '印象', '印象派': '印象',
        '现代乐派': '现代', '二十世纪': '现代', '20世纪': '现代', '现代主义': '现代',
    }
    for alias, period in aliases.items():
        if alias in text:
            return period, alias
    return None, None


def title_in_period(title, period):
    """标题里的作曲家是否属于该时期。"""
    names = PERIODS.get(period)
    if not names:
        return False
    low = str(title or '').lower()
    return any(name.lower() in low for name in names)


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


def resolve_instruments(text):
    """句子里提到的**所有**乐器标签（去重、保持规则表顺序）。

    用于「小提琴和钢琴合奏」这类**多声部**要求（两个都要有）。
    """
    text = str(text or '')
    out = []
    for label, pattern in INSTRUMENT_RULES:
        if label not in out and re.search(pattern, text, re.I):
            out.append(label)
    return out


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


def song_notes(facts):
    """整首曲子的音符总数。"""
    return sum(int(p.get('notes') or 0) for p in _parts_of(facts))


def match_song(facts, spec, title=''):
    """True if one score's facts satisfy the structured filters in spec."""
    inst = spec.get('instrument')
    # ★ 多乐器：「小提琴和钢琴合奏」= 两个声部**都要有**
    need = list(spec.get('instruments') or [])
    if need:
        labels = {p.get('label') for p in _parts_of(facts)}
        if not all(x in labels for x in need):
            return False
    # ★ 时期：按标题里的**作曲家**归类（曲库没有别的时期信息）
    period = spec.get('period')
    if period and not title_in_period(title, period):
        return False
    part = spec.get('part') or inst
    qualities = list(spec.get('qualities') or ([spec['chord']] if spec.get('chord') else []))
    min_parts = spec.get('minParts')
    measure = spec.get('measure')
    only = spec.get('only')            # 只要这一个声部（独奏）
    parts = _parts_of(facts)
    # 排序类查询要求有真实谱面数据：库里有 0 小节的空/测试条目，会把"最短"霸占掉
    if spec.get('sort') == 'measures' and not (facts.get('measureCount') or 0):
        return False
    if spec.get('sort') == 'notes' and not song_notes(facts):
        return False
    # 排除项（「没有弦乐的曲子」「不含减七和弦的曲子」）
    exinst = spec.get('excludeInstrument')
    if exinst and any(p.get('label') == exinst for p in parts):
        return False
    exq = list(spec.get('excludeQualities') or [])
    if exq:
        counts = facts.get('chordCounts') or {}
        if any(counts.get(q) for q in exq):
            return False
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


def run_query(index, spec, allowed=None, title_of=None):
    """Execute a structured query. Returns (ids, description-fragment).

    ★ allowed：只在这些 id 里找（曲库真实曲目）。必须在**排序/取前 N 之前**过滤 ——
      索引里含缓存变体条目（id 形如 `<digest>.bounds-v6-1`），不在曲库里；先排序取
      前 1 再过滤，会把真正的答案滤掉，变成"没有找到"。
    """
    op = str(spec.get('op') or 'find')
    songs = index.get('songs') or {}
    if allowed is not None:
        allow = {str(x) for x in allowed}
        songs = {k: v for k, v in songs.items() if k in allow}
    if op == 'top_chord':
        sid = str(spec.get('id') or '')
        facts = songs.get(sid) or {}
        counts = facts.get('chordCounts') or {}
        if not counts:
            return [], '这首曲子的谱面里没有识别出成型的和弦'
        top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
        desc = '、'.join('%s（%d 次）' % (CHORD_LABEL.get(q, q), c) for q, c in top)
        return [sid], '出现最多的和弦是：' + desc
    titles = title_of or {}
    ids = [sid for sid, facts in songs.items() if match_song(facts, spec, titles.get(sid, ''))]
    sort = spec.get('sort')
    desc = bool(spec.get('desc'))
    if sort == 'measures':
        ids.sort(key=lambda s: (songs[s].get('measureCount') or 0), reverse=desc)
    elif sort == 'notes':
        ids.sort(key=lambda s: song_notes(songs[s]), reverse=desc)
    else:
        ids.sort()
    limit = spec.get('limit')
    if limit:
        try:
            ids = ids[:max(1, int(limit))]
        except (TypeError, ValueError):
            pass
    return ids, ''


# 中文名（给回复用；和 ai_workspace 里的 _CHORD_LABEL 保持同一套口径）
CHORD_LABEL = {
    'dim7': '减七和弦', 'dom7': '属七和弦', 'min7': '小七和弦', 'maj7': '大七和弦',
    'half-dim7': '半减七和弦', 'dim': '减三和弦', 'aug': '增三和弦',
    'min': '小三和弦', 'maj': '大三和弦',
}


def chord_label(quality):
    return CHORD_LABEL.get(quality, quality)
