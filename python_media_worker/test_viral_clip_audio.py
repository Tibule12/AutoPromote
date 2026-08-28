import asyncio
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

from fastapi import HTTPException
import python_media_worker.main_media_server as worker


class ViralClipAudioTests(unittest.TestCase):
    def approved_temp_dir(self):
        shared_tmp = os.path.abspath(os.path.join(os.path.dirname(worker.__file__), "../tmp"))
        os.makedirs(shared_tmp, exist_ok=True)
        return tempfile.TemporaryDirectory(dir=shared_tmp)

    def make_source(self, output_path):
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=320x240:d=2",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=880:duration=2",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
                "-y",
                output_path,
            ],
            check=True,
        )

    def test_captioned_render_requires_creator_reviewed_lines(self):
        request = worker.RenderViralRequest(
            video_url="https://example.com/source.mp4",
            start_time=0,
            end_time=10,
            overlays=[],
            auto_captions=True,
        )

        with self.assertRaises(HTTPException) as raised:
            asyncio.run(worker.render_viral_clip_impl(request))

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("Generate and review editable captions", str(raised.exception.detail))

    def test_captioned_render_rejects_an_empty_timed_line(self):
        request = worker.RenderViralRequest(
            video_url="https://example.com/source.mp4",
            start_time=0,
            end_time=10,
            overlays=[],
            auto_captions=True,
            caption_segments=[{"start_time": 1, "end_time": 2, "text": "   "}],
        )

        with self.assertRaises(HTTPException) as raised:
            asyncio.run(worker.render_viral_clip_impl(request))

        self.assertEqual(raised.exception.status_code, 400)

    def test_viral_render_preserves_and_verifies_source_audio(self):
        with self.approved_temp_dir() as temp_dir:
            source_path = os.path.join(temp_dir, "source.mp4")
            self.make_source(source_path)
            request = worker.RenderViralRequest(
                video_url=source_path,
                start_time=0,
                end_time=1.5,
                overlays=[],
            )

            result = None
            try:
                with mock.patch.object(
                    worker,
                    "upload_file_to_firebase",
                    return_value="https://storage.example.com/viral.mp4",
                ):
                    result = asyncio.run(worker.render_viral_clip_impl(request))

                self.assertEqual(result["status"], "completed")
                self.assertTrue(result["audio_proof"]["expected"])
                self.assertTrue(result["audio_proof"]["verified"])
                self.assertEqual(result["audio_proof"]["codec"], "aac")
                self.assertGreaterEqual(result["audio_proof"]["channels"], 1)
            finally:
                if result:
                    for suffix in ("", "_trimmed.mp4"):
                        candidate = result.get("output_path") if not suffix else os.path.join(
                            os.path.dirname(result["output_path"]),
                            f"{result['job_id']}{suffix}",
                        )
                        if candidate and os.path.exists(candidate):
                            os.remove(candidate)

    def test_sound_effect_mix_preserves_the_exact_requested_duration(self):
        with self.approved_temp_dir() as temp_dir:
            source_path = os.path.join(temp_dir, "source.mp4")
            self.make_source(source_path)
            request = worker.RenderViralRequest(
                video_url=source_path,
                start_time=0,
                end_time=1.5,
                overlays=[],
                sound_effects=[
                    {
                        "id": "impact-proof",
                        "builtIn": True,
                        "tone": "impact",
                        "startTime": 0.5,
                        "duration": 0.25,
                        "volume": 0.08,
                        "enabled": True,
                    }
                ],
            )

            result = None
            try:
                with mock.patch.object(
                    worker,
                    "upload_file_to_firebase",
                    return_value="https://storage.example.com/viral.mp4",
                ):
                    result = asyncio.run(worker.render_viral_clip_impl(request))

                self.assertEqual(result["status"], "completed")
                self.assertAlmostEqual(result["duration"], 1.5, delta=0.02)
                self.assertAlmostEqual(
                    result["audio_proof"]["duration_seconds"],
                    1.5,
                    delta=0.02,
                )
            finally:
                if result and result.get("output_path") and os.path.exists(result["output_path"]):
                    os.remove(result["output_path"])

    def test_viral_render_materializes_remote_source_with_http_fallback_helper(self):
        with self.approved_temp_dir() as temp_dir:
            source_path = os.path.join(temp_dir, "source.mp4")
            self.make_source(source_path)
            request = worker.RenderViralRequest(
                video_url="https://firebasestorage.googleapis.com/source.mp4?token=test",
                start_time=0,
                end_time=1.5,
                overlays=[],
            )

            async def fake_materialize(_url, local_path, **_options):
                shutil.copy(source_path, local_path)
                return local_path

            result = None
            try:
                with (
                    mock.patch.object(
                        worker,
                        "materialize_video_input",
                        side_effect=fake_materialize,
                    ) as materialize,
                    mock.patch.object(
                        worker,
                        "upload_file_to_firebase",
                        return_value="https://storage.example.com/viral.mp4",
                    ),
                ):
                    result = asyncio.run(worker.render_viral_clip_impl(request))

                self.assertEqual(result["status"], "completed")
                materialize.assert_awaited_once_with(
                    request.video_url,
                    mock.ANY,
                    keep_audio=True,
                )
            finally:
                if result and result.get("output_path") and os.path.exists(result["output_path"]):
                    os.remove(result["output_path"])

    def test_motion_sculpture_failure_returns_an_honest_render_error(self):
        with self.approved_temp_dir() as temp_dir:
            source_path = os.path.join(temp_dir, "source.mp4")
            self.make_source(source_path)
            request = worker.RenderViralRequest(
                video_url=source_path,
                start_time=0,
                end_time=1.5,
                overlays=[],
                creative_plan={
                    "enabled": True,
                    "intensity": "unreal",
                    "effects": [
                        {
                            "preset": "motion_sculpture",
                            "intensity": "unreal",
                            "start_time": 0,
                            "end_time": 1.5,
                        }
                    ],
                },
            )

            with (
                mock.patch.object(
                    worker,
                    "render_motion_sculpture",
                    side_effect=RuntimeError("segmentation stage stopped"),
                ),
                mock.patch.object(worker, "upload_file_to_firebase") as upload,
            ):
                with self.assertRaises(HTTPException) as raised:
                    asyncio.run(worker.render_viral_clip_impl(request))

            self.assertIn("no false clean result", str(raised.exception.detail))
            upload.assert_not_called()

    def test_reality_break_low_confidence_returns_an_honest_render_error(self):
        with self.approved_temp_dir() as temp_dir:
            source_path = os.path.join(temp_dir, "source.mp4")
            self.make_source(source_path)
            request = worker.RenderViralRequest(
                video_url=source_path,
                start_time=0,
                end_time=1.5,
                overlays=[],
                creative_plan={
                    "enabled": True,
                    "intensity": "unreal",
                    "effects": [
                        {
                            "preset": "reality_break",
                            "intensity": "unreal",
                            "start_time": 0,
                            "end_time": 1.5,
                        }
                    ],
                },
            )

            with (
                mock.patch.object(
                    worker,
                    "transcribe_captions_with_provider",
                    return_value={"segments": [{"start": 0, "end": 1.5, "text": "unclear speech"}]},
                ),
                mock.patch.object(
                    worker,
                    "build_grounded_scene_brief",
                    side_effect=RuntimeError("understanding confidence is too low"),
                ),
                mock.patch.object(worker, "upload_file_to_firebase") as upload,
            ):
                with self.assertRaises(HTTPException) as raised:
                    asyncio.run(worker.render_viral_clip_impl(request))

            self.assertIn("no false clean result", str(raised.exception.detail))
            upload.assert_not_called()


if __name__ == "__main__":
    unittest.main()
