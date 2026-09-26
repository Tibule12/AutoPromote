#!/usr/bin/env python3
"""Check the new full local edit's visible rounded picture and audio clock."""

import argparse
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / "proof/viral-clip-studio/ten-minute-director"
FINAL = PROOF / "local-revision/full-picture-fill-v8/full-10m-review.mp4"
MEASUREMENT = PROOF / "measured-picture-padding.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=Path, default=FINAL)
    parser.add_argument("--analysis", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    final = args.video.resolve()
    streams = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "stream=codec_type,start_time,duration,width,height,r_frame_rate",
        "-of", "json", str(final),
    ]))["streams"]
    video = next(stream for stream in streams if stream["codec_type"] == "video")
    audio = next(stream for stream in streams if stream["codec_type"] == "audio")
    if (int(video["width"]), int(video["height"])) != (540, 960):
        raise ValueError("Unexpected final portrait dimensions")
    if abs(float(video["duration"]) - 600) > 0.1:
        raise ValueError("The local proof is not ten minutes long")
    av_start_ms = (float(video.get("start_time", 0)) - float(audio.get("start_time", 0))) * 1000
    if abs(av_start_ms) > 80:
        raise ValueError(f"Audio and video start times differ by {av_start_ms:.1f}ms")

    capture = cv2.VideoCapture(str(final))
    split_ranges = []
    if args.analysis:
        analysis = json.loads(args.analysis.read_text())
        measured = analysis["editPlan"]["timelineCuts"]
        split_ranges = [(float(item["start"]), float(item["end"]))
                        for item in analysis["editPlan"].get("splitSuggestions", [])]
    else:
        measured = json.loads(MEASUREMENT.read_text())["shots"]
    failures = []
    for index, shot in enumerate(measured):
        start = float(shot["time"])
        end = float(measured[index + 1]["time"]) if index + 1 < len(measured) else 600
        sample = start + min(0.2, (end - start) / 2)
        if (any(left <= sample < right for left, right in split_ranges) or
                176 <= sample < 177 or 210 <= sample < 211):
            continue  # A split deliberately uses two separate rounded cards.
        capture.set(cv2.CAP_PROP_POS_MSEC, sample * 1000)
        ok, frame = capture.read()
        if not ok:
            failures.append({"time": sample, "reason": "decode"})
            continue
        value = np.max(frame, axis=2)
        # A dark cap occasionally covers much of the central strip. Check the
        # left wall as well so the content itself is not mistaken for padding.
        filled_top = max(
            float((value[20:42, 110:430] > 55).mean()),
            float((value[20:42, 30:100] > 55).mean()),
        )
        corners = [float(value[y, x]) for x, y in ((0, 0), (539, 0), (0, 959), (539, 959))]
        if filled_top < 0.7 or max(corners) > 20:
            failures.append({"time": sample, "filled_top": round(filled_top, 3), "corners": corners})
    capture.release()
    receipt = {
        "proof": str(final.relative_to(ROOT)),
        "duration_seconds": float(video["duration"]),
        "size": "540x960",
        "camera_shots_measured": len(measured),
        "padded_shots_corrected": sum(float(shot["zoom"]) > 1 for shot in measured),
        "failed_visible_edges": failures,
        "audio_video_start_delta_ms": round(av_start_ms, 2),
        "rejected_source_shots_held": [
            {"time": float(shot["time"]),
             "picture_offset_seconds": float(shot.get("sourceTimeOffsetSeconds", 0))}
            for shot in measured if abs(float(shot.get("sourceTimeOffsetSeconds", 0) or 0)) > 1e-6
        ],
        "paid_cloud_job_started": False,
    }
    path = args.output.resolve() if args.output else final.parent / "picture-fill-audit.json"
    path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
