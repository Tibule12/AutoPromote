"""Test Studio delivery selection and FFmpeg options without cloud imports."""
import ast
import os
from pathlib import Path
import unittest
from unittest.mock import patch


class StudioNvencExportTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).with_name("main_media_server.py")
        tree = ast.parse(source.read_text())
        names = {"resolve_viral_export_profile", "build_viral_export_encode_args"}
        module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[])
        self.runtime = {"os": os, "GPU_VIDEO_ENCODER": "h264_nvenc"}
        exec(compile(module, str(source), "exec"), self.runtime)
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)

    def profile(self, **options):
        return self.runtime["resolve_viral_export_profile"](options, 1080, 1920)

    def args(self, profile):
        return self.runtime["build_viral_export_encode_args"](profile)

    def test_gpu_h264_keeps_requested_dimensions_and_fps(self):
        profile = self.profile(resolution="720p", fps="60")
        self.assertEqual((profile["width"], profile["height"], profile["fps"]), (720, 1280, 60))
        self.assertEqual(profile["encoder"], "h264_nvenc")
        self.assertEqual(profile["preset"], "p4")

    def test_gpu_quality_tiers_use_nvenc_options_without_crf(self):
        for quality, cq in [("draft", 27), ("balanced", 23), ("high", 19), ("master", 16)]:
            with self.subTest(quality=quality):
                args = self.args(self.profile(quality=quality))
                self.assertNotIn("-crf", args)
                self.assertEqual(args[args.index("-cq") + 1], str(cq))
                self.assertEqual(args[args.index("-rc") + 1], "vbr")
                self.assertEqual(args[args.index("-b:v") + 1], "0")
                self.assertEqual(args[args.index("-pix_fmt") + 1], "yuv420p")

    def test_cpu_worker_retains_existing_h264_contract(self):
        self.runtime["GPU_VIDEO_ENCODER"] = "libx264"
        profile = self.profile(quality="high")
        self.assertEqual(profile["encoder"], "libx264")
        self.assertEqual(profile["preset"], "veryfast")
        self.assertIn("-crf", self.args(profile))

    def test_explicit_cpu_export_remains_available_on_gpu_host(self):
        with patch.dict(os.environ, {"VIRAL_EXPORT_ENCODER": "cpu"}):
            self.assertEqual(self.profile()["encoder"], "libx264")

    def test_unprobed_hevc_keeps_existing_cpu_encoder_and_tag(self):
        profile = self.profile(codec="h265")
        self.assertEqual(profile["encoder"], "libx265")
        self.assertEqual(self.args(profile)[-2:], ["-tag:v", "hvc1"])

    def test_required_nvenc_fails_when_probe_is_unavailable(self):
        self.runtime["GPU_VIDEO_ENCODER"] = "libx264"
        with patch.dict(os.environ, {"VIRAL_EXPORT_ENCODER": "nvenc"}):
            with self.assertRaisesRegex(RuntimeError, "GPU encoder probe failed"):
                self.profile()


if __name__ == "__main__":
    unittest.main()
