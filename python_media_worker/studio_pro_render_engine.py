"""Pro Studio backend render helpers: NVENC/HW probing, optical flow, reverse/freeze, film FX, LUFS."""

from __future__ import annotations

import shutil
import subprocess
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
            f"split[h_base][h_glow];"
            f"[h_glow]gblur=sigma={sigma}:steps=2[h_blur];"
            f"[h_base][h_blur]blend=all_mode=screen:all_opacity={round(halation / 220.0, 3)}"
        )

    grain = _to_percent_scale(fx.get("filmGrain", 0))
    if grain > 1.0:
        strength = max(2, min(28, round((grain / 100.0) * 24)))
        stages.append(f"noise=alls={strength}:allf=t+u")

    return ",".join(stages)


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
