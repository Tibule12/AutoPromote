"""Generate real talking-video MP4 & PNG proof showcases for Pro RGBA captions + RVM Smart Safe."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WORKER_DIR = Path(__file__).resolve().parent
REPO_ROOT = WORKER_DIR.parent
sys.path.insert(0, str(WORKER_DIR))
sys.path.insert(0, str(REPO_ROOT))

from python_media_worker.main_media_server import (
    CAPTION_STYLES,
    build_viral_export_encode_args,
    resolve_story_caption_treatment,
    resolve_viral_export_profile,
)
from python_media_worker.studio_caption_safety import (
    analyze_caption_safety_for_segments,
    apply_reframe_preview_crop,
    draw_safety_debug_overlay,
    segment_person_alpha_rvm,
)
from python_media_worker.studio_pro_caption_compositor import (
    _build_word_cues,
    composite_pro_captions_on_video,
    render_pro_caption_on_frame,
)

REAL_PODCAST_FAST = (
    REPO_ROOT.parent / "AutoPromote" / "test" / "e2e" / "playwright" / "test-assets" / "real-podcast-fast.mp4"
)
PODCAST_12S = REPO_ROOT / "reports" / "studio-stability-20261007" / "media" / "podcast-12s.mp4"
PODCAST_CONV = REPO_ROOT / "frontend" / "public" / "landing" / "podcast-conversation.mp4"

OUT_DIR = Path(
    "/home/tibule12/.gemini/antigravity/brain/c76bd0eb-e4a4-4018-9091-27cbe5c75791/caption_showcase_v2"
)


def _trim_clip(src: Path, dst: Path, start: float, duration: float, scale_filter: str = "") -> None:
    cmd = ["ffmpeg", "-y", "-v", "error", "-ss", str(start), "-t", str(duration), "-i", str(src)]
    if scale_filter:
        cmd.extend(["-vf", scale_filter])
    cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-c:a", "aac", "-b:a", "160k", str(dst)])
    subprocess.run(cmd, check=True)


def _extract_frame(video_path: Path, t_s: float) -> np.ndarray:
    cap = cv2.VideoCapture(str(video_path))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, int(round(t_s * fps))))
    ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        raise RuntimeError(f"Could not extract frame at {t_s}s from {video_path}")
    return frame


def _build_contact_sheet(panels: list[tuple[np.ndarray, str]], out_path: Path, cols: int = 3) -> None:
    if not panels:
        return
    tile_w, tile_h = 640, 360
    rows = (len(panels) + cols - 1) // cols
    sheet = Image.new("RGB", (tile_w * cols, (tile_h + 44) * rows), (12, 16, 24))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype(str(WORKER_DIR / "assets" / "fonts" / "Inter-ExtraBold.ttf"), 20)
    except Exception:
        font = ImageFont.load_default()

    for idx, (bgr, label) in enumerate(panels):
        r, c = divmod(idx, cols)
        x0, y0 = c * tile_w, r * (tile_h + 44)
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        # Preserve aspect ratio neatly onto 16:9 dark tile
        ih, iw = rgb.shape[:2]
        scale = min(tile_w / iw, tile_h / ih)
        nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
        resized = Image.fromarray(rgb).resize((nw, nh), Image.Resampling.LANCZOS)
        sheet.paste(resized, (x0 + (tile_w - nw) // 2, y0 + (tile_h - nh) // 2))
        draw.rectangle([x0, y0 + tile_h, x0 + tile_w, y0 + tile_h + 44], fill=(18, 24, 36))
        draw.text((x0 + 16, y0 + tile_h + 10), label, fill=(240, 246, 255), font=font)

    sheet.save(out_path)


def _render_multi_style_video(
    base_vid: Path,
    out_vid: Path,
    style_cues: list[tuple[str, dict]],
    caption_position: str = "smart_safe",
    enable_depth: bool = True,
) -> dict:
    """Render each timed cue with its own flagship template onto one showcase MP4 cleanly."""
    cap = cv2.VideoCapture(str(base_vid))
    vw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    vh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    all_cues = []
    for style_name, seg in style_cues:
        style = dict(CAPTION_STYLES[style_name])
        built = _build_word_cues(
            [seg],
            style_name=style_name,
            style=style,
            resolve_story_treatment=resolve_story_caption_treatment,
            video_width=vw,
            video_height=vh,
            caption_scale=float(seg.get("scale", 1.0)),
            caption_position=seg.get("mode", caption_position),
        )
        all_cues.extend(built)

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(base_vid)],
        capture_output=True, text=True,
    )
    has_audio = bool(probe.stdout.strip())
    cmd = [
        "ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-vcodec", "rawvideo",
        "-pix_fmt", "bgr24", "-s", f"{vw}x{vh}", "-r", f"{fps:.6g}", "-i", "-",
    ]
    if has_audio:
        cmd.extend(["-i", str(base_vid), "-map", "0:v:0", "-map", "1:a:0", "-c:a", "copy"])
    cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out_vid)])

    from python_media_worker.studio_caption_safety import RvmMatteTracker
    rvm = RvmMatteTracker(target_long_edge=384, downsample_ratio=0.5) if enable_depth else None
    layout_cache = {}
    last_alpha = None
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    f_idx = 0
    try:
        assert proc.stdin is not None
        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            t_s = f_idx / fps
            active = [c for c in all_cues if c["start"] <= t_s <= c["end"]]
            alpha_full = None
            if active and rvm is not None and rvm.available and any(
                c["style_name"] in {"wall_type", "headline", "editorial_duo"} for c in active
            ):
                if f_idx % 2 == 0 or last_alpha is None:
                    last_alpha = rvm.step(frame, warmup_passes=1 if last_alpha is not None else 2)
                alpha_full = last_alpha
            comp = render_pro_caption_on_frame(frame, t_s, active, rvm_alpha_full=alpha_full, layout_cache=layout_cache) if active else frame
            proc.stdin.write(np.ascontiguousarray(comp).tobytes())
            f_idx += 1
        proc.stdin.close()
        err = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
        if proc.wait() != 0:
            raise RuntimeError(f"FFmpeg encode failed: {err}")
    finally:
        cap.release()
    return {"frames": f_idx, "cues": len(all_cues)}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    receipt: dict = {}

    with tempfile.TemporaryDirectory(prefix="pro-proof-") as tmp:
        tmp_dir = Path(tmp)

        # 1. Host 16:9 Flagship Multi-Template Showcase (12s)
        h16_src = tmp_dir / "host16x9_trim.mp4"
        _trim_clip(REAL_PODCAST_FAST, h16_src, 0.4, 12.0)
        h16_cues_raw = [
            ("word_pill", {"start": 0.2, "end": 2.0, "text": "Captions that command the frame", "words": [
                {"word": "Captions", "start": 0.2, "end": 0.65}, {"word": "that", "start": 0.65, "end": 0.9},
                {"word": "command", "start": 0.9, "end": 1.45}, {"word": "the", "start": 1.45, "end": 1.65}, {"word": "frame", "start": 1.65, "end": 2.0},
            ]}),
            ("glass", {"start": 2.1, "end": 3.9, "text": "Frosted glass blurs busy studio", "words": [
                {"word": "Frosted", "start": 2.1, "end": 2.55}, {"word": "glass", "start": 2.55, "end": 2.9},
                {"word": "blurs", "start": 2.9, "end": 3.25}, {"word": "busy", "start": 3.25, "end": 3.55}, {"word": "studio", "start": 3.55, "end": 3.9},
            ]}),
            ("editorial_duo", {"start": 4.0, "end": 5.9, "text": "Editorial serif meets bold sans", "words": [
                {"word": "Editorial", "start": 4.0, "end": 4.55}, {"word": "serif", "start": 4.55, "end": 4.95},
                {"word": "meets", "start": 4.95, "end": 5.25}, {"word": "bold", "start": 5.25, "end": 5.55}, {"word": "sans", "start": 5.55, "end": 5.9},
            ]}),
            ("wall_type", {"start": 6.0, "end": 7.9, "text": "DEPTH BEHIND SPEAKER", "scale": 1.28, "mode": "creative",
                           "captionPlacement": "custom", "captionX": 35, "captionY": 31}),
            ("neon_bloom", {"start": 8.0, "end": 9.9, "text": "Optical neon bloom halo"}),
            ("marker", {"start": 10.0, "end": 11.8, "text": "Sharp highlighter dodge precision"}),
        ]
        safe_16 = analyze_caption_safety_for_segments(
            str(h16_src),
            [c[1] for c in h16_cues_raw if c[1].get("captionPlacement") != "custom"],
            style_name="word_pill",
            preferred_mode="smart_safe",
        )
        safe_idx = 0
        h16_ready = []
        for st_name, seg in h16_cues_raw:
            if seg.get("captionPlacement") == "custom":
                h16_ready.append((st_name, seg))
            else:
                merged = {**seg, **safe_16["segments"][safe_idx]}
                merged["text"] = seg["text"]
                if "words" in seg:
                    merged["words"] = seg["words"]
                h16_ready.append((st_name, merged))
                safe_idx += 1

        out_16 = OUT_DIR / "01_Host16x9_Pro_Showcase.mp4"
        _render_multi_style_video(h16_src, out_16, h16_ready)
        receipt["host16x9"] = safe_16["summary"]

        # Contact sheet of all 6 live moments from 01_Host16x9_Pro_Showcase.mp4
        sheet_16 = []
        for st_name, sample_t in [("word_pill", 1.15), ("glass", 2.75), ("editorial_duo", 4.70), ("wall_type (RVM Depth)", 6.95), ("neon_bloom", 8.85), ("marker", 10.90)]:
            sheet_16.append((_extract_frame(out_16, sample_t), st_name))
        _build_contact_sheet(sheet_16, OUT_DIR / "pro_16x9_templates_sheet.png", cols=3)

        # 2. Host 9:16 Portrait Showcase (10s)
        h9_src = tmp_dir / "host9x16_trim.mp4"
        # Crop vertical 9:16 centered on left speaking host (x0=120..728 -> 608x1080 scaled to 1080x1920 crisp)
        _trim_clip(REAL_PODCAST_FAST, h9_src, 0.4, 10.0, scale_filter="crop=608:1080:140:0,scale=1080:1920:flags=lanczos")
        h9_raw = [
            ("editorial_duo", {"start": 0.2, "end": 2.4, "text": "Portrait luxury serif lockup"}),
            ("glass", {"start": 2.5, "end": 4.9, "text": "Apple frosted backdrop blur"}),
            ("word_pill", {"start": 5.0, "end": 7.4, "text": "Dynamic spring gradient pill"}),
            ("sticker", {"start": 7.5, "end": 9.8, "text": "Zero face overlap sticker"}),
        ]
        safe_9 = analyze_caption_safety_for_segments(str(h9_src), [c[1] for c in h9_raw], style_name="editorial_duo", preferred_mode="smart_safe")
        out_9 = OUT_DIR / "02_Host9x16_Portrait_SmartSafe.mp4"
        h9_ready = [(h9_raw[i][0], {**h9_raw[i][1], **safe_9["segments"][i], "text": h9_raw[i][1]["text"]}) for i in range(len(h9_raw))]
        _render_multi_style_video(h9_src, out_9, h9_ready)
        receipt["host9x16"] = safe_9["summary"]

        # 3. Two-Host Podcast Conversation (8s)
        conv_src = tmp_dir / "conv_trim.mp4"
        _trim_clip(PODCAST_CONV, conv_src, 0.2, 8.0)
        conv_raw = [
            ("editorial_duo", {"start": 0.2, "end": 2.7, "text": "Dodging both podcast speakers"}),
            ("glass", {"start": 2.8, "end": 5.3, "text": "Calm glass HUD between mics"}),
            ("wall_type", {"start": 5.4, "end": 7.8, "text": "Architectural studio room typography"}),
        ]
        safe_conv = analyze_caption_safety_for_segments(str(conv_src), [c[1] for c in conv_raw], style_name="editorial_duo", preferred_mode="smart_safe")
        out_conv = OUT_DIR / "03_TwoHost_Podcast_SmartSafe.mp4"
        conv_ready = [(conv_raw[i][0], {**conv_raw[i][1], **safe_conv["segments"][i], "text": conv_raw[i][1]["text"]}) for i in range(len(conv_raw))]
        _render_multi_style_video(conv_src, out_conv, conv_ready)
        receipt["twoHostPodcast"] = safe_conv["summary"]

        # 4. Opposing-Angle Podcast 12s (Host on Right + Orange TV on Left)
        p12_src = tmp_dir / "p12_trim.mp4"
        _trim_clip(PODCAST_12S, p12_src, 0.1, 6.0)
        p12_raw = [
            ("glass", {"start": 0.15, "end": 2.8, "text": "Frosted clarity off orange TV"}),
            ("word_pill", {"start": 2.9, "end": 5.8, "text": "Tracks speaker cut safely"}),
        ]
        safe_p12 = analyze_caption_safety_for_segments(str(p12_src), [c[1] for c in p12_raw], style_name="glass", preferred_mode="smart_safe")
        out_p12 = OUT_DIR / "04_OpposingHost_ClutterSafe.mp4"
        p12_ready = [(p12_raw[i][0], {**p12_raw[i][1], **safe_p12["segments"][i], "text": p12_raw[i][1]["text"]}) for i in range(len(p12_raw))]
        _render_multi_style_video(p12_src, out_p12, p12_ready)
        receipt["opposingHost12s"] = safe_p12["summary"]

        # 5. Moving 4-Beat Speaker Proof (TL -> TR -> Low -> Top-High)
        cap = cv2.VideoCapture(str(REAL_PODCAST_FAST))
        cap.set(cv2.CAP_PROP_POS_FRAMES, 60)
        _, f_host = cap.read()
        cap.release()
        person = cv2.resize(f_host[160:1080, 260:920], (300, 420))
        mov_src = tmp_dir / "moving4_silent.mp4"
        mov_aud = tmp_dir / "moving4.mp4"
        vw, vh, fps = 1280, 720, 24
        writer = cv2.VideoWriter(str(mov_src), cv2.VideoWriter_fourcc(*"mp4v"), fps, (vw, vh))
        beats_pos = [(60, 40), (880, 40), (490, 280), (490, 20)]
        for px, py in beats_pos:
            for _ in range(fps * 2):
                bg = np.full((vh, vw, 3), (22, 27, 36), dtype=np.uint8)
                hp = min(vh - py, person.shape[0])
                bg[py : py + hp, px : px + person.shape[1]] = person[:hp]
                writer.write(bg)
        writer.release()
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mov_src), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", str(mov_aud)], check=True)
        mov_raw = [
            ("word_pill", {"start": 0.1, "end": 1.9, "text": "Beat 1 dodges top-left"}),
            ("glass", {"start": 2.1, "end": 3.9, "text": "Beat 2 jumps clean corner"}),
            ("editorial_duo", {"start": 4.1, "end": 5.9, "text": "Beat 3 clears low center"}),
            ("spring_slam", {"start": 6.1, "end": 7.9, "text": "Beat 4 clears high forehead"}),
        ]
        safe_mov = analyze_caption_safety_for_segments(str(mov_aud), [c[1] for c in mov_raw], style_name="word_pill", preferred_mode="smart_safe")
        out_mov = OUT_DIR / "05_Moving_4Beat_Pro_Dodge.mp4"
        mov_ready = [(mov_raw[i][0], {**mov_raw[i][1], **safe_mov["segments"][i], "text": mov_raw[i][1]["text"]}) for i in range(len(mov_raw))]
        _render_multi_style_video(mov_aud, out_mov, mov_ready)
        receipt["moving4Beat"] = safe_mov["summary"]

        # Multi-video highlight contact sheet
        _build_contact_sheet(
            [
                (_extract_frame(out_9, 1.2), "9:16 Portrait Editorial Duo"),
                (_extract_frame(out_9, 3.6), "9:16 Portrait Frosted Glass"),
                (_extract_frame(out_conv, 1.5), "2-Host Podcast Smart Safe"),
                (_extract_frame(out_p12, 1.2), "Opposing Host & TV Dodge"),
                (_extract_frame(out_mov, 5.0), "Moving Beat 3 Clear"),
                (_extract_frame(out_mov, 7.0), "Moving Beat 4 0.0 Overlap"),
            ],
            OUT_DIR / "multi_angle_proof_sheet.png",
            cols=3,
        )

    (OUT_DIR / "pro_showcase_receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print("PRO SHOWCASE RECEIPT:", json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
