"""Rule-based score-editing bridge for the piano-coaching web app.

Design notes
------------
* ``sera_vendor/`` holds an unmodified copy of Sera's pure-Python core
  (MIT, https://github.com/Selancee/Sera, tag v1.0.0).  No third-party
  dependency is required: the import closure is standard library only.
* Sera's own ``PatchTransaction`` enforces ten validation layers and rolls
  back on any error.  On real OMR scores that rejects ~84% of edits, mostly
  because of pre-existing duration/chord/round-trip irregularities.  The
  product decision for this project is "let the AI edit, do not block":
  this bridge therefore runs the same validators *for reporting only* and
  applies the patch regardless, while keeping two hard safety guarantees:

    1. The source MusicXML is never overwritten.  Every edit produces a
       separate revision string held in a per-session undo stack.
    2. The produced MusicXML must parse as XML and be readable by the
       front-end ``parseMusicXML`` (score-partwise, valid note durations).

  Validators are still executed and their findings are translated to Chinese
  and returned as ``warnings`` so the user can see what Sera would have
  objected to, without being blocked by it.

Public endpoints (all POST, JSON body, called from server.py):
    /api/sera-edit/preview   -> generate a reviewed proposal (no state change)
    /api/sera-edit/apply     -> commit a proposal into the revision stack
    /api/sera-edit/undo      -> return the previous revision
    /api/sera-edit/status    -> capability probe / health
"""

from __future__ import annotations

import copy
import json
import os
import re
import sys
import threading
import uuid
import xml.etree.ElementTree as ET
from typing import Any

_ROOT = os.path.dirname(os.path.abspath(__file__))
_VENDOR = os.path.join(_ROOT, "sera_vendor")
if _VENDOR not in sys.path:
    sys.path.insert(0, _VENDOR)

from backend.services.score_document_service import (  # noqa: E402
    musicxml_to_score_document,
    normalize_score_document,
    score_document_to_musicxml,
)
from backend.validation.musicxml_validator import MusicXMLValidator  # noqa: E402
from sera_edit.domain.fingerprints import score_fingerprint  # noqa: E402
from sera_edit.domain.operations import (  # noqa: E402
    OperationApplicationError,
    apply_patch_operation,
)
from sera_edit.domain.score_patch import ScorePatch  # noqa: E402
from sera_edit.domain.score_scope import ScoreScope  # noqa: E402
from sera_edit.execution.diff_engine import score_diff  # noqa: E402
from sera_edit.execution.transaction import PatchTransaction  # noqa: E402
from sera_edit.generation.instruction_scope import (  # noqa: E402
    explicit_instruction_measures,
)
from sera_edit.generation.rule_patch_generator import generate_rule_patch  # noqa: E402

VERSION = "1.0.0"
MAX_XML_BYTES = 12 * 1024 * 1024

# ---------------------------------------------------------------------------
# Session-local revision stacks.  Keyed by an opaque session id supplied by the
# front-end; each entry is the full MusicXML of one revision.  Never touches
# the cloud score library.
# ---------------------------------------------------------------------------
_STACKS: dict[str, list[dict[str, Any]]] = {}
_STACK_LOCK = threading.Lock()
_MAX_REVISIONS = 30

_ERROR_TEXT = {
    "E02": "MusicXML 往返或格式校验",
    "E04": "补丁结构不合法",
    "E05": "源谱指纹不匹配（谱面可能已被改动）",
    "E07": "小节时值不规范",
    "E08": "和弦/记谱关系不规范",
    "E09": "音符关系不满足前置条件",
    "E14": "往返后记谱字段有差异",
}


