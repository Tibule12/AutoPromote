#!/usr/bin/env python3
"""Measure visible picture padding in the existing ten minute local proof.

The resulting per-shot Director zooms are explicit Studio timeline edits. This
script only reads the old proof and writes a separate, reproducible measurement.
"""

import json
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / "proof/viral-clip-studio/ten-minute-director"
CUTS = PROOF / "reviewed-speaker-template-cuts.json"
EXISTING = PROOF / "local-revision/full-ten-minute-locked-v1/full-10m-review.mp4"
OUTPUT = PROOF / "measured-picture-padding.json"


def main():
    cuts = json.loads(CUTS.read_text())
    capture = cv2.VideoCapture(str(EXISTING))
    if not capture.isOpened():
        raise RuntimeError(f"Cannot read existing proof: {EXISTING}")
    if (int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))) != (540, 960):
        raise ValueError("The measurement expects the existing 540x960 proof")
    measured = []
    for index, cut in enumerate(cuts):
        start = float(cut["time"])
        end = float(cuts[index + 1]["time"]) if index + 1 < len(cuts) else 600.0
        sample = start + min(0.2, (end - start) / 2)
        capture.set(cv2.CAP_PROP_POS_MSEC, sample * 1000)
        ok, frame = capture.read()
        if not ok:
            raise RuntimeError(f"Cannot decode existing proof at {sample:.3f}s")
        value = np.max(frame[:, :, :3], axis=2)
        top = float((value[20:42, 110:430] > 55).mean())
        bottom = float((value[919:940, 110:430] > 55).mean())
        # The old outer rounded frame is present in either case. Its picture
        # sometimes contains an additional black border at both ends.
        if 0.15 < top < 0.85:
            raise ValueError(f"Ambiguous top picture edge at {start:.3f}s: {top:.3f}")
        measured.append({
            "time": start,
            "side": cut["side"],
            "sample_time": round(sample, 3),
            "top_picture_fraction": round(top, 3),
            "bottom_picture_fraction": round(bottom, 3),
            "zoom": 1.14 if top < 0.15 else 1.0,
        })
    capture.release()
    OUTPUT.write_text(json.dumps({
        "measured_from": str(EXISTING.relative_to(ROOT)),
        "method": "visible pixels at x=110..429, top y=20..41; padding corrected by Director zoom",
        "shots": measured,
    }, indent=2) + "\n")
    print(json.dumps({"shots": len(measured), "padded": sum(x["zoom"] > 1 for x in measured), "path": str(OUTPUT)}))


if __name__ == "__main__":
    main()
