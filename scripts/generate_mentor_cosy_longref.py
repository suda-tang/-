"""Create a higher-fidelity private CosyVoice mentor preview from a longer reference."""
from pathlib import Path
import sys
import traceback

import soundfile as sf
import torch

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path(r"C:\PianoCoachRuntime\cosyvoice")
sys.path.insert(0, str(RUNTIME / "CosyVoice-main"))
from cosyvoice.cli.cosyvoice import CosyVoice3

MODEL = RUNTIME / "pretrained_models" / "Fun-CosyVoice3-0.5B"
VOICE = ROOT / ".sites-runtime" / "voice-reference" / "processed" / "f922ad0fa273a637876ad1b4d9ddbef3"
REFERENCE = VOICE / "reference-long-clean.wav"
OUTPUT = VOICE / "mentor-preface-cosy-longref.wav"

# Manually corrected for the retained continuous reference speech, rather
# than using the noisy automatic transcript stored for diagnostics.
PROMPT = (
    "You are a helpful assistant.<|endofprompt|>"
    "今年已经是我从教的第二十七个年头了。我一直是在苏州大学从事音乐教育的工作。"
    "我的学生他们毕业以后也大多是在苏州的中小学任教。我的视角就从开始关注他们的就业，"
    "进而转化到今天开始关注他们还会面临到的一些育托的问题。"
)
TEXT = "欢迎您观看唐秋鸣的钢琴学习项目演示。"


def main() -> None:
    torch.set_num_threads(8)
    torch.set_num_interop_threads(1)
    print("loading model", flush=True)
    model = CosyVoice3(str(MODEL), fp16=False)
    print("model loaded; generating extended-reference preview", flush=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with sf.SoundFile(OUTPUT, "w", samplerate=model.sample_rate, channels=1, subtype="PCM_16") as writer:
        count = 0
        for result in model.inference_zero_shot(TEXT, PROMPT, str(REFERENCE), stream=True, speed=1.0, text_frontend=False):
            wave = result["tts_speech"].squeeze(0).detach().cpu().numpy()
            writer.write(wave)
            count += 1
            print(f"chunk={count} samples={len(wave)}", flush=True)
    if count == 0 or OUTPUT.stat().st_size < 4096:
        raise RuntimeError("CosyVoice returned no usable audio")
    print(f"complete={OUTPUT} bytes={OUTPUT.stat().st_size}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise
