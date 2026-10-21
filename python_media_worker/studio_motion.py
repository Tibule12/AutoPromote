"""Programme zoom automation shared by the Studio render pipeline.

Keys use the retained timeline clock, before speed changes or added overlays.
Only numeric data is interpolated into FFmpeg expressions.
"""
import math
import re

SPATIAL_CURVE_STEPS = 128


def validate_spatial_curve(key):
    if "spatialCurve" not in key:
        return
    controls = key["spatialCurve"]
    if (key.get("property") not in ("x", "y") or not isinstance(controls, (list, tuple)) or len(controls) != 2
            or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or abs(v) > 200 for v in controls)):
        raise ValueError("Spatial handles need X/Y offsets between -200 and 200")


def automation_segment_value(first, last, progress, key):
    if "spatialCurve" not in key:
        return first + (last - first) * easing_value(progress, key.get("easing", "linear"), key.get("curve"))
    validate_spatial_curve(key)
    if key.get("easing") == "hold":
        return first if progress < 1 else last
    def sample(p):
        u = max(0, min(1, easing_value(p, key.get("easing", "linear"), key.get("curve"))))
        v = 1 - u
        return (v**3 * first + 3*v*v*u*(first + key["spatialCurve"][0])
                + 3*v*u*u*(last + key["spatialCurve"][1]) + u**3*last)
    at = max(0, min(1, progress)) * SPATIAL_CURVE_STEPS
    index = min(SPATIAL_CURVE_STEPS - 1, int(at))
    a, b = sample(index / SPATIAL_CURVE_STEPS), sample((index + 1) / SPATIAL_CURVE_STEPS)
    return a + (b-a)*(at-index)


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
        validate_spatial_curve(key)
        time = finite(key.get("time"), -1)
        if time >= 0:
            ordered[time] = {**key, "time": time, "value": finite(key.get("value"), default)}
    points = sorted(ordered.values(), key=lambda key: key["time"])
    if not points:
        return f"{default:.8f}"
    expression = f"{points[-1]['value']:.8f}"
    for left, right in reversed(list(zip(points, points[1:]))):
        start, end = left["time"], right["time"]
        span = end-start
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
        if "spatialCurve" in right and easing != "hold":
            pieces = []
            for index in range(SPATIAL_CURVE_STEPS):
                a, b = index / SPATIAL_CURVE_STEPS, (index + 1) / SPATIAL_CURVE_STEPS
                va, vb = (automation_segment_value(left['value'], right['value'], v, right) for v in (a, b))
                # Express each line on the segment's source clock directly.
                # Repeating a normalized-time formula in every leaf needlessly
                # exhausts the OS argument limit after a few curved intervals.
                slope = (vb-va)*SPATIAL_CURVE_STEPS/span
                intercept = va-slope*(start+a*span)
                pieces.append(f"({intercept:.8f}+({slope:.8f})*t)")
            # FFmpeg's expression parser has a bounded recursion depth. A
            # balanced selection keeps 128 precision samples seven levels deep.
            def branch(low, high):
                if high-low == 1:
                    return pieces[low]
                middle = (low+high)//2
                boundary = start+span*middle/SPATIAL_CURVE_STEPS
                return f"if(lt(t,{boundary:.8f}),{branch(low,middle)},{branch(middle,high)})"
            value = branch(0, SPATIAL_CURVE_STEPS)
        expression = f"if(lt(t,{end:.8f}),{value},{expression})"
    return f"if(lt(t,{points[0]['time']:.8f}),{points[0]['value']:.8f},{expression})"


def output_to_programme_expression(speed_plan):
    """The same inverse piecewise clock used by edit_clock, for FFmpeg t."""
    if not speed_plan:
        return "t"
    segments, cursor = [], 0.0
    for segment in speed_plan:
        start, end, rate = (float(segment[field]) for field in ("start_time", "end_time", "rate"))
        if not all(math.isfinite(value) for value in (start, end, rate)) or start < 0 or end <= start or rate <= 0:
            raise ValueError("Invalid group animation speed clock")
        length = (end-start)/rate
        segments.append((start, end, rate, cursor, cursor+length))
        cursor += length
    result = f"{segments[-1][1]:.8f}"
    for start, end, rate, first, last in reversed(segments):
        result = f"if(lt(t,{last:.8f}),{start:.8f}+max(0,min({last-first:.8f},t-{first:.8f}))*{rate:.8f},{result})"
    return result


def _property_keys(plan, property_name):
    return [
        key for key in (plan.get("keyframes") or [])
        if key.get("property") == property_name
    ]


def _identity_curve(keys, base, identity):
    """Skip pixel masks only when every accepted curve value is the identity.

    Clip-boundary compilation creates constant opacity/crop keys even when an
    editor never changes those fields. Easing cannot change a constant curve.
    Match automation_expression's acceptance and fallback rules.
    """
    return abs(base - identity) < .00001 and all(
        abs(finite(key.get("value"), base) - identity) < .00001
        for key in keys if finite(key.get("time"), -1) >= 0
    )


