import json
import os
import subprocess
import tempfile
import numpy as np
import pytest
from PIL import Image

from studio_creative_effects import (
    apply_creative_effects_to_frame,
    apply_scrapbook_frame_to_layer,
    generate_doodle_paths,
    generate_torn_edge_polyline,
    mulberry32,
    hash_seed,
    normalize_creative_effects,
    render_creative_effects_video,
)


def _synthetic_moving_frame(t: float, w: int = 320, h: int = 180) -> np.ndarray:
    ys, xs = np.mgrid[0:h, 0:w]
    cx = int(w * (0.3 + 0.4 * abs(np.sin(t * 1.5))))
    cy = int(h * 0.5)
    bg = np.zeros((h, w, 3), dtype=np.uint8)
    bg[:, :, 0] = np.clip((xs / w) * 140 + 20, 0, 255).astype(np.uint8)
    bg[:, :, 1] = np.clip((ys / h) * 140 + 30, 0, 255).astype(np.uint8)
    bg[:, :, 2] = 110
    mask = ((xs - cx) ** 2 + (ys - cy) ** 2) < 28 ** 2
    bg[mask] = [245, 95, 65]
    return bg


def test_validation_rejects_unknown_effect_and_blend():
    with pytest.raises(ValueError, match="Unsupported creative effect"):
        normalize_creative_effects([{"effectId": "nonexistent_fx"}], duration=5.0)
    with pytest.raises(ValueError, match="Unsupported blendMode"):
        normalize_creative_effects([{"effectId": "light_leaks", "blendMode": "invalid_blend"}], duration=5.0)


def test_deterministic_prng_and_torn_edge_geometry():
    r1 = mulberry32(hash_seed("torn-17"))
    r2 = mulberry32(hash_seed("torn-17"))
    assert [r1() for _ in range(5)] == [r2() for _ in range(5)]
    seam, nx, ny, *_ = generate_torn_edge_polyline(640, 360, 50, 50, "vertical", 0, 60, 17)
    assert len(seam) == 97
    assert abs(nx - 1.0) < 1e-6 and abs(ny) < 1e-6
    assert len(generate_doodle_paths("arrow", 11, 40)) == 2
    assert len(generate_doodle_paths("heart", 11, 40)[0]) == 49


def test_all_phase1_effects_animate_and_preserve_keyframes():
    f0 = _synthetic_moving_frame(0.0)
    f1 = _synthetic_moving_frame(1.2)
    effects = normalize_creative_effects(
        [
            {
                "id": "fx-rp",
                "effectId": "ripped_paper",
                "startTime": 0.0,
                "duration": 3.0,
                "params": {"mode": "tear_video_open", "direction": "diagonal", "behindText": "BEHIND"},
            },
            {
                "id": "fx-dl",
                "effectId": "doodles",
                "startTime": 0.0,
                "duration": 3.0,
                "params": {"shape": "circle", "color": "#ffde59", "drawDuration": 1.0, "autoAnimate": True},
            },
            {
                "id": "fx-fg",
                "effectId": "film_grain",
                "startTime": 0.0,
                "duration": 3.0,
                "params": {"preset": "8mm_kodachrome", "intensity": 65, "borderStyle": "8mm_sprocket"},
            },
            {
                "id": "fx-ll",
                "effectId": "light_leaks",
                "startTime": 0.0,
                "duration": 3.0,
                "blendMode": "screen",
                "params": {"style": "warm_amber", "intensity": 70},
            },
        ],
        duration=3.0,
    )
    keys = [
        {"id": "k1", "targetId": "fx-rp", "property": "tearProgress", "time": 0.0, "value": 5.0, "easing": "linear"},
        {"id": "k2", "targetId": "fx-rp", "property": "tearProgress", "time": 2.0, "value": 85.0, "easing": "linear"},
    ]
    out0 = apply_creative_effects_to_frame(f0, effects, keys, 0.2, fps=30.0)
    out1 = apply_creative_effects_to_frame(f1, effects, keys, 1.8, fps=30.0)
    assert out0.shape == f0.shape and out1.shape == f1.shape
    # Effects visibly modify source frame AND change between timestamps
    assert float(np.mean(np.abs(out0.astype(np.float32) - f0.astype(np.float32)))) > 8.0
    assert float(np.mean(np.abs(out1.astype(np.float32) - out0.astype(np.float32)))) > 5.0


def test_scrapbook_frame_wraps_media_cleanly():
    img = Image.new("RGBA", (200, 120), (40, 120, 210, 255))
    framed = apply_scrapbook_frame_to_layer(
        img,
        {"enabled": True, "frameStyle": "polaroid", "captionText": "STUDIO", "borderWidth": 20},
    )
    assert framed.width > img.width
    assert framed.height > img.height


def test_real_video_end_to_end_export_with_combined_phase1_effects():
    sample_mp4 = "/home/tibule12/Projects/AutoPromte/AutoPromote-pro-studio-20261114/reports/studio-stability-20261007/media/podcast-12s.mp4"
    if not os.path.exists(sample_mp4):
        sample_mp4 = "/home/tibule12/Projects/AutoPromte/AutoPromote-creative-effects-20261122/frontend/public/demo-full.mp4"
    assert os.path.exists(sample_mp4)

    with tempfile.TemporaryDirectory() as tmp:
        clip_in = os.path.join(tmp, "source_2s.mp4")
        clip_out = os.path.join(tmp, "phase1_out.mp4")
        # Extract real 2.0s moving segment at 480x270 for fast deterministic verification
        subprocess.run(
            [
                "ffmpeg", "-v", "error", "-y", "-i", sample_mp4, "-t", "2.0",
                "-vf", "scale=480:270", "-r", "24", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", clip_in,
            ],
            check=True,
        )
        effects = [
            {
                "id": "p1-rp",
                "effectId": "ripped_paper",
                "startTime": 0.0,
                "duration": 0.9,
                "params": {"mode": "tear_away_paper", "direction": "vertical", "roughness": 65, "paperColor": "#efe6d5"},
            },
            {
                "id": "p1-doodle",
                "effectId": "doodles",
                "startTime": 0.5,
                "duration": 1.5,
                "params": {"shape": "curved_arrow", "color": "#ffde59", "strokeWidth": 8, "drawDuration": 0.8},
            },
            {
                "id": "p1-grain",
                "effectId": "film_grain",
                "startTime": 0.0,
                "duration": 2.0,
                "params": {"preset": "16mm_docu", "intensity": 55, "dustAmount": 35, "scratchesAmount": 25},
            },
            {
                "id": "p1-leak",
                "effectId": "light_leaks",
                "startTime": 0.8,
                "duration": 1.2,
                "blendMode": "screen",
                "params": {"style": "warm_amber", "intensity": 72, "mode": "clip_transition"},
            },
        ]
        receipt = render_creative_effects_video(clip_in, clip_out, effects, duration=2.0)
        assert receipt["frames_processed"] >= 45
        assert os.path.getsize(clip_out) > 10_000

        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", clip_out],
            check=True, capture_output=True, text=True,
        )
        info = json.loads(probe.stdout)
        streams = {s["codec_type"] for s in info["streams"]}
        assert "video" in streams
        assert float(info["format"]["duration"]) == pytest.approx(2.0, abs=0.25)
