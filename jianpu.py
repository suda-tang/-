"""简谱（numbered notation）识别：OCR + 记号检测 → MusicXML。

简谱是数字谱：1–7 表示音级，0 是休止；上面的小圆点是高八度、下面的低八度；
下方的横线（减时线）表示时值减半，横杠 '-' 表示延长一拍，附点 '.' 表示 ×1.5；
小节线 '|' 分隔小节；行首常有 "1=C"（调号）与 "4/4"（拍号）。

流程：
  1) 每页渲染成较高分辨率的灰度图；
  2) rapidocr 负责文字（数字、调号、拍号、歌词、和弦符号）；
  3) cv2 补 OCR 拿不到的图形记号（八度点、减时线、连音线弧）；
  4) 解析成音符事件，输出 MusicXML。

对外只用 recognize(pdf_path, progress=None)。
"""
from __future__ import annotations

import io
import re
from pathlib import Path

SEMITONE = {1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11}
KEY_TONIC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
# (step, alter) for each pitch class
STEP_ALTER = {0: ('C', 0), 1: ('C', 1), 2: ('D', 0), 3: ('D', 1), 4: ('E', 0), 5: ('F', 0),
              6: ('F', 1), 7: ('G', 0), 8: ('G', 1), 9: ('A', 0), 10: ('A', 1), 11: ('B', 0)}
DIVISIONS = 4  # quarter note = 4 divisions
CHORD_RE = re.compile(r'^[A-G](#|b)?(m|maj|min|dim|aug|sus|add)?\d*(/[A-G](#|b)?)?$')
LYRIC_RE = re.compile(r'^[\u3400-\u9fff\u3000-\u303f，。、！？；：·A-Za-z0-9\-—…]+$')

_engine = None


def engine():
    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR
        _engine = RapidOCR()
    return _engine


# --- OCR ------------------------------------------------------------------

def ocr_items(image):
    """Return OCR boxes as {text,x0,x1,y0,y1,cy} in image coordinates."""
    out = engine()(image)
    result = out[0] if isinstance(out, tuple) else out
    items = []
    for row in (result or []):
        try: box, text, score = row[0], row[1], row[2]
        except (TypeError, IndexError): continue
        text = str(text).strip()
        if not text: continue
        xs = [float(p[0]) for p in box]; ys = [float(p[1]) for p in box]
        items.append({'text': text, 'x0': min(xs), 'x1': max(xs), 'y0': min(ys), 'y1': max(ys),
                      'cy': (min(ys) + max(ys)) / 2, 'score': float(score)})
    return items


def group_lines(items, gap_ratio=0.75):
    """Cluster boxes into text lines by vertical centre, then sort left→right."""
    lines = []
    for item in sorted(items, key=lambda i: i['cy']):
        height = max(6.0, item['y1'] - item['y0'])
        for line in lines:
            if abs(item['cy'] - line['cy']) <= max(height, line['height']) * gap_ratio:
                line['items'].append(item)
                total = len(line['items'])
                line['cy'] = (line['cy'] * (total - 1) + item['cy']) / total
                line['height'] = max(line['height'], height)
                break
        else:
            lines.append({'cy': item['cy'], 'height': height, 'items': [item]})
    for line in lines:
        line['items'].sort(key=lambda i: i['x0'])
        line['y0'] = min(i['y0'] for i in line['items'])
        line['y1'] = max(i['y1'] for i in line['items'])
        line['text'] = ''.join(i['text'] for i in line['items'])
    lines.sort(key=lambda l: l['cy'])
    return lines


# --- 记号检测（OCR 读不到的图形符号） --------------------------------------

def _binarize(image):
    import numpy as np
    gray = image if getattr(image, 'ndim', 2) == 2 else image[:, :, :3].mean(axis=2)
    return (gray < 160).astype(np.uint8)


