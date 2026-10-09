"""Native AutoPromote geometry and choreography for the existing neon_logo contract.

This is authored deterministic 3D animation, not an AI-generated image or video.
The original vector paths remain editable and the ordinary Studio pose is applied
to their common parent. Other brands and uploaded logos keep their existing path.
"""
import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

from vector_geometry import outline


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def aim(obj, target):
    forward = (Vector(target) - obj.location).normalized()
    right = forward.cross(Vector((0, 1, 0))).normalized()
    up = right.cross(forward).normalized()
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Matrix((right, up, -forward)).transposed().to_quaternion()


def setup(spec, configure_device, material):
    s = spec['scene']
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    world = bpy.context.scene
    configure_device(world)
    world.render.resolution_x = spec['width']
    world.render.resolution_y = spec['height']
    world.render.resolution_percentage = 100
    world.render.fps = spec['fps']
    world.render.image_settings.file_format = 'PNG'
    world.render.image_settings.color_mode = 'RGBA'
    world.render.image_settings.compression = 15
    world.render.film_transparent = s['background'] == 'transparent'
    world.world.use_nodes = True
    background = world.world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (.008, .002, .018, 1)
    background.inputs['Strength'].default_value = .025
    world.view_settings.view_transform = 'AgX'
    world.view_settings.look = 'AgX - Medium High Contrast'
    if world.render.engine == 'CYCLES':
        world.cycles.max_bounces = 5
        world.cycles.transmission_bounces = 2
    root = bpy.data.objects.new('Editable AutoPromote ident', None)
    bpy.context.collection.objects.link(root)
    geometry_file = Path(__file__).parent / 'assets/autopromote-vector-logo.json'
    geometry = json.loads(geometry_file.read_text())
    root['geometry_sha256'] = hashlib.sha256(geometry_file.read_bytes()).hexdigest()
    root['provenance'] = 'assets/brand/autopromote-original-v1/logo-geometry.json'

    silver = material('Polished titanium bevel', '#d5d3e4', metallic=1 if s['reflections'] else 0, roughness=.17)
    violet = material('Violet dimensional core', s['primaryColor'], metallic=.78, roughness=.2)
    violet.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = .5
    style = s['material']
    metallic = {'chrome': .85, 'gold': .85, 'holographic': .7, 'glass': .1, 'neon': .08, 'matte': .0}[style]
    roughness = {'chrome': .22, 'gold': .21, 'holographic': .18, 'glass': .08, 'neon': .4, 'matte': .7}[style]
    face = material('Reflective violet face', s['primaryColor'], metallic=metallic if s['reflections'] else 0, roughness=roughness)
    face_bsdf = face.node_tree.nodes['Principled BSDF']
    if style == 'glass':
        face_bsdf.inputs['Transmission Weight'].default_value = .38
    if style == 'neon':
        glow_color = tuple(int(s['glowColor'][i:i + 2], 16) / 255 for i in (1, 3, 5))
        face_bsdf.inputs['Emission Color'].default_value = (*glow_color, 1)
        face_bsdf.inputs['Emission Strength'].default_value = .28 + s['bloom'] * .36
    face.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = .65
    face.node_tree.nodes['Principled BSDF'].inputs['Coat Roughness'].default_value = .12
    ivory = material('Original outlined wordmark', s['secondaryColor'], metallic=.3, roughness=.22, emission=.15)
    energy = material('Violet light filament', s['glowColor'], emission=7)
    unit = 3.35 / 192
    layers = []
    depth = max(.05, min(.35, s['extrusionDepth'] / 2))
    for part_index, part in enumerate(geometry['symbolParts']):
        for layer_index, (mat, extrusion, z) in enumerate(((silver, depth, -.12), (violet, depth * .65, .025), (face, .025, .14))):
            obj = outline(part, geometry['symbolTransform'], (-96, -96), unit, mat)
            obj.name = f'Original {part["id"]} / layer {layer_index}'
            obj.parent = root
            obj.data.extrude = extrusion
            obj.data.bevel_depth = min(.016, s['bevel'] / 2)
            obj.location = (0, .72, z)
            layers.append((obj, part_index, layer_index, Vector(obj.location)))

    letters = []
    word_unit = 5.45 / geometry['wordmark']['width']
    for i, part in enumerate(geometry['wordmark']['parts']):
        obj = outline(part, part['transform'], (-geometry['wordmark']['width'] / 2, 0), word_unit, ivory)
        obj.parent = root
        obj.data.extrude = .018
        obj.data.bevel_depth = .002
        obj.location = (0, -1.44, .08)
        letters.append((obj, i, Vector(obj.location)))

    subtitle = None
    if s['secondary']:
        curve = bpy.data.curves.new('Editable supporting line', 'FONT')
        curve.body = s['secondary']
        curve.align_x = 'CENTER'
        curve.align_y = 'CENTER'
        curve.size = .125
        curve.space_character = 1.35
        curve.extrude = .001
        font_path = __import__('os').environ.get('STUDIO_3D_SECONDARY_FONT_PATH', __import__('os').environ.get('STUDIO_3D_FONT_PATH'))
        if font_path:
            curve.font = bpy.data.fonts.load(font_path, check_existing=True)
        subtitle = bpy.data.objects.new('Editable supporting line', curve)
        bpy.context.collection.objects.link(subtitle)
        subtitle.parent = root
        subtitle.location = (0, -1.72, .15)
        curve.materials.append(ivory)

    # A travelling filament has actual spatial depth and a progressively drawn
    # curve. It passes in front of and behind the dimensional logo.
    filaments = []
    for index in range(2):
        curve = bpy.data.curves.new('Orbit light path', 'CURVE')
        curve.dimensions = '3D'
        curve.resolution_u = 16
        curve.bevel_depth = .009 if index == 0 else .004
        curve.bevel_resolution = 2
        spline = curve.splines.new('NURBS')
        spline.points.add(95)
        for j, point in enumerate(spline.points):
            angle = j / 95 * math.tau
            point.co = (2.16 * math.cos(angle), .72 + .54 * math.sin(angle + .4 + index * .5), .8 * math.sin(angle), 1)
        spline.order_u = 4
        spline.use_endpoint_u = True
        obj = bpy.data.objects.new('Animated light orbit', curve)
        bpy.context.collection.objects.link(obj)
        obj.parent = root
        curve.materials.append(energy)
        filaments.append(obj)

    if s['background'] != 'transparent':
        bpy.ops.mesh.primitive_plane_add(size=200, location=(0, -1.96, 0), rotation=(math.pi / 2, 0, 0))
        bpy.context.object.data.materials.append(material('Reflective studio floor', '#0a0614', metallic=.72 if s['reflections'] else 0, roughness=.2))

    lights = []
    for name, position, color, watts, size, size_y in (
        ('Travelling violet strip', (-3, 1.5, 4), (.52, .02, 1), 950, 1.8, 4.5),
        ('Magenta contour', (3, .4, 2.5), (1, .035, .45), 750, 1, 4),
        ('White upper softbox', (0, 5, 4), (.86, .9, 1), 1050, 5, 1.1),
        ('White bevel reflection', (-4, -.5, 3), (.82, .88, 1), 550, .5, 4),
    ):
        bpy.ops.object.light_add(type='AREA', location=position)
        light = bpy.context.object
        light.name = name
        user_color = tuple(int(s['lightColor'][i:i + 2], 16) / 255 for i in (1, 3, 5))
        light.data.color = tuple(a * b for a, b in zip(color, user_color))
        light.data.energy = watts * s['lightIntensity'] / 2.2
        light.data.shape = 'RECTANGLE'
        light.data.size, light.data.size_y = size, size_y
        light.data.use_shadow = s['shadows']
        aim(light, (0, .4, 0))
        lights.append(light)

    bpy.ops.object.camera_add(location=(0, .4, 12))
    camera = bpy.context.object
    camera.data.lens = s['focalLength']
    world.camera = camera
    world.use_nodes = True
    nodes = world.node_tree.nodes
    nodes.clear()
    render = nodes.new('CompositorNodeRLayers')
    glow = nodes.new('CompositorNodeGlare')
    glow.glare_type = 'FOG_GLOW'
    glow.quality = 'HIGH'
    glow.threshold = 2.5
    glow.mix = -.88 if s['bloom'] < .1 else -.55
    world.node_tree.links.new(render.outputs['Image'], glow.inputs['Image'])
    # Same timeline opacity node as the other 3D templates.
    straight = nodes.new('CompositorNodePremulKey')
    straight.mapping = 'PREMUL_TO_STRAIGHT'
    world.node_tree.links.new(glow.outputs['Image'] if s['bloom'] > .05 else render.outputs['Image'], straight.inputs['Image'])
    alpha = nodes.new('CompositorNodeSetAlpha')
    alpha.mode = 'REPLACE_ALPHA'
    opacity = nodes.new('CompositorNodeMath')
    opacity.name = 'Timeline opacity'
    opacity.operation = 'MULTIPLY'
    world.node_tree.links.new(render.outputs['Alpha'], opacity.inputs[0])
    world.node_tree.links.new(straight.outputs['Image'], alpha.inputs['Image'])
    world.node_tree.links.new(opacity.outputs[0], alpha.inputs['Alpha'])
    output = nodes.new('CompositorNodeComposite')
    world.node_tree.links.new(alpha.outputs['Image'], output.inputs['Image'])
    return world, root, camera, {'native_brand': True, 'layers': layers, 'letters': letters, 'subtitle': subtitle, 'filaments': filaments, 'lights': lights}


