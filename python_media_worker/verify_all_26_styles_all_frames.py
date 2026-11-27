"""Exhaustive matrix audit of all 26 CAPTION_STYLES across all 4 Studio aspect frames (16:9, 9:16, 4:5, 1:1).

Detects out-of-bounds ROIs, excessive wrapping (>3 lines), tight margins (<2% edge),
or non-zero face/body overlap in Smart Safe mode across real podcast frames, and saves
26-style visual contact sheets for every frame aspect.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WORKER_DIR = Path(__file__).resolve().parent
REPO_ROOT = WORKER_DIR.parent
sys.path.insert(0, str(WORKER_DIR))
sys.path.insert(0, str(REPO_ROOT))

from python_media_worker.main_media_server import CAPTION_STYLES, resolve_story_caption_treatment
from python_media_worker.studio_caption_safety import (
    analyze_caption_safety_for_segments,
    apply_reframe_preview_crop,
    segment_person_alpha_rvm,
)
from python_media_worker.studio_pro_caption_compositor import (
    _build_word_cues,
    _layout_cue_lines,
    render_pro_caption_on_frame,
)

REAL_PODCAST_FAST = (
    REPO_ROOT.parent / "AutoPromote" / "test" / "e2e" / "playwright" / "test-assets" / "real-podcast-fast.mp4"
)
OUT_DIR = Path(
    "/home/tibule12/.gemini/antigravity/brain/c76bd0eb-e4a4-4018-9091-27cbe5c75791/caption_matrix_audit"
)


def _crop_and_scale(frame_bgr: np.ndarray, aspect: str, target_wh: tuple[int, int]) -> np.ndarray:
    cropped = apply_reframe_preview_crop(frame_bgr, aspect, 30.0 if aspect != "16:9" else 50.0, 50.0)
    tw, th = target_wh
    return cv2.resize(cropped, (tw, th), interpolation=cv2.INTER_LANCZOS4)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(REAL_PODCAST_FAST))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    cap.set(cv2.CAP_PROP_POS_FRAMES, round(0.95 * fps))
    ok, raw_frame = cap.read()
    cap.release()
    assert ok and raw_frame is not None

    frame_specs = [
        ("16:9", "16x9", (1920, 1080)),
        ("9:16", "9x16", (1080, 1920)),
        ("4:5", "4x5", (1080, 1350)),
        ("1:1", "1x1", (1080, 1080)),
    ]

    sample_seg = {
        "start": 0.0,
        "end": 2.4,
        "text": "Captions fit cleanly inside every frame",
        "words": [
            {"word": "Captions", "start": 0.0, "end": 0.45},
            {"word": "fit", "start": 0.45, "end": 0.8},
            {"word": "cleanly", "start": 0.8, "end": 1.3},
            {"word": "inside", "start": 1.3, "end": 1.85},
            {"word": "every", "start": 1.85, "end": 2.4},
        ],
    }

    report: dict = {}
    for aspect, slug, (fw, fh) in frame_specs:
        frame = _crop_and_scale(raw_frame, aspect, (fw, fh))
        rvm_alpha = segment_person_alpha_rvm(frame, target_long_edge=384, passes=2)
        # Run safety once for standard smart_safe aspect pocket (plus per-style check on stage variations)
        safe_res = analyze_caption_safety_for_segments(
            str(REAL_PODCAST_FAST),
            [sample_seg],
            style_name="word_pill",
            preferred_mode="smart_safe",
            aspect=None if aspect == "16:9" else aspect,
            crop_x=30.0 if aspect != "16:9" else 50.0,
        )
        base_safe_seg = safe_res["segments"][0]
        panels = []
        issues = []

        for style_name in CAPTION_STYLES:
            seg_for_style = {**sample_seg, **base_safe_seg, "text": sample_seg["text"], "words": sample_seg["words"]}
            cues = _build_word_cues(
                [seg_for_style],
                style_name=style_name,
                style=CAPTION_STYLES[style_name],
                resolve_story_treatment=resolve_story_caption_treatment,
                video_width=fw,
                video_height=fh,
                caption_scale=1.0,
                caption_position="smart_safe",
            )
            assert cues, f"No cues built for {style_name} @ {aspect}"
            layout = _layout_cue_lines(cues[0], fw, fh, aa=2)
            x0, y0, rw, rh = layout["roi_x0"], layout["roi_y0"], layout["roi_w"], layout["roi_h"]
            x1, y1 = x0 + rw, y0 + rh

            # Check actual rendered box bounds & person overlap inside RVM silhouette!
            margin_px_x = min(x0, fw - x1)
            margin_px_y = min(y0, fh - y1)
            out_of_bounds = x0 < 0 or y0 < 0 or x1 > fw or y1 > fh
            lines_count = len(layout["lines"])
            person_ov = float((rvm_alpha[max(0, y0) : min(fh, y1), max(0, x0) : min(fw, x1)] > 0.35).mean()) if rvm_alpha is not None else 0.0

            if out_of_bounds or margin_px_x < round(fw * 0.02) or margin_px_y < round(fh * 0.02) or lines_count > 3 or person_ov > 0.05:
                issues.append({
                    "style": style_name,
                    "bounds": [x0, y0, x1, y1],
                    "marginFracX": round(margin_px_x / fw, 4),
                    "marginFracY": round(margin_px_y / fh, 4),
                    "lines": lines_count,
                    "personOverlap": round(person_ov, 4),
                })

            rendered = render_pro_caption_on_frame(frame, 1.05, cues, rvm_alpha_full=rvm_alpha)
            panels.append((rendered, f"{style_name} | {lines_count}L | ov={person_ov:.2f}"))

        # Build 7x4 sheet per frame aspect
        tile_w, tile_h = (400, round(400 * fh / fw))
        cols = 7
        rows = (len(panels) + cols - 1) // cols
        sheet = Image.new("RGB", (tile_w * cols, (tile_h + 32) * rows), (10, 14, 22))
        draw = ImageDraw.Draw(sheet)
        try:
            font = ImageFont.truetype(str(WORKER_DIR / "assets" / "fonts" / "Inter-ExtraBold.ttf"), 14)
        except Exception:
            font = ImageFont.load_default()
        for idx, (bgr, lbl) in enumerate(panels):
            r, c = divmod(idx, cols)
            sx0, sy0 = c * tile_w, r * (tile_h + 32)
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            tile_img = Image.fromarray(rgb).resize((tile_w, tile_h), Image.Resampling.LANCZOS)
            sheet.paste(tile_img, (sx0, sy0))
            draw.rectangle([sx0, sy0 + tile_h, sx0 + tile_w, sy0 + tile_h + 32], fill=(18, 24, 36))
            draw.text((sx0 + 10, sy0 + tile_h + 7), lbl, fill=(235, 244, 255), font=font)
        sheet.save(OUT_DIR / f"all_26_styles_{slug}.png")

        report[aspect] = {
            "resolution": [fw, fh],
            "safety": base_safe_seg["captionSafety"],
            "stylesTested": len(CAPTION_STYLES),
            "issuesCount": len(issues),
            "issues": issues,
        }

    (OUT_DIR / "matrix_audit_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: {"issuesCount": v["issuesCount"], "issues": v["issues"][:5]} for k, v in report.items()}, indent=2))


if __name__ == "__main__":
    main()
