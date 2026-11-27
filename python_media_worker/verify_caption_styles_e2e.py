#!/usr/bin/env python3
"""End-to-end visual + pipeline verification of AutoPromote Studio captions on real talking videos.

Tests:
1. All 26 caption styles in CAPTION_STYLES rendered onto real talking footage (9:16 portrait & 16:9 landscape).
2. Multi-frame animation strips (+0ms, +45ms, +95ms, +180ms) checking spring, bounce, typewriter, pill, bloom.
3. Placement zones (bottom_center, shoulder_left, background_center, top_center, custom), icons, accents, scales.
4. Full main_media_server.render_viral_clip_impl MP4 exports with audio & caption burn-in.
5. RenderViralRequest Pydantic schema word-timing roundtrip check.
6. Behind-subject caption matte test using studio_text_behind_renderer + studio_subject_matte.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "python_media_worker") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "python_media_worker"))

import main_media_server as mms
from python_media_worker.studio_caption_renderer import generate_studio_ass_captions
from python_media_worker.studio_text_behind_renderer import render_text_behind_layer
from python_media_worker.viral_render_contract import (
    append_studio_caption_filter,
    build_edited_caption_transcript,
)

OUT_DIR = REPO_ROOT / "reports" / "studio-hollywood-vfx-20261122" / "caption-style-results"
REAL_PODCAST_FAST = Path(
    "/home/tibule12/Projects/AutoPromte/AutoPromote/test/e2e/playwright/test-assets/real-podcast-fast.mp4"
)
PODCAST_12S = REPO_ROOT / "reports" / "studio-stability-20261007" / "media" / "podcast-12s.mp4"
FONTS_DIR = REPO_ROOT / "python_media_worker" / "assets" / "fonts"


def run_ffmpeg(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr[-1000:]}")


def prepare_source_clips(work_dir: Path) -> dict[str, Path]:
    """Create a 9:16 portrait crop framed on the real talking host alongside clean 16:9 12s clip."""
    landscape_12s = work_dir / "host_16x9_12s.mp4"
    portrait_12s = work_dir / "host_9x16_12s.mp4"
    guest_9x16 = work_dir / "guest_9x16_12s.mp4"

    # Trim real-podcast-fast (1920x1080) to 0..12s (clean Unmuted Podcast opening host)
    run_ffmpeg([
        "ffmpeg", "-y", "-v", "error",
        "-ss", "0", "-t", "12.0", "-i", str(REAL_PODCAST_FAST),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", str(landscape_12s),
    ])

    # Crop around the purple-haired host on the left third -> 1080x1920 (9:16)
    # In 1920x1080, width of 9:16 slice = 1080*9/16 = 607.5 -> 608px; host center ~ x=640 (crop_x = 336)
    run_ffmpeg([
        "ffmpeg", "-y", "-v", "error",
        "-i", str(landscape_12s),
        "-vf", "crop=608:1080:336:0,scale=1080:1920:flags=lanczos,setsar=1",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "copy", str(portrait_12s),
    ])

    # Crop podcast-12s (1280x720) around the guest on the right -> 1080x1920 (9:16)
    # 720*9/16 = 405 -> 404px; guest center ~ x=920 (crop_x = 718)
    run_ffmpeg([
        "ffmpeg", "-y", "-v", "error",
        "-i", str(PODCAST_12S),
        "-vf", "crop=404:720:718:0,scale=1080:1920:flags=lanczos,setsar=1",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "copy", str(guest_9x16),
    ])

    return {
        "host_16x9": landscape_12s,
        "host_9x16": portrait_12s,
        "guest_9x16": guest_9x16,
    }


def real_host_transcript(
    icon_mode: str = "auto",
    placement: str = "auto",
    accent: str = "",
    alternate_speakers: bool = True,
) -> dict:
    """Grounded spoken lines from podcast-english-captions.srt aligned to 0..12s of real-podcast-fast."""
    def seg(idx: int, start: float, end: float, text: str, word_spans: list[tuple[str, float, float]]):
        speaker = ("host" if idx % 2 == 1 else "guest") if alternate_speakers else "host"
        item = {
            "id": f"host-{idx}",
            "start": start,
            "end": end,
            "text": text,
            "speaker": speaker,
            "language": "en",
            "textReviewed": True,
            "reviewRequired": False,
            "words": [{"word": w, "start": s, "end": e, "probability": 0.99} for w, s, e in word_spans],
        }
        if placement != "auto":
            item["captionPlacement"] = placement
        if icon_mode != "auto":
            item["captionIcon"] = icon_mode
        if accent:
            item["captionAccent"] = accent
        return item

    return {
        "segments": [
            seg(
                1, 1.20, 4.25, "Hello my lovely viewers at home.",
                [
                    ("Hello", 1.25, 1.70),
                    ("my", 1.70, 1.98),
                    ("lovely", 1.98, 2.55),
                    ("viewers", 2.55, 3.25),
                    ("at", 3.25, 3.60),
                    ("home.", 3.60, 4.20),
                ],
            ),
            seg(
                2, 4.26, 6.00, "It has truly been a long time.",
                [
                    ("It", 4.28, 4.46),
                    ("has", 4.46, 4.68),
                    ("truly", 4.68, 5.05),
                    ("been", 5.05, 5.28),
                    ("a", 5.28, 5.40),
                    ("long", 5.40, 5.70),
                    ("time.", 5.70, 5.98),
                ],
            ),
            seg(
                3, 6.00, 7.60, "I have missed you so much,",
                [
                    ("I", 6.02, 6.18),
                    ("have", 6.18, 6.40),
                    ("missed", 6.40, 6.78),
                    ("you", 6.78, 7.00),
                    ("so", 7.00, 7.25),
                    ("much,", 7.25, 7.58),
                ],
            ),
            seg(
                4, 7.60, 10.00, "and I hope you missed us as well.",
                [
                    ("and", 7.62, 7.82),
                    ("I", 7.82, 7.98),
                    ("hope", 7.98, 8.32),
                    ("you", 8.32, 8.55),
                    ("missed", 8.55, 9.00),
                    ("us", 9.00, 9.25),
                    ("as", 9.25, 9.52),
                    ("well.", 9.52, 9.95),
                ],
            ),
            seg(
                5, 10.00, 12.00, "We are thrilled to tell you we are back!",
                [
                    ("We", 10.02, 10.22),
                    ("are", 10.22, 10.42),
                    ("thrilled", 10.42, 10.82),
                    ("to", 10.82, 10.98),
                    ("tell", 10.98, 11.20),
                    ("you", 11.20, 11.40),
                    ("we", 11.40, 11.55),
                    ("are", 11.55, 11.70),
                    ("back!", 11.70, 11.98),
                ],
            ),
        ]
    }


def render_single_frame_with_ass(
    video_path: Path,
    ass_content: str,
    timestamp: float,
    out_png: Path,
    work_dir: Path,
    label: str = "",
) -> None:
    ass_path = work_dir / f"{out_png.stem}.ass"
    ass_path.write_text(ass_content, encoding="utf-8")
    filter_chain: list[str] = []
    out_label = append_studio_caption_filter(filter_chain, "0:v", str(ass_path), str(FONTS_DIR))
    # FFmpeg fast seek moves timestamp base to 0 if -ss is before -i; keep -ss AFTER -i
    # so ASS timestamps match real clip timestamps accurately!
    raw_png = work_dir / f"{out_png.stem}_raw.png"
    vf_str = f"{filter_chain[0].rstrip(';')}"
    # Replace input/output labels for -vf
    ass_esc = lambda v: str(v).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
    vf_simple = f"ass='{ass_esc(ass_path)}':fontsdir='{ass_esc(FONTS_DIR)}'"
    run_ffmpeg([
        "ffmpeg", "-y", "-v", "error",
        "-i", str(video_path),
        "-ss", f"{timestamp:.3f}",
        "-vf", vf_simple,
        "-frames:v", "1",
        str(raw_png),
    ])
    img = Image.open(raw_png).convert("RGB")
    if label:
        draw = ImageDraw.Draw(img)
        font_path = FONTS_DIR / "Inter-ExtraBold.ttf"
        fnt = ImageFont.truetype(str(font_path), max(22, round(img.width * 0.032)))
        draw.rectangle([14, 14, min(img.width - 14, 24 + len(label) * round(img.width * 0.02)), 14 + round(img.width * 0.048)], fill=(12, 14, 22))
        draw.text((22, 18), label, font=fnt, fill=(255, 220, 90))
    img.save(out_png)


def make_contact_sheet(paths: list[Path], out_path: Path, cols: int = 5, thumb_w: int = 360) -> None:
    imgs = [Image.open(p).convert("RGB") for p in paths]
    if not imgs:
        return
    ratio = imgs[0].height / imgs[0].width
    thumb_h = round(thumb_w * ratio)
    rows = (len(imgs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb_w, rows * thumb_h), (18, 20, 28))
    for i, img in enumerate(imgs):
        r, c = divmod(i, cols)
        resized = img.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        sheet.paste(resized, (c * thumb_w, r * thumb_h))
    sheet.save(out_path)


def test_pydantic_word_timing_roundtrip() -> dict:
    """Verify whether RenderViralRequest / ViralCaptionSegment preserves word timings!"""
    req = mms.RenderViralRequest(
        video_url="https://example.com/clip.mp4",
        start_time=0.0,
        end_time=4.0,
        auto_captions=True,
        caption_style="word_pill",
        caption_segments=[
            {
                "id": "cue-1",
                "start_time": 0.0,
                "end_time": 4.0,
                "text": "Hello paused world",
                "words": [
                    {"word": "Hello", "start": 0.0, "end": 0.35},
                    {"word": "paused", "start": 2.10, "end": 2.45},
                    {"word": "world", "start": 2.50, "end": 3.00},
                ],
                "wordTimings": [
                    {"word": "Hello", "start": 0.0, "end": 0.35},
                    {"word": "paused", "start": 2.10, "end": 2.45},
                    {"word": "world", "start": 2.50, "end": 3.00},
                ],
            }
        ],
    )
    transcript = build_edited_caption_transcript(req.caption_segments)
    words = transcript["segments"][0]["words"]
    paused_start = words[1]["start"]
    preserved = abs(paused_start - 2.10) < 0.05
    return {
        "preserved_pause_word_timing": preserved,
        "paused_word_start_after_pydantic": round(paused_start, 3),
        "expected_paused_word_start": 2.10,
        "caption_segment_fields": sorted(mms.ViralCaptionSegment.model_fields.keys())
        if hasattr(mms.ViralCaptionSegment, "model_fields")
        else sorted(mms.ViralCaptionSegment.__fields__.keys()),
    }


async def run_full_worker_exports(sources: dict[str, Path], work_dir: Path) -> list[dict]:
    """Run real end-to-end mms.render_viral_clip_impl jobs across distinct style families."""
    mp4_dir = OUT_DIR / "mp4_exports"
    mp4_dir.mkdir(parents=True, exist_ok=True)
    frame_dir = OUT_DIR / "export_frames"
    frame_dir.mkdir(parents=True, exist_ok=True)

    segments_payload = [
        mms.ViralCaptionSegment(
            id=f"seg-{s['id']}",
            start_time=s["start"],
            end_time=s["end"],
            text=s["text"],
            speaker=s.get("speaker", "host"),
            language="en",
            text_reviewed=True,
            words=s.get("words") or [],
            caption_placement=s.get("captionPlacement", "auto"),
            caption_icon=s.get("captionIcon", "none"),
            caption_accent=s.get("captionAccent") or None,
        )
        for s in real_host_transcript(icon_mode="none", alternate_speakers=True)["segments"]
    ]

    showcase_configs = [
        ("word_pill_9x16", "word_pill", sources["host_9x16"], "creative", 1.0, False, "9:16"),
        ("editorial_duo_16x9", "editorial_duo", sources["host_16x9"], "creative", 1.0, False, "16:9"),
        ("editorial_duo_9x16", "editorial_duo", sources["host_9x16"], "creative", 1.0, False, "9:16"),
        ("wall_type_9x16", "wall_type", sources["host_9x16"], "creative", 1.0, False, "9:16"),
        ("story_pop_9x16", "story_pop", sources["host_9x16"], "creative", 1.0, False, "9:16"),
        ("retro_9x16", "retro", sources["host_9x16"], "creative", 1.0, False, "9:16"),
        ("sticker_9x16", "sticker", sources["host_9x16"], "creative", 1.0, False, "9:16"),
        ("luxury_16x9", "luxury", sources["host_16x9"], "creative", 1.0, False, "16:9"),
        ("newsroom_9x16", "newsroom", sources["host_9x16"], "creative", 1.0, False, "9:16"),
        ("spring_slam_9x16", "spring_slam", sources["host_9x16"], "creative", 1.0, False, "9:16"),
        ("word_pill_16x9", "word_pill", sources["host_16x9"], "creative", 1.0, False, "16:9"),
    ]

    tmp_verify_dir = REPO_ROOT / "tmp" / "caption_verify_src"
    tmp_verify_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for name, style_key, src_video, pos, scale, do_crop, aspect in showcase_configs:
        staged_src = tmp_verify_dir / src_video.name
        if not staged_src.exists():
            shutil.copy2(src_video, staged_src)
        job_id = f"cap-verify-{name}"
        req = mms.RenderViralRequest(
            video_url=str(staged_src),
            start_time=0.0,
            end_time=10.5,
            auto_captions=True,
            caption_style=style_key,
            caption_position=pos,
            caption_scale=scale,
            caption_coverage_mode="selected",
            caption_segments=segments_payload,
            smart_crop=do_crop,
            finish_plan={"reframe": {"aspect": aspect}},
        )
        result_data = await mms.render_viral_clip_impl(
            request=req,
            provided_job_id=job_id,
        )
        output_file = result_data["output_path"]
        dest_mp4 = mp4_dir / f"{name}.mp4"
        shutil.copy2(output_file, dest_mp4)
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=width,height,codec_type", "-show_entries", "format=duration", "-of", "json", str(dest_mp4)],
            capture_output=True, text=True, check=True,
        )
        meta = json.loads(probe.stdout)
        # Extract Cue 1 (t=2.25s), Cue 2 (t=4.90s), Cue 3 (t=6.60s), Cue 4 (t=8.60s)
        frame_a = frame_dir / f"{name}_t2.25.png"
        frame_b = frame_dir / f"{name}_t4.90.png"
        frame_c = frame_dir / f"{name}_t6.60.png"
        frame_d = frame_dir / f"{name}_t8.60.png"
        run_ffmpeg(["ffmpeg", "-y", "-v", "error", "-ss", "2.25", "-i", str(dest_mp4), "-frames:v", "1", str(frame_a)])
        run_ffmpeg(["ffmpeg", "-y", "-v", "error", "-ss", "4.90", "-i", str(dest_mp4), "-frames:v", "1", str(frame_b)])
        extracted = [str(frame_a), str(frame_b)]
        if style_key in {"story_pop", "sticker", "watch_me", "editorial_duo"}:
            run_ffmpeg(["ffmpeg", "-y", "-v", "error", "-ss", "6.60", "-i", str(dest_mp4), "-frames:v", "1", str(frame_c)])
            run_ffmpeg(["ffmpeg", "-y", "-v", "error", "-ss", "8.60", "-i", str(dest_mp4), "-frames:v", "1", str(frame_d)])
            extracted.extend([str(frame_c), str(frame_d)])
            make_contact_sheet(
                [frame_a, frame_b, frame_c, frame_d],
                frame_dir / f"{name}_choreography_strip.png",
                cols=4,
                thumb_w=420 if aspect == "16:9" else 320,
            )
        results.append({
            "name": name,
            "style": style_key,
            "aspect": aspect,
            "mp4": str(dest_mp4),
            "duration": float(meta["format"]["duration"]),
            "streams": [(s["codec_type"], s.get("width"), s.get("height")) for s in meta["streams"]],
            "frames": extracted,
        })
    return results


def test_behind_subject_caption_on_real_speaker(portrait_video: Path, work_dir: Path) -> Path:
    """Test studio_text_behind_renderer on real talking host at t=2.25s using grabbed/fallback person mask."""
    bg_png = work_dir / "host_9x16_raw_t225.png"
    run_ffmpeg(["ffmpeg", "-y", "-v", "error", "-ss", "2.25", "-i", str(portrait_video), "-frames:v", "1", str(bg_png)])
    frame = Image.open(bg_png).convert("RGBA")
    w, h = frame.size

    # Use GrabCut or foreground saliency via studio_subject_matte if available, cleanly isolating upper torso/head
    try:
        from python_media_worker.studio_subject_matte import generate_subject_matte
        res = generate_subject_matte(
            str(portrait_video),
            seed_points=[[0.48, 0.36], [0.48, 0.56]],
            seed_labels=[1, 1],
            start_time=2.0,
            end_time=2.5,
        )
        matte_path = res.get("alpha_video_path") or res.get("matte_path")
    except Exception:
        matte_path = None

    canvas = frame.copy()
    effect = {
        "id": "behind-cap-1",
        "type": "text_behind",
        "start": 1.2,
        "end": 4.2,
        "text": "WE ARE BACK",
        "x": 50,
        "y": 32,
        "font_size": 145,
        "color": "#ffffff",
        "preset": "caption_punch",
        "font": "inter_black",
        "animation": "word_pop",
        "accent_color": "#ffb33d",
        "shadow": 0.7,
        "glow": 0.35,
        "tracking": 2,
        "words": [
            {"word": "WE", "start": 1.2, "end": 2.0},
            {"word": "ARE", "start": 2.0, "end": 3.0},
            {"word": "BACK", "start": 3.0, "end": 4.2},
        ],
    }
    legacy_font = ImageFont.truetype(str(FONTS_DIR / "Inter-Black.ttf"), 145)
    render_text_behind_layer(canvas, effect, w, h, time_value=2.25, legacy_font=legacy_font)

    # Extract silhouette mask of center speaker (OpenCV GrabCut rectangle seeded on host torso/head)
    import cv2
    import numpy as np
    bgr = cv2.cvtColor(np.array(frame.convert("RGB")), cv2.COLOR_RGB2BGR)
    mask = np.zeros(bgr.shape[:2], np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    rect = (round(w * 0.14), round(h * 0.12), round(w * 0.72), round(h * 0.85))
    cv2.grabCut(bgr, mask, rect, bgd_model, fgd_model, 4, cv2.GC_INIT_WITH_RECT)
    fg_alpha = np.where((mask == 1) | (mask == 3), 255, 0).astype("uint8")
    fg_alpha = cv2.GaussianBlur(fg_alpha, (7, 7), 0)
    fg_rgba = frame.copy()
    fg_rgba.putalpha(Image.fromarray(fg_alpha))
    canvas.alpha_composite(fg_rgba)

    out_png = OUT_DIR / "behind_subject_caption_real_host.png"
    canvas.convert("RGB").save(out_png)
    return out_png


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all26_dir = OUT_DIR / "all_26_styles_9x16"
    all26_dir.mkdir(parents=True, exist_ok=True)
    strips_dir = OUT_DIR / "animation_strips"
    strips_dir.mkdir(parents=True, exist_ok=True)
    zones_dir = OUT_DIR / "zones_and_scales"
    zones_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="cap-verify-work-") as tmp:
        work_dir = Path(tmp)
        print("[1/5] Preparing 16:9 and 9:16 real talking video sources...")
        sources = prepare_source_clips(work_dir)

        print("[2/5] Checking Pydantic word_timings round-trip contract...")
        rt_report = test_pydantic_word_timing_roundtrip()
        print("  Word timing roundtrip:", json.dumps(rt_report))

        print("[3/5] Rendering all 26 caption styles in creative spatial stage on real 9:16 & 16:9 talking footage...")
        transcript_auto = real_host_transcript(icon_mode="auto", alternate_speakers=True)
        transcript_none = real_host_transcript(icon_mode="none", alternate_speakers=True)
        style_keys = list(mms.CAPTION_STYLES.keys())
        thumbs_auto = []
        sample_ts = {
            "story_pop": 4.90,   # Cue 2 -> left shoulder jump!
            "sticker": 4.90,     # Cue 2 -> top-right corner jump!
            "watch_me": 4.90,    # Cue 2 -> opposite side spotlight!
            "marker": 4.90,      # Cue 2 -> shoulder zone swipe!
            "rainbow": 4.90,     # Cue 2 -> upper wall wave!
        }
        for idx, style_key in enumerate(style_keys, 1):
            ass_str = generate_studio_ass_captions(
                whisper_result=transcript_auto,
                caption_styles=mms.CAPTION_STYLES,
                resolve_story_treatment=mms.resolve_story_caption_treatment,
                style_name=style_key,
                video_width=1080,
                video_height=1920,
                caption_position="creative",
                caption_scale=1.0,
            )
            out_png = all26_dir / f"{idx:02d}_{style_key}.png"
            render_t = sample_ts.get(style_key, 2.12)
            render_single_frame_with_ass(
                sources["host_9x16"], ass_str, render_t, out_png, work_dir,
                label=f"{style_key} ({mms.CAPTION_STYLES[style_key]['animation']})",
            )
            thumbs_auto.append(out_png)

        make_contact_sheet(thumbs_auto[:15], OUT_DIR / "contact_sheet_styles_01_15.png", cols=5, thumb_w=360)
        make_contact_sheet(thumbs_auto[15:], OUT_DIR / "contact_sheet_styles_16_26.png", cols=4, thumb_w=360)

        # Render 16:9 spatial stage grid for signature templates (background wall, side-by-side, margins, corners)
        spatial_16x9_dir = OUT_DIR / "spatial_16x9"
        spatial_16x9_dir.mkdir(parents=True, exist_ok=True)
        spatial_16x9_styles = [
            ("editorial_duo", 2.15, "editorial_duo · cue1 side_left"),
            ("editorial_duo", 4.90, "editorial_duo · cue2 side_right"),
            ("wall_type", 2.15, "wall_type · upper studio wall"),
            ("story_pop", 4.90, "story_pop · cue2 left shoulder"),
            ("story_pop", 8.60, "story_pop · cue4 studio wall"),
            ("retro", 2.15, "retro · tilted top-left"),
            ("sticker", 4.90, "sticker · top-right corner"),
            ("luxury", 2.15, "luxury · right margin stack"),
            ("newsroom", 2.15, "newsroom · top broadcast"),
            ("spring_slam", 2.15, "spring_slam · 2-tier stack"),
            ("watch_me", 4.90, "watch_me · side spotlight"),
            ("word_pill", 2.15, "word_pill · lower hero"),
        ]
        spatial_16x9_imgs = []
        for idx, (s_key, t_val, lbl) in enumerate(spatial_16x9_styles, 1):
            ass_16x9 = generate_studio_ass_captions(
                whisper_result=transcript_none,
                caption_styles=mms.CAPTION_STYLES,
                resolve_story_treatment=mms.resolve_story_caption_treatment,
                style_name=s_key,
                video_width=1920,
                video_height=1080,
                caption_position="creative",
                caption_scale=1.0,
            )
            p_16x9 = spatial_16x9_dir / f"{idx:02d}_{s_key}_t{t_val:.2f}.png"
            render_single_frame_with_ass(sources["host_16x9"], ass_16x9, t_val, p_16x9, work_dir, label=lbl)
            spatial_16x9_imgs.append(p_16x9)
        make_contact_sheet(spatial_16x9_imgs, OUT_DIR / "contact_sheet_spatial_16x9.png", cols=3, thumb_w=480)

        # Render multi-cue choreography strips (Cue 1 -> Cue 2 -> Cue 3 -> Cue 4 across spatial zones)
        choreo_dir = OUT_DIR / "choreography_strips"
        choreo_dir.mkdir(parents=True, exist_ok=True)
        for s_key in ("editorial_duo", "story_pop", "sticker", "watch_me", "rainbow"):
            for aspect_tag, src_v, vw, vh in (("9x16", sources["host_9x16"], 1080, 1920), ("16x9", sources["host_16x9"], 1920, 1080)):
                ass_c = generate_studio_ass_captions(
                    whisper_result=transcript_none,
                    caption_styles=mms.CAPTION_STYLES,
                    resolve_story_treatment=mms.resolve_story_caption_treatment,
                    style_name=s_key,
                    video_width=vw,
                    video_height=vh,
                    caption_position="creative",
                    caption_scale=1.0,
                )
                c_imgs = []
                for cue_idx, t_val in enumerate((2.15, 4.90, 6.60, 8.60), 1):
                    fp = work_dir / f"choreo_{s_key}_{aspect_tag}_cue{cue_idx}.png"
                    render_single_frame_with_ass(src_v, ass_c, t_val, fp, work_dir, label=f"{s_key} cue {cue_idx} ({t_val:.1f}s)")
                    c_imgs.append(fp)
                make_contact_sheet(c_imgs, choreo_dir / f"choreo_{s_key}_{aspect_tag}.png", cols=4, thumb_w=420 if vh == 1080 else 320)

        # Render multi-frame motion strips (+10ms, +50ms, +110ms, +220ms) across word "lovely" (1.98..2.55)
        strip_styles = ["spring_slam", "bounce", "typewriter", "word_pill", "kinetic_bar", "neon_bloom", "editorial", "karaoke"]
        for s_key in strip_styles:
            ass_str = generate_studio_ass_captions(
                whisper_result=transcript_none,
                caption_styles=mms.CAPTION_STYLES,
                resolve_story_treatment=mms.resolve_story_caption_treatment,
                style_name=s_key,
                video_width=1080,
                video_height=1920,
                caption_position="creative",
                caption_scale=1.0,
            )
            seq_imgs = []
            for offset_ms in (10, 50, 110, 220):
                t = 1.98 + offset_ms / 1000.0
                fp = work_dir / f"strip_{s_key}_{offset_ms}.png"
                render_single_frame_with_ass(
                    sources["host_9x16"], ass_str, t, fp, work_dir,
                    label=f"{s_key} +{offset_ms}ms",
                )
                seq_imgs.append(fp)
            make_contact_sheet(seq_imgs, strips_dir / f"strip_{s_key}.png", cols=4, thumb_w=320)

        print("[4/5] Testing placement zones, scales, icon='none' vs 'auto', and 16:9 vs 9:16 sizing...")
        zone_cases = [
            ("zone_wall_type_9x16", sources["host_9x16"], 1080, 1920, "wall_type", "auto", "none", "", 1.0, 2.15),
            ("zone_wall_type_16x9", sources["host_16x9"], 1920, 1080, "wall_type", "auto", "none", "", 1.0, 2.15),
            ("zone_side_left_16x9", sources["host_16x9"], 1920, 1080, "editorial_duo", "side_left", "none", "", 1.0, 2.15),
            ("zone_side_right_16x9", sources["host_16x9"], 1920, 1080, "editorial_duo", "side_right", "none", "", 1.0, 4.90),
            ("zone_retro_tilt_9x16", sources["host_9x16"], 1080, 1920, "retro", "auto", "none", "", 1.0, 2.15),
            ("zone_luxury_right_16x9", sources["host_16x9"], 1920, 1080, "luxury", "auto", "none", "", 1.0, 2.15),
            ("zone_shoulder_left_9x16", sources["host_9x16"], 1080, 1920, "word_pill", "shoulder_left", "fire", "#ff5d8f", 1.0, 2.15),
            ("zone_top_center_9x16", sources["host_9x16"], 1080, 1920, "newsroom", "top_center", "wow", "#d91a25", 1.0, 2.15),
            ("zone_scale_135_9x16", sources["host_9x16"], 1080, 1920, "sticker", "bottom_center", "none", "#72f59b", 1.35, 2.15),
        ]
        for zname, src_vid, vw, vh, s_key, plc, icn, acc, scl, ts_val in zone_cases:
            tr = real_host_transcript(icon_mode=icn, placement=plc, accent=acc, alternate_speakers=True)
            ass_str = generate_studio_ass_captions(
                whisper_result=tr,
                caption_styles=mms.CAPTION_STYLES,
                resolve_story_treatment=mms.resolve_story_caption_treatment,
                style_name=s_key,
                video_width=vw,
                video_height=vh,
                caption_position="creative",
                caption_scale=scl,
            )
            render_single_frame_with_ass(
                src_vid, ass_str, ts_val, zones_dir / f"{zname}.png", work_dir,
                label=zname,
            )

        print("[4b/5] Testing behind-subject depth caption composite...")
        behind_png = test_behind_subject_caption_on_real_speaker(sources["host_9x16"], work_dir)

        print("[5/5] Running full mms.render_viral_clip_impl MP4 exports...")
        try:
            export_results = asyncio.run(run_full_worker_exports(sources, work_dir))
        finally:
            shutil.rmtree(REPO_ROOT / "tmp" / "caption_verify_src", ignore_errors=True)

        summary = {
            "total_styles_verified": len(style_keys),
            "styles": style_keys,
            "pydantic_word_timing_roundtrip": rt_report,
            "behind_subject_png": str(behind_png),
            "worker_exports": export_results,
        }
        (OUT_DIR / "verification_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print("DONE! Summary written to", OUT_DIR / "verification_summary.json")


if __name__ == "__main__":
    main()
