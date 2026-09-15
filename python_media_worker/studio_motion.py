"""Programme zoom automation shared by the Studio render pipeline.

Keys use the retained timeline clock, before speed changes or added overlays.
Only numeric data is interpolated into FFmpeg expressions.
"""
import math


def finite(value, default=0.0):
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (TypeError, ValueError):
        return default


def easing_value(progress, easing, curve=None):
    p = max(0.0, min(1.0, progress))
    if easing == "hold":
        return 0.0 if p < 1 else 1.0
    if easing == "ease_in":
        return p ** 3
    if easing == "ease_out":
        return 1 - (1 - p) ** 3
    if easing == "ease_in_out":
        return 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2
    if easing == "bezier":
        curve = curve if isinstance(curve, (list, tuple)) and len(curve) == 4 else [0.33, 0, 0.67, 1]
        x1, y1, x2, y2 = [finite(v) for v in curve]
        x1, x2 = max(0, min(1, x1)), max(0, min(1, x2))
        y1, y2 = max(-2, min(2, y1)), max(-2, min(2, y2))
        def cubic(t, a, b):
            return 3 * (1-t)**2*t*a + 3*(1-t)*t*t*b + t**3
        low, high = 0.0, 1.0
        for _ in range(24):
            t = (low + high) / 2
            if cubic(t, x1, x2) < p:
                low = t
            else:
                high = t
        return cubic((low + high) / 2, y1, y2)
    return p


def automation_expression(keys, default=1.0):
    ordered = {}
    for key in keys or []:
        time = finite(key.get("time"), -1)
        if time >= 0:
            ordered[time] = {**key, "time": time, "value": finite(key.get("value"), default)}
    points = sorted(ordered.values(), key=lambda key: key["time"])
    if not points:
        return f"{default:.8f}"
    expression = f"{points[-1]['value']:.8f}"
    for left, right in reversed(list(zip(points, points[1:]))):
        start, end = left["time"], right["time"]
        p = f"((t-{start:.8f})/{end-start:.8f})"
        easing = right.get("easing", "linear")
        progress = {"linear": p, "hold": "0", "ease_in": f"pow({p},3)",
                    "ease_out": f"(1-pow(1-{p},3))",
                    "ease_in_out": f"if(lt({p},0.5),4*pow({p},3),1-pow(-2*{p}+2,3)/2)"}.get(easing, p)
        if easing == "bezier":
            # A sampled custom curve avoids differing browser/server solvers in
            # FFmpeg. Standard presets above remain exact expressions.
            progress = "1"
            for index in reversed(range(32)):
                a, b = index / 32, (index + 1) / 32
                va, vb = easing_value(a, easing, right.get("curve")), easing_value(b, easing, right.get("curve"))
                segment = f"({va:.8f}+({vb-va:.8f})*({p}-{a:.8f})*32)"
                progress = f"if(lt({p},{b:.8f}),{segment},{progress})"
        value = f"({left['value']:.8f}+({right['value']-left['value']:.8f})*({progress}))"
        expression = f"if(lt(t,{end:.8f}),{value},{expression})"
    return f"if(lt(t,{points[0]['time']:.8f}),{points[0]['value']:.8f},{expression})"


def _property_keys(plan, property_name):
    return [
        key for key in (plan.get("keyframes") or [])
        if key.get("property") == property_name
    ]


