import subprocess
import unittest
from python_media_worker.main_media_server import build_reviewed_reframe_filter, reviewed_axis_expression


class SourceCutRenderTests(unittest.TestCase):
    def test_full_three_minute_path_does_not_exceed_ffmpeg_expression_depth(self):
        keys = [{"time": i/2, "x": (i % 10)*10, "y": 50, "cut": i % 7 == 0} for i in range(360)]
        graph = build_reviewed_reframe_filter(keys, 100, 180)
        result = subprocess.run(["ffmpeg", "-v", "error", "-filter_threads", "1", "-f", "lavfi", "-i",
            "testsrc2=s=320x180:r=1:d=1", "-vf", graph, "-f", "null", "-"], capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr.decode()[-2000:])

    def test_real_ffmpeg_cut_is_instant_not_a_pan(self):
        keys = [{"time": 0, "x": 0, "y": 50}, {"time": .5, "x": 100, "y": 50, "cut": True}]
        filters = [build_reviewed_reframe_filter(keys, 100, 180),
            f"crop=100:180:x='(iw-ow)*({reviewed_axis_expression(keys, 'x')})':y=0"]
        for graph in filters:
            with self.subTest(graph=graph):
                result = subprocess.run(["ffmpeg", "-v", "error", "-filter_threads", "1", "-f", "lavfi", "-i",
                    "color=c=red:s=320x180:r=30:d=1,drawbox=x=160:y=0:w=160:h=180:color=blue:t=fill",
                    "-vf", graph, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr.decode())
                frames = [result.stdout[i:i+100*180*3] for i in range(0, len(result.stdout), 100*180*3)]
                self.assertEqual(len(frames), 30)
                self.assertEqual(frames[0], frames[14], "Must not pan toward the next shot")
                self.assertGreater(frames[14][0], 200)
                self.assertLess(frames[14][2], 10)
                self.assertGreater(frames[15][2], 200)
                self.assertLess(frames[15][0], 10)
