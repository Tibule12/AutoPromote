"""Combine actual short-shot alpha evidence before one full-frame composite."""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw
from pymatting import estimate_foreground_ml

from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def hand_scope(rgb, alpha):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    pixels = rgb.astype(np.float64)
    skin = ((hsv[:, :, 0] < 30) & (hsv[:, :, 1] > 70) & (hsv[:, :, 2] < 205) &
            (alpha > 240) & ((pixels[:, :, 0] - pixels[:, :, 1]) >
                            .75 * (pixels[:, :, 1] - pixels[:, :, 2]))).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(skin)
    if count <= 1:
        return np.zeros(alpha.shape, np.float64)
    selected = (labels == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    scope = np.zeros(alpha.shape, np.uint8)
    cv2.fillConvexPoly(scope, cv2.convexHull(cv2.findNonZero(selected)), 255)
    scope = cv2.dilate(scope, np.ones((11, 11), np.uint8))
    height, width = alpha.shape
    yy, xx = np.indices((height, width))
    distance = np.minimum.reduce([yy, xx, height - 1 - yy, width - 1 - xx])
    return np.minimum(distance / 10, 1).clip(0, 1) * (scope / 255)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("evaluation", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--observed-source-background", type=Path)
    parser.add_argument("--without-hand-overrides", action="store_true")
    parser.add_argument("--retained-body-matte", type=Path)
    args = parser.parse_args()
    evaluation, out = args.evaluation, args.output
    out.mkdir(parents=True, exist_ok=False, mode=0o700)
    root = Path("reports/background-replacement-20261101/private")
    body = evaluation / "background-motion-224-226"
    actual_body_matte = args.retained_body_matte or body
    dense = evaluation / "dense-224-226"
    assert json.loads((body / "receipt.json").read_text())["frames"] == 48
    assert json.loads((dense / "dense-mask-completion.json").read_text())["all48ActualAlphaFramesPresent"]
    cv2.setNumThreads(1)
    background_model = background_tensor = None
    if args.observed_source_background:
        import torch
        torch.set_num_threads(3)
        torch.set_num_interop_threads(1)
        checkpoint = Path("/home/tibule12/.cache/autopromote-model-runtime/backgroundmattingv2-mit-eval-v1/model.pth")
        assert hashlib.file_digest(checkpoint.open("rb"), "sha256").hexdigest() == "6d449e8a0445438491cf07c03a6e86f21df2b3aa2dc630d9430347fcb807aae4"
        background_model = torch.jit.load(str(checkpoint), map_location="cpu").eval()
        background_model.backbone_scale = .5
        background_model.refine_mode = "full"
        photographed_background = np.array(Image.open(args.observed_source_background))
        background_tensor = torch.from_numpy(photographed_background.copy()).permute(2, 0, 1)[None].float() / 255
        background_tensor = torch.nn.functional.pad(background_tensor, (0, 2, 0, 0), mode="replicate")

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

    def encoder(name, width, height, pixel="rgb24", codec="libx264"):
        return subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-f", "rawvideo", "-pix_fmt", pixel,
                                 "-s", f"{width}x{height}", "-r", "24", "-i", "pipe:0", "-an", "-c:v", codec,
                                 "-threads", "2", *(["-level", "3", "-g", "1"] if codec == "ffv1" else
                                 ["-preset", "fast", "-crf", "12", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]),
                                 str(out / name)], stdin=subprocess.PIPE)

    picture = encoder("picture.mp4", 1430, 1000)
    matte = encoder("Full alpha matte.mkv", 1430, 1000, "gray", "ffv1")
    source_writer = encoder("Source interval.mp4", 1430, 1000)
    comparison = encoder("Source - rejected - new test.mp4", 990, 550)
    old = cv2.VideoCapture(str(root / "four-minute-r9/assembled/Four-minute repaired preview.mp4"))
    old.set(cv2.CAP_PROP_POS_FRAMES, 5376)
    prior = cv2.VideoCapture(str(root / "four-minute-r9/assembled/Full alpha matte - lossless.mkv"))
    prior.set(cv2.CAP_PROP_POS_FRAMES, 5376)
    (out / "frame-review").mkdir()
    (out / "masks").mkdir()
    rows = []
    try:
        for index in range(48):
            rgb = np.array(Image.open(body / "source" / f"{index:04d}.png"))
            alpha = np.array(Image.open(actual_body_matte / "alpha" / f"{index:04d}.png"))
            foreground = np.array(Image.open(actual_body_matte / "foreground" / f"{index:04d}.png")).astype(np.float64) / 255
            if background_model is not None:
                pixels = torch.from_numpy(rgb.copy()).permute(2, 0, 1)[None].float() / 255
                pixels = torch.nn.functional.pad(pixels, (0, 2, 0, 0), mode="replicate")
                with torch.inference_mode():
                    fresh_alpha, fresh_foreground, *_ = background_model(pixels, background_tensor)
                alpha = np.rint(fresh_alpha[0, 0, :, :1430].numpy().clip(0, 1) * 255).astype(np.uint8)
                foreground = fresh_foreground[0, :, :, :1430].permute(1, 2, 0).numpy().clip(0, 1).astype(np.float64)
                # The retained source contains a rounded black frame corner,
                # unrelated to the photographed foreground in this shot.
                alpha[:48, 1380:] = 0
            person = np.array(Image.open(body / "person-evidence" / f"{index:04d}.png"))
            if args.retained_body_matte:
                # Reject only remote, unchanged source-background false positives;
                # do not cut limbs to a sparse segmentation contour.
                far = cv2.dilate((person >= 24).astype(np.uint8), np.ones((145, 145), np.uint8)) == 0
                alpha[far] = 0
            ok, previous = old.read()
            assert ok
            ok, original = prior.read()
            assert ok
            original = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
            props = np.zeros(alpha.shape, bool)
            props[720:, :268] = True
            props[800:, :600] = True
            props[725:818, 150:875] = True
            props[480:820, 790:930] = True
            props[800:, 795:855] = True
            alpha[props] = np.maximum(alpha[props], original[props])
            changed_colours = props.copy()
            scopes = []
            corrections = [] if args.without_hand_overrides else [
                ((1100, 180, 1430, 730), dense / "alpha" / f"{index:04d}.png"),
                ((268, 330, 487, 730), root / "four-minute-r9/hand-correction-224-226/corrected-alpha" / f"{index:04d}.png")]
            for box, path in corrections:
                x0, y0, x1, y1 = box
                values = np.array(Image.open(path))
                patch = rgb[y0:y1, x0:x1]
                weight = hand_scope(patch, values)
                previous_alpha = alpha[y0:y1, x0:x1]
                previous_alpha[:] = np.rint(previous_alpha * (1 - weight) + values * weight).astype(np.uint8)
                changed_colours[y0:y1, x0:x1] |= weight > 0
                scopes.append(int(np.count_nonzero(weight)))
            hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
            tv = (hsv[:, :, 0] < 30) & (hsv[:, :, 1] > 115) & (hsv[:, :, 2] > 165)
            domain = np.zeros(alpha.shape, bool)
            domain[720:815, 170:420] = True
            alpha[tv & domain & (person < 64)] = 0
            cache.alpha = alpha
            recovered = estimate_foreground_ml(rgb.astype(np.float64) / 255, alpha.astype(np.float64) / 255)
            foreground[changed_colours] = recovered[changed_colours]
            opaque = (alpha == 0) | (alpha == 255)
            foreground[opaque] = rgb[opaque] / 255
            result = renderer.render(Image.fromarray(np.rint(foreground.clip(0, 1) * 255).astype(np.uint8)), index)
            picture.stdin.write(result.tobytes())
            matte.stdin.write(alpha.tobytes())
            source_writer.stdin.write(rgb.tobytes())
            Image.fromarray(alpha).save(out / "masks" / f"{index:04d}.png")
            before = Image.fromarray(cv2.cvtColor(previous, cv2.COLOR_BGR2RGB))
            sheet = Image.new("RGB", (990, 550))
            box = (1100, 180, 1430, 730)
            sheet.paste(Image.fromarray(rgb).crop(box), (0, 0))
            sheet.paste(before.crop(box), (330, 0))
            sheet.paste(result.crop(box), (660, 0))
            ImageDraw.Draw(sheet).text((2, 2), f"{224 + index / 24:.3f}s SOURCE / REJECTED / NEW TEST", fill="white")
            comparison.stdin.write(sheet.tobytes())
            # Four consecutive source/rejected/new full-picture pairs per page.
            if index % 4 == 0:
                page = Image.new("RGB", (1716, 1600), (20, 20, 20))
            y = index % 4 * 400
            for x, image in [(0, Image.fromarray(rgb)), (572, before), (1144, result)]:
                page.paste(image.resize((572, 400), Image.Resampling.LANCZOS), (x, y))
            ImageDraw.Draw(page).text((2, y + 2), f"{index} / {224 + index / 24:.3f}s", fill="white")
            if index % 4 == 3:
                page.save(out / "frame-review" / f"{index // 4:02d}.jpg", quality=97)
            if index in [0, 8, 16, 17, 23, 24, 30, 36, 42, 47]:
                result.save(out / "frame-review" / f"full-{index:02d}.png")
            rows.append({"index": index, "sourceFrame": 5376 + index, "handScopedPixels": scopes,
                         "combinedAlphaSha256": hashlib.sha256(alpha.tobytes()).hexdigest()})
            print("ACTUAL_COMBINED_MOVING_FRAME", index, flush=True)
        for process in [picture, matte, source_writer, comparison]:
            process.stdin.close()
            assert process.wait() == 0
    finally:
        old.release()
        prior.release()
        for process in [picture, matte, source_writer, comparison]:
            if process.poll() is None:
                process.kill()
                process.wait()
    master = "/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4"
    movie = out / "Movement test - new composite.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(out / "picture.mp4"), "-ss", "224",
                    "-i", master, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "192k", "-t", "2", "-movflags", "+faststart", str(movie)], check=True)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(movie), "-f", "null", "-"], check=True)
    (out / "receipt.json").write_text(json.dumps({"sourceSeconds": [224, 226], "frames": 48,
                                                "oneFullFrameComposite": True,
                                                "originalAudio": True,
                                                "newModelsEvaluatedNotRegisteredProductIntegration": True,
                                                "sourceBackgroundIsPartlyEstimated": True,
                                                "currentIntervalObservedBackgroundUsed": background_model is not None,
                                                "inheritedHandOverridesUsed": not args.without_hand_overrides,
                                                "retainedBodyMattePath": str(actual_body_matte),
                                                "nativeStudioQualified": False,
                                                "visualPass": False,
                                                "paidCloud": False,
                                                "movieSha256": hashlib.file_digest(movie.open("rb"), "sha256").hexdigest(),
                                                "rows": rows}, indent=2))
    print("ACTUAL_COMBINED_48_FRAME_MOVIE_READY", flush=True)


if __name__ == "__main__":
    main()
