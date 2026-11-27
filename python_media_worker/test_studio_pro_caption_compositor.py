"""Verification tests for Pro RGBA caption compositor, RVM depth sandwich, and TV/clutter safety."""
from __future__ import annotations

from pathlib import Path
import subprocess
import tempfile

import cv2
import numpy as np

from python_media_worker.main_media_server import (
    CAPTION_STYLES,
    build_viral_export_encode_args,
    resolve_story_caption_treatment,
    resolve_viral_export_profile,
)
from python_media_worker.studio_caption_safety import (
    analyze_caption_safety_for_segments,
    estimate_subject_occupancy,
    score_candidate_zones,
    segment_person_alpha_rvm,
)
from python_media_worker.studio_pro_caption_compositor import (
    _build_word_cues,
    _layout_cue_lines,
    composite_pro_captions_on_video,
    render_pro_caption_on_frame,
)

REAL_PODCAST_FAST = (
    Path(__file__).resolve().parents[1].parent
    / "AutoPromote"
    / "test"
    / "e2e"
    / "playwright"
    / "test-assets"
    / "real-podcast-fast.mp4"
)
PODCAST_CONVERSATION = (
    Path(__file__).resolve().parents[1] / "frontend" / "public" / "landing" / "podcast-conversation.mp4"
)


def test_clutter_detector_rejects_glowing_tv_screen_in_favor_of_calm_wall():
    """Verify Smart Safe prefers calm matte wall over bright high-saturation TV graphics."""
    h, w = 216, 384
    frame = np.full((h, w, 3), (205, 205, 205), dtype=np.uint8)  # calm neutral left wall
    # Glowing orange-red TV billboard with sharp text graphics on the right half
    cv2.rectangle(frame, (int(w * 0.48), int(h * 0.12)), (int(w * 0.94), int(h * 0.72)), (24, 92, 245), -1)
    cv2.putText(frame, "UNMUTED PODCAST", (int(w * 0.50), int(h * 0.42)), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 3)

    occ = estimate_subject_occupancy(frame)
    decision = score_candidate_zones(
        occ["face_mask"],
        occ["body_mask"],
        occ["clutter_map"],
        style_name="wall_type",
        preferred_mode="smart_safe",
        cue_text="Captions avoid bright screens",
    )
    assert decision["xPct"] < 46.0
    assert decision["clutterScore"] < 0.16


def test_pro_compositor_depth_sandwich_and_frosted_glass():
    """Verify backdrop frosted glass alters ROI smoothly AND RVM matte protects speaker foreground."""
    src = str(REAL_PODCAST_FAST)
    cap = cv2.VideoCapture(src)
    ok, frame = cap.read()
    cap.release()
    assert ok and frame is not None

    # 1. Frosted Glass at top calm wall renders cleanly with glowing active word
    seg_glass = [{"start": 0.0, "end": 2.0, "text": "Frosted clarity over studio", "captionPlacement": "top_left"}]
    cues_g = _build_word_cues(seg_glass, "glass", CAPTION_STYLES["glass"], resolve_story_caption_treatment, frame.shape[1], frame.shape[0], 1.0, "smart_safe")
    out_g = render_pro_caption_on_frame(frame, 0.85, cues_g)
    diff_g = np.abs(out_g.astype(np.int16) - frame.astype(np.int16))
    assert float(diff_g.mean()) > 0.25

    # 2. Depth Sandwich: place wall_type directly behind speaker silhouette and confirm speaker pixels stay foregrounded
    rvm_alpha = segment_person_alpha_rvm(frame, target_long_edge=384, passes=2)
    assert rvm_alpha is not None and float(rvm_alpha.max()) > 0.8
    seg_wall = [{"start": 0.0, "end": 2.0, "text": "BEHIND THE SPEAKER HAIRLINE", "captionPlacement": "custom", "captionX": 33, "captionY": 28}]
    cues_w = _build_word_cues(seg_wall, "wall_type", CAPTION_STYLES["wall_type"], resolve_story_caption_treatment, frame.shape[1], frame.shape[0], 1.2, "creative")
    out_w = render_pro_caption_on_frame(frame, 0.9, cues_w, rvm_alpha_full=rvm_alpha)

    # Core speaker foreground pixels (where RVM alpha > 0.85) must stay untouched over caption behind them
    fg_diff = np.abs(out_w.astype(np.int16) - frame.astype(np.int16))[rvm_alpha > 0.85]
    assert float(fg_diff.mean()) < 4.0
    # Background drywall pixels (where RVM alpha < 0.05) around speaker must clearly show caption behind him
    bg_diff = np.abs(out_w.astype(np.int16) - frame.astype(np.int16))[rvm_alpha < 0.05]
    assert float(bg_diff.max()) > 40.0


