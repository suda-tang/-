"""Deterministic local ScorePatch generation for the offline Workbench demo.

This module intentionally supports a small, auditable instruction subset. It is
not an LLM substitute and its outputs must not be counted as formal model runs.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Any, Literal

from backend.notation.duration_math import duration_to_fraction, fraction_to_duration_options
from backend.services.score_document_service import normalize_score_document
from sera_edit.domain.fingerprints import score_fingerprint
from sera_edit.domain.score_scope import EventContext, ScoreScope
from sera_edit.generation.instruction_scope import resolve_instruction_target_scope


GenerationStatus = Literal["generated", "unsupported", "refused"]


@dataclass(frozen=True, slots=True)
class RulePatchGenerationResult:
    """Serializable result from the bounded local rule generator."""

    status: GenerationStatus
    patch: dict[str, Any] | None = None
    reason: str | None = None
    matched_intents: tuple[str, ...] = field(default_factory=tuple)

    def as_dict(self) -> dict[str, Any]:
        """Return a stable API payload."""

        return {
            "status": self.status,
            "patch": self.patch,
            "reason": self.reason,
            "matched_intents": list(self.matched_intents),
            "generator": {
                "provider": "local_rule",
                "model": "seraedit_rule_v1",
                "formal_experiment_eligible": False,
            },
        }


def _normalized_text(instruction: str) -> str:
    return re.sub(r"\s+", " ", instruction.strip().lower())


def _transpose_delta(text: str) -> int | None:
    # ★ 2026-11-17：「音量 / 响度 / 声音 + 八度」是口语误用（音量没有八度概念），
    #   不该被当成移调整首谱。AI 层 SERA_EDITABLE_RE 可能命中「调低八度」，
    #   这里兜住 → 返回 None → unsupported 提示，避免误移调。
    if re.search(r"音量|响度|声音", text) and re.search(r"八度", text):
        return None
    numeric = re.search(r"\bby\s*([+-]?\d+)\s*semitones?\b", text)
    if numeric is None:
        numeric = re.search(r"移调\s*([+-]?\d+)\s*个?半音", text)
    if numeric:
        value = int(numeric.group(1))
        return value if -24 <= value <= 24 else None
    patterns = (
        (2, (r"升高(?:一个)?大二度", r"上移(?:一个)?大二度", r"up by (?:a )?major second")),
        (-2, (r"降低(?:一个)?大二度", r"下移(?:一个)?大二度", r"down by (?:a )?major second")),
        (1, (r"升高(?:一个)?半音", r"上移(?:一个)?半音", r"up (?:by )?(?:a )?semitone")),
        (-1, (r"降低(?:一个)?半音", r"下移(?:一个)?半音", r"down (?:by )?(?:a )?semitone")),
        # ★ 2026-11-17 补「八度」自然说法（用户实测「低八度都不行」）：
        #   原来只认「升高/降低/上移/下移 X八度」，漏了「升/降一个八度」「移高/移低八度」
        #   以及口语省略的「高八度/低八度/调高/调低八度」。这些说法此前 delta=None
        #   落到 unsupported，模型再谎称做不到。这里只认明确的八度单位，
        #   不会误伤「高音 / 低音区 / 高低起伏」等描述性说法。
        (12, (r"升高(?:一个)?八度", r"上移(?:一个)?八度", r"up by (?:an? )?octave",
              r"升(?:一个)?八度", r"移高(?:一个)?八度", r"(?:调高|提高|高)(?:一个)?八度")),
        (-12, (r"降低(?:一个)?八度", r"下移(?:一个)?八度", r"down by (?:an? )?octave",
               r"降(?:一个)?八度", r"移低(?:一个)?八度", r"(?:调低|降低|低)(?:一个)?八度")),
    )
    for semitones, candidates in patterns:
        if any(re.search(pattern, text) for pattern in candidates):
            return semitones
    return None


def _dynamic_value(text: str) -> str | None:
    phrases = (
        ("ff", (r"极强", r"fortissimo", r"dynamic(?:s)? (?:to |as )?ff\b", r"力度(?:改为|设为)?\s*ff\b")),
        ("pp", (r"极弱", r"pianissimo", r"dynamic(?:s)? (?:to |as )?pp\b", r"力度(?:改为|设为)?\s*pp\b")),
        ("mf", (r"中强", r"mezzo[ -]?forte", r"dynamic(?:s)? (?:to |as )?mf\b", r"力度(?:改为|设为)?\s*mf\b")),
        ("mp", (r"中弱", r"mezzo[ -]?piano", r"dynamic(?:s)? (?:to |as )?mp\b", r"力度(?:改为|设为)?\s*mp\b")),
        ("f", (r"强奏", r"\bforte\b", r"dynamic(?:s)? (?:to |as )?f\b", r"力度(?:改为|设为)?\s*f\b")),
        ("p", (r"弱奏", r"\bpiano\b", r"dynamic(?:s)? (?:to |as )?p\b", r"力度(?:改为|设为)?\s*p\b")),
    )
    for dynamic, candidates in phrases:
        if any(re.search(pattern, text) for pattern in candidates):
            return dynamic
    return None


def _articulation_value(text: str) -> str | None:
    phrases = (
        ("staccato", (r"断奏", r"\bstaccato\b")),
        ("accent", (r"重音", r"\baccent(?:ed)?\b")),
        ("tenuto", (r"保持音记号", r"\btenuto\b")),
    )
    for articulation, candidates in phrases:
        if any(re.search(pattern, text) for pattern in candidates):
            return articulation
    return None


def _key_signature_value(text: str) -> str | None:
    """Return one exporter-supported key named by an explicit key-signature edit."""

    if not re.search(r"key signature|调号", text):
        return None
    match = re.search(
        r"(?<![a-z])([a-g])(?:\s*(?:-|\s)?(flat|sharp)|([#b]))?\s+(major|minor)(?![a-z])",
        text,
    )
    if match:
        tonic = match.group(1).upper()
        accidental_word = str(match.group(2) or "")
        accidental_symbol = str(match.group(3) or "")
        if accidental_word == "flat" or accidental_symbol == "b":
            tonic = f"{tonic}-flat"
        elif accidental_word == "sharp" or accidental_symbol == "#":
            tonic = f"{tonic}#"
        mode = match.group(4)
    else:
        chinese = re.search(r"(?<![a-z])([a-g])\s*(大调|小调)", text)
        if not chinese:
            return None
        tonic = chinese.group(1).upper()
        mode = "major" if chinese.group(2) == "大调" else "minor"
    supported_tonics = {
        "C",
        "G",
        "D",
        "A",
        "E",
        "B",
        "F#",
        "F",
        "B-flat",
        "E-flat",
        "A-flat",
        "D-flat",
    }
    return f"{tonic} {mode}" if tonic in supported_tonics else None


# === 目标调式转调（"移调到 D 调" / "转调到降B调" / "把这首从 C 调移调到 D 调"）===
# 按**主音绝对音高类**算音程，而非五度环：C 大调 → D 小调应 +2 半音，
# 用五度环会得到 -7/5，错误落到 F。导出器（sera_bridge._key_to_fifths）支持的调名集合。
_TONIC_PC = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4,
    "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9,
    "A#": 10, "Bb": 10, "B": 11,
}
_SUPPORTED_KEY_SIGS = {
    "C major", "G major", "D major", "A major", "E major", "B major", "F# major",
    "F major", "B-flat major", "E-flat major", "A-flat major", "D-flat major",
    "A minor", "E minor", "B minor", "F# minor", "C# minor", "G# minor", "D# minor",
    "D minor", "G minor", "C minor", "F minor", "Bb minor",
}


def _normalize_tonic(letter: str, accidental: str) -> str:
    letter = letter.upper()
    if accidental in ("升", "sharp", "#"):
        return {"C": "C#", "D": "D#", "E": "F", "F": "F#", "G": "G#", "A": "A#", "B": "C"}.get(letter, letter + "#")
    if accidental in ("降", "flat", "b"):
        return {"D": "Db", "E": "Eb", "G": "Gb", "A": "Ab", "B": "Bb", "C": "B", "F": "E"}.get(letter, letter + "b")
    return letter


def _parse_transpose_target_key(text: str):
    """Parse the target key from '移调到 D 调' / '转调到降B调' / 'transpose to D major'.

    Returns (signature_name, tonic_pc) or None.
    """
    # ★ 触发词补全（2026-11-14）：原只认「移调/转调…」，用户用「更改/改成/调成/换成…」
    #   这类自然说法时被漏掉；且动词与调名之间不允许夹宾语（如「简谱」），导致
    #   「更改简谱到 D调琵琶谱」匹配不上。现扩展触发词并允许动词与调名间夹 ≤12 字宾语
    #   （含「到/成」），仍可定位到后续 A–G 调名。
    # ★★ 回归修复（2026-11-15）：调名后缀原为 **可选**，导致力度记号 ff/mf 里的字母 f、
    #   以及「把第 3 小节的 C 改成 D」里的音名 D 被当成目标调，生成错误的
    #   「改调号、移调」提案（100 问真实浏览器测试 B01/F01/K07 复现）。
    #   现要求后缀 (大调|小调|调|major|minor) **必须存在**。离线实测：
    #   已支持的 15/15 种说法全部保住（含 transpose to D major），
    #   8/8 种力度/音高/渐强/拍号说法全部挡住，0 误伤。
    #   注意：不要退回「独立字母即可」的方案，那会重新误命中音名 C→D。
    m = re.search(
        r"(?:移调|转调|移到|转到|transpose|to|更改|改成|改到|调成|换成|改为|变更|调到|转成|变调)\s*"
        r"[^，。；、！？\n]{0,12}?\s*(?:到|成)?\s*"
        r"([升降]|sharp|flat|#|b)?\s*([a-gA-G])\s*(大调|小调|调|major|minor)",
        text,
    )
    if not m:
        return None
    accidental, letter, mode_word = m.group(1), m.group(2), (m.group(3) or "")
    tonic = _normalize_tonic(letter, accidental or "")
    mode = "minor" if ("小" in mode_word or "minor" in mode_word) else "major"
    pc = _TONIC_PC.get(tonic)
    if pc is None:
        return None
    return (f"{tonic} {mode}", pc)


def _parse_source_key(text: str):
    """Parse an explicit source key: '从 C 调' / '原调是 G' / '把 G 调的这首'.

    Returns tonic pitch-class or None. Used when the score has no key signature.
    """
    patterns = [
        r"从\s*([升降]|sharp|flat|#|b)?\s*([a-gA-G])\s*(?:大调|小调|调)?\s*(?:移调|转调|移到|转到)",
        r"(?:原调|原曲|当前调|本调|这首)\s*(?:是|为)?\s*([升降]|sharp|flat|#|b)?\s*([a-gA-G])\s*(?:大调|小调|调)?",
        r"把\s*([升降]|sharp|flat|#|b)?\s*([a-gA-G])\s*(?:大调|小调|调)?\s*的这首",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            accidental, letter = m.group(1), m.group(2)
            return _TONIC_PC.get(_normalize_tonic(letter, accidental or ""))
    return None


def _current_tonic_pc(score: dict) -> int | None:
    key_str = (score.get("global") or {}).get("key") or ""
    m = re.match(r"\s*([A-Ga-g])\s*(#|b|-flat|-sharp)?", key_str)
    if not m:
        return None
    letter = m.group(1).upper()
    acc = m.group(2) or ""
    acc = "sharp" if acc in ("-sharp", "#") else ("flat" if acc in ("-flat", "b") else "")
    return _TONIC_PC.get(_normalize_tonic(letter, acc))


def _interval_semitones(from_pc: int, to_pc: int) -> int:
    delta = (to_pc - from_pc) % 12
    if delta > 6:
        delta -= 12
    return delta


def _conflicting_instruction(text: str) -> str | None:
    preserves_duration = bool(
        re.search(
            r"保持(?:所有|全部)?(?:音符)?(?:节奏|时值)|preserv(?:e|ing) (?:(?:all|every) )?(?:note )?(?:rhythm|durations?)",
            text,
        )
    )
    changes_meter = bool(re.search(r"(?:改为|改成|变为|change .+ to)\s*\d+\s*/\s*\d+", text))
    if preserves_duration and changes_meter:
        return "Changing meter while requiring all durations to remain unchanged is outside the safe local rule subset."
    aesthetic_without_notation = bool(
        re.search(
            r"(?:more beautiful|更美|优美|更好听|神秘).*(?:without changing any notation|不改变任何记谱|不要改变任何记谱|不改任何记谱)",
            text,
        )
    )
    if aesthetic_without_notation:
        return "An unverifiable aesthetic change that forbids any notation change has no executable score operation."
    return None


def _time_signature_value(text: str) -> str | None:
    # ★ 2026-11-15 触发词补全（100 问真实浏览器测试）：
    #   原 guard 只在出现「拍号」二字或「N/N 改为 N/N」时才继续，findall 也只认
    #   to/为/改成/改为，导致「换成 6/8 拍」「第二页也改成 3/4」这类自然说法落到 unsupported，
    #   模型再据此谎称「系统不支持改拍号」。现允许分数拍号直接出现，并补「换成/调成/设为/变成」等动词。
    #   注意：只在 edit_score 通道内调用（已由上层判定为改谱意图），不会误伤播放/音量指令。
    if not re.search(
        r"time signature|拍号|rebar|重新划分小节|\d+\s*/\s*\d+\s*拍?"
        r"|\d+\s*/\s*\d+\s*改为\s*\d+\s*/\s*\d+",
        text,
    ):
        return None
    matches = re.findall(
        r"(?:to|为|改成|改为|换成|调成|设为|设成|变成|变为|改到|调到)\s*(\d+\s*/\s*\d+)",
        text,
    )
    if not matches:
        return None
    return matches[-1].replace(" ", "")


def _note_contexts(contexts: list[EventContext]) -> list[EventContext]:
    return [context for context in contexts if context.event.get("type") == "note"]


def _positioned_notes(text: str, notes: list[EventContext]) -> list[EventContext]:
    # Host selections may already resolve a positional phrase (for example,
    # “the third note”) to one stable event ID. Do not index that singleton a
    # second time.
    if len(notes) <= 1:
        return notes
    if re.search(r"(?:final|last) two notes|最后两个音", text):
        return notes[-2:]
    if re.search(r"(?:only )?(?:the )?third note|第三个音", text):
        return notes[2:3]
    if re.search(r"(?:the )?(?:final|last) note|最后一个音|末音", text):
        return notes[-1:]
    if re.search(r"(?:the )?first note|第一个音", text):
        return notes[:1]
    return notes


def _voice_target(text: str) -> int | None:
    if not re.search(r"move|移到|移至|声部", text):
        return None
    match = re.search(r"(?:to voice|移到声部|移至声部)\s*(\d+)", text)
    return int(match.group(1)) if match else None


def _replacement_pitch(text: str) -> str | None:
    if not re.search(r"replace|替换", text):
        return None
    if re.search(r"f(?:-| )?sharp\s*4|f#\s*4|升\s*f\s*4", text):
        return "F#4"
    match = re.search(r"\b([a-g])([#b]?)\s*([0-9])\b", text)
    return f"{match.group(1).upper()}{match.group(2)}{match.group(3)}" if match else None


def _replacement_chord(text: str) -> list[str] | None:
    if re.search(r"c(?:-| )?major triad|c大三和弦", text):
        return ["C4", "E4", "G4"]
    return None


def _is_merge(text: str) -> bool:
    return bool(re.search(r"merge the first two|合并.*(?:前|开头).*两个|(?:前|开头).*两个.*合并", text))


def _is_slur(text: str) -> bool:
    # ★★ 2026-11-15 决策记录：**刻意不扩展「标连奏」等触发词**。
    #   100 问测试里「第 2 行标连奏」落到 unsupported，本想补触发词，但核查发现
    #   `set_slur` 是**假闭环**：① sera_bridge.HANDLED_KINDS 不含 set_slur，
    #   _apply_minimal 不落写 → change_count=0；② 前端 app.js 用 parseMusicXML 解析
    #   修订 XML，而 dist/score.js 只认 tie/dynamics/fingering，**不解析 <slur>**。
    #   因此即使出提案、点「应用」、显示「已应用」，谱面也不会有任何连线。
    #   接入 AI 路由只会把「诚实拒答」变成更糟的「假装成功」。连奏线要真正闭环，
    #   需后端 _apply_minimal 写 <notations><slur>、前端 score.js 解析与渲染层一起改，
    #   属独立功能开发，不在本轮触发词补全范围。此处保持上游原样。
    return bool(re.search(r"add (?:one )?slur|添加.*连(?:奏|音)线|加.*连(?:奏|音)线", text))


def _operation(
    operations: list[dict[str, Any]],
    kind: str,
    selector: dict[str, Any],
    arguments: dict[str, Any],
    expected_change_count: int | None,
) -> None:
    operations.append(
        {
            "operation_id": f"op_{len(operations) + 1:03d}",
            "type": kind,
            "selector": selector,
            "arguments": arguments,
            "preconditions": [],
            "expected_change_count": expected_change_count,
        }
    )


def _merged_duration(first: EventContext, second: EventContext) -> str | None:
    total = duration_to_fraction(str(first.event.get("duration", "quarter"))) + duration_to_fraction(
        str(second.event.get("duration", "quarter"))
    )
    options = fraction_to_duration_options(total)
    return options[0] if len(options) == 1 else None


def _final_lane_note_ids(notes: list[EventContext]) -> list[str]:
    lanes: dict[tuple[int, str, int], list[EventContext]] = defaultdict(list)
    for context in notes:
        lanes[(context.measure, context.staff, context.voice)].append(context)
    selected: list[str] = []
    for lane in lanes.values():
        final = max(lane, key=lambda context: (context.offset, context.event_id))
        if duration_to_fraction(str(final.event.get("duration", "quarter"))) != Fraction(1, 1):
            return []
        selected.append(final.event_id)
    return sorted(selected)


def _stable_patch_id(
    score_id: str,
    fingerprint: str,
    instruction: str,
    target_scope: dict[str, Any],
) -> str:
    payload = json.dumps(
        {
            "score_id": score_id,
            "fingerprint": fingerprint,
            "instruction": instruction,
            "target_scope": target_scope,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"local_rule_{hashlib.sha256(payload).hexdigest()[:16]}"


def generate_rule_patch(
    score_document: dict[str, Any],
    instruction: str,
    target_scope_payload: dict[str, Any],
    protected_scope_payload: dict[str, Any] | None = None,
    source_has_key_signature: bool = False,
) -> RulePatchGenerationResult:
    """Generate a strict patch for the supported offline instruction subset."""

    score = normalize_score_document(score_document)
    text = _normalized_text(instruction)
    if not text:
        return RulePatchGenerationResult("unsupported", reason="Instruction must not be empty.")
    try:
        requested_target_scope = ScoreScope.from_dict(target_scope_payload)
        protected_scope = ScoreScope.from_dict(protected_scope_payload)
    except (TypeError, ValueError) as exc:
        return RulePatchGenerationResult("unsupported", reason=f"Invalid score scope: {exc}")
    if requested_target_scope.empty:
        return RulePatchGenerationResult("unsupported", reason="Select at least one measure or event before generating a patch.")
    conflict = _conflicting_instruction(text)
    if conflict:
        return RulePatchGenerationResult("refused", reason=conflict, matched_intents=("conflict",))

    semitones = _transpose_delta(text)
    dynamic = _dynamic_value(text)
    articulation = _articulation_value(text)
    key_signature = _key_signature_value(text)
    time_signature = _time_signature_value(text)
    voice_target = _voice_target(text)
    replacement_pitch = _replacement_pitch(text)
    replacement_chord = _replacement_chord(text)
    merge = _is_merge(text)
    slur = _is_slur(text)
    # 目标调式转调：'移调到 D 调' / '转调到降B调' / '把这首从 C 调移调到 D 调'。
    # 相对式（升高/降低 N 半音、八度）由 _transpose_delta 处理，优先。
    target_key_sig = None
    if semitones is None:
        tk = _parse_transpose_target_key(text)
        if tk:
            target_name, target_pc = tk
            # 当前调来源：① 谱面有真实调号 → 用 global.key（可信）；
            # ② 否则必须用户在指令里显式给源调（"从 C 调…"），绝不能拿默认 C major 瞎猜。
            current_pc = _current_tonic_pc(score) if source_has_key_signature else None
            if current_pc is None:
                current_pc = _parse_source_key(text)
            if current_pc is None:
                return RulePatchGenerationResult(
                    "unsupported",
                    reason="这份谱面没有记录调号，无法确定移调音程。请告诉我原曲当前是什么调，例如「把这首从 C 调移调到 D 调」，或改用「升高/降低 N 个半音」。",
                    matched_intents=("transpose_to_key",),
                )
            semitones = _interval_semitones(current_pc, target_pc)
            if target_name in _SUPPORTED_KEY_SIGS:
                target_key_sig = target_name
    try:
        scope_resolution = resolve_instruction_target_scope(
            score,
            instruction,
            target_scope_payload,
            preserve_global_scope=key_signature is not None or time_signature is not None,
        )
    except (TypeError, ValueError) as exc:
        return RulePatchGenerationResult("unsupported", reason=f"Invalid score scope: {exc}")
    if not scope_resolution.valid or scope_resolution.effective_scope is None:
        return RulePatchGenerationResult(
            "unsupported",
            reason=scope_resolution.reason or "The instruction location is outside the current host selection.",
            matched_intents=("scope",),
        )
    target_scope = scope_resolution.effective_scope
    # 目标调式转调是整曲操作：移调 + 改调号必须同时作用于整份谱，
    # 否则会出现「只移了第 1 小节、调号却变 D」的破谱。强制整曲作用域。
    if target_key_sig is not None:
        target_scope = ScoreScope(whole_score=True)

    contexts = target_scope.select(score)
    notes = _note_contexts(contexts)
    note_ids = [context.event_id for context in notes]

    operations: list[dict[str, Any]] = []
    intents: list[str] = []
    if any(value is not None for value in (semitones, dynamic, articulation, voice_target, replacement_pitch, replacement_chord)) and not note_ids:
        return RulePatchGenerationResult("unsupported", reason="The selected scope contains no editable note events.")

    if key_signature is not None:
        intents.append("change_key_signature")
        _operation(operations, "change_key_signature", {}, {"key": key_signature}, None)

    # 目标调式转调：同时把调号改成目标调（仅当导出器支持该调名）。
    if target_key_sig is not None:
        intents.append("change_key_signature")
        _operation(operations, "change_key_signature", {}, {"key": target_key_sig}, None)

    if time_signature is not None:
        intents.append("change_time_signature")
        _operation(operations, "change_time_signature", {}, {"meter": time_signature}, None)

    if time_signature is not None and re.search(r"remov(?:e|ing) the final quarter-note event from each staff|删除.*每.*谱表.*最后.*四分音符", text):
        final_ids = _final_lane_note_ids(notes)
        if not final_ids:
            return RulePatchGenerationResult(
                "unsupported",
                reason="The requested rebar could not identify one final quarter-note event in every selected staff/voice lane.",
            )
        intents.append("delete_event")
        _operation(operations, "delete_event", {"event_ids": final_ids}, {}, len(final_ids))

    if merge:
        if len(notes) < 2:
            return RulePatchGenerationResult("unsupported", reason="Merging requires at least two selected rhythmic events.")
        duration = _merged_duration(notes[0], notes[1])
        if duration is None:
            return RulePatchGenerationResult("unsupported", reason="The first two rhythmic units do not merge into one supported duration.")
        intents.extend(("set_duration", "delete_event"))
        _operation(operations, "set_duration", {"event_ids": [notes[0].event_id]}, {"duration": duration}, 1)
        _operation(operations, "delete_event", {"event_ids": [notes[1].event_id]}, {}, 1)

    if replacement_chord is not None:
        selected = _positioned_notes(text, notes)
        if len(selected) != 1:
            return RulePatchGenerationResult("unsupported", reason="Chord replacement requires exactly one positional anchor note.")
        intents.append("replace_chord")
        _operation(operations, "replace_chord", {"event_ids": [selected[0].event_id]}, {"pitches": replacement_chord}, 4)
    elif replacement_pitch is not None:
        selected = _positioned_notes(text, notes)
        if len(selected) != 1:
            return RulePatchGenerationResult("unsupported", reason="Note replacement requires exactly one positional anchor note.")
        anchor = selected[0]
        replacement_id = f"{anchor.event_id}_replacement"
        intents.extend(("delete_event", "insert_note"))
        _operation(operations, "delete_event", {"event_ids": [anchor.event_id]}, {}, 1)
        _operation(
            operations,
            "insert_note",
            {"measure": anchor.measure},
            {
                "event_id": replacement_id,
                "pitch": replacement_pitch,
                "duration": str(anchor.event.get("duration", "quarter")),
                "offset": float(anchor.offset),
                "voice": anchor.voice,
                "staff": anchor.staff,
                "dynamic": str(anchor.event.get("dynamic", "mf")),
                "articulations": list(anchor.event.get("articulations") or []),
                "tie": anchor.event.get("tie"),
                "slur": anchor.event.get("slur"),
            },
            1,
        )

    if voice_target is not None:
        intents.append("move_to_voice")
        _operation(operations, "move_to_voice", {"event_ids": note_ids}, {"voice": voice_target}, len(note_ids))

    if slur:
        if len(notes) < 2:
            return RulePatchGenerationResult("unsupported", reason="A slur requires at least two selected notes.")
        intents.append("set_slur")
        _operation(operations, "set_slur", {"event_ids": [notes[0].event_id]}, {"slur": "start"}, 1)
        _operation(operations, "set_slur", {"event_ids": [notes[-1].event_id]}, {"slur": "stop"}, 1)

    if semitones is not None:
        selected = _positioned_notes(text, notes)
        intents.append("transpose")
        _operation(operations, "transpose", {"event_ids": [context.event_id for context in selected]}, {"semitones": semitones}, len(selected))
    if dynamic is not None:
        selected = (
            notes[-1:]
            if semitones is not None
            and re.search(r"mark (?:the )?(?:final|last) note|把最后一个音标为|最后一个音.*强奏", text)
            else _positioned_notes(text, notes)
        )
        intents.append("set_dynamic")
        _operation(operations, "set_dynamic", {"event_ids": [context.event_id for context in selected]}, {"dynamic": dynamic}, len(selected))
    if articulation is not None:
        selected = _positioned_notes(text, notes)
        intents.append("set_articulation")
        _operation(operations, "set_articulation", {"event_ids": [context.event_id for context in selected]}, {"articulations": [articulation]}, len(selected))
    if not operations:
        return RulePatchGenerationResult(
            "unsupported",
            reason=(
                "Local rules currently support explicit, deterministic notation instructions for pitch, rhythm "
                "merge, note/chord replacement, voice, dynamics/articulation, slur, key, and meter."
            ),
        )

    fingerprint = score_fingerprint(score)
    changes_existing_duration = merge
    expected_effects = [] if changes_existing_duration else [{"type": "preserve_duration"}]
    if semitones is None and replacement_pitch is None and replacement_chord is None:
        expected_effects.append({"type": "preserve_pitch"})
    global_operation_types = {"change_key_signature", "change_time_signature"}
    global_property_only = bool(operations) and all(
        operation.get("type") in global_operation_types for operation in operations
    )
    requires_whole_score = any(
        operation.get("type") in global_operation_types for operation in operations
    )
    requested_target = requested_target_scope.as_dict()
    canonical_target = (
        ScoreScope(whole_score=True).as_dict()
        if requires_whole_score
        else target_scope.as_dict()
    )
    if requires_whole_score and not target_scope.whole_score:
        final_scope_resolution = (
            "promoted_to_whole_score_for_global_key_signature"
            if global_property_only and key_signature is not None and time_signature is None
            else "promoted_to_whole_score_for_global_property"
        )
    else:
        final_scope_resolution = scope_resolution.status
    patch = {
        "schema_version": "1.0.0",
        "patch_id": _stable_patch_id(str(score.get("score_id", "")), fingerprint, instruction, canonical_target),
        "source_score_id": str(score.get("score_id", "")),
        "source_fingerprint": fingerprint,
        "instruction": instruction.strip(),
        "target_scope": canonical_target,
        "protected_scope": protected_scope.as_dict(),
        "preconditions": [],
        "operations": operations,
        "expected_effects": expected_effects,
        "provenance": {
            "provider": "local_rule",
            "model": "seraedit_rule_v1",
            "temperature": 0,
            "seed": 0,
            "prompt_version": "local_rule_v1.0",
            "formal_experiment_eligible": False,
            **scope_resolution.provenance(),
            "scope_resolution": final_scope_resolution,
            "requested_target_scope": requested_target,
        },
    }
    return RulePatchGenerationResult("generated", patch=patch, matched_intents=tuple(intents))
