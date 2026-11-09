"""Private, bounded movement experiment; never a qualified product model job.

Track every source frame independently of the rejected long-form masks. Separate
hand and clothing sessions can overlap without deleting each other's foreground.
ViTMatte conditions alpha on current RGB. Compose the whole frame once, without
cropped background renders. Original masks outside the explicitly tested region
remain unchanged; this does not qualify the rest of the shot.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import socket
import subprocess
import time

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw
from transformers import VitMatteForImageMatting
from pymatting import estimate_foreground_ml

from model_workers.adapters.component_segmentation import ComponentVideoTracker
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=args.resume, mode=0o700)
    started = time.monotonic()
    root = Path("reports/background-replacement-20261101/private")
    evaluation = Path("/dev/shm/autopromote-background-reassessment-20261103")
    cache_root = Path("/home/tibule12/.cache/autopromote-model-runtime")
    models = json.loads(Path("config/model-runtime/registry.v1.json").read_text())["models"]
    sam = next(m for m in models if m["id"] == "sam21-multiobject-cpu-v2")
    vit = next(m for m in models if m["id"] == "vitmatte-small-cpu-v1")
    for model, folder in [(sam, "sam21-small-pinned"), (vit, "vitmatte-small-pinned")]:
        weight = cache_root / folder / "model.safetensors"
        assert hashlib.file_digest(weight.open("rb"), "sha256").hexdigest() == model["weights"][0]["sha256"]
    cv2.setNumThreads(1)
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    socket.socket.connect = lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("Offline local inference only"))
    params = [json.loads((evaluation / folder / "parameters.json").read_text())["parameters"]
              for folder in ["fresh-arm-5400", "fresh-shirt-hand-5400"]]
    registrations = json.loads((root / "long-podcast-r7/registration.json").read_text())["rows"]
    master = Path("/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4")
    decoder = subprocess.Popen([
        "ffmpeg", "-nostdin", "-v", "error", "-threads", "1", "-i", str(master),
        "-vf", r"fps=24,select=between(n\,5376\,5423),setpts=PTS-STARTPTS",
        "-vsync", "0", "-frames:v", "48", "-an", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"
    ], stdout=subprocess.PIPE)
    frames = []
    try:
        for index in range(48):
            raw = decoder.stdout.read(1920 * 1080 * 3)
            assert len(raw) == 1920 * 1080 * 3
            original = np.frombuffer(raw, np.uint8).reshape(1080, 1920, 3)
            rgb = cv2.warpAffine(original, np.array(registrations[(5376 + index) // 6]["matrix"]),
                                 (1440, 1000), flags=cv2.INTER_LANCZOS4)
            frames.append(cv2.resize(rgb, (1430, 1000), interpolation=cv2.INTER_LANCZOS4))
        assert not decoder.stdout.read(1) and decoder.wait() == 0
    finally:
        if decoder.poll() is None:
            decoder.kill()
            decoder.wait()
    # Check the middle source sample against the independent exact-clock decode.
    assert np.array_equal(frames[24], np.array(Image.open(evaluation / "registered-source-5400.png")))
    for name in ["hand-masks", "shirt-masks", "alpha", "comparisons"]:
        (out / name).mkdir(exist_ok=args.resume)
    alpha_model = VitMatteForImageMatting.from_pretrained(cache_root / "vitmatte-small-pinned",
                                                        local_files_only=True).eval()
    shared = None
    box = (1100, 180, 1430, 730)
    x0, y0, x1, y1 = box
    rows = {}
    for direction, indices in [("forward", range(24, 48)), ("backward", range(24, -1, -1))]:
        trackers = []
        for selection in params:
            tracker = ComponentVideoTracker({"model": sam, "request": {"parameters": selection}},
                                            {"width": 1430, "height": 1000},
                                            cache_root / "sam21-small-pinned", model=shared)
            shared = tracker.model
            trackers.append(tracker)
        for step, index in enumerate(indices):
            rgb = frames[index]
            planes = [tracker.frame(rgb, step)[0] for tracker in trackers]
            if direction == "backward" and index == 24:
                continue
            if args.resume and all((out / folder / f"{index:04d}.png").exists()
                                   for folder in ["alpha", "hand-masks", "shirt-masks"]):
                retained = np.array(Image.open(out / "alpha" / f"{index:04d}.png"))
                assert retained.shape == (y1 - y0, x1 - x0)
                rows[index] = {"sourceFrame": 5376 + index, "direction": direction,
                               "freshSamTrackingEveryFrame": True, "freshVitMatteEveryFrame": True,
                               "retainedPriorActualInference": True,
                               "alphaSha256": hashlib.sha256(retained.tobytes()).hexdigest()}
                print("RESUMED_VERIFIED_BOUNDARY", index, len(rows), flush=True)
                continue
            probability = np.maximum(planes[0], planes[1])[y0:y1, x0:x1]
            binary = (probability >= 128).astype(np.uint8)
            trimap = np.full(binary.shape, 128, np.uint8)
            trimap[cv2.erode(binary, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))) > 0] = 255
            trimap[cv2.dilate(binary, np.ones((7, 7), np.uint8)) == 0] = 0
            region = rgb[y0:y1, x0:x1]
            pixels = torch.from_numpy(region.copy()).permute(2, 0, 1).float() / 127.5 - 1
            inputs = torch.cat((pixels, torch.from_numpy(trimap)[None].float() / 255), 0)[None]
            height, width = region.shape[:2]
            inputs = torch.nn.functional.pad(inputs, (0, (-width) % 32, 0, (-height) % 32))
            with torch.inference_mode():
                alpha = alpha_model(pixel_values=inputs).alphas[0, 0, :height, :width].numpy()
            alpha[trimap == 0] = 0
            alpha[trimap == 255] = 1
            alpha = np.rint(alpha.clip(0, 1) * 255).astype(np.uint8)
            Image.fromarray(alpha).save(out / "alpha" / f"{index:04d}.png")
            for name, plane in zip(["hand-masks", "shirt-masks"], planes):
                Image.fromarray(plane[y0:y1, x0:x1]).save(out / name / f"{index:04d}.png")
            rows[index] = {"sourceFrame": 5376 + index, "direction": direction,
                           "freshSamTrackingEveryFrame": True, "freshVitMatteEveryFrame": True,
                           "alphaSha256": hashlib.sha256(alpha.tobytes()).hexdigest()}
            (out / "progress.json").write_text(json.dumps({"stage": "dense-masks", "frames": len(rows),
                                                           "target": 48, "elapsedSeconds": time.monotonic() - started}))
            if index % 6 == 0:
                print("ACTUAL_DENSE_BOUNDARY", direction, index, len(rows), flush=True)
    assert len(rows) == 48

    class Cache:
        manifest = {"width": 1430, "height": 1000, "frame_count": 48, "fps": 24,
                    "fps_fraction": "24/1", "source_sha256": "0" * 64}
        artifact_sha256 = "0" * 64
        directory = None

        def frame(self, _index):
            return self.alpha

    cache = Cache()
    scene = json.loads((root / "fine-props-r8/native-scoped-final/final-project.autopromote.json").read_text())["snapshot"]["subjectVfxScenes"][0]["scene"]
    effects = [copy.deepcopy(e) for e in scene["effects"] if e["type"] in ["background_replace", "foreground_grade"]]
    for effect in effects:
        effect["start"], effect["end"] = 0, 2
    renderer = VfxFrameRenderer({"version": 1, "source_sha256": "0" * 64,
                                "matte_sha256": "0" * 64, "effects": effects}, cache,
                               lambda _: root / "replacement.png")

    def encoder(path, pixel, codec):
        return subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-f", "rawvideo", "-pix_fmt", pixel,
                                 "-s", "1430x1000", "-r", "24", "-i", "pipe:0", "-an", "-c:v", codec,
                                 "-threads", "2", *(["-level", "3", "-g", "1"] if codec == "ffv1" else
                                 ["-preset", "fast", "-crf", "12", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]),
                                 str(path)], stdin=subprocess.PIPE)

    picture = encoder(out / "diagnostic-picture.mp4", "rgb24", "libx264")
    matte = encoder(out / "diagnostic-alpha.mkv", "gray", "ffv1")
    original = encoder(out / "registered-source.mp4", "rgb24", "libx264")
    old = cv2.VideoCapture(str(root / "four-minute-r9/assembled/Four-minute repaired preview.mp4"))
    old.set(cv2.CAP_PROP_POS_FRAMES, 5376)
    prior = cv2.VideoCapture(str(root / "four-minute-r9/assembled/Full alpha matte - lossless.mkv"))
    prior.set(cv2.CAP_PROP_POS_FRAMES, 5376)
    try:
        for index, rgb in enumerate(frames):
            ok, values = prior.read()
            assert ok
            cache.alpha = cv2.cvtColor(values, cv2.COLOR_BGR2GRAY)
            cache.alpha[y0:y1, x0:x1] = np.array(Image.open(out / "alpha" / f"{index:04d}.png"))
            alpha = cache.alpha.astype(np.float64) / 255
            foreground = estimate_foreground_ml(rgb.astype(np.float64) / 255, alpha)
            opaque = (cache.alpha == 0) | (cache.alpha == 255)
            foreground[opaque] = rgb[opaque] / 255
            result = renderer.render(Image.fromarray(np.rint(foreground.clip(0, 1) * 255).astype(np.uint8)), index)
            picture.stdin.write(result.tobytes())
            matte.stdin.write(cache.alpha.tobytes())
            original.stdin.write(rgb.tobytes())
            ok, previous = old.read()
            assert ok
            before = Image.fromarray(cv2.cvtColor(previous, cv2.COLOR_BGR2RGB)).crop(box)
            sheet = Image.new("RGB", (990, 550))
            sheet.paste(Image.fromarray(rgb).crop(box), (0, 0))
            sheet.paste(before, (330, 0))
            sheet.paste(result.crop(box), (660, 0))
            ImageDraw.Draw(sheet).text((2, 2), f"{(5376 + index) / 24:.3f}s SOURCE / REJECTED / DIAGNOSTIC", fill="white")
            sheet.save(out / "comparisons" / f"{index:04d}.jpg", quality=96)
            if index % 12 == 0:
                result.save(out / f"full-frame-{index:04d}.png")
            print("ACTUAL_SINGLE_COMPOSITE", index, flush=True)
        for process in [picture, matte, original]:
            process.stdin.close()
            assert process.wait() == 0
    finally:
        old.release()
        prior.release()
        for process in [picture, matte, original]:
            if process.poll() is None:
                process.kill()
                process.wait()
    receipt = {"sourceFrames": [5376, 5423], "sourceSeconds": [224, 226], "frames": 48,
               "sourceClockMiddleFrameByteVerified": True, "denseSamHz": 24, "denseVitMatteHz": 24,
               "independentOverlappingSessions": True, "oneWholeFrameComposite": True,
               "correctionBox": box, "unchangedOldAlphaOutsideTestRegion": True,
               "nativeStudioQualification": False, "newFourMinuteRender": False,
               "licensedExistingPinsOnly": [sam["id"], vit["id"]], "noRvmUsed": True,
               "visualPass": False, "paidCloud": False,
               "elapsedSeconds": time.monotonic() - started,
               "rows": [rows[index] for index in range(48)]}
    (out / "receipt.json").write_text(json.dumps(receipt, indent=2))
    print("ACTUAL_DENSE_MOVEMENT_EXPERIMENT_COMPLETE", flush=True)


if __name__ == "__main__":
    main()
