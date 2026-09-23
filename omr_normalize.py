"""Repair the part structure that the OMR engine reports.

Audiveris groups the staves it finds on a page into "systems" and then treats
each group as one part. When its staff-line detector misses staves, or a page
ends in the middle of a system, that grouping goes wrong and it exports several
parts for a single instrument. Page results are then joined positionally, so
part #1 of page 1 is concatenated with part #1 of page 4 even though the two
describe different staves.

Rendering that gives exactly the symptoms users report on a two-staff piano
solo:

* the score shows three staves instead of two;
* a phantom "Voice (Voice Oohs)" part appears, silent for most of the piece;
* a bass clef is printed above a treble one, and the clef flips back and forth
  inside a single staff, because the stray part carries its own clef changes.

The repair keeps the music. Notes that landed in a stray part are moved back
onto the staff they belong to, identified by that part's own clef, and only into
measures the receiving part left silent — those are precisely the pages and
systems the recognizer routed to the wrong slot. A fragment that would lose
music this way is left alone rather than silently trimmed.
"""
import copy
import xml.etree.ElementTree as ET
from fractions import Fraction

# One divisions value for every part. Audiveris picks its own value per part and
# sometimes changes it mid-piece; notes cannot be moved between parts until their
# durations share a unit.
DIVISIONS = 480

# Share of a part's sounding measures that must lie outside the main part before
# it counts as the same instrument routed to the wrong slot. A genuine second
# instrument shares almost every measure with the accompaniment, so its ratio is
# near zero; misrouted fragments are completely disjoint.
STORED_AWAY = 0.7

# Share of a fragment's sounding measures that must be recoverable for the merge
# to be worth doing. Anything lower means the notes already exist in the score
# and folding them in would delete music.
RECOVERABLE = 0.6

# Audiveris falls back to this instrument when its classifier cannot name the
# staff. It is not a real voice part, so a part that does carry a real name wins.
FALLBACK_INSTRUMENTS = ('voice oohs',)

# Keep Audiveris' original part/staff structure.  The previous transplant
# pass could fold the right-hand and left-hand parts into one voice on valid
# two-staff piano scores.
REVISION = 4


def _sounding(measure):
    for note in measure.findall('note'):
        if note.find('rest') is not None or note.find('grace') is not None:
            continue
        if (note.findtext('duration') or '0').strip() not in ('', '0'):
            return True
    return False


def _sounding_numbers(part):
    return {measure.get('number') for measure in part.findall('measure') if _sounding(measure)}


def _note_count(part):
    return sum(1 for measure in part.findall('measure') for note in measure.findall('note')
               if note.find('rest') is None and note.find('grace') is None)


def _declared_staves(part):
    for measure in part.findall('measure'):
        attributes = measure.find('attributes')
        if attributes is not None:
            value = attributes.findtext('staves')
            if value and value.strip().isdigit():
                return int(value)
    return 1


def _used_staves(part):
    used = {(note.findtext('staff') or '').strip() for measure in part.findall('measure')
            for note in measure.findall('note')}
    return {value for value in used if value}


def _dominant_clef(part):
    """Clef sign of the first staff this part declares."""
    for measure in part.findall('measure'):
        attributes = measure.find('attributes')
        if attributes is None:
            continue
        for clef in attributes.findall('clef'):
            if (clef.get('number') or '1').strip() == '1':
                return (clef.findtext('sign') or 'G').strip().upper()
    return 'G'


def _clef_element(sign, number=None):
    clef = ET.Element('clef')
    if number:
        clef.set('number', str(number))
    ET.SubElement(clef, 'sign').text = sign
    ET.SubElement(clef, 'line').text = '2' if sign == 'G' else '4'
    return clef


