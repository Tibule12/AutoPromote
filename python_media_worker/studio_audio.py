"""Validated dialogue restoration settings and FFmpeg filter construction."""
import math


PRESETS = {"natural", "podcast", "noisy_room", "broadcast"}
AUDIO_TRACKS = ("originalAudio", "voiceover", "music", "broll", "sfx")


def build_audio_bus_mix(labels, output_label="a_mix_unpadded"):
    if not labels:
        raise ValueError("Audio mix requires at least one bus")
    if len(labels) == 1:
        return f"{labels[0]}aresample=48000[{output_label}]"
    # amix negotiates the first input's rate. Normalize every bus before it
    # mixes; otherwise a 44.1kHz song down/up-samples native 48kHz whooshes.
    normalized = [f"[studio_mix_clock_{i}]" for i in range(len(labels))]
    inputs = ";".join(f"{label}aresample=48000{normalized[i]}" for i, label in enumerate(labels))
    return (f"{inputs};{''.join(normalized)}amix=inputs={len(labels)}:"
            f"duration=first:dropout_transition=2:normalize=0[{output_label}]")


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


def build_dialogue_filter(raw, include_loudnorm=True):
    settings = normalize_audio_restoration(raw)
    if not settings["enabled"]:
        return "", settings
    filters = ["aresample=48000", "highpass=f=55", "lowpass=f=18000"]
    if settings["denoise"] > 0 or settings["voice_isolation"]:
        strength = max(settings["denoise"], 58 if settings["voice_isolation"] else 0)
        # afftdn's overlap window delays content by two sample advances
        # (25 ms at the Studio delivery clock). Flush its actual tail, then
        # remove its delayed prefix; resetting PTS alone cannot align speech.
        filters.extend(["apad=pad_len=1200",
            f"afftdn=nr={3 + strength * .24:.2f}:nf={-62 + strength * .22:.2f}:tn=1:gs={round(2 + strength * .08)}",
            "atrim=start_sample=1200", "asetpts=PTS-STARTPTS"])
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
    if include_loudnorm:
        filters.append(f"loudnorm=I={settings['loudness']:.1f}:LRA=9:TP={settings['limiter']:.1f}")
        filters.append(f"alimiter=limit={10 ** (settings['limiter']/20):.6f}:level=false:latency=true")
    return ",".join(filters), settings


def build_master_bus_loudnorm(raw):
    settings = normalize_audio_restoration(raw)
    if not settings["enabled"]:
        return "", settings
    chain = ",".join([
        "aresample=48000",
        f"loudnorm=I={settings['loudness']:.1f}:LRA=9:TP={settings['limiter']:.1f}",
        f"alimiter=limit={10 ** (settings['limiter']/20):.6f}:level=false:latency=true",
    ])
    return chain, settings


def track_pan(states, track):
    states = states if isinstance(states, dict) else {}
    current = states.get(track) if isinstance(states.get(track), dict) else {}
    return _number(current.get("pan"), -100, 100, 0.0)


def build_pan_filter(pan):
    amount = _number(pan, -100, 100, 0.0)
    if abs(amount) < 0.5:
        return ""
    norm = amount / 100.0
    p = (norm + 1.0) * 0.5
    lg = math.sqrt(2.0) * math.cos(p * math.pi * 0.5)
    rg = math.sqrt(2.0) * math.sin(p * math.pi * 0.5)
    cross = abs(norm)
    w_same = (1.0 - cross) + cross * 0.5
    w_other = cross * 0.5
    c0_l = lg * w_same
    c0_r = lg * w_other
    c1_l = rg * w_other
    c1_r = rg * w_same
    return f"pan=stereo|c0={c0_l:.6f}*c0+{c0_r:.6f}*c1|c1={c1_l:.6f}*c0+{c1_r:.6f}*c1"


def build_smooth_ducking_filter(windows, fade_seconds=0.06):
    """Build click-free sample-accurate ducking envelope using linear ramp edges."""
    clean = []
    for item in windows or []:
        if not item or len(item) < 3:
            continue
        start, end, gain = float(item[0]), float(item[1]), max(0.05, min(1.0, float(item[2])))
        if end > start + 1e-4 and gain < 0.999:
            clean.append((max(0.0, start), end, gain))
    if not clean:
        return ""
    fade = max(0.01, min(0.25, float(fade_seconds or 0.06)))
    expr_terms = []
    for start, end, gain in sorted(clean):
        ramp = min(fade, max(0.005, (end - start) * 0.25))
        t0 = max(0.0, start - ramp * 0.5)
        t1 = start + ramp * 0.5
        t2 = max(t1 + 1e-4, end - ramp * 0.5)
        t3 = end + ramp * 0.5
        drop = 1.0 - gain
        if t1 > t0:
            atk = f"(1-{drop:.6f}*clip(((n/s)-{t0:.6f})/{(t1-t0):.6f},0,1))"
        else:
            atk = f"{gain:.6f}"
        rel = f"({gain:.6f}+{drop:.6f}*clip(((n/s)-{t2:.6f})/{max(1e-4, t3-t2):.6f},0,1))"
        env = f"if(lt(n/s,{t0:.6f}),1,if(lt(n/s,{t1:.6f}),{atk},if(lt(n/s,{t2:.6f}),{gain:.6f},if(lt(n/s,{t3:.6f}),{rel},1))))"
        expr_terms.append(env)
    combined = expr_terms[0]
    for term in expr_terms[1:]:
        combined = f"min({combined},{term})"
    return f"aeval=exprs='val(ch)*({combined})':c=same"


