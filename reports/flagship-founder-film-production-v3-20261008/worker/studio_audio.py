"""Validated dialogue restoration settings and FFmpeg filter construction."""
import math


PRESETS = {"natural", "podcast", "noisy_room", "broadcast"}
AUDIO_TRACKS = ("originalAudio", "voiceover", "music", "broll", "sfx")


def _number(value, low, high, default):
    try:
        value = float(value)
        if math.isfinite(value):
            return max(low, min(high, value))
    except (TypeError, ValueError):
        pass
    return default


def normalize_audio_restoration(raw):
    raw = raw if isinstance(raw, dict) else {}
    eq = raw.get("eq") if isinstance(raw.get("eq"), dict) else {}
    preset = str(raw.get("preset") or "natural").lower()
    return {
        "enabled": raw.get("enabled", True) is not False,
        "preset": preset if preset in PRESETS else "natural",
        "voice_isolation": bool(raw.get("voiceIsolation", raw.get("voice_isolation", False))),
        "denoise": _number(raw.get("denoise"), 0, 100, 0),
        "de_esser": _number(raw.get("deEsser", raw.get("de_esser")), 0, 100, 0),
        "hum_frequency": _number(raw.get("humFrequency", raw.get("hum_frequency")), 50, 60, 50),
        "compressor": _number(raw.get("compressor"), 0, 100, 0),
        "limiter": _number(raw.get("limiter"), -6, -.1, -1),
        "loudness": _number(raw.get("loudness"), -24, -9, -14),
        "eq": {band: _number(eq.get(band), -12, 12, 0) for band in ("low", "mid", "high")},
    }


def build_dialogue_filter(raw):
    settings = normalize_audio_restoration(raw)
    if not settings["enabled"]:
        return "", settings
    filters = ["highpass=f=55", "lowpass=f=18000"]
    if settings["denoise"] > 0 or settings["voice_isolation"]:
        strength = max(settings["denoise"], 58 if settings["voice_isolation"] else 0)
        filters.append(f"afftdn=nr={3 + strength * .24:.2f}:nf={-62 + strength * .22:.2f}:tn=1:gs={round(2 + strength * .08)}")
    if settings["hum_frequency"]:
        hum = settings["hum_frequency"]
        filters.extend([f"bandreject=f={hum:.0f}:width_type=h:width=3", f"bandreject=f={hum*2:.0f}:width_type=h:width=4"])
    if settings["de_esser"] > 0:
        filters.append(f"deesser=i={settings['de_esser']/100:.3f}:m={min(.9, .35+settings['de_esser']/180):.3f}:f=.62")
    for band, frequency, width in (("low", 120, 1.1), ("mid", 1100, 1.3), ("high", 7200, 1.0)):
        gain = settings["eq"][band]
        if abs(gain) >= .05:
            filters.append(f"equalizer=f={frequency}:width_type=o:width={width}:g={gain:.2f}")
    if settings["compressor"] > 0:
        amount = settings["compressor"] / 100
        filters.append(f"acompressor=threshold={.22-.14*amount:.4f}:ratio={1+7*amount:.2f}:attack=12:release=180:makeup={1+1.2*amount:.2f}:knee=3:link=maximum")
    filters.append(f"loudnorm=I={settings['loudness']:.1f}:LRA=9:TP={settings['limiter']:.1f}")
    filters.append(f"alimiter=limit={10 ** (settings['limiter']/20):.6f}:level=false:latency=true")
    return ",".join(filters), settings


def audio_track_audible(states, track):
    states = states if isinstance(states, dict) else {}
    current = states.get(track) if isinstance(states.get(track), dict) else {}
    if current.get("muted"):
        return False
    soloed = [name for name in AUDIO_TRACKS
              if isinstance(states.get(name), dict) and states[name].get("solo")]
    return not soloed or track in soloed


def _ease(progress, easing):
    if easing == "hold": return 0
    if easing == "ease_in": return progress ** 3
    if easing == "ease_out": return 1 - (1-progress) ** 3
    if easing in {"ease_in_out", "bezier"}:
        return 4*progress**3 if progress < .5 else 1-(-2*progress+2)**3/2
    return progress


def normalize_volume_keyframes(items, duration):
    points = {}
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or item.get("property", "volume") != "volume":
            continue
        time = _number(item.get("time"), 0, max(.05, duration), 0)
        points[time] = {"time": time, "value": _number(item.get("value"), 0, 200, 100)/100,
                        "easing": str(item.get("easing") or "linear")}
    ordered = [points[key] for key in sorted(points)]
    if len(ordered) < 2:
        return ordered
    sampled = [ordered[0]]
    for left, right in zip(ordered, ordered[1:]):
        for step in range(1, 9):
            progress = step/8
            eased = _ease(progress, right["easing"])
            sampled.append({"time": left["time"]+(right["time"]-left["time"])*progress,
                            "value": left["value"]+(right["value"]-left["value"])*eased,
                            "easing": "linear"})
    return sampled


def build_volume_filter(items, duration):
    points = normalize_volume_keyframes(items, duration)
    if not points:
        return "", []
    if len(points) == 1:
        return f"volume={points[0]['value']:.6f}", points
    expression = f"{points[-1]['value']:.6f}"
    for left, right in reversed(list(zip(points, points[1:]))):
        slope = (right["value"]-left["value"])/max(.000001, right["time"]-left["time"])
        segment = f"{left['value']:.6f}+({slope:.8f})*(t-{left['time']:.6f})"
        expression = f"if(lt(t,{right['time']:.6f}),{segment},{expression})"
    expression = f"if(lt(t,{points[0]['time']:.6f}),{points[0]['value']:.6f},{expression})"
    return f"volume='{expression}':eval=frame", points
