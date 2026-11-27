"""Pro Studio backend render helpers: NVENC/HW probing, optical flow, reverse/freeze, film FX, LUFS."""

from __future__ import annotations

import math
import shutil
import subprocess
from fractions import Fraction
from typing import Any, Dict, List, Mapping, Optional

LOUDNESS_STANDARDS: Dict[str, Dict[str, float]] = {
    "social": {"target_lufs": -14.0, "true_peak_dbtp": -1.0},
    "podcast": {"target_lufs": -16.0, "true_peak_dbtp": -1.0},
    "broadcast": {"target_lufs": -23.0, "true_peak_dbtp": -1.0},
}


def _clamp(value: Any, low: float, high: float, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, parsed))


def probe_hardware_encoders(ffmpeg_bin: Optional[str] = None) -> Dict[str, bool]:
    """Safely detect available hardware video encoders in FFmpeg."""
    binary = ffmpeg_bin or shutil.which("ffmpeg")
    caps = {
        "h264_nvenc": False,
        "hevc_nvenc": False,
        "h264_vaapi": False,
        "h264_videotoolbox": False,
    }
    if not binary:
        return caps
    try:
        res = subprocess.run(
            [binary, "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        stdout = res.stdout or ""
        for key in list(caps.keys()):
            if key in stdout:
                # Verify real device open only for nvenc via 1-frame null encode
                if "nvenc" in key:
                    probe = subprocess.run(
                        [
                            binary,
                            "-v",
                            "error",
                            "-f",
                            "lavfi",
                            "-i",
                            "color=black:s=64x64:r=24",
                            "-frames:v",
                            "1",
                            "-c:v",
                            key,
                            "-f",
                            "null",
                            "-",
                        ],
                        capture_output=True,
                        timeout=15,
                        check=False,
                    )
                    caps[key] = probe.returncode == 0
                else:
                    caps[key] = True
    except (OSError, subprocess.SubprocessError):
        return caps
    return caps


def select_video_encode_profile(
    *,
    prefer_hw: bool = True,
    codec: str = "h264",
    width: int = 1920,
    height: int = 1080,
    fps: int = 30,
    detected_caps: Optional[Mapping[str, bool]] = None,
) -> Dict[str, Any]:
    """Select optimal FFmpeg encoder flags with lossless libx264 fallback."""
    caps = dict(detected_caps) if detected_caps is not None else probe_hardware_encoders()
    safe_fps = max(1, min(120, int(fps or 30)))
    is_4k_or_60 = max(int(width or 0), int(height or 0)) >= 2160 or safe_fps >= 50

    if prefer_hw and codec == "hevc" and caps.get("hevc_nvenc"):
        return {
            "encoder": "hevc_nvenc",
            "hardware": True,
            "supports_4k60": True,
            "args": ["-c:v", "hevc_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "20", "-b:v", "0"],
        }
    if prefer_hw and caps.get("h264_nvenc"):
        return {
            "encoder": "h264_nvenc",
            "hardware": True,
            "supports_4k60": True,
            "args": ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "18", "-b:v", "0"],
        }
    if prefer_hw and caps.get("h264_videotoolbox"):
        return {
            "encoder": "h264_videotoolbox",
            "hardware": True,
            "supports_4k60": True,
            "args": ["-c:v", "h264_videotoolbox", "-q:v", "65"],
        }

    preset = "faster" if is_4k_or_60 else "fast"
    return {
        "encoder": "libx264",
        "hardware": False,
        "supports_4k60": bool(caps.get("h264_nvenc") or caps.get("hevc_nvenc")),
        "args": ["-c:v", "libx264", "-preset", preset, "-crf", "18", "-pix_fmt", "yuv420p"],
    }


def build_optical_flow_speed_filter(
    speed_rate: Any,
    *,
    target_fps: int = 60,
    optical_flow: bool = False,
) -> str:
    """Build video retiming filter with optional motion-compensated optical flow."""
    rate = _clamp(speed_rate, 0.1, 16.0, 1.0)
    if isinstance(target_fps, Fraction):
        if not 1 <= target_fps <= 120:
            raise ValueError("Unsupported Studio optical flow frame rate")
        fps = str(target_fps)
    else:
        fps = max(15, min(120, int(target_fps or 60)))
    pts_expr = f"setpts={1.0 / rate:.6f}*(PTS-STARTPTS)"
    if optical_flow and rate < 0.99:
        return (
            f"{pts_expr},"
            f"minterpolate=fps={fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
        )
    return f"{pts_expr},fps={fps}"


def build_reverse_freeze_filter(
    *,
    mode: str = "reverse",
    hold_seconds: float = 1.5,
    has_audio: bool = True,
) -> Dict[str, Any]:
    """Build FFmpeg video/audio filter strings for reverse or freeze-frame occurrences."""
    normalized = str(mode or "").strip().lower()
    if normalized == "reverse":
        return {
            "mode": "reverse",
            "video_filter": "reverse,setpts=PTS-STARTPTS",
            "audio_filter": "areverse,asetpts=PTS-STARTPTS" if has_audio else "",
        }
    if normalized == "freeze":
        hold = _clamp(hold_seconds, 0.1, 30.0, 1.5)
        return {
            "mode": "freeze",
            "hold_seconds": hold,
            "video_filter": f"tpad=stop_mode=clone:stop_duration={hold:.3f}",
            "audio_filter": f"apad=pad_dur={hold:.3f}" if has_audio else "",
        }
    raise ValueError(f"Unsupported playback mode: {mode}")


def _to_percent_scale(value: Any) -> float:
    """Normalize texture strength whether passed as unit (0..1) or percentage (0..100)."""
    try:
        numeric = float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0
    if numeric <= 0.0:
        return 0.0
    return _clamp(numeric * 100.0 if numeric <= 1.0 else numeric, 0.0, 100.0, 0.0)


def build_film_emulation_filter(fx: Mapping[str, Any]) -> str:
    """Build secondary halation, chromatic aberration, and film grain filters."""
    if not fx:
        return ""
    stages: List[str] = []
    chroma = _to_percent_scale(fx.get("chromaticAberration", 0))
    if chroma > 1.0:
        px = max(1, min(6, round((chroma / 100.0) * 5)))
        stages.append(f"rgbashift=rh={px}:bh=-{px}:edge=smear")

    halation = _to_percent_scale(fx.get("halation", 0))
    if halation > 1.0:
        sigma = round(2.0 + (halation / 100.0) * 8.0, 2)
        stages.append(
            f"format=gbrp,split[h_base][h_glow];"
            f"[h_glow]lutrgb=r='if(gt(val,165),(val-165)*2.4,0)':"
            f"g='if(gt(val,165),(val-165)*0.82,0)':"
            f"b='if(gt(val,165),(val-165)*0.29,0)',"
            f"gblur=sigma={sigma}:steps=2[h_blur];"
            f"[h_base][h_blur]blend=all_mode=screen:all_opacity={round(halation / 220.0, 3)}"
        )

    grain = _to_percent_scale(fx.get("filmGrain", 0))
    if grain > 1.0:
        strength = max(2, min(28, round((grain / 100.0) * 24)))
        stages.append(f"noise=alls={strength}:allf=t+u")

    lens_blur = _to_percent_scale(fx.get("lensBlur", 0))
    dream_glow = _to_percent_scale(fx.get("dreamGlow", 0))
    anamorphic = _to_percent_scale(fx.get("anamorphicFlare", 0))
    if any(value > 1.0 for value in (lens_blur, dream_glow, anamorphic)):
        stages.append("format=gbrp")
    if lens_blur > 1.0:
        sigma = round(1.5 + (lens_blur / 100.0) * 9.5, 2)
        stages.append(
            f"split=3[pe_lb_base][pe_lb_src][pe_lb_ref];"
            f"[pe_lb_src]gblur=sigma={sigma}:steps=2[pe_lb_blur];"
            f"[pe_lb_ref]scale=64:64,geq="
            f"r='255*clip((hypot((X-32)/32,(Y-32)/32)-0.25)/0.75,0,1)':"
            f"g='255*clip((hypot((X-32)/32,(Y-32)/32)-0.25)/0.75,0,1)':"
            f"b='255*clip((hypot((X-32)/32,(Y-32)/32)-0.25)/0.75,0,1)'[pe_lb_small];"
            f"[pe_lb_small][pe_lb_base]scale2ref[pe_lb_mask][pe_lb_base2];"
            f"[pe_lb_base2][pe_lb_blur][pe_lb_mask]maskedmerge"
        )
    if dream_glow > 1.0:
        sigma = round(4.0 + (dream_glow / 100.0) * 12.0, 2)
        stages.append(
            f"split[pe_dg_base][pe_dg_hi];"
            f"[pe_dg_hi]lutrgb=r='if(gt(val,135),(val-135)*1.9,0)':"
            f"g='if(gt(val,135),(val-135)*1.9,0)':"
            f"b='if(gt(val,135),(val-135)*1.9,0)',"
            f"gblur=sigma={sigma}:steps=2[pe_dg_blur];"
            f"[pe_dg_base][pe_dg_blur]blend=all_mode=screen:all_opacity={round((dream_glow / 100.0) * 0.55, 3)}"
        )
    if anamorphic > 1.0:
        sigma_h = round(14.0 + (anamorphic / 100.0) * 42.0, 2)
        stages.append(
            f"split[pe_af_base][pe_af_hi];"
            f"[pe_af_hi]lutrgb=r='if(gt(val,180),(val-180)*1.1,0)':"
            f"g='if(gt(val,180),(val-180)*2.4,0)':"
            f"b='if(gt(val,180),min(255,(val-180)*3.4),0)',"
            f"gblur=sigma={sigma_h}:sigmaV=0.5:steps=2[pe_af_streak];"
            f"[pe_af_base][pe_af_streak]blend=all_mode=screen:all_opacity={round((anamorphic / 100.0) * 0.72, 3)}"
        )

    return ",".join(stages)


def _smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge1 <= edge0:
        return 1.0 if x >= edge1 else 0.0
    t = _clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0, 0.0)
    return t * t * (3.0 - 2.0 * t)


def _rgb_to_hsl(r: float, g: float, b: float) -> tuple[float, float, float]:
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    l_val = (max_c + min_c) * 0.5
    if max_c == min_c:
        return 0.0, 0.0, l_val
    d = max_c - min_c
    s_val = d / max(1e-5, 2.0 - max_c - min_c) if l_val > 0.5 else d / max(1e-5, max_c + min_c)
    if max_c == r:
        h_val = (g - b) / d + (6.0 if g < b else 0.0)
    elif max_c == g:
        h_val = (b - r) / d + 2.0
    else:
        h_val = (r - g) / d + 4.0
    return h_val / 6.0, s_val, l_val


def _hue_to_rgb(p: float, q: float, t: float) -> float:
    if t < 0.0:
        t += 1.0
    if t > 1.0:
        t -= 1.0
    if t < 1.0 / 6.0:
        return p + (q - p) * 6.0 * t
    if t < 0.5:
        return q
    if t < 2.0 / 3.0:
        return p + (q - p) * (2.0 / 3.0 - t) * 6.0
    return p


def _hsl_to_rgb(h: float, s: float, l_val: float) -> tuple[float, float, float]:
    if s <= 1e-5:
        return l_val, l_val, l_val
    q = l_val * (1.0 + s) if l_val < 0.5 else l_val + s - l_val * s
    p = 2.0 * l_val - q
    return (
        _hue_to_rgb(p, q, h + 1.0 / 3.0),
        _hue_to_rgb(p, q, h),
        _hue_to_rgb(p, q, h - 1.0 / 3.0),
    )


def write_hsl_qualifier_cube(
    qualifier: Mapping[str, Any],
    destination: str,
    *,
    size: int = 17,
) -> str:
    """Write a .cube 3D LUT matching studioWebGLCompositor.js computeQualifierMask math."""
    dim = max(5, min(33, int(size or 17)))
    hue_center = _clamp(qualifier.get("hueCenter", 0.075), 0.0, 1.0, 0.075)
    hue_width = _clamp(qualifier.get("hueWidth", 0.08), 0.01, 0.5, 0.08)
    sat_min = _clamp(qualifier.get("satMin", 0.16), 0.0, 1.0, 0.16)
    sat_max = _clamp(qualifier.get("satMax", 0.85), 0.0, 1.0, 0.85)
    lum_min = _clamp(qualifier.get("lumMin", 0.12), 0.0, 1.0, 0.12)
    lum_max = _clamp(qualifier.get("lumMax", 0.90), 0.0, 1.0, 0.90)
    soft = max(0.01, _clamp(qualifier.get("softness", 0.24), 0.01, 1.0, 0.24))
    invert = bool(qualifier.get("invert", False))
    show_matte = bool(qualifier.get("showMatte", False))
    hue_shift = _clamp(qualifier.get("hueShift", 0.0), -0.5, 0.5, 0.0)
    sat_scale = _clamp(qualifier.get("saturation", 1.0), 0.0, 2.5, 1.0)
    gain_scale = _clamp(qualifier.get("gain", 1.0), 0.2, 2.5, 1.0)
    exposure_stops = _clamp(qualifier.get("exposureStops", 0.0), -2.5, 2.5, 0.0)
    temperature = _clamp(qualifier.get("temperature", 0.0), -1.0, 1.0, 0.0)
    desat_outside = _clamp(qualifier.get("desaturateOutside", 0.0), 0.0, 1.0, 0.0)
    colorize_strength = _clamp(qualifier.get("colorizeStrength", 0.0), 0.0, 1.0, 0.0)
    colorize_hsl = None
    raw_colorize = qualifier.get("colorizeColor")
    if isinstance(raw_colorize, str) and len(raw_colorize) == 7 and raw_colorize.startswith("#"):
        try:
            cr = int(raw_colorize[1:3], 16) / 255.0
            cg = int(raw_colorize[3:5], 16) / 255.0
            cb = int(raw_colorize[5:7], 16) / 255.0
            colorize_hsl = _rgb_to_hsl(cr, cg, cb)
        except ValueError:
            colorize_hsl = None

    lines = [
        f"LUT_3D_SIZE {dim}",
        "DOMAIN_MIN 0 0 0",
        "DOMAIN_MAX 1 1 1",
    ]
    denom = float(dim - 1)
    exp_scale = (2.0 ** exposure_stops) * gain_scale
    for b_idx in range(dim):
        b = b_idx / denom
        for g_idx in range(dim):
            g = g_idx / denom
            for r_idx in range(dim):
                r = r_idx / denom
                h, s, l_val = _rgb_to_hsl(r, g, b)
                hue_dist = abs(h - hue_center)
                hue_dist = min(hue_dist, 1.0 - hue_dist)
                h_mask = 1.0 - _smoothstep(hue_width, hue_width + soft * 0.5, hue_dist)
                s_mask = _smoothstep(sat_min - soft * 0.25, sat_min + soft * 0.25, s) * (
                    1.0 - _smoothstep(sat_max - soft * 0.25, sat_max + soft * 0.25, s)
                )
                l_mask = _smoothstep(lum_min - soft * 0.25, lum_min + soft * 0.25, l_val) * (
                    1.0 - _smoothstep(lum_max - soft * 0.25, lum_max + soft * 0.25, l_val)
                )
                mask = _clamp(h_mask * s_mask * l_mask, 0.0, 1.0, 0.0)
                if invert:
                    mask = 1.0 - mask
                if show_matte:
                    out_r = out_g = out_b = mask
                else:
                    tr, tg, tb = r, g, b
                    if exposure_stops != 0.0 or gain_scale != 1.0 or temperature != 0.0:
                        tr = _clamp(tr * exp_scale * (1.0 + temperature * 0.14), 0.0, 1.0, tr)
                        tg = _clamp(tg * exp_scale, 0.0, 1.0, tg)
                        tb = _clamp(tb * exp_scale * (1.0 - temperature * 0.14), 0.0, 1.0, tb)
                    if hue_shift != 0.0 or sat_scale != 1.0 or (colorize_hsl is not None and colorize_strength > 0.0):
                        th, ts, tl = _rgb_to_hsl(tr, tg, tb)
                        th = (th + hue_shift) % 1.0
                        ts = _clamp(ts * sat_scale, 0.0, 1.0, ts)
                        if colorize_hsl is not None and colorize_strength > 0.0:
                            dh = colorize_hsl[0] - th
                            if dh > 0.5:
                                dh -= 1.0
                            elif dh < -0.5:
                                dh += 1.0
                            th = (th + dh * colorize_strength) % 1.0
                            ts = _clamp(
                                ts * (1.0 - colorize_strength) + max(ts, colorize_hsl[1]) * colorize_strength,
                                0.0,
                                1.0,
                                ts,
                            )
                        tr, tg, tb = _hsl_to_rgb(th, ts, tl)
                    or_val, og_val, ob_val = r, g, b
                    if desat_outside > 0.0:
                        out_luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
                        or_val = r * (1.0 - desat_outside) + out_luma * desat_outside
                        og_val = g * (1.0 - desat_outside) + out_luma * desat_outside
                        ob_val = b * (1.0 - desat_outside) + out_luma * desat_outside
                    out_r = _clamp(or_val * (1.0 - mask) + tr * mask, 0.0, 1.0, r)
                    out_g = _clamp(og_val * (1.0 - mask) + tg * mask, 0.0, 1.0, g)
                    out_b = _clamp(ob_val * (1.0 - mask) + tb * mask, 0.0, 1.0, b)
                lines.append(f"{out_r:.7f} {out_g:.7f} {out_b:.7f}")

    with open(destination, "w", encoding="ascii") as handle:
        handle.write("\n".join(lines) + "\n")
    return str(destination)


def build_power_window_filter(window: Mapping[str, Any], prefix: str = "pw_") -> str:
    """Build elliptical, rectangular, or linear secondary power window FFmpeg filter."""
    if not window or not window.get("enabled"):
        return ""
    shape = str(window.get("shape") or "ellipse").strip().lower()
    cx = _clamp(window.get("x", 0.5), 0.0, 1.0, 0.5)
    cy = _clamp(window.get("y", 0.5), 0.0, 1.0, 0.5)
    rx = max(0.02, _clamp(window.get("rx", 0.28), 0.02, 1.5, 0.28))
    ry = max(0.02, _clamp(window.get("ry", 0.34), 0.02, 1.5, 0.34))
    rot = _clamp(window.get("rotation", 0.0), -6.2832, 6.2832, 0.0)
    feather = max(0.01, _clamp(window.get("feather", 0.32), 0.01, 1.0, 0.32))
    invert = bool(window.get("invert", False))
    exposure = _clamp(window.get("exposureStops", 0.0), -2.0, 2.0, 0.0)
    gain = _clamp(window.get("gain", 1.0), 0.2, 2.5, 1.0)
    saturation = _clamp(window.get("saturation", 1.0), 0.0, 2.5, 1.0)
    temperature = _clamp(window.get("temperature", 0.0), -1.0, 1.0, 0.0)

    scale = (2.0 ** exposure) * gain
    r_scale = round(scale * (1.0 + temperature * 0.18), 6)
    g_scale = round(scale * (1.0 + temperature * 0.02), 6)
    b_scale = round(scale * max(0.1, 1.0 - temperature * 0.18), 6)

    cos_r = math.cos(rot)
    sin_r = math.sin(rot)
    dx = f"(X/W-{cx:.5f})"
    dy = f"(Y/H-{cy:.5f})"
    if abs(rot) < 1e-4:
        ux, vy = dx, dy
    else:
        ux = f"(({dx})*{cos_r:.6f}-({dy})*{sin_r:.6f})"
        vy = f"(({dx})*{sin_r:.6f}+({dy})*{cos_r:.6f})"

    if shape in {"rectangle", "rect", "box"}:
        dist_expr = f"max(abs({ux})/{rx:.5f},abs({vy})/{ry:.5f})"
    elif shape in {"linear", "gradient"}:
        # Directional linear sweep from 0 (inside side) -> >1 (outside side)
        dist_expr = f"(1.0+({ux})/{rx:.5f})"
    else:
        dist_expr = f"hypot({ux}/{rx:.5f},{vy}/{ry:.5f})"

    lo = 1.0 - feather
    denom = 2.0 * feather
    inside_expr = f"(1-clip(({dist_expr}-{lo:.5f})/{denom:.5f},0,1))"
    mask_expr = f"1-{inside_expr}" if invert else inside_expr

    return (
        f"split=3[{prefix}base][{prefix}fx][{prefix}mask_src];"
        f"[{prefix}fx]format=rgb24,lutrgb=r='clip(val*{r_scale:.6f},0,255)':"
        f"g='clip(val*{g_scale:.6f},0,255)':b='clip(val*{b_scale:.6f},0,255)',"
        f"hue=s={saturation:.5f}[{prefix}graded];"
        f"[{prefix}mask_src]trim=end_frame=1,format=gray,"
        f"geq=lum='255*({mask_expr})':cb=128:cr=128,"
        f"loop=-1:size=1:start=0[{prefix}mask];"
        f"[{prefix}graded]format=yuva420p[{prefix}yuva];"
        f"[{prefix}yuva][{prefix}mask]alphamerge[{prefix}alpha];"
        f"[{prefix}base][{prefix}alpha]overlay=shortest=1:format=auto"
    )


def build_optical_camera_finish_filter(texture: Mapping[str, Any], label_prefix: str = "") -> str:
    """Build FFmpeg camera optical lens distortion, rack-focus bokeh, and atmospheric depth haze."""
    if not isinstance(texture, Mapping):
        return ""
    k1 = _clamp(texture.get("lens_distortion", 0.0), -0.5, 0.5, 0.0)
    rack = _clamp(texture.get("rack_focus", 0.0), 0.0, 1.0, 0.0)
    focus_dist = _clamp(texture.get("focus_distance", 0.5), 0.0, 1.0, 0.5)
    haze = _clamp(texture.get("atmospheric_haze", 0.0), 0.0, 1.0, 0.0)
    haze_hex = str(texture.get("haze_color") or "#cbd5e1").strip().lstrip("#")
    try:
        hr, hg, hb = (int(haze_hex[0:2], 16), int(haze_hex[2:4], 16), int(haze_hex[4:6], 16)) if len(haze_hex) == 6 else (203, 213, 225)
    except ValueError:
        hr, hg, hb = (203, 213, 225)

    parts = []
    if abs(k1) > 0.005:
        k2 = k1 * 0.25
        parts.append(f"format=gbrp,lenscorrection=k1={k1:.4f}:k2={k2:.4f}")
    if rack > 0.01:
        sigma = round(1.8 + rack * 10.5, 2)
        parts.append(
            f"format=gbrp,split=3[{label_prefix}rf_base][{label_prefix}rf_src][{label_prefix}rf_ref];"
            f"[{label_prefix}rf_src]gblur=sigma={sigma}:steps=2[{label_prefix}rf_blur];"
            f"[{label_prefix}rf_ref]scale=64:64,geq="
            f"r='255*min(1,{rack:.4f}*pow(min(1,abs(Y/63.0-{focus_dist:.4f})*2.2),2))':"
            f"g='255*min(1,{rack:.4f}*pow(min(1,abs(Y/63.0-{focus_dist:.4f})*2.2),2))':"
            f"b='255*min(1,{rack:.4f}*pow(min(1,abs(Y/63.0-{focus_dist:.4f})*2.2),2))'[{label_prefix}rf_small];"
            f"[{label_prefix}rf_small][{label_prefix}rf_base]scale2ref[{label_prefix}rf_mask][{label_prefix}rf_base2];"
            f"[{label_prefix}rf_base2][{label_prefix}rf_blur][{label_prefix}rf_mask]maskedmerge"
        )
    if haze > 0.005:
        mist_a = haze * 0.65
        parts.append(
            f"format=gbrp,split=2[{label_prefix}hz_base][{label_prefix}hz_ref];"
            f"[{label_prefix}hz_ref]scale=64:64,geq="
            f"r='{hr}*{mist_a:.4f}*pow(max(0,1-(Y/63.0)*0.85),1.35)':"
            f"g='{hg}*{mist_a:.4f}*pow(max(0,1-(Y/63.0)*0.85),1.35)':"
            f"b='{hb}*{mist_a:.4f}*pow(max(0,1-(Y/63.0)*0.85),1.35)'[{label_prefix}hz_small];"
            f"[{label_prefix}hz_small][{label_prefix}hz_base]scale2ref[{label_prefix}hz_mist][{label_prefix}hz_base2];"
            f"[{label_prefix}hz_base2][{label_prefix}hz_mist]blend=all_mode=screen"
        )
    return ",".join(parts)


def build_audio_master_loudnorm_filter(
    standard: str = "social",
    *,
    custom_lufs: Optional[float] = None,
    true_peak_dbtp: Optional[float] = None,
) -> str:
    """Build ITU-R BS.1770 loudnorm filter aligned with frontend AUDIO_MASTER_PRESETS."""
    spec = LOUDNESS_STANDARDS.get(str(standard or "social").lower(), LOUDNESS_STANDARDS["social"])
    target_i = _clamp(
        custom_lufs if custom_lufs is not None else spec["target_lufs"], -36.0, -6.0, -14.0
    )
    tp = _clamp(
        true_peak_dbtp if true_peak_dbtp is not None else spec["true_peak_dbtp"], -6.0, -0.1, -1.0
    )
    return f"loudnorm=I={target_i:.1f}:TP={tp:.1f}:LRA=7"