def build_studio_motion_filter(motion, width, height):
    """Build the programme transform seen in the browser Motion inspector.

    The graph keeps invariant delivery dimensions while evaluating every
    transform against the retained (pre-speed) edit clock.
    """
    plan = motion or {}
    base_transform = plan.get("base_transform") or {}
    scale_keys = _property_keys(plan, "scale") or plan.get("scale_keyframes") or []
    base = max(0.1, min(5, finite(base_transform.get("scale", plan.get("base_scale")), 1)))
    finish_zoom = max(1, min(2, finite(plan.get("zoom"), 1)))
    base_x = max(0, min(100, finite(base_transform.get("x"), 50)))
    base_y = max(0, min(100, finite(base_transform.get("y"), 50)))
    base_rotation = max(-360, min(360, finite(base_transform.get("rotation"), 0)))
    base_opacity = max(0, min(1, finite(base_transform.get("opacity"), 1)))
    base_crop_x = max(0, min(45, finite(base_transform.get("crop_x"), 0)))
    base_crop_y = max(0, min(45, finite(base_transform.get("crop_y"), 0)))
    x_keys = _property_keys(plan, "x")
    y_keys = _property_keys(plan, "y")
    rotation_keys = _property_keys(plan, "rotation")
    opacity_keys = _property_keys(plan, "opacity")
    crop_x_keys = _property_keys(plan, "cropX")
    crop_y_keys = _property_keys(plan, "cropY")
    if (
        not any((scale_keys, x_keys, y_keys, rotation_keys, opacity_keys, crop_x_keys, crop_y_keys))
        and abs(base * finish_zoom - 1) < .00001
        and abs(base_x - 50) < .00001
        and abs(base_y - 50) < .00001
        and abs(base_rotation) < .00001
        and abs(base_opacity - 1) < .00001
        and abs(base_crop_x) < .00001
        and abs(base_crop_y) < .00001
    ):
        return ""
    width, height = max(2, int(width)), max(2, int(height))
    expression = f"max(0.1,min(8,({automation_expression(scale_keys, base)})*{finish_zoom:.8f}))"
    # Scale/pad evaluate per frame; crop restores an invariant delivery size.
    filters = [
        f"scale=w='max(2,trunc({width}*({expression})/2)*2)':"
        f"h='max(2,trunc({height}*({expression})/2)*2)':eval=frame",
        f"pad=w='max(iw,{width})':h='max(ih,{height})':"
        "x=(ow-iw)/2:y=(oh-ih)/2:eval=frame:color=black",
        # crop's iw/ih can remain at the initial frame size downstream of a
        # frame-evaluated scale. Use the actual scale expression instead.
        f"crop={width}:{height}:x='max(0,(trunc({width}*({expression})/2)*2-{width})/2)':"
        f"y='max(0,(trunc({height}*({expression})/2)*2-{height})/2)'",
    ]

    rotation = automation_expression(rotation_keys, base_rotation)
    if rotation_keys or abs(base_rotation) > .00001:
        filters.append(
            f"rotate=angle='PI/180*({rotation})':ow={width}:oh={height}:c=black"
        )

    x_expression = automation_expression(x_keys, base_x)
    y_expression = automation_expression(y_keys, base_y)
    if x_keys or y_keys or abs(base_x - 50) > .00001 or abs(base_y - 50) > .00001:
        filters.extend([
            f"pad={width * 3}:{height * 3}:{width}:{height}:color=black",
            f"crop={width}:{height}:"
            f"x='{width}-(({x_expression})-50)*{width}/100':"
            f"y='{height}-(({y_expression})-50)*{height}/100'",
        ])

    opacity = automation_expression(opacity_keys, base_opacity)
    crop_x = automation_expression(crop_x_keys, base_crop_x)
    crop_y = automation_expression(crop_y_keys, base_crop_y)
    if (
        opacity_keys or crop_x_keys or crop_y_keys
        or abs(base_opacity - 1) > .00001
        or abs(base_crop_x) > .00001
        or abs(base_crop_y) > .00001
    ):
        mask = (
            f"({opacity})*gte(X,W*({crop_x})/100)*lte(X,W*(1-({crop_x})/100))"
            f"*gte(Y,H*({crop_y})/100)*lte(Y,H*(1-({crop_y})/100))"
        )
        filters.append("format=gbrp")
        filters.append(
            f"geq=r='r(X,Y)*({mask})':g='g(X,Y)*({mask})':b='b(X,Y)*({mask})'"
        )
        filters.append("format=yuv420p")

    filters.append("setsar=1")
    return ",".join(filters)


def build_studio_zoom_filter(motion, width, height):
    """Backward-compatible name retained for older render callers/tests."""
    return build_studio_motion_filter(motion, width, height)
