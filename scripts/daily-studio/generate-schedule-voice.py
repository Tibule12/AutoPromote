#!/usr/bin/env python3
"""Disclosed preset narration on local CPU; no cloned identity or paid service."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "reports/daily-studio/voice-runtime"))
import numpy as np
import soundfile as sf
import onnxruntime as ort
from kokoro_onnx import Kokoro

folder = ROOT / "reports/daily-studio/2026-10-17/schedule-tour"
folder.mkdir(parents=True, exist_ok=True)
model = ROOT / "reports/daily-studio/models/kokoro-onnx"
settings = ort.SessionOptions()
settings.intra_op_num_threads = 2
settings.inter_op_num_threads = 1
session = ort.InferenceSession(str(model / "kokoro-v1.0.int8.onnx"), sess_options=settings, providers=["CPUExecutionProvider"])
voice = Kokoro.from_session(session, str(model / "voices-v1.0.bin"))
lines = [
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
    audio, rate = voice.create(text, voice="bf_emma", speed=1.02, lang="en-gb")
    audio = np.concatenate([audio, np.zeros(int(rate * 0.5), dtype=np.float32)])
    file = folder / (name + ".wav")
    sf.write(file, audio, rate, subtype="PCM_16")
    segments.append({"id": name, "text": text, "start": clock, "seconds": len(audio) / rate, "path": str(file.relative_to(ROOT))})
    joined.append(audio)
    clock += len(audio) / rate
raw = folder / "narration-24k.wav"
sf.write(raw, np.concatenate(joined), rate, subtype="PCM_16")
target = folder / "narration.wav"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", "loudnorm=I=-18:TP=-2:LRA=7", "-ar", "48000", "-ac", "2", str(target)], check=True)
(folder / "narration-receipt.json").write_text(json.dumps({"model": "Kokoro-82M/ONNX int8", "voice": "bf_emma", "device": "CPUExecutionProvider", "gpuJobs": 0, "syntheticPresetVoice": True, "voiceCloning": False,
    "disclosure": "Synthetic narration using a standard model preset; no real person's identity is represented.",
    "modelReceipt": str((model / "model-receipt.json").relative_to(ROOT)), "segments": segments, "seconds": clock,
    "output": str(target.relative_to(ROOT)), "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}, indent=2))
print(json.dumps({"segments": len(segments), "seconds": clock, "cpuOnly": True}))
