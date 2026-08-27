import json
import os
import subprocess
import tempfile
import unittest

from python_media_worker.viral_creative_effects import (
    build_creative_filter_complex,
    normalize_creative_plan,
)


class ViralCreativeEffectsTests(unittest.TestCase):
    def test_normalizes_supported_effects_and_rejects_unknown_effects(self):
        plan = normalize_creative_plan(
            {
                "enabled": True,
                "intensity": "unreal",
                "effects": [
                    {"preset": "reality_break", "start_time": -3, "end_time": 2},
                    {"preset": "unknown_filter", "start_time": 1, "end_time": 3},
                ],
            },
            5,
        )

        self.assertTrue(plan["enabled"])
        self.assertEqual(plan["fallback"], "clean")
        self.assertEqual(
            plan["effects"],
            [
                {
                    "id": "creative-1",
                    "preset": "reality_break",
                    "intensity": "unreal",
                    "start_time": 0.0,
                    "end_time": 2.0,
                    "studio_makeover": False,
                    "composition_mode": "monitor",
                }
            ],
        )

    def test_reality_break_preserves_supported_composition_and_bounds_unknown_mode(self):
        background = normalize_creative_plan(
            {
                "enabled": True,
                "effects": [
                    {
                        "preset": "reality_break",
                        "start_time": 0,
                        "end_time": 3,
                        "composition_mode": "full_background",
                    }
                ],
            },
            3,
        )
        invalid = normalize_creative_plan(
            {
                "enabled": True,
                "effects": [
                    {
                        "preset": "reality_break",
                        "start_time": 0,
                        "end_time": 3,
                        "composition_mode": "fake_people",
                    }
                ],
            },
            3,
        )

        self.assertEqual(background["effects"][0]["composition_mode"], "full_background")
        self.assertEqual(invalid["effects"][0]["composition_mode"], "monitor")

        hybrid = normalize_creative_plan(
            {
                "enabled": True,
                "effects": [
                    {
                        "preset": "reality_break",
                        "start_time": 0,
                        "end_time": 3,
                        "composition_mode": "paced_hybrid",
                    }
                ],
            },
            3,
        )
        self.assertEqual(hybrid["effects"][0]["composition_mode"], "paced_hybrid")

    def test_motion_sculpture_cannot_fall_back_to_a_full_frame_ffmpeg_graph(self):
        plan = normalize_creative_plan(
            {
                "enabled": True,
                "intensity": "unreal",
                "effects": [
                    {"preset": "motion_sculpture", "start_time": 0, "end_time": 1},
                ],
            },
            1,
        )
        with self.assertRaisesRegex(ValueError, "subject-aware OpenCV"):
            build_creative_filter_complex(plan)

    def test_reality_break_cannot_fall_back_to_a_generic_ffmpeg_graph(self):
        plan = normalize_creative_plan(
            {
                "enabled": True,
                "intensity": "unreal",
                "effects": [
                    {"preset": "reality_break", "start_time": 0, "end_time": 1},
                ],
            },
            1,
        )
        with self.assertRaisesRegex(ValueError, "evidence-grounded subject-aware"):
            build_creative_filter_complex(plan)

    def test_builds_real_delayed_frames_for_beat_echo(self):
        plan = normalize_creative_plan(
            {
                "enabled": True,
                "intensity": "bold",
                "effects": [
                    {"preset": "beat_echo", "start_time": 0.25, "end_time": 2.75},
                ],
            },
            3,
        )
        graph, output_label, receipt = build_creative_filter_complex(plan)

        self.assertIn("split=9", graph)
        self.assertIn("setpts=PTS+0.085/TB", graph)
        self.assertIn("colorchannelmixer=", graph)
        self.assertIn("all_mode=difference", graph)
        self.assertIn("alphamerge", graph)
        self.assertIn("overlay=", graph)
        self.assertEqual(output_label, "creative_0")
        self.assertEqual(receipt[0]["preset"], "beat_echo")

    def test_signature_pack_renders_video_and_keeps_audio_mappable(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = os.path.join(temp_dir, "source.mp4")
            output_path = os.path.join(temp_dir, "creative.mp4")
            subprocess.run(
                [
                    "ffmpeg", "-v", "error",
                    "-f", "lavfi", "-i", "testsrc2=s=320x568:r=24:d=3",
                    "-f", "lavfi", "-i", "sine=frequency=620:duration=3",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", "-y", source_path,
                ],
                check=True,
            )
            plan = normalize_creative_plan(
                {
                    "enabled": True,
                    "intensity": "bold",
                    "effects": [
                        {"preset": "beat_echo", "start_time": 0, "end_time": 1.5},
                        {"preset": "tracked_reveal", "start_time": 1.5, "end_time": 3},
                    ],
                },
                3,
            )
            graph, output_label, _ = build_creative_filter_complex(plan)
            subprocess.run(
                [
                    "ffmpeg", "-v", "error", "-i", source_path,
                    "-filter_complex", graph,
                    "-map", f"[{output_label}]", "-map", "0:a?",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-c:a", "copy", "-shortest", "-y", output_path,
                ],
                check=True,
            )
            probe = subprocess.run(
                [
                    "ffprobe", "-v", "error", "-show_entries",
                    "format=duration:stream=codec_type", "-of", "json", output_path,
                ],
                check=True,
                text=True,
                capture_output=True,
            )
            media = json.loads(probe.stdout)
            self.assertAlmostEqual(float(media["format"]["duration"]), 3.0, delta=0.15)
            self.assertEqual({stream["codec_type"] for stream in media["streams"]}, {"video", "audio"})


if __name__ == "__main__":
    unittest.main()
