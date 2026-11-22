import json
import os
import subprocess
import tempfile
import numpy as np
import pytest

from studio_creative_effects import (
    apply_creative_effects_to_frame,
    normalize_creative_effects,
    render_creative_effects_video,
)


def _moving_test_frame(t: float, w: int = 360, h: int = 200) -> np.ndarray:
    ys, xs = np.mgrid[0:h, 0:w]
    cx = int(w * (0.3 + 0.4 * abs(np.sin(t * 2.0))))
    cy = int(h * 0.5)
    bg = np.zeros((h, w, 3), dtype=np.uint8)
    bg[:, :, 0] = np.clip((xs / w) * 160 + 25, 0, 255).astype(np.uint8)
    bg[:, :, 1] = np.clip((ys / h) * 120 + 20, 0, 255).astype(np.uint8)
    bg[:, :, 2] = 90
    mask = ((xs - cx) ** 2 + (ys - cy) ** 2) < 32 ** 2
    bg[mask] = [250, 140, 50]
    return bg


def test_zoom_motion_blur_and_tracked_focus():
    f0 = _moving_test_frame(0.3)
    fx = normalize_creative_effects(
        [
            {
                "id": "z1",
                "effectId": "zoom_motion_blur",
                "startTime": 0.0,
                "duration": 2.0,
                "tracking": {
                    "enabled": True,
                    "sourceLayerId": "subj-1",
                    "source_base": {"x": 35, "y": 40},
                    "source_keyframes": [
                        {"property": "x", "time": 0.0, "value": 35},
                        {"property": "x", "time": 2.0, "value": 75},
                    ],
                },
                "params": {"mode": "tracked_zoom", "zoomScale": 1.65, "motionBlurStrength": 70, "rotation": 6},
            }
        ],
        duration=2.0,
    )
    out0 = apply_creative_effects_to_frame(f0, fx, [], 0.6, fps=30.0)
    out1 = apply_creative_effects_to_frame(f0, fx, [], 1.6, fps=30.0)
    assert float(np.mean(np.abs(out0.astype(np.float32) - f0.astype(np.float32)))) > 4.0
    assert float(np.mean(np.abs(out1.astype(np.float32) - out0.astype(np.float32)))) > 4.0
    # Zero black borders introduced by rotation/zoom
    assert int(np.min(out1[0, 0])) > 10 and int(np.min(out1[-1, -1])) > 10


def test_flash_camera_shake_has_zero_empty_edges_and_beat_sync():
    f0 = _moving_test_frame(0.5)
    fx = normalize_creative_effects(
        [
            {
                "id": "sh1",
                "effectId": "flash_camera_shake",
                "startTime": 0.0,
                "duration": 2.0,
                "params": {"mode": "impact_shake", "shakeStrength": 95, "flashIntensity": 80, "beatSync": True},
            }
        ],
        duration=2.0,
    )
    out_beat = apply_creative_effects_to_frame(f0, fx, [], 0.12, fps=30.0, beat_markers=[0.12])
    out_off = apply_creative_effects_to_frame(f0, fx, [], 0.12, fps=30.0, beat_markers=[1.8])
    # Top/bottom/left/right edge pixels must not drop to zero black!
    assert int(np.mean(out_beat[0, :, :])) > 15
    assert int(np.mean(out_beat[:, 0, :])) > 15
    assert float(np.mean(np.abs(out_beat.astype(np.float32) - out_off.astype(np.float32)))) > 2.0


def test_particle_overlays_behind_subject_mask_and_animation():
    f0 = _moving_test_frame(0.5)
    fx = normalize_creative_effects(
        [
            {
                "id": "pt1",
                "effectId": "particle_overlays",
                "startTime": 0.0,
                "duration": 3.0,
                "blendMode": "screen",
                "params": {"particleType": "sparks", "particleCount": 140, "size": 12, "maskMode": "behind_subject"},
            }
        ],
        duration=3.0,
    )
    out0 = apply_creative_effects_to_frame(f0, fx, [], 0.2, fps=30.0)
    out1 = apply_creative_effects_to_frame(f0, fx, [], 1.4, fps=30.0)
    assert float(np.mean(np.abs(out0.astype(np.float32) - f0.astype(np.float32)))) > 2.0
    assert float(np.mean(np.abs(out1.astype(np.float32) - out0.astype(np.float32)))) > 2.0


def test_real_video_export_all_phase3_effects():
    sample_mp4 = "/home/tibule12/Projects/AutoPromte/AutoPromote-pro-studio-20261114/reports/studio-stability-20261007/media/podcast-12s.mp4"
    if not os.path.exists(sample_mp4):
        sample_mp4 = "/home/tibule12/Projects/AutoPromte/AutoPromote-creative-effects-20261122/frontend/public/demo-full.mp4"
    with tempfile.TemporaryDirectory() as tmp:
        clip_in = os.path.join(tmp, "src.mp4")
        clip_out = os.path.join(tmp, "p3_out.mp4")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", sample_mp4, "-t", "2.0", "-vf", "scale=480:270", "-r", "24", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", clip_in],
            check=True,
        )
        effects = [
            {"id": "p3-zoom", "effectId": "zoom_motion_blur", "startTime": 0.0, "duration": 1.0, "params": {"mode": "punch_in", "zoomScale": 1.5, "motionBlurStrength": 65}},
            {"id": "p3-shake", "effectId": "flash_camera_shake", "startTime": 0.9, "duration": 0.8, "params": {"mode": "impact_shake", "shakeStrength": 80, "flashIntensity": 70}},
            {"id": "p3-pt", "effectId": "particle_overlays", "startTime": 0.0, "duration": 2.0, "blendMode": "screen", "params": {"particleType": "confetti", "particleCount": 90, "direction": "down"}},
            {"id": "p3-spd", "effectId": "speed_ramping", "startTime": 0.0, "duration": 2.0, "params": {"preset": "hero_slow_mo", "startRate": 1.5, "midRate": 0.6, "endRate": 1.5}},
        ]
        receipt = render_creative_effects_video(clip_in, clip_out, effects, duration=2.0)
        assert receipt["frames_processed"] >= 45
        assert os.path.getsize(clip_out) > 10_000
