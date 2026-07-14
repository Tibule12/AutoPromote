import os
import tempfile
import types
import unittest
from unittest import mock

import python_media_worker.main_media_server as worker


class MulticamDirectorRuleTests(unittest.TestCase):
    def setUp(self):
        self.prepared_sources = [
            {"id": "cam1", "label": "Camera 1"},
            {"id": "cam2", "label": "Camera 2"},
        ]

    def signed_safe_qa_receipt(self, request, duration=1200):
        receipt = {
            "overall_status": "SAFE",
            "windows": [
                {"window": "qa_start", "status": "SAFE", "output": "start.mp4"},
                {"window": "qa_mid", "status": "SAFE", "output": "mid.mp4"},
                {"window": "qa_late", "status": "SAFE", "output": "late.mp4"},
                {"window": "qa_final", "status": "SAFE", "output": "final.mp4"},
            ],
        }
        return worker.sign_multicam_qa_proof_receipt(receipt, request, duration)

    def test_reaction_side_uses_explicit_source_hint_before_measured_focus(self):
        self.assertEqual(
            worker.multicam_reaction_side_for_primary(
                {"id": "cam1", "label": "Camera 1", "focus_x": 0.24, "reaction_side": "right"}
            ),
            "right",
        )
        self.assertEqual(
            worker.multicam_reaction_side_for_primary(
                {"id": "cam2", "label": "Camera 2", "focus_x": 0.86, "reactionSide": "left"}
            ),
            "left",
        )

    def test_reaction_side_uses_measured_focus_not_camera_name(self):
        self.assertEqual(
            worker.multicam_reaction_side_for_primary(
                {"id": "cam1", "label": "Camera 1", "focus_x": 0.82}
            ),
            "left",
        )
        self.assertEqual(
            worker.multicam_reaction_side_for_primary(
                {"id": "cam2", "label": "Camera 2", "focus_x": 0.18}
            ),
            "right",
        )
        self.assertEqual(
            worker.multicam_source_focus_x({"id": "cam1", "label": "Camera 1"}),
            0.5,
        )

    def test_long_render_requires_qa_proof_when_gate_enabled(self):
        previous_required = worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER
        previous_allowed = worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA
        previous_seconds = worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS
        worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = True
        worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = False
        worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = 300.0
        try:
            request = worker.RenderMultiCamRequest(
                sources=[
                    {"id": "cam1", "url": "cam1.mp4"},
                    {"id": "cam2", "url": "cam2.mp4"},
                ],
                overlap_duration=1200,
            )
            with self.assertRaises(worker.HTTPException) as raised:
                worker.enforce_multicam_long_render_qa_gate(request, 1200)
            self.assertEqual(raised.exception.status_code, 428)
            self.assertEqual(raised.exception.detail["qa_gate"]["status"], "blocked")
        finally:
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = previous_required
            worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = previous_allowed
            worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = previous_seconds

    def test_long_render_qa_gate_accepts_passed_receipt(self):
        previous_required = worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER
        previous_allowed = worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA
        previous_seconds = worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS
        previous_signed = worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF
        previous_secret = worker.MEDIA_WORKER_TASK_SECRET
        worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = True
        worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = False
        worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = 300.0
        worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF = True
        worker.MEDIA_WORKER_TASK_SECRET = "unit-test-qa-secret"
        try:
            request = worker.RenderMultiCamRequest(
                sources=[
                    {"id": "cam1", "url": "cam1.mp4"},
                    {"id": "cam2", "url": "cam2.mp4"},
                ],
                overlap_duration=1200,
                qaProofStatus="passed",
                qaProofReceiptId="qa-report-123",
            )
            request.qaProofReceipt = self.signed_safe_qa_receipt(request, 1200)
            gate = worker.enforce_multicam_long_render_qa_gate(request, 1200)
            self.assertEqual(gate["status"], "passed")
        finally:
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = previous_required
            worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = previous_allowed
            worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = previous_seconds
            worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF = previous_signed
            worker.MEDIA_WORKER_TASK_SECRET = previous_secret

    def test_durable_embedded_proof_can_pass_initial_gate_but_not_final_gate(self):
        previous_required = worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER
        previous_allowed = worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA
        previous_seconds = worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS
        worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = True
        worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = False
        worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = 300.0
        try:
            request = worker.RenderMultiCamRequest(
                sources=[
                    {"id": "cam1", "url": "cam1.mp4"},
                    {"id": "cam2", "url": "cam2.mp4"},
                ],
                overlap_duration=1200,
            )
            pending = worker.enforce_multicam_long_render_qa_gate(
                request,
                1200,
                allow_pending_embedded_proof=True,
            )
            self.assertEqual(pending["status"], "pending_embedded_proof")
            with self.assertRaises(worker.HTTPException):
                worker.enforce_multicam_long_render_qa_gate(request, 1200)
        finally:
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = previous_required
            worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = previous_allowed
            worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = previous_seconds

    def test_long_render_qa_gate_accepts_signed_server_plan_receipt(self):
        previous_required = worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER
        previous_allowed = worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA
        previous_seconds = worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS
        previous_signed = worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF
        previous_secret = worker.MEDIA_WORKER_TASK_SECRET
        worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = True
        worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = False
        worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = 300.0
        worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF = True
        worker.MEDIA_WORKER_TASK_SECRET = "unit-test-qa-secret"
        try:
            request = worker.RenderMultiCamRequest(
                sources=[
                    {"id": "cam1", "url": "cam1.mp4"},
                    {"id": "cam2", "url": "cam2.mp4"},
                ],
                overlap_duration=1200,
                qaProofStatus="passed",
                qaProofReceiptId="server-plan-123",
            )
            request.qaProofReceipt = worker.sign_multicam_qa_proof_receipt(
                {
                    "overall_status": "SAFE",
                    "proof_kind": "server_plan_v1",
                    "external_audio_present": False,
                    "checks": {
                        "layout_contract": {"status": "passed"},
                        "director_truth": {"status": "passed"},
                        "director_latency": {"status": "passed"},
                    },
                },
                request,
                1200,
            )
            gate = worker.enforce_multicam_long_render_qa_gate(request, 1200)
            self.assertEqual(gate["status"], "passed")
            self.assertEqual(gate["qa_proof_receipt_status"], "signed_server_plan_receipt_passed")
        finally:
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = previous_required
            worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = previous_allowed
            worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = previous_seconds
            worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF = previous_signed
            worker.MEDIA_WORKER_TASK_SECRET = previous_secret

    def test_production_limits_verify_receipt_against_requested_window_after_sync_clamp(self):
        previous_required = worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER
        previous_allowed = worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA
        previous_seconds = worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS
        previous_signed = worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF
        previous_secret = worker.MEDIA_WORKER_TASK_SECRET
        previous_limits = worker.MULTICAM_ENFORCE_PROD_LIMITS
        worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = True
        worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = False
        worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = 300.0
        worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF = True
        worker.MULTICAM_ENFORCE_PROD_LIMITS = False
        worker.MEDIA_WORKER_TASK_SECRET = "unit-test-qa-secret"
        try:
            request = worker.RenderMultiCamRequest(
                sources=[
                    {"id": "cam1", "url": "cam1.mp4"},
                    {"id": "cam2", "url": "cam2.mp4"},
                ],
                overlap_duration=1200,
                qaProofStatus="passed",
                qaProofReceiptId="server-plan-clamped-window",
            )
            request.qaProofReceipt = worker.sign_multicam_qa_proof_receipt(
                {
                    "overall_status": "SAFE",
                    "proof_kind": "server_plan_v1",
                    "external_audio_present": False,
                    "checks": {
                        "layout_contract": {"status": "passed"},
                        "director_truth": {"status": "passed"},
                        "director_latency": {"status": "passed"},
                    },
                },
                request,
                1200,
            )
            limits = worker.enforce_multicam_production_limits(
                request,
                1197.25,
                qa_overlap_duration=1200,
            )
            self.assertEqual(limits["duration_seconds"], 1197.25)
            self.assertEqual(limits["qa_gate"]["duration_seconds"], 1200.0)
            self.assertEqual(limits["qa_gate"]["status"], "passed")
        finally:
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = previous_required
            worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = previous_allowed
            worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = previous_seconds
            worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF = previous_signed
            worker.MULTICAM_ENFORCE_PROD_LIMITS = previous_limits
            worker.MEDIA_WORKER_TASK_SECRET = previous_secret

    def test_long_render_rejects_unsigned_passed_receipt_when_signature_required(self):
        previous_required = worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER
        previous_allowed = worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA
        previous_seconds = worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS
        previous_signed = worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF
        previous_secret = worker.MEDIA_WORKER_TASK_SECRET
        worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = True
        worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = False
        worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = 300.0
        worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF = True
        worker.MEDIA_WORKER_TASK_SECRET = "unit-test-qa-secret"
        try:
            request = worker.RenderMultiCamRequest(
                sources=[
                    {"id": "cam1", "url": "cam1.mp4"},
                    {"id": "cam2", "url": "cam2.mp4"},
                ],
                overlap_duration=1200,
                qaProofStatus="passed",
                qaProofReceiptId="qa-report-123",
                qaProofReceipt={
                    "overall_status": "SAFE",
                    "windows": [
                        {"window": "qa_start", "status": "SAFE", "output": "start.mp4"},
                        {"window": "qa_mid", "status": "SAFE", "output": "mid.mp4"},
                        {"window": "qa_late", "status": "SAFE", "output": "late.mp4"},
                        {"window": "qa_final", "status": "SAFE", "output": "final.mp4"},
                    ],
                },
            )
            with self.assertRaises(worker.HTTPException) as raised:
                worker.enforce_multicam_long_render_qa_gate(request, 1200)
            self.assertEqual(
                raised.exception.detail["qa_gate"]["qa_proof_receipt_status"],
                "qa_proof_fingerprint_mismatch",
            )
        finally:
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = previous_required
            worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = previous_allowed
            worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = previous_seconds
            worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF = previous_signed
            worker.MEDIA_WORKER_TASK_SECRET = previous_secret

    def test_long_render_rejects_reused_receipt_for_different_input(self):
        previous_required = worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER
        previous_allowed = worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA
        previous_seconds = worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS
        previous_signed = worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF
        previous_secret = worker.MEDIA_WORKER_TASK_SECRET
        worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = True
        worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = False
        worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = 300.0
        worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF = True
        worker.MEDIA_WORKER_TASK_SECRET = "unit-test-qa-secret"
        try:
            original_request = worker.RenderMultiCamRequest(
                sources=[
                    {"id": "cam1", "url": "cam1.mp4"},
                    {"id": "cam2", "url": "cam2.mp4"},
                ],
                overlap_duration=1200,
            )
            reused_receipt = self.signed_safe_qa_receipt(original_request, 1200)
            changed_request = worker.RenderMultiCamRequest(
                sources=[
                    {"id": "cam1", "url": "cam1.mp4"},
                    {"id": "cam2", "url": "different-cam2.mp4"},
                ],
                overlap_duration=1200,
                qaProofStatus="passed",
                qaProofReceiptId="qa-report-123",
                qaProofReceipt=reused_receipt,
            )
            with self.assertRaises(worker.HTTPException) as raised:
                worker.enforce_multicam_long_render_qa_gate(changed_request, 1200)
            self.assertEqual(
                raised.exception.detail["qa_gate"]["qa_proof_receipt_status"],
                "qa_proof_fingerprint_mismatch",
            )
        finally:
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = previous_required
            worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = previous_allowed
            worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = previous_seconds
            worker.MULTICAM_REQUIRE_SIGNED_QA_PROOF = previous_signed
            worker.MEDIA_WORKER_TASK_SECRET = previous_secret

    def test_long_render_rejects_status_without_receipt_payload(self):
        previous_required = worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER
        previous_allowed = worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA
        previous_seconds = worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS
        worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = True
        worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = False
        worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = 300.0
        try:
            request = worker.RenderMultiCamRequest(
                sources=[
                    {"id": "cam1", "url": "cam1.mp4"},
                    {"id": "cam2", "url": "cam2.mp4"},
                ],
                overlap_duration=1200,
                qaProofStatus="passed",
                qaProofReceiptId="qa-report-123",
            )
            with self.assertRaises(worker.HTTPException) as raised:
                worker.enforce_multicam_long_render_qa_gate(request, 1200)
            self.assertEqual(raised.exception.status_code, 428)
            self.assertEqual(
                raised.exception.detail["qa_gate"]["qa_proof_receipt_status"],
                "missing_qa_proof_receipt",
            )
        finally:
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = previous_required
            worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = previous_allowed
            worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = previous_seconds

    def test_short_qa_windows_do_not_require_qa_proof(self):
        previous_required = worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER
        previous_allowed = worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA
        previous_seconds = worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS
        worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = True
        worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = False
        worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = 300.0
        try:
            request = worker.RenderMultiCamRequest(
                sources=[
                    {"id": "cam1", "url": "cam1.mp4"},
                    {"id": "cam2", "url": "cam2.mp4"},
                ],
                overlap_duration=120,
            )
            gate = worker.enforce_multicam_long_render_qa_gate(request, 120)
            self.assertEqual(gate["status"], "not_required")
        finally:
            worker.MULTICAM_REQUIRE_QA_PROOF_FOR_LONG_RENDER = previous_required
            worker.MULTICAM_ALLOW_LONG_RENDER_WITHOUT_QA = previous_allowed
            worker.MULTICAM_QA_PROOF_REQUIRED_SECONDS = previous_seconds

    def test_hdr_normalization_tonemaps_by_default(self):
        previous = os.environ.pop("MULTICAM_HDR_NORMALIZATION_MODE", None)
        try:
            color_filter = worker.build_multicam_base_color_filter(
                {
                    "color_transfer": "arib-std-b67",
                    "color_primaries": "bt2020",
                    "color_space": "bt2020nc",
                    "pix_fmt": "yuv420p10le",
                }
            )
            self.assertIn("tonemap=tonemap=hable", color_filter)
            self.assertEqual(
                worker.multicam_hdr_normalization_method(),
                "zscale_linear_hable_tonemap",
            )
        finally:
            if previous is not None:
                os.environ["MULTICAM_HDR_NORMALIZATION_MODE"] = previous

    def test_hdr_normalization_preserve_is_opt_in(self):
        previous = os.environ.get("MULTICAM_HDR_NORMALIZATION_MODE")
        os.environ["MULTICAM_HDR_NORMALIZATION_MODE"] = "preserve"
        try:
            self.assertEqual(
                worker.build_multicam_base_color_filter(
                    {
                        "color_transfer": "arib-std-b67",
                        "color_primaries": "bt2020",
                        "color_space": "bt2020nc",
                        "pix_fmt": "yuv420p10le",
                    }
                ),
                "format=yuv420p",
            )
            self.assertEqual(
                worker.multicam_hdr_normalization_method(),
                "preserve_pixel_bt709_tagging",
            )
        finally:
            if previous is None:
                os.environ.pop("MULTICAM_HDR_NORMALIZATION_MODE", None)
            else:
                os.environ["MULTICAM_HDR_NORMALIZATION_MODE"] = previous

    def test_layout_contract_blocks_active_speaker_in_reaction(self):
        audit = worker.audit_multicam_layout_contract(
            [
                {
                    "camera_id": "cam2",
                    "secondary_camera_id": "cam1",
                    "layout_mode": "pip",
                    "timeline_start": 0.0,
                    "timeline_end": 4.0,
                    "audio_decision_reliable": True,
                    "audio_leader_camera_id": "cam1",
                }
            ],
            self.prepared_sources,
            output_width=1920,
            output_height=1080,
        )

        self.assertEqual(audit["status"], "failed")
        self.assertIn(
            "active_speaker_not_primary",
            {issue["type"] for issue in audit["issues"]},
        )
        self.assertIn(
            "active_speaker_in_reaction",
            {issue["type"] for issue in audit["issues"]},
        )

    def test_layout_contract_passes_active_speaker_with_mandatory_reaction(self):
        audit = worker.audit_multicam_layout_contract(
            [
                {
                    "camera_id": "cam1",
                    "secondary_camera_id": "cam2",
                    "layout_mode": "pip",
                    "timeline_start": 0.0,
                    "timeline_end": 4.0,
                    "audio_decision_reliable": True,
                    "audio_leader_camera_id": "cam1",
                }
            ],
            [
                {"id": "cam1", "label": "Camera 1", "focus_x": 0.82},
                {"id": "cam2", "label": "Camera 2", "focus_x": 0.2},
            ],
            output_width=1920,
            output_height=1080,
        )

        self.assertEqual(audit["status"], "passed")
        self.assertEqual(audit["pip_geometry_samples"][0]["reaction_side"], "left")

    def test_layout_contract_allows_clean_active_speaker_cut(self):
        audit = worker.audit_multicam_layout_contract(
            [
                {
                    "camera_id": "cam1",
                    "secondary_camera_id": None,
                    "layout_mode": "cut",
                    "timeline_start": 0.0,
                    "timeline_end": 4.0,
                    "audio_decision_reliable": True,
                    "audio_leader_camera_id": "cam1",
                }
            ],
            self.prepared_sources,
            output_width=1920,
            output_height=1080,
        )

        self.assertEqual(audit["status"], "passed")

    def test_reaction_permission_does_not_force_pip_on_clean_cut(self):
        segments = [
            {
                "camera_id": "cam1",
                "secondary_camera_id": None,
                "layout_mode": "cut",
                "layout_reason": "dominant_speaker_cut",
                "timeline_start": 0.0,
                "timeline_end": 4.0,
            }
        ]

        disabled = worker.enforce_reaction_overlay_on_multicam_segments(
            segments,
            self.prepared_sources,
            enabled=False,
        )
        enabled = worker.enforce_reaction_overlay_on_multicam_segments(
            segments,
            self.prepared_sources,
            enabled=True,
        )

        self.assertEqual(disabled[0]["layout_mode"], "cut")
        self.assertIsNone(disabled[0].get("secondary_camera_id"))
        self.assertEqual(enabled[0]["layout_mode"], "cut")
        self.assertIsNone(enabled[0].get("secondary_camera_id"))

    def test_disabled_reaction_overlay_strips_requested_pip(self):
        segments = [
            {
                "camera_id": "cam1",
                "secondary_camera_id": "cam2",
                "layout_mode": "pip",
                "layout_reason": "reaction_accent",
                "timeline_start": 0.0,
                "timeline_end": 4.0,
            }
        ]

        disabled = worker.enforce_reaction_overlay_on_multicam_segments(
            segments,
            self.prepared_sources,
            enabled=False,
        )

        self.assertEqual(disabled[0]["layout_mode"], "cut")
        self.assertIsNone(disabled[0].get("secondary_camera_id"))
        self.assertTrue(disabled[0]["layout_reason"].startswith("reaction_overlay_disabled:"))

    def test_layout_contract_blocks_unknown_reaction_placement(self):
        audit = worker.audit_multicam_layout_contract(
            [
                {
                    "camera_id": "cam1",
                    "secondary_camera_id": "cam2",
                    "layout_mode": "pip",
                    "timeline_start": 0.0,
                    "timeline_end": 4.0,
                    "audio_decision_reliable": True,
                    "audio_leader_camera_id": "cam1",
                }
            ],
            [
                {"id": "cam1", "label": "Camera 1"},
                {"id": "cam2", "label": "Camera 2"},
            ],
            output_width=1920,
            output_height=1080,
        )

        self.assertEqual(audit["status"], "failed")
        self.assertIn(
            "unknown_reaction_placement",
            {issue["type"] for issue in audit["issues"]},
        )

    def test_layout_contract_respects_explicit_reaction_side_override(self):
        audit = worker.audit_multicam_layout_contract(
            [
                {
                    "camera_id": "cam1",
                    "secondary_camera_id": "cam2",
                    "layout_mode": "pip",
                    "timeline_start": 0.0,
                    "timeline_end": 4.0,
                    "audio_decision_reliable": True,
                    "audio_leader_camera_id": "cam1",
                }
            ],
            [
                {"id": "cam1", "label": "Camera 1", "focus_x": 0.82, "reaction_side": "right"},
                {"id": "cam2", "label": "Camera 2", "focus_x": 0.2},
            ],
            output_width=1920,
            output_height=1080,
        )

        self.assertEqual(audit["status"], "passed")
        self.assertEqual(audit["pip_geometry_samples"][0]["reaction_side"], "right")

    def test_director_truth_audit_blocks_raw_active_speaker_in_reaction(self):
        audit = worker.audit_multicam_director_active_speaker_truth(
            [
                {
                    "camera_id": "cam1",
                    "secondary_camera_id": "cam2",
                    "layout_mode": "pip",
                    "layout_reason": "active_speaker_run_hold:strong_isolated_audio_owner",
                    "timeline_start": 88.0,
                    "timeline_end": 93.59,
                    "audio_decision_reliable": True,
                    "raw_audio_leader_camera_id": "cam2",
                    "audio_leader_camera_id": "cam1",
                    "audio_decision_reason": "strong_isolated_audio_owner",
                    "audio_leader_activity": 0.9309,
                    "audio_second_activity": 0.6032,
                    "audio_leader_gap": 0.3277,
                }
            ],
            self.prepared_sources,
        )

        self.assertEqual(audit["status"], "failed")
        issue_types = {issue["type"] for issue in audit["issues"]}
        self.assertIn("raw_active_speaker_not_primary", issue_types)
        self.assertIn("raw_active_speaker_in_reaction", issue_types)

    def test_director_truth_repair_reclaims_raw_active_speaker_from_reaction(self):
        prepared_sources = [
            {
                "id": "cam1",
                "label": "Camera 1",
                "duration": 90.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
            },
            {
                "id": "cam2",
                "label": "Camera 2",
                "duration": 90.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
            },
        ]
        segments = [
            {
                "camera_id": "cam2",
                "secondary_camera_id": "cam1",
                "layout_mode": "pip",
                "layout_reason": "active_speaker_with_reaction",
                "timeline_start": 52.25,
                "timeline_end": 60.0,
                "source_start": 52.25,
                "source_end": 60.0,
                "audio_decision_reliable": True,
                "raw_audio_leader_camera_id": "cam1",
                "audio_leader_camera_id": "cam2",
                "audio_decision_reason": "visual_speaker_owner",
                "audio_leader_activity": 0.742,
                "audio_second_activity": 0.725,
                "audio_leader_gap": 0.017,
            }
        ]

        repaired, receipt = worker.repair_multicam_director_truth_segments(
            segments,
            prepared_sources,
            overlap_start=0.0,
        )

        self.assertTrue(receipt["applied"])
        self.assertEqual(receipt["repair_count"], 1)
        self.assertEqual(receipt["final_audit"]["status"], "passed")
        self.assertEqual(repaired[0]["camera_id"], "cam1")
        self.assertEqual(repaired[0]["secondary_camera_id"], "cam2")
        self.assertEqual(repaired[0]["layout_mode"], "pip")
        self.assertEqual(repaired[0]["audio_leader_camera_id"], "cam1")
        self.assertEqual(repaired[0]["raw_audio_leader_camera_id"], "cam1")
        self.assertTrue(repaired[0]["layout_reason"].startswith("director_truth_repaired_raw_active_speaker:"))

    def test_director_truth_audit_allows_earned_shared_moment_with_raw_leader_visible(self):
        audit = worker.audit_multicam_director_active_speaker_truth(
            [
                {
                    "camera_id": "cam1",
                    "secondary_camera_id": "cam2",
                    "layout_mode": "split-vertical",
                    "layout_reason": "earned_shared_reaction",
                    "timeline_start": 102.0,
                    "timeline_end": 106.0,
                    "audio_decision_reliable": True,
                    "raw_audio_leader_camera_id": "cam2",
                    "audio_leader_camera_id": "cam2",
                    "audio_decision_reason": "clean_audio_owner",
                    "audio_leader_activity": 0.82,
                    "audio_second_activity": 0.74,
                    "audio_leader_gap": 0.08,
                }
            ],
            self.prepared_sources,
        )

        self.assertEqual(audit["status"], "passed")
        self.assertEqual(audit["checked_segments"], 1)

    def test_director_latency_audit_blocks_seconds_late_active_speaker_join(self):
        prepared_sources = [
            {
                "id": "cam1",
                "label": "Camera 1",
                "timeline_audio_activity_windows": [
                    {"time": float(t), "activity": 0.76 if t < 88 else 0.18}
                    for t in range(84, 94)
                ],
            },
            {
                "id": "cam2",
                "label": "Camera 2",
                "timeline_audio_activity_windows": [
                    {"time": float(t), "activity": 0.08 if t < 88 else 0.94}
                    for t in range(84, 94)
                ],
            },
        ]
        segments = [
            {
                "camera_id": "cam1",
                "secondary_camera_id": "cam2",
                "layout_mode": "pip",
                "timeline_start": 84.0,
                "timeline_end": 90.0,
            },
            {
                "camera_id": "cam2",
                "secondary_camera_id": "cam1",
                "layout_mode": "pip",
                "timeline_start": 90.0,
                "timeline_end": 94.0,
            },
        ]

        audit = worker.audit_multicam_director_switch_latency(
            segments,
            prepared_sources,
        )

        self.assertEqual(audit["status"], "failed")
        [issue] = audit["issues"]
        self.assertEqual(issue["type"], "late_active_speaker_switch")
        self.assertEqual(issue["owner_camera_id"], "cam2")
        self.assertEqual(issue["run_start"], 88.0)
        self.assertGreater(issue["observed_latency_seconds"], issue["max_allowed_latency_seconds"])

    def test_director_latency_audit_allows_immediate_or_shared_active_speaker_coverage(self):
        prepared_sources = [
            {
                "id": "cam1",
                "label": "Camera 1",
                "duration": 120.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "timeline_audio_activity_windows": [
                    {"time": float(t), "activity": 0.76 if t < 88 else 0.18}
                    for t in range(84, 94)
                ],
            },
            {
                "id": "cam2",
                "label": "Camera 2",
                "duration": 120.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "timeline_audio_activity_windows": [
                    {"time": float(t), "activity": 0.08 if t < 88 else 0.94}
                    for t in range(84, 94)
                ],
            },
        ]
        segments = [
            {
                "camera_id": "cam1",
                "secondary_camera_id": "cam2",
                "layout_mode": "pip",
                "timeline_start": 84.0,
                "timeline_end": 88.0,
            },
            {
                "camera_id": "cam1",
                "secondary_camera_id": "cam2",
                "layout_mode": "split-vertical",
                "layout_reason": "shared_reaction_accent",
                "timeline_start": 88.0,
                "timeline_end": 90.0,
            },
            {
                "camera_id": "cam2",
                "secondary_camera_id": "cam1",
                "layout_mode": "pip",
                "timeline_start": 90.0,
                "timeline_end": 94.0,
            },
        ]

        audit = worker.audit_multicam_director_switch_latency(
            segments,
            prepared_sources,
        )

        self.assertEqual(audit["status"], "passed")
        self.assertGreaterEqual(audit["checked_runs"], 1)

    def test_late_active_speaker_repair_splits_segment_at_raw_onset(self):
        prepared_sources = [
            {
                "id": "cam1",
                "label": "Camera 1",
                "duration": 120.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "timeline_audio_activity_windows": [
                    {"time": float(t), "activity": 0.76 if t < 88 else 0.18}
                    for t in range(84, 94)
                ],
            },
            {
                "id": "cam2",
                "label": "Camera 2",
                "duration": 120.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "timeline_audio_activity_windows": [
                    {"time": float(t), "activity": 0.08 if t < 88 else 0.94}
                    for t in range(84, 94)
                ],
            },
        ]
        segments = [
            {
                "camera_id": "cam1",
                "secondary_camera_id": "cam2",
                "layout_mode": "pip",
                "layout_reason": "active_speaker_run_hold",
                "timeline_start": 84.0,
                "timeline_end": 90.0,
                "source_start": 84.0,
                "source_end": 90.0,
            },
            {
                "camera_id": "cam2",
                "secondary_camera_id": "cam1",
                "layout_mode": "pip",
                "layout_reason": "active_speaker_with_reaction",
                "timeline_start": 90.0,
                "timeline_end": 94.0,
                "source_start": 90.0,
                "source_end": 94.0,
            },
        ]

        repaired, receipt = worker.repair_multicam_late_active_speaker_segments(
            segments,
            prepared_sources,
            overlap_start=0.0,
        )

        self.assertTrue(receipt["applied"])
        self.assertEqual(receipt["final_audit"]["status"], "passed")
        repaired_slice = next(
            item for item in repaired
            if item["camera_id"] == "cam2"
            and item["timeline_start"] <= 88.0
            and item["timeline_end"] >= 89.0
        )
        self.assertEqual(repaired_slice["secondary_camera_id"], "cam1")
        self.assertTrue(repaired_slice["layout_reason"].startswith("latency_repaired_active_speaker"))

    def test_late_active_speaker_repair_holds_owner_for_full_dominant_run(self):
        prepared_sources = [
            {
                "id": "cam1",
                "label": "Camera 1",
                "duration": 120.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "timeline_audio_activity_windows": [
                    {"time": 108.0, "activity": 0.7},
                    {"time": 109.0, "activity": 0.1},
                    {"time": 110.0, "activity": 0.1},
                    {"time": 110.25, "activity": 0.1},
                ],
            },
            {
                "id": "cam2",
                "label": "Camera 2",
                "duration": 120.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "timeline_audio_activity_windows": [
                    {"time": 108.0, "activity": 0.1},
                    {"time": 109.0, "activity": 1.0},
                    {"time": 110.0, "activity": 1.0},
                    {"time": 110.25, "activity": 1.0},
                ],
            },
        ]
        segments = [
            {
                "camera_id": "cam2",
                "secondary_camera_id": "cam1",
                "layout_mode": "pip",
                "layout_reason": "strong_isolated_audio_owner",
                "timeline_start": 108.0,
                "timeline_end": 110.0,
                "source_start": 108.0,
                "source_end": 110.0,
            },
            {
                "camera_id": "cam1",
                "secondary_camera_id": "cam2",
                "layout_mode": "pip",
                "layout_reason": "active_speaker_run_hold",
                "timeline_start": 110.0,
                "timeline_end": 112.0,
                "source_start": 110.0,
                "source_end": 112.0,
            },
        ]

        repaired, receipt = worker.repair_multicam_late_active_speaker_segments(
            segments,
            prepared_sources,
            overlap_start=0.0,
        )

        self.assertTrue(receipt["applied"])
        self.assertEqual(receipt["final_audit"]["status"], "passed")
        repaired_slice = next(
            item for item in repaired
            if item["timeline_start"] <= 110.0
            and item["timeline_end"] >= 110.25
        )
        self.assertEqual(repaired_slice["camera_id"], "cam2")
        self.assertEqual(repaired_slice["secondary_camera_id"], "cam1")

    def test_late_active_speaker_repair_resolves_overlaps_by_current_activity(self):
        prepared_sources = [
            {
                "id": "cam1",
                "label": "Camera 1",
                "duration": 120.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "timeline_audio_activity_windows": [
                    {"time": 10.0, "activity": 0.8},
                    {"time": 12.0, "activity": 0.1},
                    {"time": 13.0, "activity": 0.8},
                ],
            },
            {
                "id": "cam2",
                "label": "Camera 2",
                "duration": 120.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "timeline_audio_activity_windows": [
                    {"time": 10.0, "activity": 0.1},
                    {"time": 12.0, "activity": 1.0},
                    {"time": 13.0, "activity": 0.1},
                ],
            },
        ]
        segments = [
            {
                "camera_id": "cam1",
                "secondary_camera_id": "cam2",
                "layout_mode": "pip",
                "timeline_start": 10.0,
                "timeline_end": 14.0,
                "source_start": 10.0,
                "source_end": 14.0,
            }
        ]
        original_audit = worker.audit_multicam_director_switch_latency
        call_count = {"value": 0}

        def fake_audit(_segments, _prepared_sources):
            call_count["value"] += 1
            if call_count["value"] == 1:
                return {
                    "status": "failed",
                    "issues": [
                        {
                            "type": "late_active_speaker_switch",
                            "owner_camera_id": "cam1",
                            "run_start": 10.0,
                            "run_end": 14.0,
                            "first_compliant_time": None,
                            "activity": 0.8,
                            "gap": 0.4,
                        },
                        {
                            "type": "late_active_speaker_switch",
                            "owner_camera_id": "cam2",
                            "run_start": 12.0,
                            "run_end": 13.0,
                            "first_compliant_time": None,
                            "activity": 1.0,
                            "gap": 0.6,
                        },
                    ],
                }
            return {"status": "passed", "issues": []}

        worker.audit_multicam_director_switch_latency = fake_audit
        try:
            repaired, receipt = worker.repair_multicam_late_active_speaker_segments(
                segments,
                prepared_sources,
                overlap_start=0.0,
            )
        finally:
            worker.audit_multicam_director_switch_latency = original_audit

        self.assertTrue(receipt["applied"])
        overlap_slice = next(
            item for item in repaired
            if item["timeline_start"] == 12.0 and item["timeline_end"] == 13.0
        )
        self.assertEqual(overlap_slice["camera_id"], "cam2")
        self.assertEqual(overlap_slice["secondary_camera_id"], "cam1")

    def test_layout_contract_repair_flips_reliable_audio_leader_to_hero(self):
        prepared_sources = [
            {
                "id": "cam1",
                "label": "Camera 1",
                "duration": 60.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "focus_x": 0.25,
            },
            {
                "id": "cam2",
                "label": "Camera 2",
                "duration": 60.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "focus_x": 0.75,
            },
        ]
        segments = [
            {
                "camera_id": "cam1",
                "secondary_camera_id": "cam2",
                "layout_mode": "pip",
                "layout_reason": "active_speaker_with_reaction:clean_audio_owner",
                "timeline_start": 20.0,
                "timeline_end": 26.0,
                "source_start": 20.0,
                "source_end": 26.0,
                "audio_decision_reliable": True,
                "audio_leader_camera_id": "cam2",
                "audio_decision_reason": "clean_audio_owner",
            }
        ]

        repaired, receipt = worker.repair_multicam_layout_contract_segments(
            segments,
            prepared_sources,
            overlap_start=0.0,
            output_width=1920,
            output_height=1080,
        )

        self.assertTrue(receipt["applied"])
        self.assertEqual(receipt["repair_count"], 1)
        self.assertEqual(receipt["final_audit"]["status"], "passed")
        self.assertEqual(repaired[0]["camera_id"], "cam2")
        self.assertEqual(repaired[0]["secondary_camera_id"], "cam1")
        self.assertEqual(repaired[0]["layout_mode"], "pip")
        self.assertEqual(repaired[0]["audio_leader_camera_id"], "cam2")
        self.assertTrue(repaired[0]["layout_reason"].startswith("layout_contract_repaired_active_speaker:"))

    def test_post_layout_latency_repair_reclaims_raw_active_speaker(self):
        prepared_sources = [
            {
                "id": "cam1",
                "label": "Camera 1",
                "duration": 30.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "timeline_audio_activity_windows": [
                    {"time": 10.0, "activity": 1.0},
                    {"time": 10.25, "activity": 1.0},
                    {"time": 11.0, "activity": 1.0},
                    {"time": 11.75, "activity": 0.9},
                    {"time": 12.5, "activity": 0.2},
                ],
            },
            {
                "id": "cam2",
                "label": "Camera 2",
                "duration": 30.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "timeline_audio_activity_windows": [
                    {"time": 10.0, "activity": 0.4},
                    {"time": 10.25, "activity": 0.4},
                    {"time": 11.0, "activity": 0.4},
                    {"time": 11.75, "activity": 0.3},
                    {"time": 12.5, "activity": 0.2},
                ],
            },
        ]
        segments = [
            {
                "camera_id": "cam1",
                "secondary_camera_id": "cam2",
                "layout_mode": "pip",
                "layout_reason": "active_speaker_with_reaction",
                "timeline_start": 10.0,
                "timeline_end": 12.5,
                "source_start": 10.0,
                "source_end": 12.5,
                "audio_decision_reliable": True,
                "audio_leader_camera_id": "cam2",
                "audio_decision_reason": "clean_audio_owner",
            }
        ]

        initial_latency = worker.audit_multicam_director_switch_latency(
            segments,
            prepared_sources,
        )
        self.assertEqual(initial_latency["status"], "passed")

        layout_repaired, layout_receipt = worker.repair_multicam_layout_contract_segments(
            segments,
            prepared_sources,
            overlap_start=0.0,
            output_width=1920,
            output_height=1080,
        )
        self.assertTrue(layout_receipt["applied"])
        self.assertEqual(layout_repaired[0]["camera_id"], "cam2")
        self.assertEqual(
            worker.audit_multicam_director_switch_latency(layout_repaired, prepared_sources)["status"],
            "failed",
        )

        latency_repaired, latency_receipt = worker.repair_multicam_late_active_speaker_segments(
            layout_repaired,
            prepared_sources,
            overlap_start=0.0,
        )

        self.assertTrue(latency_receipt["applied"])
        self.assertEqual(latency_receipt["final_audit"]["status"], "passed")
        self.assertEqual(latency_repaired[0]["camera_id"], "cam1")
        self.assertEqual(latency_repaired[0]["secondary_camera_id"], "cam2")

    def test_reclaims_proven_active_speaker_from_reaction_window(self):
        segments = [
            {
                "camera_id": "cam2",
                "layout_mode": "pip",
                "layout_reason": "reaction_attached_to_cut:clean_audio_owner",
                "secondary_camera_id": "cam1",
                "audio_decision_reliable": True,
                "audio_leader_camera_id": "cam1",
                "audio_decision_reason": "clean_audio_owner",
                "layout_confidence": 0.25,
            }
        ]

        [segment] = worker.enforce_reaction_overlay_on_multicam_segments(
            segments,
            self.prepared_sources,
            enabled=True,
        )

        self.assertEqual(segment["camera_id"], "cam1")
        self.assertEqual(segment["secondary_camera_id"], "cam2")
        self.assertEqual(segment["layout_mode"], "pip")
        self.assertTrue(segment["layout_reason"].startswith("active_speaker_primary_reclaimed:"))
        self.assertGreaterEqual(segment["layout_confidence"], 0.5)

    def test_uncertain_opening_backfills_to_first_reliable_audio_owner(self):
        switches = [
            {
                "camera_id": "cam1",
                "start_time": 0.0,
                "layout_mode": "pip",
                "layout_reason": "active_speaker_with_reaction:unproven_speaker_hold:low_audio_activity",
                "secondary_camera_id": "cam2",
                "layout_confidence": 0.25,
                "audio_decision_reliable": False,
                "audio_decision_reason": "low_audio_activity",
            },
            {
                "camera_id": "cam2",
                "start_time": 4.09,
                "layout_mode": "pip",
                "layout_reason": "active_speaker_with_reaction:strong_isolated_audio_owner",
                "secondary_camera_id": "cam1",
                "layout_confidence": 0.92,
                "audio_decision_reliable": True,
                "audio_leader_camera_id": "cam2",
                "raw_audio_leader_camera_id": "cam2",
                "audio_decision_reason": "strong_isolated_audio_owner",
                "audio_leader_activity": 0.78,
                "audio_second_activity": 0.42,
                "audio_leader_gap": 0.36,
            },
        ]

        [switch] = worker.backfill_uncertain_opening_to_first_reliable_owner(
            switches,
            ["cam1", "cam2"],
            max_backfill_seconds=8.0,
        )

        self.assertEqual(switch["start_time"], 0.0)
        self.assertEqual(switch["camera_id"], "cam2")
        self.assertEqual(switch["secondary_camera_id"], "cam1")
        self.assertEqual(switch["layout_mode"], "pip")
        self.assertTrue(switch["audio_decision_reliable"])
        self.assertTrue(switch["layout_reason"].startswith("active_speaker_with_reaction:opening_backfilled"))

    def test_strong_isolated_mic_handoff_is_not_blocked_by_run_hold_gate(self):
        def source(camera_id, before_activity, after_activity, visual_after):
            timeline_windows = [
                {"time": float(t), "activity": before_activity if t < 88 else after_activity}
                for t in range(0, 98, 2)
            ]
            window_scores = []
            for t in range(0, 98, 2):
                after = t >= 88
                window_scores.append(
                    {
                        "face_score": 0.35,
                        "motion_score": 0.35,
                        "visual_speaking_score": visual_after if after else (0.72 if camera_id == "cam1" else 0.12),
                        "visual_speaking_confidence": 0.65,
                        "placeholder_penalty": 0.0,
                    }
                )
            return {
                "id": camera_id,
                "label": camera_id,
                "duration": 100.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "has_audio": True,
                "silence_intervals": [],
                "window_scores": window_scores,
                "timeline_audio_activity_windows": timeline_windows,
                "audio_activity_source": "external_isolated_channel",
            }

        request = types.SimpleNamespace(
            auto_switch=True,
            audio_based_auto_switch=True,
            auto_switch_aggressiveness="balanced",
            auto_switch_interval=2.0,
            primary_audio_camera_id="cam1",
            overlap_start=0.0,
            switches=[],
        )
        switches = worker.normalize_multicam_switches(
            request,
            [
                source("cam1", before_activity=0.76, after_activity=0.6032, visual_after=1.0),
                source("cam2", before_activity=0.08, after_activity=0.9309, visual_after=0.8498),
            ],
            96.0,
        )

        handoffs = [
            item for item in switches
            if item["camera_id"] == "cam2" and float(item["start_time"]) >= 80.0
        ]
        self.assertTrue(handoffs)
        self.assertLessEqual(handoffs[0]["start_time"], 88.1)
        self.assertIn(
            handoffs[0]["audio_decision_reason"],
            {"strong_isolated_audio_owner", "sustained_isolated_handoff"},
        )

    def test_reaction_permission_does_not_rewrite_clean_cut_camera(self):
        segments = [
            {
                "camera_id": "cam2",
                "layout_mode": "cut",
                "layout_reason": "clean_audio_owner",
                "secondary_camera_id": None,
                "audio_decision_reliable": True,
                "audio_leader_camera_id": "cam1",
                "audio_decision_reason": "clean_audio_owner",
                "ranked_sources": [
                    {"camera_id": "cam1", "score": 0.91},
                    {"camera_id": "cam2", "score": 0.2},
                ],
            }
        ]

        [segment] = worker.enforce_reaction_overlay_on_multicam_segments(
            segments,
            self.prepared_sources,
            enabled=True,
        )

        self.assertEqual(segment["camera_id"], "cam2")
        self.assertEqual(segment["layout_mode"], "cut")

    def test_keeps_valid_active_speaker_hero_reaction_layout(self):
        segments = [
            {
                "camera_id": "cam1",
                "layout_mode": "pip",
                "layout_reason": "earned_reaction_accent",
                "secondary_camera_id": "cam2",
                "audio_decision_reliable": True,
                "audio_leader_camera_id": "cam1",
                "audio_decision_reason": "clean_audio_owner",
                "layout_confidence": 0.62,
            }
        ]

        [segment] = worker.enforce_reaction_overlay_on_multicam_segments(
            segments,
            self.prepared_sources,
            enabled=True,
        )

        self.assertEqual(segment["camera_id"], "cam1")
        self.assertEqual(segment["secondary_camera_id"], "cam2")
        self.assertEqual(segment["layout_reason"], "earned_reaction_accent")

    def test_plain_speaker_cut_stays_clean_when_reactions_are_allowed(self):
        segments = [
            {
                "camera_id": "cam1",
                "layout_mode": "cut",
                "layout_reason": "speaker_owned_cut",
                "secondary_camera_id": None,
                "audio_decision_reliable": True,
                "audio_leader_camera_id": "cam1",
                "audio_decision_reason": "strong_isolated_audio_owner",
                "ranked_sources": [
                    {"camera_id": "cam1", "score": 0.91},
                    {"camera_id": "cam2", "score": 0.2},
                ],
            }
        ]

        [segment] = worker.enforce_reaction_overlay_on_multicam_segments(
            segments,
            self.prepared_sources,
            enabled=True,
        )

        self.assertEqual(segment["camera_id"], "cam1")
        self.assertEqual(segment["layout_mode"], "cut")
        self.assertIsNone(segment["secondary_camera_id"])
        self.assertEqual(segment["layout_reason"], "speaker_owned_cut")

    def test_reaction_reason_without_pip_layout_does_not_create_overlay(self):
        segments = [
            {
                "camera_id": "cam1",
                "layout_mode": "cut",
                "layout_reason": "earned_reaction_accent",
                "secondary_camera_id": None,
                "audio_decision_reliable": True,
                "audio_leader_camera_id": "cam1",
                "audio_decision_reason": "strong_isolated_audio_owner",
                "ranked_sources": [
                    {"camera_id": "cam1", "score": 0.91},
                    {"camera_id": "cam2", "score": 0.42},
                ],
            }
        ]

        [segment] = worker.enforce_reaction_overlay_on_multicam_segments(
            segments,
            self.prepared_sources,
            enabled=True,
        )

        self.assertEqual(segment["camera_id"], "cam1")
        self.assertEqual(segment["layout_mode"], "cut")
        self.assertIsNone(segment["secondary_camera_id"])
        self.assertEqual(segment["layout_reason"], "earned_reaction_accent")

    def test_strong_isolated_audio_overrides_editorial_hold(self):
        switches = [
            {
                "camera_id": "cam1",
                "start_time": 0.0,
                "layout_mode": "cut",
                "layout_reason": "speaker_owned_cut",
                "secondary_camera_id": None,
                "audio_decision_reliable": True,
                "audio_leader_camera_id": "cam2",
                "audio_decision_reason": "strong_isolated_audio_owner",
                "editorial_switch_allowed": False,
                "editorial_decision_reason": "opening_anchor_hold:unearned_primary_change",
            }
        ]

        [switch] = worker.reconcile_multicam_speaker_owner_switches(
            switches,
            ["cam1", "cam2"],
        )

        self.assertEqual(switch["camera_id"], "cam2")
        self.assertEqual(switch["secondary_camera_id"], "cam1")
        self.assertTrue(switch["layout_reason"].startswith("speaker_owner_reconciled:"))

    def test_earned_active_speaker_handoff_overrides_opening_anchor(self):
        switches = [
            {
                "camera_id": "cam1",
                "start_time": 0.0,
                "layout_mode": "cut",
                "layout_reason": "speaker_owned_cut",
                "secondary_camera_id": None,
                "audio_decision_reliable": True,
                "audio_leader_camera_id": "cam2",
                "audio_decision_reason": "clean_audio_owner",
                "editorial_switch_allowed": False,
                "editorial_decision_reason": "opening_anchor_hold:earned_active_speaker_handoff",
            }
        ]

        [switch] = worker.reconcile_multicam_speaker_owner_switches(
            switches,
            ["cam1", "cam2"],
        )

        self.assertEqual(switch["camera_id"], "cam2")
        self.assertEqual(switch["secondary_camera_id"], "cam1")
        self.assertTrue(switch["layout_reason"].startswith("speaker_owner_reconciled:"))

    def test_reaction_permission_leaves_clean_director_cut_unchanged(self):
        segments = [
            {
                "camera_id": "cam1",
                "layout_mode": "cut",
                "layout_reason": "speaker_owned_cut",
                "secondary_camera_id": None,
                "audio_decision_reliable": True,
                "audio_leader_camera_id": "cam2",
                "audio_decision_reason": "strong_isolated_audio_owner",
                "editorial_switch_allowed": False,
                "editorial_decision_reason": "opening_anchor_hold:unearned_primary_change",
            }
        ]

        [segment] = worker.enforce_reaction_overlay_on_multicam_segments(
            segments,
            self.prepared_sources,
            enabled=True,
        )

        self.assertEqual(segment["camera_id"], "cam1")
        self.assertIsNone(segment["secondary_camera_id"])
        self.assertEqual(segment["layout_mode"], "cut")

    def test_weak_clean_audio_spike_is_not_earned_handoff(self):
        self.assertFalse(
            worker.is_multicam_active_speaker_handoff_earned(
                "clean_audio_owner",
                leader_activity=0.2,
                leader_gap=0.03,
                candidate_duration_seconds=4.0,
            )
        )
        self.assertFalse(
            worker.is_multicam_active_speaker_handoff_earned(
                "visual_speaker_owner",
                leader_activity=1.0,
                leader_gap=0.0023,
                candidate_duration_seconds=10.0,
            )
        )

    def test_strong_isolated_audio_owner_is_earned_handoff(self):
        self.assertTrue(
            worker.is_multicam_active_speaker_handoff_earned(
                "strong_isolated_audio_owner",
                leader_activity=0.5903,
                leader_gap=0.5704,
                candidate_duration_seconds=0.0,
            )
        )
        self.assertTrue(
            worker.is_multicam_active_speaker_handoff_earned(
                "strong_isolated_audio_owner",
                leader_activity=1.0,
                leader_gap=0.774,
                candidate_duration_seconds=22.0,
                visual_agrees=False,
                visual_leader_score=0.6082,
                visual_leader_gap=0.1636,
                current_active_visual_score=0.6374,
            )
        )
        self.assertTrue(
            worker.is_multicam_active_speaker_handoff_earned(
                "strong_isolated_audio_owner",
                leader_activity=0.9422,
                leader_gap=0.8289,
                candidate_duration_seconds=52.0,
                visual_agrees=True,
                visual_leader_score=0.8083,
                visual_leader_gap=0.1092,
                current_active_visual_score=0.6991,
            )
        )
        self.assertTrue(
            worker.is_multicam_active_speaker_handoff_earned(
                "strong_isolated_audio_owner",
                leader_activity=1.0,
                leader_gap=0.7271,
                candidate_duration_seconds=50.0,
                visual_agrees=True,
                visual_leader_score=0.85,
                visual_leader_gap=0.2126,
                current_active_visual_score=0.6374,
            )
        )
        self.assertTrue(
            worker.is_multicam_active_speaker_handoff_earned(
                "strong_isolated_audio_owner",
                leader_activity=1.0,
                leader_gap=1.0,
                candidate_duration_seconds=0.0,
                current_active_visual_score=0.0,
            )
        )

    def test_sustained_reaction_evidence_becomes_active_speaker_handoff(self):
        self.assertTrue(
            worker.is_multicam_active_speaker_handoff_earned(
                "strong_isolated_audio_owner",
                leader_activity=1.0,
                leader_gap=0.7271,
                candidate_duration_seconds=50.0,
                visual_agrees=True,
                visual_leader_score=0.85,
                visual_leader_gap=0.2126,
                current_active_visual_score=0.6374,
            )
        )
        self.assertFalse(
            worker.is_multicam_reaction_hero_accent_earned(
                "strong_isolated_audio_owner",
                leader_activity=1.0,
                leader_gap=0.7271,
                candidate_duration_seconds=50.0,
                visual_agrees=True,
                visual_leader_score=0.85,
                visual_leader_gap=0.2126,
                current_active_visual_score=0.6374,
            )
        )

    def test_fresh_isolated_speaker_spike_is_handoff_not_reaction_hero(self):
        self.assertTrue(
            worker.is_multicam_active_speaker_handoff_earned(
                "strong_isolated_audio_owner",
                leader_activity=0.78,
                leader_gap=0.42,
                candidate_duration_seconds=2.0,
                visual_agrees=True,
                visual_leader_score=0.85,
                visual_leader_gap=0.2126,
                current_active_visual_score=0.6374,
            )
        )
        self.assertFalse(
            worker.is_multicam_reaction_hero_accent_earned(
                "strong_isolated_audio_owner",
                leader_activity=0.78,
                leader_gap=0.42,
                candidate_duration_seconds=2.0,
                visual_agrees=True,
                visual_leader_score=0.85,
                visual_leader_gap=0.2126,
                current_active_visual_score=0.6374,
            )
        )

    def test_reaction_hero_accent_needs_visual_confirmation(self):
        self.assertFalse(
            worker.is_multicam_reaction_hero_accent_earned(
                "strong_isolated_audio_owner",
                leader_activity=1.0,
                leader_gap=0.7271,
                visual_agrees=False,
                visual_leader_score=0.85,
                visual_leader_gap=0.2126,
                current_active_visual_score=0.6374,
            )
        )
        self.assertFalse(
            worker.is_multicam_reaction_hero_accent_earned(
                "strong_isolated_audio_owner",
                leader_activity=1.0,
                leader_gap=0.7271,
                visual_agrees=True,
                visual_leader_score=0.85,
                visual_leader_gap=0.12,
                current_active_visual_score=0.6374,
            )
        )

    def test_multicam_caption_disable_is_respected(self):
        request = worker.RenderMultiCamRequest(
            sources=[],
            burn_captions=False,
            burnCaptions=False,
        )

        enabled, _style = worker.resolve_multicam_caption_request(request)

        self.assertFalse(enabled)

    def test_skipped_camera_audio_sync_audit_blocks_by_default(self):
        with self.assertRaises(worker.HTTPException):
            worker.enforce_multicam_post_render_sync_audit(
                {
                    "status": "skipped_no_camera_audio",
                    "message": "No audible camera scratch-audio samples were available",
                }
            )

    def test_mute_visual_proxy_blocks_external_audio_render(self):
        original = worker.MULTICAM_ALLOW_UNAUDITABLE_VISUAL_PROXY
        original_has_audio = worker.has_audio_stream
        worker.MULTICAM_ALLOW_UNAUDITABLE_VISUAL_PROXY = False
        worker.has_audio_stream = lambda _path: False
        try:
            with self.assertRaises(worker.HTTPException):
                worker.enforce_multicam_visual_source_auditability(
                    [
                        {
                            "id": "cam1",
                            "label": "Camera 1",
                            "path": "/tmp/raw-cam1.mp4",
                            "render_path": "/tmp/mute-proxy-cam1.mp4",
                            "render_time_shift_seconds": 3.0,
                        }
                    ],
                    external_audio_url="/tmp/clean.wav",
                )
        finally:
            worker.MULTICAM_ALLOW_UNAUDITABLE_VISUAL_PROXY = original
            worker.has_audio_stream = original_has_audio

    def test_audio_audit_start_accounts_for_mezzanine_shift(self):
        self.assertEqual(
            worker.get_source_audio_audit_start(
                {"audio_audit_time_shift_seconds": 12.5},
                17.25,
            ),
            4.75,
        )
        self.assertEqual(
            worker.get_source_audio_audit_start(
                {"audio_audit_time_shift_seconds": 12.5},
                6.0,
            ),
            0.0,
        )

    def test_confident_external_channel_owner_takes_opening_primary(self):
        def source(camera_id, activity):
            return {
                "id": camera_id,
                "label": camera_id,
                "duration": 60.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "has_audio": True,
                "audio_activity_source": "external_isolated_channel",
                "window_scores": [
                    {
                        "face_score": 0.0,
                        "motion_score": 0.0,
                        "visual_speaking_score": 0.0,
                        "visual_speaking_confidence": 0.0,
                    }
                    for _ in range(30)
                ],
                "timeline_audio_activity_windows": [
                    {"time": float(second), "activity": activity}
                    for second in range(60)
                ],
            }

        request = worker.RenderMultiCamRequest(
            sources=[
                worker.MultiCamSource(id="cam1", url="cam1.mp4", label="Camera 1"),
                worker.MultiCamSource(id="cam2", url="cam2.mp4", label="Camera 2"),
            ],
            auto_switch=True,
            audio_based_auto_switch=True,
            auto_switch_interval=2.0,
            auto_switch_aggressiveness="balanced",
            primary_audio_camera_id="cam1",
            overlap_start=0.0,
            overlap_duration=20.0,
        )

        switches = worker.normalize_multicam_switches(
            request,
            [
                source("cam1", 0.0692),
                source("cam2", 0.715),
            ],
            20.0,
        )

        self.assertTrue(switches)
        self.assertEqual(switches[0]["camera_id"], "cam2")
        self.assertNotIn("cam1", {switch["camera_id"] for switch in switches})
        self.assertTrue(
            all(
                switch.get("audio_leader_camera_id") == switch.get("camera_id")
                for switch in switches
                if switch.get("audio_decision_reliable")
            )
        )

    def test_isolated_channel_owner_switches_both_directions_with_reaction(self):
        def source(camera_id, activities):
            return {
                "id": camera_id,
                "label": camera_id,
                "duration": 60.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "has_audio": True,
                "audio_activity_source": "external_isolated_channel",
                "audio_activity_channel_index": 0 if camera_id == "cam1" else 1,
                "window_scores": [
                    {
                        "face_score": 0.0,
                        "motion_score": 0.0,
                        "visual_speaking_score": 0.0,
                        "visual_speaking_confidence": 0.0,
                    }
                    for _ in range(40)
                ],
                "timeline_audio_activity_windows": [
                    {"time": float(second), "activity": float(activity)}
                    for second, activity in enumerate(activities)
                ],
            }

        cam1_activity = [0.06] * 20 + [0.68] * 20
        cam2_activity = [0.72] * 20 + [0.05] * 20
        request = worker.RenderMultiCamRequest(
            sources=[
                worker.MultiCamSource(id="cam1", url="cam1.mp4", label="Camera 1"),
                worker.MultiCamSource(id="cam2", url="cam2.mp4", label="Camera 2"),
            ],
            auto_switch=True,
            audio_based_auto_switch=True,
            auto_switch_interval=2.0,
            auto_switch_aggressiveness="balanced",
            primary_audio_camera_id="cam1",
            overlap_start=0.0,
            overlap_duration=40.0,
            reactionOverlays=True,
        )

        segments = worker.build_multicam_segments_from_switches(
            request,
            [
                source("cam1", cam1_activity),
                source("cam2", cam2_activity),
            ],
            0.0,
            40.0,
        )

        self.assertTrue(segments)
        self.assertEqual(segments[0]["camera_id"], "cam2")
        self.assertTrue(any(segment["camera_id"] == "cam1" for segment in segments))
        self.assertTrue(
            all(
                segment.get("audio_leader_camera_id") == segment.get("camera_id")
                for segment in segments
                if segment.get("audio_decision_reliable")
            )
        )
        self.assertTrue(any(segment.get("layout_mode") == "cut" for segment in segments))

    def test_opening_handoff_backdates_to_clean_audio_onset(self):
        def source(camera_id, activity_by_time):
            return {
                "id": camera_id,
                "label": camera_id,
                "duration": 90.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "has_audio": True,
                "audio_activity_source": "external_isolated_channel",
                "audio_activity_channel_index": 0 if camera_id == "cam1" else 1,
                "window_scores": [
                    {
                        "face_score": 0.0,
                        "motion_score": 0.0,
                        "visual_speaking_score": 0.0,
                        "visual_speaking_confidence": 0.0,
                    }
                    for _ in range(45)
                ],
                "timeline_audio_activity_windows": [
                    {"time": float(t), "activity": float(activity)}
                    for t, activity in activity_by_time
                ],
            }

        sample_times = [index * 0.5 for index in range(180)]
        cam1_activity = []
        cam2_activity = []
        for timestamp in sample_times:
            if timestamp < 55.0:
                cam1 = 0.0
                cam2 = 0.78
            elif timestamp < 55.5:
                cam1 = 0.08
                cam2 = 0.25
            else:
                cam1 = 0.92
                cam2 = 0.28
            cam1_activity.append((timestamp, cam1))
            cam2_activity.append((timestamp, cam2))

        request = worker.RenderMultiCamRequest(
            sources=[
                worker.MultiCamSource(id="cam1", url="cam1.mp4", label="Camera 1"),
                worker.MultiCamSource(id="cam2", url="cam2.mp4", label="Camera 2"),
            ],
            auto_switch=True,
            audio_based_auto_switch=True,
            auto_switch_interval=2.0,
            auto_switch_aggressiveness="balanced",
            primary_audio_camera_id="cam1",
            overlap_start=0.0,
            overlap_duration=90.0,
            reactionOverlays=True,
        )

        segments = worker.build_multicam_segments_from_switches(
            request,
            [
                source("cam1", cam1_activity),
                source("cam2", cam2_activity),
            ],
            0.0,
            90.0,
        )

        cam1_segments = [segment for segment in segments if segment["camera_id"] == "cam1"]
        self.assertTrue(cam1_segments)
        self.assertLessEqual(cam1_segments[0]["timeline_start"], 55.5)
        self.assertGreaterEqual(cam1_segments[0]["timeline_start"], 55.0)
        self.assertTrue(any(segment.get("layout_mode") == "cut" for segment in segments))

    def test_unproven_speaker_coverage_uses_shared_layout_not_guessed_pip(self):
        prepared_sources = [
            {
                "id": "cam1",
                "label": "cam1",
                "duration": 20.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "has_audio": True,
                "audio_activity_source": "external_isolated_channel",
                "audio_activity_channel_index": 0,
                "window_scores": [
                    {
                        "face_score": 0.0,
                        "motion_score": 0.0,
                        "visual_speaking_score": 0.0,
                        "visual_speaking_confidence": 0.0,
                    }
                    for _ in range(10)
                ],
                "timeline_audio_activity_windows": [
                    {"time": float(second), "activity": 0.22}
                    for second in range(20)
                ],
            },
            {
                "id": "cam2",
                "label": "cam2",
                "duration": 20.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "has_audio": True,
                "audio_activity_source": "external_isolated_channel",
                "audio_activity_channel_index": 1,
                "window_scores": [
                    {
                        "face_score": 0.0,
                        "motion_score": 0.0,
                        "visual_speaking_score": 0.0,
                        "visual_speaking_confidence": 0.0,
                    }
                    for _ in range(10)
                ],
                "timeline_audio_activity_windows": [
                    {"time": float(second), "activity": 0.24}
                    for second in range(20)
                ],
            },
        ]
        request = worker.RenderMultiCamRequest(
            sources=[
                worker.MultiCamSource(id="cam1", url="cam1.mp4", label="Camera 1"),
                worker.MultiCamSource(id="cam2", url="cam2.mp4", label="Camera 2"),
            ],
            auto_switch=True,
            audio_based_auto_switch=True,
            auto_switch_interval=2.0,
            auto_switch_aggressiveness="balanced",
            overlap_start=0.0,
            overlap_duration=20.0,
        )

        segments = worker.build_multicam_segments_from_switches(
            request,
            prepared_sources,
            0.0,
            20.0,
        )

        self.assertTrue(segments)
        self.assertTrue(all(segment["layout_mode"] == "split-vertical" for segment in segments))
        self.assertTrue(
            all("uncertain_speaker_coverage" in str(segment.get("layout_reason")) for segment in segments)
        )

    def test_visual_proxy_cache_uses_stable_identity_not_job_path(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source_a = os.path.join(tmpdir, "job_a_src.mp4")
            source_b = os.path.join(tmpdir, "job_b_src.mp4")
            with open(source_a, "wb") as handle:
                handle.write(b"fake-media" * 2048)
            os.link(source_a, source_b)

            cache_a = worker.multicam_visual_proxy_cache_path(
                source_a,
                "scale=1920:1080:start=0.000:duration=20.000",
                1920,
                1080,
                cache_identity="stable-camera-fingerprint",
            )
            cache_b = worker.multicam_visual_proxy_cache_path(
                source_b,
                "scale=1920:1080:start=0.000:duration=20.000",
                1920,
                1080,
                cache_identity="stable-camera-fingerprint",
            )

        self.assertEqual(cache_a, cache_b)

    def test_source_activity_cache_uses_stable_source_identity_not_temp_analysis_path(self):
        source = {
            "id": "cam1",
            "visual_cache_key": "stable-camera-fingerprint",
            "audio_activity_source": "trusted_director_channel",
            "audio_activity_channel_index": 0,
            "offset_seconds": -3.346685,
            "sync_rate": 1.000263039,
        }

        payload_a = worker.build_multicam_source_activity_receipt_cache_payload(
            source,
            "/tmp/job_a_multicam_src_0.mp4",
            2.355701,
            22.505261,
            1.0,
        )
        payload_b = worker.build_multicam_source_activity_receipt_cache_payload(
            source,
            "/tmp/job_b_multicam_src_0.mp4",
            2.355701,
            22.505261,
            1.0,
        )

        self.assertEqual(payload_a, payload_b)
        self.assertEqual(
            worker.multicam_receipt_cache_path("source_activity", payload_a),
            worker.multicam_receipt_cache_path("source_activity", payload_b),
        )

    def test_video_only_post_render_sync_audit_reuse_marks_receipt(self):
        original = {
            "status": "good",
            "path": "/tmp/pre.mp4",
            "sample_count": 2,
            "max_abs_residual_seconds": 0.004,
            "samples": [{"camera_id": "cam1", "status": "ok"}],
        }

        reused = worker.reuse_multicam_video_only_sync_audit(
            original,
            "/tmp/final.mp4",
            "caption_and_branding_filters_copy_audio",
            job_id="unit",
        )

        self.assertEqual(reused["status"], "good")
        self.assertEqual(reused["path"], "/tmp/final.mp4")
        self.assertEqual(reused["reused_from"], "pre_caption_sync_audit")
        self.assertTrue(reused["audio_timing_preserved"])
        self.assertTrue(reused["samples"][0]["reused"])
        self.assertNotIn("reused_from", original)

    def test_render_equivalent_segments_merge_reason_only_boundaries(self):
        segments = [
            {
                "camera_id": "cam2",
                "secondary_camera_id": "cam1",
                "layout_mode": "pip",
                "layout_reason": "earned_reaction_accent",
                "timeline_start": 38.0,
                "timeline_end": 42.0,
                "source_start": 39.94,
                "source_end": 43.94,
                "layout_confidence": 0.7,
            },
            {
                "camera_id": "cam2",
                "secondary_camera_id": "cam1",
                "layout_mode": "pip",
                "layout_reason": "active_speaker_with_reaction:accent_release",
                "timeline_start": 42.0,
                "timeline_end": 72.0,
                "source_start": 43.94,
                "source_end": 73.94,
                "layout_confidence": 0.9,
            },
        ]

        merged, receipt = worker.merge_render_equivalent_multicam_segments(segments)

        self.assertEqual(receipt["input_segment_count"], 2)
        self.assertEqual(receipt["render_segment_count"], 1)
        self.assertEqual(receipt["merge_count"], 1)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["timeline_start"], 38.0)
        self.assertEqual(merged[0]["timeline_end"], 72.0)
        self.assertEqual(merged[0]["source_start"], 39.94)
        self.assertEqual(merged[0]["source_end"], 73.94)
        self.assertEqual(merged[0]["render_merged_segment_count"], 2)
        self.assertIn("earned_reaction_accent", merged[0]["layout_reason"])
        self.assertIn("active_speaker_with_reaction:accent_release", merged[0]["layout_reason"])

    def test_render_equivalent_segments_do_not_merge_camera_or_layout_changes(self):
        segments = [
            {
                "camera_id": "cam2",
                "secondary_camera_id": "cam1",
                "layout_mode": "pip",
                "timeline_start": 0.0,
                "timeline_end": 10.0,
                "source_start": 1.0,
                "source_end": 11.0,
            },
            {
                "camera_id": "cam1",
                "secondary_camera_id": "cam2",
                "layout_mode": "pip",
                "timeline_start": 10.0,
                "timeline_end": 20.0,
                "source_start": 11.0,
                "source_end": 21.0,
            },
            {
                "camera_id": "cam1",
                "secondary_camera_id": "cam2",
                "layout_mode": "split-vertical",
                "timeline_start": 20.0,
                "timeline_end": 24.0,
                "source_start": 21.0,
                "source_end": 25.0,
            },
        ]

        merged, receipt = worker.merge_render_equivalent_multicam_segments(segments)

        self.assertEqual(receipt["render_segment_count"], 3)
        self.assertEqual(receipt["merge_count"], 0)
        self.assertEqual([item["camera_id"] for item in merged], ["cam2", "cam1", "cam1"])
        self.assertEqual([item["layout_mode"] for item in merged], ["pip", "pip", "split-vertical"])

    def test_final_quality_gate_passes_only_after_sync_and_director_audits(self):
        gate = worker.build_multicam_final_quality_gate(
            output_validation={"has_video_stream": True, "has_audio_stream": True},
            post_render_sync_audit={
                "status": "good",
                "sample_count": 12,
                "usable_sample_count": 12,
                "max_abs_residual_seconds": 0.022,
            },
            layout_contract_audit={"status": "passed", "issue_count": 0},
            director_truth_audit={"status": "passed", "issue_count": 0},
            director_latency_audit={"status": "passed", "issue_count": 0},
            director_audio={"status": "active", "mapping_method": "request_override"},
            continuous_sync_anchors={"status": "active", "active_camera_count": 2},
            segment_duration_receipts=[
                {"ok": True, "delta_seconds": 0.0},
                {"ok": True, "delta_seconds": 0.017},
            ],
        )

        self.assertEqual(gate["status"], "passed")
        self.assertTrue(gate["passed"])
        worker.enforce_multicam_final_quality_gate(gate)

    def test_final_quality_gate_blocks_bad_sync_even_if_output_exists(self):
        gate = worker.build_multicam_final_quality_gate(
            output_validation={"has_video_stream": True, "has_audio_stream": True},
            post_render_sync_audit={
                "status": "unsafe",
                "sample_count": 12,
                "usable_sample_count": 12,
                "max_abs_residual_seconds": 0.42,
            },
            layout_contract_audit={"status": "passed", "issue_count": 0},
            director_truth_audit={"status": "passed", "issue_count": 0},
            director_latency_audit={"status": "passed", "issue_count": 0},
            director_audio={"status": "active"},
            continuous_sync_anchors={"status": "active", "active_camera_count": 2},
            segment_duration_receipts=[{"ok": True, "delta_seconds": 0.0}],
        )

        self.assertEqual(gate["status"], "failed")
        self.assertFalse(gate["passed"])
        self.assertIn(
            "post_render_sync",
            {check["name"] for check in gate["checks"] if not check["passed"]},
        )
        with self.assertRaises(worker.HTTPException):
            worker.enforce_multicam_final_quality_gate(gate)

    def test_final_quality_gate_allows_accepted_unsafe_anchor_after_dense_sync_passes(self):
        unsafe_anchor_residual = worker.MULTICAM_POST_RENDER_SYNC_UNSAFE_SECONDS + 0.01
        gate = worker.build_multicam_final_quality_gate(
            output_validation={"has_video_stream": True, "has_audio_stream": True},
            post_render_sync_audit={
                "status": "good",
                "sample_count": 78,
                "candidate_sample_count": 78,
                "sample_coverage_ratio": 1.0,
                "max_sample_gap_seconds": 61.0,
                "usable_sample_count": 75,
                "max_abs_residual_seconds": 0.052,
            },
            layout_contract_audit={"status": "passed", "issue_count": 0},
            director_truth_audit={"status": "passed", "issue_count": 0},
            director_latency_audit={"status": "passed", "issue_count": 0},
            director_audio={"status": "active"},
            continuous_sync_anchors={
                "status": "active",
                "active_camera_count": 2,
                "cameras": {
                    "cam1": {
                        "camera_label": "Camera 1",
                        "anchors": [
                            {
                                "checkpoint_index": 1,
                                "timeline_absolute_seconds": 1680.0,
                                "status": "accepted",
                                "abs_residual_seconds": 0.024,
                                "correlation": 0.55,
                            }
                        ],
                    },
                    "cam2": {
                        "camera_label": "Camera 2",
                        "anchors": [
                            {
                                "checkpoint_index": 7,
                                "timeline_absolute_seconds": 1500.0,
                                "status": "accepted",
                                "correction_applied": True,
                                "abs_residual_seconds": unsafe_anchor_residual,
                                "correlation": 0.62,
                            }
                        ],
                    },
                },
            },
            segment_duration_receipts=[{"ok": True, "delta_seconds": 0.0}],
        )

        self.assertEqual(gate["status"], "passed")
        anchor_check = next(
            check for check in gate["checks"] if check["name"] == "continuous_sync_anchors"
        )
        self.assertTrue(anchor_check["passed"])
        self.assertEqual(anchor_check["details"]["high_residual_anchor_count"], 1)
        self.assertEqual(anchor_check["details"]["uncorrected_high_residual_anchor_count"], 0)
        self.assertEqual(anchor_check["details"]["unsafe_residual_anchor_count"], 0)
        self.assertEqual(anchor_check["details"]["correction_anchor_count"], 1)
        self.assertEqual(anchor_check["details"]["worst_anchor"]["camera_id"], "cam2")
        worker.enforce_multicam_final_quality_gate(gate)

    def test_final_quality_gate_blocks_rejected_high_anchor_residual_after_dense_sync_passes(self):
        soft_anchor_residual = worker.MULTICAM_POST_RENDER_SYNC_GOOD_SECONDS + 0.01
        gate = worker.build_multicam_final_quality_gate(
            output_validation={"has_video_stream": True, "has_audio_stream": True},
            post_render_sync_audit={
                "status": "good",
                "sample_count": 186,
                "candidate_sample_count": 186,
                "sample_coverage_ratio": 1.0,
                "max_sample_gap_seconds": 52.0,
                "usable_sample_count": 178,
                "max_abs_residual_seconds": 0.059,
            },
            layout_contract_audit={"status": "passed", "issue_count": 0},
            director_truth_audit={"status": "passed", "issue_count": 0},
            director_latency_audit={"status": "passed", "issue_count": 0},
            director_audio={"status": "active"},
            continuous_sync_anchors={
                "status": "active",
                "active_camera_count": 2,
                "cameras": {
                    "cam2": {
                        "camera_label": "Camera 2",
                        "anchors": [
                            {
                                "checkpoint_index": 3,
                                "timeline_absolute_seconds": 1920.0,
                                "status": "rejected_low_confidence",
                                "abs_residual_seconds": soft_anchor_residual,
                                "correlation": 0.41,
                            }
                        ],
                    }
                },
            },
            segment_duration_receipts=[{"ok": True, "delta_seconds": 0.0}],
        )

        self.assertEqual(gate["status"], "failed")
        anchor_check = next(
            check for check in gate["checks"] if check["name"] == "continuous_sync_anchors"
        )
        self.assertFalse(anchor_check["passed"])
        self.assertEqual(anchor_check["severity"], "error")
        self.assertEqual(anchor_check["details"]["high_residual_anchor_count"], 1)
        self.assertEqual(anchor_check["details"]["uncorrected_high_residual_anchor_count"], 1)
        self.assertEqual(anchor_check["details"]["unsafe_residual_anchor_count"], 0)
        with self.assertRaises(worker.HTTPException):
            worker.enforce_multicam_final_quality_gate(gate)

    def test_final_quality_gate_allows_accepted_high_anchor_after_dense_sync_passes(self):
        accepted_anchor_residual = worker.MULTICAM_POST_RENDER_SYNC_GOOD_SECONDS + 0.01
        gate = worker.build_multicam_final_quality_gate(
            output_validation={"has_video_stream": True, "has_audio_stream": True},
            post_render_sync_audit={
                "status": "good",
                "sample_count": 186,
                "candidate_sample_count": 186,
                "sample_coverage_ratio": 1.0,
                "max_sample_gap_seconds": 52.0,
                "usable_sample_count": 178,
                "max_abs_residual_seconds": 0.059,
            },
            layout_contract_audit={"status": "passed", "issue_count": 0},
            director_truth_audit={"status": "passed", "issue_count": 0},
            director_latency_audit={"status": "passed", "issue_count": 0},
            director_audio={"status": "active"},
            continuous_sync_anchors={
                "status": "active",
                "active_camera_count": 2,
                "cameras": {
                    "cam2": {
                        "camera_label": "Camera 2",
                        "anchors": [
                            {
                                "checkpoint_index": 3,
                                "timeline_absolute_seconds": 1920.0,
                                "status": "accepted",
                                "abs_residual_seconds": accepted_anchor_residual,
                                "correlation": 0.41,
                            }
                        ],
                    }
                },
            },
            segment_duration_receipts=[{"ok": True, "delta_seconds": 0.0}],
        )

        self.assertEqual(gate["status"], "passed")
        anchor_check = next(
            check for check in gate["checks"] if check["name"] == "continuous_sync_anchors"
        )
        self.assertTrue(anchor_check["passed"])
        self.assertEqual(anchor_check["details"]["high_residual_anchor_count"], 1)
        self.assertEqual(anchor_check["details"]["uncorrected_high_residual_anchor_count"], 0)
        worker.enforce_multicam_final_quality_gate(gate)

    def test_final_quality_gate_blocks_required_continuous_sync_when_no_anchor_map_active(self):
        gate = worker.build_multicam_final_quality_gate(
            output_validation={"has_video_stream": True, "has_audio_stream": True},
            post_render_sync_audit={
                "status": "good",
                "sample_count": 186,
                "candidate_sample_count": 186,
                "sample_coverage_ratio": 1.0,
                "max_sample_gap_seconds": 52.0,
                "usable_sample_count": 178,
                "max_abs_residual_seconds": 0.041,
            },
            layout_contract_audit={"status": "passed", "issue_count": 0},
            director_truth_audit={"status": "passed", "issue_count": 0},
            director_latency_audit={"status": "passed", "issue_count": 0},
            director_audio={"status": "active"},
            continuous_sync_anchors={
                "enabled": True,
                "status": "skipped_no_active_camera_maps",
                "active_camera_count": 0,
                "cameras": {},
            },
            segment_duration_receipts=[{"ok": True, "delta_seconds": 0.0}],
        )

        self.assertEqual(gate["status"], "failed")
        anchor_check = next(
            check for check in gate["checks"] if check["name"] == "continuous_sync_anchors"
        )
        self.assertFalse(anchor_check["passed"])
        self.assertEqual(anchor_check["severity"], "error")
        self.assertTrue(anchor_check["details"]["required"])
        with self.assertRaises(worker.HTTPException):
            worker.enforce_multicam_final_quality_gate(gate)

    def test_final_quality_gate_does_not_require_external_anchor_maps_for_camera_audio_only(self):
        gate = worker.build_multicam_final_quality_gate(
            output_validation={"has_video_stream": True, "has_audio_stream": True},
            post_render_sync_audit={
                "status": "good",
                "sample_count": 2,
                "candidate_sample_count": 2,
                "sample_coverage_ratio": 1.0,
                "max_sample_gap_seconds": 4.0,
                "usable_sample_count": 2,
                "max_abs_residual_seconds": 0.0,
            },
            layout_contract_audit={"status": "passed", "issue_count": 0},
            director_truth_audit={"status": "passed", "issue_count": 0},
            director_latency_audit={"status": "passed", "issue_count": 0},
            director_audio=None,
            continuous_sync_anchors=None,
            continuous_sync_required=False,
            segment_duration_receipts=[{"ok": True, "delta_seconds": 0.0}],
        )

        self.assertEqual(gate["status"], "passed")
        anchor_check = next(
            check for check in gate["checks"] if check["name"] == "continuous_sync_anchors"
        )
        self.assertTrue(anchor_check["passed"])
        self.assertFalse(anchor_check["details"]["required"])

    def test_final_quality_gate_blocks_sparse_sync_proof(self):
        gate = worker.build_multicam_final_quality_gate(
            output_validation={"has_video_stream": True, "has_audio_stream": True},
            post_render_sync_audit={
                "status": "questionable",
                "sample_count": 45,
                "candidate_sample_count": 318,
                "sample_coverage_ratio": 0.14,
                "max_sample_gap_seconds": 240.0,
                "usable_sample_count": 45,
                "max_abs_residual_seconds": 0.044,
            },
            layout_contract_audit={"status": "passed", "issue_count": 0},
            director_truth_audit={"status": "passed", "issue_count": 0},
            director_latency_audit={"status": "passed", "issue_count": 0},
            director_audio={"status": "active"},
            continuous_sync_anchors={"status": "active", "active_camera_count": 2},
            segment_duration_receipts=[{"ok": True, "delta_seconds": 0.0}],
        )

        self.assertEqual(gate["status"], "failed")
        sync_check = next(check for check in gate["checks"] if check["name"] == "post_render_sync")
        self.assertEqual(sync_check["details"]["sample_coverage_ratio"], 0.14)
        self.assertEqual(sync_check["details"]["max_sample_gap_seconds"], 240.0)
        with self.assertRaises(worker.HTTPException):
            worker.enforce_multicam_final_quality_gate(gate)

    def test_post_render_sync_dense_time_coverage_allows_capped_candidate_ratio(self):
        receipt = {
            "sample_count": 320,
            "candidate_sample_count": 626,
            "sample_coverage_ratio": 0.5112,
            "max_sample_gap_seconds": 54.375,
            "usable_sample_count": 290,
            "max_abs_residual_seconds": 0.038,
        }

        self.assertTrue(worker.multicam_post_render_sync_has_dense_time_coverage(receipt))

        sparse_receipt = {
            **receipt,
            "usable_sample_count": worker.MULTICAM_POST_RENDER_SYNC_MIN_DENSE_USABLE_SAMPLES - 1,
        }
        self.assertFalse(worker.multicam_post_render_sync_has_dense_time_coverage(sparse_receipt))

    def test_post_render_sync_short_proof_uses_bounded_sample_quorum(self):
        self.assertEqual(worker.multicam_post_render_sync_min_usable_count(13, 60.0), 4)
        self.assertEqual(worker.multicam_post_render_sync_min_usable_count(2, 60.0), 2)
        self.assertEqual(worker.multicam_post_render_sync_min_usable_count(13, 600.0), 10)

    def test_continuous_sync_map_uses_mid_clip_drift_correction_anchors(self):
        source = {"offset_seconds": 0.0, "sync_rate": 1.0}
        sync_map = worker.activate_continuous_sync_map(
            source,
            [
                {
                    "status": "accepted",
                    "corrected_timeline_seconds": 0.0,
                    "source_position_seconds": 0.0,
                },
                {
                    "status": "accepted",
                    "correction_applied": True,
                    "corrected_timeline_seconds": 100.0,
                    "source_position_seconds": 103.0,
                },
                {
                    "status": "accepted",
                    "correction_applied": True,
                    "corrected_timeline_seconds": 200.0,
                    "source_position_seconds": 200.0,
                },
                {
                    "status": "rejected_low_confidence",
                    "corrected_timeline_seconds": 150.0,
                    "source_position_seconds": 400.0,
                },
            ],
        )

        self.assertTrue(sync_map["active"])
        self.assertEqual(sync_map["anchor_count"], 3)
        self.assertAlmostEqual(
            worker.get_source_start_for_timeline(source, overlap_start=0.0, timeline_start=50.0),
            51.5,
            places=4,
        )
        self.assertAlmostEqual(
            worker.get_source_start_for_timeline(source, overlap_start=0.0, timeline_start=150.0),
            151.5,
            places=4,
        )
        self.assertAlmostEqual(
            worker.get_source_start_for_timeline(source, overlap_start=0.0, timeline_start=200.0),
            200.0,
            places=4,
        )

    def test_preflight_piecewise_sync_maps_recover_nonlinear_window_drift(self):
        previous_enabled = worker.MULTICAM_PREFLIGHT_PIECEWISE_SYNC_ANCHORS
        worker.MULTICAM_PREFLIGHT_PIECEWISE_SYNC_ANCHORS = True
        try:
            source = {
                "id": "cam1",
                "label": "Host",
                "offset_seconds": 1969.003083,
                "sync_rate": 1.000250063,
            }
            preflight = {
                "status": "unsafe",
                "cameras": {
                    "cam_0": {
                        "confidence": "unsafe",
                        "avg_correlation": 0.4381,
                        "drift_seconds": 12.208,
                        "max_residual_offset_seconds": 7.139,
                        "windows": {
                            "start": {
                                "estimated_offset_seconds": 5.069,
                                "correlation": 0.44,
                                "camera_source_position_seconds": 7.0,
                                "timeline_position_seconds": 1975.0,
                            },
                            "middle": {
                                "estimated_offset_seconds": -7.139,
                                "correlation": 0.51,
                                "camera_source_position_seconds": 27.0,
                                "timeline_position_seconds": 1995.0,
                            },
                            "end": {
                                "estimated_offset_seconds": 5.059,
                                "correlation": 0.36,
                                "camera_source_position_seconds": 47.0,
                                "timeline_position_seconds": 2015.0,
                            },
                        },
                    }
                },
            }

            applied = worker.apply_preflight_piecewise_sync_maps(preflight, [source])

            self.assertEqual(len(applied), 1)
            self.assertEqual(applied[0]["correction_source"], "preflight_piecewise_sync_anchors")
            self.assertEqual(worker.multicam_preflight_blocking_cameras(preflight, applied), [])
            self.assertTrue(source["continuous_sync_map"]["active"])
            self.assertEqual(source["continuous_sync_map"]["anchor_count"], 3)
            self.assertAlmostEqual(
                worker.get_source_start_for_timeline(source, overlap_start=0.0, timeline_start=1980.069),
                7.0,
                places=3,
            )
            self.assertAlmostEqual(
                worker.get_source_start_for_timeline(source, overlap_start=0.0, timeline_start=1987.861),
                27.0,
                places=3,
            )
            self.assertAlmostEqual(
                worker.get_source_start_for_timeline(source, overlap_start=0.0, timeline_start=2020.059),
                47.0,
                places=3,
            )
        finally:
            worker.MULTICAM_PREFLIGHT_PIECEWISE_SYNC_ANCHORS = previous_enabled

    def test_preflight_piecewise_sources_request_dense_continuous_sync(self):
        source = {
            "id": "cam1",
            "preflight_piecewise_sync_applied": True,
            "continuous_sync_map": {
                "anchors": [
                    {
                        "status": "accepted",
                        "abs_residual_seconds": 2.5,
                        "source_position_seconds": 10.0,
                        "corrected_timeline_seconds": 20.0,
                    }
                ]
            },
        }

        self.assertTrue(worker.source_needs_dense_continuous_sync_anchors(source))

        payload = worker.build_multicam_continuous_sync_receipt_cache_payload(
            [source],
            "/tmp/external.wav",
            overlap_start=100.0,
            overlap_duration=60.0,
            checkpoints=[0.0, 10.0, 20.0],
        )

        self.assertEqual(payload["version"], 4)
        self.assertTrue(payload["sources"][0]["dense_continuous_sync"])
        self.assertGreater(payload["sources"][0]["source_max_shift_seconds"], worker.MULTICAM_CONTINUOUS_SYNC_MAX_SHIFT_SECONDS)

    def test_preflight_prefers_local_audio_cache_over_remote_video_url(self):
        with (
            mock.patch.object(worker.os.path, "exists", side_effect=lambda path: path == "/tmp/camera.wav"),
            mock.patch.object(worker, "has_audio_stream", return_value=True),
        ):
            selected = worker.select_multicam_preflight_audio_source({
                "path": "https://storage.example.test/camera.mov",
                "audio_analysis_path": "/tmp/camera.wav",
            })

        self.assertEqual(selected, "/tmp/camera.wav")

    def test_dense_continuous_sync_proof_replaces_per_segment_probing(self):
        interval = float(worker.MULTICAM_CONTINUOUS_SYNC_DENSE_DRIFT_INTERVAL_SECONDS)
        checkpoints = [0.0, interval, interval * 2.0, interval * 3.0]
        sources = []
        cameras = {}
        for camera_id in ("cam1", "cam2"):
            anchors = [
                {
                    "status": "accepted",
                    "timeline_relative_seconds": checkpoint,
                    "corrected_timeline_seconds": checkpoint + 5.0,
                    "source_position_seconds": checkpoint,
                    "correlation": 0.55,
                    "abs_residual_seconds": 0.04,
                }
                for checkpoint in checkpoints
            ]
            sources.append({
                "id": camera_id,
                "preflight_piecewise_sync_applied": True,
                "continuous_sync_map": {"active": True, "anchors": anchors},
            })
            cameras[camera_id] = {"active": True, "anchors": anchors}

        proof = worker.prove_multicam_segments_from_continuous_sync_anchors(
            [
                {
                    "camera_id": "cam1",
                    "secondary_camera_id": "cam2",
                    "timeline_start": 0.0,
                    "timeline_end": checkpoints[-1],
                }
            ],
            sources,
            {"status": "good"},
            {
                "status": "active",
                "checkpoints_relative_seconds": checkpoints,
                "cameras": cameras,
            },
        )

        self.assertEqual(proof["status"], "proven")
        self.assertEqual(proof["camera_count"], 2)
        self.assertTrue(all(camera["status"] == "proven" for camera in proof["cameras"]))

    def test_dense_continuous_sync_proof_falls_back_on_unsafe_anchor(self):
        anchors = [
            {
                "status": "accepted",
                "timeline_relative_seconds": 0.0,
                "corrected_timeline_seconds": 5.0,
                "correlation": 0.5,
            },
            {
                "status": "rejected_large_shift",
                "timeline_relative_seconds": 120.0,
                "correlation": 0.6,
                "abs_residual_seconds": 4.0,
            },
        ]
        proof = worker.prove_multicam_segments_from_continuous_sync_anchors(
            [{"camera_id": "cam1", "timeline_start": 0.0, "timeline_end": 120.0}],
            [{"id": "cam1", "continuous_sync_map": {"active": True, "anchors": anchors}}],
            {"status": "good"},
            {
                "status": "active",
                "checkpoints_relative_seconds": [0.0, 120.0],
                "cameras": {"cam1": {"active": True, "anchors": anchors}},
            },
        )

        self.assertEqual(proof["status"], "not_proven")
        self.assertIn("camera_not_proven:cam1", proof["reasons"])

    def test_switch_segment_falls_back_when_piecewise_source_is_out_of_bounds(self):
        request = worker.RenderMultiCamRequest(
            sources=[
                worker.MultiCamSource(id="cam1", url="cam1.mp4", label="Camera 1"),
                worker.MultiCamSource(id="cam2", url="cam2.mp4", label="Camera 2"),
            ],
            switches=[
                worker.MultiCamSwitch(camera_id="cam1", start_time=0.0),
                worker.MultiCamSwitch(camera_id="cam2", start_time=10.0),
            ],
            auto_switch=False,
            overlap_duration=20.0,
        )
        cam1 = {"id": "cam1", "label": "Camera 1", "duration": 20.0, "offset_seconds": 0.0, "sync_rate": 1.0}
        worker.activate_continuous_sync_map(
            cam1,
            [
                {"status": "accepted", "corrected_timeline_seconds": 5.0, "source_position_seconds": 0.0},
                {"status": "accepted", "corrected_timeline_seconds": 15.0, "source_position_seconds": 10.0},
            ],
        )
        cam2 = {"id": "cam2", "label": "Camera 2", "duration": 40.0, "offset_seconds": 0.0, "sync_rate": 1.0}

        segments = worker.build_multicam_segments_from_switches(request, [cam1, cam2], 0.0, 20.0)

        self.assertTrue(segments)
        self.assertEqual(segments[0]["camera_id"], "cam2")
        self.assertIn("source_bounds_fallback_from_cam1", segments[0]["layout_reason"])

    def test_trusted_director_channel_map_decodes_only_render_window(self):
        decoded_seconds = 6
        stereo_silence = b"\0\0" * 2 * 8000 * decoded_seconds
        captured_commands = []

        def fake_run(cmd, *args, **kwargs):
            captured_commands.append(cmd)
            return types.SimpleNamespace(returncode=0, stdout=stereo_silence, stderr=b"")

        prepared_sources = [
            {"id": "cam1", "label": "Camera 1", "duration": 30.0, "offset": 0.0},
            {"id": "cam2", "label": "Camera 2", "duration": 30.0, "offset": 0.0},
        ]

        with tempfile.NamedTemporaryFile(suffix=".wav") as external_audio:
            external_audio.write(b"fake")
            external_audio.flush()
            with unittest.mock.patch.dict(
                os.environ,
                {
                    "MULTICAM_DIRECTOR_CHANNEL_AUTOMAP_SECONDS": "180",
                    "MULTICAM_TRUST_DIRECTOR_CHANNEL_OVERRIDE": "1",
                },
            ), unittest.mock.patch.object(worker.subprocess, "run", side_effect=fake_run), unittest.mock.patch.object(
                worker, "get_media_duration", return_value=30.0
            ):
                receipt = worker.apply_external_director_channel_activity(
                    prepared_sources,
                    external_audio.name,
                    overlap_start=0.0,
                    overlap_duration=5.0,
                    segment_duration=0.5,
                    channel_camera_ids_override=["cam1", "cam2"],
                )

        self.assertEqual(receipt["status"], "active")
        self.assertLessEqual(receipt["decode_duration_seconds"], 6.01)
        self.assertIn("-t", captured_commands[0])
        t_index = captured_commands[0].index("-t") + 1
        self.assertLessEqual(float(captured_commands[0][t_index]), 6.01)

    def test_director_channel_override_rejects_confident_auto_conflict_by_default(self):
        decoded_seconds = 6
        stereo_silence = b"\0\0" * 2 * 8000 * decoded_seconds

        def fake_run(cmd, *args, **kwargs):
            return types.SimpleNamespace(returncode=0, stdout=stereo_silence, stderr=b"")

        prepared_sources = [
            {"id": "cam1", "label": "Camera 1", "duration": 30.0, "offset": 0.0},
            {"id": "cam2", "label": "Camera 2", "duration": 30.0, "offset": 0.0},
        ]
        auto_receipt = {
            "mapping_confident": True,
            "mapped_camera_ids": ["cam2", "cam1"],
            "method": "auto_unit",
            "score_margin": 0.20,
        }

        with tempfile.NamedTemporaryFile(suffix=".wav") as external_audio:
            external_audio.write(b"fake")
            external_audio.flush()
            with unittest.mock.patch.dict(
                os.environ,
                {},
                clear=False,
            ), unittest.mock.patch.object(worker.subprocess, "run", side_effect=fake_run), unittest.mock.patch.object(
                worker, "get_media_duration", return_value=30.0
            ), unittest.mock.patch.object(
                worker, "auto_map_multicam_director_channels", return_value=auto_receipt
            ):
                receipt = worker.apply_external_director_channel_activity(
                    prepared_sources,
                    external_audio.name,
                    overlap_start=0.0,
                    overlap_duration=5.0,
                    segment_duration=0.5,
                    channel_camera_ids_override=["cam1", "cam2"],
                )

        self.assertEqual(receipt["status"], "unproven_channel_mapping")
        self.assertEqual(receipt["mapping_method"], "override_conflicted_with_audio_evidence")
        self.assertEqual(receipt["channel_camera_ids"], ["cam1", "cam2"])
        self.assertEqual(receipt["auto_mapping"]["requested_camera_ids"], ["cam1", "cam2"])
        self.assertEqual(receipt["auto_mapping"]["override_conflict"]["status"], "rejected")
        self.assertNotIn("audio_activity_channel_index", prepared_sources[0])
        self.assertNotIn("audio_activity_channel_index", prepared_sources[1])

    def test_director_channel_override_rejects_request_when_automap_is_ambiguous(self):
        decoded_seconds = 6
        stereo_silence = b"\0\0" * 2 * 8000 * decoded_seconds

        def fake_run(cmd, *args, **kwargs):
            return types.SimpleNamespace(returncode=0, stdout=stereo_silence, stderr=b"")

        prepared_sources = [
            {"id": "cam1", "label": "Camera 1", "duration": 30.0, "offset": 0.0},
            {"id": "cam2", "label": "Camera 2", "duration": 30.0, "offset": 0.0},
        ]
        auto_receipt = {
            "mapping_confident": False,
            "mapped_camera_ids": ["cam2", "cam1"],
            "method": "auto_unit",
            "score_margin": 0.02,
        }

        with tempfile.NamedTemporaryFile(suffix=".wav") as external_audio:
            external_audio.write(b"fake")
            external_audio.flush()
            with unittest.mock.patch.dict(
                os.environ,
                {},
                clear=False,
            ), unittest.mock.patch.object(worker.subprocess, "run", side_effect=fake_run), unittest.mock.patch.object(
                worker, "get_media_duration", return_value=30.0
            ), unittest.mock.patch.object(
                worker, "auto_map_multicam_director_channels", return_value=auto_receipt
            ):
                receipt = worker.apply_external_director_channel_activity(
                    prepared_sources,
                    external_audio.name,
                    overlap_start=0.0,
                    overlap_duration=5.0,
                    segment_duration=0.5,
                    channel_camera_ids_override=["cam1", "cam2"],
                )

        self.assertEqual(receipt["status"], "unproven_channel_mapping")
        self.assertEqual(receipt["mapping_method"], "request_override_ambiguous_auto_not_trusted")
        self.assertEqual(receipt["channel_camera_ids"], ["cam1", "cam2"])
        self.assertEqual(receipt["auto_mapping"]["override_validation"]["status"], "ambiguous_auto_rejected_request")
        self.assertNotIn("audio_activity_channel_index", prepared_sources[0])
        self.assertNotIn("audio_activity_channel_index", prepared_sources[1])

    def test_director_channel_override_can_be_trusted_when_automap_is_ambiguous(self):
        decoded_seconds = 6
        stereo_silence = b"\0\0" * 2 * 8000 * decoded_seconds

        def fake_run(cmd, *args, **kwargs):
            return types.SimpleNamespace(returncode=0, stdout=stereo_silence, stderr=b"")

        prepared_sources = [
            {"id": "cam1", "label": "Camera 1", "duration": 30.0, "offset": 0.0},
            {"id": "cam2", "label": "Camera 2", "duration": 30.0, "offset": 0.0},
        ]
        auto_receipt = {
            "mapping_confident": False,
            "mapped_camera_ids": ["cam2", "cam1"],
            "method": "auto_unit",
            "score_margin": 0.02,
        }

        with tempfile.NamedTemporaryFile(suffix=".wav") as external_audio:
            external_audio.write(b"fake")
            external_audio.flush()
            with unittest.mock.patch.dict(
                os.environ,
                {"MULTICAM_TRUST_DIRECTOR_CHANNEL_OVERRIDE": "1"},
            ), unittest.mock.patch.object(worker.subprocess, "run", side_effect=fake_run), unittest.mock.patch.object(
                worker, "get_media_duration", return_value=30.0
            ), unittest.mock.patch.object(
                worker, "auto_map_multicam_director_channels", return_value=auto_receipt
            ):
                receipt = worker.apply_external_director_channel_activity(
                    prepared_sources,
                    external_audio.name,
                    overlap_start=0.0,
                    overlap_duration=5.0,
                    segment_duration=0.5,
                    channel_camera_ids_override=["cam1", "cam2"],
                )

        self.assertEqual(receipt["status"], "active")
        self.assertEqual(receipt["mapping_method"], "request_override_trusted_without_audio_proof")
        self.assertEqual(receipt["channel_camera_ids"], ["cam1", "cam2"])
        self.assertEqual(receipt["auto_mapping"]["override_trust"]["status"], "trusted_without_audio_proof")
        self.assertEqual(prepared_sources[0]["audio_activity_channel_index"], 0)
        self.assertEqual(prepared_sources[1]["audio_activity_channel_index"], 1)

    def test_director_channel_override_can_be_trusted_by_contract_when_automap_is_ambiguous(self):
        decoded_seconds = 6
        stereo_silence = b"\0\0" * 2 * 8000 * decoded_seconds

        def fake_run(cmd, *args, **kwargs):
            return types.SimpleNamespace(returncode=0, stdout=stereo_silence, stderr=b"")

        prepared_sources = [
            {"id": "cam1", "label": "Camera 1", "duration": 30.0, "offset": 0.0},
            {"id": "cam2", "label": "Camera 2", "duration": 30.0, "offset": 0.0},
        ]
        auto_receipt = {
            "mapping_confident": False,
            "mapped_camera_ids": ["cam2", "cam1"],
            "method": "auto_unit",
            "score_margin": 0.02,
        }
        trusted_proof = {
            "trusted": True,
            "reason": "director_channel_map_trusted",
            "contract_id": "episode2-beta-sync-v1",
        }

        with tempfile.NamedTemporaryFile(suffix=".wav") as external_audio:
            external_audio.write(b"fake")
            external_audio.flush()
            with unittest.mock.patch.dict(
                os.environ,
                {},
                clear=False,
            ), unittest.mock.patch.object(worker.subprocess, "run", side_effect=fake_run), unittest.mock.patch.object(
                worker, "get_media_duration", return_value=30.0
            ), unittest.mock.patch.object(
                worker, "auto_map_multicam_director_channels", return_value=auto_receipt
            ):
                receipt = worker.apply_external_director_channel_activity(
                    prepared_sources,
                    external_audio.name,
                    overlap_start=0.0,
                    overlap_duration=5.0,
                    segment_duration=0.5,
                    channel_camera_ids_override=["cam1", "cam2"],
                    trusted_channel_mapping_proof=trusted_proof,
                )

        self.assertEqual(receipt["status"], "active")
        self.assertEqual(receipt["mapping_method"], "request_override_trusted_without_audio_proof")
        self.assertEqual(receipt["auto_mapping"]["override_trust"]["reason"], "director_channel_map_trusted")
        self.assertEqual(receipt["auto_mapping"]["override_trust"]["contract_id"], "episode2-beta-sync-v1")
        self.assertEqual(prepared_sources[0]["audio_activity_channel_index"], 0)
        self.assertEqual(prepared_sources[1]["audio_activity_channel_index"], 1)

    def test_director_channel_override_can_be_explicitly_corrected(self):
        decoded_seconds = 6
        stereo_silence = b"\0\0" * 2 * 8000 * decoded_seconds

        def fake_run(cmd, *args, **kwargs):
            return types.SimpleNamespace(returncode=0, stdout=stereo_silence, stderr=b"")

        prepared_sources = [
            {"id": "cam1", "label": "Camera 1", "duration": 30.0, "offset": 0.0},
            {"id": "cam2", "label": "Camera 2", "duration": 30.0, "offset": 0.0},
        ]
        auto_receipt = {
            "mapping_confident": True,
            "mapped_camera_ids": ["cam2", "cam1"],
            "method": "auto_unit",
            "score_margin": 0.20,
        }

        with tempfile.NamedTemporaryFile(suffix=".wav") as external_audio:
            external_audio.write(b"fake")
            external_audio.flush()
            with unittest.mock.patch.dict(
                os.environ,
                {"MULTICAM_DIRECTOR_CHANNEL_OVERRIDE_CONFLICT": "correct"},
            ), unittest.mock.patch.object(worker.subprocess, "run", side_effect=fake_run), unittest.mock.patch.object(
                worker, "get_media_duration", return_value=30.0
            ), unittest.mock.patch.object(
                worker, "auto_map_multicam_director_channels", return_value=auto_receipt
            ):
                receipt = worker.apply_external_director_channel_activity(
                    prepared_sources,
                    external_audio.name,
                    overlap_start=0.0,
                    overlap_duration=5.0,
                    segment_duration=0.5,
                    channel_camera_ids_override=["cam1", "cam2"],
                )

        self.assertEqual(receipt["status"], "active")
        self.assertEqual(receipt["mapping_method"], "request_override_corrected_by_auto")
        self.assertEqual(receipt["channel_camera_ids"], ["cam2", "cam1"])
        self.assertEqual(receipt["auto_mapping"]["override_conflict"]["status"], "corrected")
        self.assertEqual(prepared_sources[0]["audio_activity_channel_index"], 1)
        self.assertEqual(prepared_sources[1]["audio_activity_channel_index"], 0)

    def test_trusted_sync_contract_validates_sources_window_and_channel_map(self):
        request = worker.RenderMultiCamRequest(
            sources=[
                worker.MultiCamSource(id="cam1", url="file:///tmp/cam1.mp4"),
                worker.MultiCamSource(id="cam2", url="file:///tmp/cam2.mp4"),
            ],
            trustedSyncContract={
                "id": "episode2-beta-sync-v1",
                "status": "locked",
                "sources": {
                    "cam1": {"offset_seconds": -1.92, "sync_rate": 1.00024},
                    "cam2": {"offset_seconds": 0.08, "sync_rate": 0.99991},
                },
                "timeline_windows": [{"start": 600.0, "end": 900.0}],
                "director_channel_map": {
                    "status": "locked",
                    "channel_camera_ids": ["cam2", "cam1"],
                },
            },
        )

        sync_receipt = worker.validate_multicam_trusted_sync_contract(request, 720.0, 60.0)
        channel_receipt = worker.validate_multicam_trusted_director_channel_map(request)

        self.assertTrue(sync_receipt["trusted"])
        self.assertEqual(sync_receipt["contract_id"], "episode2-beta-sync-v1")
        self.assertEqual(sync_receipt["source_sync"]["cam1"]["offset_seconds"], -1.92)
        self.assertEqual(sync_receipt["source_sync"]["cam2"]["sync_rate"], 0.99991)
        self.assertTrue(channel_receipt["trusted"])
        self.assertEqual(channel_receipt["channel_camera_ids"], ["cam2", "cam1"])

    def test_trusted_sync_contract_rejects_missing_request_source(self):
        request = worker.RenderMultiCamRequest(
            sources=[
                worker.MultiCamSource(id="cam1", url="file:///tmp/cam1.mp4"),
                worker.MultiCamSource(id="cam2", url="file:///tmp/cam2.mp4"),
            ],
            trustedSyncContract={
                "status": "locked",
                "sources": {
                    "cam1": {"offset_seconds": 0.0, "sync_rate": 1.0},
                },
                "timeline_windows": [{"start": 0.0, "end": 120.0}],
            },
        )

        receipt = worker.validate_multicam_trusted_sync_contract(request, 30.0, 30.0)

        self.assertFalse(receipt["trusted"])
        self.assertEqual(receipt["reason"], "sync_contract_missing_request_sources")
        self.assertEqual(receipt["missing_source_ids"], ["cam2"])

    def test_preflight_cache_payload_includes_render_timeline_window(self):
        sources = [
            {
                "id": "cam1",
                "path": "/tmp/cam1.mp4",
                "visual_cache_key": "cam1-window",
                "duration": 34.0,
                "source_window_start_seconds": 2.25,
                "offset_seconds": 3.421431,
                "sync_rate": 1.000272926,
                "has_audio": True,
            }
        ]

        payload = worker.build_multicam_preflight_receipt_cache_payload(
            sources,
            source_offsets=[3.421431],
            source_sync_rates=[1.000272926],
            external_audio_identity="clean-audio",
            external_audio_offset_seconds=0.0,
            timeline_start_seconds=5.684616,
            timeline_duration_seconds=30.0,
        )

        self.assertEqual(payload["version"], 3)
        self.assertEqual(
            payload["timeline_window"],
            {
                "active": True,
                "timeline_start_seconds": 5.684616,
                "timeline_duration_seconds": 30.0,
            },
        )
        self.assertEqual(payload["sources"][0]["source_window_start_seconds"], 2.25)

    def test_multicam_request_does_not_default_to_clap_alignment(self):
        request = worker.RenderMultiCamRequest(
            sources=[
                worker.MultiCamSource(id="cam1", url="file:///tmp/cam1.mp4"),
                worker.MultiCamSource(id="cam2", url="file:///tmp/cam2.mp4"),
            ]
        )

        self.assertFalse(request.pre_sync_clap_alignment)
        self.assertIsNone(request.preSyncClapAlignment)
        self.assertFalse(request.reaction_overlays)
        self.assertIsNone(request.reactionOverlays)
        self.assertEqual(request.output_aspect_ratio, "16:9")

    def test_media_log_locator_removes_firebase_download_token(self):
        source = (
            "https://firebasestorage.googleapis.com/v0/b/example/o/cam.mp4"
            "?alt=media&token=never-log-this-token"
        )

        sanitized = worker.redact_media_locator_for_logs(source)

        self.assertIn("cam.mp4?[REDACTED]", sanitized)
        self.assertNotIn("never-log-this-token", sanitized)
        self.assertNotIn("alt=media", sanitized)

    def test_subprocess_text_redaction_removes_signed_url_query(self):
        log_line = (
            "Input from https://storage.googleapis.com/example/cam.mp4"
            "?X-Goog-Signature=secret-signature&X-Goog-Credential=secret-credential"
        )

        sanitized = worker.redact_sensitive_urls_in_text(log_line)

        self.assertIn("cam.mp4?[REDACTED]", sanitized)
        self.assertNotIn("secret-signature", sanitized)
        self.assertNotIn("secret-credential", sanitized)

    def test_video_dimensions_accept_ffprobe_csv_with_empty_rotation_column(self):
        probe_result = types.SimpleNamespace(stdout="1920x1080x\n")
        with mock.patch.object(worker.subprocess, "run", return_value=probe_result):
            self.assertEqual(worker.get_video_dimensions("/tmp/phone.mov"), (1920, 1080))

    def test_output_dimensions_preserve_requested_program_aspect(self):
        self.assertEqual(worker.get_multicam_output_dimensions("9:16"), (1080, 1920))
        self.assertEqual(worker.get_multicam_output_dimensions("1:1"), (1080, 1080))
        self.assertEqual(worker.get_multicam_output_dimensions("16:9"), (1920, 1080))
        self.assertEqual(worker.get_multicam_output_dimensions(None), (1920, 1080))

    def test_landscape_single_cut_is_full_screen_not_a_rounded_card(self):
        filter_chain = worker.multicam_single_cut_filter(
            "camera",
            1920,
            1080,
            "program",
            is_vertical_output=False,
            focus_x=0.5,
        )

        self.assertIn("scale=1920:1080:force_original_aspect_ratio=increase", filter_chain)
        self.assertNotIn("split=2", filter_chain)
        self.assertNotIn("boxblur", filter_chain)
        self.assertNotIn("movie=", filter_chain)

    def test_vertical_single_cut_is_full_screen_and_focus_centered(self):
        filter_chain = worker.multicam_single_cut_filter(
            "camera",
            1080,
            1920,
            "program",
            is_vertical_output=True,
            focus_x=0.31,
        )

        self.assertIn("scale=1080:1920:force_original_aspect_ratio=increase", filter_chain)
        self.assertIn("iw*0.3100-ow/2", filter_chain)
        self.assertNotIn("split=2", filter_chain)
        self.assertNotIn("boxblur", filter_chain)
        self.assertNotIn("movie=", filter_chain)

    def test_vertical_reaction_layout_uses_full_screen_hero_and_small_overlay(self):
        geometry = worker.multicam_pip_geometry(
            1080,
            1920,
            primary_source={"focus_x": 0.82},
            reaction_count=1,
        )

        self.assertEqual(geometry["hero"], {"x": 0, "y": 0, "width": 1080, "height": 1920})
        self.assertLessEqual(geometry["pip"]["width"], int(1080 * 0.31))
        self.assertEqual(geometry["reaction_side"], "left")

    def test_landscape_reaction_layout_keeps_full_screen_hero(self):
        geometry = worker.multicam_pip_geometry(
            1920,
            1080,
            primary_source={"focus_x": 0.2},
            reaction_count=1,
        )

        self.assertEqual(geometry["hero"], {"x": 0, "y": 0, "width": 1920, "height": 1080})
        self.assertLessEqual(geometry["pip"]["width"], int(1920 * 0.20))
        self.assertEqual(geometry["reaction_side"], "right")

    def test_rounded_card_content_crops_edge_to_edge_without_inner_rectangle(self):
        filter_chain = worker.multicam_modern_card_filter(
            "camera",
            900,
            700,
            "card",
            focus_x=0.42,
        )

        self.assertIn("force_original_aspect_ratio=increase", filter_chain)
        self.assertIn("crop=900:700", filter_chain)
        self.assertNotIn("split=2", filter_chain)
        self.assertNotIn("force_original_aspect_ratio=decrease", filter_chain)
        self.assertNotIn("overlay=", filter_chain)

    def test_visual_proxy_preserves_source_aspect_without_padding(self):
        with mock.patch.object(worker, "get_video_dimensions", return_value=(1920, 1080)):
            dimensions = worker.get_multicam_source_proxy_dimensions(
                {"path": "/tmp/camera.mov", "rotation_degrees": 0},
                max_long_edge=1280,
            )
        visual_filter = worker.build_multicam_proxy_visual_filter(
            {"rotation_degrees": 0},
            *dimensions,
        )

        self.assertEqual(dimensions, (1280, 720))
        self.assertIn("scale=1280:720", visual_filter)
        self.assertNotIn("pad=", visual_filter)

    def test_hlg_tonemap_keeps_source_colour_and_sdr_camera_is_reference(self):
        hlg_filter = worker.build_multicam_base_color_filter(
            {"color_transfer": "arib-std-b67", "color_primaries": "bt2020"}
        )
        sources = [
            {"path": "/tmp/hdr.mov", "color_metadata": {"color_transfer": "arib-std-b67"}},
            {"path": "/tmp/sdr.mov", "color_metadata": {"color_transfer": "bt709"}},
        ]

        self.assertIn("tonemap=hable:desat=0.0", hlg_filter)
        self.assertNotIn("desat=0.35", hlg_filter)
        self.assertEqual(worker.choose_multicam_color_reference_index(sources, 0), 1)

    def test_default_cinematic_polish_is_neutral(self):
        with mock.patch.dict(os.environ, {"MULTICAM_CINEMATIC_POLISH_MODE": "fast"}):
            polish_filter = worker.build_multicam_cinematic_polish_filter()

        self.assertEqual(polish_filter, "format=yuv420p")
        self.assertNotIn("eq=", polish_filter)
        self.assertNotIn("unsharp", polish_filter)
        self.assertNotIn("colorbalance", polish_filter)

    def test_color_matching_defaults_to_normalization_only(self):
        sources = [
            {
                "id": "hdr",
                "label": "HDR camera",
                "path": "/tmp/hdr.mov",
                "duration": 60.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "color_metadata": {"color_transfer": "arib-std-b67"},
            },
            {
                "id": "sdr",
                "label": "SDR camera",
                "path": "/tmp/sdr.mov",
                "duration": 60.0,
                "offset_seconds": 0.0,
                "sync_rate": 1.0,
                "color_metadata": {"color_transfer": "bt709"},
            },
        ]

        with mock.patch.dict(os.environ, {"MULTICAM_AUTO_COLOR_MATCH": "0"}):
            receipt = worker.asyncio.run(
                worker.apply_multicam_color_matching(sources, 0.0, 5.0, "unit-normalize")
            )

        self.assertEqual(receipt["status"], "normalization_only")
        self.assertFalse(receipt["auto_color_match_enabled"])
        self.assertTrue(all(not source["color_match_applied"] for source in sources))
        self.assertTrue(all(source["color_match_filter"] == "" for source in sources))
        self.assertIn("tonemap=hable:desat=0.0", sources[0]["source_visual_filter"])


if __name__ == "__main__":
    unittest.main()
