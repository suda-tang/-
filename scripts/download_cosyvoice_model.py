"""Fetch CosyVoice 3 weights into the isolated local runtime."""
from pathlib import Path

from modelscope import snapshot_download


target = Path(r"C:\PianoCoachRuntime\cosyvoice\pretrained_models\Fun-CosyVoice3-0.5B")
target.parent.mkdir(parents=True, exist_ok=True)
snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir=str(target))
print(f"ready={target}", flush=True)
