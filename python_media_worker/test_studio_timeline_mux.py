"""Real NVENC replay of buffered picture loss in Studio intermediate muxing.

Run on the GPU worker with STUDIO_REQUIRE_NVENC=1. Without a GPU, the actual
encoder test skips rather than substituting CPU evidence for the failure.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

try:
    from .viral_render_contract import build_studio_timeline_mux_args
except ImportError:
    from viral_render_contract import build_studio_timeline_mux_args


class StudioTimelineMuxTests(unittest.TestCase):
    def test_invalid_clock_is_rejected(self):
        for duration in [0, -1, float("nan"), float("inf")]:
            with self.subTest(duration=duration), self.assertRaises(ValueError):
                build_studio_timeline_mux_args(duration)

    def test_nvenc_reordered_tail_survives_audio_mux_and_delivery_resampling(self):
        def run(args):
            return subprocess.run(["ffmpeg", "-v", "error", *args],
                                  capture_output=True, timeout=60, check=True)

        try:
            run(["-f", "lavfi", "-i", "color=red:s=320x180:r=30:d=0.2",
                 "-c:v", "h264_nvenc", "-f", "null", "-"])
        except subprocess.CalledProcessError as error:
            if os.getenv("STUDIO_REQUIRE_NVENC") == "1":
                self.fail(f"Required NVIDIA encoder unavailable: {error.stderr.decode()[-500:]}")
            self.skipTest("Actual NVENC encoder is unavailable on this runtime")

        def probe(file):
            result = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
                "stream=codec_type,duration,nb_frames", "-of", "json", str(file)], timeout=30)
            return {stream["codec_type"]: stream for stream in json.loads(result)["streams"]}

        with tempfile.TemporaryDirectory(prefix="studio-nvenc-tail-") as folder:
            root = Path(folder)
            source, picture = root / "source.mp4", root / "picture.mp4"
            run(["-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=6.033333",
                 "-f", "lavfi", "-i", "sine=frequency=700:sample_rate=44100:duration=6.023",
                 "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-y", str(source)])
            run(["-i", str(source), "-map", "0:v", "-an", "-c:v", "h264_nvenc",
                 "-preset", "p4", "-rc", "vbr", "-cq", "19", "-b:v", "0", "-y", str(picture)])
            original = probe(picture)["video"]
            self.assertEqual(int(original["nb_frames"]), 181)
            results = {}
            for name, arguments in [("previous", ["-shortest"]),
                                    ("corrected", build_studio_timeline_mux_args(6.023))]:
                target = root / f"{name}.mp4"
                run(["-i", str(picture), "-i", str(source), "-map", "0:v", "-map", "1:a",
                     "-c", "copy", *arguments, "-y", str(target)])
                results[name] = probe(target)
            self.assertLess(int(results["previous"]["video"]["nb_frames"]), 180,
                            "The replay must actually reproduce the old buffered tail loss")
            self.assertEqual(results["corrected"]["video"]["nb_frames"], original["nb_frames"])
            self.assertEqual(results["corrected"]["audio"], probe(source)["audio"])
            delivery = root / "delivery.mp4"
            run(["-i", str(root / "corrected.mp4"), "-vf", "fps=24,trim=duration=6",
                 "-af", "atrim=duration=6", "-c:v", "h264_nvenc", "-c:a", "aac", "-y", str(delivery)])
            final = probe(delivery)
            self.assertEqual(int(final["video"]["nb_frames"]), 144)
            self.assertEqual(float(final["video"]["duration"]), 6)
            run(["-xerror", "-err_detect", "explode", "-i", str(delivery), "-f", "null", "-"])
            print(json.dumps({"encoder": "h264_nvenc", "replay": results, "delivery": final}))


if __name__ == "__main__":
    unittest.main()
