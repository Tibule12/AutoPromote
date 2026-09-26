#!/usr/bin/env python3
"""Render a low-cost full-timeline framing audit without starting a cloud job."""

import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "python_media_worker"
PROOF = ROOT / "proof/viral-clip-studio/ten-minute-director"
sys.path.insert(0, str(WORKER))

from main_media_server import build_reframe_segment_filter, plan_reframe_timeline_segments  # noqa: E402


def run(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", *map(str, args)], check=True)


def main():
    source = PROOF / "unmuted-podcast-10m-source.mp4"
    output = PROOF / "full-timeline-audit"
    output.mkdir(parents=True, exist_ok=True)
    settings = output / "review-settings.json"
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/ten-minute-podcast-payload.py"), str(settings)],
        env={**os.environ, "AUTOPROMOTE_QA_SOURCE_URL": str(source)},
        check=True,
    )
    payload = json.loads(settings.read_text())
    reframe = payload["finish_plan"]["reframe"]
    specs = plan_reframe_timeline_segments(
        600,
        reframe["timeline_cuts"],
        reframe["split_source"],
        reframe["speaker_order_cuts"],
        reframe["keyframes"],
    )
    sample_times = sorted(set([time + 5 for time in range(0, 600, 10)] + [176.5, 182.75, 210.5, 211.75]))
    for index, sample_time in enumerate(sample_times):
        segment = next(item for item in specs if item["start"] <= sample_time < item["end"])
        split = segment.get("split_framing") or {}
        offsets = [
            float((split.get(slot) or {}).get("source_time_offset_seconds", 0) or 0)
            for slot in ("top", "bottom")
        ] if segment.get("mode") == "center" else [0.0, 0.0]
        active_offsets = [offset for offset in offsets if abs(offset) > 1e-6]
        command = ["-ss", f"{segment['start']:.6f}", "-i", source]
        if active_offsets:
            command.extend(["-ss", f"{segment['start'] + active_offsets[0]:.6f}", "-i", source])
        graph = build_reframe_segment_filter(
            1920,
            1080,
            270,
            480,
            segment,
            reframe["zoom"],
            alternate_input_label="[1:v]" if active_offsets else None,
        )
        label = f"{sample_time:06.2f}s"
        local_time = sample_time - segment["start"]
        # Advance through the reviewed segment inside the filter graph. Output
        # seeking can skip filter evaluation and previously produced false crop
        # alarms at 255s and 305s even though the actual rendered cuts were clean.
        graph += (
            f";[vout]trim=start={local_time:.6f}:end={local_time + 0.100:.6f},"
            "setpts=PTS-STARTPTS,"
            "drawbox=x=5:y=5:w=82:h=24:color=black@0.72:t=fill,"
            f"drawtext=text='{label}':x=10:y=9:fontsize=14:fontcolor=white[audit]"
        )
        run(
            *command,
            "-filter_complex", graph,
            "-map", "[audit]", "-frames:v", "1", "-y", output / f"frame-{index:03d}.png",
        )
    for sheet_index, start_number in enumerate(range(0, len(sample_times), 20), 1):
        run(
            "-framerate", "1", "-start_number", str(start_number),
            "-i", output / "frame-%03d.png",
            "-vf", "tile=5x4:padding=8:margin=8:color=0x030509",
            "-frames:v", "1", "-y", output / f"contact-{sheet_index}.jpg",
        )
    (output / "audit.json").write_text(json.dumps({
        "sample_times": sample_times,
        "frames": len(sample_times),
        "director_cuts": len(reframe["timeline_cuts"]),
        "framing_keyframes": len(reframe["keyframes"]),
        "cloud_job_started": False,
    }, indent=2))
    print(json.dumps({"frames": len(sample_times), "output": str(output)}))


if __name__ == "__main__":
    main()
