"""Deterministic Phase-1 (and extensible) Creative Effects & Overlays engine.

Mirrors ``frontend/src/components/studioCreativeEffects.js`` identically so the
browser canvas preview and exported video share bit-consistent seeded geometry,
keyframe interpolation, blending math, and timing.
"""

from __future__ import annotations

import math
import os
import subprocess
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

try:
    from .studio_motion import automation_segment_value, finite
except ImportError:
    from studio_motion import automation_segment_value, finite


SUPPORTED_BLEND_MODES = {
    "normal",
    "multiply",
    "screen",
    "difference",
    "overlay",
    "soft-light",
    "hard-light",
    "color-dodge",
    "luminosity",
}

CREATIVE_EFFECT_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "ripped_paper": {
        "mode": "tear_video_open",
        "direction": "vertical",
        "tearProgress": 62.0,
        "autoAnimate": True,
        "tearPosition": 50.0,
        "angle": -25.0,
        "speed": 1.0,
        "roughness": 55.0,
        "paperColor": "#f3ecdf",
        "fiberEdgeColor": "#fdfbf6",
        "behindColor": "#141824",
        "behindText": "",
        "behindOverlayId": "",
        "paperTexture": 60.0,
        "shadow": 55.0,
        "seed": 17,
    },
    "scrapbook": {
        "frameStyle": "polaroid",
        "borderColor": "#f7f3eb",
        "borderWidth": 28.0,
        "paperTexture": 55.0,
        "shadow": 60.0,
        "tiltAngle": -4.0,
        "tapeTop": True,
        "tapeColor": "#e6cfa2",
        "captionText": "STUDIO MEMORIES",
        "roughness": 38.0,
        "scalePercent": 86.0,
        "backingColor": "#c8b090",
        "seed": 23,
    },
    "doodles": {
        "shape": "arrow",
        "color": "#ffde59",
        "strokeWidth": 7.0,
        "drawDuration": 0.9,
        "drawProgress": 100.0,
        "autoAnimate": True,
        "direction": "forward",
        "speed": 1.0,
        "wobble": 40.0,
        "x": 50.0,
        "y": 45.0,
        "scale": 1.0,
        "rotation": 0.0,
        "seed": 11,
    },
    "film_grain": {
        "preset": "16mm_docu",
        "intensity": 52.0,
        "grainSize": 1.8,
        "colorMode": "color",
        "dustAmount": 35.0,
        "scratchesAmount": 24.0,
        "flicker": 22.0,
        "vignette": 34.0,
        "borderStyle": "none",
        "motion": "organic",
    },
    "light_leaks": {
        "style": "warm_amber",
        "mode": "overlay",
        "direction": "left_to_right",
        "intensity": 68.0,
        "speed": 1.0,
        "softness": 65.0,
        "primaryColor": "#ff6b1a",
        "secondaryColor": "#ffd166",
    },
    "vhs_glitch": {
        "style": "vhs_tape",
        "intensity": 58.0,
        "glitchFrequency": 48.0,
        "rgbSeparation": 10.0,
        "scanlines": 50.0,
        "trackingNoise": 45.0,
        "displacement": 42.0,
        "beatSync": False,
        "seed": 31,
    },
    "comic_pop_art": {
        "style": "classic_comic",
        "outlineStrength": 68.0,
        "halftoneDensity": 56.0,
        "posterizeLevels": 5,
        "borderStyle": "comic_gutter",
        "borderColor": "#ffffff",
        "panelColor": "#facc15",
        "speechText": "POW!",
        "bubbleStyle": "burst",
        "bubbleX": 74.0,
        "bubbleY": 24.0,
        "transitionMode": "none",
        "seed": 41,
    },
    "freeze_cutout": {
        "freezeTime": 0.5,
        "maskMode": "auto_subject",
        "subjectX": 50.0,
        "subjectY": 50.0,
        "subjectRadius": 34.0,
        "feather": 14.0,
        "outlineWidth": 8.0,
        "outlineColor": "#facc15",
        "glow": 48.0,
        "shadow": 60.0,
        "animatedBg": "live_video",
        "cutoutX": 50.0,
        "cutoutY": 50.0,
        "cutoutScale": 1.08,
        "cutoutRotation": -2.0,
        "autoPop": True,
        "labelText": "FROZEN",
        "labelColor": "#111827",
    },
    "kinetic_typography": {
        "text": "MAKE EVERY WORD COUNT",
        "style": "bounce",
        "fontFamily": "Inter",
        "fontSize": 54.0,
        "color": "#ffffff",
        "highlightColor": "#facc15",
        "bgColor": "#0f172a",
        "showBg": True,
        "x": 50.0,
        "y": 72.0,
        "scale": 1.0,
        "rotation": 0.0,
        "staggerMs": 220.0,
        "easing": "bounce",
        "wordTimings": [],
    },
    "speed_ramping": {
        "preset": "hero_slow_mo",
        "startRate": 1.8,
        "midRate": 0.4,
        "endRate": 1.6,
        "reverse": False,
        "opticalFlow": False,
    },
    "zoom_motion_blur": {
        "mode": "punch_in",
        "zoomScale": 1.45,
        "autoAnimate": True,
        "focusX": 50.0,
        "focusY": 50.0,
        "panX": 0.0,
        "panY": 0.0,
        "rotation": 0.0,
        "easing": "ease_in_out",
        "motionBlurStrength": 55.0,
    },
    "flash_camera_shake": {
        "mode": "impact_shake",
        "shakeStrength": 58.0,
        "shakeFrequency": 14.0,
        "directionalAngle": 20.0,
        "flashIntensity": 68.0,
        "flashColor": "#ffffff",
        "beatSync": False,
        "seed": 47,
    },
    "particle_overlays": {
        "particleType": "sparks",
        "particleCount": 75,
        "speed": 1.0,
        "size": 8.0,
        "direction": "up",
        "color": "#ffd166",
        "secondaryColor": "#ff5e7e",
        "maskMode": "full_frame",
        "subjectX": 50.0,
        "subjectY": 50.0,
        "subjectRadius": 34.0,
        "seed": 53,
    },
}

CREATIVE_EFFECT_BOUNDS: Dict[str, Dict[str, Tuple[float, float]]] = {
    "ripped_paper": {
        "tearProgress": (0.0, 100.0),
        "tearPosition": (10.0, 90.0),
        "angle": (-180.0, 180.0),
        "speed": (0.2, 3.0),
        "roughness": (5.0, 100.0),
        "paperTexture": (0.0, 100.0),
        "shadow": (0.0, 100.0),
    },
    "scrapbook": {
        "scalePercent": (45.0, 100.0),
        "tiltAngle": (-25.0, 25.0),
        "borderWidth": (6.0, 60.0),
        "paperTexture": (0.0, 100.0),
        "shadow": (0.0, 100.0),
        "roughness": (0.0, 100.0),
    },
    "doodles": {
        "strokeWidth": (2.0, 30.0),
        "drawDuration": (0.2, 5.0),
        "drawProgress": (0.0, 100.0),
        "speed": (0.2, 3.0),
        "wobble": (0.0, 100.0),
        "x": (5.0, 95.0),
        "y": (5.0, 95.0),
        "scale": (0.2, 3.0),
        "rotation": (-180.0, 180.0),
    },
    "film_grain": {
        "intensity": (0.0, 100.0),
        "grainSize": (1.0, 5.0),
        "dustAmount": (0.0, 100.0),
        "scratchesAmount": (0.0, 100.0),
        "flicker": (0.0, 100.0),
        "vignette": (0.0, 100.0),
    },
    "light_leaks": {
        "intensity": (0.0, 100.0),
        "softness": (15.0, 100.0),
        "speed": (0.2, 3.0),
    },
    "vhs_glitch": {
        "intensity": (0.0, 100.0),
        "glitchFrequency": (0.0, 100.0),
        "rgbSeparation": (0.0, 40.0),
        "scanlines": (0.0, 100.0),
        "trackingNoise": (0.0, 100.0),
        "displacement": (0.0, 100.0),
    },
    "comic_pop_art": {
        "outlineStrength": (0.0, 100.0),
        "halftoneDensity": (0.0, 100.0),
        "posterizeLevels": (2.0, 10.0),
        "bubbleX": (10.0, 90.0),
        "bubbleY": (10.0, 90.0),
    },
    "freeze_cutout": {
        "freezeTime": (0.0, 600.0),
        "subjectX": (15.0, 85.0),
        "subjectY": (15.0, 85.0),
        "subjectRadius": (15.0, 65.0),
        "feather": (0.0, 40.0),
        "outlineWidth": (0.0, 24.0),
        "glow": (0.0, 100.0),
        "shadow": (0.0, 100.0),
        "cutoutX": (10.0, 90.0),
        "cutoutY": (10.0, 90.0),
        "cutoutScale": (0.3, 2.5),
        "cutoutRotation": (-45.0, 45.0),
    },
    "kinetic_typography": {
        "fontSize": (20.0, 120.0),
        "staggerMs": (40.0, 600.0),
        "x": (10.0, 90.0),
        "y": (10.0, 90.0),
        "scale": (0.4, 2.5),
        "rotation": (-45.0, 45.0),
    },
    "speed_ramping": {
        "startRate": (0.25, 4.0),
        "midRate": (0.2, 4.0),
        "endRate": (0.25, 4.0),
    },
    "zoom_motion_blur": {
        "zoomScale": (1.0, 2.8),
        "focusX": (10.0, 90.0),
        "focusY": (10.0, 90.0),
        "panX": (-30.0, 30.0),
        "panY": (-30.0, 30.0),
        "rotation": (-30.0, 30.0),
        "motionBlurStrength": (0.0, 100.0),
    },
    "flash_camera_shake": {
        "shakeStrength": (0.0, 100.0),
        "shakeFrequency": (1.0, 30.0),
        "directionalAngle": (-180.0, 180.0),
        "flashIntensity": (0.0, 100.0),
    },
    "particle_overlays": {
        "particleCount": (10.0, 200.0),
        "speed": (0.2, 3.0),
        "size": (2.0, 24.0),
        "subjectX": (15.0, 85.0),
        "subjectY": (15.0, 85.0),
        "subjectRadius": (15.0, 65.0),
    },
}


def clamp(val: Any, lo: float, hi: float, fallback: float) -> float:
    num = finite(val, fallback)
    return max(lo, min(hi, num))


def hash_seed(value: Any) -> int:
    s = str(value if value is not None else "studio-fx")
    h = 2166136261
    for ch in s:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h or 1


def mulberry32(seed: int):
    state = [int(seed) & 0xFFFFFFFF]

    def _next() -> float:
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state[0] ^ (state[0] >> 15)) * (1 | state[0])) & 0xFFFFFFFF
        t = (t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) ^ t
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return _next


def hex_to_rgb(value: Any, fallback: Tuple[int, int, int] = (255, 255, 255)) -> Tuple[int, int, int]:
    raw = str(value or "").strip().lstrip("#")
    if len(raw) != 6:
        return fallback
    try:
        return (int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16))
    except ValueError:
        return fallback


def normalize_creative_effects(effects: Any, duration: Any = None) -> List[Dict[str, Any]]:
    if not effects:
        return []
    if not isinstance(effects, Sequence):
        raise ValueError("creative_effects must be a list")
    max_dur = finite(duration, 36000.0) if duration is not None else 36000.0
    max_dur = max(0.05, max_dur)
    normalized: List[Dict[str, Any]] = []
    for idx, raw in enumerate(effects):
        if not isinstance(raw, Mapping):
            raise ValueError("Each creative effect entry must be an object")
        effect_id = str(raw.get("effectId") or raw.get("effect_id") or "").strip().lower()
        if effect_id not in CREATIVE_EFFECT_DEFAULTS:
            raise ValueError(f"Unsupported creative effect {effect_id!r}")
        defaults = CREATIVE_EFFECT_DEFAULTS[effect_id]
        bounds = CREATIVE_EFFECT_BOUNDS[effect_id]
        raw_params = raw.get("params") if isinstance(raw.get("params"), Mapping) else {}
        params = dict(defaults)
        for key, value in raw_params.items():
            if key in bounds:
                lo, hi = bounds[key]
                params[key] = clamp(value, lo, hi, float(defaults[key]))
            elif key in defaults:
                params[key] = value
        blend = str(raw.get("blendMode") or raw.get("blend_mode") or "normal").strip().lower()
        if blend not in SUPPORTED_BLEND_MODES:
            raise ValueError(f"Unsupported blendMode {blend!r} for creative effect")
        start_time = clamp(raw.get("startTime", raw.get("start_time")), 0.0, max_dur, 0.0)
        eff_dur = clamp(raw.get("duration"), 0.05, 36000.0, 3.0)
        normalized.append(
            {
                "id": str(raw.get("id") or f"fx-{effect_id}-{idx + 1}"),
                "effectId": effect_id,
                "name": str(raw.get("name") or effect_id),
                "enabled": raw.get("enabled", True) is not False,
                "startTime": round(start_time, 4),
                "duration": round(eff_dur, 4),
                "blendMode": blend,
                "opacity": clamp(raw.get("opacity"), 0.0, 1.0, 1.0),
                "order": int(finite(raw.get("order"), idx)),
                "tracking": dict(raw.get("tracking") or {}) if isinstance(raw.get("tracking"), Mapping) else {},
                "params": params,
            }
        )
    normalized.sort(key=lambda item: item["order"])
    return normalized


