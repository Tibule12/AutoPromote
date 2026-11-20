import ast
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from studio_pro_render_engine import build_power_window_filter, write_hsl_qualifier_cube
from studio_adjustment_grade import adjustment_grade_filter


class StudioColorSecondaryTests(unittest.TestCase):
    def test_power_window_supports_rectangle_linear_temperature_and_custom_prefix(self):
        rect = build_power_window_filter(
            {
                "enabled": True,
                "shape": "rectangle",
                "x": 0.5,
                "y": 0.5,
                "rx": 0.25,
                "ry": 0.25,
                "feather": 0.1,
                "exposureStops": 1.0,
                "temperature": 0.5,
            },
            prefix="adj0_pw_",
        )
        self.assertIn("max(abs(", rect)
        self.assertIn("[adj0_pw_base]", rect)
        self.assertNotIn("[pw_base]", rect)

        linear = build_power_window_filter(
            {
                "enabled": True,
                "shape": "linear",
                "x": 0.5,
                "rx": 0.2,
                "feather": 0.25,
                "exposureStops": -0.8,
            },
            prefix="lin_",
        )
        self.assertIn("lin_base", linear)

        # Render with real FFmpeg on a flat gray frame and verify warm brighter rectangle center vs untouched corner
        with tempfile.TemporaryDirectory() as tmp:
            raw = os.path.join(tmp, "rect.rgb")
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=c=0x808080:s=64x64:r=24:d=0.05",
                    "-vf",
                    rect,
                    "-frames:v",
                    "1",
                    "-f",
                    "rawvideo",
                    "-pix_fmt",
                    "rgb24",
                    raw,
                ],
                check=True,
                capture_output=True,
            )
            data = Path(raw).read_bytes()
            # Center pixel (32, 32) vs top-left corner (2, 2)
            cx_off = (32 * 64 + 32) * 3
            tl_off = (2 * 64 + 2) * 3
            center_r, center_g, center_b = data[cx_off], data[cx_off + 1], data[cx_off + 2]
            corner_r, corner_g, corner_b = data[tl_off], data[tl_off + 1], data[tl_off + 2]
            self.assertGreater(center_r, corner_r + 30)
            self.assertGreater(center_r, center_b + 10)  # positive warmth pushed red over blue

    def test_adjustment_grade_filter_applies_power_window_and_qualifier_cube(self):
        with tempfile.TemporaryDirectory() as tmp:
            qual_cube = os.path.join(tmp, "qual.cube")
            write_hsl_qualifier_cube({"enabled": True, "hueCenter": 0.33, "gain": 1.25}, qual_cube, size=5)
            flt = adjustment_grade_filter(
                {
                    "color": {"exposureStops": 0.2},
                    "power_window": {"enabled": True, "shape": "ellipse", "exposureStops": 0.4},
                    "_worker_qualifier_cube_path": qual_cube,
                },
                lambda cfg, *_a, **_kw: "eq=brightness=0.05",
                "adj0_",
            )
            self.assertIn("adj0_pw_base", flt)
            self.assertIn("qual.cube", flt)
            # Execute FFmpeg to verify combined filtergraph compiles cleanly in FFmpeg
            out = os.path.join(tmp, "out.mp4")
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=c=0x407040:s=64x64:r=24:d=0.1",
                    "-vf",
                    flt,
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    out,
                ],
                check=True,
                capture_output=True,
            )
            self.assertGreater(os.path.getsize(out), 200)

        server_src = Path(__file__).resolve().with_name("main_media_server.py").read_text(encoding="utf-8")
        ast.parse(server_src)
        self.assertIn("_worker_qualifier_cube_path", server_src)


if __name__ == "__main__":
    unittest.main()
