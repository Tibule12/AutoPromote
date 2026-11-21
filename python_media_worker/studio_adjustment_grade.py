"""Native Finish Rack adjustment filters; parameters come from the shared compiler."""
import math


def adjustment_grade_filter(effects, build_finish, prefix):
    clone = effects.get('clone_patch') or {}
    parts = []
    if clone.get('enabled'):
        if not effects.get('selective_mask'):raise ValueError('Clone correction needs a selected-area mask')
        dx,dy,strength=(float(clone.get(k,0)) for k in ('dx','dy','strength'))
        if not all(math.isfinite(n)for n in (dx,dy,strength))or abs(dx)>1 or abs(dy)>1 or not 0<=strength<=1:raise ValueError('Invalid clean patch')
        if clone.get('mode','clone')not in('clone','heal'):raise ValueError('Choose clone or heal')
        channels=':'.join(f"{c}='{c}(clip(X+{dx:.9f}*W,0,W-1),clip(Y+{dy:.9f}*H,0,H-1))'"for c in 'rgb')
        if clone.get('mode')=='heal':
            radius=clone.get('radius',.012)
            if type(radius)not in(int,float)or not math.isfinite(radius)or not .001<=radius<=.08:raise ValueError('Invalid healing detail radius')
            radius=max(1,min(80,math.floor(radius*min(effects.get('_worker_width',1280),effects.get('_worker_height',720))+.5)))
            inner=radius//2;outer_area=(2*radius+1)**2;inner_area=(2*inner+1)**2
            outer_weight=outer_area/(outer_area-inner_area);inner_weight=inner_area/(outer_area-inner_area)
            blur=lambda r:f'boxblur=luma_radius={r}:luma_power=1:chroma_radius={r}:chroma_power=1'
            parts.append(f'format=gbrp,split=4[{prefix}healbase][{prefix}healouter][{prefix}healinner][{prefix}healinput];'
                f'[{prefix}healouter]{blur(radius)}[{prefix}destinationouter];'
                f'[{prefix}healinner]{blur(inner)}[{prefix}destinationinner];'
                f'[{prefix}healinput]geq={channels},split=3[{prefix}clean][{prefix}cleanouterin][{prefix}cleaninnerin];'
                f'[{prefix}cleanouterin]{blur(radius)}[{prefix}cleanouter];'
                f'[{prefix}cleaninnerin]{blur(inner)}[{prefix}cleaninner];'
                f'[{prefix}healbase][{prefix}clean][{prefix}destinationouter][{prefix}cleanouter][{prefix}destinationinner][{prefix}cleaninner]'
                f"mix=inputs=6:weights='{1-strength:.9f} {strength:.9f} {strength*outer_weight:.9f} {-strength*outer_weight:.9f} {-strength*inner_weight:.9f} {strength*inner_weight:.9f}':scale=1:duration=first")
        else:
            parts.append(f'format=gbrp,split=2[{prefix}clonebase][{prefix}cloneinput];[{prefix}cloneinput]geq={channels}[{prefix}cloned];[{prefix}clonebase][{prefix}cloned]blend=all_expr=\'A*(1-{strength:.9f})+B*{strength:.9f}\'')
    parts += [build_finish({"enabled": True, "color": effects.get("color") or {},
                           "texture": effects.get("texture") or {},
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
