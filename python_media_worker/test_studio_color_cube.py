import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import numpy as np
from studio_color_cube import write_color_cube


class StudioColorCubeTests(unittest.TestCase):
    def test_real_browser_curve_hsl_lut_and_ffmpeg_pixels_match(self):
        source = np.random.default_rng(12).integers(0, 256, (16, 32, 4), dtype=np.uint8)
        source[:, :, 3] = 255
        module = Path(__file__).resolve().parents[1] / "frontend/src/components/studioColorCube.js"
        script = """const fs=require('fs');(async()=>{
          const m=await import('data:text/javascript;base64,'+fs.readFileSync(process.argv[1]).toString('base64'));
          const p=new Uint8ClampedArray(JSON.parse(fs.readFileSync(0,'utf8')));
          const lut={size:2,data:[0,0,.05, .95,.02,0, 0,.95,.05, 1,1,.05, .05,0,1, .9,.05,1, 0,1,1, 1,.98,.95]};
          const cube=m.buildAdvancedColorCube({curve:{shadows:12,midtones:-5,highlights:4},hsl:{hue:5,saturation:7,luminance:2},lutData:lut,lutIntensity:35});
          m.applyColorCube(p,cube);process.stdout.write(JSON.stringify({cube,pixels:[...p]}));})();"""
        browser = json.loads(subprocess.run(["node", "-e", script, str(module)],
            input=json.dumps(source.flatten().tolist()).encode(), capture_output=True, check=True).stdout)
        with tempfile.TemporaryDirectory(prefix="studio-cube-pixels-") as temp:
            path = write_color_cube(browser["cube"], Path(temp)/"grade.cube")
            result = subprocess.run(["ffmpeg", "-v", "error", "-f", "rawvideo", "-pixel_format", "rgba",
                "-video_size", "32x16", "-i", "pipe:0", "-vf", f"lut3d=file='{path}':interp=trilinear",
                "-filter_threads", "1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
                input=source.tobytes(), capture_output=True, check=True).stdout
        delta = np.abs(np.array(browser["pixels"])-np.frombuffer(result, np.uint8).astype(int))
        self.assertLessEqual(delta.max(), 1)
        self.assertLess(delta.mean(), .8)

    def test_invalid_cube_rejected_without_creating_output(self):
        with tempfile.TemporaryDirectory(prefix="studio-invalid-cube-") as temp:
            path = Path(temp)/"invalid.cube"
            for cube in [{"size": 1000, "data": []}, {"size": 2, "data": [float("nan")]*24},
                         {"size": 2, "data": [2]*24}, {"size": 2, "data": [0]*3}]:
                with self.assertRaises(ValueError):
                    write_color_cube(cube, path)
                self.assertFalse(path.exists())


if __name__ == "__main__":
    unittest.main()
