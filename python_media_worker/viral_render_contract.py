"""Pure helpers for Viral Clip Studio's preview-to-render contract."""

from __future__ import annotations

import math
import re
from typing import Any, Dict, Iterable, List, Mapping, Optional


MIN_SPEED_RATE = 0.5
MAX_SPEED_RATE = 2.0
SUPPORTED_JOIN_TRANSITIONS = {"clean_cut", "soft_dip", "energy_flash"}


def _read(item: Any, *names: str, default: Any = None) -> Any:
    for name in names:
        if isinstance(item, Mapping) and name in item:
            return item[name]
        if hasattr(item, name):
            return getattr(item, name)
    return default


def _finite_number(value: Any, default: Optional[float] = None) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def clamp_speed_rate(value: Any, default: float = 1.0) -> float:
    rate = _finite_number(value, default)
    return max(MIN_SPEED_RATE, min(MAX_SPEED_RATE, rate))


def normalize_speed_plan(
    duration: Any,
    speed_segments: Optional[Iterable[Any]] = None,
    preview_speed: Any = 1.0,
) -> List[Dict[str, float]]:
    """Return ordered, non-overlapping speed ranges with 1x gaps filled in."""

    safe_duration = max(0.0, _finite_number(duration, 0.0))
    if safe_duration <= 0:
        return []

    candidates = []
    for segment in speed_segments or []:
        start = _finite_number(_read(segment, "start_time", "startTime"))
        end = _finite_number(_read(segment, "end_time", "endTime"))
        rate = _finite_number(_read(segment, "rate", "playbackRate"))
        if start is None or end is None or rate is None or end <= start or rate <= 0:
            continue
        start = max(0.0, min(safe_duration, start))
        end = max(0.0, min(safe_duration, end))
        if end <= start:
            continue
        candidates.append(
            {
                "start_time": start,
                "end_time": end,
                "rate": clamp_speed_rate(rate),
            }
        )

    if not candidates:
        return [
            {
                "start_time": 0.0,
                "end_time": safe_duration,
                "rate": clamp_speed_rate(preview_speed),
            }
        ]

    candidates.sort(key=lambda item: (item["start_time"], item["end_time"]))
    plan: List[Dict[str, float]] = []
    cursor = 0.0
    for segment in candidates:
        start = max(cursor, segment["start_time"])
        end = segment["end_time"]
        if end <= start:
            continue
        if start > cursor:
            plan.append({"start_time": cursor, "end_time": start, "rate": 1.0})
        plan.append({"start_time": start, "end_time": end, "rate": segment["rate"]})
        cursor = end
    if cursor < safe_duration:
        plan.append({"start_time": cursor, "end_time": safe_duration, "rate": 1.0})

    merged: List[Dict[str, float]] = []
    for segment in plan:
        if (
            merged
            and abs(merged[-1]["rate"] - segment["rate"]) < 1e-6
            and abs(merged[-1]["end_time"] - segment["start_time"]) < 1e-6
        ):
            merged[-1]["end_time"] = segment["end_time"]
        else:
            merged.append(dict(segment))
    return merged


def speed_plan_changes_timing(plan: Iterable[Mapping[str, float]]) -> bool:
    return any(abs(float(segment["rate"]) - 1.0) > 1e-6 for segment in plan)


def speed_plan_output_duration(plan: Iterable[Mapping[str, float]]) -> float:
    return sum(
        max(0.0, float(segment["end_time"]) - float(segment["start_time"]))
        / clamp_speed_rate(segment["rate"])
        for segment in plan
    )


def map_timeline_time(plan: Iterable[Mapping[str, float]], source_time: Any) -> float:
    """Map a pre-speed timeline time to the rendered timeline."""

    safe_time = max(0.0, _finite_number(source_time, 0.0))
    output_time = 0.0
    for segment in plan:
        start = float(segment["start_time"])
        end = float(segment["end_time"])
        rate = clamp_speed_rate(segment["rate"])
        if safe_time <= start:
            break
        covered_end = min(safe_time, end)
        if covered_end > start:
            output_time += (covered_end - start) / rate
        if safe_time <= end:
            break
    return output_time


