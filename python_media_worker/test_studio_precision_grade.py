import json
from pathlib import Path
import subprocess
import unittest
import numpy as np
from studio_precision_grade import build_precision_grade_filter


class PrecisionGradeTests(unittest.TestCase):
    def test_browser_and_ffmpeg_rgb_transfer_agree(self):
        source = np.random.default_rng(7).integers(0, 256, (16, 32, 4), dtype=np.uint8)
        source[:, :, 3] = 255
        module = Path(__file__).resolve().parents[1] / "frontend/src/components/studioPrecisionGrade.js"
        javascript = """const fs=require('fs');(async()=>{
          const m=await import('data:text/javascript;base64,'+fs.readFileSync(process.argv[1]).toString('base64'));
          const d=JSON.parse(fs.readFileSync(0,'utf8'));const p=new Uint8ClampedArray(d.pixels);
          m.applyPrecisionGrade(p,m.buildPrecisionGrade(d.fx));process.stdout.write(Buffer.from(p));})();"""
        for fx in [{}, {"exposureStops": .3, "lift": .01, "gamma": 1.1, "gain": .93,
                        "temperature": -.2, "tint": .1, "contrast": 1.07, "saturation": .85},
                   {"exposureStops": -.2, "lift": -.015, "gamma": .95, "saturation": 1.25}]:
            with self.subTest(fx=fx):
                browser = subprocess.run(["node", "-e", javascript, str(module)],
                    input=json.dumps({"fx": fx, "pixels": source.flatten().tolist()}).encode(),
                    capture_output=True, check=True).stdout
                result = subprocess.run(["ffmpeg", "-v", "error", "-f", "rawvideo", "-pixel_format", "rgba",
                    "-video_size", "32x16", "-i", "pipe:0", "-vf", build_precision_grade_filter(fx),
                    "-filter_threads", "1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
                    input=source.tobytes(), capture_output=True, check=True).stdout
                delta = np.abs(np.frombuffer(browser, np.uint8).astype(int)-np.frombuffer(result, np.uint8).astype(int))
                self.assertLessEqual(delta.max(), 3)
                self.assertLess(delta.mean(), 1.1)

    def test_worker_uses_precision_instead_of_legacy_eq(self):
        from python_media_worker.main_media_server import build_studio_finish_filter
        graph = build_studio_finish_filter({"enabled": True, "color": {"precisionGrade": True, "temperature": .3},
            "keyframes": [{"time": 0, "values": {"brightness": .8}}, {"time": 2, "values": {"brightness": 1.2}}]})
        self.assertIn("lutrgb=", graph)
        self.assertNotIn("eq=", graph)
        self.assertNotIn("colorbalance=", graph)


if __name__ == "__main__":
    unittest.main()