def audio_track_audible(states, track):
    states = states if isinstance(states, dict) else {}
    current = states.get(track) if isinstance(states.get(track), dict) else {}
    if current.get("muted"):
        return False
    soloed = [name for name in AUDIO_TRACKS
              if isinstance(states.get(name), dict) and states[name].get("solo")]
    return not soloed or track in soloed


def _ease(progress, easing, curve=None):
    try:
        from .studio_motion import easing_value
    except ImportError:
        from studio_motion import easing_value
    return easing_value(progress, easing, curve)


def normalize_volume_keyframes(items, duration):
    points = {}
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or item.get("property", "volume") != "volume":
            continue
        time = _number(item.get("time"), 0, max(.05, duration), 0)
        points[time] = {"time": time, "value": _number(item.get("value"), 0, 200, 100)/100,
                        "easing": str(item.get("easing") or "linear"),
                        "curve": item.get("curve")}
    ordered = [points[key] for key in sorted(points)]
    if len(ordered) < 2:
        return ordered
    sampled = [ordered[0]]
    for left, right in zip(ordered, ordered[1:]):
        # Hold is a discontinuity at the actual key, not a short ramp and not
        # a permanently held final value. Keep that incoming segment explicit.
        if right["easing"] == "hold":
            sampled.append(right)
            continue
        steps = 64 if right["easing"] == "bezier" else 8
        for step in range(1, steps + 1):
            progress = step/steps
            eased = 1 if step == steps else _ease(progress, right["easing"], right["curve"])
            sampled.append({"time": left["time"]+(right["time"]-left["time"])*progress,
                            "value": left["value"]+(right["value"]-left["value"])*eased,
                            "easing": "linear"})
    return sampled


def build_volume_filter(items, duration, speed_plan=None):
    # Studio keys use the pre-speed programme clock; FFmpeg evaluates volume
    # against the already-retimed output. Preserve the curve at every rate
    # boundary as well as each authored/sampled point before changing clocks.
    programme_duration = max((p["end_time"] for p in speed_plan), default=duration) if speed_plan else duration
    points = normalize_volume_keyframes(items, programme_duration)
    if points and speed_plan:
        try:
            from .viral_render_contract import map_timeline_time
        except ImportError:
            from viral_render_contract import map_timeline_time
        def value_at(time):
            if time <= points[0]["time"]:
                return points[0]["value"]
            for left, right in zip(points, points[1:]):
                if time <= right["time"]:
                    if time == right["time"]:
                        return right["value"]
                    if right["easing"] == "hold":
                        return left["value"]
                    amount = (time-left["time"])/max(.000001, right["time"]-left["time"])
                    return left["value"]+(right["value"]-left["value"])*amount
            return points[-1]["value"]
        times = {point["time"] for point in points}
        times.update(time for segment in speed_plan for time in (segment["start_time"], segment["end_time"])
                     if points[0]["time"] < time < points[-1]["time"])
        def easing_at(time):
            return next((point["easing"] for point in points if point["time"] >= time), "linear")
        points = [{"time": map_timeline_time(speed_plan, time), "value": value_at(time), "easing": easing_at(time)}
                  for time in sorted(times)]
    if not points:
        return "", []
    if len(points) == 1:
        return f"volume={points[0]['value']:.6f}", points
    segments = []
    for left, right in zip(points, points[1:]):
        slope = (right["value"]-left["value"])/max(.000001, right["time"]-left["time"])
        segment = f"{left['value']:.6f}+({slope:.8f})*((n/s)-{left['time']:.17g})"
        if right["easing"] == "hold":
            segment = f"{left['value']:.6f}"
        segments.append(segment)
    segments.append(f"{points[-1]['value']:.6f}")
    # FFmpeg's evaluator has a bounded parser stack. Curves and speed-boundary
    # samples can exceed it with an otherwise valid, modest authored envelope.
    # Keep every existing segment/value and select it with logarithmic nesting.
    def select_segment(first, last):
        if first == last:
            return segments[first]
        middle = (first + last) // 2
        boundary = points[middle + 1]['time']
        return (f"if(lt(n/s,{boundary:.17g}),{select_segment(first, middle)},"
                f"{select_segment(middle + 1, last)})")
    expression = select_segment(0, len(segments) - 1)
    expression = f"if(lt(n/s,{points[0]['time']:.17g}),{points[0]['value']:.6f},{expression})"
    # A frame-evaluated volume still holds the gain for a whole decoder block,
    # even after splitting it into 64-sample chunks. Evaluate this same bounded
    # envelope at each sample; preserve channel layout, length and Hold edges.
    return f"aeval=exprs='val(ch)*({expression})':c=same", points