def _interpolate_keys(keys: Sequence[Mapping[str, Any]], prop: str, time: float, fallback: float) -> float:
    prop_keys = sorted(
        (k for k in keys if str(k.get("property")) == prop),
        key=lambda k: finite(k.get("time"), 0.0),
    )
    if not prop_keys:
        return fallback
    if time <= finite(prop_keys[0].get("time"), 0.0):
        return finite(prop_keys[0].get("value"), fallback)
    if time >= finite(prop_keys[-1].get("time"), 0.0):
        return finite(prop_keys[-1].get("value"), fallback)
    right_idx = next(i for i, k in enumerate(prop_keys) if finite(k.get("time"), 0.0) >= time)
    left, right = prop_keys[right_idx - 1], prop_keys[right_idx]
    t0, t1 = finite(left.get("time"), 0.0), finite(right.get("time"), 0.0)
    progress = (time - t0) / max(0.0001, t1 - t0)
    first, last = finite(left.get("value"), fallback), finite(right.get("value"), fallback)
    if time == t1:
        return last
    return float(automation_segment_value(first, last, progress, {"easing": "ease_in_out", **dict(right)}))


def evaluate_effect_at_time(
    effect: Mapping[str, Any], motion_keyframes: Sequence[Mapping[str, Any]], time: float
) -> Tuple[float, Dict[str, Any], List[Mapping[str, Any]]]:
    effect_id = effect["effectId"]
    bounds = CREATIVE_EFFECT_BOUNDS[effect_id]
    target_id = str(effect["id"])
    target_keys = [k for k in (motion_keyframes or []) if str(k.get("targetId") or k.get("target_id")) == target_id]
    opacity = clamp(
        _interpolate_keys(target_keys, "opacity", time, float(effect.get("opacity", 1.0))),
        0.0,
        1.0,
        1.0,
    )
    params = dict(effect["params"])
    for key, (lo, hi) in bounds.items():
        if any(str(k.get("property")) == key for k in target_keys):
            params[key] = clamp(_interpolate_keys(target_keys, key, time, float(params[key])), lo, hi, float(params[key]))
    return opacity, params, target_keys


def _interpolate_noise_table(table: Sequence[float], t_norm: float) -> float:
    n = len(table)
    scaled = (t_norm % 1.0) * (n - 1)
    i0 = int(math.floor(scaled))
    i1 = min(n - 1, i0 + 1)
    frac = scaled - i0
    s = frac * frac * (3.0 - 2.0 * frac)
    return table[i0] * (1.0 - s) + table[i1] * s


def generate_torn_edge_polyline(
    width: int,
    height: int,
    progress: float,
    position_pct: float,
    direction: str,
    angle_deg: float,
    roughness: float,
    seed: int,
):
    if direction == "horizontal":
        theta = math.pi / 2.0
    elif direction == "diagonal":
        theta = -math.pi / 4.0
    elif direction == "custom":
        theta = math.radians(float(angle_deg or 0.0))
    else:
        theta = 0.0

    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    tx, ty = -sin_t, cos_t
    nx, ny = cos_t, sin_t
    diag = math.hypot(width, height)
    cx = width * 0.5 + nx * (((position_pct - 50.0) / 100.0) * width * 0.8)
    cy = height * 0.5 + ny * (((position_pct - 50.0) / 100.0) * height * 0.8)

    rand = mulberry32(hash_seed(f"torn-{int(seed)}"))
    macro = [(rand() - 0.5) * 2.0 for _ in range(24)]
    micro = [(rand() - 0.5) * 2.0 for _ in range(120)]
    amp = (roughness / 100.0) * diag * 0.048

    steps = 96
    seam = []
    for i in range(steps + 1):
        u = i / steps
        along = (u - 0.5) * diag * 1.4
        offset = _interpolate_noise_table(macro, u) * amp * 0.68 + _interpolate_noise_table(micro, u) * amp * 0.42
        seam.append((cx + tx * along + nx * offset, cy + ty * along + ny * offset))
    open_dist = (clamp(progress, 0.0, 100.0, 0.0) / 100.0) * diag * 0.42
    return seam, nx, ny, tx, ty, open_dist, diag


def _paint_paper_surface(size: Tuple[int, int], fill_rgb: Tuple[int, int, int], texture_pct: float, seed: int) -> Image.Image:
    w, h = size
    arr = np.empty((h, w, 4), dtype=np.uint8)
    arr[:, :, 0] = fill_rgb[0]
    arr[:, :, 1] = fill_rgb[1]
    arr[:, :, 2] = fill_rgb[2]
    arr[:, :, 3] = 255
    if texture_pct > 2:
        rng = np.random.default_rng(hash_seed(f"paper-{int(seed)}"))
        grain = rng.normal(0.0, (texture_pct / 100.0) * 14.0, (h, w, 1)).astype(np.float32)
        rgb = np.clip(arr[:, :, :3].astype(np.float32) + grain, 0, 255).astype(np.uint8)
        arr[:, :, :3] = rgb
    return Image.fromarray(arr, mode="RGBA")


