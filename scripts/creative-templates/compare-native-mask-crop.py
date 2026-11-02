#!/usr/bin/env python3
"""Compare actual native/export mask boundaries at declared mapped clocks.

Only viewport-size normalization is allowed. No fitted movement/crop/retiming.
This tests geometric coverage, not neural segmentation or full alpha fidelity.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument("folder", type=Path)
parser.add_argument("--movie", default="masks/final.mp4")
parser.add_argument("--prefix", default="")
args = parser.parse_args()
folder = args.folder
destination = folder / args.prefix
movie = folder / args.movie
info = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams", "-of", "json", str(movie)]))["streams"][0]
size = (int(info["width"]), int(info["height"]))
samples = json.loads((folder / "native-mapped-masks.json").read_text())


def coverage(image):
    pixels = np.asarray(image)
    return ((pixels[..., 0] > 190) & (pixels[..., 1] < 80) & (pixels[..., 2] > 190)).astype(np.uint8)


rows = []
panels = []
for index, sample in enumerate(samples):
    final = destination / f"final-{index}.png"
    numerator, denominator = [int(v) for v in info["r_frame_rate"].split("/")]
    frame_index = round(sample["time"] * numerator / denominator)
    assert abs(frame_index * denominator / numerator - sample["time"]) < 1e-6, "Native comparison must declare an actual delivered frame clock"
    subprocess.run(["ffmpeg", "-v", "error", "-threads", "1", "-i", str(movie), "-vf", f"select=eq(n\\,{frame_index})", "-frames:v", "1", "-y", str(final)], check=True)
    native = Image.open(folder / f"native-{index}.png").convert("RGB").resize(size, Image.Resampling.LANCZOS)
    output = Image.open(final).convert("RGB")
    panel = Image.new("RGB", (size[0] * 2, size[1] + 24), "black")
    panel.paste(native, (0, 24)); panel.paste(output, (size[0], 24))
    ImageDraw.Draw(panel).text((4, 4), f"Native live {sample['time']}s     |     Exact CPU export", fill="white")
    panels.append(panel)
    first, last = coverage(native), coverage(output)
    for shape, start, end in [("rectangle", 0, .36), ("ellipse", .36, .64), ("polygon", .64, 1)]:
        a, b = first.copy(), last.copy()
        lo, hi = int(size[0] * start), int(size[0] * end)
        a[:, :lo] = 0; a[:, hi:] = 0; b[:, :lo] = 0; b[:, hi:] = 0
        def bounds(mask):
            ys, xs = np.where(mask)
            assert len(xs) > 100, f"Missing visible {shape} mask at {sample['time']}s"
            return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
        na, nb = bounds(a), bounds(b)
        edges_a = a - cv2.erode(a, np.ones((3, 3), np.uint8))
        edges_b = b - cv2.erode(b, np.ones((3, 3), np.uint8))
        distances = np.concatenate([
            cv2.distanceTransform(1 - edges_b, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)[edges_a > 0],
            cv2.distanceTransform(1 - edges_a, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)[edges_b > 0],
        ])
        differences = [abs(x - y) for x, y in zip(na, nb)]
        rows.append({"time": sample["time"], "shape": shape, "nativeBounds": na, "finalBounds": nb,
                     "edgeDifferencesPixels": differences, "boundaryP95Pixels": float(np.percentile(distances, 95)),
                     "boundaryMaximumPixels": float(distances.max()),
                     "coverageIoU": float(np.logical_and(a, b).sum() / np.logical_or(a, b).sum()),
                     "passed": max(differences) <= 2 and float(np.percentile(distances, 95)) <= 2})
sheet = Image.new("RGB", (size[0] * 2, (size[1] + 24) * len(panels)))
for index, panel in enumerate(panels): sheet.paste(panel, (0, (size[1] + 24) * index))
sheet.save(destination / "paired-native-final.jpg", quality=90)
result = {"outputSha256": hashlib.sha256(movie.read_bytes()).hexdigest(), "dimensions": list(size),
          "geometryTolerancePixels": 2, "comparisons": rows, "passed": all(row["passed"] for row in rows),
          "scope": "Three native mapped clocks/three geometric image masks and crop animation. Coverage boundaries only; feather/inversion/full alpha/text/whole parity/creative/public qualification remain open."}
(destination / "paired-mask-geometry.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
assert result["passed"], "Native/final mask boundaries differ beyond the existing 2px tolerance"