def _curve_bounds(keys, base):
    points = {}
    for key in keys or []:
        time = finite(key.get("time"), -1)
        if time >= 0:
            points[time] = {**key, "value": finite(key.get("value"), base)}
    ordered = [points[t] for t in sorted(points)]
    values = [base, *[key["value"] for key in ordered]]
    for left, right in zip(ordered, ordered[1:]):
        if "spatialCurve" in right:
            validate_spatial_curve(right)
            values.extend((left['value'] + right['spatialCurve'][0], right['value'] + right['spatialCurve'][1]))
        if right.get("easing") == "bezier":
            # automation_expression uses these same piecewise-linear samples.
            values.extend(left["value"] + (right["value"] - left["value"]) *
                          easing_value(i / 32, "bezier", right.get("curve")) for i in range(33))
    return min(values), max(values)


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
    x_expression = automation_expression(x_keys, base_x)
    y_expression = automation_expression(y_keys, base_y)
    if (rotation_keys or abs(base_rotation) > .00001 or x_keys or y_keys
            or abs(base_x - 50) > .00001 or abs(base_y - 50) > .00001):
        max_scale = max(.1, min(8, _curve_bounds(scale_keys, base)[1] * finish_zoom))
        if rotation_keys:
            rotated_width = rotated_height = math.hypot(width, height) * max_scale
        else:
            angle = math.radians(base_rotation)
            rotated_width = (abs(math.cos(angle)) * width + abs(math.sin(angle)) * height) * max_scale
            rotated_height = (abs(math.sin(angle)) * width + abs(math.cos(angle)) * height) * max_scale
        dx = max(abs(v - 50) for v in _curve_bounds(x_keys, base_x)) * width / 100
        dy = max(abs(v - 50) for v in _curve_bounds(y_keys, base_y)) * height / 100
        canvas_width = math.ceil((max(width, width * max_scale, rotated_width) + 2 * dx) / 2) * 2
        canvas_height = math.ceil((max(height, height * max_scale, rotated_height) + 2 * dy) / 2) * 2
        # Preserve the complete scaled source through rotation/translation.
        # Cropping before translation permanently destroys pixels that the
        # browser's combined affine transform brings back into the programme.
        filters = [filters[0],
            f"pad={canvas_width}:{canvas_height}:x=(ow-iw)/2:y=(oh-ih)/2:eval=frame:color=black"]
        if rotation_keys or abs(base_rotation) > .00001:
            filters.append(f"rotate=angle='PI/180*({rotation})':ow={canvas_width}:oh={canvas_height}:c=black")
        filters.append(f"crop={width}:{height}:"
                       f"x='{(canvas_width-width)/2}-(({x_expression})-50)*{width}/100':"
                       f"y='{(canvas_height-height)/2}-(({y_expression})-50)*{height}/100'")

    # geq uses uppercase T for frame time; scale/crop/rotate use lowercase t.
    # These curves share one clock but must use the filter's actual variable.
    opacity = re.sub(r"\bt\b", "T", automation_expression(opacity_keys, base_opacity))
    crop_x = re.sub(r"\bt\b", "T", automation_expression(crop_x_keys, base_crop_x))
    crop_y = re.sub(r"\bt\b", "T", automation_expression(crop_y_keys, base_crop_y))
    if not (
        _identity_curve(opacity_keys, base_opacity, 1)
        and _identity_curve(crop_x_keys, base_crop_x, 0)
        and _identity_curve(crop_y_keys, base_crop_y, 0)
    ):
        # Curves depend on frame time, not pixel position. geq evaluates each
        # colour expression in row order, with independent state per thread.
        # Cache at X=0 on every row so threaded slices also initialize their
        # own registers; retain the original 8-bit RGB multiplication exactly.
        curves, factors = [], []
        if not _identity_curve(opacity_keys, base_opacity, 1):
            curves.append(f"st(0,{opacity})")
            factors.append("ld(0)")
        if not _identity_curve(crop_x_keys, base_crop_x, 0):
            curves.append(f"st(1,{crop_x})")
            factors.extend(("gte(X,W*ld(1)/100)", "lte(X,W*(1-ld(1)/100))"))
        if not _identity_curve(crop_y_keys, base_crop_y, 0):
            curves.append(f"st(2,{crop_y})")
            factors.extend(("gte(Y,H*ld(2)/100)", "lte(Y,H*(1-ld(2)/100))"))
        cache = f"if(eq(X,0),{'+'.join(curves)},0)"
        mask = "*".join(factors)
        filters.append("format=gbrp")
        filters.append(
            "geq=" + ":".join(f"{channel}='{cache};{channel}(X,Y)*({mask})'" for channel in ("r", "g", "b"))
        )
        filters.append("format=yuv420p")

    filters.append("setsar=1")
    return ",".join(filters)


def build_studio_zoom_filter(motion, width, height):
    """Backward-compatible name retained for older render callers/tests."""
    return build_studio_motion_filter(motion, width, height)