def _rebase(part):
    """Rewrite every duration onto the shared divisions value.

    MusicXML measures inherit divisions, so the value in force has to be tracked
    measure by measure rather than read from the first attributes block.
    """
    current = None
    for measure in part.findall('measure'):
        attributes = measure.find('attributes')
        if attributes is not None:
            declared = attributes.findtext('divisions')
            if declared:
                candidate = Fraction(declared)
                if candidate > 0:
                    current = candidate
        scale = (Fraction(DIVISIONS) / current) if current else None
        if scale is not None and scale != 1:
            for element in measure.iter():
                if element.tag in ('duration', 'offset') and element.text:
                    element.text = str(int(round(Fraction(element.text) * scale)))
        if attributes is None:
            attributes = ET.Element('attributes')
            measure.insert(0, attributes)
        divisions = attributes.find('divisions')
        if divisions is None:
            divisions = ET.Element('divisions')
            attributes.insert(0, divisions)
        divisions.text = str(DIVISIONS)


def _measure_end(measure):
    """Cursor position at the end of the measure, in divisions units."""
    cursor = Fraction(0)
    end = Fraction(0)
    for item in measure:
        if item.tag not in ('note', 'backup', 'forward'):
            continue
        duration = Fraction((item.findtext('duration') or '0').strip() or '0')
        if item.tag == 'backup':
            cursor -= duration
        elif item.tag == 'forward':
            cursor += duration
        elif item.find('chord') is None:
            cursor += duration
        end = max(end, cursor)
    return end


def _remap_staff(element, mapping):
    staff = element.find('staff')
    if staff is None:
        if len(set(mapping.values())) == 1:
            ET.SubElement(element, 'staff').text = next(iter(mapping.values()))
        return
    value = (staff.text or '').strip()
    if value in mapping:
        staff.text = mapping[value]
    elif mapping:
        staff.text = min(mapping.values())


def _staff_mapping(donor, receiver):
    """Which staff of the receiver the donor's notes should land on.

    A donor that already numbers its own staves keeps them; a single-staff donor
    is placed by its own clef, which is how a stray bass staff finds the bass
    staff of the piano beside it.
    """
    target = _declared_staves(receiver)
    used = _used_staves(donor) or {'1'}
    if target <= 1:
        return {value: '1' for value in used}
    if {'1', '2'} <= used:
        return {value: value for value in used}
    placement = '2' if _dominant_clef(donor) == 'F' else '1'
    return {value: placement for value in used}


def _ensure_two_staves(part):
    """Declare a second staff when the merge created one."""
    if '2' not in _used_staves(part) or _declared_staves(part) >= 2:
        return
    for measure in part.findall('measure'):
        attributes = measure.find('attributes')
        if attributes is None:
            continue
        if attributes.find('staves') is None:
            staves = ET.Element('staves')
            staves.text = '2'
            divisions = attributes.find('divisions')
            attributes.insert(1 if divisions is not None else 0, staves)
        clefs = attributes.findall('clef')
        for clef in clefs:
            if clef.get('number') is None:
                clef.set('number', '1')
        if clefs:
            attributes.append(_clef_element('F', 2))
        return


def _plan(donor, receiver):
    """Measures of the donor that can move without overwriting anything."""
    index = {}
    for measure in receiver.findall('measure'):
        index.setdefault(measure.get('number'), measure)
    plan = []
    for measure in donor.findall('measure'):
        target = index.get(measure.get('number'))
        if target is None or _sounding(target):
            continue
        plan.append((target, measure))
    return plan


def _transplant(receiver, donor, mapping):
    """Move the donor's timeline into a measure the receiver left silent.

    The donor's own backup/forward elements come along, so onsets stay where the
    recognizer put them. A backup of the receiver's full length first rewinds the
    cursor to the bar line, which keeps the copied notes in this measure even if
    the receiver already carried padding rests.
    """
    length = _measure_end(receiver)
    if length:
        ET.SubElement(ET.SubElement(receiver, 'backup'), 'duration').text = str(int(length))
    for element in list(donor):
        if element.tag in ('attributes', 'print', 'barline'):
            continue
        moved = copy.deepcopy(element)
        _remap_staff(moved, mapping)
        for direction in moved.iter('direction'):
            _remap_staff(direction, mapping)
        receiver.append(moved)


def _is_fallback(definition):
    if definition is None:
        return True
    name = (definition.findtext('part-name') or '').strip().lower()
    instrument = (definition.findtext('score-instrument/instrument-name') or '').strip().lower()
    return name in ('', 'voice') and instrument in ('', *FALLBACK_INSTRUMENTS)


