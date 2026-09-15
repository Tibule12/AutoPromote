"""Build bounded B-roll media from the same source/retained clocks as preview."""
try:
    from .viral_render_contract import normalize_speed_plan, build_speed_filter_complex, speed_plan_output_duration
except ImportError:
    from viral_render_contract import normalize_speed_plan, build_speed_filter_complex, speed_plan_output_duration


def overlay_commands(source, prefix, source_duration, source_start, duration, behavior, cue_start, speed_plan, has_audio):
    source_start = max(0, min(float(source_start), max(0, source_duration - .05)))
    available = max(.05, source_duration - source_start)
    behavior = behavior if behavior in {"return", "loop", "hold"} else "return"
    duration = min(duration, available) if behavior == "return" else duration
    trimmed, extended, output = [f"{prefix}_{part}.mp4" for part in ["trim", "extend", "speed"]]
    encoding = ["-c:v", "libx264", "-preset", "veryfast", "-threads", "2", "-pix_fmt", "yuv420p"]
    if has_audio:
        encoding += ["-c:a", "aac", "-b:a", "160k"]
    commands = [["ffmpeg", "-v", "error", "-ss", str(source_start), "-i", source,
                 "-t", str(min(available, duration)), "-vf", "setpts=PTS-STARTPTS", *encoding, "-y", trimmed]]
    if behavior == "loop":
        commands.append(["ffmpeg", "-v", "error", "-stream_loop", "-1", "-i", trimmed,
                         "-t", str(duration), *encoding, "-y", extended])
    elif behavior == "hold" and duration > available:
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
