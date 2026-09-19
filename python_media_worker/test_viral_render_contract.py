import ast
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import unittest
import asyncio
from unittest.mock import AsyncMock, patch

from python_media_worker.viral_render_contract import (
    build_caption_override_transcript,
    build_edited_caption_transcript,
    build_segment_transition_filters,
    build_speed_filter_complex,
    find_uncovered_caption_speech_ranges,
    map_timeline_time,
    normalize_speed_plan,
    remap_caption_transcript_to_speed_plan,
    resolve_caption_layout,
    speed_plan_output_duration,
)

from fastapi import HTTPException
from python_media_worker.main_media_server import (
    RenderViralRequest,
    ViralOverlay,
    apply_manual_reframe_keyframes,
    apply_viral_brand_watermark,
    build_viral_brand_watermark_asset,
    build_studio_adjustment_timeline_filter,
    build_group_stack_filter,
    build_source_split_filter,
    build_reframe_timeline_filter,
    render_reframe_timeline_sequential,
    render_studio_finish_timeline_sequential,
    build_reviewed_reframe_filter,
    build_multicam_layout_filter,
    build_main_video_frame_filter,
    build_speaker_track_crop_filter,
    get_reframe_output_dimensions,
    generate_ass_captions,
    multicam_rounded_card_filter,
    multicam_rounded_mask_path,
    render_viral_clip_impl,
    render_viral_clip,
    resolve_viral_export_profile,
    smooth_positions,
)


