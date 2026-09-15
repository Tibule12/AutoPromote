"""Execute the real filter builder with synthetic pixels; no final render or services."""
import ast
import math
from pathlib import Path
import re
import subprocess
import unittest


source = Path(__file__).with_name("main_media_server.py")
tree = ast.parse(source.read_text())
namespace = {"math": math, "re": re, "clamp_float": lambda value, lo, hi: max(lo, min(hi, value))}
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
             and node.name in {"build_multicam_layout_filter", "build_studio_camera_timeline", "build_studio_multicam_command", "build_reviewed_reframe_filter", "reviewed_axis_expression", "build_safe_vertical_fit_filter"}]
exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), "exec"), namespace)
build_filter = namespace["build_multicam_layout_filter"]
build_timeline = namespace["build_studio_camera_timeline"]


class StudioMulticamFilterTests(unittest.TestCase):
    def pixels(self, layout, **options):
        count = {"hero_3": 3, "grid_4": 4}.get(layout, 2)
        graph = build_filter([(160, 120)] * count, 160, 120,
                             {"layout": layout, "cameras": [{} for _ in range(count)], **options})
        command = ["ffmpeg", "-v", "error", "-filter_complex_threads", "1"]
        for color in ["red", "blue", "green", "yellow"][:count]:
            command += ["-f", "lavfi", "-i", f"color=c={color}:s=160x120:r=4:d=1"]
        command += ["-filter_complex", graph, "-map", "[vout]", "-frames:v", "4",
                    "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]
        result = subprocess.run(command, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(len(result.stdout), 160 * 120 * 3 * 4)
        return result.stdout

    def pixel(self, frames, frame, x, y):
        index = (frame * 160 * 120 + y * 160 + x) * 3
        return tuple(frames[index:index + 3])

    def test_all_seven_layouts_execute(self):
        for layout in ["stack_2", "split_2", "pip_2", "active_2", "spotlight_2", "hero_3", "grid_4"]:
            with self.subTest(layout=layout):
                self.pixels(layout)

    def test_reviewed_spotlight_switches_at_mark_not_before(self):
        frames = self.pixels("spotlight_2", speaker_focus_cuts=[{"time": 0.5, "slot": "bottom"}])
        self.assertGreater(self.pixel(frames, 1, 80, 60)[0], 240)
        self.assertGreater(self.pixel(frames, 2, 80, 60)[2], 240)

    def test_active_speaker_swaps_main_and_reaction(self):
        frames = self.pixels("active_2", speaker_focus_cuts=[{"time": 0.5, "slot": "bottom"}])
        self.assertGreater(self.pixel(frames, 1, 40, 80)[0], 240)
        self.assertGreater(self.pixel(frames, 1, 128, 24)[2], 240)
        self.assertGreater(self.pixel(frames, 2, 40, 80)[2], 240)
        self.assertGreater(self.pixel(frames, 2, 128, 24)[0], 240)

    def test_reaction_position_and_size_are_applied(self):
        frames = self.pixels("pip_2", secondary_frame={"x_percent": 20, "y_percent": 80, "size_percent": 40})
        self.assertGreater(self.pixel(frames, 0, 32, 96)[2], 240)
        self.assertGreater(self.pixel(frames, 0, 128, 24)[0], 240)

    def test_side_by_side_is_not_silently_stacked(self):
        frames = self.pixels("split_2")
        self.assertGreater(self.pixel(frames, 0, 35, 60)[0], 240)
        self.assertGreater(self.pixel(frames, 0, 125, 60)[2], 240)

    def test_unknown_layout_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            build_filter([(160, 120)] * 2, multicam_plan={"layout": "made_up", "cameras": [{}, {}]})

    def test_reviewed_path_executes_without_detector_or_smoothing(self):
        graph = namespace["build_reviewed_reframe_filter"](
            [{"time": 0, "x": 0, "y": 50}, {"time": 0.5, "x": 100, "y": 50}], 90, 160)
        result = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
            "testsrc2=s=160x120:r=4:d=1", "-vf", graph, "-f", "null", "-"],
            capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertIn("(iw-ow)", graph)

    def test_fit_full_uses_black_not_video_filler(self):
        graph = namespace["build_safe_vertical_fit_filter"]()
        self.assertIn("color=black", graph)
        self.assertNotIn("blur", graph)
        self.assertNotIn("split", graph)

    def test_retained_ranges_offsets_and_clip_origin_are_shared(self):
        graph, labels, duration = build_timeline(
            [{"offset_seconds": 2, "time_origin_seconds": 10}, {}], [(10, 12), (15, 18)])
        self.assertEqual(duration, 5)
        self.assertEqual(labels, ["[camera_0_timeline]", "[camera_1_timeline]"])
        self.assertIn("trim=start=2.000000:duration=2.000000", graph)
        self.assertIn("trim=start=7.000000:duration=3.000000", graph)
        self.assertIn("trim=start=15.000000:duration=3.000000", graph)
        self.assertEqual(graph.count("concat=n=2:v=1:a=0"), 2)

    def test_multicam_command_keeps_programme_audio_not_camera_audio(self):
        for count in (2, 3, 4):
            command = namespace["build_studio_multicam_command"](
                [f"angle-{i}.mp4" for i in range(count)], "edited-programme.mp4",
                "test-graph", 7.5, "output.mp4", "libx264", "fast")
            mappings = [command[i + 1] for i, arg in enumerate(command) if arg == "-map"]
            self.assertEqual(mappings, ["[vout]", f"{count}:a?"])
            self.assertEqual(command[command.index("-t") + 1], "7.5")
            self.assertEqual(command[command.index("-c:a") + 1], "copy")

    def test_timeline_filter_executes_after_a_removed_section(self):
        timeline, labels, duration = build_timeline([{}, {}], [(0.25, 0.5), (0.75, 1)])
        graph = timeline + ";" + build_filter([(160, 120)] * 2, 160, 120,
                    {"layout": "split_2", "cameras": [{}, {}]}, labels)
        command = ["ffmpeg", "-v", "error", "-filter_complex_threads", "1"]
        for color in ["red", "blue"]:
            command += ["-f", "lavfi", "-i", f"color={color}:s=160x120:r=4:d=1"]
        command += ["-filter_complex", graph, "-map", "[vout]", "-f", "null", "-"]
        result = subprocess.run(command, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(duration, 0.5)


if __name__ == "__main__":
    unittest.main()
