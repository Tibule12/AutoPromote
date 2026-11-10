"""Bounded private comparison using an MIT background-conditioned model.

The photographed empty set was not supplied. Its background is estimated and
partly observed from another source frame; retain that limitation explicitly.
No generated RGB, new product capability, or commercial qualification is implied.
"""
from pathlib import Path
import argparse
import hashlib
import json
import socket
import subprocess
import time

import cv2
import numpy as np
import torch
from PIL import Image

from model_workers.adapters.component_segmentation import ComponentVideoTracker


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False, mode=0o700)
    evaluation = Path("/dev/shm/autopromote-background-reassessment-20261103")
    root = Path("reports/background-replacement-20261101/private")
    model_root = Path("/home/tibule12/.cache/autopromote-model-runtime")
    model_path = model_root / "backgroundmattingv2-mit-eval-v1/model.pth"
    assert hashlib.file_digest(model_path.open("rb"), "sha256").hexdigest() == "6d449e8a0445438491cf07c03a6e86f21df2b3aa2dc630d9430347fcb807aae4"
    torch.set_num_threads(3)
    torch.set_num_interop_threads(1)
    cv2.setNumThreads(1)
    socket.socket.connect = lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("Local inference only"))
    model = torch.jit.load(str(model_path), map_location="cpu").eval()
    model.backbone_scale = .5
    model.refine_mode = "full"
    background = np.array(Image.open(evaluation / "background-conditioned-observed-eval/estimated-source-background.png"))
    bg = torch.from_numpy(background.copy()).permute(2, 0, 1)[None].float() / 255
    bg = torch.nn.functional.pad(bg, (0, 2, 0, 0), mode="replicate")
    sam = next(m for m in json.loads(Path("config/model-runtime/registry.v1.json").read_text())["models"]
               if m["id"] == "sam21-multiobject-cpu-v2")
    selection = json.loads((evaluation / "whole-person-5400/parameters.json").read_text())["parameters"]
    regs = json.loads((root / "long-podcast-r7/registration.json").read_text())["rows"]
    master = "/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4"
    source = subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-threads", "1", "-i", master,
                               "-vf", r"fps=24,select=between(n\,5376\,5423),setpts=PTS-STARTPTS",
                               "-vsync", "0", "-frames:v", "48", "-an", "-pix_fmt", "rgb24",
                               "-f", "rawvideo", "pipe:1"], stdout=subprocess.PIPE)
    frames = []
    try:
        for index in range(48):
            raw = source.stdout.read(1920 * 1080 * 3)
            assert len(raw) == 1920 * 1080 * 3
            rgb = cv2.warpAffine(np.frombuffer(raw, np.uint8).reshape(1080, 1920, 3),
                                 np.array(regs[(5376 + index) // 6]["matrix"]), (1440, 1000),
                                 flags=cv2.INTER_LANCZOS4)
            frames.append(cv2.resize(rgb, (1430, 1000), interpolation=cv2.INTER_LANCZOS4))
        assert not source.stdout.read(1) and source.wait() == 0
    finally:
        if source.poll() is None:
            source.kill()
            source.wait()
    assert np.array_equal(frames[24], np.array(Image.open(evaluation / "registered-source-5400.png")))
    for name in ["alpha", "foreground", "person-evidence", "source"]:
        (out / name).mkdir()
    xx, yy = np.meshgrid(np.arange(1430, dtype=np.float32), np.arange(1000, dtype=np.float32))
    flow_engine = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    started = time.monotonic()
    rows = {}
    shared = None
    for direction, indices in [("forward", range(24, 48)), ("backward", range(24, -1, -1))]:
        tracker = ComponentVideoTracker({"model": sam, "request": {"parameters": selection}},
                                        {"width": 1430, "height": 1000}, model_root / "sam21-small-pinned",
                                        model=shared)
        shared = tracker.model
        previous = None
        mask = None
        for step, index in enumerate(indices):
            rgb = frames[index]
            gray = cv2.resize(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), (715, 500))
            if step % 4 == 0:
                mask = tracker.frame(rgb, step // 4)[0]
            else:
                flow = cv2.resize(flow_engine.calc(gray, previous, None), (1430, 1000)) * 2
                mask = cv2.remap(mask, xx + flow[:, :, 0], yy + flow[:, :, 1], cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_CONSTANT)
            previous = gray
            if direction == "backward" and index == 24:
                continue
            src = torch.from_numpy(rgb.copy()).permute(2, 0, 1)[None].float() / 255
            src = torch.nn.functional.pad(src, (0, 2, 0, 0), mode="replicate")
            with torch.inference_mode():
                alpha, foreground, *_ = model(src, bg)
            values = alpha[0, 0, :, :1430].numpy().clip(0, 1)
            colour = foreground[0, :, :, :1430].permute(1, 2, 0).numpy().clip(0, 1)
            # A body model is not foreground-object selection: bound unrelated
            # false positives but leave a generous unknown band around motion.
            domain = cv2.dilate((mask >= 64).astype(np.uint8), np.ones((41, 41), np.uint8)) > 0
            values[~domain] = 0
            Image.fromarray(np.rint(values * 255).astype(np.uint8)).save(out / "alpha" / f"{index:04d}.png")
            Image.fromarray(np.rint(colour * 255).astype(np.uint8)).save(out / "foreground" / f"{index:04d}.png")
            Image.fromarray(mask).save(out / "person-evidence" / f"{index:04d}.png")
            Image.fromarray(rgb).save(out / "source" / f"{index:04d}.png")
            rows[index] = {"sourceFrame": 5376 + index, "direction": direction,
                           "freshBackgroundMattingInference": True, "personSamKey": step % 4 == 0,
                           "sourceFlowIntermediate": step % 4 != 0}
            (out / "progress.json").write_text(json.dumps({"frames": len(rows), "target": 48,
                                                           "elapsedSeconds": time.monotonic() - started}))
            print("ACTUAL_BACKGROUND_CONDITIONED_FRAME", index, len(rows), flush=True)
    assert len(rows) == 48
    (out / "receipt.json").write_text(json.dumps({"sourceFrames": [5376, 5423], "frames": 48,
                                                "backgroundIsEstimatedNotCapturedEmptySet": True,
                                                "backgroundPartlyObservedAtSource55Seconds": True,
                                                "model": "BackgroundMattingV2-MIT-v1.0.0",
                                                "modelSha256": "6d449e8a0445438491cf07c03a6e86f21df2b3aa2dc630d9430347fcb807aae4",
                                                "currentPersonKeysHz": 6, "sourceFlowHz": 24,
                                                "paidCloud": False, "visualPass": False,
                                                "elapsedSeconds": time.monotonic() - started,
                                                "rows": [rows[i] for i in range(48)]}, indent=2))
    print("ACTUAL_BACKGROUND_CONDITIONED_48_COMPLETE", flush=True)


if __name__ == "__main__":
    main()
