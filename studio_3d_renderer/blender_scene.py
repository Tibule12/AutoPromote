"""Headless Blender scene builder. Invoked with validated files, never user code."""
import json
import math
import os
import sys

import bpy


def rgba(value, alpha=1):
    value = value.lstrip("#")
    channels = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(channel / 12.92 if channel <= .04045 else ((channel + .055) / 1.055) ** 2.4 for channel in channels) + (alpha,)


def material(name, scene):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba(scene["primaryColor"])
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba(scene["primaryColor"])
    style = scene["material"]
    bsdf.inputs["Metallic"].default_value = {"chrome": 1, "gold": .85, "holographic": .7, "glass": .1, "neon": .08}.get(style, .15)
    bsdf.inputs["Roughness"].default_value = {"chrome": .16, "gold": .21, "glass": .08, "neon": .4, "holographic": .18}.get(style, .7)
    if style == "glass":
        bsdf.inputs["Transmission Weight"].default_value = .38
    if style == "neon":
        bsdf.inputs["Emission Color"].default_value = rgba(scene["glowColor"])
        bsdf.inputs["Emission Strength"].default_value = .28 + scene["bloom"] * .36
    return mat


def simple_material(name, color, metallic=0, roughness=.4, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba(color)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba(color)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = rgba(color)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def text_object(value, size, mat, parent, scene, y=0):
    curve = bpy.data.curves.new("Extruded title", "FONT")
    curve.body = value or " "
    curve.size = size
    curve.extrude = scene["extrusionDepth"] / 2
    curve.bevel_depth = scene["bevel"]
    curve.bevel_resolution = 2
    curve.align_x = scene.get("textAlign", "center").upper()
    curve.align_y = "CENTER"
    obj = bpy.data.objects.new(value[:30] or "Text", curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = (0, y, .18)
    obj.data.materials.append(mat)
    bpy.context.view_layer.update()
    if obj.dimensions.x > 8:
        obj.scale.x = 8 / obj.dimensions.x
    return obj


def cube(name, location, scale, mat, parent):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    obj.dimensions = scale
    obj.data.materials.append(mat)
    return obj


def setup_scene(spec, asset_file=None):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    s = spec["scene"]
    world = bpy.context.scene
    try:
        world.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        world.render.engine = "BLENDER_EEVEE"
    world.render.resolution_x = spec["width"]
    world.render.resolution_y = spec["height"]
    world.render.resolution_percentage = 100
    world.render.film_transparent = True
    world.render.image_settings.file_format = "PNG"
    world.render.image_settings.color_mode = "RGBA"
    world.render.fps = spec["fps"]
    world.render.image_settings.color_depth = "8"
    world.render.film_transparent = True
    world.world.color = (.02, .025, .06)
    try:
        world.view_settings.view_transform = "AgX"
    except TypeError:
        pass

    root = bpy.data.objects.new("3D timeline object", None)
    bpy.context.collection.objects.link(root)
    main = material("Creator material", s)
    sub = simple_material("Supporting text", s["secondaryColor"], roughness=.65)
    accent = simple_material("Glow accents", s["glowColor"], emission=.65 + s["bloom"] * .4)
    plate = simple_material("Dark glass plate", "#090d1c", metallic=.12, roughness=.42)
    title = text_object(s["text"], .78 if len(s["text"]) <= 13 else .52, main, root, s, .05 if s["secondary"] else -.35)
    title.name = "Main wordmark"
    subtitle = None
    if s["secondary"]:
        subtitle = text_object(s["secondary"], .28, sub, root, s, -.7 * s["lineSpacing"])
        subtitle.name = "Supporting line"
    template = s["template"]
    aspect = spec["width"] / spec["height"]
    if template == "neon_logo":
        # Split the wordmark into two independently staged pieces. It gives the
        # logo a recognisable editorial reveal instead of treating the brand as
        # one generic extruded text object.
        title.data.body = "Auto"
        title.data.align_x = "LEFT"
        title.location.x = -2.75 if aspect < 1 else -2.55
        title.data.materials.clear()
        title.data.materials.append(simple_material("Auto pearl", "#f7f8ff", metallic=.38, roughness=.2))
        promote = text_object("Promote", title.data.size, main, root, s, title.location.y)
        promote.name = "Promote wordmark"
        promote.data.align_x = "LEFT"
        promote.location.x = -.78 if aspect < 1 else -.55
        mark = bpy.data.objects.new("AutoPromote dimensional A mark", None)
        bpy.context.collection.objects.link(mark)
        mark.parent = root
        mark.location = (0, 2.25, .18) if aspect < 1 else (-3.42, 0, .18)
        mark.scale = (1.38,) * 3 if aspect < 1 else (.88,) * 3
        mark_base = simple_material("Signature violet tile", "#36136f", metallic=.3, roughness=.28)
        mark_white = simple_material("Signature A beams", "#f6f2ff", roughness=.25, emission=.12)
        cube("Signature tile", (0, 0, -.08), (1.35, 1.35, .18), mark_base, mark)
        left = cube("A left beam", (-.19, 0, .06), (.13, .8, .13), mark_white, mark)
        left.rotation_euler.z = -.43
        right = cube("A right beam", (.19, 0, .06), (.13, .8, .13), mark_white, mark)
        right.rotation_euler.z = .43
        cube("A crossbar", (0, -.14, .07), (.55, .12, .12), accent, mark)
        cube("Promotion spark", (.52, .47, .08), (.11, .11, .11), accent, mark)
        # Controlled glints converge on the mark during the opening beat.
        for i in range(12):
            angle = i * math.tau / 12
            glint = cube(
                f"Brand glint {i:02d}",
                (math.cos(angle) * (1.1 + (i % 3) * .18), math.sin(angle) * (1.1 + (i % 2) * .15), -.02),
                (.035 + (i % 2) * .025, .035 + ((i + 1) % 2) * .025, .04),
                accent, mark,
            )
            glint.rotation_euler.z = angle
    if template in {"neon_logo", "floating_callout", "speaker_intro", "comparison_card"}:
        hero_plate = cube("Bevelled hero plate", (0, 0, -.34), (8.2, 3.3 if template == "comparison_card" else 2.35, .12), plate, root)
        top_edge = cube("Top accent edge", (0, 1.17, -.25), (7.8, .022, .025), accent, root)
    if template in {"cinematic_title", "speaker_intro", "comparison_card"}:
        cube("Light underline", (0, -.8, .1), (5.2, .035, .035), accent, root)
    if template in {"neon_logo", "audio_reactive_text"}:
        bpy.ops.mesh.primitive_torus_add(major_radius=2.02, minor_radius=.022, location=(0, 0, -.65))
        ring = bpy.context.object
        ring.name = "Neon orbit"
        ring.parent = root
        ring.data.materials.append(accent)
    if template in {"chrome_lyric", "impact_explosion"}:
        for i in range(9):
            angle = i * math.tau / 9
            ray = cube("Impact ray", (math.cos(angle) * 4.4, math.sin(angle) * 2.1, -.55), (.035, 1.4 + i % 3 * .42, .06), accent, root)
            ray.rotation_euler.z = -angle
    if asset_file:
        art_mat = bpy.data.materials.new("Uploaded logo/image")
        art_mat.use_nodes = True
        nodes = art_mat.node_tree.nodes
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(asset_file, check_existing=False)
        bsdf = nodes.get("Principled BSDF")
        art_mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        art_mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        bpy.ops.mesh.primitive_plane_add(size=1)
        art = bpy.context.object
        art.name = "Uploaded artwork"
        art.parent = root
        art.location = (0, 1.38, .18)
        art.dimensions = (1.8, 1.8, 0)
        art.data.materials.append(art_mat)

    camera_distance = max(13, (8.5 / 2) / (math.tan(math.radians(43) / 2) * aspect) * 1.17)
    bpy.ops.object.camera_add(location=(0, 0, camera_distance))
    camera = bpy.context.object
    camera.rotation_euler = (0, 0, 0)
    world.camera = camera
    camera.data.type = "PERSP"
    camera.data.lens = s["focalLength"]
    bpy.ops.object.light_add(type="AREA", location=(-3, 5, 8))
    key = bpy.context.object
    key.name = "Softbox key"
    key.data.energy = 420 * s["lightIntensity"] / 2.2
    key.data.color = rgba(s["lightColor"])[:3]
    key.data.shape = "DISK"
    key.data.size = 6
    bpy.ops.object.light_add(type="AREA", location=(4, -2, 4))
    rim = bpy.context.object
    rim.name = "Cool rim"
    rim.data.energy = 360
    rim.data.color = (.52, .63, 1)
    rim.data.size = 4
    if s["bloom"] > .05:
        world.use_nodes = True
        nodes = world.node_tree.nodes
        nodes.clear()
        render = nodes.new("CompositorNodeRLayers")
        glare = nodes.new("CompositorNodeGlare")
        glare.glare_type = "FOG_GLOW"
        glare.quality = "MEDIUM"
        glare.threshold = max(1.1, 2.3 - s["bloom"])
        output = nodes.new("CompositorNodeComposite")
        world.node_tree.links.new(render.outputs["Image"], glare.inputs["Image"])
        world.node_tree.links.new(glare.outputs["Image"], output.inputs["Image"])
    animated = {
        "title": title,
        "subtitle": subtitle,
        "promote": locals().get("promote"),
        "mark": locals().get("mark"),
        "plate": locals().get("hero_plate"),
        "edge": locals().get("top_edge"),
        "ring": locals().get("ring"),
    }
    for obj in [item for item in animated.values() if item]:
        obj["base_location"] = list(obj.location)
        obj["base_scale"] = list(obj.scale)
    if animated["mark"]:
        for child in animated["mark"].children:
            child["base_location"] = list(child.location)
            child["base_scale"] = list(child.scale)
    return world, root, camera, animated


def clamp01(value):
    return max(0, min(1, value))


def smooth(value):
    value = clamp01(value)
    return value * value * (3 - 2 * value)


def overshoot(value):
    value = clamp01(value)
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (value - 1) ** 3 + c1 * (value - 1) ** 2


KEYFRAME_FIELDS = ("x", "y", "z", "scale", "rotationX", "rotationY", "rotationZ")


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


def animate_logo(animated, local, duration):
    mark = animated.get("mark")
    if not mark:
        return
    mark_p = overshoot(local / .72)
    mark_base = mark["base_scale"]
    mark.scale = tuple(value * max(.001, mark_p) for value in mark_base)
    mark.rotation_euler.y = math.radians((1 - smooth(local / .7)) * -72)
    mark.rotation_euler.z = math.radians((1 - smooth(local / .6)) * 8)
    for child in mark.children:
        base_scale = child["base_scale"]
        base_location = child["base_location"]
        if child.name.startswith("Brand glint"):
            index = int(child.name.rsplit(" ", 1)[-1])
            burst = smooth((local - .12 - index * .018) / .45) * (1 - smooth((local - .8) / .6))
            travel = 1.45 - .55 * smooth(local / .75)
            child.location = (base_location[0] * travel, base_location[1] * travel, base_location[2])
            child.scale = tuple(value * max(.001, burst) for value in base_scale)
        elif child.name in {"A left beam", "A right beam", "A crossbar"}:
            beam = overshoot((local - .18) / .48)
            child.scale = (base_scale[0], base_scale[1] * max(.001, beam), base_scale[2])
        elif child.name == "Promotion spark":
            spark = overshoot((local - .52) / .38)
            child.scale = tuple(value * max(.001, spark) for value in base_scale)

    plate_p = smooth((local - .32) / .66)
    for key in ("plate", "edge"):
        obj = animated.get(key)
        if obj:
            base = obj["base_scale"]
            obj.scale = (base[0] * max(.001, plate_p), base[1], base[2])

    for key, delay, direction in (("title", .62, -1), ("promote", .75, 1)):
        obj = animated.get(key)
        if obj:
            progress = overshoot((local - delay) / .62)
            base = obj["base_location"]
            obj.location.x = base[0] + direction * (1 - smooth((local - delay) / .55)) * .72
            obj.location.z = base[2] + (1 - smooth((local - delay) / .55)) * .8
            original = obj["base_scale"]
            obj.scale = (original[0] * max(.001, progress), original[1], original[2])

    subtitle = animated.get("subtitle")
    if subtitle:
        progress = smooth((local - 1.05) / .55)
        original = subtitle["base_scale"]
        subtitle.scale = (original[0] * max(.001, progress), original[1], original[2])
        subtitle.location.y = subtitle["base_location"][1] - (1 - progress) * .22

    ring = animated.get("ring")
    if ring:
        progress = overshoot((local - .5) / .9)
        original = ring["base_scale"]
        ring.scale = tuple(value * max(.001, progress) for value in original)
        ring.rotation_euler = (math.radians(68), local * .22, local * -.38)

    # A deliberate, clean exit—the verified alpha clip never freezes its last
    # frame over the programme.
    exit_progress = smooth((local - (duration - .62)) / .62)
    if exit_progress > 0:
        mark.rotation_euler.y += math.radians(exit_progress * 52)


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


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    if len(args) not in (2, 3):
        raise ValueError("Expected validated spec path, frame directory and optional asset path")
    with open(args[0], encoding="utf-8") as handle:
        spec = json.load(handle)
    out_dir = args[1]
    os.makedirs(out_dir, exist_ok=True)
    world, root, camera, animated = setup_scene(spec, args[2] if len(args) == 3 else None)
    frame_count = math.ceil(spec["duration"] * spec["fps"])
    for index in range(frame_count):
        current = pose(spec["scene"], index / spec["fps"])
        root.location = current["position"]
        root.scale = (current["scale"],) * 3
        root.rotation_euler = tuple(math.radians(angle) for angle in current["rotation"])
        if spec["scene"]["template"] == "neon_logo":
            animate_logo(animated, index / spec["fps"], spec["duration"])
        camera.location.x = math.sin(index / spec["fps"] * .6) * spec["scene"]["cameraMotion"] * .22
        world.render.filepath = os.path.join(out_dir, f"frame_{index:04d}.png")
        bpy.ops.render.render(write_still=True)
        print(json.dumps({"event": "frame", "current": index + 1, "total": frame_count}), flush=True)


if __name__ == "__main__":
    main()
