import unittest

from python_media_worker.main_media_server import (
    build_studio_finish_filter,
    build_studio_visualizer_filter,
)


class StudioFinishFilterTests(unittest.TestCase):
    def test_builds_restrained_creator_grade_from_browser_project_values(self):
        result = build_studio_finish_filter(
            {
                "enabled": True,
                "color": {
                    "brightness": 1.08,
                    "contrast": 1.2,
                    "saturation": 1.12,
                    "temperature": 0.25,
                    "sharpness": 0.35,
                    "vignette": 0.2,
                },
                "texture": {"film_grain": 0.12},
            }
        )

        self.assertIn("eq=brightness=0.0800:contrast=1.2000:saturation=1.1200", result)
        self.assertIn("colorbalance=", result)
        self.assertIn("unsharp=", result)
        self.assertIn("vignette=", result)
        self.assertIn("noise=", result)

    def test_disabled_finish_is_a_no_op(self):
        self.assertEqual(build_studio_finish_filter({"enabled": False}), "")

    def test_builds_frame_evaluated_color_interpolation_for_adjustment_keyframes(self):
        result = build_studio_finish_filter(
            {
                "enabled": True,
                "color": {"brightness": 1.0, "contrast": 1.0, "saturation": 1.0},
                "keyframes": [
                    {
                        "time": 0,
                        "values": {"brightness": 0.92, "contrast": 1.0, "saturation": 0.9},
                    },
                    {
                        "time": 2,
                        "values": {"brightness": 1.12, "contrast": 1.3, "saturation": 1.25},
                    },
                ],
            }
        )

        self.assertIn("between(t\\,0.00000\\,2.00000)", result)
        self.assertIn("eval=frame", result)

    def test_builds_export_filters_for_signature_texture_controls(self):
        result = build_studio_finish_filter(
            {
                "enabled": True,
                "texture": {
                    "chromatic_aberration": 0.5,
                    "vhs_tracking": 0.4,
                    "light_leak": 0.3,
                },
            }
        )

        self.assertIn("rgbashift=", result)
        self.assertIn("drawbox=", result)
        self.assertIn("colorbalance=", result)

    def test_builds_real_audio_driven_visualizer_graph(self):
        result = build_studio_visualizer_filter(
            {
                "visualizer": {
                    "enabled": True,
                    "mode": "ring",
                    "position": "bottom",
                    "color": "#4df6ff",
                    "intensity": 1.0,
                }
            },
            640,
            360,
        )

        self.assertIn("[0:a]asplit=2", result)
        self.assertIn("avectorscope=", result)
        self.assertIn("[v_visualizer]", result)


if __name__ == "__main__":
    unittest.main()
