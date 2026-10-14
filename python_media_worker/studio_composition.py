"""Deterministic RGB/alpha composition for the canonical Studio stack."""
import math

BLEND_MODES = {"normal", "multiply", "screen", "difference", "overlay", "hard-light", "soft-light", "color-dodge", "luminosity"}
GROUP_TRANSFORM = {"x": 0, "y": 0, "scale": 1, "rotation": 0, "opacity": 1}
GROUP_BOUNDS = {"x": (-100, 100), "y": (-100, 100), "scale": (.1, 2), "rotation": (-180, 180), "opacity": (0, 1)}


def validate_layer_order(plan, overlay_ids, motion_ids, three_d_ids):
    """An explicit canonical stack must name every graphic exactly once."""
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
    """Reject unknown/static-only decisions before downloads or rendering."""
    groups = (plan or {}).get("groups", [])
    if not isinstance(groups, list) or len(groups) > 64:
        raise ValueError("Composition supports at most 64 graphic groups")
    if not groups:
        return {}, [], {}
    if order is None:
        raise ValueError("Graphic groups need an explicit canonical layer order")
    by_id, parent, rank = {}, {}, {identity: index for index, identity in enumerate(order)}
    for group in groups:
        if (not isinstance(group, dict) or set(group) - {"id", "name", "kind", "layerIds", "transform"}
                or group.get("kind") != "graphic_group"):
            raise ValueError("Graphic groups support membership and static transforms only")
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
        by_id[identity] = {**group, "transform": transform}
    for identity, group in by_id.items():
        for child in group["layerIds"]:
            if (child not in rank and child not in by_id) or child in parent:
                raise ValueError("Each group child needs one existing parent")
            parent[child] = identity
    for layer in (plan or {}).get("layers") or []:
        if layer.get("id") in parent and layer.get("blend_mode", "normal") != "normal":
            raise ValueError("Grouped layers currently export with Normal blend; set the child blend to Normal")

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


def connect_grouped_layer_blocks(blocks, base_label, order, plan, width, height, duration):
    """Reuse each prepared leaf; compose/clip groups before parent transforms."""
    by_id, roots, _ = validate_graphic_groups(plan, order)
    if not by_id:
        return connect_layer_blocks(blocks, base_label, order)
    if width <= 0 or height <= 0 or duration <= 0:
        raise ValueError("Invalid group canvas geometry")
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
        filters.append(f"color=c=black:s={int(width)}x{int(height)}:r=30:d={float(duration):.6f},"
                       f"format=rgba,colorchannelmixer=aa=0[{local}];")
        for child in group["layerIds"]:
            local = draw(child, local)
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
        filters.append(f"[{backdrop}][{prefix}_rgba]overlay=x={x:.9f}:y={y:.9f}:format=auto:"
                       f"eof_action=pass:repeatlast=0[{output}];")
        return output

    current = base_label
    for identity in roots:
        current = draw(identity, current)
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


def blend_layer_block(block, input_label, output_label, mode, width, height, duration, prefix, time_window=None):
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
             ["blank", "foreground", "color", "alpha_in", "alpha", "base", "base_rgb", "keep", "rgb", "blended", "rgba"]}
    # Draw this same ordinary layer block on a transparent canvas. Keep its
    # own timing, geometry, motion, masks and opacity; do not blend in YUV or
    # let the mode modify the layer alpha.
    result = [f"[{input_label}]split=2[{names['keep']}][{names['base']}];",
              f"color=c=black:s={int(width)}x{int(height)}:r=30:d={float(duration):.6f},"
              f"format=rgba,colorchannelmixer=aa=0[{names['blank']}];"]
    result.extend(part.replace(f"[{input_label}]", f"[{names['blank']}]")
                  .replace(f"[{output_label}]", f"[{names['foreground']}]") for part in block)
    result.extend([
        f"[{names['foreground']}]format=rgba,split=2[{names['color']}][{names['alpha_in']}];",
        f"[{names['alpha_in']}]alphaextract[{names['alpha']}];",
        f"[{names['base']}]format=gbrp[{names['base_rgb']}];",
        f"[{names['color']}]format=gbrp[{names['rgb']}];",
        f"[{names['base_rgb']}][{names['rgb']}]{blend_filter}[{names['blended']}];",
        f"[{names['blended']}][{names['alpha']}]alphamerge[{names['rgba']}];",
        f"[{names['keep']}][{names['rgba']}]overlay=0:0:eof_action=pass:repeatlast=0:format=auto[{output_label}];",
    ])
    return result
