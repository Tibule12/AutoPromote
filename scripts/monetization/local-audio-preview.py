"""Bounded local transport into the canonical Remix Audio preview renderer."""
import json
import os
from pathlib import Path
import resource
import sys

if os.environ.get("UNIFIED_CREDITS_PROJECT_ID") != "demo-autopromote-credits":
    raise RuntimeError("Local demo required")
resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
resource.setrlimit(resource.RLIMIT_FSIZE, (4 * 1024**2, 4 * 1024**2))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from python_media_worker.viral_audio_remix import render_audio_remix_preview

request = json.loads(Path(sys.argv[1]).read_text())
receipt = render_audio_remix_preview(request["source"], request["output"], request["settings"],
    start_time=request["start"], duration=request["duration"], include_voice=True)
Path(request["receipt"]).write_text(json.dumps(receipt))
