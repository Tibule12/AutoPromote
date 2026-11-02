"""Source/programme audio windows shared by ordinary sequence export edits."""
import math


def sequence_audio_window(segment, programme_start, programme_duration, source_duration):
    def read(name, default=None):
        return segment.get(name, default) if isinstance(segment, dict) else getattr(segment, name, default)

    def number(value):
        result = float(value)
        if not math.isfinite(result):
            raise ValueError("Sequence audio timing must be finite")
        return result

    video_start, video_end = number(read("start_time")), number(read("end_time"))
    programme_start, programme_duration, source_duration = map(number, (programme_start, programme_duration, source_duration))
    if video_start < 0 or video_end <= video_start or source_duration <= 0:
        raise ValueError("Sequence audio needs valid source bounds")
    if read("audioDetached", False):
        start, end, placement = map(number, (read("audioSourceStart"), read("audioSourceEnd"), read("audioProgrammeStart")))
        if start < 0 or end <= start:
            raise ValueError("Detached audio needs a valid source range")
    else:
        lead = max(-min(3., programme_start, video_start), number(read("audioTrimOffsetStart", 0) or 0))
        lead = min(lead, video_end - video_start - .001)
        trail = min(3., number(read("audioTrimOffsetEnd", 0) or 0))
        start, end = video_start + lead, video_end + trail
        placement = programme_start + lead
    if placement < 0:
        start -= placement
        placement = 0.
    end = min(source_duration, end, start + max(0., programme_duration - placement))
    start = min(source_duration, max(0., start))
    return {"source_start": start, "source_end": max(start, end),
            "programme_start": placement, "duration": max(0., end - start)}
