"""Generate a private, CPU-only CosyVoice comparison narration.

The script deliberately treats the output as a comparison file. Existing
approved ZipVoice previews are never overwritten.
"""
from pathlib import Path
import sys
import time
import traceback

import torch
import torchaudio

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path(r"C:\PianoCoachRuntime\cosyvoice")
sys.path.insert(0, str(RUNTIME / "CosyVoice-main"))

from cosyvoice.cli.cosyvoice import CosyVoice3

MODEL = RUNTIME / "pretrained_models" / "Fun-CosyVoice3-0.5B"
REFERENCE = ROOT / ".sites-runtime" / "voice-reference" / "processed" / "ddbaeca4c9704c390bf1dc50d26b7eb6" / "reference.wav"
OUTPUT = ROOT / ".sites-runtime" / "voice-reference" / "processed" / "ddbaeca4c9704c390bf1dc50d26b7eb6" / "self-narration-cosy.wav"

# Exact transcript of the selected clean reference. Keeping it exact prevents
# the prompt-text mismatch that caused swallowed syllables in the prior path.
# CosyVoice 3 requires this exact control boundary before the reference text.
PROMPT_TEXT = "You are a helpful assistant.<|endofprompt|>老师您好，我是唐秋鸣，现在在苏州大学学习音乐教育，主项是钢琴。"
TARGET_TEXT = "我不想把这个项目只做成一个会报分数的程序。我更在意的是，学生在某一处反复弹错时，系统能不能让他知道自己究竟卡在哪里。"


def main() -> None:
    print("loading model", flush=True)
    model = CosyVoice3(str(MODEL), fp16=False)
    print("model loaded; beginning synthesis", flush=True)
    chunks = []
    started = time.monotonic()
    for result in model.inference_zero_shot(
        TARGET_TEXT, PROMPT_TEXT, str(REFERENCE), stream=False, speed=1.0, text_frontend=False
    ):
        chunks.append(result["tts_speech"])
    if not chunks:
        raise RuntimeError("CosyVoice did not return audio.")
    speech = torch.cat(chunks, dim=1)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    torchaudio.save(str(OUTPUT), speech, model.sample_rate)
    seconds = speech.shape[1] / model.sample_rate
    print(f"wrote={OUTPUT} seconds={seconds:.2f} elapsed={time.monotonic() - started:.1f}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise
