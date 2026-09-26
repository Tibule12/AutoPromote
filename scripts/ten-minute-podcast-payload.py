#!/usr/bin/env python3
"""Build the private cloud QA payload from the real editable podcast transcript."""

import json
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRT_PATH = ROOT / "proof/viral-clip-studio/full-podcast-captions/full-podcast-editable-captions.srt"
SPEAKER_TEMPLATE_CUTS_PATH = ROOT / "proof/viral-clip-studio/ten-minute-director/reviewed-speaker-template-cuts.json"
PICTURE_PADDING_PATH = ROOT / "proof/viral-clip-studio/ten-minute-director/measured-picture-padding.json"
SEGMENT_START = 600.0
SEGMENT_END = 1200.0
# These are editor-approved crop positions, expressed as a percentage of the
# available horizontal crop travel. Every solo shot uses one of these two
# templates, so face tracking cannot drift the composition between cuts.
SPEAKER_TEMPLATES = {
    "left": {"x": 23.0, "y": 30.0},
    "right": {"x": 74.0, "y": 30.0},
}
# These source shots move much farther across the flattened programme than
# their normal speaker templates. Keep the complete face in the portrait card
# after picture fill rather than letting the template clip a cheek or ear.
SHOT_CROP_OVERRIDES = {
    53.5357: {"x": 44.0},
    81.519: {"x": 86.0},
    88.519: {"x": 86.0},
    159.519: {"x": 80.0},
    342.519: {"x": 88.0},
    346.019: {"x": 88.0},
    391.019: {"x": 8.0},
    511.019: {"x": 80.0},
    541.769: {"x": 8.0},
    544.769: {"x": 10.0},
    546.536: {"x": 0.0},
    577.019: {"x": 86.0},
    592.019: {"x": 10.0},
}
# A participant moves substantially *within* these source shots. These
# reviewed points follow the visible motion smoothly, without introducing an
# extra camera cut, time offset, or reaction inset.
SHOT_MOTION_POINTS = (
    {"time": 346.7, "x": 88.0, "y": 30.0, "cut": False},
    {"time": 347.4, "x": 77.0, "y": 30.0, "cut": False},
    {"time": 437.35, "x": 58.0, "y": 30.0, "cut": False},
    {"time": 545.08, "x": 10.0, "y": 30.0, "cut": False},
    {"time": 545.4, "x": 35.0, "y": 30.0, "cut": False},
    {"time": 547.25, "x": 22.0, "y": 30.0, "cut": False},
    {"time": 571.5, "x": 90.0, "y": 30.0, "cut": False},
)
# Reviewed moments where both speakers should be visible in two rounded cards.
# start, end, active-speaker caption y. Director captions stay attached to
# the speaking card instead of floating mechanically in the centre gutter.
SPLIT_WINDOWS = ((176.0, 177.0, 40), (210.0, 211.0, 91))
def timestamp_seconds(value):
    hours, minutes, remainder = value.split(":")
    seconds, millis = remainder.split(",")
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000


def load_captions():
    blocks = re.split(r"\n\s*\n", SRT_PATH.read_text(encoding="utf-8").strip())
    captions = []
    for block in blocks:
        lines = block.splitlines()
        if len(lines) < 3 or " --> " not in lines[1]:
            continue
        source_start, source_end = map(timestamp_seconds, lines[1].split(" --> "))
        if source_end <= SEGMENT_START or source_start >= SEGMENT_END:
            continue
        start = max(0.0, source_start - SEGMENT_START)
        end = min(SEGMENT_END - SEGMENT_START, source_end - SEGMENT_START)
        # A sentence may cross a one-second Director split. Move its caption
        # only while the split is on screen, keeping solo captions below faces.
        boundaries = sorted({start, end, *(
            boundary for split_start, split_end, _ in SPLIT_WINDOWS
            for boundary in (split_start, split_end) if start < boundary < end
        )})
        for piece_start, piece_end in zip(boundaries, boundaries[1:]):
            middle = (piece_start + piece_end) / 2
            active_split = next((window for window in SPLIT_WINDOWS
                                 if window[0] <= middle < window[1]), None)
            captions.append({
                "id": f"qa-caption-{len(captions) + 1}",
                "start_time": round(piece_start, 3),
                "end_time": round(piece_end, 3),
                "text": " ".join(lines[2:]).strip(),
                "speaker": "Speaker review required",
                "speaker_label": "Speaker review required",
                "language": "und",
                "language_label": "Language review required",
                "text_review_required": True,
                "text_reviewed": False,
                "review_required": True,
                "caption_placement": "custom",
                "caption_icon": "none",
                "caption_accent": "#FFD400",
                "caption_x": 50,
                "caption_y": active_split[2] if active_split else 84,
            })
    return captions


