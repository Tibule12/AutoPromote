"""Actual decoded source geometry through the shared normalizer."""
import pathlib
import subprocess
import tempfile
import unittest

from model_workers.common import normalize


class CpuSourceDetailTest(unittest.TestCase):
    def check_source(self, dimensions, bounds, expected):
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory) / "source.mp4"
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
                f"testsrc2=size={dimensions}:rate=30", "-t", "0.3", "-c:v", "libx264",
                "-threads", "1", "-preset", "ultrafast", str(source)], check=True)
            _, geometry = normalize(source, {"sourceRange": {"startTick": 0, "endTick": 22500}},
                pathlib.Path(directory) / "normalized.mp4", max_size=bounds)
            self.assertEqual((geometry["width"], geometry["height"]), expected)
            self.assertEqual(int(geometry["nb_read_frames"]), 6)
            self.assertEqual(geometry["avg_frame_rate"], "24/1")

    def test_native_cpu_retains_1080_detail(self):
        self.check_source("1920x1080", (1920, 1080), (1920, 1080))

    def test_proxy_default_remains_bounded(self):
        self.check_source("1920x1080", (1280, 720), (1280, 720))

    def test_native_cpu_does_not_enlarge_small_sources(self):
        self.check_source("640x360", (1920, 1080), (640, 360))

    def test_native_cpu_preserves_portrait_aspect(self):
        self.check_source("720x1280", (1920, 1080), (608, 1080))


if __name__ == "__main__":
    unittest.main()
