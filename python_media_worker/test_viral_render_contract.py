import ast
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import asyncio

from python_media_worker.viral_render_contract import (
    build_caption_override_transcript,
    build_edited_caption_transcript,
    build_segment_transition_filters,
    build_speed_filter_complex,
    map_timeline_time,
    normalize_speed_plan,
    remap_caption_transcript_to_speed_plan,
    resolve_caption_layout,
    speed_plan_output_duration,
)

from fastapi import HTTPException
from python_media_worker.main_media_server import (
    RenderViralRequest,
    build_speaker_track_crop_filter,
    render_viral_clip_impl,
)


class ViralRenderContractTests(unittest.TestCase):
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
        )

        self.assertTrue(request.finish_plan["visualizer"]["enabled"])
        self.assertTrue(request.add_music)
        self.assertEqual(request.sound_effects[0].tone, "impact")
        self.assertEqual(request.export_destination, "tiktok")

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
        self.assertTrue(segment["textReviewed"])

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
