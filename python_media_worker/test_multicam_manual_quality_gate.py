"""Exercise the actual final gate without importing optional model runtimes."""
import ast
import unittest
from pathlib import Path

source = ast.parse(Path(__file__).with_name("main_media_server.py").read_text())
function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == "build_multicam_final_quality_gate")
namespace = {"MULTICAM_CONTINUOUS_SYNC_ANCHORS": True, "MULTICAM_POST_RENDER_SYNC_GOOD_SECONDS": .08, "MULTICAM_POST_RENDER_SYNC_UNSAFE_SECONDS": .2}
exec(compile(ast.Module(body=[function], type_ignores=[]), "main_media_server.py", "exec"), namespace)
gate = namespace["build_multicam_final_quality_gate"]

class ManualQualityGateTests(unittest.TestCase):
    def options(self):
        return dict(output_validation={"has_video_stream": True, "has_audio_stream": True}, post_render_sync_audit={"status": "good"}, layout_contract_audit={"status": "passed"}, director_truth_audit={"status": "passed"}, director_latency_audit={"status": "passed"}, director_audio={"status": "unproven_channel_mapping"}, continuous_sync_anchors={"status": "active", "active_camera_count": 2}, segment_duration_receipts=[{"ok": True, "delta_seconds": 0}])

    def test_manual_camera_cuts_do_not_require_automatic_speaker_channel_ownership(self):
        result = gate(**self.options(), director_audio_required=False)
        self.assertTrue(result["passed"])

    def test_automatic_speaker_switching_still_rejects_unproven_channels(self):
        self.assertFalse(gate(**self.options())["passed"])

    def test_manual_cuts_still_require_good_actual_output_sync(self):
        options = self.options()
        options["post_render_sync_audit"] = {"status": "unsafe"}
        result = gate(**options, director_audio_required=False)
        self.assertFalse(result["passed"])
        self.assertFalse(next(c for c in result["checks"] if c["name"] == "post_render_sync")["passed"])

if __name__ == "__main__":
    unittest.main()
