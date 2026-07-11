import asyncio
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

from fastapi import HTTPException

import python_media_worker.main_media_server as worker


class FakeBlob:
    def __init__(self, bucket, name):
        self.bucket = bucket
        self.name = name
        self.metadata = {}
        self.cache_control = None
        self.chunk_size = None
        self.generation = None
        self.size = None

    def upload_from_filename(self, local_path, timeout=None):
        with open(local_path, "rb") as source_file:
            payload = source_file.read()
        self.bucket.objects[self.name] = {
            "payload": payload,
            "metadata": dict(self.metadata or {}),
            "generation": str(self.bucket.next_generation),
        }
        self.bucket.next_generation += 1
        self.reload()

    def reload(self, timeout=None):
        stored = self.bucket.objects[self.name]
        self.metadata = dict(stored["metadata"])
        self.generation = stored["generation"]
        self.size = len(stored["payload"])

    def exists(self, timeout=None):
        return self.name in self.bucket.objects

    def download_to_filename(self, local_path, timeout=None):
        with open(local_path, "wb") as destination_file:
            destination_file.write(self.bucket.objects[self.name]["payload"])

    def delete(self, timeout=None):
        self.bucket.objects.pop(self.name, None)


class FakeBucket:
    def __init__(self):
        self.objects = {}
        self.next_generation = 1

    def blob(self, name):
        return FakeBlob(self, name)

    def list_blobs(self, prefix=None):
        return [self.blob(name) for name in sorted(self.objects) if name.startswith(prefix or "")]


class MulticamCheckpointIntegrationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg is required")
    def test_three_normalized_video_parts_stitch_with_monotonic_duration(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            part_paths = []
            for index, color in enumerate(("red", "green", "blue")):
                part_path = os.path.join(temp_dir, f"part-{index}.mp4")
                subprocess.run(
                    [
                        "ffmpeg",
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-f",
                        "lavfi",
                        "-i",
                        f"color=c={color}:s=320x180:r=30:d=0.5",
                        "-c:v",
                        "libx264",
                        "-pix_fmt",
                        "yuv420p",
                        "-an",
                        "-y",
                        part_path,
                    ],
                    check=True,
                )
                part_paths.append(part_path)

            output_path = os.path.join(temp_dir, "stitched.mp4")
            concat_path = os.path.join(temp_dir, "parts.txt")
            stitch = asyncio.run(
                worker.concat_multicam_video_parts(
                    part_paths,
                    output_path,
                    concat_path,
                    "test-stitch",
                )
            )
            validation = worker.validate_multicam_checkpoint_media(
                output_path,
                1.5,
                "stitched-test",
                expected_width=320,
                expected_height=180,
            )

            self.assertEqual(stitch["part_count"], 3)
            self.assertEqual(stitch["mode"], "stream_copy")
            self.assertTrue(validation["ok"])
            self.assertAlmostEqual(validation["actual_duration_seconds"], 1.5, places=2)

    def test_checkpoint_media_validation_uses_frame_level_duration_and_profile_bounds(self):
        good_summary = {
            "format": {"duration": "300.050"},
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "profile": "High",
                    "pix_fmt": "yuv420p",
                    "width": 1920,
                    "height": 1080,
                    "avg_frame_rate": "30/1",
                    "time_base": "1/15360",
                }
            ],
        }
        with mock.patch.object(worker, "probe_media_stream_summary", return_value=good_summary):
            receipt = worker.validate_multicam_checkpoint_media(
                "/tmp/checkpoint.mp4",
                300.0,
                0,
                expected_width=1920,
                expected_height=1080,
            )
        self.assertTrue(receipt["ok"])

        bad_duration = {**good_summary, "format": {"duration": "300.200"}}
        with mock.patch.object(worker, "probe_media_stream_summary", return_value=bad_duration):
            with self.assertRaises(HTTPException):
                worker.validate_multicam_checkpoint_media(
                    "/tmp/checkpoint.mp4",
                    300.0,
                    0,
                    expected_width=1920,
                    expected_height=1080,
                )

    def test_worker_accepts_44_minutes_and_scales_segment_budget_per_checkpoint(self):
        request = worker.RenderMultiCamRequest(
            sources=[
                {"id": "cam1", "url": "https://example.test/cam1.mp4"},
                {"id": "cam2", "url": "https://example.test/cam2.mp4"},
            ],
            overlap_duration=44 * 60,
        )
        previous_enforce = worker.MULTICAM_ENFORCE_PROD_LIMITS
        previous_qa = worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER
        try:
            worker.MULTICAM_ENFORCE_PROD_LIMITS = True
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = False
            limits = worker.enforce_multicam_production_limits(
                request,
                44 * 60,
                segment_count=900,
            )
        finally:
            worker.MULTICAM_ENFORCE_PROD_LIMITS = previous_enforce
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = previous_qa

        self.assertEqual(limits["checkpoint_seconds"], 300.0)
        self.assertEqual(limits["checkpoint_count"], 9)
        self.assertEqual(limits["max_duration_seconds"], 3 * 60 * 60)
        self.assertEqual(limits["max_segments"], worker.MULTICAM_BETA_MAX_SEGMENTS * 9)

    def test_worker_rejects_total_duration_above_three_hours(self):
        request = worker.RenderMultiCamRequest(
            sources=[
                {"id": "cam1", "url": "https://example.test/cam1.mp4"},
                {"id": "cam2", "url": "https://example.test/cam2.mp4"},
            ],
            overlap_duration=3 * 60 * 60 + 1,
        )
        previous_enforce = worker.MULTICAM_ENFORCE_PROD_LIMITS
        previous_qa = worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER
        try:
            worker.MULTICAM_ENFORCE_PROD_LIMITS = True
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = False
            with self.assertRaises(HTTPException):
                worker.enforce_multicam_production_limits(
                    request,
                    3 * 60 * 60 + 1,
                    segment_count=1,
                )
        finally:
            worker.MULTICAM_ENFORCE_PROD_LIMITS = previous_enforce
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = previous_qa

    def test_checkpoint_upload_restore_integrity_and_scoped_cleanup(self):
        bucket = FakeBucket()
        metadata = {
            "autopromoteJobId": "job-123",
            "planFingerprint": "a" * 64,
            "chunkIndex": 0,
            "expectedDuration": "300.000000",
        }
        storage_path = "temp/multicam-checkpoints/job-123/plan/chunk_0000.mp4"
        other_path = "temp/multicam-checkpoints/job-456/plan/chunk_0000.mp4"

        with tempfile.TemporaryDirectory() as temp_dir, mock.patch.object(
            worker.storage,
            "bucket",
            return_value=bucket,
        ):
            source_path = os.path.join(temp_dir, "source.mp4")
            restored_path = os.path.join(temp_dir, "restored.mp4")
            with open(source_path, "wb") as source_file:
                source_file.write(b"deterministic-checkpoint-payload")

            uploaded = worker.upload_multicam_checkpoint_object(
                source_path,
                storage_path,
                metadata,
                attempts=1,
            )
            worker.upload_multicam_checkpoint_object(
                source_path,
                other_path,
                {**metadata, "autopromoteJobId": "job-456"},
                attempts=1,
            )
            restored = worker.restore_multicam_checkpoint_object(
                storage_path,
                restored_path,
                metadata,
            )

            self.assertEqual(restored["sha256"], uploaded["sha256"])
            with open(restored_path, "rb") as restored_file:
                self.assertEqual(restored_file.read(), b"deterministic-checkpoint-payload")
            self.assertIsNone(
                worker.restore_multicam_checkpoint_object(
                    storage_path,
                    os.path.join(temp_dir, "wrong.mp4"),
                    {**metadata, "planFingerprint": "b" * 64},
                )
            )

            cleanup = worker.delete_multicam_checkpoint_prefix("job-123")
            self.assertEqual(cleanup["deleted"], 1)
            self.assertNotIn(storage_path, bucket.objects)
            self.assertIn(other_path, bucket.objects)


if __name__ == "__main__":
    unittest.main()
