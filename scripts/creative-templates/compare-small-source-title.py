#!/usr/bin/env python3
"""Compare declared square-source title geometry without fitting or shifting frames."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("folder", type=Path)
args = parser.parse_args()
folder = args.folder
movie = folder / "small-source/final.mp4"
final = folder / "final-title-frame.png"
subprocess.run(["ffmpeg", "-v", "error", "-threads", "1", "-i", str(movie),
                "-ss", "1", "-frames:v", "1", "-y", str(final)], check=True)
native = Image.open(folder / "native-title-frame.png").convert("RGB")
delivered = Image.open(final).convert("RGB")
assert delivered.size == (320, 240)
# Only normalize the independently known viewport dimensions. No fitted
# translation, crop, retiming, masking of bad edges or output modification.
native = native.resize(delivered.size, Image.Resampling.LANCZOS)
native.save(folder / "native-title-normalized.png")


def mask(image):
    pixels = np.asarray(image)
    return (pixels[..., 1] > 180) & (pixels[..., 0] < 60) & (pixels[..., 2] < 60)


def bounds(region):
    ys, xs = np.where(region)
    assert len(xs) > 100, "No sufficient authored green title area"
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


first, last = mask(native), mask(delivered)
nb, fb = bounds(first), bounds(last)
differences = [abs(a - b) for a, b in zip(nb, fb)]
result = {
    "outputSha256": hashlib.sha256(movie.read_bytes()).hexdigest(),
    "nativeCaptureSha256": hashlib.sha256((folder / "native-title-frame.png").read_bytes()).hexdigest(),
    "outputSeconds": 1, "declaredOutputDimensions": [320, 240],
    "nativeTitleBounds": nb, "finalTitleBounds": fb,
    "absoluteEdgeDifferencesPixels": differences, "geometryTolerancePixels": 2,
    "geometryPassed": max(differences) <= 2,
    "greenMaskIoU": float(np.logical_and(first, last).sum() / np.logical_or(first, last).sum()),
    "scope": "One native live/export green title box on a square-pixel small source. No full font, animation, picture, soundtrack or creative qualification.",
}
(folder / "paired-title-geometry.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
assert result["geometryPassed"], "Native/export title edges differ beyond the existing 2px bound"
