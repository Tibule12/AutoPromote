"""Keep timed framing segments on a compiled CFR programme's picture grid."""
import math


def reframe_picture_segments(segments, fps):
    if not math.isfinite(fps) or not 1 <= fps <= 120:
        raise ValueError('Timed framing needs a valid programme frame rate')
    result = []
    for segment in segments:
        # A cut between pictures takes effect at the next picture. Seek and
        # length must use that same boundary; rounding only the length duplicates
        # the preceding source picture and shifts every later layer.
        start = math.ceil(float(segment['start']) * fps - 1e-7)
        end = math.ceil(float(segment['end']) * fps - 1e-7)
        if end > start:
            result.append({**segment, 'start': start / fps, 'end': end / fps,
                           'frame_count': end - start})
    return result
