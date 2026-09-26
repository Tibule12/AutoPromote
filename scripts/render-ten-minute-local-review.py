#!/usr/bin/env python3
"""Render short, source-accurate podcast review windows without a cloud job."""

import argparse
import copy
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / "proof/viral-clip-studio/ten-minute-director"
WORKER = ROOT / "python_media_worker"
sys.path.insert(0, str(WORKER))
from main_media_server import (  # noqa: E402
    build_main_video_frame_filter,
    build_reframe_segment_filter,
    build_studio_finish_filter,
    generate_ass_captions,
    plan_reframe_timeline_segments,
)
from viral_render_contract import build_edited_caption_transcript  # noqa: E402


def run(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", *map(str, args)], check=True)


def local_time_marks(items, start):
    return [{**item, "time": round(float(item["time"]) - start, 6)} for item in items]


def render_window(start, end, width, out_dir, source, payload, keep_intermediates=False):
    duration = end - start
    output_fps = 30
    height = round(width * 16 / 9)
    reframe = payload["finish_plan"]["reframe"]
    cuts = local_time_marks(reframe["timeline_cuts"], start)
    last_cut = max((cut for cut in cuts if cut["time"] <= 0), key=lambda cut: cut["time"])
    cuts = [{**last_cut, "time": 0}, *(cut for cut in cuts if 0 < cut["time"] < duration)]
    split = copy.deepcopy(reframe.get("split_source") or {})
    for slot in ("top", "bottom"):
        if split.get(slot, {}).get("keyframes"):
            split[slot]["keyframes"] = local_time_marks(split[slot]["keyframes"], start)
        if split.get(slot, {}).get("source_time_offset_keyframes"):
            split[slot]["source_time_offset_keyframes"] = local_time_marks(
                split[slot]["source_time_offset_keyframes"], start
            )
    specs = plan_reframe_timeline_segments(
        duration, cuts, split,
        local_time_marks(reframe.get("speaker_order_cuts") or [], start),
        local_time_marks(reframe["keyframes"], start),
    )
    parts = []
    label = f"{start:g}-{end:g}"
    for index, segment in enumerate(specs):
        # Snap every cut to the global output frame grid. Rounding each short
        # segment independently adds duplicate frames and eventually shifts
        # the camera crop away from the source cut.
        start_frame = round(float(segment["start"]) * output_fps)
        end_frame = round(float(segment["end"]) * output_fps)
        if end_frame <= start_frame:
            continue
        frame_segment = {
            **segment,
            "start": start_frame / output_fps,
            "end": end_frame / output_fps,
        }
        frame_count = end_frame - start_frame
        piece = out_dir / f"{label}-segment-{index:02d}.mp4"
        split_framing = frame_segment.get("split_framing") or {}
        offsets = [
            float((split_framing.get(slot) or {}).get("source_time_offset_seconds", 0) or 0)
            for slot in ("top", "bottom")
        ] if frame_segment.get("mode") == "center" else [0.0, 0.0]
        if frame_segment.get("mode") == "speaker_track":
            offsets = [float(frame_segment.get("source_time_offset_seconds", 0) or 0)]
        active_offsets = [offset for offset in offsets if abs(offset) > 1e-6]
        if len(active_offsets) > 1:
            raise ValueError("A source split supports one alternate full-frame angle per segment")
        inputs = ["-ss", f"{start + frame_segment['start']:.6f}", "-i", source]
        if active_offsets:
            inputs.extend([
                "-ss", f"{start + frame_segment['start'] + active_offsets[0]:.6f}", "-i", source,
            ])
        if not piece.exists() or piece.stat().st_size < 1000:
            run(*inputs,
                "-filter_complex", build_reframe_segment_filter(
                    1920, 1080, width, height, frame_segment, reframe["zoom"],
                    alternate_input_label="[1:v]" if active_offsets else None),
                "-map", "[vout]", "-frames:v", str(frame_count), "-an",
                "-c:v", "libx264", "-preset", "veryfast",
                "-crf", "19", "-pix_fmt", "yuv420p", "-y", piece)
        parts.append(piece)
    concat_file = out_dir / f"{label}-concat.txt"
    concat_file.write_text("".join(f"file '{piece}'\n" for piece in parts))
    joined = out_dir / f"{label}-reframed.mp4"
    run("-f", "concat", "-safe", "0", "-i", concat_file, "-c:v", "copy", "-y", joined)

    color = payload["finish_plan"]["color"]
    finish_filters = [build_studio_finish_filter({"enabled": True, "color": color})]
    for layer in payload["finish_plan"].get("adjustment_layers", []):
        layer_start = float(layer["startTime"])
        layer_end = layer_start + float(layer["duration"])
        if layer_start <= start and end <= layer_end:
            finish_filters.append(build_studio_finish_filter({
                "enabled": True, "color": layer["effects"]["color"]
            }))
        elif start < layer_end and layer_start < end:
            raise ValueError("Choose a review window within or outside a grade layer")
    finish = ",".join(finish_filters)
    captions = []
    for item in payload["caption_segments"]:
        if item["end_time"] <= start or item["start_time"] >= end:
            continue
        captions.append({**item,
                         "start_time": max(0, item["start_time"] - start),
                         "end_time": min(duration, item["end_time"] - start)})
    ass = generate_ass_captions(
        build_edited_caption_transcript(captions), payload["caption_style"],
        width, height, payload["caption_position"], payload["caption_scale"])
    ass_file = out_dir / f"{label}-captions.ass"
    ass_file.write_text(ass, encoding="utf-8")
    final = out_dir / f"{label}-review.mp4"
    frame_filter = build_main_video_frame_filter(
        payload["finish_plan"], width, height
    ).replace("[0:v]", "[graded]", 1)
    final_filter = f"[0:v]{finish}[graded];{frame_filter};[v_main_frame]ass={ass_file}[vout]"
    run("-i", joined, "-ss", f"{start:.6f}", "-i", source,
        "-t", f"{duration:.6f}",
        "-filter_complex", final_filter, "-map", "[vout]", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
        "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", "-y", final)
    if not keep_intermediates:
        for temporary in [*parts, concat_file, joined, ass_file]:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass
    print(json.dumps({"window": [start, end], "segments": len(specs), "captions": len(captions), "output": str(final)}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=PROOF / "unmuted-podcast-10m-source.mp4")
    parser.add_argument("--output", type=Path, default=PROOF / "local-revision")
    parser.add_argument("--width", type=int, default=540)
    parser.add_argument("--window", nargs=2, type=float, action="append")
    parser.add_argument("--keep-intermediates", action="store_true")
    args = parser.parse_args()
    args.source = args.source.resolve()
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    # Generate exactly the same reviewed settings as the frontend proof.
    payload_file = args.output / "review-settings.json"
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/ten-minute-podcast-payload.py"), str(payload_file)],
        env={**os.environ, "AUTOPROMOTE_QA_SOURCE_URL": str(args.source)},
        check=True,
    )
    payload = json.loads(payload_file.read_text())
    for start, end in args.window or [(174, 184), (208, 214)]:
        render_window(start, end, args.width, args.output, args.source, payload,
                      keep_intermediates=args.keep_intermediates)


if __name__ == "__main__":
    main()
