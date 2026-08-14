import asyncio
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

import python_media_worker.main_media_server as worker


class ViralClipAudioTests(unittest.TestCase):
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

    def test_viral_render_preserves_and_verifies_source_audio(self):
        with tempfile.TemporaryDirectory() as temp_dir:
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

    def test_viral_render_materializes_remote_source_with_http_fallback_helper(self):
        with tempfile.TemporaryDirectory() as temp_dir:
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


if __name__ == "__main__":
    unittest.main()
