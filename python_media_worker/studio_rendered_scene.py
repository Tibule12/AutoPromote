"""Shared programme placement for validated rendered 3D scenes.

Callers resolve and verify owned/local media before constructing this block.
Only picture is composited: programme audio remains on its existing bus.
"""
import math
import re


def rendered_scene_block(input_index, backdrop, output, prefix, width, height,
                         start, duration, output_start=None, output_end=None,
                         explicit_order=True):
    values = (start, duration, output_start if output_start is not None else start,
              output_end if output_end is not None else start + duration)
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
        raise ValueError("Rendered scene placement needs finite programme times")
    start, duration, first, last = values
    if start < 0 or duration <= 0 or first < 0 or last <= first:
        raise ValueError("Invalid rendered scene interval")
    if (not isinstance(input_index, int) or input_index < 0
            or not all(isinstance(v, int) and 2 <= v <= 8192 for v in (width, height))
            or not all(re.fullmatch(r"[A-Za-z0-9_]+", v) for v in (backdrop, output, prefix))):
        raise ValueError("Invalid rendered scene filter identifiers or dimensions")
    layer = prefix + "_picture"
    stretch = (last - first) / duration
    graphic_format = ":format=auto" if explicit_order else ""
    return [
        f"[{input_index}:v]trim=duration={duration:.9f},format=rgba,"
        f"scale={width}:{height}:flags=lanczos,setsar=1,"
        f"setpts=(PTS-STARTPTS)*{stretch:.17g}+{first:.17g}/TB[{layer}];",
        f"[{backdrop}][{layer}]overlay=0:0:eof_action=pass:repeatlast=0"
        f"{graphic_format}:enable='gte(t,{first:.17g})*lt(t,{last:.17g})'[{output}];",
    ]
