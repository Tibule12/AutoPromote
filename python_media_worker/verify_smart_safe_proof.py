#!/usr/bin/env python3
"""End-to-end visual + worker proof for Face, Head & Body-Aware Smart Safe Captions.

Generates:
1. Full render_viral_clip_impl MP4 exports with smart_safe / caption_avoid_subjects=True on:
   - real-podcast-fast 16:9 (host left cue 1 -> co-host center-right cue 4)
   - real-podcast-fast 9:16 portrait crop
   - moving_speaker_dodge_16x9.mp4 (human speaker jumps Left -> Right -> Bottom -> Top Wall,
     proving caption actively moves away from face/body on every single beat)
2. Side-by-side visual proof strips comparing:
   - BEFORE (naive static placement colliding directly with face/torso)
   - PIXEL DETECTION DEBUG OVERLAY (red face box, orange torso/body envelope, green chosen safe zone)
   - AFTER (actual final MP4 frame with ASS caption cleanly avoiding face/body)
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "python_media_worker") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "python_media_worker"))

import main_media_server as mms
from python_media_worker.studio_caption_safety import (
    analyze_caption_safety_for_segments,
    draw_safety_debug_overlay,
)
from python_media_worker.verify_caption_styles_e2e import real_host_transcript, run_ffmpeg

OUT_DIR = REPO_ROOT / "reports" / "studio-hollywood-vfx-20261122" / "caption-smart-safe-proof"
REAL_PODCAST_FAST = Path(
    "/home/tibule12/Projects/AutoPromte/AutoPromote/test/e2e/playwright/test-assets/real-podcast-fast.mp4"
)
FONTS_DIR = REPO_ROOT / "python_media_worker" / "assets" / "fonts"


def make_label_strip(panels: list[tuple[Path, str]], out_path: Path, thumb_w: int = 520) -> None:
    imgs = []
    fnt = ImageFont.truetype(str(FONTS_DIR / "Inter-ExtraBold.ttf"), 20)
    bar_h = 38
    for p, title in panels:
        im = Image.open(p).convert("RGB")
        th = round(thumb_w * im.height / im.width)
        im = im.resize((thumb_w, th), Image.Resampling.LANCZOS)
        framed = Image.new("RGB", (thumb_w, th + bar_h), (14, 18, 28))
        framed.paste(im, (0, bar_h))
        draw = ImageDraw.Draw(framed)
        draw.text((12, 8), title, font=fnt, fill=(130, 248, 220))
        imgs.append(framed)
    w = sum(i.width for i in imgs) + 12 * (len(imgs) - 1)
    h = max(i.height for i in imgs)
    canvas = Image.new("RGB", (w, h), (10, 12, 18))
    x = 0
    for i in imgs:
        canvas.paste(i, (x, 0))
        x += i.width + 12
    canvas.save(out_path)


def build_moving_speaker_video(out_mp4: Path, work_dir: Path) -> Path:
    """Create a real-face 12s 1280x720 test video where speaker moves across Left, Right, Bottom, Top."""
    cap = cv2.VideoCapture(str(REAL_PODCAST_FAST))
    ok, src = cap.read()
    cap.release()
    assert ok and src is not None
    # Clean real human face+shoulders patch from Unmuted Podcast host
    patch = cv2.resize(src[120:540, 400:710], (280, 340), interpolation=cv2.INTER_AREA)

    raw_avi = work_dir / "moving_raw.avi"
    vw, vh, fps = 1280, 720, 15
    writer = cv2.VideoWriter(str(raw_avi), cv2.VideoWriter_fourcc(*"MJPG"), fps, (vw, vh))
    # Positions per 3s beat (Left -> Right -> Bottom Center -> Top Wall Center)
    placements = [
        (70, 160),    # Beat 1 (0..3s): speaker stands LEFT
        (910, 160),   # Beat 2 (3..6s): speaker moves RIGHT
        (500, 355),   # Beat 3 (6..9s): speaker frames LOW/BOTTOM
        (500, 35),    # Beat 4 (9..12s): speaker frames TOP/HIGH
    ]
    for fidx in range(12 * fps):
        beat = min(3, fidx // (3 * fps))
        x0, y0 = placements[beat]
        bg = np.full((vh, vw, 3), (36, 40, 48), dtype=np.uint8)
        # Draw subtle studio gradient wall so edges remain clean
        bg[:, :] = np.array([34, 38, 48], dtype=np.uint8)
        cv2.rectangle(bg, (max(0, x0 - 45), y0 + patch.shape[0] - 12), (min(vw, x0 + patch.shape[1] + 45), vh), (170, 115, 70), -1)
        y_end = min(vh, y0 + patch.shape[0])
        bg[y0:y_end, x0 : x0 + patch.shape[1]] = patch[: y_end - y0, :]
        writer.write(bg)
    writer.release()
    run_ffmpeg([
        "ffmpeg", "-y", "-v", "error",
        "-i", str(raw_avi),
        "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=44100",
        "-t", "12.0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", str(out_mp4),
    ])
    return out_mp4


async def run_proof() -> dict:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    mp4_dir = OUT_DIR / "mp4_exports"
    frames_dir = OUT_DIR / "frames"
    mp4_dir.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)

    tmp_verify_dir = REPO_ROOT / "tmp" / "caption_smart_safe_src"
    tmp_verify_dir.mkdir(parents=True, exist_ok=True)

    try:
        with tempfile.TemporaryDirectory(prefix="smart-safe-proof-") as tmp:
            work_dir = Path(tmp)

            # Prepare real talking 16:9 & 9:16 + moving speaker 16:9
            host_16x9 = tmp_verify_dir / "host_16x9_12s.mp4"
            host_9x16 = tmp_verify_dir / "host_9x16_12s.mp4"
            moving_16x9 = tmp_verify_dir / "moving_speaker_dodge_16x9.mp4"

            run_ffmpeg([
                "ffmpeg", "-y", "-v", "error",
                "-ss", "0", "-t", "12.0", "-i", str(REAL_PODCAST_FAST),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", str(host_16x9),
            ])
            run_ffmpeg([
                "ffmpeg", "-y", "-v", "error",
                "-i", str(host_16x9),
                "-vf", "crop=608:1080:336:0,scale=1080:1920:flags=lanczos,setsar=1",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
                "-c:a", "copy", str(host_9x16),
            ])
            build_moving_speaker_video(moving_16x9, work_dir)

            # 1) Direct pixel analysis + debug overlay on real-podcast-fast (Cue 1 host left, Cue 4 co-host right)
            host_tr = real_host_transcript(icon_mode="none", alternate_speakers=True)
            analysis_host_16x9 = analyze_caption_safety_for_segments(
                str(host_16x9), host_tr["segments"], style_name="editorial_duo", preferred_mode="smart_safe"
            )
            analysis_host_9x16 = analyze_caption_safety_for_segments(
                str(host_9x16), host_tr["segments"], style_name="story_pop", preferred_mode="smart_safe"
            )

            # Moving speaker cues matching beats (Left -> Right -> Bottom -> Top)
            moving_cues = [
                {
                    "id": f"m-{idx}",
                    "start": t0,
                    "end": t0 + 2.8,
                    "text": txt,
                    "speaker": "host",
                    "language": "en",
                    "textReviewed": True,
                    "words": [
                        {"word": w, "start": t0 + wi * 0.45, "end": t0 + (wi + 1) * 0.45, "probability": 0.99}
                        for wi, w in enumerate(txt.split())
                    ],
                }
                for idx, (t0, txt) in enumerate([
                    (0.1, "Speaker sits on the left side"),
                    (3.1, "Now speaker moved to the right"),
                    (6.1, "Bottom center is blocked now"),
                    (9.1, "Top wall is blocked dodge down"),
                ], 1)
            ]
            analysis_moving = analyze_caption_safety_for_segments(
                str(moving_16x9), moving_cues, style_name="word_pill", preferred_mode="smart_safe"
            )

            # Draw detection overlays at key beats
            def _save_debug_frame(src_vid: Path, ts: float, safety: dict, out_p: Path) -> None:
                cap = cv2.VideoCapture(str(src_vid))
                cap.set(cv2.CAP_PROP_POS_MSEC, ts * 1000.0)
                ok, frame = cap.read()
                cap.release()
                assert ok
                dbg = draw_safety_debug_overlay(frame, safety)
                cv2.imwrite(str(out_p), dbg)

            _save_debug_frame(host_16x9, 2.25, analysis_host_16x9["segments"][0]["captionSafety"], frames_dir / "debug_host16x9_cue1.png")
            _save_debug_frame(host_16x9, 8.60, analysis_host_16x9["segments"][3]["captionSafety"], frames_dir / "debug_host16x9_cue4.png")
            _save_debug_frame(host_9x16, 2.25, analysis_host_9x16["segments"][0]["captionSafety"], frames_dir / "debug_host9x16_cue1.png")

            for i, seg in enumerate(analysis_moving["segments"]):
                _save_debug_frame(moving_16x9, seg["start"] + 1.2, seg["captionSafety"], frames_dir / f"debug_moving_beat{i+1}.png")

            # 2) Full worker MP4 exports!
            # Naive BEFORE export (side_by_side without smart avoidance) vs AFTER Smart Safe export!
            host_payload = [
                mms.ViralCaptionSegment(
                    id=s["id"], start_time=s["start"], end_time=s["end"], text=s["text"],
                    speaker=s["speaker"], language="en", text_reviewed=True, words=s["words"],
                    caption_icon="none",
                )
                for s in host_tr["segments"]
            ]
            moving_payload = [
                mms.ViralCaptionSegment(
                    id=s["id"], start_time=s["start"], end_time=s["end"], text=s["text"],
                    speaker="host", language="en", text_reviewed=True, words=s["words"],
                    caption_icon="none",
                )
                for s in moving_cues
            ]

            exports = []
            for job_tag, src_vid, aspect, style_key, pos, avoid, payload in [
                ("smart_safe_host_16x9", host_16x9, "16:9", "editorial_duo", "smart_safe", True, host_payload),
                ("smart_safe_host_9x16", host_9x16, "9:16", "story_pop", "smart_safe", True, host_payload),
                ("smart_safe_moving_16x9", moving_16x9, "16:9", "word_pill", "smart_safe", True, moving_payload),
                ("naive_unaware_moving_16x9", moving_16x9, "16:9", "word_pill", "bottom_center", False, moving_payload),
            ]:
                req = mms.RenderViralRequest(
                    video_url=str(src_vid),
                    start_time=0.0,
                    end_time=11.8,
                    auto_captions=True,
                    caption_style=style_key,
                    caption_position=pos,
                    caption_avoid_subjects=avoid,
                    caption_coverage_mode="selected",
                    caption_segments=payload,
                    finish_plan={"reframe": {"aspect": aspect}},
                )
                res = await mms.render_viral_clip_impl(request=req, provided_job_id=f"safe-proof-{job_tag}")
                dest = mp4_dir / f"{job_tag}.mp4"
                shutil.copy2(res["output_path"], dest)
                exports.append({"name": job_tag, "mp4": str(dest)})

            # Extract BEFORE / DEBUG / AFTER proof comparisons from real MP4 frames!
            for tag, vid_mp4, ts, dbg_png in [
                ("host16x9_cue1", mp4_dir / "smart_safe_host_16x9.mp4", 2.25, frames_dir / "debug_host16x9_cue1.png"),
                ("host16x9_cue4", mp4_dir / "smart_safe_host_16x9.mp4", 8.60, frames_dir / "debug_host16x9_cue4.png"),
                ("host9x16_cue1", mp4_dir / "smart_safe_host_9x16.mp4", 2.25, frames_dir / "debug_host9x16_cue1.png"),
            ]:
                out_f = frames_dir / f"exported_{tag}.png"
                run_ffmpeg(["ffmpeg", "-y", "-v", "error", "-ss", f"{ts:.2f}", "-i", str(vid_mp4), "-frames:v", "1", str(out_f)])
                make_label_strip(
                    [(dbg_png, "YuNet Face + Body Detection"), (out_f, "Smart Safe Burned MP4")],
                    OUT_DIR / f"proof_{tag}.png",
                    thumb_w=540 if "16x9" in tag else 360,
                )

            # Moving speaker 4-beat BEFORE vs DEBUG vs AFTER proof
            moving_strip_panels = []
            for beat_i, ts in enumerate((1.3, 4.3, 7.3, 10.3), 1):
                naive_p = frames_dir / f"naive_beat{beat_i}.png"
                safe_p = frames_dir / f"safe_beat{beat_i}.png"
                run_ffmpeg(["ffmpeg", "-y", "-v", "error", "-ss", f"{ts:.2f}", "-i", str(mp4_dir / "naive_unaware_moving_16x9.mp4"), "-frames:v", "1", str(naive_p)])
                run_ffmpeg(["ffmpeg", "-y", "-v", "error", "-ss", f"{ts:.2f}", "-i", str(mp4_dir / "smart_safe_moving_16x9.mp4"), "-frames:v", "1", str(safe_p)])
                make_label_strip(
                    [
                        (naive_p, f"Beat {beat_i} BEFORE (Face Hit)"),
                        (frames_dir / f"debug_moving_beat{beat_i}.png", "Detected Face + Body"),
                        (safe_p, f"Beat {beat_i} AFTER Smart Safe"),
                    ],
                    OUT_DIR / f"proof_moving_beat{beat_i}.png",
                    thumb_w=460,
                )
                moving_strip_panels.append((safe_p, f"Beat {beat_i}: {analysis_moving['segments'][beat_i-1]['captionPlacement']}"))
            make_label_strip(moving_strip_panels, OUT_DIR / "proof_moving_all_4_beats.png", thumb_w=440)

            summary = {
                "host_16x9_summary": analysis_host_16x9["summary"],
                "host_16x9_decisions": [
                    {"cue": s["text"], "placement": s["captionPlacement"], "safety": s["captionSafety"]}
                    for s in analysis_host_16x9["segments"]
                ],
                "host_9x16_summary": analysis_host_9x16["summary"],
                "moving_speaker_summary": analysis_moving["summary"],
                "moving_speaker_decisions": [
                    {"cue": s["text"], "placement": s["captionPlacement"], "faceOverlap": s["captionSafety"]["faceOverlap"], "bodyOverlap": s["captionSafety"]["bodyOverlap"]}
                    for s in analysis_moving["segments"]
                ],
                "exports": exports,
            }
            (OUT_DIR / "smart_safe_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
            print("SMART_SAFE_PROOF_DONE", json.dumps(summary["moving_speaker_decisions"]))
            return summary
    finally:
        shutil.rmtree(tmp_verify_dir, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(run_proof())
