"""Strict, versioned render boundary shared by local and Cloud Run entrypoints."""
import math
import re

TEMPLATES = {"cinematic_title", "neon_logo", "chrome_lyric", "audio_reactive_text", "floating_callout", "impact_explosion", "speaker_intro", "comparison_card"}
MATERIALS = {"chrome", "glass", "neon", "gold", "matte", "holographic"}
ANIMATIONS = {"dolly", "orbit", "burst", "pulse", "float", "slide", "fade"}
HOLDS = {"still", "float", "pulse", "orbit"}
EXITS = {"fade", "dolly", "spin", "burst"}
EASINGS = {"ease_out", "ease_in_out", "spring", "linear"}
SCENE_KEYS = {"version", "id", "template", "name", "text", "secondary", "startTime", "duration", "endTime", "layerOrder", "assetUrl", "assetStoragePath", "assetName", "fontFamily", "fontWeight", "textAlign", "lineSpacing", "material", "primaryColor", "secondaryColor", "glowColor", "extrusionDepth", "bevel", "x", "y", "z", "scale", "rotationX", "rotationY", "rotationZ", "entrance", "hold", "exit", "easing", "intensity", "audioReactiveIntensity", "cameraMotion", "focalLength", "lightDirection", "lightColor", "lightIntensity", "shadows", "reflections", "bloom", "background", "enabled", "quality", "hqPreviewUrl", "hqPreviewRevision", "hqPreviewJobId", "keyframes"}
KEYFRAME_FIELDS = {"x", "y", "z", "scale", "rotationX", "rotationY", "rotationZ"}
ROOT_KEYS = {"version", "scene", "width", "height", "fps", "duration", "mode", "ownerUid"}
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
ID = re.compile(r"^[A-Za-z0-9_-]{1,100}$")


def _text(value, name, max_chars):
    if not isinstance(value, str) or len(value) > max_chars or any(ord(ch) < 32 for ch in value):
        raise ValueError(f"Invalid {name}")
    return value


def _number(value, name, low, high):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"Invalid {name}")
    return value


def _choice(value, name, allowed):
    if value not in allowed:
        raise ValueError(f"Invalid {name}")
    return value


def validate_spec(spec):
    if not isinstance(spec, dict) or set(spec) - ROOT_KEYS or spec.get("version") != 1:
        raise ValueError("Invalid 3D spec version or fields")
    scene = spec.get("scene")
    if not isinstance(scene, dict) or set(scene) - SCENE_KEYS or scene.get("version") != 1:
        raise ValueError("Invalid 3D scene version or fields")
    _text(spec.get("ownerUid"), "ownerUid", 128)
    if not ID.fullmatch(spec["ownerUid"]):
        raise ValueError("Invalid ownerUid")
    _choice(spec.get("mode"), "mode", {"preview", "export"})
    width = _number(spec.get("width"), "width", 160, 1280)
    height = _number(spec.get("height"), "height", 160, 1280)
    if max(width, height) > 1280 or min(width, height) > 720 or width * height > 1280 * 720:
        raise ValueError("Resolution exceeds 720p budget")
    if int(width) != width or int(height) != height or int(width) % 2 or int(height) % 2:
        raise ValueError("Resolution must have even integer dimensions")
    fps = _number(spec.get("fps"), "fps", 12, 30)
    if int(fps) != fps:
        raise ValueError("FPS must be an integer")
    duration = _number(spec.get("duration"), "duration", 0.5, 15 if spec["mode"] == "export" else 10)
    if duration * fps > 450:
        raise ValueError("Too many frames")
    for field in ("id", "name", "text", "secondary", "assetName"):
        if field in scene:
            _text(scene[field], field, {"id": 100, "name": 80, "text": 80, "secondary": 100, "assetName": 128}[field])
    if not ID.fullmatch(scene.get("id", "")):
        raise ValueError("Invalid scene id")
    _choice(scene.get("template"), "template", TEMPLATES)
    _choice(scene.get("material"), "material", MATERIALS)
    _choice(scene.get("entrance"), "entrance", ANIMATIONS)
    _choice(scene.get("hold"), "hold", HOLDS)
    _choice(scene.get("exit"), "exit", EXITS)
    _choice(scene.get("easing"), "easing", EASINGS)
    for field, options in {"fontFamily": {"studio", "sans", "serif"}, "fontWeight": {"regular", "bold", "black"}, "textAlign": {"left", "center", "right"}, "background": {"transparent", "dark", "light"}, "quality": {"draft", "preview", "high"}}.items():
        if field in scene:
            _choice(scene[field], field, options)
    for field in ("primaryColor", "secondaryColor", "glowColor", "lightColor"):
        if not COLOR.fullmatch(scene.get(field, "")):
            raise ValueError(f"Invalid {field}")
    bounds = {"startTime": (0, 86400), "duration": (0.5, 15), "layerOrder": (0, 100), "lineSpacing": (0.7, 2), "extrusionDepth": (0.01, 1.5), "bevel": (0, 0.2), "x": (5, 95), "y": (5, 95), "z": (-4, 4), "scale": (0.2, 3), "rotationX": (-180, 180), "rotationY": (-180, 180), "rotationZ": (-180, 180), "intensity": (0, 1), "audioReactiveIntensity": (0, 1), "cameraMotion": (0, 1), "focalLength": (24, 85), "lightDirection": (-180, 180), "lightIntensity": (0, 5), "bloom": (0, 1)}
    for field, (low, high) in bounds.items():
        _number(scene.get(field), field, low, high)
    if abs(scene.get("endTime", -1) - scene["startTime"] - scene["duration"]) > 0.001:
        raise ValueError("Scene endTime does not match start and duration")
    for field in ("shadows", "reflections", "enabled"):
        if not isinstance(scene.get(field), bool):
            raise ValueError(f"Invalid {field}")
    keyframes = scene.get("keyframes", [])
    if not isinstance(keyframes, list) or len(keyframes) > 64:
        raise ValueError("Invalid keyframes")
    for frame in keyframes:
        if not isinstance(frame, dict) or set(frame) != {"id", "time", "easing", "values"}:
            raise ValueError("Invalid keyframe fields")
        _text(frame.get("id"), "keyframe id", 100)
        if not ID.fullmatch(frame["id"]):
            raise ValueError("Invalid keyframe id")
        _number(frame.get("time"), "keyframe time", scene["startTime"], scene["endTime"])
        _choice(frame.get("easing"), "keyframe easing", EASINGS)
        values = frame.get("values")
        if not isinstance(values, dict) or set(values) != KEYFRAME_FIELDS:
            raise ValueError("Invalid keyframe values")
        for field in KEYFRAME_FIELDS:
            low, high = bounds[field]
            _number(values.get(field), f"keyframe {field}", low, high)
    asset_path = scene.get("assetStoragePath", "")
    if asset_path:
        _text(asset_path, "assetStoragePath", 512)
        prefix = f"temp_studio_3d/{spec['ownerUid']}/"
        if not asset_path.startswith(prefix) or not re.fullmatch(r"[A-Za-z0-9_-]{8,100}/asset\.(png|jpg|webp)", asset_path[len(prefix):]) or ".." in asset_path:
            raise ValueError("Asset must be staged in the isolated 3D bucket")
    if scene.get("assetUrl") and not asset_path:
        raise ValueError("A browser-only asset cannot be rendered")
    return spec
