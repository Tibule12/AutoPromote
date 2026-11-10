"""Refine the head/shoulder boundary of the private source-bound rotoscope.

Uses the same pinned local CPU recurrent matte; original files remain untouched.
Writes a new alpha generation, so invalidated render inputs cannot be reused.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import time

os.environ.update(CUDA_VISIBLE_DEVICES="", OMP_NUM_THREADS="2")
report = Path(__file__).resolve().parent
sys.path.insert(0, str(report / "private-local/matting-deps"))
import numpy as np
import onnxruntime as ort
from PIL import Image

model = Path.home() / ".cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx"
assert hashlib.sha256(model.read_bytes()).hexdigest() == json.loads((model.parent / "provenance.json").read_text())["sha256"]
opts = ort.SessionOptions()
opts.intra_op_num_threads = 2
opts.inter_op_num_threads = 1
session = ort.InferenceSession(str(model), sess_options=opts, providers=["CPUExecutionProvider"])
source = report / "private-local/source"
target = source / "refined-alpha-frames"
target.mkdir(exist_ok=True)
states = []
started = time.monotonic()
for index in range(391):
    if index in [0, 28]:
        states = [np.zeros((1, 1, 1, 1), np.float32) for _ in range(4)]
    file = source / "alpha-frames" / f"{index+1:06d}.png"
    while not file.exists():
        time.sleep(.5)
    while True:
        try:
            rgba = np.array(Image.open(file).convert("RGBA"))
            break
        except (OSError, ValueError):
            time.sleep(.2)  # Decoder can still be writing this PNG.
    rgb = rgba[:, :, :3]
    _, alpha, *states = session.run(None, {"src": rgb.transpose(2, 0, 1)[None].astype(np.float32) / 255,
        **{f"r{i+1}i": state for i, state in enumerate(states)}, "downsample_ratio": np.array([.5], np.float32)})
    prior = np.clip(alpha[0, 0], 0, 1)
    # Replace the top of the hard colour-model selection with the temporal
    # person prior. This removes the retained rectangular wall at the neck.
    rgba[:350, :, 3] = np.rint(np.clip((prior[:350] - .1) / .85, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(rgba).save(target / file.name)
    if (index + 1) % 48 == 0:
        print(json.dumps({"refinedFrames": index+1, "seconds": time.monotonic()-started}), flush=True)
    for end, first, name in [(195, 1, "a"), (391, 196, "b")]:
        if index + 1 == end:
            output = source / f"presenter-alpha-{name}-refined.mov"
            subprocess.run(["ffmpeg", "-v", "error", "-framerate", "24", "-start_number", str(first),
                "-i", str(target / "%06d.png"), "-frames:v", str(end-first+1),
                "-vf", "pad=1280:720:280:0:color=black@0,format=argb", "-c:v", "qtrle", "-threads", "2", str(output)], check=True)
            (source / f"refined-shot-{name}.json").write_text(json.dumps({
                "path": str(output), "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                "frames": end-first+1, "fps": 24, "source": "original source-bound private matte with temporal head refinement"}, indent=2))
            print("Refined alpha shot ready:", name, flush=True)
