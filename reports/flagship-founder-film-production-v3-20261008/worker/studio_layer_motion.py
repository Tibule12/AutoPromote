"""Pixel-accurate image/logo layer motion for Viral Clip Studio.

The browser stores edit-clock keyframes in composition_plan. This renderer
evaluates those same keys after mapping output time back through speed changes,
then creates a transparent full-canvas layer for FFmpeg compositing.
"""
import math
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageColor, ImageFilter

try:
    from .studio_motion import easing_value, finite
    from .viral_motion_graphics import edit_clock
    from .viral_render_contract import map_timeline_time
except ImportError:
    from studio_motion import easing_value, finite
    from viral_motion_graphics import edit_clock
    from viral_render_contract import map_timeline_time


def _get(value, key, default=None):
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def composition_layer(composition_plan, layer_id):
    for layer in (composition_plan or {}).get("layers") or []:
        if str(layer.get("id")) == str(layer_id):
            return layer
    return None


def interpolate_layer_value(layer, property_name, time, fallback):
    keys = sorted(
        (
            key for key in (layer or {}).get("motion_keyframes") or []
            if key.get("property") == property_name
        ),
        key=lambda key: finite(key.get("time"), 0),
    )
    if not keys:
        return finite((layer or {}).get("base_transform", {}).get(property_name), fallback)
    if time <= finite(keys[0].get("time"), 0):
        return finite(keys[0].get("value"), fallback)
    if time >= finite(keys[-1].get("time"), 0):
        return finite(keys[-1].get("value"), fallback)
    right_index = next(index for index, key in enumerate(keys) if finite(key.get("time"), 0) >= time)
    left, right = keys[right_index - 1], keys[right_index]
    start, end = finite(left.get("time"), 0), finite(right.get("time"), 0)
    progress = (time - start) / max(.0001, end - start)
    amount = easing_value(progress, right.get("easing", "ease_in_out"), right.get("curve"))
    first, last = finite(left.get("value"), fallback), finite(right.get("value"), fallback)
    return first + (last - first) * amount


def layer_pose(layer, overlay, time):
    base = (layer or {}).get("base_transform") or {}
    return {
        "x": interpolate_layer_value(layer, "x", time, base.get("x", _get(overlay, "x", 50))),
        "y": interpolate_layer_value(layer, "y", time, base.get("y", _get(overlay, "y", 50))),
        "scale": max(.01, interpolate_layer_value(layer, "scale", time, base.get("scale", _get(overlay, "scale", 1)))),
        "rotation": interpolate_layer_value(layer, "rotation", time, base.get("rotation", _get(overlay, "rotation", 0))),
        "opacity": max(0, min(1, interpolate_layer_value(layer, "opacity", time, base.get("opacity", _get(overlay, "opacity", 1))))),
    }


def _effect_layer(alpha, color, opacity, blur):
    mask = alpha.filter(ImageFilter.GaussianBlur(max(0, blur))) if blur > 0 else alpha
    if opacity < 1:
        mask = mask.point(lambda value: round(value * max(0, min(1, opacity))))
    result = Image.new("RGBA", alpha.size, (*ImageColor.getrgb(color), 0))
    result.putalpha(mask)
    return result


