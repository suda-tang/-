"""Local CPU transcription for an authorised voice-reference recording."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from faster_whisper import WhisperModel


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("output")
    args = parser.parse_args()
    model = WhisperModel("base", device="cpu", compute_type="int8", cpu_threads=6)
    segments, _ = model.transcribe(
        args.audio,
        language="zh",
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=False,
    )
    result = [
        {"start": round(item.start, 2), "end": round(item.end, 2), "text": item.text.strip()}
        for item in segments
    ]
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"segments={len(result)} output={target}", flush=True)


if __name__ == "__main__":
    main()