def animate(animated, camera, scene, local, duration, aspect):
    progress = local / duration
    convergence = smooth((progress - .05) / .35)
    settle = smooth((progress - .08) / .49)
    for obj, part, layer, base in animated['layers']:
        obj.location = base + Vector(((1 - convergence) * (.7 if part == 0 else -.7), 0, (1 - convergence) * (layer - 1) * .7))
        obj.rotation_euler.y = (1 - convergence) * (-.5 if part == 0 else .4)
    subtitle = animated['subtitle']
    if subtitle:
        reveal = smooth((progress - .60) / .15)
        subtitle.scale = (max(.001, reveal),) * 3
    for obj, index, base in animated['letters']:
        reveal = smooth((progress - .38 - index * .011) / .15)
        obj.location = base + Vector((0, -(1 - reveal) * .23, -(1 - reveal) * .8))
        # Brand lettering preserves its proportions throughout the entrance.
        obj.scale = (max(.001, reveal),) * 3
    for index, obj in enumerate(animated['filaments']):
        start = .14 + .04 * index
        draw = smooth((progress - start) / .27)
        remove = smooth((progress - .53) / .2)
        obj.data.bevel_factor_start = min(draw, remove)
        obj.data.bevel_factor_end = max(.0001, draw)
        obj.data.bevel_depth = (.009 if index == 0 else .004) * max(.001, 1 - remove)
    motion = scene['cameraMotion']
    camera.location = (-2.7 - 1.05 * (1 - settle) * motion, .4 + .5 * (1 - settle) * motion, (12 - 6 * (1 - settle) * motion) * max(1, 1 / aspect))
    aim(camera, (-.4 * (1 - settle), .35 + .5 * (1 - settle), 0))
    light = animated['lights'][0]
    light.location.x = -3.2 + 6.4 * smooth(progress / .78)
    aim(light, (0, .4, 0))