class ViralRenderContractTests(unittest.TestCase):
    def test_long_reframe_timeline_renders_bounded_intervals_then_restores_audio(self):
        cuts = [
            {"time": index * 10, "mode": "center" if index in {4, 9} else "speaker_track"}
            for index in range(13)
        ]
        with tempfile.TemporaryDirectory(prefix="bounded-reframe-") as temp_dir, patch(
            "python_media_worker.main_media_server.run_subprocess_async", new_callable=AsyncMock
        ) as run:
            asyncio.run(render_reframe_timeline_sequential(
                "/tmp/source.mp4", str(Path(temp_dir) / "output.mp4"), 640, 360, 180, 320,
                130, cuts,
                split_framing={
                    "top": {"x": 25, "y": 50, "zoom": 3},
                    "bottom": {"x": 75, "y": 50, "zoom": 3},
                },
                solo_keyframes=[{"time": 0, "x": 25, "y": 50, "cut": True}],
                job_id="bounded-proof",
            ))
        self.assertEqual(run.await_count, 14)
        interval_commands = [call.args[0] for call in run.await_args_list[:-1]]
        self.assertTrue(all("-ss" in command and "-t" in command for command in interval_commands))
        self.assertTrue(all("split=13" not in " ".join(command) for command in interval_commands))
        concat_command = run.await_args_list[-1].args[0]
        self.assertEqual(concat_command[1:4], ["-f", "concat", "-safe"])
        self.assertIn("1:a?", concat_command)
        self.assertIn("copy", concat_command)

    def test_caption_review_copy_is_stamped_and_keeps_audio(self):
        with tempfile.TemporaryDirectory(prefix="viral-review-copy-") as temp:
            output = str(Path(temp) / "source.mp4")
            created = subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                "color=c=navy:s=180x320:r=10:d=1", "-f", "lavfi", "-i",
                "sine=frequency=440:duration=1", "-c:v", "libx264", "-c:a", "aac",
                "-shortest", "-y", output,
            ], capture_output=True)
            self.assertEqual(created.returncode, 0, created.stderr.decode())
            receipt = asyncio.run(apply_viral_brand_watermark(
                output, "qa-review-copy", 180, 320,
                {"resolution": "source", "fps": "source", "codec": "h264"},
                caption_review_copy=True,
            ))
            self.assertTrue(receipt["caption_review_copy"])
            self.assertEqual(receipt["status"], "burned_in")
            probed = subprocess.run([
                "ffprobe", "-v", "error", "-show_entries", "stream=codec_type",
                "-of", "csv=p=0", output,
            ], capture_output=True, text=True)
            self.assertEqual(probed.returncode, 0)
            self.assertIn("audio", probed.stdout)

    def test_color_adjustment_timeline_changes_only_its_visible_interval(self):
        graph = build_studio_adjustment_timeline_filter("", [
            {"startTime": 1, "duration": 1, "effects": {
                "color": {"brightness": 1.2, "contrast": 1, "saturation": 1}
            }},
        ], 2)
        result = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=gray:s=64x64:r=10:d=2",
            "-filter_complex_threads", "1", "-filter_complex", graph,
            "-map", "[v_finish]", "-threads", "1", "-pix_fmt", "rgb24",
            "-fps_mode", "passthrough", "-f", "rawvideo", "pipe:1",
        ], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        frame_bytes = 64 * 64 * 3
        self.assertEqual(len(result.stdout), 20 * frame_bytes)
        self.assertGreater(result.stdout[15 * frame_bytes], result.stdout[2 * frame_bytes] + 30)

    def test_long_color_timeline_renders_bounded_intervals_then_restores_audio(self):
        layers = [{"startTime": 170, "duration": 70, "effects": {
            "color": {"brightness": 1.05, "contrast": 1.1, "saturation": .95}
        }}]
        with tempfile.TemporaryDirectory(prefix="bounded-finish-") as temp_dir, patch(
            "python_media_worker.main_media_server.run_subprocess_async", new_callable=AsyncMock
        ) as run, patch(
            "python_media_worker.main_media_server.has_audio_stream", return_value=True
        ):
            asyncio.run(render_studio_finish_timeline_sequential(
                "/tmp/source.mp4", str(Path(temp_dir) / "output.mp4"),
                "eq=brightness=0.01", layers, 600, job_id="bounded-finish-proof",
            ))
        # 600 seconds is deliberately capped at 30-second FFmpeg processes,
        # regardless of how long one grade state remains unchanged.
        self.assertEqual(run.await_count, 22)
        interval_commands = [call.args[0] for call in run.await_args_list[:-1]]
        self.assertTrue(all("-ss" in command and "-t" in command for command in interval_commands))
        self.assertTrue(all(float(command[command.index("-t") + 1]) <= 30 for command in interval_commands))
        self.assertTrue(all("split=3" not in " ".join(command) for command in interval_commands))
        concat_command = run.await_args_list[-1].args[0]
        self.assertEqual(concat_command[1:4], ["-f", "concat", "-safe"])
        self.assertIn("1:a?", concat_command)
        self.assertEqual(concat_command[-7:-5], ["-c:v", "copy"])

    def test_http_render_boundary_forces_branding_even_for_forged_payload(self):
        request = RenderViralRequest(
            video_url="https://example.com/source.mp4", start_time=0, end_time=1,
            brand_watermark=False, brandWatermark=False,
        )
        with patch("python_media_worker.main_media_server.render_viral_clip_impl", new_callable=AsyncMock) as render:
            render.return_value = {"ok": True}
            asyncio.run(render_viral_clip(request))
        self.assertTrue(request.brand_watermark)
        self.assertTrue(request.brandWatermark)

    def test_director_virtual_camera_punch_renders_and_resets_at_master_cut(self):
        graph = build_reframe_timeline_filter(
            640, 360, 180, 320, 3,
            [
                {"time": 0, "mode": "off"},
                {"time": 1, "mode": "off", "zoom": 1.35},
                {"time": 2, "mode": "off", "zoom": 1},
            ],
        )
        result = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
            "testsrc2=s=640x360:r=5:d=3", "-filter_complex_threads", "1",
            "-filter_complex", graph, "-map", "[vout]", "-threads", "1",
            "-pix_fmt", "rgb24", "-fps_mode", "passthrough", "-f", "rawvideo", "pipe:1",
        ], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        frame_bytes = 180 * 320 * 3
        self.assertEqual(len(result.stdout), 15 * frame_bytes)
        # A safe-fit master has black corners; the punch enlarges the programme.
        def nonblack(frame_index):
            frame = result.stdout[frame_index * frame_bytes:(frame_index + 1) * frame_bytes]
            return sum(any(frame[index:index + 3]) for index in range(0, len(frame), 3))
        self.assertGreater(nonblack(7), nonblack(2))
        self.assertEqual(nonblack(2), nonblack(12))

    def test_single_show_everyone_timeline_segment_is_valid_ffmpeg(self):
        graph = build_reframe_timeline_filter(
            640, 360, 180, 320, 1,
            [{"time": 0, "mode": "center"}],
            split_framing={
                "top": {"x": 25, "y": 50, "zoom": 3},
                "bottom": {"x": 75, "y": 50, "zoom": 3},
            },
        )
        result = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=10:d=1",
            "-filter_complex_threads", "1", "-filter_complex", graph,
            "-map", "[vout]", "-frames:v", "1", "-f", "null", "-",
        ], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode())

    def test_timed_reframe_renders_split_order_and_solo_as_one_sequence(self):
        graph = build_reframe_timeline_filter(
            640,
            360,
            180,
            320,
            2,
            [
                {"time": 0, "mode": "center"},
                {"time": 1.5, "mode": "speaker_track"},
            ],
            split_framing={
                "top": {"x": 25, "y": 50, "zoom": 3},
                "bottom": {"x": 75, "y": 50, "zoom": 3},
            },
            speaker_order_cuts=[{"time": .8, "slot": "bottom"}],
            solo_keyframes=[{"time": 1.5, "x": 72, "y": 50, "cut": True}],
            solo_zoom=1.5,
        )
        result = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
            "color=red:s=640x360:r=10:d=2,drawbox=x=320:y=0:w=320:h=360:color=blue:t=fill",
            "-filter_complex_threads", "1", "-filter_complex", graph,
            "-map", "[vout]", "-threads", "1", "-fps_mode", "passthrough", "-f", "rawvideo",
            "-pix_fmt", "rgb24", "pipe:1",
        ], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode())

        def pixel(frame, y=80):
            offset = (frame * 180 * 320 + y * 180 + 90) * 3
            return tuple(result.stdout[offset:offset + 3])

        self.assertGreater(pixel(2, 80)[0], 200)   # Speaker 1 starts on top.
        self.assertGreater(pixel(2, 240)[2], 200)  # Speaker 2 starts below.
        self.assertGreater(pixel(10, 80)[2], 200)  # The order cut puts Speaker 2 on top.
        self.assertGreater(pixel(10, 240)[0], 200)
        self.assertGreater(pixel(17, 160)[2], 200) # Solo segment follows the right speaker.

    def test_timed_split_rebases_global_panel_keyframes_to_each_segment(self):
        graph = build_reframe_timeline_filter(
            640, 360, 180, 320, 2,
            [{"time": 0, "mode": "speaker_track"}, {"time": 1, "mode": "center"}],
            split_framing={
                "top": {"x": 25, "y": 50, "zoom": 3},
                "bottom": {"x": 75, "y": 50, "zoom": 3, "keyframes": [
                    {"time": 0, "x": 75, "y": 50, "cut": True},
                    {"time": 1.2, "x": 25, "y": 50, "cut": True},
                ]},
            },
            solo_keyframes=[{"time": 0, "x": 25, "y": 50, "cut": True}],
        )
        self.assertIn("0.200000", graph)
        result = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=10:d=2",
            "-filter_complex_threads", "1", "-filter_complex", graph,
            "-map", "[vout]", "-frames:v", "20", "-f", "null", "-",
        ], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode())

    def test_both_split_panels_follow_independent_timed_positions(self):
        graph = build_source_split_filter(640, 360, 180, 320, {
            "top": {"zoom": 3, "keyframes": [{"time": 0, "x": 20, "y": 50}, {"time": .8, "x": 80, "y": 50}]},
            "bottom": {"zoom": 3, "keyframes": [{"time": 0, "x": 80, "y": 50}, {"time": .8, "x": 20, "y": 50}]},
        })
        result = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
            "color=red:s=640x360:r=10:d=1,drawbox=x=320:y=0:w=320:h=360:color=blue:t=fill",
            "-filter_complex_threads", "1", "-filter_complex", graph, "-map", "[vout]",
            "-threads", "1", "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        def pixel(frame, y):
            offset = (frame * 180 * 320 + y * 180 + 90) * 3
            return tuple(result.stdout[offset:offset+3])
        self.assertGreater(pixel(0, 80)[0], 200)  # Top starts on red.
        self.assertGreater(pixel(0, 240)[2], 200)  # Bottom starts on blue.
        self.assertGreater(pixel(8, 80)[2], 200)  # Top follows right.
        self.assertGreater(pixel(8, 240)[0], 200)  # Bottom independently follows left.

    def test_portrait_source_split_and_speaker_zoom_encode(self):
        with tempfile.TemporaryDirectory(prefix="studio-portrait-test-") as temp:
            for style, graph in [
                ("split", build_source_split_filter(640, 360, 180, 320, {
                    "top": {"x": 30, "y": 50, "zoom": 1.2, "keyframes": [
                        {"time": 0, "x": 25, "y": 50}, {"time": .5, "x": 75, "y": 50}]},
                    "bottom": {"x": 80, "y": 20, "zoom": 3, "keyframes": [
                        {"time": 0, "x": 80, "y": 20}, {"time": .5, "x": 20, "y": 20}]},
                })),
                ("track", "[0:v]" + build_reviewed_reframe_filter([
                    {"time": 0, "x": 28, "y": 50}, {"time": 0.5, "x": 72, "y": 40}
                ], 180, 320, zoom=1.5) + "[vout]"),
            ]:
                path = str(Path(temp) / f"{style}.mp4")
                result = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                    "testsrc2=s=640x360:r=10:d=1", "-filter_complex_threads", "1",
                    "-filter_complex", graph, "-map", "[vout]", "-c:v", "libx264",
                    "-threads", "1", "-n", path], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertGreater(Path(path).stat().st_size, 1000)
        self.assertIn("scale=270:480", build_reviewed_reframe_filter(
            [{"time": 0, "x": 30, "y": 50}], 180, 320, 1.5))

    def test_captions_scale_with_canvas_and_keep_lower_safe_margin(self):
        transcript = build_edited_caption_transcript([
            {"start_time": 0, "end_time": 2, "text": "Spelling corrected."}
        ])
        for width, height in [(640, 360), (1080, 1920), (2160, 2160)]:
            ass = generate_ass_captions(transcript, "minimal", width, height)
            style = next(line for line in ass.splitlines() if line.startswith("Style: Default,")).split(",")
            self.assertEqual(int(style[2]), max(12, round(48*width/1080)))
            self.assertEqual(int(style[-2]), round(height*.12))
            self.assertIn("Spelling", ass)
            self.assertIn("corrected.", ass)

    def test_main_video_frame_rounds_the_actual_source_over_a_dark_studio_canvas(self):
        frame_filter = build_main_video_frame_filter(
            {
                "enabled": True,
                "main_frame": {
                    "enabled": True,
                    "shape": "round",
                    "inset": 54,
                    "border_radius": 116,
                },
            },
            1080,
            1920,
            content_crop={"width": 1080, "height": 1748, "x": 0, "y": 86},
        )

        self.assertIn("rounded_972x1812_r116.png", frame_filter)
        self.assertIn("crop=1080:1748:0:86", frame_filter)
        self.assertIn("color=0x030509:t=fill", frame_filter)
        self.assertNotIn("boxblur", frame_filter)
        self.assertIn("[mainframe_fg][mainframe_mask]alphamerge", frame_filter)
        self.assertIn("overlay=54:54:shortest=1", frame_filter)
        self.assertTrue(frame_filter.endswith("[v_main_frame]"))

        small_frame_filter = build_main_video_frame_filter(
            {
                "main_frame": {
                    "enabled": True,
                    "inset": 24,
                    "border_radius": 52,
                    "background": "soft_blur",
                }
            },
            640,
            360,
        )
        self.assertIn("scale=80:45,boxblur=10:2", small_frame_filter)

        percentage_frame_filter = build_main_video_frame_filter(
            {
                "main_frame": {
                    "enabled": True,
                    "inset_percent": 5,
                    "border_radius_percent": 10,
                    "background": "studio_black",
                }
            },
            1080,
            1920,
        )
        self.assertIn("rounded_972x1812_r97.png", percentage_frame_filter)
        self.assertIn("overlay=54:54:shortest=1", percentage_frame_filter)

    def test_rounded_frame_can_fill_canvas_without_forced_margin(self):
        graph = build_main_video_frame_filter({"main_frame": {"enabled": True,
            "inset_percent": 0, "border_radius_percent": 6}}, 1080, 1920)
        self.assertIn("rounded_1080x1920_r65.png", graph)
        self.assertIn("overlay=0:0:shortest=1", graph)
        result = subprocess.run(["ffmpeg", "-v", "error", "-filter_complex_threads", "1",
            "-f", "lavfi", "-i", "color=white:s=1080x1920:r=1:d=1", "-filter_complex", graph,
            "-map", "[v_main_frame]", "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
            capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        def pixel(x, y):
            offset = (y*1080+x)*3
            return result.stdout[offset:offset+3]
        for x, y in [(0, 0), (1079, 0), (0, 1919), (1079, 1919)]:
            self.assertLess(max(pixel(x, y)), 20, "Every corner must be rounded")
        self.assertGreater(min(pixel(0, 960)), 230, "Zero margin must reach the side edge")
        self.assertGreater(min(pixel(540, 0)), 230, "Zero margin must reach the top edge")

    def test_viral_watermark_is_a_transparent_logo_asset_not_boxed_text(self):
        asset_path = build_viral_brand_watermark_asset(1080, 1920)
        self.assertTrue(os.path.exists(asset_path))
        from PIL import Image

        with Image.open(asset_path) as asset:
            self.assertEqual(asset.mode, "RGBA")
            alpha = asset.getchannel("A")
            self.assertEqual(alpha.getpixel((asset.width - 1, asset.height - 1)), 0)
            self.assertGreater(alpha.getbbox()[2], asset.width // 2)

    def test_viral_export_profile_preserves_aspect_and_creator_quality(self):
        vertical = resolve_viral_export_profile(
            {"resolution": "720p", "fps": "60", "codec": "h265", "quality": "master"},
            1080,
            1920,
        )
        self.assertEqual((vertical["width"], vertical["height"]), (720, 1280))
        self.assertEqual(vertical["fps"], 60)
        self.assertEqual(vertical["encoder"], "libx265")
        self.assertEqual(vertical["crf"], 18)

        landscape = resolve_viral_export_profile(
            {"resolution": "1080p", "fps": "source", "codec": "h264", "quality": "high"},
            1280,
            720,
        )
        self.assertEqual((landscape["width"], landscape["height"]), (1920, 1080))
        self.assertIsNone(landscape["fps"])
        self.assertEqual(landscape["crf"], 19)

    def test_caption_coverage_gate_finds_spoken_ranges_missing_from_review(self):
        gaps = find_uncovered_caption_speech_ranges(
            [
                {"start": 0.1, "end": 4.6, "text": "first line"},
                {"start": 8.0, "end": 10.0, "text": "later line"},
            ],
            [(4.8, 5.5), (7.4, 7.9)],
            10.0,
        )

        self.assertEqual(len(gaps), 1)
        self.assertAlmostEqual(gaps[0]["start"], 5.5, places=2)
        self.assertAlmostEqual(gaps[0]["end"], 7.4, places=2)

    def test_round_broll_frame_contract_reaches_the_worker(self):
        overlay = ViralOverlay(
            id="round-pip",
            type="video",
            src="https://example.com/broll.mp4",
            x=74,
            y=24,
            width=42,
            height=23.625,
            bRollMode="pip",
            frameShape="round",
            borderRadius=28,
            mediaFit="cover",
        )

        self.assertEqual(overlay.frameShape, "round")
        self.assertEqual(overlay.borderRadius, 28)
        self.assertEqual(overlay.mediaFit, "cover")

        worker_source = Path(__file__).with_name("main_media_server.py").read_text(
            encoding="utf-8"
        )
        self.assertIn('return "round"', worker_source)
        self.assertIn("multicam_rounded_card_filter(", worker_source)
        self.assertIn('media_fit == "contain"', worker_source)
        self.assertIn('media_fit == "stretch"', worker_source)

        round_filter = multicam_rounded_card_filter(
            "round_input", 180, 100, "round_output", radius=28
        )
        self.assertIn("rounded_180x100_r25.png", round_filter)
        self.assertTrue(
            str(multicam_rounded_mask_path(180, 100, 28)).startswith(
                tempfile.gettempdir()
            )
        )

    def test_speaker_smoothing_does_not_pan_through_a_hard_camera_cut(self):
        positions = [
            (0.0, 0.30, 0.34),
            (0.5, 0.31, 0.34),
            (1.0, 0.32, 0.35),
            (1.5, 0.70, 0.29),
            (2.0, 0.69, 0.28),
            (2.5, 0.68, 0.29),
        ]

        smoothed = smooth_positions(positions, window=5)

        self.assertLess(smoothed[2][1], 0.4)
        self.assertGreater(smoothed[3][1], 0.6)

    def test_vertical_speaker_crop_uses_encoder_safe_even_dimensions(self):
        commands, crop_width, crop_height = build_speaker_track_crop_filter(
            [(0.0, 0.68, 0.42), (0.5, 0.7, 0.43), (1.0, 0.72, 0.44)],
            960,
            540,
            "9:16",
        )

        self.assertEqual(crop_width % 2, 0)
        self.assertEqual(crop_height % 2, 0)
        self.assertGreaterEqual(len(commands), 3)
        first_crop_x = int(commands[0].split("crop x ")[1].split(";")[0])
        face_x = int(0.68 * 960)
        face_position_inside_crop = face_x - first_crop_x
        self.assertGreater(face_position_inside_crop, crop_width * 0.58)

    def test_reframe_supports_editor_delivery_aspects(self):
        self.assertEqual(get_reframe_output_dimensions("9:16"), (1080, 1920))
        self.assertEqual(get_reframe_output_dimensions("4:5"), (1080, 1350))
        self.assertEqual(get_reframe_output_dimensions("1:1"), (1080, 1080))
        self.assertEqual(get_reframe_output_dimensions("16:9"), (1920, 1080))
        self.assertEqual(get_reframe_output_dimensions("bad-value"), (1080, 1920))

    def test_group_stack_uses_two_real_source_crops_and_preview_coordinates(self):
        filter_graph = build_group_stack_filter(
            1920,
            1080,
            1080,
            1920,
            {
                "divider_percent": 50,
                "gap_percent": 0.7,
                "top": {"x": 34, "y": 50, "zoom": 1.45},
                "bottom": {"x": 70, "y": 48, "zoom": 1.35},
            },
        )

        self.assertIn("[0:v]split=2", filter_graph)
        self.assertEqual(filter_graph.count("crop="), 2)
        self.assertIn("vstack=inputs=2", filter_graph)
        self.assertIn("drawbox=x=0", filter_graph)
        self.assertIn("color=white@0.94", filter_graph)
        self.assertTrue(filter_graph.endswith("[vout]"))

    def test_multicam_grid_uses_four_distinct_crops_and_preview_layout(self):
        filter_graph = build_multicam_layout_filter(
            [(1920, 1080), (1920, 1080), (1280, 720), (1080, 1920)],
            1080,
            1920,
            {
                "layout": "grid_4",
                "gap_percent": 0.45,
                "cameras": [
                    {"x": 34, "y": 50, "zoom": 1.0},
                    {"x": 70, "y": 50, "zoom": 1.0},
                    {"x": 50, "y": 45, "zoom": 1.1},
                    {"x": 50, "y": 50, "zoom": 1.0},
                ],
            },
            input_labels=["0:v", "1:v", "2:v", "3:v"],
            output_label="vout",
        )

        self.assertTrue(filter_graph.startswith("[0:v]crop="))
        self.assertEqual(filter_graph.count("crop="), 4)
        scaled_panels = re.findall(r"scale=(\d+):(\d+):flags=lanczos", filter_graph)
        self.assertEqual(len(scaled_panels), 4)
        self.assertTrue(
            all(int(width) % 2 == 0 and int(height) % 2 == 0 for width, height in scaled_panels)
        )
        self.assertIn("xstack=inputs=4", filter_graph)
        self.assertIn("shortest=1", filter_graph)
        self.assertEqual(filter_graph.count("drawbox="), 2)
        self.assertIn("format=yuv420p[vout]", filter_graph)

    def test_multicam_hero_layout_uses_three_camera_panels(self):
        filter_graph = build_multicam_layout_filter(
            [(1920, 1080)] * 3,
            1080,
            1920,
            {
                "layout": "hero_3",
                "cameras": [{"zoom": 1.0}, {"zoom": 1.0}, {"zoom": 1.0}],
            },
        )

        self.assertEqual(filter_graph.count("crop="), 3)
        self.assertIn("xstack=inputs=3", filter_graph)
        self.assertEqual(filter_graph.count("drawbox="), 2)

    def test_manual_reframe_corrections_interpolate_at_render_samples(self):
        corrected = apply_manual_reframe_keyframes(
            [(0.0, 0.2, 0.3), (1.0, 0.3, 0.4), (2.0, 0.4, 0.5)],
            [
                {"time": 0, "x": 20, "y": 30},
                {"time": 2, "x": 80, "y": 50},
            ],
        )

        self.assertAlmostEqual(corrected[1][1], 0.5)
        self.assertAlmostEqual(corrected[1][2], 0.4)

    def test_accepts_complete_studio_finish_audio_and_destination_contract(self):
        request = RenderViralRequest(
            video_url="https://example.com/source.mp4",
            start_time=0,
            end_time=5,
            finish_plan={
                "enabled": True,
                "visualizer": {"enabled": True, "mode": "ring"},
            },
            add_music=True,
            music_url="https://storage.example.com/music.wav",
            music_volume=0.2,
            sound_effects=[
                {
                    "id": "impact-1",
                    "name": "Impact",
                    "builtIn": True,
                    "tone": "impact",
                    "startTime": 1.5,
                    "duration": 0.6,
                }
            ],
            export_destination="tiktok",
            caption_segments=[{
                "start_time": 0,
                "end_time": 1,
                "text": "Creator caption",
                "caption_placement": "custom",
                "caption_accent": "#ff5d8f",
                "caption_x": 93,
                "caption_y": 88,
            }],
        )

        self.assertTrue(request.finish_plan["visualizer"]["enabled"])
        self.assertTrue(request.add_music)
        self.assertEqual(request.sound_effects[0].tone, "impact")
        self.assertEqual(request.export_destination, "tiktok")
        self.assertEqual(request.caption_segments[0].caption_placement, "custom")
        self.assertEqual(request.caption_segments[0].caption_accent, "#ff5d8f")
        self.assertEqual(request.caption_segments[0].caption_x, 93)
        self.assertEqual(request.caption_segments[0].caption_y, 88)

    def test_timeline_audio_render_state_is_not_attached_to_strict_request_models(self):
        worker_source = Path(__file__).with_name("main_media_server.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("segment_audio_paths = []", worker_source)
        self.assertIn("zip(normalized_segments, segment_audio_paths)", worker_source)
        self.assertNotIn("segment.audio_rendered_path =", worker_source)

        request = RenderViralRequest(
            video_url="https://example.com/source.mp4",
            start_time=0,
            end_time=2,
            timeline_segments=[{
                "id": "frontend-timeline-1",
                "url": "https://example.com/source.mp4",
                "start_time": 0,
                "end_time": 2,
                "audioTrimOffsetStart": 0,
                "audioTrimOffsetEnd": 0,
            }],
        )
        self.assertEqual(request.timeline_segments[0].id, "frontend-timeline-1")

    def test_render_refuses_unresolved_broll_planning_placeholder(self):
        request = RenderViralRequest(
            video_url="https://example.com/source.mp4",
            start_time=0,
            end_time=5,
            overlays=[
                {
                    "id": "planned-story-beat",
                    "type": "text",
                    "text": "STORY EVIDENCE",
                    "x": 50,
                    "y": 50,
                    "start_time": 1,
                    "duration": 1.5,
                    "bRollMode": "fullscreen",
                    "bRollPlaceholder": True,
                }
            ],
        )

        with self.assertRaises(HTTPException) as raised:
            asyncio.run(render_viral_clip_impl(request))

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("planning evidence", str(raised.exception.detail))

    def test_viral_renderer_materializes_remote_sources_before_ffmpeg_edits(self):
        worker_source = Path(__file__).with_name("main_media_server.py").read_text(
            encoding="utf-8"
        )
        worker_tree = ast.parse(worker_source)
        render_function = next(
            node
            for node in worker_tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "render_viral_clip_impl"
        )
        materialize_calls = [
            node
            for node in ast.walk(render_function)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "materialize_video_input"
        ]

        self.assertGreaterEqual(len(materialize_calls), 2)
        self.assertTrue(
            all(
                any(keyword.arg == "keep_audio" for keyword in call.keywords)
                for call in materialize_calls
            )
        )

    def test_viral_render_endpoint_keeps_cloud_run_request_alive(self):
        worker_source = Path(__file__).with_name("main_media_server.py").read_text(
            encoding="utf-8"
        )
        worker_tree = ast.parse(worker_source)
        endpoint = next(
            node
            for node in worker_tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "render_viral_clip"
        )
        background_add_task_calls = [
            node
            for node in ast.walk(endpoint)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "add_task"
        ]
        awaited_render_calls = [
            node
            for node in ast.walk(endpoint)
            if isinstance(node, ast.Await)
            and isinstance(node.value, ast.Call)
            and isinstance(node.value.func, ast.Name)
            and node.value.func.id == "render_viral_clip_impl"
        ]

        self.assertEqual(background_add_task_calls, [])
        self.assertGreaterEqual(len(awaited_render_calls), 2)
        self.assertTrue(any(len(node.value.args) >= 2 for node in awaited_render_calls))

    def test_viral_renderer_publishes_real_progress_checkpoints(self):
        worker_source = Path(__file__).with_name("main_media_server.py").read_text(
            encoding="utf-8"
        )
        worker_tree = ast.parse(worker_source)
        render_function = next(
            node
            for node in worker_tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "render_viral_clip_impl"
        )
        progress_values = {
            int(call.args[0].value)
            for call in ast.walk(render_function)
            if isinstance(call, ast.Call)
            and isinstance(call.func, ast.Name)
            and call.func.id == "report_progress"
            and call.args
            and isinstance(call.args[0], ast.Constant)
            and isinstance(call.args[0].value, int)
        }

        self.assertTrue({2, 15, 30, 75, 90, 95}.issubset(progress_values))
        self.assertIn('"progress": 100', worker_source)
        self.assertIn('"detail": "Render complete"', worker_source)

    def test_failed_visual_enhancement_still_reaches_smart_crop(self):
        worker_source = Path(__file__).with_name("main_media_server.py").read_text(
            encoding="utf-8"
        )

        self.assertIn("visual_enhance_applied = False", worker_source)
        self.assertIn("not visual_enhance_applied", worker_source)
        self.assertNotIn("and not request.visual_enhance", worker_source)

    def test_deploy_smoke_source_matches_worker_allowed_tmp(self):
        repo_root = Path(__file__).parents[1]
        worker_source = Path(__file__).with_name("main_media_server.py").read_text(
            encoding="utf-8"
        )
        worker_tree = ast.parse(worker_source)
        materialize_function = next(
            node
            for node in worker_tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "materialize_video_input"
        )
        allowed_assignment = next(
            node
            for node in ast.walk(materialize_function)
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name) and target.id == "allowed_dir"
                for target in node.targets
            )
        )
        allowed_join = next(
            node
            for node in ast.walk(allowed_assignment.value)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "join"
        )
        allowed_suffix = [
            arg.value
            for arg in allowed_join.args
            if isinstance(arg, ast.Constant) and isinstance(arg.value, str)
        ]

        dockerfile = (Path(__file__).parent / "Dockerfile").read_text(
            encoding="utf-8"
        )
        workdir = next(
            line.split(maxsplit=1)[1]
            for line in dockerfile.splitlines()
            if line.startswith("WORKDIR ")
        )
        allowed_dir = os.path.abspath(os.path.join(workdir, *allowed_suffix))
        smoke_dir = os.path.join(allowed_dir, "viral-render-smoke")
        workflow = (
            repo_root / ".github" / "workflows" / "deploy-media-worker.yml"
        ).read_text(encoding="utf-8")

        self.assertEqual(allowed_suffix, ["..", "tmp"])
        self.assertEqual(allowed_dir, "/tmp")
        self.assertIn(
            f"--volume /tmp/viral-render-smoke:{smoke_dir}:ro",
            workflow,
        )
        self.assertIn(
            f'"video_url": "{smoke_dir}/source.mp4"',
            workflow,
        )
        self.assertIn(f"RUN mkdir -p {allowed_dir}", dockerfile)
        self.assertNotIn("/app/tmp/smoke", workflow)

    def test_normalizes_speed_segments_and_fills_timeline_gaps(self):
        plan = normalize_speed_plan(
            10,
            [
                {"start_time": 2, "end_time": 5, "rate": 1.5},
                {"start_time": 7, "end_time": 10, "rate": 0.75},
            ],
        )

        self.assertEqual(
            plan,
            [
                {"start_time": 0.0, "end_time": 2.0, "rate": 1.0},
                {"start_time": 2.0, "end_time": 5.0, "rate": 1.5},
                {"start_time": 5.0, "end_time": 7.0, "rate": 1.0},
                {"start_time": 7.0, "end_time": 10.0, "rate": 0.75},
            ],
        )
        self.assertAlmostEqual(speed_plan_output_duration(plan), 10.0)
        self.assertAlmostEqual(map_timeline_time(plan, 5), 4.0)

    def test_builds_pitch_preserving_video_and_audio_filter(self):
        plan = normalize_speed_plan(6, preview_speed=1.5)
        filter_complex = build_speed_filter_complex(plan, has_audio=True)

        self.assertIn("setpts=(PTS-STARTPTS)/1.500000", filter_complex)
        self.assertIn("atempo=1.500000", filter_complex)
        self.assertIn("[v_speed]", filter_complex)
        self.assertIn("[a_speed]", filter_complex)

    def test_resolves_caption_position_scale_and_exact_copy(self):
        style = resolve_caption_layout(
            "center",
            1.2,
            {"fontsize": 50, "alignment": 2, "margin_v": 120},
        )
        transcript = build_caption_override_transcript("Say this exactly", 3)

        self.assertEqual(style["alignment"], 5)
        self.assertEqual(style["margin_v"], 0)
        self.assertEqual(style["fontsize"], 60)
        self.assertEqual(transcript["segments"][0]["text"], "Say this exactly")

        self.assertEqual(resolve_caption_layout(
            "top_right", 1, {"fontsize": 50, "alignment": 2, "margin_v": 120}
        )["alignment"], 9)
        self.assertEqual(resolve_caption_layout(
            "middle_left", 1, {"fontsize": 50, "alignment": 2, "margin_v": 120}
        )["alignment"], 4)

    def test_preserves_creator_edited_caption_lines_and_timings(self):
        transcript = build_edited_caption_transcript(
            [
                {
                    "id": "zu-en-1",
                    "start_time": 1.2,
                    "end_time": 3.4,
                    "text": "Sawubona, welcome ekhaya",
                    "caption_placement": "middle_left",
                    "caption_icon": "payoff",
                    "caption_accent": "#ff5d8f",
                    "caption_x": 18,
                    "caption_y": 24,
                    "text_review_required": True,
                    "text_reviewed": True,
                }
            ]
        )
        segment = transcript["segments"][0]
        self.assertEqual(segment["text"], "Sawubona, welcome ekhaya")
        self.assertEqual(segment["start"], 1.2)
        self.assertEqual(segment["end"], 3.4)
        self.assertEqual([word["word"] for word in segment["words"]], ["Sawubona,", "welcome", "ekhaya"])
        self.assertEqual(len(transcript["segments"][0]["words"]), 3)
        self.assertAlmostEqual(transcript["segments"][0]["words"][-1]["end"], 3.4)
        self.assertEqual(segment["captionPlacement"], "middle_left")
        self.assertEqual(segment["captionIcon"], "payoff")
        self.assertEqual(segment["captionAccent"], "#ff5d8f")
        self.assertEqual(segment["captionX"], 18)
        self.assertEqual(segment["captionY"], 24)
        self.assertTrue(segment["textReviewed"])

    def test_every_creator_caption_style_honors_custom_line_treatment(self):
        transcript = build_edited_caption_transcript([
            {
                "start_time": 0,
                "end_time": 1,
                "text": "Lisakhanya welcomes Siphamandla",
                "caption_placement": "custom",
                "caption_icon": "payoff",
                "caption_accent": "#ff5d8f",
                "caption_x": 18,
                "caption_y": 24,
            }
        ])
        with tempfile.TemporaryDirectory(prefix="studio-caption-styles-") as temp:
            for style_name in (
                "rainbow", "watch_me", "wall_type", "story_pop", "bold_pop", "karaoke", "glow", "bounce", "minimal",
                "headline", "boxed", "comic", "gradient", "typewriter", "editorial",
                "sticker", "marker", "glass", "newsroom", "luxury", "retro",
            ):
                with self.subTest(style=style_name):
                    ass = generate_ass_captions(transcript, style_name, 1080, 1920)
                    self.assertIn(r"\an7\pos(194,461)\q0", ass)
                    self.assertIn("&H008F5DFF", ass)
                    self.assertIn("⚡", ass)
                    self.assertIn("lisakhanya", ass.lower())
                    ass_path = Path(temp) / f"{style_name}.ass"
                    output_path = Path(temp) / f"{style_name}.png"
                    ass_path.write_text(ass, encoding="utf-8")
                    result = subprocess.run([
                        "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                        "color=0x07101d:s=360x640:r=25:d=1",
                        "-vf", f"ass={ass_path}", "-frames:v", "1", "-threads", "1",
                        "-y", str(output_path),
                    ], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertGreater(output_path.stat().st_size, 1000)

    def test_rainbow_caption_preserves_every_word_colour_and_shoulder_position(self):
        transcript = build_edited_caption_transcript([
            {
                "start_time": 0,
                "end_time": 1.4,
                "text": "captions command the frame",
                "caption_placement": "shoulder_right",
                "caption_icon": "fire",
            }
        ])
        ass = generate_ass_captions(transcript, "rainbow", 1080, 1920)
        self.assertIn(r"\an6\pos(950,1075)\q0", ass)
        self.assertIn("♨", ass)
        for color in ("&H008F5DFF", "&H003DB3FF", "&H0052E6F6", "&H009BF572"):
            self.assertIn(color, ass)

    def test_background_wall_and_watch_me_are_real_render_treatments(self):
        transcript = build_edited_caption_transcript([
            {
                "start_time": 0,
                "end_time": 1,
                "text": "watch me now",
                "caption_placement": "background_left",
                "caption_icon": "eyes",
            }
        ])
        ass = generate_ass_captions(transcript, "watch_me", 1080, 1920)
        self.assertIn(r"\an7\pos(76,346)\q0", ass)
        self.assertIn("👁", ass)
        self.assertIn(r"\alpha&H38&", ass)
        self.assertIn(r"\fscx120", ass)

    def test_custom_caption_ass_burns_into_a_real_video_frame(self):
        transcript = build_edited_caption_transcript([
            {
                "start_time": 0,
                "end_time": 1,
                "text": "Lisakhanya Mdoda",
                "caption_placement": "top_center",
                "caption_icon": "none",
                "caption_accent": "#72f59b",
            }
        ])
        ass = generate_ass_captions(transcript, "headline", 360, 640)
        with tempfile.TemporaryDirectory(prefix="studio-caption-test-") as temp:
            ass_path = Path(temp) / "caption.ass"
            output_path = Path(temp) / "caption.png"
            ass_path.write_text(ass, encoding="utf-8")
            result = subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                "color=0x07101d:s=360x640:r=25:d=1",
                "-vf", f"ass={ass_path}", "-frames:v", "1", "-threads", "1",
                "-y", str(output_path),
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertGreater(output_path.stat().st_size, 1000)

    def test_remaps_reviewed_caption_times_after_speed_changes(self):
        transcript = build_edited_caption_transcript(
            [{"start_time": 2, "end_time": 4, "text": "Ngiyabonga kakhulu"}]
        )
        remapped = remap_caption_transcript_to_speed_plan(
            transcript,
            [{"start_time": 0, "end_time": 6, "rate": 2}],
        )

        segment = remapped["segments"][0]
        self.assertEqual(segment["start"], 1)
        self.assertEqual(segment["end"], 2)
        self.assertEqual(segment["words"][0]["start"], 1)
        self.assertEqual(segment["words"][-1]["end"], 2)

    def test_builds_visual_join_and_audio_safe_edges(self):
        soft = build_segment_transition_filters(
            3,
            transition_in="soft_dip",
            transition_out="energy_flash",
            transition_duration=0.18,
            has_audio=True,
        )
        clean = build_segment_transition_filters(
            3,
            transition_in="clean_cut",
            transition_duration=0.02,
            has_audio=True,
        )

        self.assertIn("color=black", soft["video_filters"][0])
        self.assertIn("color=white", soft["video_filters"][1])
        self.assertEqual(len(soft["audio_filters"]), 2)
        self.assertEqual(clean["video_filters"], [])
        self.assertEqual(len(clean["audio_filters"]), 1)

    def test_ffmpeg_speed_filter_preserves_audio_and_changes_duration(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = os.path.join(temp_dir, "source.mp4")
            output_path = os.path.join(temp_dir, "speed.mp4")
            subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=c=blue:s=320x240:d=3",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=880:duration=3",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-shortest",
                    "-y",
                    source_path,
                ],
                check=True,
            )
            plan = normalize_speed_plan(3, preview_speed=1.5)
            subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-i",
                    source_path,
                    "-filter_complex",
                    build_speed_filter_complex(plan, has_audio=True),
                    "-map",
                    "[v_speed]",
                    "-map",
                    "[a_speed]",
                    "-c:v",
                    "libx264",
                    "-c:a",
                    "aac",
                    "-shortest",
                    "-y",
                    output_path,
                ],
                check=True,
            )
            probe = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration:stream=codec_type",
                    "-of",
                    "json",
                    output_path,
                ],
                check=True,
                text=True,
                capture_output=True,
            )
            media = json.loads(probe.stdout)

            self.assertAlmostEqual(float(media["format"]["duration"]), 2.0, delta=0.12)
            self.assertIn("audio", {stream["codec_type"] for stream in media["streams"]})


if __name__ == "__main__":
    unittest.main()
