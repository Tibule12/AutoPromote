"""Ensure a complete audio track cannot conceal a truncated picture stream."""
import ast
from pathlib import Path
import re
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


class StudioDeliveryTimingTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).with_name("main_media_server.py")
        tree = ast.parse(source.read_text())
        body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "validate_final_viral_delivery"]
        self.media = {"duration": 20.017, "video": {"codec_name": "h264"}}
        self.stream = {"streams": [{"codec_type": "video", "duration": "20.000", "avg_frame_rate": "30/1"}]}
        self.decode = Mock(return_value=SimpleNamespace(returncode=0, stderr=""))
        self.runtime = {"re": re, "subprocess": SimpleNamespace(run=self.decode, PIPE=subprocess.PIPE),
                        "validate_rendered_media": Mock(return_value=self.media),
                        "probe_media_stream_summary": Mock(return_value=self.stream)}
        exec(compile(ast.Module(body=body, type_ignores=[]), str(source), "exec"), self.runtime)

    def validate(self, **kwargs):
        return self.runtime["validate_final_viral_delivery"]("export.mp4", expected_duration=20, expected_audio=True, **kwargs)

    def test_small_codec_rounding_is_accepted(self):
        self.assertEqual(self.validate()["status"], "passed")

    def test_complete_audio_cannot_hide_half_second_of_missing_video(self):
        self.stream["streams"][0]["duration"] = "19.533333"
        with self.assertRaisesRegex(RuntimeError, "picture ends"):
            self.validate()

    def test_unverifiable_picture_duration_is_rejected(self):
        self.stream["streams"][0]["duration"] = "N/A"
        with self.assertRaisesRegex(RuntimeError, "picture timing"):
            self.validate()

    def test_two_missing_sixty_fps_picture_frames_are_rejected(self):
        self.media['duration'] = 6.0
        self.stream['streams'][0].update(duration='5.966667', avg_frame_rate='60/1')
        with self.assertRaisesRegex(RuntimeError, 'picture ends'):
            self.runtime['validate_final_viral_delivery']('export.mp4', expected_duration=6, expected_audio=True)

    def test_failed_decode_cannot_be_reported_as_no_black_sections(self):
        self.decode.return_value.returncode = 1
        with self.assertRaisesRegex(RuntimeError, "failed to decode"):
            self.validate()

    def test_middle_black_section_is_rejected(self):
        self.decode.return_value.stderr = "black_start:2 black_end:3 black_duration:1"
        with self.assertRaisesRegex(RuntimeError, "unplanned black"):
            self.validate()

    def test_exact_intentional_ident_darkness_is_recorded_and_accepted(self):
        self.decode.return_value.stderr = "black_start:15 black_end:16.2 black_duration:1.2"
        planned = [{"start": 15, "end": 16.25, "reason": "Dedicated ident anticipation"}]
        self.assertEqual(self.validate(planned_black_ranges=planned)["planned_black_ranges"], planned)

    def test_a_longer_black_gap_cannot_hide_inside_the_declared_ident(self):
        self.decode.return_value.stderr = "black_start:15 black_end:17 black_duration:2"
        with self.assertRaisesRegex(RuntimeError, "unplanned black"):
            self.validate(planned_black_ranges=[{"start": 15, "end": 16, "reason": "Ident"}])

    def test_black_elsewhere_still_fails_with_a_declared_ident(self):
        self.decode.return_value.stderr = "black_start:3 black_end:4 black_duration:1"
        with self.assertRaisesRegex(RuntimeError, "unplanned black"):
            self.validate(planned_black_ranges=[{"start": 15, "end": 16, "reason": "Ident"}])

    def test_invalid_or_overbroad_black_exemptions_are_rejected(self):
        for planned in [[{"start": 0, "end": 20, "reason": "Everything"}],
                        [{"start": -1, "end": 1, "reason": "Invalid"}],
                        [{"start": 15, "end": 16, "reason": ""}],
                        [{"start": 15, "end": float("inf"), "reason": "Invalid"}]]:
            with self.subTest(planned=planned), self.assertRaises(ValueError):
                self.validate(planned_black_ranges=planned)


if __name__ == "__main__":
    unittest.main()
