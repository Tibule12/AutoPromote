import json
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw

from python_media_worker.studio_layer_motion import (
    composition_layer,
    interpolate_layer_value,
    render_image_layer_motion,
)


def test_composition_layer_and_custom_curve_interpolation():
    layer = {
        "id": "logo",
        "base_transform": {"x": 50},
        "motion_keyframes": [
            {"property": "x", "time": 0, "value": 10},
            {"property": "x", "time": 1, "value": 90, "easing": "bezier", "curve": [.1, 0, .2, 1]},
        ],
    }
    assert composition_layer({"layers": [layer]}, "logo") is layer
    assert interpolate_layer_value(layer, "x", 0, 50) == 10
    assert interpolate_layer_value(layer, "x", 1, 50) == 90
    assert interpolate_layer_value(layer, "x", .5, 50) > 70


def test_real_logo_layer_render_preserves_alpha_and_moves_across_canvas():
    with tempfile.TemporaryDirectory() as temp:
        source, output = Path(temp) / "logo.png", Path(temp) / "motion.mov"
        logo = Image.new("RGBA", (80, 40))
        draw = ImageDraw.Draw(logo)
        draw.rounded_rectangle((2, 2, 77, 37), radius=8, fill="#7c3aed")
        draw.polygon([(18, 32), (31, 8), (41, 8), (54, 32), (44, 32), (36, 17), (28, 32)], fill="white")
        logo.save(source)
        overlay = {
            "id": "logo", "start_time": 0, "duration": 1, "x": 20, "y": 50,
            "width": 32, "height": 24, "mediaFit": "contain", "opacity": 1,
        }
        layer = {
            "id": "logo",
            "base_transform": {"x": 20, "y": 50, "scale": 1, "rotation": 0, "opacity": 1},
            "anchor_x": 50,
            "anchor_y": 50,
            "effects": {
                "glow": {"enabled": True, "color": "#8b5cf6", "radius": 4, "intensity": .5},
                "motion_blur": {"enabled": True, "samples": 3, "shutter": .5},
            },
            "motion_keyframes": [
                {"property": "x", "time": 0, "value": 20},
                {"property": "x", "time": 1, "value": 80, "easing": "ease_in_out"},
                {"property": "rotation", "time": 0, "value": -12},
                {"property": "rotation", "time": 1, "value": 12, "easing": "ease_in_out"},
            ],
        }
        receipt = render_image_layer_motion(
            source, output, overlay, layer, 160, 90, 1,
            [{"start_time": 0, "end_time": 1, "rate": 1}], fps=10,
        )
        assert receipt["duration"] == 1
        info = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output),
        ]))
        assert info["streams"][0]["pix_fmt"] == "argb"
        raw = subprocess.check_output([
            "ffmpeg", "-v", "error", "-i", str(output), "-f", "rawvideo", "-pix_fmt", "rgba", "-",
        ])
        frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 90, 160, 4)
        assert frames[:, :, :, 3].max() == 255
        first_x = np.where(frames[0, :, :, 3] > 20)[1].mean()
        last_x = np.where(frames[-1, :, :, 3] > 20)[1].mean()
        assert last_x > first_x + 50


def test_layer_render_uses_identity_clock_without_speed_segments():
    with tempfile.TemporaryDirectory() as temp:
        source, output = Path(temp) / "logo.png", Path(temp) / "motion.mov"
        Image.new("RGBA", (16, 16), "white").save(source)
        receipt = render_image_layer_motion(
            source,
            output,
            {"start_time": .25, "duration": .5, "width": 10, "height": 10},
            {"base_transform": {"x": 50, "y": 50, "scale": 1, "opacity": 1}},
            64,
            64,
            1,
            [],
            fps=10,
        )
        assert receipt["start_time"] == .25
        assert receipt["duration"] == .5
        assert output.exists()
