#!/usr/bin/env python3
"""Burn real, reviewed ASR dialogue into the real AutoPromote podcast edit."""

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from python_media_worker.main_media_server import generate_ass_captions  # noqa: E402
from python_media_worker.viral_render_contract import build_edited_caption_transcript  # noqa: E402


SOURCE_START = 0.0
LINES = [
    (1.36, 3.92, "Molweni. Molweni, my lovely viewers at home.", "rainbow", "middle_center", "eyes", "#8b5cf6"),
    (3.92, 5.54, "It's truly been a long time.", "story_pop", "middle_center", "heart", "#ff5d8f"),
    (5.54, 7.00, "I have missed you so much,", "rainbow", "middle_center", "heart", "#8b5cf6"),
    (7.00, 9.26, "and I hope that you missed us as well.", "boxed", "bottom_center", "none", "#8b5cf6"),
    (9.76, 11.30, "I'm very excited and thrilled", "rainbow", "bottom_center", "fire", "#f6e652"),
    (11.30, 13.10, "to let you all know that we are back.", "watch_me", "middle_center", "fire", "#f6e652"),
    (13.10, 15.46, "Sibuyile — like we have never left.", "story_pop", "bottom_center", "none", "#ff5d8f"),
    (16.02, 18.40, "I thereby welcome you to another episode", "boxed", "bottom_center", "none", "#8b5cf6"),
    (18.40, 20.54, "of Hearty Home of Unmuted Podcast,", "boxed", "bottom_center", "none", "#8b5cf6"),
    (18.40, 20.20, "UNMUTED", "wall_type", "background_left", "mic", "#ff5d8f"),
    (20.54, 22.12, "where each and every week", "boxed", "bottom_center", "none", "#8b5cf6"),
    (22.12, 25.28, "we're going to dive in and have deep, raw and authentic", "rainbow", "bottom_center", "none", "#8b5cf6"),
    (25.28, 28.10, "conversations with leaders, members and stakeholders", "boxed", "bottom_center", "none", "#8b5cf6"),
    (28.10, 31.98, "of community art organizations, uncovering their untold stories", "boxed", "bottom_center", "none", "#8b5cf6"),
    (31.98, 34.70, "layer by layer, truth by truth.", "watch_me", "bottom_center", "hundred", "#ff5d8f"),
    (35.14, 35.52, "Are you ready?", "watch_me", "middle_center", "eyes", "#f6e652"),
    (35.52, 37.40, "You better fasten up your seatbelt.", "rainbow", "bottom_center", "fire", "#f6e652"),
    (37.40, 39.08, "I am your host with the mic on,", "boxed", "bottom_center", "none", "#3ce0d0"),
    (39.08, 40.46, "Lisakhanya Mdoda.", "boxed", "bottom_center", "none", "#3ce0d0"),
    (40.46, 42.34, "Lisakhanya Mdoda", "sticker", "shoulder_left", "mic", "#ff5d8f"),
    (40.46, 42.64, "Today is truly a special one,", "boxed", "bottom_center", "none", "#3ce0d0"),
    (42.64, 45.74, "because I'm sitting right across a sensational figure.", "boxed", "bottom_center", "none", "#3ce0d0"),
    (45.74, 47.64, "Welcome to our humble abode.", "story_pop", "bottom_center", "heart", "#8b5cf6"),
    (47.64, 49.08, "Welcome to our studio, man.", "rainbow", "shoulder_right", "clap", "#8b5cf6"),
    (49.08, 51.50, "Ndibulela, ufika ekhaya.", "boxed", "bottom_center", "none", "#72f59b"),
    (51.50, 52.24, "Igama lam,", "boxed", "bottom_center", "none", "#72f59b"),
    (52.24, 53.18, "NdinguSiphamandla", "boxed", "bottom_center", "none", "#72f59b"),
    (53.18, 54.04, "Tsephe.", "boxed", "bottom_center", "none", "#72f59b"),
    (54.04, 56.24, "Siphamandla Tsephe", "sticker", "shoulder_right", "mic", "#ff5d8f"),
    (54.04, 56.60, "Ndihlala eKhayelitsha, eHarare.", "boxed", "bottom_center", "place", "#72f59b"),
    (56.60, 57.62, "Ndiyavuyo ubalapha.", "boxed", "bottom_center", "none", "#72f59b"),
    (57.62, 59.72, "First and foremost, thank you so much.", "rainbow", "bottom_center", "heart", "#72f59b"),
]


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: render-real-captioned-podcast-proof.py SOURCE OUTPUT")
    source, output = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    # Keep the complete source minute, including the natural tail after speech.
    duration = 60.0 - SOURCE_START

    grouped = {}
    reviewed = []
    for index, (start, end, text, style, placement, icon, accent) in enumerate(LINES):
        segment = {
            "id": f"real-caption-{index + 1}",
            "start_time": round(start - SOURCE_START, 3),
            "end_time": round(end - SOURCE_START, 3),
            "text": text,
            "caption_placement": placement,
            "caption_icon": icon,
            "caption_accent": accent,
            "text_review_required": False,
            "text_reviewed": True,
        }
        grouped.setdefault(style, []).append(segment)
        reviewed.append({**segment, "style": style, "source_start": start, "source_end": end})

    with tempfile.TemporaryDirectory(prefix="real-caption-proof-") as temp:
        temp_path = Path(temp)
        filters = []
        previous = "0:v"
        for filter_index, (style, segments) in enumerate(grouped.items()):
            transcript = build_edited_caption_transcript(segments)
            ass_path = temp_path / f"{filter_index:02d}-{style}.ass"
            ass_path.write_text(
                generate_ass_captions(transcript, style, 1080, 1920),
                encoding="utf-8",
            )
            output_label = f"captioned{filter_index}"
            filters.append(f"[{previous}]ass='{ass_path.as_posix()}'[{output_label}]")
            previous = output_label

        subprocess.run([
            "ffmpeg", "-v", "error", "-ss", str(SOURCE_START), "-t", f"{duration:.3f}",
            "-i", str(source), "-filter_complex", ";".join(filters),
            "-map", f"[{previous}]", "-map", "0:a:0", "-c:v", "libx264",
            "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart", "-shortest", "-y", str(output),
        ], check=True)

    output.with_suffix(".captions.json").write_text(json.dumps({
        "source": str(source),
        "source_window": [SOURCE_START, max(line[1] for line in LINES)],
        "caption_source": "two-pass real-audio ASR with creator-confirmed speaker names",
        "creator_confirmed_names": ["Lisakhanya Mdoda", "Siphamandla Tsephe"],
        "segments": reviewed,
    }, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
