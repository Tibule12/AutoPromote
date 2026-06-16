import json
import tempfile
import unittest
from pathlib import Path

from python_media_worker.local_final_render_sync_audit import (
    audit_source_offset_seconds,
    classify_sync_measurement,
    find_plan_for_sample,
    load_summary_plans,
)


class FinalRenderSyncAuditTests(unittest.TestCase):
    def test_classifies_low_correlation_as_bad_measurement_not_drift(self):
        verdict = classify_sync_measurement(
            {
                "status": "measured",
                "abs_residual_seconds": 0.5,
                "correlation": 0.02,
            },
            max_residual=0.12,
            min_correlation=0.08,
        )

        self.assertEqual(verdict["status"], "untrusted")
        self.assertEqual(verdict["verdict"], "bad_measurement")
        self.assertEqual(verdict["measurement_quality"], "low_correlation")

    def test_classifies_trusted_large_residual_as_measured_drift(self):
        verdict = classify_sync_measurement(
            {
                "status": "measured",
                "abs_residual_seconds": 0.25,
                "correlation": -0.22,
            },
            max_residual=0.12,
            min_correlation=0.08,
        )

        self.assertEqual(verdict["status"], "failed")
        self.assertEqual(verdict["verdict"], "measured_drift")
        self.assertEqual(verdict["measurement_quality"], "trusted")

    def test_classifies_marginal_residual_separately(self):
        verdict = classify_sync_measurement(
            {
                "status": "measured",
                "abs_residual_seconds": 0.121,
                "correlation": 0.2,
            },
            max_residual=0.12,
            min_correlation=0.08,
        )

        self.assertEqual(verdict["status"], "failed")
        self.assertEqual(verdict["verdict"], "measured_drift_near_threshold")

    def test_loads_summary_worker_segments_as_plans(self):
        summary = [
            {
                "window": "chunk_00",
                "worker_result": {
                    "duration": 300,
                    "segments": [
                        {
                            "timeline_start": 0,
                            "timeline_end": 120,
                            "camera_id": "cam1",
                            "source_start": 1.5,
                        }
                    ],
                },
            }
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "summary.json"
            path.write_text(json.dumps(summary), encoding="utf-8")

            plans = load_summary_plans(path, chunk_duration=300)

        self.assertEqual(len(plans), 1)
        self.assertEqual(plans[0]["window_start"], 0)
        self.assertEqual(plans[0]["segments"][0]["camera_id"], "cam1")

    def test_finds_plan_using_explicit_window_start(self):
        plans = [
            {"window_start": 0, "window_duration": 300, "segments": []},
            {"window_start": 300, "window_duration": 300, "segments": []},
        ]

        index, _plan, chunk_start, local_time = find_plan_for_sample(plans, 350, 300)

        self.assertEqual(index, 1)
        self.assertEqual(chunk_start, 300)
        self.assertEqual(local_time, 50)

    def test_does_not_double_apply_small_first_chunk_source_offset(self):
        self.assertEqual(
            audit_source_offset_seconds(source_offset=-1.9, chunk_start=0, chunk_duration=300),
            0.0,
        )
        self.assertEqual(
            audit_source_offset_seconds(source_offset=0.1, chunk_start=0, chunk_duration=300),
            0.0,
        )

    def test_keeps_large_window_source_offset_for_later_chunks(self):
        self.assertEqual(
            audit_source_offset_seconds(source_offset=298.1, chunk_start=300, chunk_duration=300),
            298.1,
        )


if __name__ == "__main__":
    unittest.main()
