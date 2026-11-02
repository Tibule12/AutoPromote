"""Versioned evidence-stage builder. Data only; no uploaded Python or .blend input.

Blender 4.5 / Cycles CPU. Both preview and export execute this exact builder.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def linear_hex(value):
    values = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values) + (1,)


def material(name, color, roughness=.35, metallic=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = linear_hex(color)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        shader.inputs["Emission Color"].default_value = linear_hex(color)
        shader.inputs["Emission Strength"].default_value = emission
    return mat


def box(name, location, dimensions, mat, parent=None, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Machined edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        obj.modifiers.new("Weighted surface normals", "WEIGHTED_NORMAL")
    return obj


def text(name, body, location, size, mat, font, parent=None, align="LEFT"):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.size = size
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.space_character = 1.1
    curve.font = font
    curve.extrude = .0005
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    # Text local XY faces -Y in the stage's X/Z plane.
    obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.data.materials.append(mat)
    return obj


def movie_surface(node, paths, chassis, accent):
    root = bpy.data.objects.new(node["id"], None)
    bpy.context.collection.objects.link(root)
    root.location = node["position"]
    root.rotation_euler.z = math.radians(node["yaw"])
    width, height = node["width"], node["height"]
    box(node["id"] + " chassis", (0, .075, 0), (width + .14, .16, height + .14), chassis, root)
    box(node["id"] + " seam", (0, .025, 0), (width + .045, .025, height + .045), accent, root, .01)
    bpy.ops.mesh.primitive_plane_add(size=2)
    screen = bpy.context.object
    screen.name = node["id"] + " moving video"
    screen.parent = root
    screen.location = (0, -.016, 0)
    screen.rotation_euler.x = math.pi / 2
    screen.scale = (width / 2, height / 2, 1)
    mat = bpy.data.materials.new(node["id"] + " sequence display")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = .9 if node["id"] == "presenter" else .28
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(paths / "000001.png"))
    texture.image.source = "SEQUENCE"
    texture.image.colorspace_settings.name = "sRGB"
    texture.image_user.frame_start = 1
    texture.image_user.frame_duration = bpy.context.scene.frame_end
    texture.image_user.use_auto_refresh = True
    mat.node_tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    mat.node_tree.links.new(emission.outputs[0], output.inputs[0])
    screen.data.materials.append(mat)
    return root


def clock(parent, cx, reading, label, mats, font):
    white, amber, dark = mats
    # Real dial, geometry and hands, placed just in front of the evidence screen.
    bpy.ops.mesh.primitive_cylinder_add(vertices=80, radius=.325, depth=.018)
    dial = bpy.context.object
    dial.name = "Reconstructed " + label + " dial"
    dial.parent = parent
    dial.location = (cx, -.075, .02)
    dial.rotation_euler.x = math.pi / 2
    dial.data.materials.append(dark)
    for tick in range(60):
        angle = 2 * math.pi * tick / 60
        length = .045 if tick % 5 == 0 else .016
        radius = .302 - length / 2
        obj = box("Dial tick", (cx + math.sin(angle) * radius, -.09, .02 + math.cos(angle) * radius),
                  (.009 if tick % 5 == 0 else .004, .004, length), white, parent, 0)
        obj.rotation_euler.y = angle
    hours, minutes, seconds = map(int, reading.split(":"))
    for name, angle, length, width, mat in [
        ("Hour", (hours % 12 + minutes / 60) * math.pi / 6, .15, .022, white),
        ("Minute", (minutes + seconds / 60) * math.pi / 30, .23, .013, white),
        ("Second", seconds * math.pi / 30, .255, .006, amber),
    ]:
        obj = box(label + " " + name + " hand", (cx + math.sin(angle) * length / 2, -.105, .02 + math.cos(angle) * length / 2),
                  (width, .008, length), mat, parent, .002)
        obj.rotation_euler.y = angle
    text(label + " reading", reading, (cx, -.10, -.43), .19, white, font, parent, "CENTER")
    text(label + " label", label, (cx, -.10, .47), .075, amber, font, parent, "CENTER")


def smoother(value):
    value = max(0, min(1, value))
    return value ** 3 * (value * (value * 6 - 15) + 10)


def sample(keys, time):
    for left, right in zip(keys, keys[1:]):
        if time <= right["time"]:
            mix = smoother((time - left["time"]) / max(.0001, right["time"] - left["time"]))
            return tuple(Vector(left[field]).lerp(Vector(right[field]), mix) for field in ("position", "target"))
    return Vector(keys[-1]["position"]), Vector(keys[-1]["target"])


def podcast_stage(graph, work, font, chassis):
    """Physical set around an ordinary alpha-video surface; no fabricated person geometry."""
    warm = material("Walnut acoustic fins", graph["materials"]["chassis"]["color"], .5, .08)
    stone = material("Dark acoustic stone", "#192126", .78)
    bronze = material("Brushed bronze", "#9c7550", .3, .72)
    amber = material("Warm practical strips", "#ffb763", emission=3)
    blue = material("Cool practical strips", "#65bacb", emission=1.8)
    ivory = material("Editorial ivory", "#f6e8cf", emission=.9)
    box("Architectural acoustic wall", (0, 3.6, 3), (18, .25, 6), stone, bevel=0)
    for i in range(31):
        x = -6 + i * .4
        box("Walnut depth fin", (x, 2.75 + .12 * math.cos(i * .55), 2.7), (.12, .45, 5.4), warm, bevel=.02)
    # Set pieces are at distinct depths, so a moving perspective camera resolves
    # parallax and occlusion instead of simulating perspective with a flat panel.
    for x in [-3.25, 3.65]:
        box("Foreground architectural column", (x, -1.6, 2.6), (.24, .65, 5.2), warm)
        box("Column edge practical", (x - .1, -1.95, 2.6), (.025, .018, 4.9), amber, bevel=.004)
    for x in [-3.5, .15, 4.2]:
        box("Wall practical", (x, 2.4, 2.8), (.028, .025, 4.6), blue if x < 0 else amber, bevel=.004)
    box("Raised podcast platform", (-.8, .55, .06), (8.4, 4.6, .12), chassis, bevel=.07)
    box("Platform bronze reveal", (-.8, -1.77, .085), (8.4, .018, .025), amber, bevel=.003)
    content = next(node for node in graph["nodes"] if node["type"] == "podcast_typography")
    label = text("Dimensional show identity", content["brand"], (.65, 1.2, 3.05), .55, ivory, font)
    label.data.extrude = .035
    label.data.bevel_depth = .004
    text("Podcast context", "THE CONVERSATION CONTINUES", (.7, 1.19, 2.58), .12, ivory, font)
    cards = []
    words = [v.strip() for v in content["tagline"].split(".") if v.strip()]
    if not words:
        words = [content["tagline"]]
    for i, word in enumerate(words[:3]):
        root = bpy.data.objects.new("Editorial word " + str(i), None)
        bpy.context.collection.objects.link(root)
        root.location = (1.9, .5 + i * .18, 2.1 - i * .45)
        root.rotation_euler.z = math.radians(-7 + i * 3)
        box("Floating bronze type rail", (0, .018, 0), (2.5, .065, .36), chassis, root)
        box("Rail warm edge", (-1.22, -.028, 0), (.022, .012, .32), amber, root, .003)
        title = text("Editable word " + str(i), word, (-1.05, -.03, 0), .225, ivory, font, root)
        title.data.extrude = .012
        cards.append(root)
    headline = text("Story statement", content["headline"], (.7, .85, .47), .22, ivory, font)
    headline.data.extrude = .02
    # Foreground desk grounds the seated crop and naturally hides its source edge.
    box("Podcast console", (-1.15, -.3, .35), (3.65, .78, .16), warm, bevel=.06)
    box("Console front reveal", (-1.15, -.705, .31), (3.55, .028, .06), bronze, bevel=.008)
    box("Set microphone mount", (.24, -.07, .83), (.05, .06, .9), chassis, bevel=.012)
    box("Microphone console clamp", (.24, -.07, .47), (.19, .2, .08), bronze, bevel=.016)
    node = next(node for node in graph["nodes"] if node["id"] == "presenter")
    bpy.ops.mesh.primitive_plane_add(size=2)
    surface = bpy.context.object
    surface.name = "Source-bound presenter alpha surface"
    surface.location = node["position"]
    surface.rotation_euler = (math.pi / 2, 0, math.radians(node["yaw"]))
    surface.scale = (node["width"] / 2, node["height"] / 2, 1)
    mat = bpy.data.materials.new("Source foreground + alpha")
    mat.use_nodes = True
    # One composited cutout plane: continuous alpha avoids stochastic hair and
    # edge noise in the local raster renderer. Physical set depth stays intact.
    mat.surface_render_method = "BLENDED"
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(work / "presenter" / "000001.png"))
    texture.image.source = "SEQUENCE"
    texture.image_user.frame_start = 1
    texture.image_user.frame_duration = bpy.context.scene.frame_end
    texture.image_user.use_auto_refresh = True
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = .95
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    mat.node_tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    mat.node_tree.links.new(texture.outputs["Alpha"], mix.inputs[0])
    mat.node_tree.links.new(transparent.outputs[0], mix.inputs[1])
    mat.node_tree.links.new(emission.outputs[0], mix.inputs[2])
    mat.node_tree.links.new(mix.outputs[0], output.inputs[0])
    surface.data.materials.append(mat)
    return cards


def build(manifest, work):
    graph = manifest["graph"]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = manifest["profile"]["samples"]
    scene.cycles.use_denoising = True
    local_graphics = manifest.get("renderer") == "blender_eevee_local"
    if local_graphics:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
        scene.eevee.taa_render_samples = manifest["profile"]["samples"]
    scene.cycles.seed = 17
    scene.cycles.use_animated_seed = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = manifest["threads"]
    scene.render.resolution_x = manifest["profile"]["width"]
    scene.render.resolution_y = manifest["profile"]["height"]
    scene.render.resolution_percentage = 100
    scene.render.fps = manifest["fps"]
    scene.frame_start = 1
    scene.frame_end = round(graph["duration"] * manifest["fps"])
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.filepath = str(work / "frames" / "") + "/"
    scene.view_settings.view_transform = "Standard"
    scene.world = bpy.data.worlds.new("Dark forensic stage")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.018, .024, .04, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .22
    font = bpy.data.fonts.load(manifest["font"])
    params = graph["materials"]["chassis"]
    chassis = material("Anodized frame", params["color"], params["roughness"], params["metallic"])
    ground = material("Charcoal architectural floor", "#171e28", .33, .2)
    white = material("Ivory typography", "#eaf0f5", emission=1)
    amber = material("Evidence amber", "#f4b969", emission=1.1)
    cyan = material("Presenter edge", "#76b6c9", emission=.6)
    dark = material("Dial enamel", "#101a24", .55, .1)
    box("Stage floor", (0, 1, -.13), (200, 200, .2), ground, bevel=0)
    podcast = graph.get("preset") == "podcast_stage_v1"
    if not podcast:
        box("Back wall", (0, 4, 3.5), (24, .25, 7), material("Wall", "#101722", .8), bevel=0)
    # Architectural depth, lit surfaces and cast shadows; no CSS perspective.
    for x in ([] if podcast else range(-6, 7, 2)):
        box("Wall reveal", (x, 3.84, 3.5), (.018, .03, 7), chassis, bevel=0)
    roots = {}
    for node in graph["nodes"]:
        if node["type"] == "video_surface" and not podcast:
            roots[node["id"]] = movie_surface(node, work / node["id"], chassis, cyan if node["id"] == "presenter" else amber)
            # Slender supports visibly anchor the screens and cast grounded shadows.
            box(node["id"] + " pedestal", (node["position"][0], node["position"][1] + .15, .55), (.08, .1, 1.1), chassis)
            box(node["id"] + " foot", (node["position"][0], node["position"][1], .02), (1.2, .75, .06), chassis)
        elif node["type"] == "area_light":
            light = bpy.data.lights.new(node["id"], "AREA")
            light.energy = node["energy"]
            if podcast:
                light.use_shadow_jitter = False
            light.shape = "DISK"
            light.size = 5
            obj = bpy.data.objects.new(node["id"], light)
            bpy.context.collection.objects.link(obj)
            obj.location = node["position"]
            obj.rotation_euler = (Vector((0, .4, 1.6)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    if podcast:
        cards = podcast_stage(graph, work, font, chassis)
    evidence = roots.get("evidence")
    overlay = bpy.data.objects.new("Editable evidence assembly", None)
    bpy.context.collection.objects.link(overlay)
    overlay.parent = evidence
    # Opaque inset is physical geometry; clock hands are in front and occlude correctly.
    overlay.location = (0, -.025, 0)
    callout = None
    if not podcast:
        box("Clock backing", (0, -.028, -.02), (2.9, .018, 1.28), material("Evidence backing", "#0d1823", emission=.15), overlay)
        content = next(n for n in graph["nodes"] if n["type"] == "forensic_callouts")
        text("Sequence label", "EVIDENCE   /   01", (-1.5, -.09, 1.14), .105, amber, font, evidence)
        text("Headline", content["headline"], (-1.43, -.1, .78), .145, white, font, overlay)
        readings = next(n for n in graph["nodes"] if n["type"] == "clock_reconstruction")["readings"]
        clock(overlay, -.75, readings[0], "READING A", (white, amber, dark), font)
        clock(overlay, .75, readings[1], "READING B", (white, amber, dark), font)
        box("Callout separator", (0, -.11, .05), (.008, .006, .64), amber, overlay, 0)
        callout = text("Mismatch callout", content["callout"], (0, -.11, -.73), .105, amber, font, overlay, "CENTER")
        text("Presenter label", "ORIGINAL PRESENTER", (-1.68, -.08, -1.16), .095, white, font, roots["presenter"])
    camera_node = next(n for n in graph["nodes"] if n["type"] == "perspective_camera")
    camera_data = bpy.data.cameras.new("Programme camera")
    camera_data.lens = camera_node["focalLength"]
    camera_data.sensor_width = 36
    camera_data.clip_start = .05
    camera_data.clip_end = 300
    camera = bpy.data.objects.new("Programme camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    # Sample the exact same monotonic C2 easing at all programme frames.
    for frame in range(1, scene.frame_end + 1):
        time = (frame - 1) / manifest["fps"]
        progress = time / graph["duration"]
        position, target = sample(camera_node["keyframes"], time)
        camera.location = position
        camera.rotation_euler = (target - position).to_track_quat("-Z", "Y").to_euler()
        camera.keyframe_insert("location", frame=frame)
        camera.keyframe_insert("rotation_euler", frame=frame)
        if podcast:
            for i, card in enumerate(cards):
                cue = graph["typographyTiming"][i] if i < len(graph.get("typographyTiming", [])) else .5 + i * .1
                reveal = smoother((progress - cue) / .07)
                card.location.x = 1.9 + (1 - reveal) * .5
                card.keyframe_insert("location", frame=frame)
                card.scale = (max(.001, reveal),) * 3
                card.keyframe_insert("scale", frame=frame)
            continue
        reveal = smoother((progress - .13) / .12)
        evidence.location.z = 2.35 - (1 - reveal) * .7
        evidence.scale = (max(.001, reveal),) * 3
        evidence.keyframe_insert("location", frame=frame)
        evidence.keyframe_insert("scale", frame=frame)
        clock_reveal = smoother((progress - .27) / .12)
        overlay.scale = (max(.001, clock_reveal),) * 3
        overlay.keyframe_insert("scale", frame=frame)
        callout.scale = (max(.001, smoother((progress - .43) / .08)),) * 3
        callout.keyframe_insert("scale", frame=frame)
    for obj in ([camera] + cards if podcast else [camera, evidence, overlay, callout]):
        if obj.animation_data:
            for fc in obj.animation_data.action.fcurves:
                for key in fc.keyframe_points:
                    key.interpolation = "LINEAR"
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(work / "scene.blend"))
    # Optional single-frame diagnostics execute the same built scene.
    if "--frame" in sys.argv:
        frame = int(sys.argv[sys.argv.index("--frame") + 1])
        scene.frame_set(frame)
        scene.render.filepath = str(work / "frames" / f"{frame:04d}.png")
        bpy.ops.render.render(write_still=True)
    else:
        bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    path = Path(args[0]).resolve()
    build(json.loads(path.read_text()), path.parent)
