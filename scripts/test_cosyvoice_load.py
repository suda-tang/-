"""Isolated CosyVoice runtime smoke test (the runtime itself lives outside the repo)."""
from pathlib import Path
try:
    from .runtime_location import cosyvoice_runtime
except ImportError:
    from runtime_location import cosyvoice_runtime
import sys

RUNTIME = cosyvoice_runtime()
SOURCE = RUNTIME / "CosyVoice-main"
MODEL = RUNTIME / "pretrained_models" / "Fun-CosyVoice3-0.5B"
sys.path.insert(0, str(SOURCE))

print("starting CosyVoice 3 model load", flush=True)
from cosyvoice.cli.cosyvoice import CosyVoice3

model = CosyVoice3(str(MODEL), fp16=False)
print(f"model-loaded sample_rate={model.sample_rate}", flush=True)