def framing_keyframes():
    reviewed_cuts = json.loads(SPEAKER_TEMPLATE_CUTS_PATH.read_text(encoding="utf-8"))
    keyframes = []
    for reviewed in reviewed_cuts:
        time = float(reviewed["time"])
        side = str(reviewed.get("side") or "").strip().lower()
        if reviewed.get("reviewed") is not True or side not in SPEAKER_TEMPLATES:
            raise ValueError(f"Unreviewed speaker template cut at {time:g} seconds")
        if 0 <= time < 600:
            template = dict(SPEAKER_TEMPLATES[side])
            if "x" in reviewed:
                template["x"] = float(reviewed["x"])
            if "y" in reviewed:
                template["y"] = float(reviewed["y"])
            template.update(SHOT_CROP_OVERRIDES.get(time, {}))
            if not all(0 <= template[axis] <= 100 for axis in ("x", "y")):
                raise ValueError(f"Invalid reviewed speaker crop at {time:g} seconds")
            keyframes.append({"time": time, **template, "cut": True})
    if not keyframes or keyframes[0]["time"] != 0:
        raise ValueError("Reviewed speaker template cuts must begin at 0 seconds")
    return keyframes


def main():
    source_url = os.environ.get("AUTOPROMOTE_QA_SOURCE_URL", "").strip()
    if not source_url:
        raise SystemExit("AUTOPROMOTE_QA_SOURCE_URL is required")
    output_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/autopromote-10m-cloud-payload.json")
    shot_keyframes = framing_keyframes()
    picture_padding = json.loads(PICTURE_PADDING_PATH.read_text(encoding="utf-8"))["shots"]
    if len(picture_padding) != len(shot_keyframes) or any(
        float(shot["time"]) != float(frame["time"])
        for shot, frame in zip(picture_padding, shot_keyframes)
    ):
        raise ValueError("Measured picture padding must match every source camera edit")
    zoom_at_cut = {float(shot["time"]): float(shot["zoom"]) for shot in picture_padding}
    keyframes = sorted([*shot_keyframes, *SHOT_MOTION_POINTS], key=lambda frame: frame["time"])
    # Record picture fill in Director's editable zoom timeline at every source
    # camera edit; both speakers retain the same outer rounded frame.
    timeline_by_time = {}
    for frame in shot_keyframes:
        time = float(frame["time"])
        timeline_by_time[time] = {
            "time": time, "mode": "speaker_track", "zoom": zoom_at_cut[time],
        }
    for start, end, _caption_y in SPLIT_WINDOWS:
        timeline_by_time[start] = {"time": start, "mode": "center", "zoom": 1.0}
        active_frame = max((frame for frame in shot_keyframes if frame["time"] <= end), key=lambda frame: frame["time"])
        timeline_by_time[end] = {
            "time": end,
            "mode": "speaker_track",
            "zoom": zoom_at_cut[float(active_frame["time"])],
        }
    timeline_cuts = [timeline_by_time[time] for time in sorted(timeline_by_time)]
    split_top = {
        "x": 29,
        "y": 48,
        "zoom": 1.08,
        "keyframes": [
            {"time": 176, "x": 29, "y": 48, "cut": True},
            {"time": 210, "x": 35, "y": 48, "cut": True},
        ],
    }
    split_bottom = {
        "x": 65,
        "y": 50,
        "zoom": 1.1,
        "keyframes": [
            {"time": 176, "x": 65, "y": 50, "cut": True},
            {"time": 210, "x": 65, "y": 50, "cut": True},
        ],
        # The source is a flattened programme. Use a nearby clean full-frame
        # host shot as the second angle; never enlarge the embedded reaction.
        "source_time_offset_keyframes": [
            # Each alternate window stays inside one uninterrupted host shot
            # for the full Director beat. Crossing a source camera edit here
            # would duplicate the guest in both cards halfway through split.
            {"time": 176, "offset_seconds": 18.35},
            {"time": 210, "offset_seconds": -11.4},
        ],
    }
    payload = {
        "video_url": source_url,
        "start_time": 0,
        "end_time": 600,
        "timeline_segments": [{
            "id": "real-podcast-10m",
            "url": source_url,
            "start_time": 0,
            "end_time": 600,
            "duration": 600,
        }],
        "auto_captions": True,
        "caption_style": "boxed",
        "caption_position": "lower",
        "caption_scale": 0.74,
        "caption_segments": load_captions(),
        "caption_review_copy": True,
        "translate_captions_to_english": False,
        "professional_cleanup": False,
        "smart_crop": True,
        "smart_crop_mode": "speaker_track",
        "visual_enhance": False,
        "mute_audio": False,
        "add_music": False,
        "silence_removal": False,
        "export_destination": "reels",
        "brand_watermark": False,
        "brand_watermark_variant": "studio",
        "brand_watermark_schedule": [
            {"time": index * 10, "corner": "top_left" if x > 50 else "top_right"}
            for index, x in enumerate([frame["x"] for frame in keyframes])
        ],
        "finish_plan": {
            "version": 1,
            "enabled": True,
            "main_frame": {
                "enabled": True,
                "shape": "round",
                "inset_percent": 2.5,
                "border_radius_percent": 10,
                "background": "studio_black",
            },
            "reframe": {
                "aspect": "9:16",
                "zoom": 1.0,
                "keyframes": keyframes,
                "timeline_cuts": timeline_cuts,
                "split_source": {
                    "divider_percent": 50,
                    "rounded_cards": True,
                    "card_inset_percent": 2.5,
                    "card_gap_percent": 12,
                    "card_radius_percent": 6,
                    "top": split_top,
                    "bottom": split_bottom,
                },
                "speaker_order_cuts": [
                    {"time": 176, "slot": "top"},
                    {"time": 210, "slot": "bottom"},
                ],
            },
            "color": {
                "preset": "studio_natural",
                "precisionGrade": True,
                "exposureStops": 0.0,
                "lift": 0.004,
                "gamma": 1.012,
                "gain": 0.995,
                "tint": 0.025,
                "brightness": 1.0,
                "contrast": 1.03,
                "saturation": 0.90,
                "temperature": -0.20,
                "sharpness": 0.08,
                "vignette": 0.01,
            },
            "texture": {
                "film_grain": 0.0,
                "chromatic_aberration": 0.0,
                "vhs_tracking": 0.0,
                "light_leak": 0.0,
            },
            "adjustment_layers": [
                {
                    "id": "cool-red-screen-pass",
                    "name": "Red-screen balance",
                    "startTime": 170,
                    "duration": 70,
                    "effects": {
                        "blendMode": "normal",
                        "opacity": 1,
                        "color": {
                            "precisionGrade": True,
                            "exposureStops": -0.03,
                            "lift": 0.0,
                            "gamma": 1.005,
                            "gain": 0.99,
                            "tint": 0.015,
                            "brightness": 1.0,
                            "contrast": 1.0,
                            "saturation": 0.84,
                            "temperature": -0.08,
                        },
                        "texture": {},
                    },
                }
            ],
        },
        "editor_timeline": {
            "duration": 600,
            "caption_blocks": len(load_captions()),
            "director_cuts": timeline_cuts,
            "adjustment_blocks": [{"id": "cool-red-screen-pass", "start": 170, "duration": 70}],
            "split_blocks": [
                {"start": start, "duration": end - start}
                for start, end, _caption_y in SPLIT_WINDOWS
            ],
        },
        "output_settings": {
            "resolution": "1080p",
            "fps": "30",
            "codec": "h264",
            "quality": "high",
            "color_space": "rec709",
            "audio_bitrate": "192k",
        },
        "job_id": "ten-minute-director-20260919",
        "async_mode": False,
    }
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    output_path.chmod(0o600)
    print(json.dumps({
        "output": str(output_path),
        "captions": len(payload["caption_segments"]),
        "framing_keyframes": len(keyframes),
        "director_cuts": len(timeline_cuts),
        "split_windows": len(SPLIT_WINDOWS),
        "adjustment_layers": 1,
    }))


if __name__ == "__main__":
    main()