def _load_studio_font(size_px: int) -> ImageFont.ImageFont:
    candidates = [
        os.path.join(os.path.dirname(__file__), "assets", "fonts", "Inter-ExtraBold.ttf"),
        os.path.join(os.path.dirname(__file__), "assets", "fonts", "StudioMotion-Bold.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, max(12, int(size_px)))
            except OSError:
                continue
    return ImageFont.load_default()


def render_ripped_paper_rgba(
    src_rgba: Image.Image,
    effect: Mapping[str, Any],
    opacity: float,
    params: Mapping[str, Any],
    target_keys: Sequence[Mapping[str, Any]],
    time: float,
    behind_rgba: Optional[Image.Image] = None,
) -> Image.Image:
    w, h = src_rgba.size
    local_time = max(0.0, time - float(effect["startTime"]))
    duration = max(0.1, float(effect["duration"]))
    has_keys = any(str(k.get("property")) == "tearProgress" for k in target_keys)
    progress = float(params["tearProgress"])
    if not has_keys and bool(params.get("autoAnimate", True)):
        cycle = min(1.0, (local_time / duration) * float(params.get("speed", 1.0)))
        progress = math.sin(cycle * math.pi * 0.5) * 100.0

    seam, nx, ny, _tx, _ty, shift, diag = generate_torn_edge_polyline(
        w,
        h,
        progress,
        float(params.get("tearPosition", 50.0)),
        str(params.get("direction", "vertical")),
        float(params.get("angle", -25.0)),
        float(params.get("roughness", 55.0)),
        int(params.get("seed", 17)),
    )

    left_seam = [(x - nx * shift, y - ny * shift) for x, y in seam]
    right_seam = [(x + nx * shift, y + ny * shift) for x, y in seam]
    far_left_poly = left_seam + [
        (left_seam[-1][0] - nx * diag * 1.6, left_seam[-1][1] - ny * diag * 1.6),
        (left_seam[0][0] - nx * diag * 1.6, left_seam[0][1] - ny * diag * 1.6),
    ]
    far_right_poly = right_seam + [
        (right_seam[-1][0] + nx * diag * 1.6, right_seam[-1][1] + ny * diag * 1.6),
        (right_seam[0][0] + nx * diag * 1.6, right_seam[0][1] + ny * diag * 1.6),
    ]

    fiber_w = max(3, round(h * (0.008 + (float(params.get("roughness", 55.0)) / 100.0) * 0.01)))
    shadow_blur = max(2, round((float(params.get("shadow", 55.0)) / 100.0) * h * 0.025))
    paper_rgb = hex_to_rgb(params.get("paperColor"), (243, 236, 223))
    fiber_rgb = hex_to_rgb(params.get("fiberEdgeColor"), (253, 251, 246))
    behind_rgb = hex_to_rgb(params.get("behindColor"), (20, 24, 36))
    texture_pct = float(params.get("paperTexture", 60.0))
    seed = int(params.get("seed", 17))
    mode = str(params.get("mode", "tear_video_open"))

    def draw_flap(base_img: Image.Image, flap_fill: Image.Image, poly, seam_edge, sign: float) -> Image.Image:
        fiber_seam = [(x + nx * sign * fiber_w, y + ny * sign * fiber_w) for x, y in seam_edge]
        fiber_poly = fiber_seam + poly[-2:]

        if float(params.get("shadow", 55.0)) > 0:
            sh_mask = Image.new("L", (w, h), 0)
            ImageDraw.Draw(sh_mask).polygon(fiber_poly, fill=round(145 * min(1.0, float(params.get("shadow", 55.0)) / 100.0)))
            sh_mask = sh_mask.filter(ImageFilter.GaussianBlur(shadow_blur))
            sh_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            sh_black = Image.new("RGBA", (w, h), (0, 0, 0, 255))
            sh_layer.paste(sh_black, (round(nx * sign * 3), round(ny * sign * 3 + 2)), sh_mask)
            base_img = Image.alpha_composite(base_img, sh_layer)

        fiber_mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(fiber_mask).polygon(fiber_poly, fill=255)
        fiber_fill = Image.new("RGBA", (w, h), fiber_rgb + (255,))
        base_img.paste(fiber_fill, (0, 0), fiber_mask)

        flap_mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(flap_mask).polygon(poly, fill=255)
        base_img.paste(flap_fill, (0, 0), flap_mask)
        return base_img

    result = src_rgba.copy()
    if mode == "tear_away_paper":
        paper_img = _paint_paper_surface((w, h), paper_rgb, texture_pct, seed)
        out = src_rgba.copy()
        out = draw_flap(out, paper_img, far_left_poly, left_seam, 1.0)
        out = draw_flap(out, paper_img, far_right_poly, right_seam, -1.0)
        result = out
    elif mode == "paper_border":
        paper_img = _paint_paper_surface((w, h), paper_rgb, texture_pct, seed)
        margin = max(w, h) * (0.04 + (progress / 100.0) * 0.08)
        rand = mulberry32(hash_seed(f"border-{seed}"))
        jitter = (float(params.get("roughness", 55.0)) / 100.0) * h * 0.025
        pts = []
        segs = 28
        for i in range(segs):
            pts.append((margin + (i / segs) * (w - 2 * margin), margin + (rand() - 0.5) * jitter))
        for i in range(segs):
            pts.append((w - margin + (rand() - 0.5) * jitter, margin + (i / segs) * (h - 2 * margin)))
        for i in range(segs):
            pts.append((w - margin - (i / segs) * (w - 2 * margin), h - margin + (rand() - 0.5) * jitter))
        for i in range(segs):
            pts.append((margin + (rand() - 0.5) * jitter, h - margin - (i / segs) * (h - 2 * margin)))

        frame_mask = Image.new("L", (w, h), 255)
        ImageDraw.Draw(frame_mask).polygon(pts, fill=0)
        out = src_rgba.copy()
        out.paste(paper_img, (0, 0), frame_mask)
        result = out
    else:
        bg = _paint_paper_surface((w, h), behind_rgb, texture_pct * 0.5, seed + 1)
        if behind_rgba is not None:
            resized = behind_rgba.convert("RGBA").resize((w, h), Image.Resampling.BICUBIC)
            bg = Image.alpha_composite(bg, resized)
        behind_text = str(params.get("behindText") or "").strip()
        if behind_text:
            draw = ImageDraw.Draw(bg)
            font = _load_studio_font(round(h * 0.068))
            draw.text((w * 0.5, h * 0.5), behind_text, font=font, fill=paper_rgb + (255,), anchor="mm")
        out = bg
        out = draw_flap(out, src_rgba, far_left_poly, left_seam, 1.0)
        out = draw_flap(out, src_rgba, far_right_poly, right_seam, -1.0)
        result = out

    if opacity < 0.999:
        return Image.blend(src_rgba, result, opacity)
    return result


def generate_doodle_paths(shape: str, seed: int = 11, wobble: float = 40.0) -> List[List[Tuple[float, float]]]:
    rand = mulberry32(hash_seed(f"doodle-{shape}-{int(seed)}"))
    j = (wobble / 100.0) * 0.025

    def wb(x: float, y: float) -> Tuple[float, float]:
        return (x + (rand() - 0.5) * j, y + (rand() - 0.5) * j)

    if shape == "circle":
        pts = []
        for i in range(49):
            a = (i / 48.0) * math.pi * 2.08 - 0.3
            rx = 0.42 + (rand() - 0.5) * j
            ry = 0.34 + (rand() - 0.5) * j
            pts.append((math.cos(a) * rx, math.sin(a) * ry))
        return [pts]
    if shape in {"underline", "marker_highlight"}:
        return [[wb(-0.45 + (i / 24.0) * 0.9, math.sin((i / 24.0) * math.pi) * -0.025) for i in range(25)]]
    if shape == "double_underline":
        return [
            [wb(-0.44 + (i / 20.0) * 0.88, -0.045) for i in range(21)],
            [wb(-0.38 + (i / 20.0) * 0.80, 0.065) for i in range(21)],
        ]
    if shape == "star":
        verts = []
        for i in range(11):
            a = -math.pi / 2.0 + (i * math.pi) / 5.0
            r = 0.44 if i % 2 == 0 else 0.19
            verts.append(wb(math.cos(a) * r, math.sin(a) * r))
        return [verts]
    if shape == "heart":
        pts = []
        for i in range(49):
            t = (i / 48.0) * math.pi * 2.0
            hx = (16.0 * (math.sin(t) ** 3)) / 40.0
            hy = -((13.0 * math.cos(t) - 5.0 * math.cos(2 * t) - 2.0 * math.cos(3 * t) - math.cos(4 * t)) / 40.0)
            pts.append(wb(hx, hy))
        return [pts]
    if shape == "scribble":
        return [[(-0.44 + (i / 44.0) * 0.88, math.sin((i / 44.0) * math.pi * 5.2) * 0.16 + (rand() - 0.5) * j) for i in range(45)]]
    if shape == "checkmark":
        return [[wb(-0.35, 0.02), wb(-0.08, 0.30), wb(0.38, -0.30)]]
    if shape == "curved_arrow":
        shaft = [wb(-0.38 + (i / 24.0) * 0.74, 0.24 - math.sin((i / 24.0) * math.pi * 0.85) * 0.36) for i in range(25)]
        head = [wb(0.18, -0.18), wb(0.36, 0.02), wb(0.14, 0.14)]
        return [shaft, head]
    shaft = [wb(-0.42 + (i / 18.0) * 0.82, math.sin((i / 18.0) * math.pi) * -0.04) for i in range(19)]
    head = [wb(0.18, -0.19), wb(0.42, 0.0), wb(0.18, 0.19)]
    return [shaft, head]


def render_doodle_rgba(
    src_rgba: Image.Image,
    effect: Mapping[str, Any],
    opacity: float,
    params: Mapping[str, Any],
    target_keys: Sequence[Mapping[str, Any]],
    time: float,
    tracked_pose: Optional[Mapping[str, float]] = None,
) -> Image.Image:
    w, h = src_rgba.size
    local_time = max(0.0, time - float(effect["startTime"]))
    has_keys = any(str(k.get("property")) == "drawProgress" for k in target_keys)
    progress = float(params.get("drawProgress", 100.0))
    direction = str(params.get("direction", "forward"))
    if not has_keys and bool(params.get("autoAnimate", True)):
        raw = clamp((local_time / max(0.15, float(params.get("drawDuration", 0.9)))) * float(params.get("speed", 1.0)), 0.0, 1.0, 1.0)
        progress = (1.0 - raw) * 100.0 if direction == "reverse" else raw * 100.0
    elif direction == "reverse" and not has_keys:
        progress = 100.0 - progress
    if progress <= 0.1:
        return src_rgba

    px = float((tracked_pose or {}).get("x", params.get("x", 50.0)))
    py = float((tracked_pose or {}).get("y", params.get("y", 45.0)))
    scale = float((tracked_pose or {}).get("scale", params.get("scale", 1.0)))
    rot_rad = math.radians(float((tracked_pose or {}).get("rotation", params.get("rotation", 0.0))))
    box_size = h * 0.36 * scale

    paths = generate_doodle_paths(str(params.get("shape", "arrow")), int(params.get("seed", 11)), float(params.get("wobble", 40.0)))
    total_len = sum(
        sum(math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) for i in range(1, len(p)))
        for p in paths
    )
    target_len = (clamp(progress, 0.0, 100.0, 100.0) / 100.0) * total_len

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    shape = str(params.get("shape", "arrow"))
    is_marker = shape == "marker_highlight"
    rgb = hex_to_rgb(params.get("color"), (255, 222, 89))
    alpha_val = round(clamp(opacity * (0.45 if is_marker else 1.0), 0.0, 1.0, 1.0) * 255)
    stroke_px = max(2, round(float(params.get("strokeWidth", 7.0)) * (h / 720.0) * (3.2 if is_marker else 1.0)))
    cx, cy = (px / 100.0) * w, (py / 100.0) * h
    cos_r, sin_r = math.cos(rot_rad), math.sin(rot_rad)

    def xform(pt: Tuple[float, float]) -> Tuple[float, float]:
        lx, ly = pt[0] * box_size, pt[1] * box_size
        return (cx + lx * cos_r - ly * sin_r, cy + lx * sin_r + ly * cos_r)

    rem = target_len
    for poly in paths:
        if rem <= 0 or len(poly) < 2:
            break
        drawn = [xform(poly[0])]
        for i in range(1, len(poly)):
            seg = math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1])
            if rem >= seg:
                drawn.append(xform(poly[i]))
                rem -= seg
            else:
                ratio = rem / seg if seg > 0 else 0.0
                ix = poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * ratio
                iy = poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * ratio
                drawn.append(xform((ix, iy)))
                rem = 0.0
                break
        if len(drawn) >= 2:
            draw.line(drawn, fill=rgb + (alpha_val,), width=stroke_px, joint="curve")
            r_cap = stroke_px * 0.48
            for cap_x, cap_y in (drawn[0], drawn[-1]):
                draw.ellipse((cap_x - r_cap, cap_y - r_cap, cap_x + r_cap, cap_y + r_cap), fill=rgb + (alpha_val,))

    return Image.alpha_composite(src_rgba, overlay)