def _render_pose(asset, overlay, layer, pose, canvas_size, sample_opacity=1):
    canvas_width, canvas_height = canvas_size
    width_percent = max(.1, min(100, finite(_get(overlay, "width", 35), 35)))
    height_percent = max(.1, min(100, finite(_get(overlay, "height", 35), 35)))
    box_width = max(2, round(canvas_width * width_percent / 100 * pose["scale"]))
    box_height = max(2, round(canvas_height * height_percent / 100 * pose["scale"]))
    fit = str(_get(overlay, "mediaFit", _get(overlay, "media_fit", "contain")) or "contain").lower()
    source_ratio, box_ratio = asset.width / asset.height, box_width / box_height
    if fit == "stretch":
        target_width, target_height = box_width, box_height
    elif (fit == "cover" and source_ratio < box_ratio) or (fit != "cover" and source_ratio > box_ratio):
        target_width = box_width
        target_height = max(2, round(box_width / source_ratio))
    else:
        target_height = box_height
        target_width = max(2, round(box_height * source_ratio))
    artwork = asset.resize((target_width, target_height), Image.Resampling.LANCZOS)
    if fit == "cover":
        left = max(0, (artwork.width - box_width) // 2)
        top = max(0, (artwork.height - box_height) // 2)
        artwork = artwork.crop((left, top, min(artwork.width, left + box_width), min(artwork.height, top + box_height)))

    anchor_x = max(0, min(100, finite((layer or {}).get("anchor_x", 50), 50))) / 100
    anchor_y = max(0, min(100, finite((layer or {}).get("anchor_y", 50), 50))) / 100
    diagonal = max(8, math.ceil(math.hypot(artwork.width, artwork.height) * 2.1))
    transform_surface = Image.new("RGBA", (diagonal, diagonal))
    anchor = (diagonal // 2, diagonal // 2)
    transform_surface.alpha_composite(
        artwork,
        (round(anchor[0] - artwork.width * anchor_x), round(anchor[1] - artwork.height * anchor_y)),
    )
    if abs(pose["rotation"]) > .001:
        transform_surface = transform_surface.rotate(-pose["rotation"], Image.Resampling.BICUBIC, center=anchor)

    alpha = transform_surface.getchannel("A")
    effects = (layer or {}).get("effects") or {}
    composed = Image.new("RGBA", transform_surface.size)
    shadow = effects.get("shadow") or {}
    if shadow.get("enabled"):
        shadow_layer = _effect_layer(
            alpha,
            shadow.get("color", "#000000"),
            finite(shadow.get("opacity"), .55) * sample_opacity,
            finite(shadow.get("blur"), 18),
        )
        composed.alpha_composite(
            shadow_layer,
            (round(finite(shadow.get("x"), 0)), round(finite(shadow.get("y"), 10))),
        )
    glow = effects.get("glow") or {}
    if glow.get("enabled"):
        composed.alpha_composite(
            _effect_layer(
                alpha,
                glow.get("color", "#8b5cf6"),
                finite(glow.get("intensity"), .75) * sample_opacity,
                finite(glow.get("radius"), 16),
            )
        )
    blur = max(0, finite(effects.get("blur"), 0))
    if blur > 0:
        transform_surface = transform_surface.filter(ImageFilter.GaussianBlur(blur))
    opacity = max(0, min(1, pose["opacity"] * sample_opacity))
    if opacity < .999:
        transform_surface.putalpha(transform_surface.getchannel("A").point(lambda value: round(value * opacity)))
    composed.alpha_composite(transform_surface)

    destination = Image.new("RGBA", canvas_size)
    x = round(canvas_width * pose["x"] / 100 - anchor[0])
    y = round(canvas_height * pose["y"] / 100 - anchor[1])
    destination.alpha_composite(composed, (x, y))
    return destination


def render_image_layer_motion(asset_path, output_path, overlay, layer, width, height,
                              output_duration, speed_plan, fps=30):
    """Render one timed image layer and return its final-clock placement."""
    asset = Image.open(asset_path).convert("RGBA")
    if asset.width * asset.height > 8192 * 8192:
        raise ValueError("Logo/image layer exceeds the 8192px safety limit")
    start = max(0, finite(_get(overlay, "start_time", 0), 0))
    edit_end = start + max(.05, finite(_get(overlay, "duration", output_duration), output_duration))
    normalized_speed_plan = list(speed_plan or [])
    if normalized_speed_plan:
        output_start = max(0, float(map_timeline_time(normalized_speed_plan, start)))
        output_end = min(output_duration, float(map_timeline_time(normalized_speed_plan, edit_end)))
    else:
        output_start = min(output_duration, start)
        output_end = min(output_duration, edit_end)
    clip_duration = max(.05, output_end - output_start)
    motion_blur = ((layer or {}).get("effects") or {}).get("motion_blur") or {}
    samples = max(1, min(8, int(finite(motion_blur.get("samples"), 1)))) if motion_blur.get("enabled") else 1
    shutter = max(0, min(1, finite(motion_blur.get("shutter"), .5)))
    command = [
        "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
        "-s", f"{width}x{height}", "-r", str(fps), "-i", "pipe:0", "-an",
        "-c:v", "qtrle", "-threads", "2", "-f", "mov", str(output_path),
    ]
    with tempfile.TemporaryFile() as log:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)
        try:
            for frame_index in range(math.ceil(clip_duration * fps)):
                absolute_output = output_start + frame_index / fps
                frame = Image.new("RGBA", (width, height))
                for sample in range(samples):
                    sample_output = max(output_start, absolute_output - (samples - 1 - sample) * shutter / fps)
                    edit_time = (
                        float(edit_clock(sample_output, normalized_speed_plan))
                        if normalized_speed_plan else sample_output
                    )
                    pose = layer_pose(layer, overlay, edit_time)
                    sample_opacity = 1 if sample == samples - 1 else .28 / max(1, samples - 1)
                    frame.alpha_composite(
                        _render_pose(asset, overlay, layer, pose, (width, height), sample_opacity)
                    )
                process.stdin.write(frame.tobytes())
            process.stdin.close()
            if process.wait(timeout=1800):
                log.seek(0)
                raise RuntimeError("Layer motion encoding failed: " + log.read().decode(errors="replace")[-1600:])
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
    return {"path": str(Path(output_path)), "start_time": output_start, "duration": clip_duration}
