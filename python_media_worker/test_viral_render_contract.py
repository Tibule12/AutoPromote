import json
import os
import subprocess
import tempfile
import unittest

from python_media_worker.viral_render_contract import (
    build_caption_override_transcript,
    build_speed_filter_complex,
    map_timeline_time,
    normalize_speed_plan,
    resolve_caption_layout,
    speed_plan_output_duration,
)


class ViralRenderContractTests(unittest.TestCase):
    def test_normalizes_speed_segments_and_fills_timeline_gaps(self):
        plan = normalize_speed_plan(
            10,
            [
                {"start_time": 2, "end_time": 5, "rate": 1.5},
                {"start_time": 7, "end_time": 10, "rate": 0.75},
            ],
        )

        self.assertEqual(
            plan,
            [
                {"start_time": 0.0, "end_time": 2.0, "rate": 1.0},
                {"start_time": 2.0, "end_time": 5.0, "rate": 1.5},
                {"start_time": 5.0, "end_time": 7.0, "rate": 1.0},
                {"start_time": 7.0, "end_time": 10.0, "rate": 0.75},
            ],
        )
        self.assertAlmostEqual(speed_plan_output_duration(plan), 10.0)
        self.assertAlmostEqual(map_timeline_time(plan, 5), 4.0)

    def test_builds_pitch_preserving_video_and_audio_filter(self):
        plan = normalize_speed_plan(6, preview_speed=1.5)
        filter_complex = build_speed_filter_complex(plan, has_audio=True)

        self.assertIn("setpts=(PTS-STARTPTS)/1.500000", filter_complex)
        self.assertIn("atempo=1.500000", filter_complex)
        self.assertIn("[v_speed]", filter_complex)
        self.assertIn("[a_speed]", filter_complex)

    def test_resolves_caption_position_scale_and_exact_copy(self):
        style = resolve_caption_layout(
            "center",
            1.2,
            {"fontsize": 50, "alignment": 2, "margin_v": 120},
        )
        transcript = build_caption_override_transcript("Say this exactly", 3)

        self.assertEqual(style["alignment"], 5)
        self.assertEqual(style["margin_v"], 0)
        self.assertEqual(style["fontsize"], 60)
        self.assertEqual(transcript["segments"][0]["text"], "Say this exactly")
        self.assertEqual(len(transcript["segments"][0]["words"]), 3)
        self.assertAlmostEqual(transcript["segments"][0]["words"][-1]["end"], 3.0)

    def test_ffmpeg_speed_filter_preserves_audio_and_changes_duration(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = os.path.join(temp_dir, "source.mp4")
            output_path = os.path.join(temp_dir, "speed.mp4")
            subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=c=blue:s=320x240:d=3",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=880:duration=3",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-shortest",
                    "-y",
                    source_path,
                ],
                check=True,
            )
            plan = normalize_speed_plan(3, preview_speed=1.5)
            subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-i",
                    source_path,
                    "-filter_complex",
                    build_speed_filter_complex(plan, has_audio=True),
                    "-map",
                    "[v_speed]",
                    "-map",
                    "[a_speed]",
                    "-c:v",
                    "libx264",
                    "-c:a",
                    "aac",
                    "-shortest",
                    "-y",
                    output_path,
                ],
                check=True,
            )
            probe = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration:stream=codec_type",
                    "-of",
                    "json",
                    output_path,
                ],
                check=True,
                text=True,
                capture_output=True,
            )
            media = json.loads(probe.stdout)

            self.assertAlmostEqual(float(media["format"]["duration"]), 2.0, delta=0.12)
            self.assertIn("audio", {stream["codec_type"] for stream in media["streams"]})


if __name__ == "__main__":
    unittest.main()