def build_speed_filter_complex(
    plan: Iterable[Mapping[str, float]], has_audio: bool
) -> str:
    """Build an FFmpeg filter that applies speed ranges and rejoins them."""

    normalized = list(plan)
    if not normalized or not speed_plan_changes_timing(normalized):
        return ""

    filters: List[str] = []
    video_labels: List[str] = []
    audio_labels: List[str] = []
    for index, segment in enumerate(normalized):
        start = float(segment["start_time"])
        end = float(segment["end_time"])
        rate = clamp_speed_rate(segment["rate"])
        video_label = f"speed_v_{index}"
        filters.append(
            f"[0:v]trim=start={start:.6f}:end={end:.6f},"
            f"setpts=(PTS-STARTPTS)/{rate:.6f}[{video_label}]"
        )
        video_labels.append(f"[{video_label}]")
        if has_audio:
            audio_label = f"speed_a_{index}"
            filters.append(
                f"[0:a]atrim=start={start:.6f}:end={end:.6f},"
                f"asetpts=PTS-STARTPTS,atempo={rate:.6f}[{audio_label}]"
            )
            audio_labels.append(f"[{audio_label}]")

    if len(normalized) == 1:
        filters.append(f"{video_labels[0]}null[v_speed]")
        if has_audio:
            filters.append(f"{audio_labels[0]}anull[a_speed]")
    elif has_audio:
        joined = "".join(
            video + audio for video, audio in zip(video_labels, audio_labels)
        )
        filters.append(f"{joined}concat=n={len(normalized)}:v=1:a=1[v_speed][a_speed]")
    else:
        filters.append(
            f"{''.join(video_labels)}concat=n={len(normalized)}:v=1:a=0[v_speed]"
        )
    return ";".join(filters)


def build_segment_transition_filters(
    duration: Any,
    transition_in: Any = None,
    transition_out: Any = None,
    transition_duration: Any = 0.0,
    has_audio: bool = True,
) -> Dict[str, Any]:
    """Build bounded per-segment join filters used before timeline concat."""

    safe_duration = max(0.05, _finite_number(duration, 0.05))
    incoming = str(transition_in or "").strip().lower()
    outgoing = str(transition_out or "").strip().lower()
    if incoming not in SUPPORTED_JOIN_TRANSITIONS:
        incoming = ""
    if outgoing not in SUPPORTED_JOIN_TRANSITIONS:
        outgoing = ""
    requested_duration = max(0.0, _finite_number(transition_duration, 0.0))
    visual_duration = min(requested_duration, safe_duration / 3.0, 0.35)
    edge_duration = min(0.035, visual_duration or 0.02)
    video_filters: List[str] = []
    audio_filters: List[str] = []

    if visual_duration >= 0.01:
        incoming_color = "white" if incoming == "energy_flash" else "black"
        outgoing_color = "white" if outgoing == "energy_flash" else "black"
        if incoming in {"soft_dip", "energy_flash"}:
            video_filters.append(
                f"fade=t=in:st=0:d={visual_duration:.3f}:color={incoming_color}"
            )
        if outgoing in {"soft_dip", "energy_flash"}:
            video_filters.append(
                f"fade=t=out:st={max(0.0, safe_duration - visual_duration):.3f}:"
                f"d={visual_duration:.3f}:color={outgoing_color}"
            )

    if has_audio and incoming:
        audio_filters.append(f"afade=t=in:st=0:d={edge_duration:.3f}")
    if has_audio and outgoing:
        audio_filters.append(
            f"afade=t=out:st={max(0.0, safe_duration - edge_duration):.3f}:d={edge_duration:.3f}"
        )

    return {
        "transition_in": incoming or None,
        "transition_out": outgoing or None,
        "visual_duration": visual_duration,
        "video_filters": video_filters,
        "audio_filters": audio_filters,
    }


def resolve_caption_layout(position: Any, scale: Any, base_style: Mapping[str, Any]) -> Dict[str, Any]:
    style = dict(base_style)
    normalized_position = str(position or "lower").strip().lower()
    style["alignment"] = {
        "top": 8,
        "center": 5,
        "middle": 5,
        "lower": 2,
        "bottom": 2,
    }.get(normalized_position, 2)
    style["margin_v"] = 0 if style["alignment"] == 5 else int(style.get("margin_v", 100))
    safe_scale = _finite_number(scale, 1.0)
    safe_scale = max(0.8, min(1.35, safe_scale))
    style["fontsize"] = max(18, int(round(float(style.get("fontsize", 48)) * safe_scale)))
    return style


def build_caption_override_transcript(text: Any, duration: Any) -> Dict[str, List[Dict[str, Any]]]:
    """Create deterministic word timings when the creator supplies exact caption copy."""

    clean_text = re.sub(r"\s+", " ", str(text or "")).strip()
    words = clean_text.split(" ") if clean_text else []
    safe_duration = max(0.2, _finite_number(duration, 0.2))
    if not words:
        return {"segments": []}
    word_duration = safe_duration / len(words)
    timed_words = []
    for index, word in enumerate(words):
        timed_words.append(
            {
                "word": word,
                "start": index * word_duration,
                "end": min(safe_duration, (index + 1) * word_duration),
            }
        )
    return {
        "segments": [
            {
                "id": 0,
                "start": 0.0,
                "end": safe_duration,
                "text": clean_text,
                "words": timed_words,
                "no_speech_prob": 0.0,
            }
        ]
    }
