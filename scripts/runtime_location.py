"""Resolve the portable CosyVoice runtime while preserving existing installations."""
import os
from pathlib import Path

def cosyvoice_runtime(prefer_local=False):
    override=os.getenv('PIANO_COSY_RUNTIME')
    if override:return Path(override).expanduser()
    local=Path(__file__).resolve().parents[1]/'.sites-runtime/cosyvoice'
    if prefer_local or local.exists():return local
    return Path('C:/PianoCoachRuntime/cosyvoice')
