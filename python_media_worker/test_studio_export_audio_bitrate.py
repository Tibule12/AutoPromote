"""Actual AAC outputs must respond to the existing export bitrate control."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from python_media_worker.viral_audio_remix import render_audio_remix
from python_media_worker.viral_render_contract import resolve_studio_audio_bitrate


class StudioExportAudioBitrateTests(unittest.TestCase):
    def test_legacy_defaults_and_unsupported_values(self):
        self.assertEqual(resolve_studio_audio_bitrate(None), "160k")
        self.assertEqual(resolve_studio_audio_bitrate({}, studio_remix=True), "256k")
        for value in [0, "NaN", "999999", "256k", "256;exec"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                resolve_studio_audio_bitrate({"audioBitrate": value})

    def test_actual_aac_bitrate_changes_with_the_selected_setting(self):
        measured = {}
        with tempfile.TemporaryDirectory(prefix="studio-export-audio-") as folder:
            for requested in [128, 256]:
                target = Path(folder) / f"{requested}.m4a"
                subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                    "anoisesrc=d=3:a=0.1:r=48000:seed=42,pan=stereo|c0=c0|c1=c0",
                    "-c:a", "aac", "-b:a", resolve_studio_audio_bitrate({"audioBitrate": str(requested)}),
                    "-y", str(target)], capture_output=True, check=True, timeout=30)
                stream = json.loads(subprocess.check_output(["ffprobe", "-v", "error",
                    "-show_entries", "stream=bit_rate,codec_name,channels,sample_rate,duration",
                    "-of", "json", str(target)], timeout=30))["streams"][0]
                measured[requested] = int(stream["bit_rate"])
                self.assertEqual((stream["codec_name"], stream["channels"], stream["sample_rate"]),
                                 ("aac", 2, "48000"))
                self.assertEqual(float(stream["duration"]), 3)
                self.assertLess(abs(measured[requested] - requested * 1000), requested * 1000 * .20)
                subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", str(target),
                    "-f", "null", "-"], capture_output=True, check=True, timeout=30)
        self.assertGreater(measured[256], measured[128] * 1.7)

    def test_master_remix_preserves_requested_delivery_bitrate(self):
        with tempfile.TemporaryDirectory(prefix="studio-master-audio-") as folder:
            source = Path(folder) / "source.mp4"
            subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=s=160x90:r=24:d=4",
                "-f", "lavfi", "-i", "anoisesrc=d=4:a=0.18:r=48000:seed=42,pan=stereo|c0=c0|c1=c0",
                "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-b:a", "320k",
                "-y", str(source),
            ], capture_output=True, check=True, timeout=30)
            measured = {}
            for requested in ("128", "256"):
                target = Path(folder) / f"master-{requested}.mp4"
                receipt = render_audio_remix(
                    source, target, {"enabled": True, "preset": "warm_vocal", "target": "master"},
                    audio_bitrate=resolve_studio_audio_bitrate({"audioBitrate": requested}),
                )
                self.assertEqual(receipt["status"], "applied")
                stream = json.loads(subprocess.check_output([
                    "ffprobe", "-v", "error", "-select_streams", "a:0",
                    "-show_entries", "stream=codec_name,bit_rate", "-of", "json", str(target),
                ], timeout=30))["streams"][0]
                self.assertEqual(stream["codec_name"], "aac")
                measured[requested] = int(stream["bit_rate"])
            self.assertGreater(measured["256"], measured["128"] * 1.5)