def render_film_grain_rgb(
    frame_rgb: np.ndarray,
    opacity: float,
    params: Mapping[str, Any],
    time: float,
    fps: float,
) -> np.ndarray:
    h, w, _ = frame_rgb.shape
    frame_idx = max(0, int(math.floor(time * max(1.0, fps))))
    preset = str(params.get("preset", "16mm_docu"))
    intensity = clamp(params.get("intensity"), 0.0, 100.0, 52.0) / 100.0
    grain_scale = max(1, round(float(params.get("grainSize", 1.8)) * max(0.5, h / 720.0)))
    rand = mulberry32(hash_seed(f"grain-{frame_idx}-{preset}"))

    arr = frame_rgb.astype(np.float32)
    if params.get("motion") == "heavy_gate":
        wx = round((rand() - 0.5) * 4.0 * (h / 720.0))
        wy = round((rand() - 0.5) * 4.0 * (h / 720.0))
        if wx or wy:
            arr = np.roll(arr, shift=(wy, wx), axis=(0, 1))

    flicker_mul = 1.0 + (float(params.get("flicker", 22.0)) / 100.0) * 0.14 * (math.sin(frame_idx * 1.7) * 0.55 + (rand() - 0.5))
    arr *= flicker_mul

    color_mode = str(params.get("colorMode", "color"))
    is_sepia = preset == "vintage_sepia" or color_mode == "warm_sepia"
    if is_sepia:
        lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
        mix = 0.65 * opacity
        arr[:, :, 0] = arr[:, :, 0] * (1.0 - mix) + np.clip(lum * 1.18 + 14.0, 0, 255) * mix
        arr[:, :, 1] = arr[:, :, 1] * (1.0 - mix) + np.clip(lum * 0.98 + 6.0, 0, 255) * mix
        arr[:, :, 2] = arr[:, :, 2] * (1.0 - mix) + np.clip(lum * 0.74, 0, 255) * mix
    elif preset == "8mm_kodachrome":
        mix = 0.25 * opacity
        arr[:, :, 0] = arr[:, :, 0] * (1.0 - mix) + np.clip(arr[:, :, 0] * 1.08 + 8.0, 0, 255) * mix
        arr[:, :, 1] = arr[:, :, 1] * (1.0 - mix) + np.clip(arr[:, :, 1] * 1.01 + 3.0, 0, 255) * mix
        arr[:, :, 2] = arr[:, :, 2] * (1.0 - mix) + np.clip(arr[:, :, 2] * 0.90, 0, 255) * mix

    noise_amp = intensity * 58.0 * opacity
    if noise_amp > 0.2:
        gh = max(1, (h + grain_scale - 1) // grain_scale)
        gw = max(1, (w + grain_scale - 1) // grain_scale)
        gx = np.arange(gw, dtype=np.uint32)[None, :]
        gy = np.arange(gh, dtype=np.uint32)[:, None]
        seed_shift = np.uint32((frame_idx * 747796405) & 0xFFFFFFFF)
        row_seed = (gy ^ (seed_shift << np.uint32(1))) * np.uint32(0x9E3779B1)
        hv = ((gx ^ (gx >> np.uint32(13))) * np.uint32(0x85EBCA6B) + row_seed)
        hv ^= hv >> np.uint32(16)
        hv = hv * np.uint32(0xC2B2AE35)
        hv ^= hv >> np.uint32(13)
        g1 = (((hv >> np.uint32(24)) & np.uint32(255)).astype(np.float32) / 127.5 - 1.0) * noise_amp
        if grain_scale > 1:
            g1 = np.repeat(np.repeat(g1, grain_scale, axis=0), grain_scale, axis=1)[:h, :w]
        if color_mode == "color":
            hv2 = (hv ^ np.uint32(0x9E3779B9)) * np.uint32(1597334677)
            cg = (((hv2 >> np.uint32(24)) & np.uint32(255)).astype(np.float32) / 127.5 - 1.0) * noise_amp * 0.65
            if grain_scale > 1:
                cg = np.repeat(np.repeat(cg, grain_scale, axis=0), grain_scale, axis=1)[:h, :w]
            arr[:, :, 0] += g1 + cg * 0.45
            arr[:, :, 1] += g1 - cg * 0.25
            arr[:, :, 2] += g1 + cg * 0.55
        else:
            arr += g1[:, :, None]

    vig_strength = (float(params.get("vignette", 34.0)) / 100.0) * 0.72 * opacity
    if vig_strength > 0.005:
        ys = np.arange(h, dtype=np.float32)[:, None] - h * 0.5
        xs = np.arange(w, dtype=np.float32)[None, :] - w * 0.5
        inv_r2 = 1.0 / max(1.0, (w * 0.5) ** 2 + (h * 0.5) ** 2)
        v_factor = np.maximum(0.18, 1.0 - (xs * xs + ys * ys) * inv_r2 * vig_strength)
        arr *= v_factor[:, :, None]

    out_img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB").convert("RGBA")
    draw = ImageDraw.Draw(out_img)
    dust_count = round((float(params.get("dustAmount", 35.0)) / 100.0) * 32.0)
    for _ in range(dust_count):
        sx, sy = rand() * w, rand() * h
        sr = 0.8 + rand() * 2.2 * (h / 720.0)
        fill = (255, 250, 240, round(115 * opacity)) if rand() > 0.45 else (18, 16, 14, round(107 * opacity))
        draw.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=fill)

    scratch_count = round((float(params.get("scratchesAmount", 24.0)) / 100.0) * 8.0)
    for _ in range(scratch_count):
        sx = rand() * w
        sy0 = rand() * h * 0.4
        length = h * (0.25 + rand() * 0.65)
        lw = max(1, round((h / 720.0) * (0.7 + rand() * 1.1)))
        col = (255, 255, 255, round(62 * opacity)) if rand() > 0.5 else (10, 10, 10, round(72 * opacity))
        draw.line([(sx, sy0), (sx + (rand() - 0.5) * 4.0, sy0 + length)], fill=col, width=lw)

    border_style = str(params.get("borderStyle", "none"))
    if border_style != "none":
        bar_w = max(8, round(w * 0.065))
        pad_y = max(6, round(h * 0.035))
        dark = (8, 8, 10, round(255 * opacity))
        draw.rectangle([0, 0, bar_w, h], fill=dark)
        draw.rectangle([w - bar_w, 0, w, h], fill=dark)
        draw.rectangle([0, 0, w, pad_y], fill=dark)
        draw.rectangle([0, h - pad_y, w, h], fill=dark)
        if border_style == "8mm_sprocket":
            hole_h = max(10, round(h * 0.055))
            hole_w = max(6, round(bar_w * 0.52))
            hole_step = max(8, round(h * 0.14))
            y_offset = ((frame_idx * 12) % hole_step) - hole_step
            light = (242, 240, 232, round(255 * opacity))
            for y in range(y_offset, h, hole_step):
                draw.rounded_rectangle([bar_w * 0.24, y, bar_w * 0.24 + hole_w, y + hole_h], radius=3, fill=light)
    return np.asarray(out_img.convert("RGB"), dtype=np.uint8)


def _resolve_leak_palette(params: Mapping[str, Any]) -> Tuple[Tuple[int, int, int], Tuple[int, int, int]]:
    style = str(params.get("style", "warm_amber"))
    if style == "cool_cyan":
        return hex_to_rgb("#38bdf8"), hex_to_rgb("#a855f7")
    if style == "prismatic_rainbow":
        return hex_to_rgb("#ff5e7e"), hex_to_rgb("#38bdf8")
    if style == "film_burn_orange":
        return hex_to_rgb("#ff3d00"), hex_to_rgb("#ffd54f")
    if style == "custom":
        return hex_to_rgb(params.get("primaryColor"), (255, 107, 26)), hex_to_rgb(params.get("secondaryColor"), (255, 209, 102))
    return hex_to_rgb("#ff6b1a"), hex_to_rgb("#ffd166")


def render_light_leak_rgb(
    frame_rgb: np.ndarray,
    effect: Mapping[str, Any],
    opacity: float,
    params: Mapping[str, Any],
    time: float,
) -> np.ndarray:
    h, w, _ = frame_rgb.shape
    local_frac = clamp((time - float(effect["startTime"])) / max(0.1, float(effect["duration"])), 0.0, 1.0, 0.0)
    phase = local_frac * float(params.get("speed", 1.0))
    envelope = (math.sin(math.pi * local_frac) ** 1.15) if params.get("mode") == "clip_transition" else (0.72 + 0.28 * math.sin(phase * math.pi * 2.0))
    alpha = clamp((float(params.get("intensity", 68.0)) / 100.0) * opacity * envelope, 0.0, 1.0, 0.0)
    if alpha <= 0.005:
        return frame_rgb

    c1, c2 = _resolve_leak_palette(params)
    direction = str(params.get("direction", "left_to_right"))
    if direction == "right_to_left":
        p1, p2 = (0.85 - phase * 0.7, 0.4), (0.65 - phase * 0.45, 0.68)
    elif direction == "top_down":
        p1, p2 = (0.45, 0.15 + phase * 0.65), (0.62, 0.3 + phase * 0.45)
    elif direction == "diagonal":
        p1, p2 = (0.15 + phase * 0.7, 0.18 + phase * 0.62), (0.32 + phase * 0.5, 0.42 + phase * 0.42)
    elif direction == "corner_pulse":
        p1 = (0.12 + 0.06 * math.sin(phase * math.pi * 2.0), 0.18)
        p2 = (0.88 - 0.06 * math.cos(phase * math.pi * 2.0), 0.82)
    else:
        p1, p2 = (0.2 + phase * 0.65, 0.45), (0.45 + phase * 0.4, 0.72)

    rad = math.hypot(w, h) * (0.28 + (float(params.get("softness", 65.0)) / 100.0) * 0.52)
    ys = np.arange(h, dtype=np.float32)[:, None]
    xs = np.arange(w, dtype=np.float32)[None, :]

    leak = np.zeros((h, w, 3), dtype=np.float32)

    def add_lobe(pt: Tuple[float, float], rgb: Tuple[int, int, int], scale_r: float, peak: float):
        cx = (((pt[0] % 1.4) + 1.4) % 1.4 - 0.2) * w
        cy = (((pt[1] % 1.4) + 1.4) % 1.4 - 0.2) * h
        r = max(1.0, rad * scale_r)
        dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / r
        w_lobe = np.clip(1.0 - dist, 0.0, 1.0) ** 1.45 * peak
        leak[:, :, 0] += w_lobe * (rgb[0] / 255.0)
        leak[:, :, 1] += w_lobe * (rgb[1] / 255.0)
        leak[:, :, 2] += w_lobe * (rgb[2] / 255.0)

    add_lobe(p1, c1, 1.0, 0.85)
    add_lobe(p2, c2, 0.82, 0.68)
    add_lobe((p1[0] + 0.12, p2[1] - 0.15), c1, 0.55, 0.52)
    leak = np.clip(leak, 0.0, 1.0)

    base = frame_rgb.astype(np.float32) / 255.0
    blend = str(effect.get("blendMode", "screen"))
    if blend == "color-dodge":
        blended = np.minimum(1.0, base / np.maximum(0.02, 1.0 - leak * 0.85))
    elif blend == "overlay":
        blended = np.where(base < 0.5, 2.0 * base * leak, 1.0 - 2.0 * (1.0 - base) * (1.0 - leak))
    elif blend == "soft-light":
        blended = (1.0 - 2.0 * leak) * (base ** 2) + 2.0 * leak * base
    elif blend == "normal":
        blended = np.clip(base + leak * 0.85, 0.0, 1.0)
    else:
        blended = 1.0 - (1.0 - base) * (1.0 - leak)

    out = base * (1.0 - alpha) + blended * alpha
    return np.clip(out * 255.0, 0, 255).astype(np.uint8)


def apply_scrapbook_frame_to_layer(rgba_img: Image.Image, scrapbook_spec: Mapping[str, Any]) -> Image.Image:
    """Wrap any media overlay (image or video frame) in an editable Polaroid or deckled paper cutout."""
    if not scrapbook_spec or scrapbook_spec.get("enabled") is False:
        return rgba_img
    w, h = rgba_img.size
    style = str(scrapbook_spec.get("frameStyle", "polaroid"))
    border = max(4, round(float(scrapbook_spec.get("borderWidth", 22)) * (h / 360.0)))
    bottom_extra = border * 2 if style == "polaroid" else border
    out_w, out_h = w + border * 2, h + border + bottom_extra
    border_rgb = hex_to_rgb(scrapbook_spec.get("borderColor"), (247, 243, 235))
    canvas = Image.new("RGBA", (out_w, out_h), border_rgb + (255,))
    canvas.alpha_composite(rgba_img.convert("RGBA"), (border, border))
    caption = str(scrapbook_spec.get("captionText") or "").strip()
    if style == "polaroid" and caption:
        draw = ImageDraw.Draw(canvas)
        font = _load_studio_font(max(12, round(bottom_extra * 0.42)))
        draw.text((out_w * 0.5, border + h + bottom_extra * 0.5), caption, font=font, fill=(31, 41, 55, 255), anchor="mm")
    return canvas


def render_scrapbook_effect_rgba(src_rgba: Image.Image, opacity: float, params: Mapping[str, Any]) -> Image.Image:
    w, h = src_rgba.size
    scale = clamp(params.get("scalePercent"), 45.0, 100.0, 86.0) / 100.0
    tilt = clamp(params.get("tiltAngle"), -25.0, 25.0, -4.0)
    border = max(4, round(float(params.get("borderWidth", 28.0)) * (h / 720.0)))
    style = str(params.get("frameStyle", "polaroid"))
    bottom_extra = border * 2.2 if style == "polaroid" else border
    backing_rgb = hex_to_rgb(params.get("backingColor"), (200, 176, 144))
    border_rgb = hex_to_rgb(params.get("borderColor"), (247, 243, 235))

    bg = _paint_paper_surface((w, h), backing_rgb, float(params.get("paperTexture", 55.0)), int(params.get("seed", 23)))
    inner_w = max(16, round(w * scale))
    inner_h = max(16, round(h * scale * (0.84 if style == "polaroid" else 0.92)))
    photo = src_rgba.resize((inner_w, inner_h), Image.Resampling.BICUBIC)
    card_w = round(inner_w + border * 2)
    card_h = round(inner_h + border + bottom_extra)

    card = Image.new("RGBA", (card_w, card_h), border_rgb + (255,))
    card.alpha_composite(photo, (border, border))
    if style == "polaroid" and str(params.get("captionText") or "").strip():
        draw = ImageDraw.Draw(card)
        font = _load_studio_font(max(12, round(bottom_extra * 0.42)))
        draw.text(
            (card_w * 0.5, border + inner_h + bottom_extra * 0.5),
            str(params.get("captionText")).strip(),
            font=font,
            fill=(31, 41, 55, 255),
            anchor="mm",
        )
    if bool(params.get("tapeTop", True)):
        tape_w = round(card_w * 0.34)
        tape_h = max(12, round(border * 0.78))
        tape_rgb = hex_to_rgb(params.get("tapeColor"), (230, 207, 162))
        tape_img = Image.new("RGBA", (tape_w, tape_h), tape_rgb + (198,))
        card.alpha_composite(tape_img, ((card_w - tape_w) // 2, 0))

    rotated = card.rotate(-tilt, expand=True, resample=Image.Resampling.BICUBIC)
    px = (w - rotated.width) // 2
    py = (h - rotated.height) // 2
    shadow_pct = clamp(params.get("shadow"), 0.0, 100.0, 60.0) / 100.0
    if shadow_pct > 0.02:
        sh_alpha = rotated.getchannel("A").point(lambda v: round(v * 0.5 * shadow_pct))
        sh_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        sh_fill = Image.new("RGBA", rotated.size, (0, 0, 0, 255))
        sh_fill.putalpha(sh_alpha)
        sh_layer.paste(sh_fill, (px + 5, py + 9))
        sh_layer = sh_layer.filter(ImageFilter.GaussianBlur(max(2, round(h * 0.022 * shadow_pct))))
        bg = Image.alpha_composite(bg, sh_layer)
    bg.alpha_composite(rotated, (px, py))
    if opacity < 0.999:
        return Image.blend(src_rgba, bg, opacity)
    return bg


def render_vhs_glitch_rgb(
    frame_rgb: np.ndarray,
    opacity: float,
    params: Mapping[str, Any],
    time: float,
    fps: float,
    beat_markers: Sequence[Any] = (),
) -> np.ndarray:
    h, w, _ = frame_rgb.shape
    frame_idx = max(0, int(math.floor(time * max(1.0, fps))))
    intensity = clamp(params.get("intensity"), 0.0, 100.0, 58.0) / 100.0
    if intensity <= 0.01:
        return frame_rgb

    on_beat = bool(params.get("beatSync")) and any(
        abs(finite(bm.get("time") if isinstance(bm, Mapping) else bm, -999.0) - time) <= 0.14
        for bm in (beat_markers or [])
    )
    beat_mult = 1.85 if on_beat else 1.0
    rand = mulberry32(hash_seed(f"vhs-{int(params.get('seed', 31))}-{frame_idx}"))

    row_dx = np.zeros(h, dtype=np.int32)
    burst_prob = clamp(params.get("glitchFrequency"), 0.0, 100.0, 48.0) / 100.0 * 0.65 * beat_mult
    style = str(params.get("style", "vhs_tape"))
    if rand() < burst_prob or style in {"digital_glitch", "tracking_error"}:
        slices = round((4.0 + rand() * 8.0) * clamp(params.get("displacement"), 0.0, 100.0, 42.0) / 100.0)
        max_shift = round(w * 0.08 * intensity * beat_mult)
        for _ in range(slices):
            y0 = int(math.floor(rand() * h))
            sh = max(2, int(math.floor(h * (0.01 + rand() * 0.06))))
            dx = round((rand() - 0.5) * 2.0 * max_shift)
            row_dx[y0:min(h, y0 + sh)] += dx

    track_noise = clamp(params.get("trackingNoise"), 0.0, 100.0, 45.0) / 100.0
    band_center = int(((time * 0.28 + 0.15) % 1.0) * h)
    band_half = max(4, round(h * 0.045))
    if track_noise > 0.04 and style in {"vhs_tape", "tracking_error"}:
        y_lo = max(0, band_center - band_half)
        y_hi = min(h, band_center + band_half + 1)
        ys_band = np.arange(y_lo, y_hi, dtype=np.float32) - band_center
        row_dx[y_lo:y_hi] += np.round(np.sin(ys_band * 0.6) * w * 0.025 * track_noise).astype(np.int32)

    xs = np.arange(w, dtype=np.int32)[None, :]
    ys = np.arange(h, dtype=np.int32)[:, None]
    sx_center = np.clip(xs - row_dx[:, None], 0, w - 1)
    shift_px = round(clamp(params.get("rgbSeparation"), 0.0, 40.0, 10.0) * intensity * beat_mult * (w / 1280.0))
    sx_r = np.clip(sx_center - shift_px, 0, w - 1)
    sx_b = np.clip(sx_center + shift_px, 0, w - 1)

    out = np.empty_like(frame_rgb, dtype=np.float32)
    out[:, :, 0] = frame_rgb[ys, sx_r, 0]
    out[:, :, 1] = frame_rgb[ys, sx_center, 1]
    out[:, :, 2] = frame_rgb[ys, sx_b, 2]

    scan_str = (clamp(params.get("scanlines"), 0.0, 100.0, 50.0) / 100.0) * 0.38 * opacity
    if scan_str > 0.005:
        out[1::2, :, :] *= (1.0 - scan_str)

    if track_noise > 0.04 and style in {"vhs_tape", "tracking_error"}:
        y_lo = max(0, band_center - band_half)
        y_hi = min(h, band_center + band_half + 1)
        xs_band = np.arange(w, dtype=np.int32)[None, :]
        ys_b = np.arange(y_lo, y_hi, dtype=np.int32)[:, None]
        snow_mask = ((xs_band * 37 + ys_b * 97 + frame_idx * 17) & 7) == 0
        out[y_lo:y_hi, :, :][snow_mask] += 160.0 * track_noise

    if opacity < 0.999:
        out = frame_rgb.astype(np.float32) * (1.0 - opacity) + np.clip(out, 0, 255) * opacity
    return np.clip(out, 0, 255).astype(np.uint8)


def render_comic_pop_art_rgb(
    frame_rgb: np.ndarray,
    effect: Mapping[str, Any],
    opacity: float,
    params: Mapping[str, Any],
    time: float,
    tracked_pose: Optional[Mapping[str, float]] = None,
) -> np.ndarray:
    h, w, _ = frame_rgb.shape
    levels = max(2, min(10, round(finite(params.get("posterizeLevels"), 5.0))))
    outline_str = clamp(params.get("outlineStrength"), 0.0, 100.0, 68.0) / 100.0
    halftone_str = clamp(params.get("halftoneDensity"), 0.0, 100.0, 56.0) / 100.0
    edge_thresh = 205.0 - outline_str * 155.0
    style = str(params.get("style", "classic_comic"))

    arr = frame_rgb.astype(np.float32)
    luma = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    step_q = 255.0 / (levels - 1)
    q = np.round(arr / step_q) * step_q

    if style == "noir_ink":
        bw = np.where(luma > 138.0, 242.0, np.where(luma > 78.0, 132.0, 18.0))
        q = np.repeat(bw[:, :, None], 3, axis=2)
    elif style == "pop_art_warhol":
        q[:, :, 0] = np.clip(q[:, :, 0] * 1.25 + np.where(q[:, :, 1] < 100, 45.0, 0.0), 0, 255)
        q[:, :, 1] = np.clip(q[:, :, 1] * 1.12, 0, 255)
        q[:, :, 2] = np.clip(q[:, :, 2] * 1.25 + np.where(q[:, :, 0] > 140, 35.0, 0.0), 0, 255)

    if halftone_str > 0.05:
        cell = max(5, round((1.15 - halftone_str * 0.72) * 14.0 * max(0.5, h / 720.0)))
        ys = np.arange(h, dtype=np.float32)[:, None]
        xs = np.arange(w, dtype=np.float32)[None, :]
        cy = np.floor(ys / cell) * cell + cell * 0.5
        cx = np.floor(xs / cell) * cell + cell * 0.5
        dist = np.hypot(xs - cx, ys - cy)
        dot_r = (1.0 - luma / 255.0) * (cell * 0.45) * halftone_str
        dot_mask = dist < dot_r
        q[dot_mask, 0] *= 0.62
        q[dot_mask, 1] *= 0.62
        q[dot_mask, 2] *= 0.68

    if outline_str > 0.05 and w > 2 and h > 2:
        gx = np.abs(luma[1:-1, 2:] - luma[1:-1, :-2])
        gy = np.abs(luma[2:, 1:-1] - luma[:-2, 1:-1])
        edges = (gx + gy) > edge_thresh
        q[1:-1, 1:-1][edges] = [16.0, 16.0, 20.0]

    blended = arr * (1.0 - opacity) + q * opacity
    out_img = Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8), mode="RGB").convert("RGBA")
    draw = ImageDraw.Draw(out_img)

    if params.get("transitionMode") == "whip_panel_in":
        local_t = max(0.0, time - float(effect["startTime"]))
        if local_t < 0.45:
            p = local_t / 0.45
            draw.rectangle([0, 0, round(w * (1.0 - p)), h], fill=hex_to_rgb(params.get("borderColor"), (255, 255, 255)) + (round(255 * opacity),))

    bw_px = max(4, round(h * 0.018))
    b_rgb = hex_to_rgb(params.get("borderColor"), (255, 255, 255))
    b_style = str(params.get("borderStyle", "comic_gutter"))
    if b_style in {"comic_gutter", "panel_split"}:
        draw.rectangle([0, 0, w - 1, h - 1], outline=b_rgb + (round(255 * opacity),), width=bw_px * 2)
        draw.rectangle([bw_px, bw_px, w - bw_px, h - bw_px], outline=(17, 17, 17, round(255 * opacity)), width=max(2, bw_px // 2))
        if b_style == "panel_split":
            draw.line([(w * 0.54, 0), (w * 0.46, h)], fill=(17, 17, 17, round(255 * opacity)), width=round(bw_px * 1.4))
            draw.line([(w * 0.54, 0), (w * 0.46, h)], fill=b_rgb + (round(255 * opacity),), width=max(2, round(bw_px * 0.8)))
    elif b_style == "action_burst":
        for i in range(24):
            a = (i / 24.0) * math.pi * 2.0
            p0 = (w * 0.5 + math.cos(a) * w * 0.36, h * 0.5 + math.sin(a) * h * 0.36)
            p1 = (w * 0.5 + math.cos(a) * w * 0.72, h * 0.5 + math.sin(a) * h * 0.72)
            draw.line([p0, p1], fill=(17, 17, 17, round(184 * opacity)), width=max(2, round(h * 0.004)))

    speech = str(params.get("speechText") or "").strip()
    bubble_style = str(params.get("bubbleStyle", "burst"))
    if speech and bubble_style != "none":
        bx = (float((tracked_pose or {}).get("x", params.get("bubbleX", 74.0))) / 100.0) * w
        by = (float((tracked_pose or {}).get("y", params.get("bubbleY", 24.0))) / 100.0) * h
        rad = max(38, round(h * 0.11))
        p_rgb = hex_to_rgb(params.get("panelColor"), (250, 204, 21))
        ink_alpha = round(255 * opacity)
        if bubble_style == "burst":
            pts = []
            for i in range(16):
                a = (i / 16.0) * math.pi * 2.0
                rr = rad * (1.25 if i % 2 == 0 else 0.78)
                pts.append((bx + math.cos(a) * rr * 1.35, by + math.sin(a) * rr * 0.92))
            draw.polygon(pts, fill=p_rgb + (ink_alpha,), outline=(17, 17, 17, ink_alpha), width=max(2, round(h * 0.006)))
        elif bubble_style == "caption_box":
            draw.rectangle([bx - rad * 1.3, by - rad * 0.55, bx + rad * 1.3, by + rad * 0.55], fill=p_rgb + (ink_alpha,), outline=(17, 17, 17, ink_alpha), width=max(2, round(h * 0.006)))
        else:
            draw.ellipse([bx - rad * 1.3, by - rad * 0.78, bx + rad * 1.3, by + rad * 0.78], fill=(255, 255, 255, ink_alpha), outline=(17, 17, 17, ink_alpha), width=max(2, round(h * 0.006)))
        font = _load_studio_font(max(14, round(h * 0.044)))
        draw.text((bx, by), speech, font=font, fill=(17, 17, 17, ink_alpha), anchor="mm")

    return np.asarray(out_img.convert("RGB"), dtype=np.uint8)


def compute_freeze_cutout_mask(src_rgb: np.ndarray, params: Mapping[str, Any]) -> np.ndarray:
    h, w, _ = src_rgb.shape
    pad_y, pad_x = max(2, round(h * 0.05)), max(2, round(w * 0.05))
    border_mask = np.zeros((h, w), dtype=bool)
    border_mask[:pad_y, :] = True
    border_mask[h - pad_y:, :] = True
    border_mask[:, :pad_x] = True
    border_mask[:, w - pad_x:] = True
    bg_color = np.mean(src_rgb[border_mask], axis=0)

    cx = (clamp(params.get("subjectX"), 10.0, 90.0, 50.0) / 100.0) * w
    cy = (clamp(params.get("subjectY"), 10.0, 90.0, 50.0) / 100.0) * h
    rad_pct = clamp(params.get("subjectRadius"), 12.0, 70.0, 34.0) / 100.0
    rx = max(10.0, rad_pct * w * 0.68)
    ry = max(10.0, rad_pct * h * 1.18)
    feather = clamp(params.get("feather"), 0.0, 40.0, 14.0) / 100.0

    ys = np.arange(h, dtype=np.float32)[:, None]
    xs = np.arange(w, dtype=np.float32)[None, :]
    spatial = np.sqrt(((xs - cx) / rx) ** 2 + ((ys - cy) / ry) ** 2)

    if str(params.get("maskMode", "auto_subject")) == "oval_portrait":
        a = np.clip((1.0 - spatial) / max(0.05, feather + 0.08), 0.0, 1.0)
    else:
        diff = src_rgb.astype(np.float32) - bg_color[None, None, :]
        color_dist = np.sqrt(np.sum(diff ** 2, axis=2)) / 441.67
        c_weight = 1.35 if str(params.get("maskMode")) == "chroma_backdrop" else 0.72
        score = (1.1 - spatial) * 0.62 + color_dist * c_weight
        a = np.clip((score - 0.36) / max(0.05, feather + 0.14), 0.0, 1.0)
        a = np.where(spatial > 1.35, 0.0, a)
    return np.clip(a * 255.0, 0, 255).astype(np.uint8)


def render_freeze_cutout_rgba(
    live_rgba: Image.Image,
    freeze_rgb: Optional[np.ndarray],
    effect: Mapping[str, Any],
    opacity: float,
    params: Mapping[str, Any],
    time: float,
) -> Image.Image:
    w, h = live_rgba.size
    src_arr = freeze_rgb if freeze_rgb is not None else np.asarray(live_rgba.convert("RGB"), dtype=np.uint8)
    if src_arr.shape[0] != h or src_arr.shape[1] != w:
        src_arr = np.asarray(Image.fromarray(src_arr, mode="RGB").resize((w, h), Image.Resampling.BICUBIC), dtype=np.uint8)

    mask_u8 = compute_freeze_cutout_mask(src_arr, params)
    cutout = Image.fromarray(src_arr, mode="RGB").convert("RGBA")
    cutout.putalpha(Image.fromarray(mask_u8, mode="L"))

    bg_layer = live_rgba.copy()
    bg_mode = str(params.get("animatedBg", "live_video"))
    bg_draw = ImageDraw.Draw(bg_layer)
    if bg_mode == "dark_blur":
        shade = Image.new("RGBA", (w, h), (8, 12, 22, 198))
        bg_layer = Image.alpha_composite(bg_layer, shade)
    elif bg_mode == "halftone_pulse":
        bg_layer = Image.new("RGBA", (w, h), (24, 24, 27, 255))
        d2 = ImageDraw.Draw(bg_layer)
        pulse = 0.5 + 0.5 * math.sin(time * 5.0)
        step = max(16, round(h * 0.05))
        r = step * (0.18 + 0.14 * pulse)
        col = (250, 204, 21, round(255 * (0.2 + 0.18 * pulse)))
        for yy in range(step // 2, h, step):
            for xx in range(step // 2, w, step):
                d2.ellipse([xx - r, yy - r, xx + r, yy + r], fill=col)
    elif bg_mode == "neon_grid":
        bg_layer = Image.new("RGBA", (w, h), (9, 11, 24, 255))
        d2 = ImageDraw.Draw(bg_layer)
        shift = round(((time * 40.0) % 40.0) * (h / 720.0))
        lw = max(1, round(h * 0.003))
        for xx in range(0, w, max(24, w // 12)):
            d2.line([(xx, 0), (xx, h)], fill=(56, 189, 248, 90), width=lw)
        for yy in range(shift, h, max(24, h // 8)):
            d2.line([(0, yy), (w, yy)], fill=(56, 189, 248, 90), width=lw)

    local_t = max(0.0, time - float(effect["startTime"]))
    pop = min(1.0, local_t / 0.25) if params.get("autoPop", True) else 1.0
    scale = clamp(params.get("cutoutScale"), 0.3, 2.5, 1.08) * (1.0 + math.sin(pop * math.pi) * 0.08)
    cx = (clamp(params.get("cutoutX"), 10.0, 90.0, 50.0) / 100.0) * w
    cy = (clamp(params.get("cutoutY"), 10.0, 90.0, 50.0) / 100.0) * h
    rot = clamp(params.get("cutoutRotation"), -45.0, 45.0, 0.0)

    out_w_px = clamp(params.get("outlineWidth"), 0.0, 24.0, 8.0) * (h / 720.0)
    outline_rgb = hex_to_rgb(params.get("outlineColor"), (250, 204, 21))
    card = cutout
    if out_w_px > 0.5:
        rad_k = max(3, int(round(out_w_px)) * 2 + 1)
        solid_alpha = cutout.getchannel("A").point(lambda v: 255 if v > 96 else 0)
        dilated = solid_alpha.filter(ImageFilter.MaxFilter(rad_k))
        halo = Image.new("RGBA", (w, h), outline_rgb + (255,))
        halo.putalpha(dilated)
        halo.paste(cutout, (0, 0), cutout)
        card = halo

    scaled = card.resize((max(4, round(w * scale)), max(4, round(h * scale))), Image.Resampling.BICUBIC)
    rotated = scaled.rotate(-rot, expand=True, resample=Image.Resampling.BICUBIC)
    px = round(cx - rotated.width * 0.5)
    py = round(cy - rotated.height * 0.5)

    out_rgba = bg_layer
    glow_val = clamp(params.get("glow"), 0.0, 100.0, 48.0)
    if glow_val > 2:
        g_alpha = rotated.getchannel("A").filter(ImageFilter.GaussianBlur(max(2, round(h * 0.03 * (glow_val / 100.0)))))
        glow_layer = Image.new("RGBA", rotated.size, outline_rgb + (255,))
        glow_layer.putalpha(g_alpha)
        out_rgba.alpha_composite(glow_layer, (px, py))

    out_rgba.alpha_composite(rotated, (px, py))

    label = str(params.get("labelText") or "").strip()
    if label:
        draw = ImageDraw.Draw(out_rgba)
        font = _load_studio_font(max(14, round(h * 0.036)))
        bbox = draw.textbbox((0, 0), label, font=font)
        tw = (bbox[2] - bbox[0]) + 24
        th = max(24, round(h * 0.06))
        lx, ly = cx, cy + h * 0.24 * scale
        draw.rectangle([lx - tw * 0.5, ly - th * 0.5, lx + tw * 0.5, ly + th * 0.5], fill=outline_rgb + (255,))
        draw.text((lx, ly), label, font=font, fill=hex_to_rgb(params.get("labelColor"), (17, 24, 39)) + (255,), anchor="mm")

    if opacity < 0.999:
        return Image.blend(live_rgba, out_rgba, opacity)
    return out_rgba


def _load_kinetic_font(family: str, size_px: int) -> ImageFont.ImageFont:
    font_dir = os.path.join(os.path.dirname(__file__), "assets", "fonts")
    mapping = {
        "Inter": os.path.join(font_dir, "Inter-ExtraBold.ttf"),
        "DejaVuSans": os.path.join(font_dir, "DejaVuSans-Bold.ttf"),
        "DejaVuSerif": "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "DejaVuSansMono": "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    }
    path = mapping.get(family, mapping["Inter"])
    if os.path.exists(path):
        try:
            return ImageFont.truetype(path, max(12, int(size_px)))
        except OSError:
            pass
    return _load_studio_font(size_px)


def render_kinetic_typography_rgba(
    src_rgba: Image.Image,
    effect: Mapping[str, Any],
    opacity: float,
    params: Mapping[str, Any],
    time: float,
) -> Image.Image:
    w, h = src_rgba.size
    word_timings = params.get("wordTimings")
    stagger_s = clamp(params.get("staggerMs"), 40.0, 600.0, 220.0) / 1000.0
    if isinstance(word_timings, list) and word_timings:
        words = word_timings
    else:
        tokens = [t for t in str(params.get("text") or "MAKE EVERY WORD COUNT").strip().split() if t]
        words = [{"word": tok, "start": i * stagger_s, "end": (i + 1) * stagger_s} for i, tok in enumerate(tokens)]
    if not words:
        return src_rgba

    local_t = max(0.0, time - float(effect["startTime"]))
    px = (clamp(params.get("x"), 10.0, 90.0, 50.0) / 100.0) * w
    py = (clamp(params.get("y"), 10.0, 90.0, 72.0) / 100.0) * h
    scale = clamp(params.get("scale"), 0.4, 2.5, 1.0)
    rot_deg = clamp(params.get("rotation"), -45.0, 45.0, 0.0)
    font_size = max(16, round(clamp(params.get("fontSize"), 20.0, 120.0, 54.0) * (h / 720.0) * scale))
    font = _load_kinetic_font(str(params.get("fontFamily", "Inter")), font_size)

    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    space_w = font_size * 0.32
    word_widths = [max(4.0, float(draw.textbbox((0, 0), str(item.get("word") or ""), font=font)[2])) for item in words]
    total_w = sum(word_widths) + max(0, len(words) - 1) * space_w

    style = str(params.get("style", "bounce"))
    base_rgb = hex_to_rgb(params.get("color"), (255, 255, 255))
    hi_rgb = hex_to_rgb(params.get("highlightColor"), (250, 204, 21))
    bg_rgb = hex_to_rgb(params.get("bgColor"), (15, 23, 42))
    show_bg = bool(params.get("showBg", True))
    cos_r, sin_r = math.cos(math.radians(rot_deg)), math.sin(math.radians(rot_deg))

    cur_x = -total_w * 0.5
    for idx, w_obj in enumerate(words):
        w_text = str(w_obj.get("word") or "")
        w_w = word_widths[idx]
        center_wx = cur_x + w_w * 0.5
        cur_x += w_w + space_w

        w_start = finite(w_obj.get("start"), 0.0)
        w_end = finite(w_obj.get("end"), w_start + 0.3)
        anim_dur = max(0.12, min(0.4, (w_end - w_start) or 0.22))
        raw_prog = clamp((local_t - w_start) / anim_dur, 0.0, 1.0, 1.0)
        if local_t < w_start and style != "karaoke_highlight":
            continue

        spoken = w_start <= local_t <= w_end
        w_alpha = opacity
        dy = 0.0
        w_scale = 1.0
        shown = w_text
        if style == "bounce":
            w_scale = max(0.2, math.sin(raw_prog * math.pi * 1.15) * 1.18 if raw_prog < 1.0 else 1.0)
            w_alpha *= min(1.0, raw_prog * 2.2)
        elif style == "slide_up":
            ease = 1.0 - (1.0 - raw_prog) ** 3
            dy = (1.0 - ease) * font_size * 0.75
            w_alpha *= ease
        elif style == "scale_pop":
            w_scale = 0.35 + 0.65 * (1.0 - (1.0 - raw_prog) ** 3)
            w_alpha *= min(1.0, raw_prog * 1.8)
        elif style == "typewriter":
            shown = w_text[:max(1, math.ceil(raw_prog * len(w_text)))]
        elif style == "karaoke_highlight":
            w_scale = 1.12 if spoken else 1.0

        wx = px + center_wx * cos_r - dy * sin_r
        wy = py + center_wx * sin_r + dy * cos_r
        w_font = _load_kinetic_font(str(params.get("fontFamily", "Inter")), round(font_size * w_scale)) if abs(w_scale - 1.0) > 0.02 else font
        a_u8 = round(clamp(w_alpha, 0.0, 1.0, 1.0) * 255)
        if spoken and show_bg:
            pad_x, pad_y = font_size * 0.22, font_size * 0.16
            draw.rounded_rectangle(
                [wx - w_w * 0.5 - pad_x, wy - font_size * 0.55 - pad_y * 0.5, wx + w_w * 0.5 + pad_x, wy + font_size * 0.55 + pad_y * 0.5],
                radius=6,
                fill=bg_rgb + (a_u8,),
            )
        txt_rgb = hi_rgb if spoken else base_rgb
        draw.text((wx, wy), shown, font=w_font, fill=txt_rgb + (a_u8,), stroke_width=max(2, round(font_size * 0.06)), stroke_fill=(0, 0, 0, round(a_u8 * 0.75)), anchor="mm")

    return Image.alpha_composite(src_rgba, layer)


def _eval_zoom_curve(frac: float, params: Mapping[str, Any]) -> float:
    u = clamp(frac, 0.0, 1.0, 0.0)
    easing = str(params.get("easing", "ease_in_out"))
    if easing == "punch":
        u = 1.0 - (1.0 - u) ** 4
    elif easing == "ease_out":
        u = 1.0 - (1.0 - u) ** 2
    elif easing == "ease_in_out":
        u = u * u * (3.0 - 2.0 * u)
    target = clamp(params.get("zoomScale"), 1.0, 2.8, 1.45)
    mode = str(params.get("mode", "punch_in"))
    if mode == "zoom_out":
        return target - (target - 1.0) * u
    if mode == "punch_in":
        return 1.0 + (target - 1.0) * math.sin(u * math.pi * 0.5)
    return 1.0 + (target - 1.0) * u


def _transform_clamp_rgb(
    src_img: Image.Image,
    zoom: float,
    focus_x: float,
    focus_y: float,
    pan_x_px: float,
    pan_y_px: float,
    rot_rad: float,
) -> np.ndarray:
    w, h = src_img.size
    abs_cos, abs_sin = abs(math.cos(rot_rad)), abs(math.sin(rot_rad))
    min_cover_zoom = max((w * abs_cos + h * abs_sin) / max(1.0, float(w)), (w * abs_sin + h * abs_cos) / max(1.0, float(h)))
    safe_zoom = max(float(zoom), min_cover_zoom + 0.01)

    cover_w = (w * abs_cos + h * abs_sin) / safe_zoom
    cover_h = (w * abs_sin + h * abs_cos) / safe_zoom
    req_fx = (clamp(focus_x, 10.0, 90.0, 50.0) / 100.0) * w - pan_x_px
    req_fy = (clamp(focus_y, 10.0, 90.0, 50.0) / 100.0) * h - pan_y_px
    blend_alpha = min(1.0, (safe_zoom - 1.0) / 0.35)
    ideal_x = w * 0.5 * (1.0 - blend_alpha) + req_fx * blend_alpha
    ideal_y = h * 0.5 * (1.0 - blend_alpha) + req_fy * blend_alpha
    src_cx = max(cover_w * 0.5, min(w - cover_w * 0.5, ideal_x))
    src_cy = max(cover_h * 0.5, min(h - cover_h * 0.5, ideal_y))

    inv_z = 1.0 / max(0.2, safe_zoom)
    cos_r, sin_r = math.cos(rot_rad), math.sin(rot_rad)
    dx_c, dy_c = w * 0.5, h * 0.5
    # Inverse affine mapping destination pixel -> safe clamped source region
    a = inv_z * cos_r
    b = inv_z * sin_r
    c = src_cx - a * dx_c - b * dy_c
    d = -inv_z * sin_r
    e = inv_z * cos_r
    f = src_cy - d * dx_c - e * dy_c
    warped = src_img.transform((w, h), Image.Transform.AFFINE, (a, b, c, d, e, f), Image.Resampling.BICUBIC)
    return np.asarray(warped, dtype=np.float32)


def render_zoom_motion_blur_rgb(
    frame_rgb: np.ndarray,
    effect: Mapping[str, Any],
    opacity: float,
    params: Mapping[str, Any],
    target_keys: Sequence[Mapping[str, Any]],
    time: float,
    tracked_pose: Optional[Mapping[str, float]] = None,
) -> np.ndarray:
    h, w, _ = frame_rgb.shape
    dur = max(0.1, float(effect["duration"]))
    local_frac = clamp((time - float(effect["startTime"])) / dur, 0.0, 1.0, 0.0)
    has_zoom_keys = any(str(k.get("property")) == "zoomScale" for k in target_keys)
    focus_x = float((tracked_pose or {}).get("x", params.get("focusX", 50.0)))
    focus_y = float((tracked_pose or {}).get("y", params.get("focusY", 50.0)))
    blur_str = clamp(params.get("motionBlurStrength"), 0.0, 100.0, 55.0) / 100.0
    samples = 5 if blur_str > 0.04 else 1

    src_img = Image.fromarray(frame_rgb, mode="RGB")
    accum = np.zeros((h, w, 3), dtype=np.float32)
    weight_sum = 0.0

    for s in range(samples):
        dt_frac = (s / (samples - 1) - 0.5) * 0.06 * blur_str if samples > 1 else 0.0
        s_frac = clamp(local_frac - dt_frac, 0.0, 1.0, local_frac)
        zoom = _eval_zoom_curve(s_frac, params) if (not has_zoom_keys and bool(params.get("autoAnimate", True))) else clamp(params.get("zoomScale"), 1.0, 2.8, 1.45)
        rot_rad = math.radians(clamp(params.get("rotation"), -30.0, 30.0, 0.0)) * s_frac
        safe_zoom = max(zoom, 1.0 + abs(math.sin(rot_rad)) * 0.45)
        max_px_x = max(0.0, (safe_zoom - 1.0) * w * 0.48)
        max_px_y = max(0.0, (safe_zoom - 1.0) * h * 0.48)
        px = max(-max_px_x, min(max_px_x, (clamp(params.get("panX"), -30.0, 30.0, 0.0) / 100.0) * w * s_frac))
        py = max(-max_px_y, min(max_px_y, (clamp(params.get("panY"), -30.0, 30.0, 0.0) / 100.0) * h * s_frac))
        sample_arr = _transform_clamp_rgb(src_img, safe_zoom, focus_x, focus_y, px, py, rot_rad)
        wt = 1.0 / (s + 1)
        accum += sample_arr * wt
        weight_sum += wt

    blurred = accum / max(0.001, weight_sum)
    if opacity < 0.999:
        blurred = frame_rgb.astype(np.float32) * (1.0 - opacity) + blurred * opacity
    return np.clip(blurred, 0, 255).astype(np.uint8)


def render_flash_camera_shake_rgb(
    frame_rgb: np.ndarray,
    effect: Mapping[str, Any],
    opacity: float,
    params: Mapping[str, Any],
    time: float,
    beat_markers: Sequence[Any] = (),
) -> np.ndarray:
    h, w, _ = frame_rgb.shape
    local_t = max(0.0, time - float(effect["startTime"]))
    dur = max(0.1, float(effect["duration"]))
    near_beat = min(
        [abs(finite(bm.get("time") if isinstance(bm, Mapping) else bm, -999.0) - time) for bm in (beat_markers or [])] or [999.0]
    )
    beat_boost = (1.0 + (1.0 - near_beat / 0.16) * 0.9) if (bool(params.get("beatSync")) and near_beat <= 0.16) else 1.0
    mode = str(params.get("mode", "impact_shake"))
    freq = clamp(params.get("shakeFrequency"), 1.0, 30.0, 14.0)
    decay = math.exp(-local_t * 3.2) if mode == "impact_shake" else (max(0.0, math.sin(local_t * freq * math.pi)) if mode == "strobe_pulse" else 1.0)
    shake_amt = (clamp(params.get("shakeStrength"), 0.0, 100.0, 58.0) / 100.0) * decay * beat_boost * opacity

    arr = frame_rgb.astype(np.float32)
    if shake_amt > 0.01 and mode not in {"exposure_flash", "strobe_pulse"}:
        max_px = min(w, h) * 0.045 * shake_amt
        if mode == "directional_whip":
            ang = math.radians(clamp(params.get("directionalAngle"), -180.0, 180.0, 20.0))
            osc = math.sin(local_t * freq * math.pi * 2.0)
            dx, dy = math.cos(ang) * max_px * osc, math.sin(ang) * max_px * osc
        else:
            dx = (math.sin(local_t * freq * 6.283 + 0.5) * 0.7 + math.cos(local_t * freq * 11.1) * 0.3) * max_px
            dy = (math.cos(local_t * freq * 5.71 + 1.2) * 0.7 + math.sin(local_t * freq * 9.8) * 0.3) * max_px
        rot_rad = math.sin(local_t * freq * 4.3) * 0.025 * shake_amt
        safe_zoom = 1.0 + (abs(dx) * 2.1) / max(1.0, float(w)) + (abs(dy) * 2.1) / max(1.0, float(h)) + abs(math.sin(rot_rad)) * 1.4
        arr = _transform_clamp_rgb(Image.fromarray(frame_rgb, mode="RGB"), safe_zoom, 50.0, 50.0, dx, dy, rot_rad)

    flash_base = clamp(params.get("flashIntensity"), 0.0, 100.0, 68.0) / 100.0
    flash_alpha = 0.0
    if flash_base > 0.01:
        if mode == "strobe_pulse":
            flash_alpha = flash_base * 0.65 * (max(0.0, math.sin(local_t * freq * math.pi)) ** 2)
        elif mode in {"exposure_flash", "impact_shake"}:
            flash_alpha = flash_base * 0.78 * max(0.0, 1.0 - local_t / min(0.45, dur * 0.5)) * beat_boost
        elif bool(params.get("beatSync")) and near_beat <= 0.16:
            flash_alpha = flash_base * 0.55 * (1.0 - near_beat / 0.16)
    flash_alpha = max(0.0, min(0.9, flash_alpha * opacity))
    if flash_alpha > 0.005:
        f_rgb = np.array(hex_to_rgb(params.get("flashColor"), (255, 255, 255)), dtype=np.float32) / 255.0
        base = arr / 255.0
        screened = 1.0 - (1.0 - base) * (1.0 - f_rgb[None, None, :])
        arr = (base * (1.0 - flash_alpha) + screened * flash_alpha) * 255.0
    return np.clip(arr, 0, 255).astype(np.uint8)


def render_particle_overlays_rgb(
    frame_rgb: np.ndarray,
    effect: Mapping[str, Any],
    opacity: float,
    params: Mapping[str, Any],
    time: float,
) -> np.ndarray:
    h, w, _ = frame_rgb.shape
    count = max(10, min(200, round(finite(params.get("particleCount"), 75.0))))
    speed = clamp(params.get("speed"), 0.2, 3.0, 1.0)
    local_t = max(0.0, time - float(effect["startTime"])) * speed
    p_size = clamp(params.get("size"), 2.0, 24.0, 8.0) * max(0.5, h / 720.0)
    c1 = hex_to_rgb(params.get("color"), (255, 209, 102))
    c2 = hex_to_rgb(params.get("secondaryColor"), (255, 94, 126))
    confetti_cols = [(255, 94, 126), (56, 189, 248), (250, 204, 21), (74, 222, 128), (192, 132, 252)]
    p_type = str(params.get("particleType", "sparks"))
    direction = str(params.get("direction", "up"))

    p_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(p_layer)
    rand = mulberry32(hash_seed(f"pt-{int(params.get('seed', 53))}"))
    for i in range(count):
        x0, y0 = rand(), rand()
        p_scale = 0.55 + rand() * 0.9
        phase = rand() * 6.283
        v_jit = 0.65 + rand() * 0.7
        vx, vy = (rand() - 0.5) * 0.14, -0.35 * v_jit
        if direction == "down":
            vy = 0.35 * v_jit
        elif direction == "left":
            vx, vy = -0.38 * v_jit, (rand() - 0.5) * 0.12
        elif direction == "right":
            vx, vy = 0.38 * v_jit, (rand() - 0.5) * 0.12
        elif direction == "radial_float":
            vx, vy = math.cos(phase) * 0.18, math.sin(phase) * 0.18

        wx = ((x0 + vx * local_t + math.sin(local_t * 2.2 + phase) * 0.025) % 1.12) - 0.06
        wy = ((y0 + vy * local_t) % 1.12) - 0.06
        px, py = wx * w, wy * h
        r = max(1.5, p_size * p_scale * (3.2 if p_type == "smoke" else 0.65))
        col = confetti_cols[i % len(confetti_cols)] if p_type == "confetti" else (c2 if i % 3 == 0 else c1)
        p_alpha = opacity * ((0.4 + 0.6 * abs(math.sin(local_t * 6.0 + phase))) if p_type == "glitter" else (0.24 if p_type == "smoke" else 0.85))
        a_u8 = max(0, min(255, round(p_alpha * 255)))
        if p_type == "confetti":
            draw.rectangle([px - r, py - r * 0.5, px + r, py + r * 0.5], fill=col + (a_u8,))
        elif p_type in {"sparks", "glitter"}:
            draw.ellipse([px - r * 1.6, py - r * 1.6, px + r * 1.6, py + r * 1.6], fill=col + (round(a_u8 * 0.55),))
            draw.ellipse([px - r * 0.6, py - r * 0.6, px + r * 0.6, py + r * 0.6], fill=(255, 255, 255, a_u8))
        else:
            draw.ellipse([px - r, py - r, px + r, py + r], fill=col + (a_u8,))

    if str(params.get("maskMode")) == "behind_subject":
        subj_mask = compute_freeze_cutout_mask(
            frame_rgb,
            {"maskMode": "auto_subject", "subjectX": params.get("subjectX", 50.0), "subjectY": params.get("subjectY", 50.0), "subjectRadius": params.get("subjectRadius", 34.0), "feather": 14.0},
        )
        p_arr = np.asarray(p_layer, dtype=np.uint8).copy()
        p_arr[:, :, 3] = np.clip(p_arr[:, :, 3].astype(np.float32) * (1.0 - subj_mask.astype(np.float32) / 255.0), 0, 255).astype(np.uint8)
        p_layer = Image.fromarray(p_arr, mode="RGBA")

    p_np = np.asarray(p_layer, dtype=np.float32)
    alpha = p_np[:, :, 3:4] / 255.0
    p_rgb = p_np[:, :, :3] / 255.0
    base = frame_rgb.astype(np.float32) / 255.0
    blend = str(effect.get("blendMode", "screen"))
    if blend == "screen":
        comp = 1.0 - (1.0 - base) * (1.0 - p_rgb * alpha)
    else:
        comp = base * (1.0 - alpha) + p_rgb * alpha
    return np.clip(comp * 255.0, 0, 255).astype(np.uint8)


def apply_creative_effects_to_frame(
    frame_rgb: np.ndarray,
    creative_effects: Sequence[Mapping[str, Any]],
    motion_keyframes: Sequence[Mapping[str, Any]],
    time: float,
    fps: float = 30.0,
    *,
    behind_frame_rgb: Optional[np.ndarray] = None,
    freeze_frames: Optional[Mapping[str, np.ndarray]] = None,
    beat_markers: Sequence[Any] = (),
    tracked_poses: Optional[Mapping[str, Mapping[str, float]]] = None,
) -> np.ndarray:
    active = [
        eff
        for eff in creative_effects
        if eff.get("enabled", True) and float(eff["startTime"]) <= time <= float(eff["startTime"]) + float(eff["duration"])
    ]
    if not active:
        return frame_rgb

    current = frame_rgb
    for eff in active:
        opacity, params, target_keys = evaluate_effect_at_time(eff, motion_keyframes, time)
        if opacity <= 0.001:
            continue
        eid = eff["effectId"]
        pose = dict((tracked_poses or {}).get(str(eff["id"])) or {})
        tracking = eff.get("tracking") or {}
        if tracking.get("enabled") and tracking.get("sourceLayerId") and not pose:
            src_keys = tracking.get("source_keyframes") or []
            src_base = tracking.get("source_base") or {}
            ox = finite(tracking.get("offsetX"), 0.0)
            oy = finite(tracking.get("offsetY"), 0.0)
            pose = {
                "x": clamp(_interpolate_keys(src_keys, "x", time, finite(src_base.get("x"), 50.0)) + ox, 5.0, 95.0, 50.0),
                "y": clamp(_interpolate_keys(src_keys, "y", time, finite(src_base.get("y"), 45.0)) + oy, 5.0, 95.0, 45.0),
                "scale": clamp(_interpolate_keys(src_keys, "scale", time, finite(src_base.get("scale"), 1.0)) * finite(params.get("scale"), 1.0), 0.2, 3.0, 1.0),
                "rotation": _interpolate_keys(src_keys, "rotation", time, finite(src_base.get("rotation"), 0.0)) + finite(params.get("rotation"), 0.0),
            }

        if eid == "scrapbook":
            out_rgba = render_scrapbook_effect_rgba(Image.fromarray(current, mode="RGB").convert("RGBA"), opacity, params)
            current = np.asarray(out_rgba.convert("RGB"), dtype=np.uint8)
        elif eid == "ripped_paper":
            behind_img = Image.fromarray(behind_frame_rgb, mode="RGB").convert("RGBA") if behind_frame_rgb is not None else None
            out_rgba = render_ripped_paper_rgba(
                Image.fromarray(current, mode="RGB").convert("RGBA"),
                eff,
                opacity,
                params,
                target_keys,
                time,
                behind_rgba=behind_img,
            )
            current = np.asarray(out_rgba.convert("RGB"), dtype=np.uint8)
        elif eid == "doodles":
            out_rgba = render_doodle_rgba(
                Image.fromarray(current, mode="RGB").convert("RGBA"),
                eff,
                opacity,
                params,
                target_keys,
                time,
                tracked_pose=pose or None,
            )
            current = np.asarray(out_rgba.convert("RGB"), dtype=np.uint8)
        elif eid == "film_grain":
            current = render_film_grain_rgb(current, opacity, params, time, fps)
        elif eid == "light_leaks":
            current = render_light_leak_rgb(current, eff, opacity, params, time)
        elif eid == "vhs_glitch":
            current = render_vhs_glitch_rgb(current, opacity, params, time, fps, beat_markers=beat_markers)
        elif eid == "comic_pop_art":
            current = render_comic_pop_art_rgb(current, eff, opacity, params, time, tracked_pose=pose or None)
        elif eid == "freeze_cutout":
            frozen = (freeze_frames or {}).get(str(eff["id"]))
            out_rgba = render_freeze_cutout_rgba(Image.fromarray(current, mode="RGB").convert("RGBA"), frozen, eff, opacity, params, time)
            current = np.asarray(out_rgba.convert("RGB"), dtype=np.uint8)
        elif eid == "kinetic_typography":
            out_rgba = render_kinetic_typography_rgba(Image.fromarray(current, mode="RGB").convert("RGBA"), eff, opacity, params, time)
            current = np.asarray(out_rgba.convert("RGB"), dtype=np.uint8)
        elif eid == "zoom_motion_blur":
            current = render_zoom_motion_blur_rgb(current, eff, opacity, params, target_keys, time, tracked_pose=pose or None)
        elif eid == "flash_camera_shake":
            current = render_flash_camera_shake_rgb(current, eff, opacity, params, time, beat_markers=beat_markers)
        elif eid == "particle_overlays":
            current = render_particle_overlays_rgb(current, eff, opacity, params, time)
    return current


def _extract_frame_rgb(video_path: str, timestamp: float, width: int, height: int) -> Optional[np.ndarray]:
    cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-ss",
        f"{max(0.0, timestamp):.4f}",
        "-i",
        video_path,
        "-vframes",
        "1",
        "-vf",
        f"scale={width}:{height}",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
    ]
    res = subprocess.run(cmd, capture_output=True)
    expected = width * height * 3
    if res.returncode == 0 and len(res.stdout) >= expected:
        return np.frombuffer(res.stdout[:expected], dtype=np.uint8).reshape((height, width, 3)).copy()
    return None


def _probe_video_meta(video_path: str) -> Tuple[int, int, float, bool]:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,r_frame_rate,avg_frame_rate",
        "-of",
        "csv=p=0",
        video_path,
    ]
    res = subprocess.run(cmd, check=True, capture_output=True, text=True)
    parts = [p.strip() for p in res.stdout.strip().splitlines()[0].split(",")]
    w, h = int(parts[0]), int(parts[1])
    fps_str = parts[3] if len(parts) > 3 and "/" in parts[3] and parts[3] != "0/0" else parts[2]
    num, den = fps_str.split("/")
    fps = float(num) / max(1.0, float(den))
    audio_probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", video_path],
        check=False,
        capture_output=True,
        text=True,
    )
    has_audio = bool(audio_probe.stdout.strip())
    return w, h, max(1.0, fps), has_audio


def _apply_speed_ramp_ffmpeg(input_path: str, output_path: str, speed_fx: Mapping[str, Any], has_audio: bool) -> None:
    params = speed_fx.get("params") or {}
    preset = str(params.get("preset", "hero_slow_mo"))
    if preset == "montage_burst":
        rates = [2.0, 0.5]
    elif preset == "bullet_time":
        rates = [0.4, 0.4]
    elif preset == "ramp_in":
        rates = [0.5, 1.0]
    elif preset == "ramp_out":
        rates = [1.0, 2.0]
    else:
        rates = [clamp(params.get("startRate"), 0.5, 4.0, 1.5), clamp(params.get("midRate"), 0.5, 4.0, 0.6), clamp(params.get("endRate"), 0.5, 4.0, 1.5)]
    avg_rate = max(0.5, min(2.0, sum(rates) / max(1, len(rates))))
    reverse = bool(params.get("reverse"))
    v_filters = []
    if reverse:
        v_filters.append("reverse")
    v_filters.append(f"setpts=(PTS-STARTPTS)/{avg_rate:.4f}")
    if bool(params.get("opticalFlow")) and avg_rate < 1.0:
        v_filters.append("minterpolate=mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=30")
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", input_path, "-vf", ",".join(v_filters)]
    if has_audio:
        a_filters = ["areverse"] if reverse else []
        a_filters.append(f"atempo={avg_rate:.4f}")
        cmd.extend(["-af", ",".join(a_filters), "-c:a", "aac", "-b:a", "160k"])
    else:
        cmd.append("-an")
    cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output_path])
    subprocess.run(cmd, check=True)


def render_creative_effects_video(
    input_path: str,
    output_path: str,
    creative_effects: Sequence[Mapping[str, Any]],
    *,
    motion_keyframes: Optional[Sequence[Mapping[str, Any]]] = None,
    duration: Optional[float] = None,
    behind_video_path: Optional[str] = None,
    behind_image_path: Optional[str] = None,
    beat_markers: Sequence[Any] = (),
    fps_override: Optional[float] = None,
    apply_standalone_speed: bool = True,
) -> Dict[str, Any]:
    """Process a real video through the Creative Effects renderer preserving audio sync."""
    normalized = normalize_creative_effects(creative_effects, duration=duration)
    w, h, probed_fps, has_audio = _probe_video_meta(input_path)
    fps = float(fps_override or probed_fps)
    keys = list(motion_keyframes or [])

    if not any(eff["enabled"] for eff in normalized):
        raise ValueError("No enabled creative effects to render")

    freeze_frames: Dict[str, np.ndarray] = {}
    for eff in normalized:
        if eff.get("enabled", True) and eff["effectId"] == "freeze_cutout":
            freeze_ts = finite((eff.get("params") or {}).get("freezeTime"), float(eff["startTime"]))
            extracted = _extract_frame_rgb(input_path, freeze_ts, w, h)
            if extracted is not None:
                freeze_frames[str(eff["id"])] = extracted

    behind_static: Optional[np.ndarray] = None
    if behind_image_path and os.path.exists(behind_image_path):
        behind_static = np.asarray(Image.open(behind_image_path).convert("RGB").resize((w, h), Image.Resampling.BICUBIC), dtype=np.uint8)

    dec_cmd = ["ffmpeg", "-v", "error", "-i", input_path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    dec_proc = subprocess.Popen(dec_cmd, stdout=subprocess.PIPE)
    behind_proc = None
    if behind_video_path and os.path.exists(behind_video_path):
        behind_cmd = [
            "ffmpeg",
            "-v",
            "error",
            "-stream_loop",
            "-1",
            "-i",
            behind_video_path,
            "-vf",
            f"scale={w}:{h}",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ]
        behind_proc = subprocess.Popen(behind_cmd, stdout=subprocess.PIPE)

    enc_cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{w}x{h}",
        "-r",
        f"{fps:.6f}",
        "-i",
        "-",
    ]
    if has_audio:
        enc_cmd.extend(["-i", input_path, "-map", "0:v:0", "-map", "1:a:0", "-c:a", "copy"])
    else:
        enc_cmd.extend(["-map", "0:v:0", "-an"])
    enc_cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-shortest", "-movflags", "+faststart", output_path])
    enc_proc = subprocess.Popen(enc_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    frame_bytes = w * h * 3
    frame_idx = 0
    try:
        while True:
            raw = dec_proc.stdout.read(frame_bytes)
            if not raw or len(raw) < frame_bytes:
                break
            behind_frame = behind_static
            if behind_proc is not None:
                b_raw = behind_proc.stdout.read(frame_bytes)
                if b_raw and len(b_raw) == frame_bytes:
                    behind_frame = np.frombuffer(b_raw, dtype=np.uint8).reshape((h, w, 3))
            frame_rgb = np.frombuffer(raw, dtype=np.uint8).reshape((h, w, 3)).copy()
            t = frame_idx / fps
            out_rgb = apply_creative_effects_to_frame(
                frame_rgb,
                normalized,
                keys,
                t,
                fps=fps,
                behind_frame_rgb=behind_frame,
                freeze_frames=freeze_frames,
                beat_markers=beat_markers,
            )
            enc_proc.stdin.write(out_rgb.tobytes())
            frame_idx += 1
    finally:
        if dec_proc.stdout:
            dec_proc.stdout.close()
        if behind_proc is not None:
            if behind_proc.stdout:
                behind_proc.stdout.close()
            behind_proc.terminate()
            behind_proc.wait()
        if enc_proc.stdin:
            enc_proc.stdin.close()
        dec_rc = dec_proc.wait()
        stderr_out = enc_proc.stderr.read().decode("utf-8", errors="replace") if enc_proc.stderr else ""
        enc_rc = enc_proc.wait()
        if dec_rc != 0:
            raise RuntimeError(f"Creative effects decode failed (exit {dec_rc})")
        if enc_rc != 0:
            raise RuntimeError(f"Creative effects encode failed (exit {enc_rc}): {stderr_out}")

    if apply_standalone_speed:
        speed_fx = next((e for e in normalized if e.get("enabled", True) and e["effectId"] == "speed_ramping"), None)
        if speed_fx is not None:
            tmp_raw = f"{output_path}.pre_speed.mp4"
            os.replace(output_path, tmp_raw)
            try:
                _apply_speed_ramp_ffmpeg(tmp_raw, output_path, speed_fx, has_audio)
            finally:
                if os.path.exists(tmp_raw):
                    os.remove(tmp_raw)

    return {
        "frames_processed": frame_idx,
        "width": w,
        "height": h,
        "fps": fps,
        "effects_applied": [e["effectId"] for e in normalized if e["enabled"]],
    }
