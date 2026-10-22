#!/usr/bin/env python3
"""Compare real Studio soft edges with the owned completed movie.

The existing programme canvas provides the background at each declared time.
Use whole soft-edge regions, no fitted shifts or temporal offsets. The worker
matte is a diagnostic reference, not a replacement for the native movie.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root))
from python_media_worker.studio_layer_motion import _render_pose, layer_pose

folder = root / "reports/studio-professional-masked-effects-20261013/proof"
if "--inverted" in sys.argv[1:]:
    folder /= "inverted"
movie = folder / "masked-effects/final.mp4"
request = json.loads((folder / "masked-effects-render-request.private.json").read_text())["options"]["viralData"]
receipt = json.loads((folder / "masked-effects/render-receipt.json").read_text())
binding = json.loads((folder / "preview-binding.json").read_text())
assert binding["projectId"] == receipt["projectId"]
assert binding["canonicalHash"] == receipt["projectHash"], "Live preview must bind the exact delivered graph"
samples = json.loads((folder / "native-preview.json").read_text())
size = (720, 1280)
asset = Image.open(folder / "alpha-marker.png").convert("RGBA")
overlay = next(o for o in request["overlays"] if o["type"] == "image")
layer = next(l for l in request["composition_plan"]["layers"] if l["id"] == overlay["id"])
assert layer["effects"]["blur"] == 12
assert layer["effects"]["mask"]["enabled"]
assert bool(layer["effects"]["mask"].get("inverted")) == ("--inverted" in sys.argv[1:])
assert bool(layer["effects"]["shadow"]["enabled"])
assert bool(layer["effects"]["glow"]["enabled"])
rows = []
sheet = Image.new("RGB", (1440, 1304 * len(samples)))
for index, sample in enumerate(samples):
    time = sample["time"]
    assert time * 24 == round(time * 24), "Only declared delivery-frame clocks qualify"
    sampling = sample["sourceSampling"]
    assert sampling["mode"] == "accurate-paused", "Native decoder readiness alone does not qualify exact source sampling"
    assert sampling["frameIndex"] == round(time * 24)
    assert sampling["sourceContentHash"] == hashlib.sha256(
        (root / "reports/studio-professional-masked-effects-20261013/proof/source-grid.mp4").read_bytes()).hexdigest()
    delivered = folder / f"final-{index}.png"
    subprocess.run(["ffmpeg", "-v", "error", "-threads", "1", "-i", str(movie),
                    "-vf", f"select=eq(n\\,{round(time * 24)})", "-frames:v", "1", "-y", str(delivered)], check=True)
    native_image = Image.open(folder / f"preview-{index}.png").convert("RGB")
    background_image = Image.open(folder / f"background-{index}.png").convert("RGB")
    assert max(abs(a-b) for a,b in zip(native_image.size, background_image.size)) <= 1
    native = np.asarray(native_image.resize(size, Image.Resampling.LANCZOS), dtype=float)
    before = np.asarray(background_image.resize(size, Image.Resampling.LANCZOS), dtype=float)
    final = np.asarray(Image.open(delivered).convert("RGB"), dtype=float)
    rendered_reference = np.asarray(_render_pose(asset, overlay, layer, layer_pose(layer, overlay, time), size))
    reference = rendered_reference[..., 3] / 255.
    edge = (reference > .05) & (reference < .95)
    assert edge.sum() > 100
    # Preserve every authored effect color, including shadow and glow.
    expected = before * (1 - reference[..., None]) + rendered_reference[..., :3] * reference[..., None]
    pair = float(np.sqrt(np.mean((native[edge] - final[edge]) ** 2)))
    native_rmse = float(np.sqrt(np.mean((native[edge] - expected[edge]) ** 2)))
    final_rmse = float(np.sqrt(np.mean((final[edge] - expected[edge]) ** 2)))
    rows.append({"time": time, "sourceSampling": sampling, "softEdgePixels": int(edge.sum()), "nativeFinalRgbRmse": pair,
                 "nativeReferenceRgbRmse": native_rmse, "finalReferenceRgbRmse": final_rmse,
                 "passed": max(pair, native_rmse, final_rmse) <= 4})
    sheet.paste(Image.fromarray(native.astype(np.uint8)), (0, 1304 * index + 24))
    sheet.paste(Image.fromarray(final.astype(np.uint8)), (720, 1304 * index + 24))
    ImageDraw.Draw(sheet).text((5, 1304 * index + 5), f"Native Studio {time}s | owned CPU final", fill="white")
sheet.save(folder / "paired-masked-effects.jpg", quality=90)
result = {"projectId": receipt["projectId"], "canonicalHash": receipt["projectHash"],
          "outputSha256": hashlib.sha256(movie.read_bytes()).hexdigest(), "comparisons": rows,
          "softRegionRgbRmseTolerance": 4,
          "passed": all(row["passed"] for row in rows),
          "scope": "Four exact paused source frames of one native transparent image with position, scale, rotation, opacity, geometric mask, gold shadow, cyan glow and blur. Source bytes/generation/frame are verified against the owned sampler. Whole softened effect region, no fitted alignment; continuous playback and broader masks/effects/media/audio/readiness remain unqualified."}
assert result["outputSha256"] == receipt["outputSha256"]
(folder / "paired-masked-effects.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
assert result["passed"], "Actual native/final masked effects exceed the declared bounds"
