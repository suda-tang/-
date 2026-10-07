"""Fetch CosyVoice 3 weights into the isolated local runtime."""
from pathlib import Path
try:
    from .runtime_location import cosyvoice_runtime
except ImportError:
    from runtime_location import cosyvoice_runtime

from modelscope import snapshot_download


target = cosyvoice_runtime(prefer_local=True)/'pretrained_models/Fun-CosyVoice3-0.5B'
target.parent.mkdir(parents=True, exist_ok=True)
snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir=str(target))
print(f"ready={target}", flush=True)
