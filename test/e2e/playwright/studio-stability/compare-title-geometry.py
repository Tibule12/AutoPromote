#!/usr/bin/env python3
"""Compare a declared white-title ROI in genuine pre-final/final PNG captures.

This qualifies only the fixture's title geometry; it does not score arbitrary
footage, wording, audio, masks or other effects. Choose the ROI before judging.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image


def glyph_boxes(image, crop):
    pixels = np.asarray(image.convert("RGB"))
    mask = (pixels.min(axis=2) > 230) & (pixels.max(axis=2)-pixels.min(axis=2) < 25)
    left, top, right, bottom = crop
    mask[:top] = False; mask[bottom:] = False
    mask[:, :left] = False; mask[:, right:] = False
    groups = []
    for row in np.where(mask.sum(axis=1) > 2)[0]:
        if not groups or row-groups[-1][-1] > 3:
            groups.append([int(row)])
        else:
            groups[-1].append(int(row))
    boxes = []
    for rows in groups:
        _, columns = np.where(mask[rows[0]:rows[-1]+1])
        boxes.append([int(columns.min()), rows[0], int(columns.max()+1), rows[-1]+1])
    return boxes


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    parser.add_argument("--time", type=str, default="3.5")
    parser.add_argument("--crop", type=int, nargs=4, required=True)
    parser.add_argument("--expected-lines", type=int, required=True)
    parser.add_argument("--tolerance", type=float, required=True)
    args = parser.parse_args()
    before = Image.open(args.folder/f"preview-{args.time}.png")
    after = Image.open(args.folder/f"final-{args.time}.png").resize(before.size, Image.Resampling.LANCZOS)
    first, second = glyph_boxes(before, args.crop), glyph_boxes(after, args.crop)
    error = max((abs(a-b) for x, y in zip(first, second) for a, b in zip(x, y)), default=None)
    passed = len(first) == len(second) == args.expected_lines and error is not None and error <= args.tolerance
    report = {"scope": "White title glyph geometry in declared ROI; other parity remains unqualified",
              "roi": args.crop, "outputTime": float(args.time), "previewSize": before.size,
              "previewGlyphBoxes": first, "finalNormalizedGlyphBoxes": second,
              "maximumGlyphBoxErrorPreviewPixels": error, "declaredGeometryTolerancePreviewPixels": args.tolerance,
              "expectedLines": args.expected_lines, "result": "PASS" if passed else "FAIL"}
    (args.folder/"title-geometry-retest.json").write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps(report))
    raise SystemExit(0 if passed else 1)
