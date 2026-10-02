"""Generate a local, review-only ZipVoice trial from an authorised reference clip.

The script is deliberately offline after model downloads.  It does not publish the
reference material or synthesized file; the web server can expose a preview only
through the existing private voice-reference access key.
"""

from __future__ import annotations

import argparse
import os
import time
from pathlib import Path

import sherpa_onnx
import soundfile as sf


ROOT = Path(__file__).resolve().parents[1]
MODEL = Path(os.environ.get("PIANO_COACH_VOICE_MODEL_DIR", ROOT / ".sites-runtime" / "voice-models"))
ZIPVOICE = MODEL / "sherpa-onnx-zipvoice-distill-int8-zh-en-emilia"


def create_tts() -> sherpa_onnx.OfflineTts:
    # espeak-ng resolves this path inside a native runtime.  Forward slashes
    # keep the Windows build from falling back to its Unix default path.
    def native_path(path: Path) -> str:
        # The Windows sherpa build resolves ZipVoice's eSpeak directory
        # correctly from a relative POSIX path.  Passing C:/... can fall back
        # to its Unix default (/usr/share/espeak-ng-data) in older bindings.
        try:
            return path.resolve().relative_to(ROOT.resolve()).as_posix()
        except ValueError:
            return path.resolve().as_posix()

    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            zipvoice=sherpa_onnx.OfflineTtsZipvoiceModelConfig(
                tokens=native_path(ZIPVOICE / "tokens.txt"),
                encoder=native_path(ZIPVOICE / "encoder.int8.onnx"),
                decoder=native_path(ZIPVOICE / "decoder.int8.onnx"),
                data_dir=native_path(ZIPVOICE / "espeak-ng-data"),
                lexicon=native_path(ZIPVOICE / "lexicon.txt"),
                vocoder=native_path(MODEL / "vocos_24khz.onnx"),
            ),
            num_threads=6,
            provider="cpu",
        )
    )
    if not config.validate():
        raise RuntimeError("ZipVoice 模型文件不完整或无法在本机初始化")
    return sherpa_onnx.OfflineTts(config)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-audio", required=True)
    parser.add_argument("--reference-text", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--steps", type=int, choices=range(2, 9), default=4)
    args = parser.parse_args()

    samples, sample_rate = sf.read(args.reference_audio, dtype="float32")
    if samples.ndim > 1:
        samples = samples[:, 0]
    tts = create_tts()
    config = sherpa_onnx.GenerationConfig()
    config.reference_audio = samples
    config.reference_sample_rate = sample_rate
    config.reference_text = args.reference_text
    config.num_steps = args.steps
    config.extra["min_char_in_sentence"] = "20"

    started = time.perf_counter()
    audio = tts.generate(args.text, config)
    elapsed = time.perf_counter() - started
    if not len(audio.samples):
        raise RuntimeError("ZipVoice 没有生成音频")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, audio.samples, audio.sample_rate, subtype="PCM_16")
    duration = len(audio.samples) / audio.sample_rate
    print(f"saved={output}")
    print(f"duration={duration:.2f}s elapsed={elapsed:.2f}s rtf={elapsed / duration:.2f}")


if __name__ == "__main__":
    main()
