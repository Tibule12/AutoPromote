#!/usr/bin/env python3
"""Disclosed preset narration on local CPU; no cloned identity or paid service."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import argparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "reports/daily-studio/voice-runtime"))
import numpy as np
import soundfile as sf
import onnxruntime as ort
from kokoro_onnx import Kokoro

parser = argparse.ArgumentParser()
parser.add_argument('--script', type=Path)
parser.add_argument('--out', type=Path)
args = parser.parse_args()
spec = json.loads(args.script.read_text()) if args.script else {}
folder = (args.out or ROOT / "reports/daily-studio/2026-10-17/schedule-tour").resolve()
folder.mkdir(parents=True, exist_ok=True)
assert not (folder / 'narration-receipt.json').exists(), 'Preserve the existing narration and receipt'
model = ROOT / "reports/daily-studio/models/kokoro-onnx"
settings = ort.SessionOptions()
settings.intra_op_num_threads = 2
settings.inter_op_num_threads = 1
session = ort.InferenceSession(str(model / "kokoro-v1.0.int8.onnx"), sess_options=settings, providers=["CPUExecutionProvider"])
voice = Kokoro.from_session(session, str(model / "voices-v1.0.bin"))
lines = spec.get('segments') or [
    ("overview", "One edit. Six destinations. Each with its own publishing time."),
    ("calendar", "This calendar shows the releases currently scheduled. Their dates, platform icons, and status stay visible."),
    ("preview", "Open a release to preview the video and check the post copy."),
    ("destination", "Expand a destination to see its caption and exact time. Reschedule one platform, or pause the release."),
    ("delivery", "At the chosen time, Auto Promote sends the content to that connected account. Watch the queue for publishing progress and confirmation."),
    ("closing", "See what's going out, where it's going, and when."),
]
segments = []
joined = []
clock = 0.0
for name, text in lines:
    voice_name = spec.get('voice', 'bf_emma')
    speed = spec.get('speed', 1.02)
    lang = spec.get('lang', 'en-gb')
    audio, rate = voice.create(text, voice=voice_name, speed=speed, lang=lang)
    budget = spec.get('budgets', {}).get(name)
    if budget and len(audio)/rate > budget-.12:
        speed = min(1.15, speed*(len(audio)/rate)/(budget-.2))
        audio, rate = voice.create(text, voice=voice_name, speed=speed, lang=lang)
    if budget:
        assert len(audio)/rate <= budget, f'Rewrite {name}: speech exceeds its natural timing budget'
        padding = round(budget*rate)-len(audio)
    else:
        padding = int(rate*.5)
    audio = np.concatenate([audio, np.zeros(padding, dtype=np.float32)])
    file = folder / (name + ".wav")
    sf.write(file, audio, rate, subtype="PCM_16")
    segments.append({"id": name, "text": text, "start": clock, "seconds": len(audio) / rate,
                     "synthesisSpeed": speed, "path": str(file.relative_to(ROOT))})
    joined.append(audio)
    clock += len(audio) / rate
raw = folder / "narration-24k.wav"
sf.write(raw, np.concatenate(joined), rate, subtype="PCM_16")
target = folder / "narration.wav"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", "loudnorm=I=-18:TP=-2:LRA=7", "-ar", "48000", "-ac", "2", str(target)], check=True)
(folder / "narration-receipt.json").write_text(json.dumps({"model": "Kokoro-82M/ONNX int8", "voice": spec.get('voice', 'bf_emma'), "device": "CPUExecutionProvider", "gpuJobs": 0, "syntheticPresetVoice": True, "voiceCloning": False,
    "disclosure": "Synthetic narration using a standard model preset; no real person's identity is represented.",
    "modelReceipt": str((model / "model-receipt.json").relative_to(ROOT)), "segments": segments, "seconds": clock,
    "output": str(target.relative_to(ROOT)), "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}, indent=2))
print(json.dumps({"segments": len(segments), "seconds": clock, "cpuOnly": True}))
