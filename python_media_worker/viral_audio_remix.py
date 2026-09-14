"""Portable Viral Clip Studio audio remix renderer.

The video speed remains part of the existing Studio speed plan. This module
changes pitch independently, applies a musical three-band EQ and adds bounded
reverb without changing the finished video's duration.
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess


PRESETS = {
    "slowed_reverb",
    "sped_up",
    "deep_voice",
    "nightcore",
    "amapiano_space",
    "warm_vocal",
}


def _read(value, *names, default=None):
    for name in names:
        if isinstance(value, dict) and name in value:
            return value[name]
        if hasattr(value, name):
            return getattr(value, name)
    return default


def _number(value, default):
    try:
        number = float(value)
        return number if math.isfinite(number) else default
    except (TypeError, ValueError):
        return default


def _bound(value, low, high, default):
    return max(low, min(high, _number(value, default)))


def normalize_audio_remix(value=None):
    value = value or {}
    version = int(_number(_read(value, "version", default=1), 1))
    if version != 1:
        raise ValueError("Unsupported audio remix version")
    enabled = _read(value, "enabled", default=False) is True
    preset = str(_read(value, "preset", default="slowed_reverb") or "").strip().lower()
    if preset not in PRESETS:
        raise ValueError("Unknown audio remix preset")
    keep_pitch = _read(value, "keep_pitch", "keepPitch", default=False) is True
    return {
        "version": 1,
        "enabled": enabled,
        "preset": preset,
        "speed": _bound(_read(value, "speed", default=1), .5, 1.5, 1),
        "pitch_semitones": 0.0 if keep_pitch else _bound(
            _read(value, "pitch_semitones", "pitch", default=0), -12, 12, 0
        ),
        "bass_db": _bound(_read(value, "bass_db", "bass", default=0), -12, 12, 0),
        "clarity_db": _bound(_read(value, "clarity_db", "clarity", default=0), -12, 12, 0),
        "air_db": _bound(_read(value, "air_db", "air", default=0), -12, 12, 0),
        "reverb_mix": _bound(_read(value, "reverb_mix", "reverb", default=0), 0, 1, 0),
        "intensity": _bound(_read(value, "intensity", default=1), 0, 1, 1),
        "keep_pitch": keep_pitch,
    }


def build_audio_remix_filter(value, input_label="0:a", output_label="remix_a"):
    remix = normalize_audio_remix(value)
    if not remix["enabled"]:
        return "", remix
    amount = remix["intensity"]
    filters = []
    pitch = remix["pitch_semitones"] * amount
    if abs(pitch) >= .01:
        factor = 2 ** (pitch / 12)
        # Change pitch, then restore duration without another pitch change.
        filters.extend(
            [
                "aresample=48000",
                f"asetrate=48000*{factor:.9f}",
                "aresample=48000",
                f"atempo={1 / factor:.9f}",
            ]
        )
    bass = remix["bass_db"] * amount
    clarity = remix["clarity_db"] * amount
    air = remix["air_db"] * amount
    if abs(bass) >= .01:
        filters.append(f"bass=g={bass:.3f}:f=120:w=0.7")
    if abs(clarity) >= .01:
        filters.append(f"equalizer=f=3200:t=q:w=0.85:g={clarity:.3f}")
    if abs(air) >= .01:
        filters.append(f"treble=g={air:.3f}:f=8200:w=0.65")
    reverb = remix["reverb_mix"] * amount
    if reverb >= .01:
        delay_a = round(58 + reverb * 92)
        delay_b = round(137 + reverb * 173)
        decay_a = .12 + reverb * .34
        decay_b = .08 + reverb * .26
        filters.append(
            f"aecho=0.82:{max(.48, 0.78 - reverb * .18):.3f}:"
            f"{delay_a}|{delay_b}:{decay_a:.3f}|{decay_b:.3f}"
        )
    filters.extend(["highpass=f=28", "alimiter=limit=0.95:level=false:latency=true"])
    return f"[{input_label}]{','.join(filters)}[{output_label}]", remix


def _run(command):
    result = subprocess.run(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=1800
    )
    if result.returncode:
        raise RuntimeError(
            "Audio remix failed: " + result.stderr.decode(errors="replace")[-1800:]
        )
    return result.stdout


def _probe(path):
    return json.loads(
        _run(
            [
                "ffprobe", "-v", "error", "-show_streams", "-show_format",
                "-of", "json", str(path),
            ]
        )
    )


def render_audio_remix(source, destination, value):
    remix = normalize_audio_remix(value)
    if not remix["enabled"]:
        shutil.copyfile(source, destination)
        return {**remix, "status": "not_requested"}
    info = _probe(source)
    if not any(stream.get("codec_type") == "audio" for stream in info.get("streams", [])):
        raise ValueError("Audio Remix requires a source audio track")
    audio_filter, remix = build_audio_remix_filter(remix)
    _run(
        [
            "ffmpeg", "-v", "error", "-nostdin", "-i", str(source),
            "-filter_complex", audio_filter,
            "-map", "0:v:0", "-map", "[remix_a]", "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags",
            "+faststart", "-y", str(destination),
        ]
    )
    duration = float(_probe(destination).get("format", {}).get("duration") or 0)
    return {**remix, "status": "applied", "duration": duration}
