import unittest

from python_media_worker.episode_regression_harness import (
    audit_layout_samples,
    build_dynamic_sample_times,
    build_episode_regression_report,
    summarize_sync_report,
)


class EpisodeRegressionHarnessTests(unittest.TestCase):
    def sample_plans(self):
        return [
            {
                "segments": [
                    {
                        "timeline_start": 0.0,
                        "timeline_end": 50.0,
                        "camera_id": "cam1",
                        "layout_mode": "pip",
                        "secondary_camera_id": "cam2",
                        "audio_leader_camera_id": "cam1",
                        "audio_decision_reliable": True,
                    },
                    {
                        "timeline_start": 50.0,
                        "timeline_end": 120.0,
                        "camera_id": "cam2",
                        "layout_mode": "pip",
                        "secondary_camera_id": "cam1",
                        "audio_leader_camera_id": "cam2",
                        "audio_decision_reliable": True,
                    },
                ]
            },
            {
                "segments": [
                    {
                        "timeline_start": 0.0,
                        "timeline_end": 120.0,
                        "camera_id": "cam1",
                        "layout_mode": "cut",
                        "secondary_camera_id": None,
                        "audio_leader_camera_id": "cam1",
                        "audio_decision_reliable": True,
                    }
                ]
            },
        ]

    def test_dynamic_samples_include_known_markers_and_switch_boundaries(self):
        samples = build_dynamic_sample_times(
            420.0,
            plans=self.sample_plans(),
            chunk_duration=300.0,
            interval=300.0,
            known_markers=[64.0, 750.0],
        )

        self.assertIn(64.0, samples)
        self.assertNotIn(750.0, samples)
        self.assertIn(51.0, samples)
        self.assertIn(300.0, samples)

    def test_layout_audit_passes_when_active_speaker_is_hero_not_reaction(self):
        report = audit_layout_samples(self.sample_plans(), [10.0, 51.0, 300.0], chunk_duration=300.0)

        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["failed_count"], 0)

    def test_layout_audit_fails_when_active_speaker_is_reaction(self):
        plans = self.sample_plans()
        plans[0]["segments"][1]["camera_id"] = "cam1"
        plans[0]["segments"][1]["secondary_camera_id"] = "cam2"
        report = audit_layout_samples(plans, [51.0], chunk_duration=300.0)

        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["checks"][0]["issues"], ["active_speaker_not_hero", "active_speaker_in_reaction"])

    def test_sync_summary_blocks_trusted_failed_samples_and_marks_low_confidence_untrusted(self):
        report = summarize_sync_report(
            {
                "checks": [
                    {
                        "time_seconds": 10,
                        "timecode": "00:00:10",
                        "status": "passed",
                        "sync": {"abs_residual_seconds": 0.04, "correlation": 0.2},
                    },
                    {
                        "time_seconds": 20,
                        "timecode": "00:00:20",
                        "status": "failed",
                        "sync": {"abs_residual_seconds": 0.2, "correlation": 0.18},
                    },
                    {
                        "time_seconds": 30,
                        "timecode": "00:00:30",
                        "status": "untrusted",
                        "sync": {"abs_residual_seconds": 0.5, "correlation": 0.02},
                    },
                ]
            }
        )

        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["failed_count"], 1)
        self.assertEqual(report["untrusted_count"], 1)

    def test_episode_regression_report_combines_layout_and_sync_results(self):
        report = build_episode_regression_report(
            plans=self.sample_plans(),
            duration=420.0,
            chunk_duration=300.0,
            known_markers=[64.0],
            sync_report={
                "checks": [
                    {
                        "time_seconds": 64,
                        "timecode": "00:01:04",
                        "status": "passed",
                        "sync": {"abs_residual_seconds": 0.04, "correlation": 0.2},
                    }
                ]
            },
        )

        self.assertEqual(report["status"], "passed")
        self.assertGreaterEqual(report["dynamic_sample_count"], 5)
        self.assertEqual(report["layout_report"]["status"], "passed")
        self.assertEqual(report["sync_summary"]["status"], "passed")


if __name__ == "__main__":
    unittest.main()
