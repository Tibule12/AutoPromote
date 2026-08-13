"""Backward-compatible creative effect contracts for Viral Clip Studio.

The first signature pack intentionally uses FFmpeg primitives already available in
the media worker.  It gives the Studio real exported motion treatments today while
keeping the manifest stable for future tracked masks and depth-aware compositing.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Mapping, Tuple


SUPPORTED_CREATIVE_PRESETS = {
    "motion_sculpture",
    "reality_break",
    "tracked_reveal",
}
SUPPORTED_CREATIVE_INTENSITIES = {"clean", "bold", "unreal"}


def _read(value: Any, *keys: str, default: Any = None) -> Any:
    if isinstance(value, Mapping):
        for key in keys:
            if key in value:
                return value[key]
        return default
    for key in keys:
        if hasattr(value, key):
            return getattr(value, key)
    return default


def _finite_number(value: Any, default: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def normalize_creative_plan(plan: Any, duration: Any) -> Dict[str, Any]:
    """Return a bounded, deterministic plan or a disabled safe plan."""

    clip_duration = max(0.05, _finite_number(duration, 0.05))
    disabled = {
        "version": 1,
        "enabled": False,
        "intensity": "bold",
        "fallback": "clean",
        "effects": [],
    }
    if not plan or not bool(_read(plan, "enabled", default=False)):
        return disabled

    default_intensity = str(_read(plan, "intensity", default="bold") or "bold").lower()
    if default_intensity not in SUPPORTED_CREATIVE_INTENSITIES:
        default_intensity = "bold"

    normalized_effects: List[Dict[str, Any]] = []
    for index, effect in enumerate(_read(plan, "effects", default=[]) or []):
        preset = str(_read(effect, "preset", "type", default="") or "").strip().lower()
        if preset not in SUPPORTED_CREATIVE_PRESETS:
            continue
        start = min(clip_duration, max(0.0, _finite_number(_read(effect, "start_time", "startTime"), 0.0)))
        end = min(
            clip_duration,
            max(start, _finite_number(_read(effect, "end_time", "endTime"), clip_duration)),
        )
        if end - start < 0.05:
            continue
        intensity = str(_read(effect, "intensity", default=default_intensity) or default_intensity).lower()
        if intensity not in SUPPORTED_CREATIVE_INTENSITIES:
            intensity = default_intensity
        normalized_effects.append(
            {
                "id": str(_read(effect, "id", default=f"creative-{index + 1}")),
                "preset": preset,
                "intensity": intensity,
                "start_time": round(start, 3),
                "end_time": round(end, 3),
            }
        )
        # Keep export cost and render complexity predictable in the first release.
        if len(normalized_effects) == 3:
            break

    return {
        "version": 1,
        "enabled": bool(normalized_effects),
        "intensity": default_intensity,
        "fallback": "clean",
        "effects": normalized_effects,
    }


def _motion_sculpture_filter(
    input_label: str, output_label: str, effect: Mapping[str, Any], index: int
) -> str:
    intensity = effect["intensity"]
    frames = {"clean": 3, "bold": 5, "unreal": 7}[intensity]
    weights = {
        "clean": "1 0.34 0.12",
        "bold": "1 0.68 0.42 0.24 0.10",
        "unreal": "1 0.82 0.64 0.48 0.32 0.20 0.10",
    }[intensity]
    shift = {"clean": 1, "bold": 3, "unreal": 6}[intensity]
    saturation = {"clean": 1.08, "bold": 1.20, "unreal": 1.36}[intensity]
    start = float(effect["start_time"])
    end = float(effect["end_time"])
    clean_label = f"creative_motion_clean_{index}"
    effect_label = f"creative_motion_fx_{index}"
    return (
        f"[{input_label}]split=2[{clean_label}][{effect_label}_src];"
        f"[{effect_label}_src]tmix=frames={frames}:weights='{weights}',"
        f"rgbashift=rh={shift}:bh=-{shift},"
        f"eq=contrast=1.06:saturation={saturation:.2f}:brightness=0.01"
        f"[{effect_label}];"
        f"[{clean_label}][{effect_label}]blend="
        f"all_expr='if(between(T,{start:.3f},{end:.3f}),B,A)'[{output_label}]"
    )


def _reality_break_filter(
    input_label: str, output_label: str, effect: Mapping[str, Any], index: int
) -> str:
    intensity = effect["intensity"]
    shift = {"clean": 2, "bold": 5, "unreal": 9}[intensity]
    grid_alpha = {"clean": 0.10, "bold": 0.20, "unreal": 0.32}[intensity]
    saturation = {"clean": 1.10, "bold": 1.28, "unreal": 1.46}[intensity]
    contrast = {"clean": 1.05, "bold": 1.12, "unreal": 1.20}[intensity]
    start = float(effect["start_time"])
    end = float(effect["end_time"])
    clean_label = f"creative_break_clean_{index}"
    effect_label = f"creative_break_fx_{index}"
    return (
        f"[{input_label}]split=2[{clean_label}][{effect_label}_src];"
        f"[{effect_label}_src]rgbashift=rh={shift}:rv=0:gh=0:gv=0:bh=-{shift}:bv=0,"
        f"drawgrid=width=iw/6:height=ih/10:thickness=2:color=0x7c4dff@{grid_alpha:.2f},"
        f"vignette=PI/5,eq=contrast={contrast:.2f}:saturation={saturation:.2f}"
        f"[{effect_label}];"
        f"[{clean_label}][{effect_label}]blend="
        f"all_expr='if(between(T,{start:.3f},{end:.3f}),B,A)'[{output_label}]"
    )


def _tracked_reveal_filter(input_label: str, output_label: str, effect: Mapping[str, Any], index: int) -> str:
    intensity = effect["intensity"]
    start = float(effect["start_time"])
    available = max(0.25, float(effect["end_time"]) - start)
    reveal_duration = min(available, {"clean": 1.15, "bold": 0.78, "unreal": 0.48}[intensity])
    saturation = {"clean": 1.12, "bold": 1.30, "unreal": 1.52}[intensity]
    contrast = {"clean": 1.04, "bold": 1.12, "unreal": 1.22}[intensity]
    clean_label = f"creative_reveal_clean_{index}"
    grade_label = f"creative_reveal_grade_{index}"
    return (
        f"[{input_label}]split=2[{clean_label}][{grade_label}_src];"
        f"[{grade_label}_src]curves=preset=increase_contrast,"
        f"eq=contrast={contrast:.2f}:saturation={saturation:.2f}[{grade_label}];"
        f"[{clean_label}][{grade_label}]blend="
        f"all_expr='if(between(T,{start:.3f},{float(effect['end_time']):.3f}),"
        f"if(lte(X/W,clip((T-{start:.3f})/{reveal_duration:.3f},0,1)),B,A),A)'"
        f"[{output_label}]"
    )


def build_creative_filter_complex(plan: Mapping[str, Any]) -> Tuple[str, str, List[Dict[str, Any]]]:
    """Build a sequential FFmpeg graph and an export receipt.

    The graph always starts from ``0:v``. Audio is deliberately excluded so the
    caller can stream-copy it untouched into the protected intermediate.
    """

    effects: Iterable[Mapping[str, Any]] = plan.get("effects") or []
    filters: List[str] = []
    receipt: List[Dict[str, Any]] = []
    input_label = "0:v"
    output_label = input_label

    for index, effect in enumerate(effects):
        output_label = f"creative_{index}"
        preset = effect["preset"]
        if preset == "motion_sculpture":
            filters.append(_motion_sculpture_filter(input_label, output_label, effect, index))
        elif preset == "reality_break":
            filters.append(_reality_break_filter(input_label, output_label, effect, index))
        elif preset == "tracked_reveal":
            filters.append(_tracked_reveal_filter(input_label, output_label, effect, index))
        else:
            continue
        receipt.append(dict(effect))
        input_label = output_label

    return ";".join(filters), output_label, receipt
