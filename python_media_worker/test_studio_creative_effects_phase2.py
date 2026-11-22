import os
import subprocess
import tempfile
import numpy as np
import pytest

from studio_creative_effects import (
    apply_creative_effects_to_frame,
    compute_freeze_cutout_mask,
    normalize_creative_effects,
    render_creative_effects_video,
)


def _moving_test_frame(t: float, w: int = 360, h: int = 200) -> np.ndarray:
    ys, xs = np.mgrid[0:h, 0:w]
    cx = int(w * (0.28 + 0.44 * abs(np.sin(t * 2.0))))
    cy = int(h * 0.52)
    bg = np.zeros((h, w, 3), dtype=np.uint8)
    bg[:, :, 0] = np.clip((xs / w) * 180 + 20, 0, 255).astype(np.uint8)
    bg[:, :, 1] = np.clip((ys / h) * 90 + 25, 0, 255).astype(np.uint8)
    bg[:, :, 2] = 62
    mask = ((xs - cx) ** 2 + (ys - cy) ** 2) < 34 ** 2
    bg[mask] = [245, 190, 95]
    return bg


def test_vhs_glitch_rgb_split_scanlines_and_beat_sync():
    f0 = _moving_test_frame(0.5)
    fx = normalize_creative_effects(
        [
            {
                "id": "vhs-1",
                "effectId": "vhs_glitch",
                "startTime": 0.0,
                "duration": 3.0,
                "params": {"style": "vhs_tape", "intensity": 80, "rgbSeparation": 16, "scanlines": 70, "beatSync": True},
            }
        ],
        duration=3.0,
    )
    out_normal = apply_creative_effects_to_frame(f0, fx, [], 0.5, fps=30.0, beat_markers=[2.0])
    out_beat = apply_creative_effects_to_frame(f0, fx, [], 0.5, fps=30.0, beat_markers=[0.5])
    assert float(np.mean(np.abs(out_normal.astype(np.float32) - f0.astype(np.float32)))) > 6.0
    assert float(np.mean(np.abs(out_beat.astype(np.float32) - out_normal.astype(np.float32)))) > 0.5


def test_comic_pop_art_halftone_outlines_and_tracked_bubble():
    f0 = _moving_test_frame(0.2)
    fx = normalize_creative_effects(
        [
            {
                "id": "comic-1",
                "effectId": "comic_pop_art",
                "startTime": 0.0,
                "duration": 3.0,
                "tracking": {
                    "enabled": True,
                    "sourceLayerId": "subj-1",
                    "source_base": {"x": 25, "y": 25},
                    "source_keyframes": [
                        {"property": "x", "time": 0.0, "value": 25},
                        {"property": "x", "time": 2.0, "value": 75},
                    ],
                },
                "params": {"style": "classic_comic", "outlineStrength": 75, "halftoneDensity": 65, "speechText": "BAM!"},
            }
        ],
        duration=3.0,
    )
    out_early = apply_creative_effects_to_frame(f0, fx, [], 0.1, fps=30.0)
    out_late = apply_creative_effects_to_frame(f0, fx, [], 1.9, fps=30.0)
    assert float(np.mean(np.abs(out_early.astype(np.float32) - f0.astype(np.float32)))) > 12.0
    assert float(np.mean(np.abs(out_late.astype(np.float32) - out_early.astype(np.float32)))) > 5.0


def test_freeze_cutout_isolates_subject_and_continues_live_background():
    freeze_src = _moving_test_frame(0.0)
    later_live = _moving_test_frame(1.4)
    mask = compute_freeze_cutout_mask(freeze_src, {"maskMode": "auto_subject", "subjectX": 50, "subjectY": 52, "subjectRadius": 35})
    assert mask.shape == freeze_src.shape[:2]
    assert int(np.max(mask)) > 200 and int(np.min(mask)) < 25

    fx = normalize_creative_effects(
        [
            {
                "id": "fc-1",
                "effectId": "freeze_cutout",
                "startTime": 0.0,
                "duration": 2.0,
                "params": {"freezeTime": 0.0, "animatedBg": "live_video", "outlineWidth": 10, "labelText": "LOCKED"},
            }
        ],
        duration=2.0,
    )
    out = apply_creative_effects_to_frame(later_live, fx, [], 1.2, fps=30.0, freeze_frames={"fc-1": freeze_src})
    assert float(np.mean(np.abs(out.astype(np.float32) - later_live.astype(np.float32)))) > 5.0


def test_kinetic_typography_speech_word_highlighting():
    f0 = _moving_test_frame(0.3)
    fx = normalize_creative_effects(
        [
            {
                "id": "kt-1",
                "effectId": "kinetic_typography",
                "startTime": 0.0,
                "duration": 3.0,
                "params": {
                    "text": "REAL SYNCED WORDS",
                    "style": "karaoke_highlight",
                    "wordTimings": [
                        {"word": "REAL", "start": 0.0, "end": 0.5},
                        {"word": "SYNCED", "start": 0.5, "end": 1.0},
                        {"word": "WORDS", "start": 1.0, "end": 1.5},
                    ],
                },
            }
        ],
        duration=3.0,
    )
    t_w1 = apply_creative_effects_to_frame(f0, fx, [], 0.25, fps=30.0)
    t_w2 = apply_creative_effects_to_frame(f0, fx, [], 0.75, fps=30.0)
    assert float(np.mean(np.abs(t_w1.astype(np.float32) - f0.astype(np.float32)))) > 2.0
    assert float(np.mean(np.abs(t_w2.astype(np.float32) - t_w1.astype(np.float32)))) > 1.0


def test_real_video_export_all_phase2_effects():
    sample_mp4 = "/home/tibule12/Projects/AutoPromte/AutoPromote-pro-studio-20261114/reports/studio-stability-20261007/media/podcast-12s.mp4"
    if not os.path.exists(sample_mp4):
        sample_mp4 = "/home/tibule12/Projects/AutoPromte/AutoPromote-creative-effects-20261122/frontend/public/demo-full.mp4"
    with tempfile.TemporaryDirectory() as tmp:
        clip_in = os.path.join(tmp, "src.mp4")
        clip_out = os.path.join(tmp, "p2_out.mp4")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", sample_mp4, "-t", "2.0", "-vf", "scale=480:270", "-r", "24", "-c:v", "libx264", "-preset", "veryfast", "-an", clip_in],
            check=True,
        )
        effects = [
            {"id": "p2-vhs", "effectId": "vhs_glitch", "startTime": 0.0, "duration": 0.7, "params": {"style": "vhs_tape", "intensity": 75}},
            {"id": "p2-comic", "effectId": "comic_pop_art", "startTime": 0.7, "duration": 0.7, "params": {"style": "classic_comic", "speechText": "WAIT!"}},
            {"id": "p2-freeze", "effectId": "freeze_cutout", "startTime": 1.0, "duration": 1.0, "params": {"freezeTime": 1.0, "animatedBg": "live_video", "labelText": "KEY"}},
            {"id": "p2-kt", "effectId": "kinetic_typography", "startTime": 0.2, "duration": 1.8, "params": {"text": "PRO STUDIO FX", "style": "bounce"}},
        ]
        receipt = render_creative_effects_video(clip_in, clip_out, effects, duration=2.0)
        assert receipt["frames_processed"] >= 45
        assert os.path.getsize(clip_out) > 10_000