def _translate(errors: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for err in errors or []:
        code = str(err.get("code") or "")
        label = _ERROR_TEXT.get(code, "记谱校验")
        detail = err.get("event_id") or ""
        fields = (err.get("details") or {}).get("fields") or []
        suffix = ""
        if detail:
            suffix = f"（{detail}）"
        elif fields:
            suffix = f"（{','.join(map(str, fields))}）"
        text = f"{label}{suffix}"
        if text not in seen:
            seen.add(text)
            out.append(text)
        if len(out) >= 8:
            break
    return out


def _load(body: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    xml = body.get("xml") or body.get("musicxml") or ""
    if not isinstance(xml, str) or not xml.lstrip().startswith("<?xml"):
        raise ValueError("缺少有效的 MusicXML（xml 字段）")
    if len(xml.encode("utf-8")) > MAX_XML_BYTES:
        raise ValueError("乐谱超过 12 MB，暂不支持精准编辑")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise ValueError(f"MusicXML 格式不正确：{exc}") from exc
    if root.tag != "score-partwise":
        raise ValueError("仅支持 score-partwise 格式的 MusicXML")
    doc = normalize_score_document(
        musicxml_to_score_document(xml, source="piano_coach_sera_bridge")
    )
    return xml, doc


def _resolve_scope(doc: dict[str, Any], body: dict[str, Any]) -> dict[str, Any]:
    """Honour an explicit front-end selection, else pick the first playable measure.

    OMR scores often start with rests / pickup bars; blindly targeting measure 1
    makes Sera's rule generator reply "no editable note events".
    """
    raw = body.get("target_scope")
    if isinstance(raw, dict) and raw:
        return raw
    for measure in doc.get("measures") or []:
        events = measure.get("events") or []
        if any(e.get("type") == "note" and e.get("pitch") for e in events):
            return {"measures": [int(measure.get("number", 1))]}
    return {"whole_score": True}


def _assert_parseable(xml: str) -> None:
    """Mirror the hard requirements of dist/score.js parseMusicXML.

    ★ 这是「输出合法性」硬检查，判定标准必须与下游渲染器 **完全一致**：下游
    放行的合法音符类型这里也必须放行，否则会把本来能渲染的谱误杀成 400。
    dist/score.js 的 parseMusicXML（约第 23 行）对音符的跳过/容错清单：
      grace -> continue；rest -> continue；有 <unpitched> 时允许无 pitch
      （用 midi-unpitched 定音高）；既无 pitch 又无 unpitched -> 标记 unsupported 跳过。
    历史两次误杀都源于「后端比下游更严」：grace（无 duration）、unpitched（无 pitch）。
    """
    root = ET.fromstring(xml)
    if root.tag != "score-partwise":
        raise ValueError("修订结果不是 score-partwise，已放弃")
    for part in root.findall("part"):
        for note in part.iter("note"):
            # 装饰音（<grace>）按 MusicXML 规范不写 <duration>，靠 <type> 表示时值。
            # 下游 dist/score.js 的 parseMusicXML 也是 `if(child(item,'grace'))continue`
            # 直接跳过；此处必须对齐，否则会把合法的含装饰音谱误判为「无效时值」，
            # 导致这类谱任何编辑都 400（曾让曲库第一首「后来」整首无法编辑）。
            if note.find("grace") is not None:
                continue
            if note.find("rest") is not None:
                continue
            pitch = note.find("pitch")
            dur = note.findtext("duration")
            # 打击乐 / 无音高音符（<unpitched>）本就没有 <pitch>，下游用
            # midi-unpitched 定音高并明确允许。这里放行「有 unpitched」的合法情形，
            # 但保留 duration 校验（下游也要求 duration>0）；既无 pitch 又无
            # unpitched 的真畸形音符仍拒绝，安全底线不放宽。
            if pitch is None:
                if note.find("unpitched") is not None:
                    try:
                        if float(dur or 0) <= 0:
                            raise ValueError("修订结果含无效时值，已放弃")
                    except (TypeError, ValueError) as exc:
                        raise ValueError("修订结果含无效时值，已放弃") from exc
                    continue
                raise ValueError("修订结果含无音高音符，已放弃")
            if pitch.findtext("step") is None or pitch.findtext("octave") is None:
                raise ValueError("修订结果含无音高音符，已放弃")
            try:
                if float(dur or 0) <= 0:
                    raise ValueError("修订结果含无效时值，已放弃")
            except (TypeError, ValueError) as exc:
                raise ValueError("修订结果含无效时值，已放弃") from exc


# ---------------------------------------------------------------------------
# Source-preserving application.
#
# Sera's ``musicxml_to_score_document`` keeps only ONE part (verified on real
# OMR scores: 3 parts / 5206 notes became 1 part / 1029 notes).  Re-exporting
# a Sera ScoreDocument would therefore silently discard two thirds of the
# score.  Following Sera's own stated principle -- "the notation host remains
# the visual authority" -- we use Sera ONLY to parse the natural-language
# instruction into a strict ScorePatch and to produce validation findings;
# the actual revision is a minimal, in-place edit of the ORIGINAL MusicXML.
# Every part, backup, chord, direction and untouched note stays byte-faithful.
# ---------------------------------------------------------------------------
_STEP_TO_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_SEMITONE_TO_STEP = {
    0: ("C", 0), 1: ("C", 1), 2: ("D", 0), 3: ("E", -1), 4: ("E", 0),
    5: ("F", 0), 6: ("F", 1), 7: ("G", 0), 8: ("A", -1), 9: ("A", 0),
    10: ("B", -1), 11: ("B", 0),
}
_CN_DIGITS = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
              "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def _cn_to_int(token: str) -> int | None:
    token = (token or "").strip()
    if token.isdigit():
        return int(token)
    if not token:
        return None
    if "十" in token:
        head, _, tail = token.partition("十")
        tens = _CN_DIGITS.get(head, 1) if head else 1
        ones = _CN_DIGITS.get(tail, 0) if tail else 0
        if (head and head not in _CN_DIGITS) or (tail and tail not in _CN_DIGITS):
            return None
        return tens * 10 + ones
    value = 0
    for char in token:
        if char not in _CN_DIGITS:
            return None
        value = value * 10 + _CN_DIGITS[char]
    return value


def _normalize_instruction(text: str) -> str:
    """Turn 第二小节 into 第2小节 so Sera's ``\\d+`` measure parser accepts it."""
    def replace(match: "re.Match[str]") -> str:
        number = _cn_to_int(match.group(1))
        return f"第{number}小节" if number else match.group(0)
    return re.sub(r"第\s*([零一二两三四五六七八九十\d]+)\s*小节", replace, text)


def _note_total(xml: str) -> int:
    root = ET.fromstring(xml)
    return sum(1 for note in root.iter("note")
               if note.find("rest") is None and note.find("pitch") is not None)


def _part_total(xml: str) -> int:
    return len(ET.fromstring(xml).findall("part"))


def _note_midi(note: ET.Element) -> int | None:
    pitch = note.find("pitch")
    if pitch is None:
        return None
    step = (pitch.findtext("step") or "C").strip().upper()
    if step not in _STEP_TO_SEMITONE:
        return None
    try:
        alter = int(float(pitch.findtext("alter") or "0"))
        octave = int(pitch.findtext("octave") or "4")
    except (TypeError, ValueError):
        return None
    return 12 * (octave + 1) + _STEP_TO_SEMITONE[step] + alter


def _set_note_midi(note: ET.Element, midi: int) -> None:
    pitch = note.find("pitch")
    if pitch is None:
        return
    midi = max(21, min(108, midi))
    octave, pc = midi // 12 - 1, midi % 12
    step, alter = _SEMITONE_TO_STEP[pc]
    elem = pitch.find("step")
    if elem is not None:
        elem.text = step
    al = pitch.find("alter")
    if alter:
        if al is None:
            al = ET.SubElement(pitch, "alter")
        al.text = str(alter)
    elif al is not None:
        pitch.remove(al)
    oc = pitch.find("octave")
    if oc is not None:
        oc.text = str(octave)


def _dynamic_xml(value: str) -> str:
    return value.lower()


# 整段力度兜底用的「中文力度词 → Sera 力度记号」映射。Sera 规则层只做逐音符力度，
# 对「把力度改成强」这类整段/整小节表述会判 unsupported；识别到后由适配层直接构造
# set_dynamic 补丁（_apply_minimal 会逐音符落写 <dynamics>）。
_DYN_KEYWORDS = [
    ("极弱", "ppp"), ("很弱", "ppp"), ("最弱", "ppp"),
    ("中弱", "mp"),
    ("弱", "pp"), ("小声", "pp"), ("轻声", "pp"),
    ("中强", "mf"),
    ("强", "f"), ("大声", "f"), ("响", "f"),
    ("很强", "fff"), ("极强", "fff"), ("最强", "fff"),
]


def _whole_section_dynamic(instruction: str) -> str | None:
    """识别整段力度意图，返回 Sera 力度记号（f/ff/p/pp/mf/mp/fff/ppp）或 None。

    仅当指令含「力度 / 强弱」时触发，避免抢走「音量 / 声音」（播放音量，由模型走
    set_part_volume）与「重音」（演奏记号，属 articulation）。Sera 已能处理的逐音符
    力度（如「力度改为ff」）由其自身生成补丁，本兜底只在它判 unsupported 时介入。
    """
    if not re.search(r'力度|强弱', instruction):
        return None
    # 显式记号优先（ff/pp/mf/f/ppp/fff，零宽断言避免与英文单词误碰）
    for tok in ("ppp", "fff", "pp", "mp", "mf", "ff", "f"):
        if re.search(r'(?<![a-z])' + tok + r'(?![a-z])', instruction, re.I):
            return tok
    # 相对表述：再大/再强/再响 → ff；再小/再弱/再轻 → pp
    if re.search(r'再\s*(?:大|强|响|重|小|弱|轻)', instruction):
        return 'ff' if re.search(r'大|强|响|重', instruction) else 'pp'
    for kw, tok in _DYN_KEYWORDS:
        if kw in instruction:
            return tok
    # 「大一点 / 强一点 / 重一点 / 响一点」→ f；「小一点 / 弱一点 / 轻一点」→ p
    if re.search(r'(?:大|强|响|重)\s*一点', instruction):
        return 'f'
    if re.search(r'(?:小|弱|轻)\s*一点', instruction):
        return 'p'
    return None


# --- Key / time signature support (applied on the original MusicXML) ----------
# Sera stores these as global score properties and only emits the key name
# (e.g. "G major"); we convert to MusicXML <fifths> / <time> on the source so
# the edit is real instead of a silent no-op.
_KEY_FIFTHS = {
    ("C", "major"): 0, ("G", "major"): 1, ("D", "major"): 2, ("A", "major"): 3,
    ("E", "major"): 4, ("B", "major"): 5, ("F#", "major"): 6,
    ("F", "major"): -1, ("B-flat", "major"): -2, ("E-flat", "major"): -3,
    ("A-flat", "major"): -4, ("D-flat", "major"): -5,
    ("A", "minor"): 0, ("E", "minor"): 1, ("B", "minor"): 2, ("F#", "minor"): 3,
    ("C#", "minor"): 4, ("G#", "minor"): 5, ("D#", "minor"): 6,
    ("D", "minor"): -1, ("G", "minor"): -2, ("C", "minor"): -3,
    ("F", "minor"): -4, ("Bb", "minor"): -5,
}


def _key_to_fifths(key_str: str) -> int | None:
    if not key_str:
        return None
    parts = key_str.strip().split()
    tonic = parts[0].strip()
    mode = parts[1].strip().lower() if len(parts) > 1 else "major"
    tonic = {"Bb": "B-flat", "Eb": "E-flat", "Ab": "A-flat", "Db": "D-flat"}.get(tonic, tonic)
    return _KEY_FIFTHS.get((tonic, mode))


def _meter_to_beats(meter_str: str) -> tuple[str, str] | None:
    if not meter_str:
        return None
    s = meter_str.strip()
    if s in ("C", "c"):
        return ("4", "4")
    if s in ("C|", "c|", "cut"):
        return ("2", "2")
    if "/" in s:
        beats, _, bt = s.partition("/")
        beats, bt = beats.strip(), bt.strip()
        if beats.isdigit() and bt.isdigit():
            return (beats, bt)
    return None


def _set_key_fifths(attrs: ET.Element, fifths: int) -> None:
    key = attrs.find("key")
    if key is None:
        key = ET.SubElement(attrs, "key")
    f = key.find("fifths")
    if f is None:
        f = ET.SubElement(key, "fifths")
    f.text = str(fifths)


def _set_meter(attrs: ET.Element, beats: str, beat_type: str) -> None:
    time = attrs.find("time")
    if time is None:
        time = ET.SubElement(attrs, "time")
    for child in list(time):
        if child.tag in ("beats", "beat-type"):
            time.remove(child)
    ET.SubElement(time, "beats").text = beats
    ET.SubElement(time, "beat-type").text = beat_type


# 适配层真正实现落写（写入原谱 MusicXML）的 Sera 操作类型。
# 任何不在此集合内的操作类型都会被 _propose 显式警告而非静默丢弃，
# 避免重蹈「调号 / 拍号曾静默 0 改动」的覆辙。Sera 升级新增类型时需同步扩充这里。
HANDLED_KINDS = {
    "transpose", "set_dynamic", "set_articulation",
    "change_key_signature", "change_time_signature",
}


def _apply_minimal(source_xml: str, patch: dict[str, Any], target: dict[str, Any]) -> tuple[str, int]:
    """Apply a Sera ScorePatch to the original MusicXML, touching only matched notes.

    Returns (revised_xml, changed_note_count).  All other XML content is preserved.
    Key / time signatures are global properties, so they are applied to the first
    matching measure of every part (inserting <attributes> when missing).
    """
    root = ET.fromstring(source_xml)
    measures = set(int(m) for m in (target.get("measures") or []))
    whole = bool(target.get("whole_score")) or not measures
    # Sera normalises staff labels to right_hand / left_hand; MusicXML uses 1 / 2.
    staff_wanted: set[str] = set()
    for staff in target.get("staffs") or []:
        s = str(staff).lower()
        if s in ("right_hand", "1", "right", "upper"):
            staff_wanted.add("1")
        elif s in ("left_hand", "2", "left", "lower"):
            staff_wanted.add("2")
        else:
            staff_wanted.add(s)

    transpose = 0
    dynamic = None
    articulations: list[str] = []
    key_fifths = None
    meter = None
    for op in patch.get("operations") or []:
        kind = op.get("type")
        args = op.get("arguments") or {}
        if kind == "transpose":
            transpose += int(args.get("semitones", 0) or 0)
        elif kind == "set_dynamic":
            dynamic = _dynamic_xml(str(args.get("value") or args.get("dynamic") or ""))
        elif kind == "set_articulation":
            # Sera 用复数键 `articulations`（列表，如 ['staccato']）；个别版本可能为单值。
            _arts = args.get("articulations")
            if _arts is None:
                _single = args.get("value") or args.get("articulation")
                _arts = [_single] if _single else []
            elif isinstance(_arts, str):
                _arts = [_arts]
            articulations = [str(a) for a in _arts if a]
        elif kind == "change_key_signature":
            key_fifths = _key_to_fifths(str(args.get("key") or ""))
        elif kind == "change_time_signature":
            meter = _meter_to_beats(str(args.get("meter") or ""))

    changed = 0
    for part in root.findall("part"):
        signature_applied = False
        for measure in part.findall("measure"):
            if not whole and int(measure.get("number") or 0) not in measures:
                continue
            # Key / time signature: global -> apply once per part on this scope.
            if (key_fifths is not None or meter is not None) and not signature_applied:
                attrs = measure.find("attributes")
                if attrs is None:
                    attrs = ET.Element("attributes")
                    measure.insert(0, attrs)
                if key_fifths is not None:
                    _set_key_fifths(attrs, key_fifths)
                if meter is not None:
                    _set_meter(attrs, meter[0], meter[1])
                signature_applied = True
                changed += 1
            for note in measure.findall("note"):
                if note.find("rest") is not None:
                    continue
                if staff_wanted:
                    staff = (note.findtext("staff") or "1").strip()
                    if staff not in staff_wanted:
                        continue
                base = _note_midi(note)
                if base is None:
                    continue
                touched = False
                if transpose:
                    _set_note_midi(note, base + transpose)
                    touched = True
                if dynamic:
                    notations = note.find("notations")
                    if notations is None:
                        notations = ET.SubElement(note, "notations")
                    dyn = notations.find("dynamics")
                    if dyn is None:
                        dyn = ET.SubElement(notations, "dynamics")
                    for child in list(dyn):
                        dyn.remove(child)
                    ET.SubElement(dyn, dynamic)
                    touched = True
                if articulations:
                    notations = note.find("notations")
                    if notations is None:
                        notations = ET.SubElement(note, "notations")
                    arts = notations.find("articulations")
                    if arts is None:
                        arts = ET.SubElement(notations, "articulations")
                    for art in articulations:
                        ET.SubElement(arts, art)
                    touched = True
                if touched:
                    changed += 1
    declaration = '<?xml version="1.0" encoding="UTF-8"?>\n'
    return declaration + ET.tostring(root, encoding="unicode"), changed


def _propose(body: dict[str, Any]) -> dict[str, Any]:
    source_xml, doc = _load(body)
    instruction = str(body.get("instruction") or "").strip()
    if not instruction:
        raise ValueError("请给出编辑指令，例如「把第 3 小节升高一个半音」")

    # Sera 的 measure 解析只认阿拉伯数字，先把「第二小节」→「第2小节」。
    normalized = _normalize_instruction(instruction)
    # 指令里点名的小节必须成为目标作用域，否则 Sera 会判「选区外」而拒绝，
    # 或（中文数字未识别时）静默改到默认第 1 小节。
    explicit = tuple(explicit_instruction_measures(normalized))
    max_measure = max((int(m.get("number", 0)) for m in doc.get("measures") or []), default=0)
    if explicit:
        out_of_range = [n for n in explicit if n > max_measure or n < 1]
        if out_of_range:
            return {"ok": False, "status": "out_of_range",
                    "reason": f"这份乐谱只有 {max_measure} 小节，没有第 {','.join(map(str, out_of_range))} 小节。",
                    "detail": "instruction names a non-existent measure",
                    "instruction": instruction, "target_scope": {"measures": list(explicit)}}
        target = {"measures": list(explicit)}
    else:
        target = _resolve_scope(doc, body)
    protected = body.get("protected_scope") or {}

    # 源谱是否真的写了调号：normalize 会把缺调号谱默认成 C major，
    # 因此只有源 XML 确实含 <key><fifths> 时，才可信地用 global.key 当当前调。
    source_has_key_signature = ET.fromstring(source_xml).find(".//key/fifths") is not None
    generated = generate_rule_patch(
        doc, normalized, target, protected,
        source_has_key_signature=source_has_key_signature,
    ).as_dict()
    status = generated.get("status")
    patch = generated.get("patch")
    # ★ 桥接层兜底：Sera 规则层只做「逐音符」力度，对整段 / 整小节力度（如「把力度改成强」
    # 「力度大一点」）会判 unsupported。识别到整段力度意图时，由适配层直接构造 set_dynamic
    # 补丁，交给 _apply_minimal 逐音符落写 <dynamics>——这正是「整段力度」增强的落点。
    if not patch and status in ("unsupported", "refused"):
        dyn = _whole_section_dynamic(normalized)
        if dyn:
            # 作用域修正：指令点名了具体小节（explicit 非空）→ 只改那些小节；
            # 没点名（"整段 / 整首力度"）→ 作用于整份乐谱，而非 Sera 默认的第 1 小节
            # （_resolve_scope 对无小节指令会回落到 {"measures":[1]}，会让"整首"只改第 1 小节）。
            if not explicit:
                target = {"whole_score": True}
            patch = {"operations": [{"type": "set_dynamic", "arguments": {"dynamic": dyn}}],
                     "target_scope": target}
            status = "proposed_by_bridge"
    if not patch:
        reason = generated.get("reason") or "无法为这条指令生成编辑补丁"
        friendly = {
            "unsupported": "这条指令暂时超出精准编辑支持的范围。目标调式移调请说「把这首从 C 调移调到 D 调」（无调号谱需指明当前调）；相对移调可用「升高一个半音」「升一个八度」；还支持力度、断奏重音、调号拍号、指定音高替换等。",
            "refused": "指令里有相互冲突或涉及未选中区域的要求，请简化后重试",
        }.get(status, reason)
        return {"ok": False, "status": status, "reason": friendly,
                "detail": reason, "instruction": instruction,
                "target_scope": target}

    # 用 Sera 的 patch 作用于它的 ScoreDocument，仅用于生成 diff 与校验报告。
    parsed = ScorePatch.from_dict(patch)
    working = copy.deepcopy(doc)
    audit: list[dict[str, Any]] = []
    # diff / audit 仅供报告，绝不阻断编辑；个别操作（如调号需 whole_score）在 Sera
    # 的 doc 上可能抛 E05，这里吞掉，不影响原谱定点修改的结果。
    for operation in parsed.operations:
        try:
            working, entry = apply_patch_operation(working, operation, parsed.target_scope)
            audit.append(entry)
        except Exception:
            audit.append({"operation": getattr(operation, "type", None), "error": "diff-only skip"})

    # 真正的修订：在原谱 MusicXML 上做最小定点修改（保留所有 part / backup / chord）。
    source_notes, source_parts = _note_total(source_xml), _part_total(source_xml)
    revised_xml, changed_notes = _apply_minimal(source_xml, patch, target)
    _assert_parseable(revised_xml)
    # 硬底线：音符数与声部数必须守恒。Sera 的 ScoreDocument 只保留一个 part，
    # 直接导出会丢掉大半谱面；这里宁可放弃也不能把残缺谱交给渲染器。
    if _note_total(revised_xml) != source_notes or _part_total(revised_xml) != source_parts:
        raise ValueError("修订未通过源谱保真检查（音符或声部数发生变化），已放弃，原谱未改动")

    # Validators run for transparency only -- never block the edit.
    warnings: list[str] = []
    # 守卫：Sera 若生成了适配层尚未实现落写的操作类型，显式警告而非静默丢弃
    # （例如未来 Sera 升级产出 set_pitch / set_duration），避免重演「调号 / 拍号曾静默 0 改动」。
    unhandled = sorted({op.get("type") for op in (patch or {}).get("operations") or []} - HANDLED_KINDS)
    if unhandled:
        warnings.append("Sera 生成了暂未实现落写的操作类型（%s），相关修改已被忽略，请等待适配层更新"
                        % "、".join(unhandled))
    report_raw: dict[str, Any] = {}
    try:
        tx = PatchTransaction().execute(doc, patch, dry_run=True).as_dict()
        report_raw = tx.get("validation_report") or {}
        warnings = _translate(report_raw.get("errors") or [])
    except Exception as exc:  # reporting must never break an edit
        warnings = [f"（校验报告生成失败：{type(exc).__name__}）"]

    try:
        diff = score_diff(doc, working)
    except Exception:
        diff = {}

    try:
        validation = MusicXMLValidator().validate_text(revised_xml)
        xml_valid = bool(getattr(validation, "valid", True))
    except Exception:
        xml_valid = True

    fp_before = score_fingerprint(doc)
    fp_after = score_fingerprint(working)
    changed = diff.get("changed") or []
    # 变化数一律以「_apply_minimal 在原谱上真正改动的条目」(changed_notes) 为准，**绝不**
    # 回退到 Sera 自身 doc-diff 的计数——否则一旦某操作没真落盘，会被假数字掩盖
    # （断奏 set_articulation 曾因此静默 0 改动却显示 N 处变化）。未处理类型由
    # HANDLED_KINDS 守卫显式告警，此处如实报 0。
    effective_count = changed_notes
    summary = _summarize(patch, [None] * effective_count, target)

    return {
        "ok": True,
        "status": "proposed",
        "version": VERSION,
        "instruction": instruction,
        "normalized_instruction": normalized,
        "target_scope": target,
        "protected_scope": protected,
        "summary": summary,
        "change_count": effective_count,
        "operations": [op.as_dict() for op in parsed.operations],
        "source_fingerprint": fp_before,
        "post_fingerprint": fp_after,
        "warnings": warnings,
        "warnings_note": "Sera 严格校验提示（按本项目设置不阻断编辑，供参考）" if warnings else "",
        "xml_valid": xml_valid,
        "revised_xml": revised_xml,
        "source_xml_fingerprint": fp_before,
        "source_note_count": source_notes,
        "source_part_count": source_parts,
        "source_preserving": True,
        "audit": audit[:20],
    }


def _summarize(patch: dict[str, Any], changed: list[Any], target: dict[str, Any]) -> str:
    ops = patch.get("operations") or []
    kinds = []
    for op in ops:
        t = op.get("type")
        if t == "transpose":
            delta = (op.get("arguments") or {}).get("semitones")
            kinds.append(f"移调 {delta:+g} 半音" if isinstance(delta, (int, float)) else "移调")
        elif t == "set_dynamic":
            kinds.append("改力度")
        elif t == "set_articulation":
            kinds.append("改演奏记号")
        elif t == "change_key_signature":
            kinds.append("改调号")
        elif t == "change_time_signature":
            kinds.append("改拍号")
        elif t == "set_pitch":
            kinds.append("改音高")
        elif t == "set_duration":
            kinds.append("改时值")
        else:
            kinds.append(str(t))
    where = ""
    measures = target.get("measures")
    if measures:
        where = f"第 {','.join(map(str, measures))} 小节"
    elif target.get("staffs"):
        where = "选中声部"
    else:
        where = "选中区域"
    head = "、".join(dict.fromkeys(kinds)) or "编辑"
    return f"{where}：{head}，共 {len(changed)} 处变化"


def _apply(body: dict[str, Any]) -> dict[str, Any]:
    session = str(body.get("session_id") or "default")
    revised_xml = body.get("revised_xml") or ""
    source_xml = body.get("source_xml") or ""
    if not isinstance(revised_xml, str) or not revised_xml.lstrip().startswith("<?xml"):
        raise ValueError("缺少修订后的 MusicXML（revised_xml）")
    _assert_parseable(revised_xml)
    with _STACK_LOCK:
        stack = _STACKS.setdefault(session, [])
        stack.append({
            "revision_id": uuid.uuid4().hex[:12],
            "revised_xml": revised_xml,
            "source_xml": source_xml or None,
            "instruction": str(body.get("instruction") or ""),
        })
        if len(stack) > _MAX_REVISIONS:
            del stack[:-_MAX_REVISIONS]
    return {"ok": True, "revision_id": stack[-1]["revision_id"],
            "depth": len(stack), "xml": revised_xml}


def _undo(body: dict[str, Any]) -> dict[str, Any]:
    session = str(body.get("session_id") or "default")
    with _STACK_LOCK:
        stack = _STACKS.get(session, [])
        if not stack:
            return {"ok": False, "reason": "没有可撤销的编辑"}
        stack.pop()
        previous = stack[-1]["revised_xml"] if stack else None
    return {"ok": True, "depth": len(stack),
            "xml": previous, "restored_original": previous is None}


def handle(handler) -> None:
    """Called by server.py do_POST.  ``handler`` is the request handler."""
    try:
        length = int(handler.headers.get("Content-Length", "0") or 0)
        if not 0 < length <= MAX_XML_BYTES + 65536:
            return handler.json_response({"ok": False, "error": "请求体为空或过大"}, 413)
        raw = handler.rfile.read(length)
        body = json.loads(raw.decode("utf-8"))
        if not isinstance(body, dict):
            raise ValueError("请求体必须是 JSON 对象")
        path = __import__("urllib.parse", fromlist=["urlparse"]).urlparse(handler.path).path
        action = path.rsplit("/", 1)[-1]
        if action == "preview":
            result = _propose(body)
        elif action == "apply":
            result = _apply(body)
        elif action == "undo":
            result = _undo(body)
        elif action == "status":
            result = {"ok": True, "version": VERSION,
                      "engine": "vendored rule-based editor (MIT)",
                      "dependencies": "standard library only",
                      "mode": "non-blocking validation",
                      "features": ["transpose", "set_dynamic", "set_articulation",
                                   "change_key_signature", "change_time_signature",
                                   "set_pitch", "set_duration"],
                      "chinese_instructions": True}
        else:
            return handler.json_response({"ok": False, "error": f"未知操作 {action}"}, 404)
        return handler.json_response(result)
    except json.JSONDecodeError:
        return handler.json_response({"ok": False, "error": "请求体不是合法 JSON"}, 400)
    except (ValueError, OperationApplicationError) as exc:
        return handler.json_response({"ok": False, "error": str(exc)}, 400)
    except Exception as exc:  # noqa: BLE001 - keep the server alive on any bridge error
        return handler.json_response(
            {"ok": False, "error": f"精准编辑引擎异常：{type(exc).__name__}: {exc}"}, 500)
