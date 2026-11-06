"""Choose source samples on the programme's shared constant-frame-rate grid."""
import math


def preserve_reviewed_sequence_samples(width, height, fps, duration, reviewed):
    """Bound lossless temporary YUV size; final export still sets quality."""
    try:
        width,height,fps,duration=map(float,[width,height,fps,duration])
    except (ValueError,TypeError):
        return False
    return bool(reviewed) and all(math.isfinite(v) and v>0 for v in [width,height,fps,duration]) and (
        width*height*fps*duration*1.5 <= 512*1024*1024)


def sequence_picture_window(programme_start, duration, programme_duration, source_start, source_fps, fps):
    first = math.ceil(programme_start * fps - 1e-7)
    end = min(round(programme_duration * fps), math.ceil((programme_start + duration) * fps - 1e-7))
    source_time = source_start + first / fps - programme_start
    source_frame_time = math.floor(source_time * source_fps + 1e-7) / source_fps
    # Seeking a rounded-up decimal can discard the wanted decoded frame.
    seek = math.floor(source_frame_time * 1e6) / 1e6
    phase = source_frame_time - source_time
    return {"frames": max(0, end-first), "seek": seek, "programme_start": first/fps,
            "clock": [f"setpts=PTS-STARTPTS+({phase:.9f})/TB",
                      f"fps={fps:g}:start_time=0:round=up",
                      # A source's container can outlast its last picture by
                      # part of a frame. Hold only that final CFR sample.
                      f"tpad=stop_mode=clone:stop_duration={1/fps:.9f}",
                      "setpts=PTS-STARTPTS"]}
