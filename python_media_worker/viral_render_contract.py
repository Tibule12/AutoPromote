"""Pure helpers for Viral Clip Studio's preview-to-render contract."""

from __future__ import annotations

import math
import os
import re
from typing import Any, Dict, Iterable, List, Mapping, Optional


MIN_SPEED_RATE = 0.5
MAX_SPEED_RATE = 2.0
SUPPORTED_JOIN_TRANSITIONS = {"clean_cut", "soft_dip", "energy_flash"}


def append_studio_caption_filter(filter_chain, input_label, ass_path, fonts_path):
    """Burn programme captions after media composition, as in Studio preview."""
    if not ass_path or not os.path.isfile(ass_path):
        return input_label
    escape = lambda value: str(value).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
    filter_chain.append(
        f"[{input_label}]ass='{escape(ass_path)}':fontsdir='{escape(fonts_path)}'[v_captions];"
    )
    return "v_captions"


def build_delivery_video_clock_filter(fps: float, duration: float, source_fps: float) -> str:
    """Preserve the final frame's duration through overlay framesync and CFR.

    Framesync can report EOF at the last input PTS rather than that frame's
    end. Extend by at most one actual source frame, then bound the selected
    delivery clock to the canonical edit duration. This cannot conceal a
    longer missing-picture tail.
    """
    if not all(math.isfinite(value) and value > 0 for value in (fps, duration, source_fps)):
        raise ValueError("Delivery clock requires a positive finite rate and duration")
    return (
        f"tpad=stop_mode=clone:stop_duration={1.0 / source_fps:.9f},"
        f"fps={fps:g},trim=duration={duration:.9f}"
    )


def build_studio_timeline_mux_args(duration: float) -> List[str]:
    """Bound intermediate stream copies without dropping buffered video packets.

    With NVENC B-frames, -shortest can discard the final reordered picture
    packets when AAC reaches EOF first. The reviewed timeline already supplies
    the explicit boundary; keep all picture packets belonging to that window.
    This does not pad or conceal a missing source picture.
    """
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Studio timeline mux requires a positive finite duration")
    return ["-t", f"{duration:.9f}"]


def resolve_studio_audio_bitrate(output_settings, *, studio_remix=False):
    """Honor the editor's existing bitrate selection with legacy defaults."""
    requested = (output_settings or {}).get("audioBitrate")
    if requested is None:
        return "256k" if studio_remix else "160k"
    requested = str(requested).strip()
    if requested not in {"128", "192", "256", "320"}:
        raise ValueError("Unsupported Studio audio bitrate")
    return requested + "k"


def build_studio_audio_delivery_filter(duration: float) -> str:
    """Deliver continuous PCM time after restoration and timeline mixing.

    FFmpeg loudnorm can change its output sample clock while flushing its
    lookahead tail. AAC packet timestamps must follow decoded samples rather
    than retain that discontinuity. Resample to the editor's 48 kHz delivery
    clock before applying the existing programme duration boundary.
    """
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Studio audio delivery requires a positive finite duration")
    return (
        "aresample=48000,asetpts=N/SR/TB,"
        f"apad=whole_dur={duration:.9f},atrim=0:{duration:.9f},"
        "asetpts=N/SR/TB"
    )


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


