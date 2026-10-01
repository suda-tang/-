"""Prepare owner-authorised recordings for a later speaker-adaptation model.

This does not train a voice model and never publishes audio.  It builds a local
manifest of spoken segments from every selected recording so an adaptation model
can use the full material without treating a whole video as one prompt.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

import imageio_ffmpeg


ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / '.sites-runtime' / 'voice-reference'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def duration(path: Path) -> float:
    result = subprocess.run(
        [FFMPEG, '-hide_banner', '-i', str(path)], capture_output=True, text=True, encoding='utf-8', errors='replace'
    )
    match = re.search(r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)', result.stderr)
    if not match:
        raise RuntimeError(f'无法读取时长：{path.name}')
    hour, minute, second = match.groups()
    return int(hour) * 3600 + int(minute) * 60 + float(second)


def extract(source: Path, target: Path, start: float, seconds: float) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [FFMPEG, '-v', 'error', '-y', '-ss', f'{start:.2f}', '-t', f'{seconds:.2f}', '-i', str(source),
         '-map', '0:a:0', '-ac', '1', '-ar', '24000',
         '-af', 'highpass=f=70,lowpass=f=8000,loudnorm=I=-18:TP=-2:LRA=7', str(target)],
        check=True,
    )


def make_segments(source: Path, identifier: str, role: str, known_text: str, out: Path) -> list[dict]:
    total = duration(source)
    # Twelve-second windows retain natural prosody while keeping inference and
    # later forced alignment tractable.  A 0.35 second overlap avoids cutting
    # a consonant at a window boundary.
    start, index, rows = 0.0, 0, []
    while start < total - 2:
        seconds = min(12.0, total - start)
        if seconds < 2.5:
            break
        filename = f'{identifier}-{index:03d}.wav'
        target = out / role / filename
        extract(source, target, start, seconds)
        rows.append({
            'id': f'{identifier}-{index:03d}', 'speaker': role, 'sourceId': identifier,
            'file': str(target.relative_to(out.parent)).replace('\\', '/'),
            'start': round(start, 2), 'end': round(start + seconds, 2),
            # Personal recordings have a verified full script.  A later
            # aligner will split it at exact utterance boundaries; mentor
            # recordings remain explicitly untranscribed until verified.
            'text': known_text if role == 'tang' and index == 0 else '',
            'textStatus': 'needs-alignment' if known_text else 'needs-transcript',
        })
        index += 1
        start += 11.65
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default=str(STORE / 'dataset'))
    args = parser.parse_args()
    out = Path(args.output)
    rows: list[dict] = []
    for metadata_file in STORE.glob('*.json'):
        try:
            metadata = json.loads(metadata_file.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        identifier = metadata.get('id', '')
        if not re.fullmatch(r'[a-f0-9]{32}', identifier):
            continue
        role = 'mentor' if metadata.get('role') == 'mentor' else 'tang'
        source = next((item for item in STORE.glob(identifier + '.*') if item.suffix.lower() != '.json'), None)
        if not source:
            continue
        rows.extend(make_segments(source, identifier, role, str(metadata.get('text', '')).strip(), out))
    manifest = {'version': 1, 'private': True, 'segments': rows}
    out.mkdir(parents=True, exist_ok=True)
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'prepared={len(rows)} mentor={sum(r["speaker"] == "mentor" for r in rows)} tang={sum(r["speaker"] == "tang" for r in rows)}')


if __name__ == '__main__':
    main()
