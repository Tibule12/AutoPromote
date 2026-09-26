#!/usr/bin/env python3
"""Flag close portrait face crops in the ten minute local export for review."""

import argparse
import json
import os
from pathlib import Path

import cv2
import mediapipe as mp


os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / "proof/viral-clip-studio/ten-minute-director"
FINAL = PROOF / "local-revision/full-picture-fill-v8/full-10m-review.mp4"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=Path, default=FINAL)
    parser.add_argument("--analysis", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    final = args.video.resolve()
    split_ranges = []
    if args.analysis:
        analysis = json.loads(args.analysis.read_text())
        edits = analysis["editPlan"]["timelineCuts"]
        split_ranges = [(float(item["start"]), float(item["end"]))
                        for item in analysis["editPlan"].get("splitSuggestions", [])]
    else:
        edits = json.loads((PROOF / "reviewed-speaker-template-cuts.json").read_text())
    samples = {round(second + 0.4, 3) for second in range(1, 600)}
    samples.update(round(float(item["time"]) + 0.2, 3) for item in edits)
    samples = sorted(t for t in samples if t < 600 and
                     not any(left <= t < right for left, right in split_ranges) and
                     not 176 <= t < 177 and not 210 <= t < 211)
    capture = cv2.VideoCapture(str(final))
    if not capture.isOpened():
        raise RuntimeError(f"Missing ten minute proof: {final}")
    near_edge = []
    face_not_found = []
    with mp.solutions.face_detection.FaceDetection(
        model_selection=0, min_detection_confidence=0.6
    ) as detector:
        for sample in samples:
            capture.set(cv2.CAP_PROP_POS_MSEC, sample * 1000)
            ok, frame = capture.read()
            if not ok:
                raise RuntimeError(f"Failed to decode {sample:.3f}s")
            found = detector.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).detections
            if not found:
                face_not_found.append(sample)
                continue
            box = max(found, key=lambda item: item.score[0]).location_data.relative_bounding_box
            left = float(box.xmin)
            right = left + float(box.width)
            top = float(box.ymin)
            if left < 0.035 or right > 0.965 or top < 0.012:
                near_edge.append({
                    "time": sample,
                    "left": round(left, 3),
                    "right": round(right, 3),
                    "top": round(top, 3),
                })
    capture.release()
    receipt = {
        "proof": str(final.relative_to(ROOT)),
        "sampled_frames": len(samples),
        "near_edge_candidates": near_edge,
        "face_not_found": face_not_found,
        "note": "Detector hints require visual review; a turned head or occluded face may not be detected.",
    }
    path = args.output.resolve() if args.output else final.parent / "face-edge-audit.json"
    path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"sampled": len(samples), "near_edge": len(near_edge),
                      "not_detected": len(face_not_found), "receipt": str(path)}))


if __name__ == "__main__":
    main()
