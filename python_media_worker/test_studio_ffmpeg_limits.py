import os
import subprocess
import unittest
from unittest.mock import patch

from python_media_worker.studio_ffmpeg_limits import bounded_studio_ffmpeg_command


class StudioFfmpegLimitsTests(unittest.TestCase):
    def test_unconfigured_command_is_unchanged(self):
        command = ["ffmpeg", "-i", "input.mp4", "output.mp4"]
        with patch.dict(os.environ, {"MEDIA_WORKER_STUDIO_FFMPEG_THREADS": ""}):
            self.assertEqual(bounded_studio_ffmpeg_command(command), command)

    def test_each_input_and_output_have_explicit_budgets(self):
        command = ["ffmpeg", "-i", "a.mov", "-itsoffset", "3.5", "-i", "b.mov", "-c:v", "libx264", "out.mp4"]
        with patch.dict(os.environ, {"MEDIA_WORKER_STUDIO_FFMPEG_THREADS": "2"}):
            result = bounded_studio_ffmpeg_command(command)
        for index, value in enumerate(result):
            if value == "-i":
                self.assertEqual(result[index - 2:index], ["-threads", "1"])
        self.assertEqual(result[-3:], ["-threads", "2", "out.mp4"])
        self.assertIn("-filter_complex_threads", result)
        self.assertIn("3.5", result)

    def test_invalid_budgets_fail_before_dispatch(self):
        for value in ["0", "9", "-1", "2.5", "auto"]:
            with self.subTest(value=value), patch.dict(os.environ, {"MEDIA_WORKER_STUDIO_FFMPEG_THREADS": value}):
                with self.assertRaises(ValueError):
                    bounded_studio_ffmpeg_command(["ffmpeg", "-i", "input", "output"])

    def test_actual_overlay_pixels_and_clock_are_unchanged(self):
        command = ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=navy:s=96x64:r=24:d=0.5",
                   "-f", "lavfi", "-i", "color=c=gold:s=24x16:r=24:d=0.5",
                   "-filter_complex", "[0:v][1:v]overlay=x=12+24*t:y=16:shortest=1,format=rgb24[v]",
                   "-map", "[v]", "-c:v", "rawvideo", "-threads", "1", "-f", "framemd5", "-"]
        # This is an actual FFmpeg fixture, not native Studio qualification.
        baseline = subprocess.check_output(command, stderr=subprocess.PIPE)
        with patch.dict(os.environ, {"MEDIA_WORKER_STUDIO_FFMPEG_THREADS": "2"}):
            limited = subprocess.check_output(bounded_studio_ffmpeg_command(command), stderr=subprocess.PIPE)
        self.assertEqual(baseline, limited)
        self.assertEqual(len([line for line in limited.splitlines() if not line.startswith(b"#")]), 12)
