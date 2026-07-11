"""Pure planning helpers for resumable multicamera renders.

This module deliberately has no worker, storage, or Firebase imports.  It only
splits an already-final director/render plan at deterministic timeline
boundaries.  Production callers can supply a continuous-sync-aware source
range resolver; tests and other pure callers can rely on proportional slicing
of source ranges already present on each segment.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import re
from pathlib import Path
from typing import Any, Callable, Mapping, Optional, Sequence, Tuple, Union


SourceRange = Union[Sequence[float], Mapping[str, float]]
SourceRangeResolver = Callable[[str, float, float], SourceRange]

_CONTIGUITY_TOLERANCE_SECONDS = 0.02
_BOUNDARY_EPSILON_SECONDS = 1e-9
_FINGERPRINT_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def _finite_float(value: Any, name: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a finite number") from exc
    if not math.isfinite(result):
        raise ValueError(f"{name} must be a finite number")
    return result


def _normalize_source_range(value: SourceRange, camera_id: str) -> Tuple[float, float]:
    if isinstance(value, Mapping):
        start = value.get("source_start", value.get("start"))
        end = value.get("source_end", value.get("end"))
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)) and len(value) == 2:
        start, end = value
    else:
        raise ValueError(
            f"Source range resolver for {camera_id!r} must return a two-item sequence "
            "or a mapping containing start/end"
        )

    source_start = _finite_float(start, f"source range start for {camera_id!r}")
    source_end = _finite_float(end, f"source range end for {camera_id!r}")
    if source_end < source_start:
        raise ValueError(f"Source range resolver returned an inverted range for {camera_id!r}")
    return source_start, source_end


def _proportional_source_range(
    segment: Mapping[str, Any],
    source_start_key: str,
    source_end_key: str,
    piece_start: float,
    piece_end: float,
) -> Optional[Tuple[float, float]]:
    if segment.get(source_start_key) is None or segment.get(source_end_key) is None:
        return None

    timeline_start = _finite_float(segment["timeline_start"], "segment timeline_start")
    timeline_end = _finite_float(segment["timeline_end"], "segment timeline_end")
    timeline_duration = timeline_end - timeline_start
    source_start = _finite_float(segment[source_start_key], source_start_key)
    source_end = _finite_float(segment[source_end_key], source_end_key)
    if timeline_duration <= 0.0:
        raise ValueError("Cannot proportionally split a zero-duration segment")

    start_fraction = (piece_start - timeline_start) / timeline_duration
    end_fraction = (piece_end - timeline_start) / timeline_duration
    source_duration = source_end - source_start
    return (
        source_start + (source_duration * start_fraction),
        source_start + (source_duration * end_fraction),
    )


def _apply_source_range(
    piece: dict,
    original_segment: Mapping[str, Any],
    camera_key: str,
    source_start_key: str,
    source_end_key: str,
    piece_start: float,
    piece_end: float,
    source_range_resolver: Optional[SourceRangeResolver],
) -> None:
    camera_id = original_segment.get(camera_key)
    if camera_id in (None, ""):
        return

    if source_range_resolver is not None:
        source_range = _normalize_source_range(
            source_range_resolver(str(camera_id), piece_start, piece_end - piece_start),
            str(camera_id),
        )
    else:
        source_range = _proportional_source_range(
            original_segment,
            source_start_key,
            source_end_key,
            piece_start,
            piece_end,
        )

    if source_range is not None:
        piece[source_start_key], piece[source_end_key] = source_range


def _split_segment(
    segment: Mapping[str, Any],
    piece_start: float,
    piece_end: float,
    source_range_resolver: Optional[SourceRangeResolver],
) -> dict:
    piece = copy.deepcopy(dict(segment))
    piece["timeline_start"] = piece_start
    piece["timeline_end"] = piece_end
    if "duration" in piece:
        piece["duration"] = piece_end - piece_start
    if "timeline_duration" in piece:
        piece["timeline_duration"] = piece_end - piece_start

    _apply_source_range(
        piece,
        segment,
        "camera_id",
        "source_start",
        "source_end",
        piece_start,
        piece_end,
        source_range_resolver,
    )
    _apply_source_range(
        piece,
        segment,
        "secondary_camera_id",
        "secondary_source_start",
        "secondary_source_end",
        piece_start,
        piece_end,
        source_range_resolver,
    )
    return piece


def _validated_segments(segments: Sequence[Mapping[str, Any]]) -> list:
    validated = []
    previous_end = None
    for index, segment in enumerate(segments or []):
        if not isinstance(segment, Mapping):
            raise ValueError(f"Segment {index} must be a mapping")
        timeline_start = _finite_float(segment.get("timeline_start"), f"segment {index} timeline_start")
        timeline_end = _finite_float(segment.get("timeline_end"), f"segment {index} timeline_end")
        if timeline_end <= timeline_start:
            raise ValueError(f"Segment {index} must have positive timeline duration")
        if previous_end is not None:
            delta = timeline_start - previous_end
            if abs(delta) > _CONTIGUITY_TOLERANCE_SECONDS:
                issue = "gap" if delta > 0.0 else "overlap"
                raise ValueError(f"Segments must be contiguous; {issue} before segment {index}")
            timeline_start = previous_end

        normalized = copy.deepcopy(dict(segment))
        normalized["timeline_start"] = timeline_start
        normalized["timeline_end"] = timeline_end
        validated.append(normalized)
        previous_end = timeline_end
    return validated


def partition_multicam_render_segments(
    segments: Sequence[Mapping[str, Any]],
    target_chunk_duration: float = 300.0,
    *,
    source_range_resolver: Optional[SourceRangeResolver] = None,
) -> list:
    """Split contiguous render segments into deterministic timeline chunks.

    Segment timeline values and chunk start/end values remain on the caller's
    original timeline.  A segment crossing a chunk boundary is copied and
    clipped on both sides of that boundary.  All unrelated director/layout
    metadata is deep-copied unchanged.

    ``source_range_resolver`` is called as ``(camera_id, timeline_start,
    duration)`` for both the primary and secondary camera on every emitted
    segment piece.  Without it, existing primary and secondary source ranges
    are sliced proportionally; this fallback is intended for pure planning and
    tests rather than production continuous-sync mapping.
    """

    chunk_duration = _finite_float(target_chunk_duration, "target_chunk_duration")
    if chunk_duration <= 0.0:
        raise ValueError("target_chunk_duration must be greater than zero")

    normalized_segments = _validated_segments(segments)
    if not normalized_segments:
        return []

    plan_start = normalized_segments[0]["timeline_start"]
    plan_end = normalized_segments[-1]["timeline_end"]
    plan_duration = plan_end - plan_start
    # Use only a floating-point epsilon here. The wider segment-contiguity
    # tolerance must never shorten the declared render timeline.
    chunk_count = max(
        1,
        int(
            math.ceil(
                max(0.0, plan_duration - 1e-9)
                / chunk_duration
            )
        ),
    )
    chunks = []
    segment_cursor = 0

    for chunk_index in range(chunk_count):
        chunk_start = plan_start + (chunk_index * chunk_duration)
        chunk_end = min(plan_end, plan_start + ((chunk_index + 1) * chunk_duration))
        chunk_segments = []

        while (
            segment_cursor < len(normalized_segments)
            and normalized_segments[segment_cursor]["timeline_end"]
            <= chunk_start + _BOUNDARY_EPSILON_SECONDS
        ):
            segment_cursor += 1

        scan_index = segment_cursor
        while scan_index < len(normalized_segments):
            segment = normalized_segments[scan_index]
            segment_start = segment["timeline_start"]
            segment_end = segment["timeline_end"]
            if segment_start >= chunk_end - _BOUNDARY_EPSILON_SECONDS:
                break

            piece_start = max(chunk_start, segment_start)
            piece_end = min(chunk_end, segment_end)
            if piece_end - piece_start > _BOUNDARY_EPSILON_SECONDS:
                chunk_segments.append(
                    _split_segment(
                        segment,
                        piece_start,
                        piece_end,
                        source_range_resolver,
                    )
                )
            if segment_end <= chunk_end + _BOUNDARY_EPSILON_SECONDS:
                scan_index += 1
            else:
                break

        if not chunk_segments:
            raise ValueError(f"Chunk {chunk_index} has no render segments")
        if abs(chunk_segments[0]["timeline_start"] - chunk_start) > _BOUNDARY_EPSILON_SECONDS:
            raise ValueError(f"Chunk {chunk_index} does not start at its declared boundary")
        if abs(chunk_segments[-1]["timeline_end"] - chunk_end) > _BOUNDARY_EPSILON_SECONDS:
            raise ValueError(f"Chunk {chunk_index} does not end at its declared boundary")

        chunks.append(
            {
                "index": chunk_index,
                "start": chunk_start,
                "end": chunk_end,
                "duration": chunk_end - chunk_start,
                "segments": chunk_segments,
            }
        )

    return chunks


def _canonical_fingerprint_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): _canonical_fingerprint_value(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_canonical_fingerprint_value(item) for item in value]
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Chunk plans cannot fingerprint NaN or infinity")
        if value == 0.0:
            return 0.0
        return round(value, 12)
    return value


def multicam_chunk_plan_fingerprint(chunks: Sequence[Mapping[str, Any]]) -> str:
    """Return a stable SHA-256 fingerprint for a JSON-compatible chunk plan."""

    canonical = _canonical_fingerprint_value(list(chunks or []))
    payload = json.dumps(
        canonical,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def build_multicam_chunk_plan(
    segments: Sequence[Mapping[str, Any]],
    target_chunk_duration: float = 300.0,
    *,
    source_range_resolver: Optional[SourceRangeResolver] = None,
) -> dict:
    """Build chunk records and attach their stable plan fingerprint."""

    chunks = partition_multicam_render_segments(
        segments,
        target_chunk_duration,
        source_range_resolver=source_range_resolver,
    )
    fingerprint = multicam_chunk_plan_fingerprint(chunks)
    if chunks:
        start = chunks[0]["start"]
        end = chunks[-1]["end"]
    else:
        start = end = 0.0
    return {
        "target_chunk_duration": _finite_float(target_chunk_duration, "target_chunk_duration"),
        "start": start,
        "end": end,
        "duration": end - start,
        "chunks": chunks,
        "fingerprint": fingerprint,
    }


def multicam_chunk_checkpoint_paths(
    temp_root: Union[str, os.PathLike],
    job_id: str,
    plan_fingerprint: str,
    chunk_index: int,
) -> dict:
    """Return deterministic paths without creating directories or files."""

    fingerprint = str(plan_fingerprint or "").strip().lower()
    if not _FINGERPRINT_PATTERN.fullmatch(fingerprint):
        raise ValueError("plan_fingerprint must be a lowercase SHA-256 hex digest")
    try:
        safe_index = int(chunk_index)
    except (TypeError, ValueError) as exc:
        raise ValueError("chunk_index must be a non-negative integer") from exc
    if safe_index < 0 or safe_index != chunk_index:
        raise ValueError("chunk_index must be a non-negative integer")

    raw_job_id = str(job_id or "").strip()
    if not raw_job_id:
        raise ValueError("job_id is required")
    job_slug = re.sub(r"[^A-Za-z0-9._-]+", "_", raw_job_id).strip("._-")[:48] or "job"
    job_digest = hashlib.sha256(raw_job_id.encode("utf-8")).hexdigest()[:12]
    directory = (
        Path(temp_root)
        / "multicam-chunks"
        / f"{job_slug}-{job_digest}"
        / fingerprint
    )
    stem = f"chunk_{safe_index:04d}"
    return {
        "directory": str(directory),
        "video_path": str(directory / f"{stem}.mp4"),
        "checkpoint_path": str(directory / f"{stem}.checkpoint.json"),
    }


__all__ = [
    "SourceRangeResolver",
    "build_multicam_chunk_plan",
    "multicam_chunk_checkpoint_paths",
    "multicam_chunk_plan_fingerprint",
    "partition_multicam_render_segments",
]