def test_pro_compositor_full_video_export_preserves_audio_and_codec():
    """Render a 1.5s trimmed real talking clip through composite_pro_captions_on_video using production encode args."""
    assert REAL_PODCAST_FAST.is_file()
    with tempfile.TemporaryDirectory(prefix="pro-cap-vid-") as tmp:
        tmp_dir = Path(tmp)
        trimmed = tmp_dir / "trim.mp4"
        exported = tmp_dir / "exported.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error", "-ss", "0.5", "-t", "1.5",
                "-i", str(REAL_PODCAST_FAST), "-vf", "scale=960:540",
                "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", str(trimmed),
            ],
            check=True,
        )
        segs = [{"start": 0.0, "end": 1.45, "text": "Pro studio captions stay sharp"}]
        safe = analyze_caption_safety_for_segments(str(trimmed), segs, style_name="editorial_duo", preferred_mode="smart_safe")
        assert safe["summary"]["zeroFaceOverlapCues"] == 1

        profile = resolve_viral_export_profile({"resolution": "source", "codec": "h264", "quality": "balanced"}, 960, 540)
        enc_args = build_viral_export_encode_args(profile)
        stats = composite_pro_captions_on_video(
            str(trimmed),
            str(exported),
            safe["segments"],
            "editorial_duo",
            resolve_story_caption_treatment,
            CAPTION_STYLES,
            encode_args=enc_args,
        )
        assert stats["framesWritten"] >= 35
        assert exported.is_file() and exported.stat().st_size > 40_000
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "csv=p=0", str(exported)],
            capture_output=True, text=True, check=True,
        )
        assert "video" in probe.stdout and "h264" in probe.stdout and "audio" in probe.stdout


def test_multi_host_conversation_safety_clears_both_speakers():
    """Verify two-speaker podcast clip detects both faces and clears all cues cleanly."""
    if not PODCAST_CONVERSATION.is_file():
        return
    segs = [
        {"start": 0.4, "end": 2.0, "text": "Speaker one makes a point"},
        {"start": 2.4, "end": 4.2, "text": "Speaker two replies calmly"},
    ]
    res = analyze_caption_safety_for_segments(str(PODCAST_CONVERSATION), segs, style_name="editorial_duo", preferred_mode="smart_safe")
    assert res["summary"]["cuesAnalyzed"] == 2
    assert res["summary"]["zeroFaceOverlapCues"] == 2
    assert res["summary"]["facesDetectedCues"] == 2


def test_all_26_styles_fit_bounds_and_margins_across_all_studio_frames():
    """All 26 caption templates must stay in bounds, <=3 lines, with >=2% margins on 16:9, 9:16, 4:5, and 1:1."""
    assert len(CAPTION_STYLES) == 26
    frame_specs = [
        ("16:9", (1920, 1080)),
        ("9:16", (1080, 1920)),
        ("4:5", (1080, 1350)),
        ("1:1", (1080, 1080)),
    ]
    sample_seg = {
        "start": 0.0,
        "end": 2.4,
        "text": "Captions fit cleanly inside every frame",
        "captionPlacement": "custom",
        "captionX": 26.0,
        "captionY": 78.0,
        "captionRect": {"x": 0.26, "y": 0.78, "w": 0.42, "h": 0.14},
        "words": [
            {"word": "Captions", "start": 0.0, "end": 0.45},
            {"word": "fit", "start": 0.45, "end": 0.8},
            {"word": "cleanly", "start": 0.8, "end": 1.3},
            {"word": "inside", "start": 1.3, "end": 1.85},
            {"word": "every", "start": 1.85, "end": 2.4},
        ],
    }

    for aspect, (fw, fh) in frame_specs:
        # Also exercise the bright pale backdrop contrast path
        frame = np.full((min(360, fh // 3), min(640, fw // 3), 3), (218, 222, 226), dtype=np.uint8)
        for style_name, style_def in CAPTION_STYLES.items():
            cues = _build_word_cues(
                [{**sample_seg}],
                style_name=style_name,
                style=style_def,
                resolve_story_treatment=resolve_story_caption_treatment,
                video_width=fw,
                video_height=fh,
                caption_scale=1.0,
                caption_position="smart_safe",
            )
            assert cues, f"Missing cue for {style_name} @ {aspect}"
            layout = _layout_cue_lines(cues[0], fw, fh, aa=2)
            x0, y0, rw, rh = layout["roi_x0"], layout["roi_y0"], layout["roi_w"], layout["roi_h"]
            x1, y1 = x0 + rw, y0 + rh
            assert x0 >= 0 and y0 >= 0 and x1 <= fw and y1 <= fh, f"OOB {style_name} @ {aspect}: {(x0, y0, x1, y1)}"
            assert min(x0, fw - x1) >= round(fw * 0.018), f"Tight X margin {style_name} @ {aspect}"
            assert min(y0, fh - y1) >= round(fh * 0.018), f"Tight Y margin {style_name} @ {aspect}"
            assert len(layout["lines"]) <= 3, f"Excess wrap {style_name} @ {aspect}: {len(layout['lines'])}"
            rendered = render_pro_caption_on_frame(frame, 0.9, cues)
            assert rendered.shape == frame.shape
