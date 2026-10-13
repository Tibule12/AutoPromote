"""Actual-source motion typography samples, not a finished editorial cut."""
import argparse
import io
import json
from pathlib import Path
from PIL import Image
from python_media_worker.main_media_server import build_reviewed_reframe_filter
from viral_motion_graphics import draw_motion_frame, normalize_motion, run

parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=False)
samples = [
    ("host", 3, 29, "lower_third", "Lisakhanya Mdoda", "HOST · UNMUTED", 78),
    ("headline", 11, 29, "title", "WE'RE BACK.", "UNMUTED PODCAST", 77),
    ("guest", 50.5, 73, "lower_third", "Siphamandla Tsephe", "GUEST · UNMUTED", 78),
]
for label, time, x, preset, text, secondary, y in samples:
    framing = build_reviewed_reframe_filter([{"time": 0, "x": x, "y": 40}], 1080, 1920, zoom=1.05)
    frame = run(["ffmpeg", "-v", "error", "-ss", str(time), "-i", args.source,
        "-vf", framing, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"])
    source = Image.open(io.BytesIO(frame)).convert("RGBA")
    scene = normalize_motion({"id": label, "design": "editorial", "preset": preset, "text": text,
        "secondary": secondary, "startTime": 0, "duration": 4, "x": 50, "y": y, "scale": 1,
        "endScale": 1, "color": "#f4a36b"})
    source.alpha_composite(draw_motion_frame([scene], 1, 1080, 1920))
    source.convert("RGB").save(out / f"{label}.png")
    (out / f"{label}-scene.json").write_text(json.dumps(scene, indent=2))
print(str(out))
