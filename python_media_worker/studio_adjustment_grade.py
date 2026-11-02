"""Native Finish Rack adjustment filters; parameters come from the shared compiler."""
import math


def adjustment_grade_filter(effects, build_finish, prefix):
    parts = [build_finish({"enabled": True, "color": effects.get("color") or {},
                           "texture": effects.get("texture") or {}})]
    # Only the worker's request preparation sets this path, after validating and
    # materializing the actual LUT bytes. Client-supplied paths are discarded.
    cube_path = effects.get("_worker_cube_path")
    if cube_path:
        escaped = str(cube_path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
        parts.append(f"lut3d=file='{escaped}':interp=trilinear")
    glow = effects.get("glow") or {}
    radius = float(glow.get("radius", 0))
    intensity = float(glow.get("intensity", 0))
    if not math.isfinite(radius) or not math.isfinite(intensity) or not 0 <= radius <= 40 or not 0 <= intensity <= 1:
        raise ValueError("Adjustment glow needs a finite radius in 0..40 and intensity in 0..1")
    if radius > 0 and intensity > 0:
        # Studio uses programme units (720px high); scale is set per request.
        sigma = radius * float(effects.get("_worker_height", 720)) / 720
        parts.append(f"format=gbrp,split=2[{prefix}base][{prefix}copy];"
                     f"[{prefix}copy]gblur=sigma={sigma:.8f}:steps=3[{prefix}soft];"
                     f"[{prefix}base][{prefix}soft]blend=all_mode=screen:all_opacity={intensity:.8f}")
    return ",".join(part for part in parts if part) or "null"