def resolve_studio_programme_duration(segments, start_time, end_time, declared_ticks=None):
    """Keep source ranges authoritative through codec padding/intermediates.

    The declaration is derived from the ordinary Studio export, never another
    editable clock. Reject a disagreement with the actual requested ranges.
    """
    duration = sum(float(_read(segment, "end_time")) - float(_read(segment, "start_time"))
                   for segment in segments) if segments else float(end_time) - float(start_time)
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Studio programme requires a positive finite source range")
    ticks = round(duration * 90000)
    if declared_ticks is not None:
        if (isinstance(declared_ticks, bool) or not isinstance(declared_ticks, int)
                or declared_ticks <= 0 or abs(declared_ticks - ticks) > 1):
            raise ValueError("Studio programme clock differs from the requested source ranges")
        ticks = declared_ticks
    return ticks / 90000


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
    plan: Iterable[Mapping[str, float]], has_audio: bool, output_fps: Any = 30
) -> str:
    """Build an FFmpeg filter that applies speed ranges and rejoins them."""

    normalized = list(plan)
    if not normalized or not speed_plan_changes_timing(normalized):
        return ""
    selected_fps = _finite_number(output_fps, 30)
    if selected_fps not in {24, 25, 30, 50, 60}:
        raise ValueError("Unsupported Studio speed delivery frame rate")
    # One continuous picture clock: independently rounding each ramp range to
    # CFR and concatenating it with audio accumulates video padding at every
    # boundary. Upsampling an unchanged 24fps range to30 and back also changes
    # its chosen pictures. Map the assembled source timestamps once, then
    # sample once at the requested delivery rate. Audio keeps pitch-preserving
    # atempo ranges and is concatenated independently of picture frame rounding.
    if len(normalized) == 1:
        video_time = f"round((PTS-STARTPTS)/{clamp_speed_rate(normalized[0]['rate']):.6f})"
    else:
        terms = []
        for segment in normalized:
            start = float(segment["start_time"])
            duration = float(segment["end_time"]) - start
            rate = clamp_speed_rate(segment["rate"])
            terms.append(
                f"min(max((PTS-STARTPTS)*TB-{start:.9f},0),{duration:.9f})/{rate:.6f}"
            )
        video_time = "round((" + "+".join(terms) + ")/TB)"
    filters: List[str] = [
        f"[0:v]settb=expr=1/90000,setpts='{video_time}',fps={selected_fps:g}[v_speed]"
    ]
    audio_labels: List[str] = []
    for index, segment in enumerate(normalized):
        start = float(segment["start_time"])
        end = float(segment["end_time"])
        rate = clamp_speed_rate(segment["rate"])
        if has_audio:
            audio_label = f"speed_a_{index}"
            filters.append(
                f"[0:a]atrim=start={start:.6f}:end={end:.6f},"
                f"asetpts=PTS-STARTPTS,atempo={rate:.6f}[{audio_label}]"
            )
            audio_labels.append(f"[{audio_label}]")

    if len(normalized) == 1:
        if has_audio:
            filters.append(f"{audio_labels[0]}anull[a_speed]")
    elif has_audio:
        filters.append(
            f"{''.join(audio_labels)}concat=n={len(normalized)}:v=0:a=1[a_speed]"
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
        "top_left": 7,
        "top": 8,
        "top_center": 8,
        "top_right": 9,
        "middle_left": 4,
        "center": 5,
        "middle": 5,
        "middle_center": 5,
        "middle_right": 6,
        "bottom_left": 1,
        "lower": 2,
        "bottom": 2,
        "bottom_center": 2,
        "bottom_right": 3,
        # Per-line free positioning is emitted as an ASS override. Keep the
        # base style centred so fallback lines are still safe and predictable.
        "custom": 5,
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


def build_edited_caption_transcript(caption_segments: Iterable[Any]) -> Dict[str, List[Dict[str, Any]]]:
    """Preserve creator-reviewed caption text/timing and derive word timings for ASS."""
    normalized = []
    for index, item in enumerate(caption_segments or []):
        text = re.sub(r"\s+", " ", str(_read(item, "text", default="") or "")).strip()
        start = max(0.0, _finite_number(_read(item, "start_time", "startTime", "start"), 0.0))
        end = _finite_number(_read(item, "end_time", "endTime", "end"), start)
        if not text or end is None or end <= start:
            continue
        words = text.split()
        word_duration = (end - start) / max(1, len(words))
        normalized_segment = {
                "id": _read(item, "id", default=index),
                "start": start,
                "end": end,
                "text": text,
                "words": [
                    {
                        "word": word,
                        "start": start + word_index * word_duration,
                        "end": min(end, start + (word_index + 1) * word_duration),
                        "probability": 1.0,
                    }
                    for word_index, word in enumerate(words)
                ],
                "no_speech_prob": 0.0,
            }
        speaker = str(_read(item, "speaker", "speaker_id", "speakerId", default="") or "").strip()
        speaker_label = str(
            _read(item, "speaker_label", "speakerLabel", default="") or ""
        ).strip()
        language = str(
            _read(item, "language", "language_code", "languageCode", default="") or ""
        ).strip()
        language_label = str(
            _read(item, "language_label", "languageLabel", default="") or ""
        ).strip()
        languages = [
            str(value or "").strip()
            for value in (_read(item, "languages", default=[]) or [])
            if str(value or "").strip()
        ]
        if speaker:
            normalized_segment["speaker"] = speaker
        if speaker_label:
            normalized_segment["speakerLabel"] = speaker_label
        if language:
            normalized_segment["language"] = language
        if language_label:
            normalized_segment["languageLabel"] = language_label
        if languages:
            normalized_segment["languages"] = list(dict.fromkeys(languages))
        caption_placement = str(
            _read(item, "caption_placement", "captionPlacement", "placement", default="") or ""
        ).strip()
        caption_icon = str(
            _read(item, "caption_icon", "captionIcon", "icon", default="") or ""
        ).strip()
        caption_accent = str(
            _read(item, "caption_accent", "captionAccent", default="") or ""
        ).strip()
        caption_x = _finite_number(_read(item, "caption_x", "captionX"), None)
        caption_y = _finite_number(_read(item, "caption_y", "captionY"), None)
        if caption_placement:
            normalized_segment["captionPlacement"] = caption_placement
        if caption_icon:
            normalized_segment["captionIcon"] = caption_icon
        if re.fullmatch(r"#[0-9a-fA-F]{6}", caption_accent):
            normalized_segment["captionAccent"] = caption_accent.lower()
        if caption_x is not None:
            normalized_segment["captionX"] = max(5.0, min(95.0, caption_x))
        if caption_y is not None:
            normalized_segment["captionY"] = max(5.0, min(95.0, caption_y))
        normalized_segment["textReviewRequired"] = bool(
            _read(item, "text_review_required", "textReviewRequired", default=False)
        )
        normalized_segment["textReviewed"] = bool(
            _read(item, "text_reviewed", "textReviewed", default=False)
        )
        normalized_segment["reviewRequired"] = bool(
            _read(item, "review_required", "reviewRequired", default=False)
        )
        normalized.append(normalized_segment)
    normalized.sort(key=lambda segment: (segment["start"], segment["end"]))
    return {"segments": normalized}


def find_uncovered_caption_speech_ranges(
    caption_segments: Iterable[Mapping[str, Any]],
    silence_intervals: Iterable[Iterable[float]],
    duration: float,
    *,
    caption_padding: float = 0.18,
    minimum_uncovered_duration: float = 1.1,
) -> List[Dict[str, float]]:
    """Return audible timeline ranges that have no caption coverage.

    ``silence_intervals`` comes from FFmpeg's silencedetect filter. Treating
    detected silence as valid uncovered time keeps the gate from demanding
    subtitles during real pauses while still catching missing spoken phrases.
    """
    safe_duration = max(0.0, _finite_number(duration, 0.0) or 0.0)
    if safe_duration <= 0.0:
        return []

    covered = []
    for segment in caption_segments or []:
        start = max(
            0.0,
            (_finite_number(_read(segment, "start", "start_time", "startTime"), 0.0) or 0.0)
            - caption_padding,
        )
        end = min(
            safe_duration,
            (_finite_number(_read(segment, "end", "end_time", "endTime"), start) or start)
            + caption_padding,
        )
        if end > start:
            covered.append((start, end))

    for interval in silence_intervals or []:
        values = list(interval or [])
        if len(values) < 2:
            continue
        start = max(0.0, _finite_number(values[0], 0.0) or 0.0)
        end = min(safe_duration, _finite_number(values[1], start) or start)
        if end > start:
            covered.append((start, end))

    covered.sort(key=lambda item: (item[0], item[1]))
    merged = []
    for start, end in covered:
        if merged and start <= merged[-1][1] + 0.04:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    gaps = []
    cursor = 0.0
    for start, end in merged:
        if start - cursor >= minimum_uncovered_duration:
            gaps.append(
                {
                    "start": round(cursor, 3),
                    "end": round(start, 3),
                    "duration": round(start - cursor, 3),
                }
            )
        cursor = max(cursor, end)
    if safe_duration - cursor >= minimum_uncovered_duration:
        gaps.append(
            {
                "start": round(cursor, 3),
                "end": round(safe_duration, 3),
                "duration": round(safe_duration - cursor, 3),
            }
        )
    return gaps


def remap_caption_transcript_to_speed_plan(
    transcript: Mapping[str, Any], speed_plan: Iterable[Mapping[str, float]]
) -> Dict[str, List[Dict[str, Any]]]:
    """Move creator-reviewed caption and word times onto the post-speed render clock."""
    plan = list(speed_plan or [])
    remapped = []
    for segment in (transcript or {}).get("segments", []) or []:
        start = map_timeline_time(plan, _read(segment, "start", default=0.0))
        end = map_timeline_time(plan, _read(segment, "end", default=start))
        if end <= start:
            continue
        remapped.append(
            {
                **segment,
                "start": start,
                "end": end,
                "words": [
                    {
                        **word,
                        "start": map_timeline_time(plan, _read(word, "start", default=start)),
                        "end": map_timeline_time(plan, _read(word, "end", default=end)),
                    }
                    for word in (segment.get("words") or [])
                ],
            }
        )
    return {"segments": remapped}
