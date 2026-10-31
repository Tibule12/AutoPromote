"""Deterministic RGB/alpha composition for the canonical Studio stack."""
import math
import re
try:
    from .studio_perspective import validate_perspective_layer
except ImportError:
    from studio_perspective import validate_perspective_layer

try:
    from .studio_text_animator import validate_text_animation_layer
    from .studio_vector_shape import validate_vector_shape, validate_vector_trim
    from .studio_motion import automation_expression, _curve_bounds, output_to_programme_expression, validate_spatial_curve
except ImportError:
    from studio_text_animator import validate_text_animation_layer
    from studio_vector_shape import validate_vector_shape, validate_vector_trim
    from studio_motion import automation_expression, _curve_bounds, output_to_programme_expression, validate_spatial_curve
try:
    from .studio_layer_motion import layer_clip_mask
except ImportError:
    from studio_layer_motion import layer_clip_mask

BLEND_MODES = {"normal", "multiply", "screen", "difference", "overlay", "hard-light", "soft-light", "color-dodge", "luminosity"}
GROUP_TRANSFORM = {"x": 0, "y": 0, "scale": 1, "rotation": 0, "opacity": 1}
GROUP_BOUNDS = {"x": (-100, 100), "y": (-100, 100), "scale": (.1, 2), "rotation": (-180, 180), "opacity": (0, 1)}


def validate_group_mask(mask):
    if (not isinstance(mask, dict) or set(mask) - {"enabled", "shape", "path", "radius", "feather", "inverted"}):
        raise ValueError("Group masks support enabled, shape, path, radius, feather and inversion")
    for field in ("enabled", "inverted"):
        if field in mask and not isinstance(mask[field], bool):
            raise ValueError(f"Group mask {field} needs a boolean")
    if mask.get("shape", "rectangle") not in {"rectangle", "ellipse", "polygon"}:
        raise ValueError("Unsupported group mask shape")
    for field, high in (("radius", 50), ("feather", 100)):
        value = mask.get(field, 0)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= high:
            raise ValueError(f"Group mask {field} must be between 0 and {high}")
    if "path" in mask or mask.get("shape") == "polygon":
        path = mask.get("path", "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)")
        match = re.fullmatch(r"polygon\((.{1,2048})\)", path.strip()) if isinstance(path, str) else None
        points = match.group(1).split(',') if match else []
        if not 3 <= len(points) <= 64:
            raise ValueError("Group mask requires a percentage polygon with 3 to 64 points")
        for point in points:
            pair = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%\s*", point)
            if not pair or not all(math.isfinite(float(v)) for v in pair.groups()):
                raise ValueError("Group mask requires finite percentage points")


def graphic_group_mask(group, width, height):
    """Same authored matte rasterizer as ordinary layers, in group-local space."""
    mask = group.get("mask", {})
    validate_group_mask(mask)
    return layer_clip_mask((width, height), mask, feather_scale=height / 720)


def validate_layer_order(plan, overlay_ids, motion_ids, three_d_ids, *, source_overlays=None):
    """An explicit canonical stack must name every graphic exactly once."""
    for layer in (plan or {}).get('layers') or []:
        validate_perspective_layer(layer, any(layer.get('id') in g.get('layerIds',[]) for g in (plan or {}).get('groups') or []))
        if layer.get('perspective') and source_overlays is not None:
            sources = [s if isinstance(s,dict) else s.model_dump() for s in source_overlays]
            source = next((s for s in sources if str(s.get('id')) == str(layer.get('id'))),None)
            if not source or source.get('type') not in ('image','video') or source.get('bRollMode') == 'fullscreen' or source.get('b_roll_mode') == 'fullscreen':
                raise ValueError('Perspective needs an ordinary inset image/video source')
        validate_text_animation_layer(layer)
        if layer.get("text_animator") is not None and source_overlays is not None:
            try:
                from .studio_text_animator import text_layout
            except ImportError:
                from studio_text_animator import text_layout
            sources = [s if isinstance(s, dict) else s.model_dump() for s in source_overlays]
            source = next((s for s in sources if str(s.get("id")) == str(layer.get("id"))), None)
            if not source or source.get("type") != "text" or source.get("bRollMode") or source.get("b_roll_mode") or source.get("isCaption"):
                raise ValueError("Text animators need an ordinary title source")
            text_layout(source, 1280, layer["text_animator"])
        validate_vector_trim(layer)
        if 'vector_shape' in layer:
            if layer.get('type') != 'image':
                raise ValueError('Vector artwork needs an image layer')
            validate_vector_shape(layer['vector_shape'])
    if "order" not in (plan or {}):
        return None
    order = plan["order"]
    known = list(overlay_ids) + list(motion_ids) + list(three_d_ids)
    if (not isinstance(order, list) or len(order) > 2000
            or any(not isinstance(item, str) or not item for item in order)
            or len(set(order)) != len(order) or len(set(known)) != len(known)
            or set(order) != set(known)):
        raise ValueError("Composition order must name every graphic layer exactly once")
    return order


