import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock


def _load_runner_with_fake_worker():
    fake_worker = types.ModuleType("main_media_server")
    runner_path = Path(__file__).with_name("multicam_job_runner.py")
    spec = importlib.util.spec_from_file_location("_multicam_job_runner_retry_test", runner_path)
    runner = importlib.util.module_from_spec(spec)

    previous_worker = sys.modules.get("main_media_server")
    sys.modules["main_media_server"] = fake_worker
    try:
        spec.loader.exec_module(runner)
    finally:
        if previous_worker is None:
            sys.modules.pop("main_media_server", None)
        else:
            sys.modules["main_media_server"] = previous_worker
    return runner, fake_worker


runner, fake_worker = _load_runner_with_fake_worker()


class FakeRenderMultiCamRequest:
    def __init__(self, **values):
        self.__dict__.update(values)


class MulticamJobRunnerRetryTests(unittest.TestCase):
    def setUp(self):
        fake_worker.FIREBASE_STATUS_UPDATES_ENABLED = True
        fake_worker.logger = mock.Mock()
        fake_worker.RenderMultiCamRequest = FakeRenderMultiCamRequest
        fake_worker.update_firestore_job = mock.Mock(return_value=True)

        document_ref = object()
        collection = mock.Mock()
        collection.document.return_value = document_ref
        database = mock.Mock()
        database.collection.return_value = collection
        fake_worker.firestore = types.SimpleNamespace(
            client=mock.Mock(return_value=database),
        )
        self.document_ref = document_ref
        self.job = {
            "multicamRequest": {"sources": []},
            "creditReceipt": {"success": True, "skipped": False},
            "requireServerProof": False,
            "renderCheckpoint": {
                "stage": "rendering_chunks",
                "completedCount": 3,
            },
        }

        async def failed_render(*_args, **_kwargs):
            raise RuntimeError("transient ffmpeg failure")

        fake_worker.render_multicam_impl = failed_render

    def run_failed_attempt(self, attempt, max_retries=1, callback_result=True):
        environment = {
            "MULTICAM_JOB_ID": "retry-job-123",
            "MULTICAM_DISPATCH_TOKEN": "dispatch-token-long-enough",
            "CLOUD_RUN_EXECUTION": "execution-abc",
            "CLOUD_RUN_TASK_ATTEMPT": str(attempt),
            "MULTICAM_JOB_MAX_RETRIES": str(max_retries),
        }
        with (
            mock.patch.dict(os.environ, environment, clear=False),
            mock.patch.object(runner, "_claim_job", return_value=("claimed", self.job)),
            mock.patch.object(
                runner,
                "_notify_failure_callback",
                return_value=callback_result,
            ) as notify_failure,
            mock.patch.object(runner, "_release_capacity") as release_capacity,
        ):
            exit_code = runner.run()
        return exit_code, notify_failure, release_capacity

    def test_nonterminal_attempt_marks_retrying_without_refund_or_capacity_release(self):
        exit_code, notify_failure, release_capacity = self.run_failed_attempt(attempt=0)

        self.assertEqual(exit_code, 1)
        notify_failure.assert_not_called()
        release_capacity.assert_not_called()

        fake_worker.update_firestore_job.assert_called_once()
        job_id, update = fake_worker.update_firestore_job.call_args.args
        self.assertEqual(job_id, "retry-job-123")
        self.assertEqual(update["status"], "retrying")
        self.assertEqual(update["stage"], "durable_render_retry_scheduled")
        self.assertFalse(update["refundRequired"])
        self.assertEqual(update["retryState"]["attempt"], 0)
        self.assertEqual(update["retryState"]["nextAttempt"], 1)
        self.assertFalse(update["retryState"]["terminal"])
        self.assertNotIn("progress", update)
        self.assertNotIn("renderCheckpoint", update)
        self.assertEqual(self.job["renderCheckpoint"]["completedCount"], 3)
        self.assertEqual(
            fake_worker.update_firestore_job.call_args.kwargs,
            {"critical": True, "max_attempts": 5},
        )

    def test_terminal_attempt_requests_refund_and_releases_capacity(self):
        exit_code, notify_failure, release_capacity = self.run_failed_attempt(
            attempt=1,
            max_retries=1,
        )

        self.assertEqual(exit_code, 1)
        notify_failure.assert_called_once_with("retry-job-123", "transient ffmpeg failure")
        release_capacity.assert_called_once_with("retry-job-123", "failed")

        _job_id, update = fake_worker.update_firestore_job.call_args.args
        self.assertEqual(update["status"], "failed")
        self.assertEqual(update["stage"], "durable_render_failed")
        self.assertTrue(update["refundRequired"])
        self.assertTrue(update["retryState"]["terminal"])
        self.assertEqual(update["progress"], 0)

    def test_terminal_attempt_releases_capacity_when_refund_callback_fails(self):
        exit_code, notify_failure, release_capacity = self.run_failed_attempt(
            attempt=1,
            max_retries=1,
            callback_result=False,
        )

        self.assertEqual(exit_code, 1)
        notify_failure.assert_called_once()
        release_capacity.assert_called_once_with("retry-job-123", "failed")


if __name__ == "__main__":
    unittest.main()
