"""Real restoration/AAC regression for sample time and mux time agreeing."""
import json
import math
import pathlib
import subprocess
import tempfile
import unittest

try:
    from .studio_audio import build_dialogue_filter
    from .viral_render_contract import build_studio_audio_delivery_filter
except ImportError:
    from studio_audio import build_dialogue_filter
    from viral_render_contract import build_studio_audio_delivery_filter


class StudioAudioDeliveryClockTests(unittest.TestCase):
    def test_invalid_duration_cannot_silently_pad_or_trim_audio(self):
        for value in (0, -1, math.inf, math.nan):
            with self.assertRaises(ValueError):
                build_studio_audio_delivery_filter(value)

    def test_restored_two_minute_aac_has_continuous_packets_and_samples(self):
        restoration, _ = build_dialogue_filter({
            "enabled": True, "preset": "natural", "denoise": 22,
            "deEsser": 18, "compressor": 35, "limiter": -1,
            "loudness": -14,
        })
        with tempfile.TemporaryDirectory() as folder:
            output = pathlib.Path(folder) / "restored.m4a"
            subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                "aevalsrc=0.12*sin(2*PI*220*t)+0.03*sin(2*PI*7200*t):s=44100:d=120",
                "-af", restoration + "," + build_studio_audio_delivery_filter(120),
                "-t", "120", "-c:a", "aac", "-b:a", "256k", "-y", str(output),
            ], check=True)
            probe = json.loads(subprocess.check_output([
                "ffprobe", "-v", "error", "-select_streams", "a:0",
                "-show_streams", "-show_packets", "-of", "json", str(output),
            ]))
            stream = probe["streams"][0]
            self.assertEqual(int(stream["sample_rate"]), 48000)
            self.assertAlmostEqual(float(stream["duration"]), 120, places=3)
            self.assertTrue(all(int(p.get("duration", 0)) <= 1024 + 2
                                for p in probe["packets"]))
            pcm = subprocess.check_output([
                "ffmpeg", "-v", "error", "-i", str(output), "-vn", "-ac", "1",
                "-ar", "48000", "-f", "f32le", "-",
            ])
            self.assertLessEqual(abs(len(pcm) // 4 - 120 * 48000), 1024)


if __name__ == "__main__":
    unittest.main()
