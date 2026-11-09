"""Bounded, editable actual-logo geometry reveal using the Studio device policy.

Invoke Blender --background --python-exit-code 1 --python this-file -- request.json out.
CPU preview/full rendering is explicit; NVIDIA renders still require a deadline.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'studio_3d_renderer'))
sys.path.insert(0, '/app')
from blender_scene import configure_render_device, rgba, simple_material


def config_checked(config):
    if config.get('template') != 'autopromote_ident' or config.get('identTemplate') != 'layered_logo_v1':
        raise ValueError('Explicit layered_logo_v1 template required')
    if config.get('style') not in {'cinematic', 'compute', 'minimal'}:
        raise ValueError('Unknown layered actual-logo direction')
    duration = float(config.get('duration', 5))
    if not 3 <= duration <= 6:
        raise ValueError('Layered ident duration must be 3–6 seconds')
    defaults = {'anticipation': .32, 'revealStart': .55, 'geometryLock': 1.85,
                'lockup': 2.7, 'cameraSettle': 3.3}
    defaults = {k: v * duration / 5 for k, v in defaults.items()}
    timings = {**defaults, **config.get('timings', {})}
    if set(timings) != set(defaults) or not 0 < timings['anticipation'] < timings['revealStart'] < timings['geometryLock'] < timings['lockup'] <= timings['cameraSettle'] <= duration - .8:
        raise ValueError('Ordered reveal timing and >=0.8-second clean hold required')
    for key, value, low, high in [
        ('lens', config.get('camera', {}).get('lens', 52), 35, 85),
        ('parallax', config.get('camera', {}).get('parallax', .7), 0, 1),
        ('depth', config.get('materials', {}).get('depth', .16), .025, .4),
        ('bevel', config.get('materials', {}).get('bevel', .008), .001, .025),
        ('roughness', config.get('materials', {}).get('roughness', .2), .08, .65),
        ('lightIntensity', config.get('lighting', {}).get('intensity', 1), .1, 3),
        ('energyCount', config.get('particles', {}).get('count', 18), 0, 32),
    ]:
        if not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f'Invalid editable {key}')
    return duration, timings


def animate(obj, property_name, values):
    for frame, value in values:
        setattr(obj, property_name, value)
        obj.keyframe_insert(property_name, frame=frame)


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('request', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--build-only', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    config = json.loads(args.request.read_text())
    duration, timings = config_checked(config)
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    geometry_path = Path(config['logoGeometry'])
    geometry = json.loads(geometry_path.read_text())
    expected = config.get('logoGeometrySha256')
    geometry_sha = hashlib.file_digest(geometry_path.open('rb'), 'sha256').hexdigest()
    if expected and geometry_sha != expected:
        raise ValueError('Actual-logo geometry bytes changed')
    if not geometry['uniformScalingOnly'] or geometry['fontSubstitution'] or geometry['thresholdMaskIoU'] < .965:
        raise ValueError('Actual-logo provenance/fidelity required')
    if len(geometry['parts']) != 13:
        raise ValueError('Unexpected actual-logo topology')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    device = configure_render_device(scene)
    if device['backend'] == 'EEVEE':
        raise ValueError('Use explicit CPU Cycles or authorized NVIDIA; other GPU backends are excluded')
    if device['gpu_verified'] and (not config.get('deadlineEpoch') or time.time() + 60 >= config['deadlineEpoch']):
        raise ValueError('An active NVIDIA deadline is required')
    scene.render.resolution_x = int(config.get('width', 1280))
    scene.render.resolution_y = int(config.get('height', 720))
    if not 640 <= scene.render.resolution_x <= 1920 or not 360 <= scene.render.resolution_y <= 1080:
        raise ValueError('Bounded output dimensions required')
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.fps = fps = 24
    scene.frame_start = 1
    scene.frame_end = frames = round(duration * fps)
    scene.cycles.max_bounces = 4
    scene.cycles.transparent_max_bounces = 4
    scene.cycles.use_denoising = True
    scene.cycles.use_animated_seed = False
    scene.cycles.seed = int(config.get('seed', 20261007)) % 2147483647
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = rgba('#070810')
    background.inputs['Strength'].default_value = .04
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.film_transparent = False
    frame = lambda at: 1 + round(at * fps)
    style = config['style']
    material_config = config.get('materials', {})
    depth = float(material_config.get('depth', .16))
    bevel = float(material_config.get('bevel', .008))
    roughness = float(material_config.get('roughness', .2))
    violet = simple_material('Actual logo violet lacquer', '#7540ee', metallic=.6 if style == 'cinematic' else .22, roughness=roughness)
    violet_bsdf = violet.node_tree.nodes['Principled BSDF']
    violet_bsdf.inputs['Coat Weight'].default_value = .55
    violet_bsdf.inputs['Coat Roughness'].default_value = .12
    silver = simple_material('Sculpted platinum backing', '#d7d8ee', metallic=.92, roughness=.22)
    white = simple_material('Original wordmark ivory', '#f4f0ff', metallic=.15, roughness=.24)
    white.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = rgba('#f4f0ff')
    white.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = .12
    trace_mat = simple_material('Compute paths resolve into the logo', '#9276ff', metallic=.3, roughness=.2, emission=2.4)
    x0, y0, x1, y1 = geometry['bounds']
    unit = 9.2 / (x1 - x0)
    center_x, center_y = (x0 + x1) / 2, (y0 + y1) / 2
    transform = lambda point: ((point[0] - center_x) * unit, (center_y - point[1]) * unit, 0)

    def shape(part, name, material, extrusion, z):
        curve = bpy.data.curves.new(name, 'CURVE')
        curve.dimensions = '2D'
        curve.fill_mode = 'BOTH'
        curve.resolution_u = 1
        curve.extrude = extrusion
        curve.bevel_depth = bevel if part['kind'] == 'rocket' else min(bevel, .003)
        curve.bevel_resolution = 3
        for loop in part['loops']:
            spline = curve.splines.new('POLY')
            spline.points.add(len(loop) - 1)
            # The raster contour's Y inversion preserves opposite hole winding.
            for p, xy in zip(spline.points, loop):
                p.co = (*transform(xy), 1)
            spline.use_cyclic_u = True
        obj = bpy.data.objects.new(name, curve)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(material)
        obj.location.z = z
        obj['sourceAssetSha256'] = geometry['sourceSha256']
        obj['actualLogoPart'] = part['kind']
        obj['uniformScale'] = unit
        return obj

    rocket = next(part for part in geometry['parts'] if part['kind'] == 'rocket')
    rocket_center = Vector(transform(((rocket['bounds'][0] + rocket['bounds'][2]) / 2, (rocket['bounds'][1] + rocket['bounds'][3]) / 2)))
    rear = shape(rocket, 'Rocket / machined backing', silver, depth * .55, -.12)
    front = shape(rocket, 'Rocket / original violet face', violet, depth * .18, .04)
    separation = .75 if style == 'cinematic' else .5 if style == 'compute' else .18
    animate(rear, 'location', [(1, (0, 0, -separation)), (frame(timings['revealStart']), (0, 0, -separation)),
                               (frame(timings['geometryLock']), (0, 0, -.12))])
    animate(front, 'location', [(1, (0, 0, separation)), (frame(timings['revealStart']), (0, 0, separation)),
                                (frame(timings['geometryLock']), (0, 0, .04))])
    parts = [part for part in geometry['parts'] if part['kind'] == 'wordmark']
    for index, part in enumerate(parts):
        letter = shape(part, f'Original wordmark / source component {index + 1:02}', white, depth * .12, .02)
        start = timings['revealStart'] + (timings['lockup'] - timings['revealStart']) * (.22 + index / len(parts) * .34)
        end = timings['lockup'] - .06 * (len(parts) - index - 1) * duration / 5
        # Each source glyph rotates from edge-on and advances through depth.
        # No opacity animation or retyped font is involved.
        local_center = Vector(transform(((part['bounds'][0] + part['bounds'][2]) / 2, (part['bounds'][1] + part['bounds'][3]) / 2)))
        for spline in letter.data.splines:
            for point in spline.points:
                point.co.x -= local_center.x
                point.co.y -= local_center.y
        animate(letter, 'location', [(1, (local_center.x, local_center.y, -.55)),
                                     (frame(start), (local_center.x, local_center.y, -.55)),
                                     (frame(end), (local_center.x, local_center.y, .02))])
        animate(letter, 'rotation_euler', [(1, (0, math.pi / 2, 0)), (frame(start), (0, math.pi / 2, 0)),
                                           (frame(end), (0, 0, 0))])

    backdrop = simple_material('Ink cyclorama', '#05060b', metallic=.15, roughness=.38)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -1.1))
    bpy.context.object.name = 'Clean dark studio background'
    bpy.context.object.data.materials.append(backdrop)
    lights = []
    intensity = config.get('lighting', {}).get('intensity', 1)

    def area(name, location, energy, color, size, size_y, target):
        bpy.ops.object.light_add(type='AREA', location=location)
        obj = bpy.context.object
        obj.name = name
        obj.data.energy = energy * intensity
        obj.data.color = color
        obj.data.shape = 'RECTANGLE'
        obj.data.size, obj.data.size_y = size, size_y
        aim(obj, target)
        lights.append(obj)
        return obj

    sculpt = area('Narrow reflection / anticipation', (-5.6, 2.8, 4), 700, (.78, .72, 1), 3.5, .2, rocket_center)
    rim = area('Violet structural rim', (-2.5, -1.5, 2.5), 420, (.4, .17, 1), 3, .15, rocket_center)
    key = area('Wordmark readability / final softbox', (1, 3, 7), 650, (.9, .92, 1), 6, 3, (0, 0, 0))
    for obj in lights:
        power = obj.data.energy
        animate(obj.data, 'energy', [(1, 0), (frame(timings['anticipation']), 0),
                                     (frame(timings['revealStart'] + .15), power * (.12 if obj == key else .8)),
                                     (frame(timings['lockup']), power), (frames, power)])
    animate(sculpt, 'location', [(1, (-5.6, 2.8, 4)), (frame(timings['lockup']), (1.5, 2.8, 4))])

    particle_count = int(config.get('particles', {}).get('count', 18)) if style == 'compute' else 0
    for index in range(particle_count):
        part = geometry['parts'][index % len(geometry['parts'])]
        loop = max(part['loops'], key=len)
        xy = loop[(index * 7) % len(loop)]
        destination = Vector(transform(xy))
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=4, radius=.015, location=destination)
        packet = bpy.context.object
        packet.name = f'Data packet / actual contour convergence {index + 1:02}'
        packet.data.materials.append(trace_mat)
        start = timings['revealStart'] + index / max(particle_count, 1) * .4
        origin = destination + Vector(((-1 if index % 2 else 1) * .65, .45, .9))
        animate(packet, 'location', [(1, origin), (frame(start), origin),
                                    (frame(timings['geometryLock'] + index / max(particle_count, 1) * .5), destination)])
        animate(packet, 'scale', [(1, (0, 0, 0)), (frame(start), (1, 1, 1)),
                                 (frame(timings['lockup'] - .1), (1, 1, 1)), (frame(timings['lockup']), (0, 0, 0))])

    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.name = 'Editable cinematic reveal camera'
    scene.camera = cam
    cam.data.lens = config.get('camera', {}).get('lens', 52)
    parallax = config.get('camera', {}).get('parallax', .7)
    if style == 'minimal':
        positions = [(1, (-1.2 * parallax, .65 * parallax, 17.8), (0, 0, 0)),
                     (frame(timings['cameraSettle']), (0, 0, 16.2), (0, 0, 0)),
                     (frames, (0, 0, 16.2), (0, 0, 0))]
    else:
        positions = [(1, (rocket_center.x - .6 * parallax, .72, 2.35), (rocket_center.x + .05, .35, .2)),
                     (frame(timings['revealStart'] + .45), (rocket_center.x - .4 * parallax, .65, 4), tuple(rocket_center)),
                     (frame(timings['geometryLock']), (-2.4, .55 * parallax, 9), (-1.5, 0, 0)),
                     (frame(timings['cameraSettle']), (0, 0, 16.2), (0, 0, 0)),
                     (frames, (0, 0, 16.2), (0, 0, 0))]
    for at, position, target in positions:
        cam.location = position
        aim(cam, target)
        cam.keyframe_insert('location', frame=at)
        cam.keyframe_insert('rotation_euler', frame=at)

    scene.use_nodes = True
    nodes = scene.node_tree.nodes
    nodes.clear()
    layers = nodes.new('CompositorNodeRLayers')
    glow = nodes.new('CompositorNodeGlare')
    glow.glare_type = 'FOG_GLOW'
    glow.quality = 'HIGH'
    glow.threshold = 2.5
    glow.mix = -.9
    composite = nodes.new('CompositorNodeComposite')
    scene.node_tree.links.new(layers.outputs['Image'], glow.inputs['Image'])
    scene.node_tree.links.new(glow.outputs['Image'], composite.inputs['Image'])
    scene['brandSourceSha256'] = geometry['sourceSha256']
    scene['brandGeometrySha256'] = geometry_sha
    scene['templateVersion'] = 'layered_logo_v1'
    scene['timings'] = json.dumps(timings)
    scene.frame_set(frame(timings['cameraSettle']))
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'autopromote-ident.blend'))
    receipt = {'tool': 'Blender / existing Studio Cycles device policy', 'version': bpy.app.version_string,
               'device': device, 'frames': frames, 'fps': fps, 'config': config,
               'model': 'AutoPromote actual-logo layered geometry ident', 'modelRevision': 'layered_logo_v1',
               'sourceBrief': config['sourceBrief'], 'timings': timings, 'impactAt': timings['lockup'],
               'resolveAt': timings['cameraSettle'], 'cleanHoldSeconds': duration - timings['cameraSettle'],
               'logoProvenance': {k: geometry[k] for k in ['sourceAsset', 'sourceSha256', 'bounds', 'aspectRatio', 'thresholdMaskIoU', 'fontSubstitution']},
               'geometrySha256': geometry_sha, 'nativeScene': 'autopromote-ident.blend',
               'nativeSceneSha256': hashlib.file_digest((out / 'autopromote-ident.blend').open('rb'), 'sha256').hexdigest(),
               'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
               'editable': ['source contour components / no font replacement', 'separated rocket depth layers',
                            'individual original-glyph rotations and depth', 'timing', 'camera keyframes',
                            'materials / extrusion / bevel', 'studio lights', 'bounded contour-converging data packets', 'sound cues'],
               'status': 'NATIVE_SCENE_PREPARED_PENDING_RENDER'}
    (out / 'scene-receipt.json').write_text(json.dumps(receipt, indent=2))
    if args.build_only:
        print(json.dumps({'event': 'native_ident_prepared', 'style': style, 'device': device}), flush=True)
        return
    selected = [1, frame(.55 * duration / 5), frame(1.2 * duration / 5), frame(timings['geometryLock']),
                frame(timings['lockup']), frame(timings['cameraSettle']), frames] if args.preview else range(1, frames + 1)
    started = time.monotonic()
    for at in selected:
        if device['gpu_verified'] and time.time() + 30 >= config['deadlineEpoch']:
            raise RuntimeError('Authorized NVIDIA window reached')
        scene.frame_set(at)
        scene.render.filepath = str(out / (f'preview_{at:04d}.png' if args.preview else f'frame_{at - 1:04d}.png'))
        bpy.ops.render.render(write_still=True)
        print(json.dumps({'event': 'layered_ident_frame', 'style': style, 'frame': at, 'frames': frames}), flush=True)
    receipt.update(status='PREVIEW_PENDING_VISUAL_REVIEW' if args.preview else 'GENERATED_PENDING_VISUAL_REVIEW',
                   renderSeconds=time.monotonic() - started)
    (out / ('preview-receipt.json' if args.preview else 'scene-receipt.json')).write_text(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
