"""B-roll source windows, held-frame audio and strongest-active ducking."""
import math
try:
    from .viral_render_contract import normalize_speed_plan, build_speed_filter_complex, speed_plan_output_duration
except ImportError:
    from viral_render_contract import normalize_speed_plan, build_speed_filter_complex, speed_plan_output_duration


def overlay_commands(source, prefix, source_duration, source_start, duration, behavior, cue_start, speed_plan, has_audio, source_offset=0):
    source_start = max(0, min(float(source_start), max(0, source_duration - .05)))
    available = max(.05, source_duration - source_start)
    behavior = behavior if behavior in {"return", "loop", "hold"} else "return"
    source_offset = max(0, float(source_offset or 0))
    remaining = max(0, available - source_offset)
    duration = min(duration, remaining) if behavior == "return" else duration
    if duration <= 0:
        return [], source, 0, 0
    phase = source_offset % available if behavior == "loop" else min(source_offset, available)
    # Hold beyond EOF is a picture only: never repeat the final audio packet.
    if behavior == "hold" and not remaining:
        has_audio = False
    trim_start = source_start if behavior == "loop" else min(source_duration - .05, source_start + phase)
    trim_duration = available if behavior == "loop" else min(duration, max(.05, remaining))
    trimmed, extended, output = [f"{prefix}_{part}.mp4" for part in ["trim", "extend", "speed"]]
    encoding = ["-c:v", "libx264", "-preset", "veryfast", "-threads", "2", "-pix_fmt", "yuv420p"]
    if has_audio:
        encoding += ["-c:a", "aac", "-b:a", "160k"]
    commands = [["ffmpeg", "-v", "error", "-ss", str(max(0, trim_start)), "-i", source,
                 "-map", "0:v:0", *(["-map", "0:a:0", "-af", "asetpts=PTS-STARTPTS"] if has_audio else ["-an"]),
                 "-t", str(trim_duration), "-vf", "setpts=PTS-STARTPTS", *encoding, "-y", trimmed]]
    if behavior == "loop":
        commands.append(["ffmpeg", "-v", "error", "-stream_loop", "-1", "-i", trimmed,
                         "-ss", str(phase), "-t", str(duration), *encoding, "-y", extended])
    elif behavior == "hold" and duration > trim_duration:
        commands.append(["ffmpeg", "-v", "error", "-i", trimmed,
                         "-vf", f"tpad=stop_mode=clone:stop_duration={duration}",
                         *(["-af", f"apad=whole_dur={duration}"] if has_audio else []),
                         "-t", str(duration), *encoding, "-y", extended])
    else:
        extended = trimmed
    ranges = [{"start_time": max(cue_start, p["start_time"])-cue_start,
               "end_time": min(cue_start+duration, p["end_time"])-cue_start, "rate": p["rate"]}
              for p in speed_plan if p["end_time"] > cue_start and p["start_time"] < cue_start+duration]
    plan = normalize_speed_plan(duration, ranges, 1)
    graph = build_speed_filter_complex(plan, has_audio)
    if graph:
        commands.append(["ffmpeg", "-v", "error", "-i", extended, "-filter_complex", graph,
                         "-map", "[v_speed]", *(["-map", "[a_speed]"] if has_audio else []),
                         *encoding, "-y", output])
    else:
        output = extended
    return commands, output, duration, speed_plan_output_duration(plan)


def audible_duration(source_duration, source_start, duration, behavior, source_offset=0):
    start = max(0, min(float(source_start), max(0, source_duration - .05)))
    remaining = max(0, source_duration - start - max(0, float(source_offset or 0)))
    return duration if behavior == "loop" else min(duration, remaining)


def ducking_windows(overlays):
    """Overlaps use the strongest active reduction, as in the native preview."""
    intervals = []
    for overlay in overlays:
        start, duration = float(overlay.start_time or 0), float(overlay.duration or 0)
        if not all(math.isfinite(v) for v in [start, duration]) or duration <= 0:
            continue
        if getattr(overlay, "muteMainAudio", False):
            gain = 0
        elif getattr(overlay, "audioDucking", False) and getattr(overlay, "useOverlayAudio", False):
            gain = 1 - max(0, min(.95, float(overlay.audioDuckingStrength)))
        else:
            continue
        intervals.append((start, start + duration, gain))
    boundaries = sorted({t for start, end, _ in intervals for t in [start, end]})
    output = []
    for start, end in zip(boundaries, boundaries[1:]):
        gain = min((g for left, right, g in intervals if left < end and right > start), default=1)
        if gain >= 1:
            continue
        if output and output[-1][1] == start and output[-1][2] == gain:
            output[-1] = (output[-1][0], end, gain)
        else:
            output.append((start, end, gain))
    return output


def split_layout_filters(input_label, output_label, width, height, overlay, start, end):
    """Cover-crop the main picture into the half opposite a split cutaway."""
    half = max(2, int(width / 4) * 2)
    main_x = 0 if float(overlay.x) >= 50 else width - half
    return [
        f"[{input_label}]split=2[{output_label}_original][{output_label}_source]",
        f"[{output_label}_source]crop={half}:{height}:(iw-{half})/2:0,"
        f"pad={width}:{height}:{main_x}:0:color=black[{output_label}_half]",
        f"[{output_label}_original][{output_label}_half]overlay=0:0:"
        f"enable='gte(t,{start:.6f})*lt(t,{end:.6f})'[{output_label}]",
    ]
