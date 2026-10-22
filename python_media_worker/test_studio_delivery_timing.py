"""Ensure a complete audio track cannot conceal a truncated picture stream."""
import ast
import asyncio
import json
import shutil
import tempfile
from pathlib import Path
import re
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


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


class StudioAuthoredDurationRenderTests(unittest.TestCase):
    def test_aac_packet_padding_cannot_extend_the_authored_trim_or_speed_map(self):
        from . import main_media_server as worker
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.mp4"
            delivery = Path(folder) / "final.mp4"
            subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=blue:s=320x180:r=24:d=4",
                "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=22050:duration=4",
                "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest", "-y", str(source),
            ], check=True, capture_output=True)

            async def ingest(_url, destination, **_kwargs):
                shutil.copyfile(source, destination)
                return destination

            def upload(path):
                shutil.copyfile(path, delivery)
                return str(delivery)

            # The deployment check omits output_settings. Explicit 30/60 fps
            # and the sequence/retime paths must use the same authored clock.
            for settings, sequence, speed, duration in [
                (None, False, 1, 2),
                ({"fps": "60"}, False, 1, 2),
                ({"fps": "30"}, True, 1.25, 1.6),
            ]:
                with self.subTest(settings=settings, sequence=sequence, speed=speed):
                    request = worker.RenderViralRequest(
                        video_url="isolated-source", start_time=0, end_time=2,
                        timeline_segments=[worker.ViralTimelineSegment(url="isolated-source", start_time=0, end_time=2)] if sequence else None,
                        preview_speed=speed, output_settings=settings,
                        auto_captions=False, smart_crop=False, professional_cleanup=True,
                        finish_plan={"enabled": True, "color": {"contrast": 1.05},
                                     "visualizer": {"enabled": True, "mode": "wave", "position": "top"}},
                        sound_effects=[{"id": "impact", "builtIn": True, "tone": "impact",
                                        "startTime": .5, "duration": .35, "volume": .15, "enabled": True}],
                        brand_watermark=False,
                    )
                    with patch.object(worker, "materialize_video_input", ingest), \
                         patch.object(worker, "upload_file_to_firebase", upload), \
                         patch("sys.path", [str(Path(__file__).parent), *sys.path]):
                        result = asyncio.run(worker.render_viral_clip_impl(request))
                    self.assertEqual(result["status"], "completed")
                    self.assertEqual(result["final_quality_gate"]["duration"]["expected"], duration)
                    self.assertTrue(result["audio_proof"]["verified"])
                    probe = json.loads(subprocess.check_output([
                        "ffprobe", "-v", "error", "-count_frames", "-show_streams", "-of", "json", str(delivery),
                    ]))
                    video = next(s for s in probe["streams"] if s["codec_type"] == "video")
                    rate = int(settings["fps"]) if settings else 24
                    self.assertEqual(int(video["nb_read_frames"]), round(duration * rate))
                    self.assertAlmostEqual(float(video["duration"]), duration, places=3)


if __name__ == "__main__":
    unittest.main()
