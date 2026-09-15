#!/usr/bin/env python3
"""Render a concise real-footage montage through every Viral Studio caption preset."""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from python_media_worker.main_media_server import generate_ass_captions  # noqa: E402
from python_media_worker.viral_render_contract import build_edited_caption_transcript  # noqa: E402


STYLES = [
    ("story_pop", "STORY POP", "top_left", "phone", "#ffb33d"),
    ("bold_pop", "BOLD POP", "top_center", "none", "#8b5cf6"),
    ("karaoke", "KARAOKE", "top_right", "music", "#3ce0d0"),
    ("glow", "NEON GLOW", "middle_left", "none", "#54a8ff"),
    ("bounce", "BOUNCE", "middle_center", "payoff", "#f6e652"),
    ("minimal", "MINIMAL", "middle_right", "none", "#ffffff"),
    ("headline", "BIG HEADLINE", "bottom_left", "none", "#ff5d8f"),
    ("boxed", "SUBTITLE CARD", "bottom_center", "none", "#3ce0d0"),
    ("comic", "COMIC PUNCH", "bottom_right", "payoff", "#f6e652"),
    ("gradient", "GRADIENT POP", "custom", "none", "#ff5d8f"),
    ("typewriter", "TYPEWRITER", "custom", "none", "#72f59b"),
    ("editorial", "EDITORIAL SERIF", "custom", "none", "#ffffff"),
    ("sticker", "STICKER STACK", "top_left", "payoff", "#ff5d8f"),
    ("marker", "MARKER SWIPE", "top_center", "none", "#f6e652"),
    ("glass", "GLASS", "top_right", "none", "#3ce0d0"),
    ("newsroom", "NEWS FLASH", "middle_left", "none", "#ff5d8f"),
    ("luxury", "LUXURY", "middle_center", "none", "#e7c77d"),
    ("retro", "RETRO", "bottom_center", "music", "#f6e652"),
]


def run(command):
    subprocess.run(command, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    segment_duration = 1.6

    with tempfile.TemporaryDirectory(prefix="autopromote-caption-proof-") as temporary:
        temporary_path = Path(temporary)
        rendered_segments = []
        for index, (style, label, placement, icon, accent) in enumerate(STYLES):
            segment = {
                "start_time": 0,
                "end_time": segment_duration,
                "text": label,
                "caption_placement": placement,
                "caption_icon": icon,
                "caption_accent": accent,
                "caption_x": (12, 50, 88)[index % 3],
                "caption_y": (14, 50, 86)[index % 3],
            }
            transcript = build_edited_caption_transcript([segment])
            ass_path = temporary_path / f"{index:02d}-{style}.ass"
            ass_path.write_text(
                generate_ass_captions(transcript, style, 720, 1280),
                encoding="utf-8",
            )
            rendered_path = temporary_path / f"{index:02d}-{style}.mp4"
            run([
                "ffmpeg", "-v", "error", "-ss", f"{index * segment_duration:.3f}",
                "-t", f"{segment_duration:.3f}", "-i", str(args.source),
                "-vf",
                f"crop=608:1080:180:0,scale=720:1280,ass='{ass_path.as_posix()}',fps=25",
                "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264",
                "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
                "-shortest", "-y", str(rendered_path),
            ])
            rendered_segments.append(rendered_path)

        concat_path = temporary_path / "concat.txt"
        concat_path.write_text(
            "".join(f"file '{item.as_posix()}'\n" for item in rendered_segments),
            encoding="utf-8",
        )
        run([
            "ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i",
            str(concat_path), "-c", "copy", "-movflags", "+faststart", "-y",
            str(args.output),
        ])


if __name__ == "__main__":
    main()