def detect_marks(bw, box):
    """Look above/below a glyph box for octave dots, and below for减时线.

    Returns {'dots_above':n,'dots_below':n,'underlines':n}.
    """
    import numpy as np
    x0, x1 = int(box['x0']), int(box['x1'])
    y0, y1 = int(box['y0']), int(box['y1'])
    width = max(1, x1 - x0); height = max(1, y1 - y0)
    def blobs(region, min_side, max_side, max_fill):
        if region.size == 0: return 0
        count = 0
        visited = np.zeros_like(region, dtype=bool)
        rows, cols = region.shape
        for y in range(rows):
            for x in range(cols):
                if not region[y, x] or visited[y, x]: continue
                stack = [(y, x)]; visited[y, x] = True; cells = []
                while stack:
                    cy, cx = stack.pop(); cells.append((cy, cx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < rows and 0 <= nx < cols and region[ny, nx] and not visited[ny, nx]:
                            visited[ny, nx] = True; stack.append((ny, nx))
                ys = [c[0] for c in cells]; xs = [c[1] for c in cells]
                h = max(ys) - min(ys) + 1; w = max(xs) - min(xs) + 1
                if min_side <= h <= max_side and min_side <= w <= max_side and len(cells) <= max_fill:
                    count += 1
        return count
    # dots sit within ~0.9 glyph height above / below the digit core
    above = bw[max(0, y0 - int(height * 0.95)):max(0, y0 - int(height * 0.06)), max(0, x0 - 2):x1 + 2]
    below = bw[min(bw.shape[0], y1 + int(height * 0.06)):min(bw.shape[0], y1 + int(height * 0.95)), max(0, x0 - 2):x1 + 2]
    dot = max(2, int(height * 0.22))
    marks = {'dots_above': blobs(above, 1, max(2, dot), max_fill=max(6, dot * dot)),
             'dots_below': blobs(below, 1, max(2, dot), max_fill=max(6, dot * dot)),
             'underlines': 0}
    band = bw[min(bw.shape[0], y1 + 1):min(bw.shape[0], y1 + int(height * 0.9)), x0:x1]
    rows = band.sum(1) if band.size else []
    threshold = max(2, int(width * 0.5))
    run = 0
    for value in rows:
        if value >= threshold:
            run += 1
        else:
            if run: marks['underlines'] += 1; run = 0
    if run: marks['underlines'] += 1
    return marks


# --- 解析 -----------------------------------------------------------------

def parse_header(text):
    """1=C 4/4 (and tempo) from a header line."""
    meta = {}
    key = re.search(r'1\s*[=＝]\s*([A-Ga-g0-9])\s*(#|b|♯|♭)?', text)
    if key:
        letter = key.group(1).upper()
        letter = 'C' if letter in ('0', 'O', 'Q') else letter  # OCR 常把 C 读成 0
        if letter in KEY_TONIC:
            meta['tonic'] = KEY_TONIC[letter]
            meta['keyName'] = letter + ('#' if key.group(2) in ('#', '♯') else 'b' if key.group(2) in ('b', '♭') else '')
    time = re.search(r'(\d{1,2})\s*/\s*(\d{1,2})', text)
    if time:
        beats = int(time.group(1)); unit = int(time.group(2))
        if 1 <= beats <= 16 and unit in (1, 2, 4, 8, 16):
            meta['beats'] = beats; meta['beatType'] = unit
    for match in re.finditer(r'[=＝]\s*(\d{2,3})', text):
        value = int(match.group(1))
        if 40 <= value <= 240:
            meta['tempo'] = value; break
    return meta


def _is_header(text):
    if re.search(r'\d\s*[=＝]\s*\S', text): return True
    return bool(re.search(r'\d{1,2}\s*/\s*\d{1,2}', text)) and not _is_melody(text)


def _is_melody(text):
    stripped = re.sub(r'[\s,，.。·、]', '', text)
    if not stripped or '=' in stripped or re.search(r'[A-Za-z]', stripped): return False
    digits = sum(1 for c in stripped if c in '01234567')
    return digits >= 1 and digits >= len(stripped) * 0.6


def parse_melody(line, bw):
    """Turn one melody line into note events (best effort at marks).

    简谱里数字本身不带八度信息：1–7 在基准八度内，跨过 7→1（或 1→7）时
    自然地进/退一个八度。这里用「音阶级进」推算每个音的八度——取离上一个音
    最近、且仍符合该音级的位置，使 12345671 正确落到上行一个八度。显式的高/低
    八度点（dots）则直接定死八度并重置级进基准。
    """
    notes = []
    pending = None  # accidental waiting for the next digit (简谱里写在数字前面)
    pos = None      # running scale position; 1 = base degree 1, 8 = next octave's 1
    for item in line['items']:
        text = re.sub(r'\s+', '', item['text'])
        glyphs = segment_glyphs(bw, item)
        # 小节线 OCR 经常读不出来，这里只保留音符字符，小节线交给 assign_chars 从图像判定。
        chars = [c for c in text if c in '01234567#♯♭b-—–·']
        pairs = assign_chars(chars, glyphs)
        for char, glyph in pairs:
            if char in '-—–':
                if notes and notes[-1]['kind'] == 'note': notes[-1]['duration'] += 1.0
                continue
            if char in '.·':
                if notes: notes[-1]['duration'] *= 1.5; notes[-1]['dotted'] = True
                continue
            if char in '|:':
                notes.append({'kind': 'barline'})
                continue
            if char in '#♯b♭':
                pending = 'sharp' if char in '#♯' else 'flat'
                continue
            if char.isdigit():
                degree = int(char)
                if char == '0':
                    notes.append({'kind': 'rest', 'degree': 0, 'octave': 0,
                                  'duration': 1.0, 'accidental': None, 'lyric': '', 'chord': ''})
                    pending = None
                    continue
                marks = detect_marks(bw, glyph) if glyph else {'dots_above': 0, 'dots_below': 0, 'underlines': 0}
                duration = 1.0
                if marks['underlines'] == 1: duration = 0.5
                elif marks['underlines'] == 2: duration = 0.25
                elif marks['underlines'] >= 3: duration = 0.125
                offset = marks['dots_above'] - marks['dots_below']
                if offset:
                    # 显式八度点：直接定八度，并重置级进基准到该位置。
                    pos = offset * 7 + degree
                elif pos is None:
                    pos = degree
                else:
                    cur = pos
                    # 距上一个音最近、且音级等于当前数字的位置（级进，±6 以内）。
                    candidates = [cur + k for k in range(-6, 7)
                                  if ((cur + k - 1) % 7) + 1 == degree]
                    pos = min(candidates, key=lambda x: abs(x - cur))
                octave = (pos - 1) // 7
                real_degree = ((pos - 1) % 7) + 1
                notes.append({'kind': 'note', 'degree': real_degree, 'octave': octave,
                              'duration': duration, 'accidental': pending, 'lyric': '', 'chord': ''})
                pending = None
                continue
    return notes


def assign_chars(chars, glyphs):
    """Pair recognised characters with segmented glyphs, recovering barlines.

    OCR happily drops the thin vertical bar between measures, but segmentation
    still sees it as an unusually narrow stroke, so the glyphs that have no
    character to match are treated as barlines.
    """
    if not glyphs: return [(c, None) for c in chars]
    widths = [g['x1'] - g['x0'] for g in glyphs]
    order = sorted(range(len(glyphs)), key=lambda i: widths[i])
    median = widths[order[len(order) // 2]]
    extra = len(glyphs) - len(chars)
    barlines = set()
    if extra > 0:
        limit = max(3.0, median * 0.45)
        for index in order:
            if len(barlines) >= extra: break
            if widths[index] <= limit: barlines.add(index)
        # If nothing looked thin enough, fall back to the narrowest ones.
        for index in order:
            if len(barlines) >= extra: break
            barlines.add(index)
    pairs = []; ci = 0
    for gi, glyph in enumerate(glyphs):
        if gi in barlines: pairs.append(('|', glyph)); continue
        pairs.append((chars[ci] if ci < len(chars) else '?', glyph)); ci += 1
    while ci < len(chars): pairs.append((chars[ci], None)); ci += 1
    return pairs


def segment_glyphs(bw, item):
    """Split a text box into per-character boxes via vertical projection."""
    import numpy as np
    x0, x1 = max(0, int(item['x0'])), int(item['x1'])
    y0, y1 = max(0, int(item['y0'])), int(item['y1'])
    band = bw[y0:y1 + 1, x0:x1 + 1]
    if band.size == 0: return []
    cols = band.sum(0)
    boxes = []; start = None
    for x, value in enumerate(cols):
        if value and start is None: start = x
        elif not value and start is not None:
            boxes.append((start, x)); start = None
    if start is not None: boxes.append((start, len(cols)))
    merged = []
    for a, b in boxes:
        if merged and a - merged[-1][1] <= max(1, (y1 - y0) * 0.12): merged[-1] = (merged[-1][0], b)
        else: merged.append((a, b))
    return [{'x0': x0 + a, 'x1': x0 + b, 'y0': y0, 'y1': y1} for a, b in merged]


# --- MusicXML --------------------------------------------------------------

def _pitch(degree, octave, tonic, accidental):
    semitone = (tonic + SEMITONE.get(degree, 0)) % 12
    # 简谱的 1 默认在中央 C 所在八度；octave 为八度点的偏移
    base = 4 + octave
    step, alter = STEP_ALTER[semitone]
    if accidental == 'sharp': alter = alter + 1
    elif accidental == 'flat': alter = alter - 1
    return step, alter, base


def _note_xml(event, measure_open):
    if event['kind'] == 'rest':
        return '<note><rest/><duration>%d</duration><type>%s</type></note>' % (
            int(event['duration'] * DIVISIONS), _type_name(event['duration']))
    step, alter, octave = event['pitch']
    accidental = {1: '<accidental>sharp</accidental>', -1: '<accidental>flat</accidental>'}.get(alter, '')
    lyric = '<lyric number="1"><text>%s</text></lyric>' % _escape(event['lyric']) if event.get('lyric') else ''
    chord = event.get('chord', '')
    harmony = ('<harmony><root><root-step>%s</root-step></root><kind>major</kind></harmony>' % chord) if chord else ''
    return '%s<note><pitch><step>%s</step>%s<octave>%d</octave></pitch><duration>%d</duration><type>%s</type>%s%s</note>' % (
        harmony, step, '<alter>%d</alter>' % alter if alter else '', octave,
        int(event['duration'] * DIVISIONS), _type_name(event['duration']), accidental, lyric)


def _type_name(beats):
    table = {4.0: 'whole', 3.0: 'half', 2.0: 'half', 1.5: 'quarter', 1.0: 'quarter',
             0.75: 'eighth', 0.5: 'eighth', 0.375: '16th', 0.25: '16th', 0.125: '32nd'}
    return table.get(round(beats, 3), 'quarter')


def _escape(text):
    return (str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def musicxml(events, meta, title='简谱识别结果'):
    beats = meta.get('beats', 4); beat_type = meta.get('beatType', 4)
    tonic = meta.get('tonic', 0)
    key_name = meta.get('keyName', 'C')
    measures = [[]]
    for event in events:
        if event['kind'] == 'barline':
            if measures[-1]: measures.append([])
            continue
        if event['kind'] == 'note':
            event['pitch'] = _pitch(event['degree'], event['octave'], tonic, event.get('accidental'))
        measures[-1].append(event)
    measures = [m for m in measures if m] or [[]]
    body = []
    for index, measure in enumerate(measures):
        parts = []
        if index == 0:
            parts.append('<attributes><divisions>%d</divisions><key><fifths>%d</fifths></key>'
                         '<time><beats>%d</beats><beat-type>%d</beat-type></time>'
                         '<clef><sign>G</sign><line>2</line></clef></attributes>'
                         % (DIVISIONS, _fifths(key_name), beats, beat_type))
        for event in measure:
            parts.append(_note_xml(event, index == 0))
        body.append('<measure number="%d">%s</measure>' % (index + 1, ''.join(parts)))
    head = ('<?xml version="1.0" encoding="utf-8"?>'
            '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" '
            '"http://www.musicxml.org/dtds/partwise.dtd">'
            '<score-partwise version="4.0"><movement-title>%s</movement-title>'
            '<part-list><score-part id="P1"><part-name>简谱旋律</part-name>'
            '<score-instrument id="I1"><instrument-name>Piano</instrument-name></score-instrument>'
            '<midi-instrument id="I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument>'
            '</score-part></part-list><part id="P1">%s</part></score-partwise>'
            % (_escape(title), ''.join(body)))
    return head


def _fifths(key_name):
    return {'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'F': -1, 'Bb': -2,
            'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6}.get(key_name, 0)


# --- 对外的整页识别 ---------------------------------------------------------

def _render_pages(pdf_path, target=2200):
    import fitz, numpy as np
    pages = []
    with fitz.open(pdf_path) as doc:
        for page in doc:
            zoom = max(4.0, min(14.0, target / max(1.0, max(page.rect.width, page.rect.height))))
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY, alpha=False)
            pages.append(np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width))
    return pages


def recognize(pdf_path, progress=None, title='简谱识别结果'):
    """Recognise a numbered-notation PDF into MusicXML."""
    pages = _render_pages(pdf_path)
    meta = {}
    events = []
    lyrics_pending = []
    for index, image in enumerate(pages):
        if progress: progress(int((index) / max(1, len(pages)) * 100), '简谱识别第 %d / %d 页' % (index + 1, len(pages)))
        bw = _binarize(image)
        items = ocr_items(image)
        lines = group_lines(items)
        header_done = bool(meta)
        for position, line in enumerate(lines):
            if not header_done and _is_header(line['text']):
                meta.update(parse_header(line['text'])); header_done = True
                continue
            if _is_melody(line['text']):
                notes = parse_melody(line, bw)
                # lyrics sit directly beneath the melody line
                lyric_line = next((l for l in lines[position + 1:position + 3]
                                   if l['y0'] > line['y1'] and _is_lyric(l['text'])), None)
                if lyric_line:
                    syllables = [c for c in re.sub(r'\s+', '', lyric_line['text']) if c not in '|']
                    note_index = [i for i, n in enumerate(notes) if n['kind'] == 'note']
                    for slot, note_pos in enumerate(note_index):
                        if slot < len(syllables): notes[note_pos]['lyric'] = syllables[slot]
                chord_line = next((l for l in reversed(lines[:position])
                                   if l['y1'] < line['y0'] and _is_chords(l['text'])), None)
                if chord_line:
                    symbols = re.split(r'\s+', chord_line['text'].strip())
                    symbols = [s for s in symbols if CHORD_RE.match(s)]
                    note_index = [i for i, n in enumerate(notes) if n['kind'] == 'note']
                    for slot, note_pos in enumerate(note_index):
                        if slot < len(symbols): notes[note_pos]['chord'] = symbols[slot]
                events.extend(notes)
            elif _is_lyric(line['text']) and line['text'] not in lyrics_pending:
                lyrics_pending.append(line['text'])
        if not meta:
            meta.update(parse_header(' '.join(l['text'] for l in lines[:2])))
    meta.setdefault('beats', 4); meta.setdefault('beatType', 4); meta.setdefault('tonic', 0)
    if progress: progress(95, '生成乐谱')
    xml = musicxml(events, meta, title)
    return {'xml': xml, 'meta': {**meta, 'notationType': 'numbered', 'noteCount': sum(1 for e in events if e['kind'] == 'note')}}


def _is_lyric(text):
    stripped = re.sub(r'\s+', '', text)
    if len(stripped) < 2: return False
    if any(c in '01234567|' for c in stripped): return False
    return bool(LYRIC_RE.match(stripped))


def _is_chords(text):
    tokens = [t for t in re.split(r'\s+', text.strip()) if t]
    if not tokens: return False
    return sum(1 for t in tokens if CHORD_RE.match(t)) >= max(1, len(tokens) // 2)
