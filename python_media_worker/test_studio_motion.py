import subprocess
import unittest

import numpy as np

from python_media_worker.studio_motion import (
    build_studio_motion_filter,
    build_studio_zoom_filter,
    easing_value,
)


class StudioMotionTests(unittest.TestCase):
    def test_default_is_no_op(self):
        self.assertEqual(build_studio_zoom_filter({}, 160, 120), "")

    def test_custom_curve_uses_horizontal_handles(self):
        self.assertGreater(easing_value(0.5, "bezier", [0.1, 0, 0.2, 1]),
                           easing_value(0.5, "bezier", [0.8, 0, 0.9, 1]))

    def test_real_filter_changes_pixels_and_restores_original_framing(self):
        for easing in ("linear", "ease_in", "ease_out", "ease_in_out", "hold", "bezier"):
            with self.subTest(easing=easing):
                graph = build_studio_zoom_filter({"scale_keyframes": [
                    {"time": 0, "value": 1},
                    {"time": 0.5, "value": 2, "easing": easing},
                    {"time": 1, "value": 1, "easing": "ease_out"},
                ]}, 160, 120)
                result = subprocess.run(["ffmpeg", "-v", "error", "-filter_threads", "1", "-f", "lavfi", "-i",
                    "color=c=black:s=160x120:r=4:d=1.5,drawbox=x=50:y=30:w=60:h=60:color=white:t=fill",
                    "-vf", graph, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr.decode())
                frames = [result.stdout[i:i+160*120*3] for i in range(0, len(result.stdout), 160*120*3)]
                self.assertEqual(len(frames), 6)
                self.assertEqual(frames[0], frames[4])
                self.assertGreater(sum(frames[2]), sum(frames[0]) * 2)

    def test_scale_below_one_keeps_delivery_size_with_black_padding(self):
        graph = build_studio_zoom_filter({"base_scale": 0.5}, 160, 120)
        result = subprocess.run(["ffmpeg", "-v", "error", "-filter_threads", "1", "-f", "lavfi", "-i",
            "color=c=red:s=160x120:r=1:d=1", "-vf", graph, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
            capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(len(result.stdout), 160*120*3)
        self.assertEqual(result.stdout[:3], bytes([0, 0, 0]))

    def test_position_rotation_opacity_and_crop_are_real_render_filters(self):
        graph = build_studio_motion_filter({
            "base_transform": {
                "x": 70, "y": 42, "scale": 1, "rotation": 18,
                "opacity": .55, "crop_x": 12, "crop_y": 8,
            },
            "keyframes": [
                {"property": "x", "time": 0, "value": 50},
                {"property": "x", "time": 1, "value": 70, "easing": "linear"},
                {"property": "rotation", "time": 0, "value": 0},
                {"property": "rotation", "time": 1, "value": 18, "easing": "linear"},
            ],
        }, 160, 120)
        result = subprocess.run([
            "ffmpeg", "-v", "error", "-filter_threads", "1", "-f", "lavfi", "-i",
            "color=c=black:s=160x120:r=2:d=1.5,drawbox=x=52:y=36:w=36:h=48:color=white:t=fill",
            "-vf", graph, "-pix_fmt", "rgb24", "-f", "rawvideo", "-",
        ], capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        frames = np.frombuffer(result.stdout, dtype=np.uint8).reshape(-1, 120, 160, 3)
        self.assertEqual(len(frames), 3)
        self.assertFalse(np.array_equal(frames[0], frames[-1]))
        # Cropping and opacity expose black canvas and keep the rendered signal restrained.
        self.assertEqual(int(frames[-1, 0].max()), 0)
        self.assertLess(float(frames[-1].mean()), float(frames[0].mean()))
        x0 = np.where(frames[0, :, :, 0] > 20)[1].mean()
        x1 = np.where(frames[-1, :, :, 0] > 20)[1].mean()
        self.assertGreater(x1, x0)