def connect_layer_blocks(blocks, base_label, order):
    """Reconnect prepared ordinary/motion/owned-3D blocks on one backdrop."""
    rank = {layer_id: index for index, layer_id in enumerate(order)}
    if any(item[0] not in rank for item in blocks):
        raise ValueError("Rendered layer is missing from the composition order")
    filters, current = [], base_label
    for layer_id, block, previous_input, output in sorted(blocks, key=lambda item: rank[item[0]]):
        filters.extend(part.replace(f"[{previous_input}]", f"[{current}]") for part in block)
        current = output
    return filters, current


def validate_graphic_groups(plan, order):
    """Reject unsupported decisions before downloads or rendering."""
    groups = (plan or {}).get("groups", [])
    if not isinstance(groups, list) or len(groups) > 64:
        raise ValueError("Composition supports at most 64 graphic groups")
    if not groups:
        return {}, [], {}
    if order is None:
        raise ValueError("Graphic groups need an explicit canonical layer order")
    by_id, parent, rank, key_ids = {}, {}, {identity: index for index, identity in enumerate(order)}, set()
    for group in groups:
        if (not isinstance(group, dict) or set(group) - {"id", "name", "kind", "layerIds", "transform", "motion_keyframes", "mask", "blendMode", "timing"}
                or group.get("kind") != "graphic_group"):
            raise ValueError("Graphic groups support membership, transforms, keys, masks and blending only")
        if group.get("blendMode", "normal") not in BLEND_MODES:
            raise ValueError("Unsupported group blend mode")
        if "mask" in group:
            validate_group_mask(group["mask"])
        if "timing" in group:
            timing = group["timing"]
            if (not isinstance(timing, dict) or set(timing) != {"startTime", "duration"}
                    or any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
                           or value < 0 for value in timing.values())):
                raise ValueError("Group timing needs a finite non-negative programme start and duration")
        identity, children = group.get("id"), group.get("layerIds")
        if (not isinstance(identity, str) or not identity or identity in by_id or identity in rank
                or not isinstance(children, list) or not children
                or any(not isinstance(child, str) or not child for child in children)
                or len(set(children)) != len(children)):
            raise ValueError("Group membership needs unique IDs and at least one child")
        raw = group.get("transform", {})
        if not isinstance(raw, dict) or set(raw) - set(GROUP_TRANSFORM):
            raise ValueError("Group transforms support static position, scale, rotation and opacity")
        transform = {**GROUP_TRANSFORM, **raw}
        for field, (low, high) in GROUP_BOUNDS.items():
            value = transform[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
                raise ValueError(f"Group {field} must be between {low} and {high}")
        keys, times = group.get("motion_keyframes", []), set()
        if not isinstance(keys, list) or len(keys) > 256:
            raise ValueError("A graphic group supports at most 256 transform keys")
        for key in keys:
            if not isinstance(key, dict) or set(key) - {"id", "property", "time", "value", "easing", "curve", "spatialCurve"}:
                raise ValueError("Unsupported group transform key fields")
            validate_spatial_curve(key)
            identity_key, property_name, time, value = key.get("id"), key.get("property"), key.get("time"), key.get("value")
            if (not isinstance(identity_key, str) or not identity_key or identity_key in key_ids or property_name not in GROUP_BOUNDS
                    or isinstance(time, bool) or not isinstance(time, (int, float)) or not math.isfinite(time) or time < 0
                    or isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
                    or not GROUP_BOUNDS[property_name][0] <= value <= GROUP_BOUNDS[property_name][1]):
                raise ValueError("Group keys need unique IDs, a supported property, finite time and an in-range value")
            if (property_name, time) in times:
                raise ValueError("A group property needs one key at each time")
            if key.get("easing", "linear") not in {"linear", "hold", "ease_in", "ease_out", "ease_in_out", "bezier"}:
                raise ValueError("Unsupported group key easing")
            if "curve" in key:
                curve = key["curve"]
                if (not isinstance(curve, list) or len(curve) != 4 or any(isinstance(v, bool)
                        or not isinstance(v, (int, float)) or not math.isfinite(v)
                        or not (-2 if i % 2 else 0) <= v <= (2 if i % 2 else 1) for i, v in enumerate(curve))):
                    raise ValueError("Group Bézier keys need four valid time/value handles")
            times.add((property_name, time)); key_ids.add(identity_key)
        by_id[identity] = {**group, "transform": transform}
    for identity, group in by_id.items():
        for child in group["layerIds"]:
            if (child not in rank and child not in by_id) or child in parent:
                raise ValueError("Each group child needs one existing parent")
            parent[child] = identity

    def leaves(identity, seen=()):
        if identity not in by_id:
            return [identity]
        if identity in seen or len(seen) >= 8:
            raise ValueError("Group nesting must be acyclic and at most 8 levels")
        return [leaf for child in by_id[identity]["layerIds"] for leaf in leaves(child, (*seen, identity))]

    for identity in by_id:
        positions = [rank[leaf] for leaf in leaves(identity)]
        if positions != list(range(positions[0], positions[0] + len(positions))):
            raise ValueError("Group children must keep a contiguous layer order")
    roots = [identity for identity in [*order, *by_id] if identity not in parent]
    roots.sort(key=lambda identity: rank[leaves(identity)[0]])
    return by_id, roots, parent


def animated_group_filter(group, input_label, prefix, width, height, duration, speed_plan, fps):
    """Animate the assembled canvas using the shared key and programme clocks."""
    keys, base = group["motion_keyframes"], group["transform"]
    clock = output_to_programme_expression(speed_plan)
    property_keys = {field: [key for key in keys if key["property"] == field] for field in GROUP_BOUNDS}
    expressions = {field: re.sub(r"\bt\b", f"({clock})", automation_expression(property_keys[field], base[field])) for field in GROUP_BOUNDS}
    expressions = {field: f"max({low},min({high},{expressions[field]}))" for field, (low, high) in GROUP_BOUNDS.items()}
    def bounds(field):
        selected = property_keys[field]
        fallback = min(selected, key=lambda key: key["time"])["value"] if selected else base[field]
        low, high = _curve_bounds(selected, fallback)
        minimum, maximum = GROUP_BOUNDS[field]
        return max(minimum, min(maximum, low)), max(minimum, min(maximum, high))
    scale = bounds("scale")[1]
    # An invariant transparent surface preserves the full scaled children and
    # avoids downstream filters retaining the initial scale dimensions.
    low, high = map(math.radians, bounds("rotation"))
    angles = [low, high]
    # Bound both projected axes over the actual angle interval. Constant keys
    # do not require a diagonal square or retain an unused pre-key base pose.
    for optimum in (math.atan2(height, width), math.atan2(width, height)):
        for turn in range(-2, 3):
            for sign in (-1, 1):
                angle = turn*math.pi + sign*optimum
                if low <= angle <= high:
                    angles.append(angle)
    rotated_w = max(abs(math.cos(angle))*width + abs(math.sin(angle))*height for angle in angles)*scale
    rotated_h = max(abs(math.sin(angle))*width + abs(math.cos(angle))*height for angle in angles)*scale
    canvas_w = math.ceil((max(width*scale, rotated_w)+2)/2)*2
    canvas_h = math.ceil((max(height*scale, rotated_h)+2)/2)*2
    if canvas_w*canvas_h > 4096*2160:
        raise ValueError("Group transform exceeds the 4K intermediate budget; reduce group scale or export resolution")
    transform = (f"format=gbrap,premultiply=inplace=1,scale=w='max(1,round({width}*({expressions['scale']})))':"
                 f"h='max(1,round({height}*({expressions['scale']})))':eval=frame:flags=lanczos,"
                 f"pad={canvas_w}:{canvas_h}:x=(ow-iw)/2:y=(oh-ih)/2:eval=frame:color=black@0,"
                 f"rotate=angle='PI/180*({expressions['rotation']})':ow={canvas_w}:oh={canvas_h}:c=black@0,"
                 "unpremultiply=inplace=1,format=rgba,setsar=1")
    rgba = f"{prefix}_rgba"
    if property_keys["opacity"] and bounds("opacity")[0] != bounds("opacity")[1]:
        opacity = re.sub(r"\bt\b", "T", expressions["opacity"])
        # Evaluate the curve on four pixels, then multiply the existing alpha.
        # All children overlap before this one group fade; RGB is retained.
        filters = [f"[{input_label}]{transform},split=2[{prefix}_color][{prefix}_ain];",
                   f"[{prefix}_ain]alphaextract[{prefix}_alpha];",
                   f"color=c=white:s=2x2:r={fps:.9f}:d={duration:.9f},format=gray,"
                   f"geq=lum='255*({opacity})',scale={canvas_w}:{canvas_h}:flags=neighbor[{prefix}_weight];",
                   f"[{prefix}_alpha][{prefix}_weight]blend=all_mode=multiply[{prefix}_af];",
                   f"[{prefix}_color][{prefix}_af]alphamerge[{rgba}];"]
    else:
        filters = [f"[{input_label}]{transform},colorchannelmixer=aa={bounds('opacity')[0]:.9f}[{rgba}];"]
    x = f"{(width-canvas_w)/2:.9f}+{width}*({expressions['x']})/100"
    y = f"{(height-canvas_h)/2:.9f}+{height}*({expressions['y']})/100"
    return filters, rgba, x, y


def connect_grouped_layer_blocks(blocks, base_label, order, plan, width, height, duration, speed_plan=None, frame_rate=30, mask_inputs=None):
    """Reuse each prepared leaf; compose/clip groups before parent transforms."""
    by_id, roots, _ = validate_graphic_groups(plan, order)
    if not by_id:
        return connect_layer_blocks(blocks, base_label, order)
    if width <= 0 or height <= 0 or duration <= 0:
        raise ValueError("Invalid group canvas geometry")
    animated = any(group.get("motion_keyframes") or group.get("timing") for group in by_id.values())
    fps = float(frame_rate) if animated else 30.0
    if not math.isfinite(fps) or not 1 <= fps <= 120:
        raise ValueError("Invalid group animation frame rate")
    prepared = {item[0]: item for item in blocks}
    if len(prepared) != len(blocks) or any(identity not in order for identity in prepared):
        raise ValueError("Rendered group leaf is missing or duplicated in the composition order")
    filters, counter = [], 0

    def draw(identity, backdrop):
        nonlocal counter
        if identity not in by_id:
            if identity not in prepared:  # Disabled/out-of-programme leaves.
                return backdrop
            _, block, previous, output = prepared[identity]
            filters.extend(part.replace(f"[{previous}]", f"[{backdrop}]") for part in block)
            return output
        group, prefix = by_id[identity], f"studio_group_{counter}"
        counter += 1
        t = group["transform"]
        scaled_w, scaled_h = max(1, round(width*t["scale"])), max(1, round(height*t["scale"]))
        angle = math.radians(t["rotation"])
        rotated_w = max(1, math.ceil(abs(math.cos(angle))*scaled_w + abs(math.sin(angle))*scaled_h - 1e-9))
        rotated_h = max(1, math.ceil(abs(math.sin(angle))*scaled_w + abs(math.cos(angle))*scaled_h - 1e-9))
        if rotated_w * rotated_h > 4096 * 2160:
            raise ValueError("Group transform exceeds the 4K intermediate budget; reduce group scale or export resolution")
        local = f"{prefix}_canvas"
        filters.append(f"color=c=black:s={int(width)}x{int(height)}:r={fps:.9f}:d={float(duration):.6f},"
                       f"format=rgba,colorchannelmixer=aa=0[{local}];")
        for child in group["layerIds"]:
            local = draw(child, local)
        if group.get("mask", {}).get("enabled"):
            matte = (mask_inputs or {}).get(identity)
            if not matte or not re.fullmatch(r"[A-Za-z0-9_:]+", matte):
                raise ValueError("Enabled group masks need a prepared local matte input")
            filters.extend([
                f"[{local}]format=rgba,split=2[{prefix}_color][{prefix}_alpha_in];",
                f"[{prefix}_alpha_in]alphaextract[{prefix}_alpha];",
                f"[{matte}]format=gray,setsar=1[{prefix}_mask];",
                f"[{prefix}_alpha][{prefix}_mask]blend=all_mode=multiply[{prefix}_masked_alpha];",
                f"[{prefix}_color][{prefix}_masked_alpha]alphamerge[{prefix}_masked];",
            ])
            local = f"{prefix}_masked"
        def composite(block, output):
            filters.extend(blend_layer_block(block, backdrop, output, group.get("blendMode", "normal"),
                                            width, height, duration, f"{prefix}_blend", frame_rate=fps))
            return output
        timing = group.get("timing")
        gate = ""
        if timing is not None:
            clock = output_to_programme_expression(speed_plan)
            gate = f":enable='gte(({clock}),{timing['startTime']:.9f})*lt(({clock}),{timing['startTime'] + timing['duration']:.9f})'"
        if group.get("motion_keyframes"):
            block, rgba, x, y = animated_group_filter(group, local, prefix, width, height, duration, speed_plan, fps)
            filters.extend(block)
            output = f"{prefix}_out"
            return composite([f"[{backdrop}][{rgba}]overlay=x='{x}':y='{y}':format=auto:eof_action=pass:repeatlast=0{gate}[{output}];"], output)
        # Premultiplied interpolation avoids dark RGB fringes on transparency.
        transform = "format=gbrap,premultiply=inplace=1"
        if t["scale"] != 1:
            transform += f",scale={scaled_w}:{scaled_h}:flags=lanczos"
        if t["rotation"] != 0:
            transform += f",rotate={angle:.12f}:ow={rotated_w}:oh={rotated_h}:c=black@0"
        transform += f",unpremultiply=inplace=1,format=rgba,colorchannelmixer=aa={t['opacity']:.9f}"
        filters.append(f"[{local}]{transform}[{prefix}_rgba];")
        x, y = (width-rotated_w)/2 + width*t["x"]/100, (height-rotated_h)/2 + height*t["y"]/100
        output = f"{prefix}_out"
        return composite([f"[{backdrop}][{prefix}_rgba]overlay=x={x:.9f}:y={y:.9f}:format=auto:"
                          f"eof_action=pass:repeatlast=0{gate}[{output}];"], output)

    current = base_label
    for identity in roots:
        current = draw(identity, current)
    if len(''.join(filters)) > 96000:
        raise ValueError("Group animation filter graph is too large; simplify transform keys or curves")
    return filters, current


def luminosity_filter(width, window=None):
    # Nonseparable CSS luminosity = SetLum(backdrop, Lum(foreground)), including
    # ClipColor for out-of-gamut values. Read both RGB pictures in one geq input.
    lum = lambda x: f"(0.3*r({x},Y)+0.59*g({x},Y)+0.11*b({x},Y))"
    difference = f"({lum(f'X+{int(width)}')}-{lum('X')})"
    expression = []
    for channel in ('r', 'g', 'b'):
        registers = f"st(0,{lum(f'X+{int(width)}')});st(1,r(X,Y)+{difference});st(2,g(X,Y)+{difference});st(3,b(X,Y)+{difference});st(4,min(ld(1),min(ld(2),ld(3))));"
        registers += ";".join(f"st({index},if(lt(ld(4),0),ld(0)+(ld({index})-ld(0))*ld(0)/(ld(0)-ld(4)),ld({index})))" for index in (1,2,3)) + ";"
        registers += "st(5,max(ld(1),max(ld(2),ld(3))));"
        value = {'r':1, 'g':2, 'b':3}[channel]
        registers += f"if(gt(ld(5),255),ld(0)+(ld({value})-ld(0))*(255-ld(0))/(ld(5)-ld(0)),ld({value}))"
        if window:
            registers = f"if(between(T,{window[0]:.3f},{window[1]:.3f}),{registers},{channel}(X,Y))"
        expression.append(f"{channel}='{registers}'")
    return "hstack=inputs=2,geq=" + ":".join(expression) + f",crop={int(width)}:ih:0:0"


def rgb_blend_filter(mode):
    if mode == "hard-light":
        return "blend=all_mode=hardlight"
    # FFmpeg's built-in softlight and dodge differ from CSS compositing.
    # A is the backdrop; B is the foreground, both in 0..255 RGB.
    if mode == "color-dodge":
        return "blend=all_expr='if(eq(A,0),0,if(eq(B,255),255,min(255,A*255/(255-B))))'"
    if mode == "soft-light":
        d = "if(lte(A,63.75),((16*A/255-12)*A/255+4)*A,sqrt(A*255))"
        return f"blend=all_expr='if(lte(B,127.5),A-(255-2*B)*A*(255-A)/65025,A+(2*B-255)*({d}-A)/255)'"
    return f"blend=all_mode={mode}"


def blend_layer_block(block, input_label, output_label, mode, width, height, duration, prefix, time_window=None, frame_rate=30):
    mode = str(mode or "normal")
    if mode not in BLEND_MODES:
        raise ValueError(f"Studio blend mode {mode!r} is not implemented for export")
    if mode == "normal":
        return list(block)
    if not block or width <= 0 or height <= 0 or duration <= 0:
        raise ValueError("Invalid Studio blend layer geometry")
    if time_window is not None and (len(time_window) != 2 or
            not all(math.isfinite(value) for value in time_window) or time_window[1] <= time_window[0]):
        raise ValueError("Invalid Studio blend time window")
    blend_filter = luminosity_filter(width, time_window) if mode == 'luminosity' else rgb_blend_filter(mode)
    if time_window and mode != 'luminosity':
        blend_filter += f":enable='between(t,{time_window[0]:.3f},{time_window[1]:.3f})'"
    names = {name: f"{prefix}_{name}" for name in
             ["blank", "foreground", "color", "alpha_in", "alpha", "base", "base_color", "base_alpha_in", "base_alpha",
              "base_rgb", "keep", "rgb", "front_rgb", "front_opaque", "blended", "weighted", "effective", "effective_rgb", "rgba"]}
    # Draw this same ordinary layer block on a transparent canvas. Keep its
    # own timing, geometry, motion, masks and opacity; do not blend in YUV or
    # let the mode modify the layer alpha.
    result = [f"[{input_label}]split=2[{names['keep']}][{names['base']}];",
              f"color=c=black:s={int(width)}x{int(height)}:r={float(frame_rate):.9f}:d={float(duration):.6f},"
              f"format=rgba,colorchannelmixer=aa=0[{names['blank']}];"]
    result.extend(part.replace(f"[{input_label}]", f"[{names['blank']}]")
                  .replace(f"[{output_label}]", f"[{names['foreground']}]") for part in block)
    result.extend([
        f"[{names['foreground']}]format=rgba,split=2[{names['color']}][{names['alpha_in']}];",
        f"[{names['alpha_in']}]alphaextract[{names['alpha']}];",
        f"[{names['base']}]format=rgba,split=2[{names['base_color']}][{names['base_alpha_in']}];",
        f"[{names['base_alpha_in']}]alphaextract[{names['base_alpha']}];",
        f"[{names['base_color']}]format=gbrp[{names['base_rgb']}];",
        f"[{names['color']}]format=gbrp,split=2[{names['rgb']}][{names['front_rgb']}];",
        f"[{names['base_rgb']}][{names['rgb']}]{blend_filter}[{names['blended']}];",
        # CSS blend color is (1-backdropAlpha)*foreground + backdropAlpha*blend.
        # A transparent isolated parent must not turn Multiply children black.
        f"[{names['blended']}][{names['base_alpha']}]alphamerge[{names['weighted']}];",
        f"[{names['front_rgb']}]format=rgba[{names['front_opaque']}];",
        f"[{names['front_opaque']}][{names['weighted']}]overlay=0:0:format=auto:eof_action=pass:repeatlast=0[{names['effective']}];",
        f"[{names['effective']}]format=gbrp[{names['effective_rgb']}];",
        f"[{names['effective_rgb']}][{names['alpha']}]alphamerge[{names['rgba']}];",
        f"[{names['keep']}][{names['rgba']}]overlay=0:0:eof_action=pass:repeatlast=0:format=auto[{output_label}];",
    ])
    return result
