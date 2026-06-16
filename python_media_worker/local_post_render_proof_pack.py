#!/usr/bin/env python3
"""
Create a local proof pack for a completed MP4.

This does not call Cloud Run or upload anything. It cuts short local samples
across the timeline and writes a manifest so a long render can be checked
without watching the full episode end to end.
"""

import argparse
import json
import shutil
import subprocess
from pathlib import Path


def parse_timecode(value: str) -> float:
    raw = value.strip()
    if not raw:
        raise argparse.ArgumentTypeError("empty timecode")
    if raw.replace(".", "", 1).isdigit():
        return float(raw)
    parts = raw.split(":")
    if len(parts) > 3:
        raise argparse.ArgumentTypeError(f"invalid timecode: {value}")
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + float(part)
    return seconds


def format_timecode(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def safe_stamp(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02d}h{minutes:02d}m{secs:02d}s"


def run(command):
    subprocess.run(command, check=True)


def ffprobe_duration(video_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(video_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def build_sample_times(duration: float, interval: float, extras: list[float]) -> list[float]:
    times = {0.0}
    cursor = interval
    while cursor < duration:
        times.add(cursor)
        cursor += interval
    for marker in (duration * 0.25, duration * 0.5, duration * 0.75, max(0.0, duration - interval)):
        times.add(marker)
    for extra in extras:
        if 0 <= extra < duration:
            times.add(extra)
    return sorted(times)


def parse_args():
    parser = argparse.ArgumentParser(description="Create local proof clips for a completed render.")
    parser.add_argument("video", help="Completed MP4 to audit locally")
    parser.add_argument("--output-dir", required=True, help="Directory for proof clips and manifest")
    parser.add_argument("--interval", type=float, default=300.0, help="Seconds between regular proof clips")
    parser.add_argument("--clip-duration", type=float, default=25.0, help="Seconds per proof clip")
    parser.add_argument(
        "--extra",
        action="append",
        default=[],
        type=parse_timecode,
        help="Extra sample time as seconds or HH:MM:SS. Can be repeated.",
    )
    parser.add_argument("--copy-link", action="store_true", help="Symlink the full MP4 into the proof folder")
    return parser.parse_args()


def main():
    args = parse_args()
    video_path = Path(args.video).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()

    if not video_path.exists():
        raise SystemExit(f"Video not found: {video_path}")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("ffmpeg and ffprobe are required")

    output_dir.mkdir(parents=True, exist_ok=True)
    duration = ffprobe_duration(video_path)
    sample_times = build_sample_times(duration, args.interval, args.extra)

    clips = []
    for start in sample_times:
        clip_duration = min(args.clip_duration, max(0.1, duration - start))
        stamp = safe_stamp(start)
        clip_path = output_dir / f"proof_{stamp}.mp4"
        thumb_path = output_dir / f"proof_{stamp}.jpg"
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-ss",
                format_timecode(start),
                "-t",
                f"{clip_duration:.3f}",
                "-i",
                str(video_path),
                "-c",
                "copy",
                "-avoid_negative_ts",
                "make_zero",
                str(clip_path),
            ]
        )
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-ss",
                format_timecode(start + min(1.0, clip_duration / 2)),
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                str(thumb_path),
            ]
        )
        clips.append(
            {
                "start_seconds": round(start, 3),
                "start_timecode": format_timecode(start),
                "duration_seconds": round(clip_duration, 3),
                "clip": str(clip_path),
                "thumbnail": str(thumb_path),
            }
        )

    if args.copy_link:
        link_path = output_dir / "FULL_RENDER_UNTOUCHED_SOURCE.mp4"
        if link_path.exists() or link_path.is_symlink():
            link_path.unlink()
        link_path.symlink_to(video_path)

    manifest = {
        "source": str(video_path),
        "duration_seconds": round(duration, 3),
        "duration_timecode": format_timecode(duration),
        "clip_duration_seconds": args.clip_duration,
        "interval_seconds": args.interval,
        "proof_clip_count": len(clips),
        "clips": clips,
    }
    manifest_path = output_dir / "proof_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(manifest_path)
    for clip in clips:
        print(clip["clip"])


if __name__ == "__main__":
    main()
