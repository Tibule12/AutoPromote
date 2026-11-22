"""Native Finish Rack adjustment filters; parameters come from the shared compiler."""
import math


def adjustment_grade_filter(effects, build_finish, prefix):
    try:
        from .studio_texture_repair import build_texture_repair_filter
    except ImportError:
        from studio_texture_repair import build_texture_repair_filter
    repair=build_texture_repair_filter(effects,prefix+'repair_')
    parts=[repair]if repair else[]
    parts += [build_finish({"enabled": True, "color": effects.get("color") or {},
                           "texture": effects.get("texture") or {},
                           "_preserve_rgb": True,
                           "_label_prefix": prefix})]
    # Only the worker's request preparation sets this path, after validating and
    # materializing the actual LUT bytes. Client-supplied paths are discarded.
    cube_path = effects.get("_worker_cube_path")
    if cube_path:
        escaped = str(cube_path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
        parts.append(f"format=rgb24,lut3d=file='{escaped}':interp=trilinear")
    power_window = effects.get("power_window")
    if isinstance(power_window, dict) and power_window.get("enabled"):
        try:
            from .studio_pro_render_engine import build_power_window_filter
        except ImportError:
            from studio_pro_render_engine import build_power_window_filter
        pw_filter = build_power_window_filter(power_window, prefix=f"{prefix}pw_")
        if pw_filter:
            parts.append(pw_filter)
    qualifier_cube_path = effects.get("_worker_qualifier_cube_path")
    if qualifier_cube_path:
        escaped_qual = str(qualifier_cube_path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
        parts.append(f"format=rgb24,lut3d=file='{escaped_qual}':interp=trilinear")
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
    if (effects.get('recolor')or{}).get('enabled'):
        path=effects.get('_worker_recolor_cube_path')
        if not path:raise ValueError('Selected-area colour has not been prepared by the worker')
        escaped=str(path).replace('\\','\\\\').replace(':','\\:').replace("'","\\'")
        parts.append(f"format=gbrp,lut3d=file='{escaped}':interp=trilinear")
    grade = ",".join(part for part in parts if part) or "null"
    if effects.get('selective_mask'):
        try:
            from .studio_selective_mask import masked_grade_filter
        except ImportError:
            from studio_selective_mask import masked_grade_filter
        path=effects.get('_worker_selective_mask_path')
        if not path:raise ValueError('Selected-area mask has not been prepared by the worker')
        grade=masked_grade_filter(grade,path,prefix+'region_',effects.get('_worker_selective_mask_fps',30),effects.get('_worker_material_cube_path'))
    return grade
