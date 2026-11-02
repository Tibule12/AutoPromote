"""Shared scene pose evaluation for Blender and native planar media."""
import math

KEYFRAME_FIELDS = ("x", "y", "z", "scale", "rotationX", "rotationY", "rotationZ")

def delivery_frame_count(spec):
    return math.ceil(round(spec['duration']*spec['fps'],8))

def clamp01(value):
    return max(0, min(1, value))

def smooth(value):
    value = clamp01(value)
    return value * value * (3 - 2 * value)

def _keyframe_mix(value, easing):
    value = clamp01(value)
    if easing == "linear":
        return value
    if easing == "ease_out":
        return 1 - (1 - value) ** 3
    if easing == "spring":
        return clamp01(1 - math.cos(value * math.pi * 2.5) * math.exp(-value * 5))
    return smooth(value)

def scene_at_time(scene, local):
    """Resolve editor pose keyframes before applying the preset motion layer."""
    custom = scene.get("keyframes") or []
    if not custom:
        return scene
    base = {field: scene[field] for field in KEYFRAME_FIELDS}
    start = scene["startTime"]
    frames = ([{"time": start, "easing": "linear", "values": base}]
              if not any(abs(frame["time"] - start) < .0001 for frame in custom) else []) + custom
    frames = sorted(frames, key=lambda frame: frame["time"])
    current = start + local
    right_index = next((index for index, frame in enumerate(frames) if frame["time"] >= current), -1)
    right = frames[-1] if right_index < 0 else frames[right_index]
    left = right if right_index <= 0 else frames[right_index - 1]
    amount = 1 if right["time"] == left["time"] else (current - left["time"]) / (right["time"] - left["time"])
    amount = _keyframe_mix(amount, right["easing"])
    resolved = dict(scene)
    for field in KEYFRAME_FIELDS:
        resolved[field] = left["values"][field] + (right["values"][field] - left["values"][field]) * amount
    return resolved

def pose(scene, local):
    scene = scene_at_time(scene, local)
    duration = scene["duration"]
    ease = lambda value: 1 - (1 - max(0, min(1, value))) ** 3
    enter = ease(min(1, local / min(.75, duration * .25)))
    leave = ease(min(1, (duration - local) / min(.55, duration * .2)))
    sway = math.sin(local * 1.5) * scene["intensity"]
    return {
        "position": ((scene["x"] - 50) / 12, (50 - scene["y"]) / 12 + (-1.5 if scene["entrance"] == "slide" else 0) * (1 - enter) + (sway * .08 if scene["hold"] == "float" else 0), scene["z"] + (-3 if scene["entrance"] == "dolly" else 2 if scene["entrance"] == "burst" else -1) * (1 - enter)),
        "scale": scene["scale"] * (1.45 - .45 * enter if scene["entrance"] == "burst" else .72 + .28 * enter),
        "rotation": (scene["rotationX"] + ((1 - enter) * 32 if scene["entrance"] == "burst" else 0), scene["rotationY"] + ((1 - enter) * -55 if scene["entrance"] == "orbit" else 0) + (sway * 5 if scene["hold"] == "orbit" else 0), scene["rotationZ"] + ((1 - leave) * 28 if scene["exit"] == "spin" else 0)),
        "opacity": enter * leave,
    }