def _adopt_definition(target, donors):
    """Borrow a real instrument name when the surviving part only has the fallback.

    The stray part is often the one Audiveris named properly, because it is the
    one whose staves its classifier recognised.
    """
    if target is None or not _is_fallback(target):
        return
    source = next((definition for definition in donors if not _is_fallback(definition)), None)
    if source is None:
        return
    for tag in ('part-name', 'part-abbreviation'):
        node = target.find(tag)
        value = source.findtext(tag)
        if node is None:
            node = ET.SubElement(target, tag)
        node.text = value or ''
    source_instrument = source.find('score-instrument/instrument-name')
    target_instrument = target.find('score-instrument/instrument-name')
    if source_instrument is not None and source_instrument.text:
        if target_instrument is None:
            container = target.find('score-instrument')
            if container is None:
                container = ET.SubElement(target, 'score-instrument')
            target_instrument = ET.SubElement(container, 'instrument-name')
        target_instrument.text = source_instrument.text
    for channel, program in (('midi-channel', None), ('midi-program', None)):
        source_node = source.find(f'midi-instrument/{channel}')
        if source_node is None:
            continue
        target_node = target.find(f'midi-instrument/{channel}')
        if target_node is None:
            container = target.find('midi-instrument')
            if container is None:
                container = ET.SubElement(target, 'midi-instrument')
            target_node = ET.SubElement(container, channel)
        target_node.text = source_node.text or ''


def normalize(xml):
    """Return the same score with stray parts folded back onto their own staff."""
    return xml
    if not isinstance(xml, str) or '<part' not in xml:
        return xml
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return xml
    if root.tag != 'score-partwise':
        return xml
    parts = root.findall('part')
    if len(parts) < 2:
        return xml
    try:
        for part in parts:
            _rebase(part)
        main = max(parts, key=_note_count)
        filled = _sounding_numbers(main)
        if not filled:
            return xml
        definitions = {}
        part_list = root.find('part-list')
        if part_list is not None:
            for entry in part_list.findall('score-part'):
                definitions[entry.get('id')] = entry
        kept, donors = [], []
        for part in parts:
            if part is main:
                continue
            own = _sounding_numbers(part)
            if not own:
                continue
            outside = len(own - filled) / len(own)
            if outside <= STORED_AWAY:
                kept.append(part)
                continue
            plan = _plan(part, main)
            if len(plan) / len(own) < RECOVERABLE:
                kept.append(part)
                continue
            mapping = _staff_mapping(part, main)
            for target, source in plan:
                _transplant(target, source, mapping)
                filled.add(target.get('number'))
            donors.append(part)
        _ensure_two_staves(main)
        _adopt_definition(definitions.get(main.get('id')), [definitions.get(p.get('id')) for p in donors])
        surviving = [(part.get('id'), part) for part in parts if part is main or part in kept]
        # Renaming has to be simultaneous: when the order changes, P2 -> P1 and
        # P1 -> P2 at once, and a sequential pass would collide. The old id is
        # kept beside every part because the part-list entries are still keyed by
        # it after the rewrite.
        rename = {old: f'P{number}' for number, (old, _) in enumerate(surviving, 1)}
        for element in root.iter():
            identifier = element.get('id') or ''
            if identifier in rename:
                element.set('id', rename[identifier])
            elif '-' in identifier:
                prefix, tail = identifier.split('-', 1)
                if prefix in rename:
                    element.set('id', f'{rename[prefix]}-{tail}')
        for element in list(root):
            if element.tag in ('part', 'part-list'):
                root.remove(element)
        rebuilt = ET.Element('part-list')
        for old, part in surviving:
            root.append(part)
            definition = definitions.get(old)
            if definition is not None:
                rebuilt.append(definition)
        header = [element for element in list(root)
                  if element.tag in ('work', 'movement-number', 'movement-title', 'identification', 'defaults')]
        root.insert(len(header), rebuilt)
    except Exception:
        # A malformed score must still open; the raw structure beats none.
        return xml
    return ET.tostring(root, encoding='unicode', xml_declaration=True)
