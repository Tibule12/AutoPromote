"""Canonical evidence-backed edit plans for Viral Clip Studio.

The plan is deliberately model-agnostic. Analysis workers contribute measured
evidence; the frontend edits the proposal; the renderer receives the same plan as
an audit receipt. No score or effect is allowed to become its own evidence.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, Mapping


PLAN_VERSION = 1


CONTENT_FAMILIES = {
    "podcast_conversation": "talk_story",
    "podcast_interview": "talk_story",
    "interview": "talk_story",
    "talking_head": "talk_story",
    "speech": "talk_story",
    "choir_performance": "performance",
    "music_performance": "performance",
    "performance": "performance",
    "product": "product_proof",
    "product_demo": "product_proof",
    "tutorial": "education",
    "education": "education",
    "travel": "travel_lifestyle",
    "lifestyle": "travel_lifestyle",
    "event": "event_highlight",
    "sports": "event_highlight",
    "gaming": "screen_content",
    "tech": "screen_content",
}


def _number(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def _clean(value: Any, limit: int = 500) -> str:
    return " ".join(str(value or "").split())[:limit]


def _unique_text(values: Iterable[Any], limit: int = 6) -> list[str]:
    result = []
    seen = set()
    for value in values:
        cleaned = _clean(value)
        key = cleaned.lower()
        if cleaned and key not in seen:
            seen.add(key)
            result.append(cleaned)
        if len(result) >= limit:
            break
    return result


def normalize_content_family(content_type: Any) -> str:
    normalized = str(content_type or "general").strip().lower().replace("-", "_")
    return CONTENT_FAMILIES.get(normalized, "general")


def build_studio_edit_plan(
    candidate: Mapping[str, Any],
    *,
    transcript_quality: Mapping[str, Any] | None = None,
) -> Dict[str, Any]:
    """Build one renderer-safe proposal whose claims point to real evidence."""
    quality = dict(transcript_quality or {})
    content_type = str(candidate.get("contentType") or "general").strip().lower()
    content_family = normalize_content_family(content_type)
    has_audio = bool(candidate.get("hasAudio", True))
    transcript_confidence = max(
        0.0,
        min(1.0, _number(candidate.get("transcriptConfidence"), 0.0)),
    )
    evidence_strength = max(0.0, min(100.0, _number(candidate.get("scoreConfidence"), 20.0)))
    source = str(candidate.get("source") or "unknown")
    measured_evidence = {
        "scene_change": source == "scene_detect",
        "transcript_window": source == "transcript_window",
        "audio_measured": bool(candidate.get("audioMeasured", has_audio)),
        "motion_measured": bool(candidate.get("motionMeasured", candidate.get("motionScore") is not None)),
        "speech_trusted": bool(
            has_audio
            and transcript_confidence
            >= _number(quality.get("speechEvidenceThreshold"), 0.62)
        ),
        "transcript_confidence": round(transcript_confidence, 3),
        "evidence_strength": round(evidence_strength, 1),
    }
    evidence_notes = _unique_text(
        [
            *(candidate.get("reasons") or []),
            candidate.get("reason"),
            candidate.get("scoreConfidenceLabel"),
        ]
    )
    if not measured_evidence["speech_trusted"]:
        evidence_notes.append("Speech-based edits require creator-reviewed captions")

    caption_mode = "off" if not has_audio else "review_required"
    if measured_evidence["speech_trusted"]:
        caption_mode = "generate_then_review"

    visual_strategy = {
        "talk_story": "speaker_continuity_and_literal_broll",
        "performance": "performance_preservation_and_rhythm",
        "product_proof": "product_detail_and_proof",
        "education": "step_and_concept_visuals",
        "travel_lifestyle": "location_action_montage",
        "event_highlight": "action_reaction_highlights",
        "screen_content": "screen_proof_and_reaction",
    }.get(content_family, "scene_motion_and_creator_intent")

    proposed_edits = []
    if candidate.get("hookText") and (
        measured_evidence["speech_trusted"] or not has_audio
    ):
        proposed_edits.append(
            {
                "id": "opening_hook",
                "kind": "hook",
                "status": "proposed",
                "reason": "Opening proposal from the analyzed candidate",
                "value": _clean(candidate.get("hookText"), 120),
            }
        )
    proposed_edits.extend(
        [
            {
                "id": "professional_cleanup",
                "kind": "cleanup",
                "status": "required",
                "reason": "Normalize technical quality before creative effects",
                "value": "safe_clean",
            },
            {
                "id": "content_reframe",
                "kind": "reframe",
                "status": "proposed",
                "reason": f"Use {content_family} framing with manual correction available",
                "value": content_family,
            },
        ]
    )

    return {
        "version": PLAN_VERSION,
        "candidate_id": str(candidate.get("id") or ""),
        "source_range": {
            "start": round(max(0.0, _number(candidate.get("start"))), 3),
            "end": round(max(0.0, _number(candidate.get("end"))), 3),
        },
        "classification": {
            "content_type": content_type,
            "content_family": content_family,
            "analysis_mode": str(candidate.get("analysisMode") or quality.get("analysisMode") or "unknown"),
        },
        "evidence": measured_evidence,
        "evidence_notes": evidence_notes,
        "caption_policy": {
            "mode": caption_mode,
            "preserve_code_switching": True,
            "translation": "creator_opt_in_only",
            "speaker_labels_editable": True,
            "render_requires_review": has_audio,
        },
        "visual_policy": {
            "strategy": visual_strategy,
            "real_people_are_source_of_truth": True,
            "moving_broll_requires_grounded_caption": True,
            "generated_visuals_require_preview_approval": True,
        },
        "proposed_edits": proposed_edits,
        "quality_gates": [
            "decodable_h264_video",
            "expected_audio_present",
            "duration_matches_edit",
            "no_unplanned_black_frames",
            "captions_creator_reviewed",
            "preview_matches_render_contract",
        ],
    }


def validate_studio_edit_plan(plan: Mapping[str, Any] | None) -> Dict[str, Any]:
    if not isinstance(plan, Mapping):
        return {"valid": False, "errors": ["missing_plan"]}
    errors = []
    if int(_number(plan.get("version"), 0)) != PLAN_VERSION:
        errors.append("unsupported_plan_version")
    source_range = plan.get("source_range") or {}
    if _number(source_range.get("end")) <= _number(source_range.get("start")):
        errors.append("invalid_source_range")
    if not isinstance(plan.get("evidence"), Mapping):
        errors.append("missing_evidence")
    if not isinstance(plan.get("quality_gates"), list) or not plan.get("quality_gates"):
        errors.append("missing_quality_gates")
    return {"valid": not errors, "errors": errors, "version": PLAN_VERSION}
