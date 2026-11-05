import subprocess
import asyncio
import math
import tempfile
from pathlib import Path
import unittest
from python_media_worker.main_media_server import build_reviewed_reframe_filter, reviewed_axis_expression, build_studio_sequence_video_filters
from python_media_worker.main_media_server import render_reframe_timeline_sequential
from python_media_worker.main_media_server import build_studio_camera_timeline, build_multicam_layout_filter, build_studio_multicam_command


class SourceCutRenderTests(unittest.TestCase):
    def test_three_camera_fractional_range_retains_all_picture_frames(self):
        import json
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            sources = []
            for index, color in enumerate(("red", "blue", "green")):
                movie = folder / f"camera-{index}.mp4"
                subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color={color}:s=160x90:r=24:d=8",
                    "-an", "-c:v", "libx264", "-threads", "1", "-y", str(movie)], check=True, capture_output=True)
                sources.append(str(movie))
            programme, output = folder / "programme.mp4", folder / "output.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=red:s=160x90:r=24:d=5.25",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=5.257155556", "-c:v", "libx264", "-threads", "1",
                "-c:a", "aac", "-y", str(programme)], check=True, capture_output=True)
            cameras = [{"offset_seconds": 0, "time_origin_seconds": 0} for _ in sources]
            timeline, labels, duration = build_studio_camera_timeline(cameras, [(1.542844444, 6.8)])
            graph = timeline + ";" + build_multicam_layout_filter([(160, 90)] * 3, 90, 160,
                {"layout": "hero_3", "cameras": cameras}, labels)
            command = build_studio_multicam_command(sources, str(programme), graph, duration, str(output), "libx264", "fast")
            self.assertNotIn("-shortest", command)
            subprocess.run(command, check=True, capture_output=True, timeout=30)
            info = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "json", str(output)]))
            # The half-open fractional window includes the picture starting at
            # 5.25s. Keep that last covering frame; final delivery owns rounding.
            expected = math.ceil(duration * 24 - 1e-6)
            self.assertEqual(int(info["streams"][0]["nb_frames"]), expected)
            old_output = folder / "old-shortest.mp4"
            subprocess.run([*command[:-1], "-shortest", str(old_output)], check=True, capture_output=True, timeout=30)
            old = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "json", str(old_output)]))
            self.assertLess(int(old["streams"][0]["nb_frames"]), expected, "The previous mux must reproduce the missing tail")

    def test_real_timed_camera_programme_keeps_exact_cut_frames_and_original_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            source, camera, output = (Path(folder) / name for name in ("source.mp4", "camera.mp4", "final.mp4"))
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=red:s=160x90:r=24:d=2",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-threads", "1",
                "-c:a", "aac", "-shortest", "-y", str(source)], check=True, capture_output=True)
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=blue:s=90x160:r=24:d=2",
                "-c:v", "libx264", "-threads", "1", "-an", "-y", str(camera)], check=True, capture_output=True)
            args = (str(source), str(output), 160, 90, 90, 160, 2,
                [{"time": 0, "mode": "off"}, {"time": .5, "mode": "group_stack"}, {"time": 1.5, "mode": "off"}])
            with self.assertRaisesRegex(ValueError, "verified synchronized programme"):
                asyncio.run(render_reframe_timeline_sequential(*args, programme_fps=24))
            asyncio.run(render_reframe_timeline_sequential(*args, programme_fps=24, multicam_programme_path=str(camera)))
            pixels = subprocess.run(["ffmpeg", "-v", "error", "-i", str(output), "-an", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
                check=True, capture_output=True).stdout
            size = 90 * 160 * 3
            self.assertEqual(len(pixels), 48 * size)
            center = (80 * 90 + 45) * 3
            for frame in (0, 11, 36, 47):
                self.assertGreater(pixels[frame * size + center], 180)
                self.assertLess(pixels[frame * size + center + 2], 50)
            for frame in (12, 24, 35):
                self.assertGreater(pixels[frame * size + center + 2], 180)
                self.assertLess(pixels[frame * size + center], 50)
            def audio(movie):
                return subprocess.run(["ffmpeg", "-v", "error", "-i", str(movie), "-vn", "-f", "s16le", "-"],
                    check=True, capture_output=True).stdout
            self.assertEqual(audio(output), audio(source), "Camera cuts must preserve the programme audio samples")

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

class SequenceSourceFramingTests(unittest.TestCase):
    def test_trimmed_30fps_pan_uses_exact_24fps_delivery_clock(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "gradient.mkv"
            subprocess.run(["ffmpeg", "-v", "error", "-filter_threads", "1", "-f", "lavfi", "-i",
                "nullsrc=s=320x180:r=30:d=2,format=rgb24,geq=r='X*255/W':g='0':b='0'",
                "-c:v", "ffv1", "-y", str(source)], check=True, capture_output=True, timeout=30)
            framing = build_reviewed_reframe_filter([
                {"time": 0, "x": 0, "y": 50}, {"time": .7, "x": 100, "y": 50}], 100, 180)
            old = [framing, "fps=24", "setpts=PTS-STARTPTS"]
            fixed = build_studio_sequence_video_filters(framing, 24, source_framing=True)
            errors = []
            for filters in [old, fixed]:
                raw = subprocess.run(["ffmpeg", "-v", "error", "-filter_threads", "1", "-ss", "0.25",
                    "-i", str(source), "-t", "0.75", "-vf", ",".join(filters),
                    "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], check=True,
                    capture_output=True, timeout=30).stdout
                self.assertEqual(len(raw), 18*100*180*3)
                errors.append(max(abs(raw[(i*180*100+90*100+50)*3] -
                    round((50+220*min(1,(i/24)/.7))*255/320)) for i in range(18)))
            self.assertGreater(errors[0], 2, "Historical order must reproduce the wrong pan clock")
            self.assertLessEqual(errors[1], 2, "Every delivered frame must use its own framing time")

    def test_real_later_occurrence_uses_programme_cut_at_local_zero(self):
        keys = [{"time": 0, "x": 0, "y": 50},
                {"time": .5, "x": 100, "y": 50, "cut": True}]
        graph = build_reviewed_reframe_filter(keys, 100, 180, programme_offset=.5)
        pixels = subprocess.run(["ffmpeg", "-v", "error", "-filter_threads", "1", "-f", "lavfi", "-i",
            "color=c=red:s=320x180:r=24:d=0.125,drawbox=x=160:y=0:w=160:h=180:color=blue:t=fill",
            "-vf", graph, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
            check=True, capture_output=True, timeout=30).stdout
        self.assertEqual(len(pixels), 100*180*3)
        centre=(90*100+50)*3
        self.assertGreater(pixels[centre+2],200)
        self.assertLess(pixels[centre],20)

    def test_source_cover_fills_portrait_without_baked_letterbox(self):
        graph = build_reviewed_reframe_filter([{"time":0,"x":50,"y":50}],100,180)
        pixels = subprocess.run(["ffmpeg", "-v", "error", "-filter_threads", "1", "-f", "lavfi", "-i",
            "color=c=red:s=320x180:r=24:d=0.125", "-vf", graph, "-frames:v", "1",
            "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
            check=True,capture_output=True,timeout=30).stdout
        for x,y in [(50,5),(50,90),(50,175)]:
            self.assertGreater(pixels[(y*100+x)*3],200)
