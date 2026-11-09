"""Two editable NVIDIA story takes replacing repeated interview/static quota.

These are authored visualizations of documented events, not fake UI captures.
They produce raw assets only; the Factory/Director/render worker owns the edit.
"""
import hashlib
import json
import math
import random
import sys
import time
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, '/app')
from blender_scene import configure_render_device, simple_material


def ease(v):
    v = max(0.0, min(1.0, v))
    return v*v*(3-2*v)


def aim(obj, target):
    forward = (Vector(target)-obj.location).normalized()
    right = forward.cross(Vector((0,1,0)))
    if right.length < 1e-6:
        right = forward.cross(Vector((1,0,0)))
    right.normalize()
    up = right.cross(forward).normalized()
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Matrix((right,up,-forward)).transposed().to_quaternion()


def cube(name, location, dimensions, material, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new('Machined edge','BEVEL')
        mod.width, mod.segments = bevel, 2
        obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return obj


def lettering(value, location, size, material, font, depth=.08):
    curve = bpy.data.curves.new(value,'FONT')
    curve.body, curve.align_x, curve.align_y = value,'CENTER','CENTER'
    curve.font = font
    curve.size, curve.extrude, curve.bevel_depth = size,depth,.008
    obj = bpy.data.objects.new(value,curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.data.materials.append(material)
    return obj


def position_keys(obj, keys):
    for frame, location in keys:
        obj.location = location
        obj.keyframe_insert('location',frame=frame)


def scale_keys(obj, keys):
    for frame, scale in keys:
        obj.scale = (scale,)*3
        obj.keyframe_insert('scale',frame=frame)


def mesh_points(obj):
    bpy.context.view_layer.update()
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    result = [obj.matrix_world @ v.co for v in mesh.vertices]
    evaluated.to_mesh_clear()
    return result


def run(request_path, root):
    request = json.loads(request_path.read_text())
    if request['template'] != 'founder_story_relief_v4' or request['mode'] not in ('preview','render'):
        raise ValueError('Explicit v4 story-relief request required')
    if request['shot'] not in ('cascade','capacity-turn'):
        raise ValueError('Unknown story relief shot')
    if time.time()+30 >= request['deadlineEpoch']:
        raise RuntimeError('Authorized NVIDIA cutoff too close')
    evidence = Path(request['evidencePath'])
    if hashlib.sha256(evidence.read_bytes()).hexdigest()!=request['evidenceSha256']:
        raise ValueError('Documented source evidence changed')
    root.mkdir(parents=True,exist_ok=True)
    scene = bpy.context.scene
    device = configure_render_device(scene)
    if not device['gpu_verified'] or not any('L40S' in d for d in device['devices']):
        raise RuntimeError('Verified NVIDIA L40S required for raw 3D take')
    render = request['render']
    scene.render.resolution_x,scene.render.resolution_y=render['width'],render['height']
    scene.render.resolution_percentage=100
    scene.render.fps=24
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.compression=0
    scene.frame_start=1
    scene.frame_end=round(request['duration']*24)
    scene.cycles.samples=render['samples']
    scene.cycles.use_denoising=True
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.006,.009,.018,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.025
    scene.view_settings.view_transform='AgX'
    scene.view_settings.look='AgX - Medium High Contrast'
    if hashlib.sha256(Path(request['fontPath']).read_bytes()).hexdigest()!=request['fontSha256']:
        raise ValueError('Retained licensed font changed')
    font=bpy.data.fonts.load(request['fontPath'],check_existing=True)
    metal=simple_material('Machined palladium','#cdd2df',.89,.22)
    black=simple_material('Dark glass','#101726',.58,.28)
    violet=simple_material('Coherent story signal','#8068e8',.58,.21,.5)
    amber=simple_material('Human source signal','#f3b978',.55,.23,.4)
    red=simple_material('Verified failure interruption','#cf5d5a',.44,.24,.6)
    floor=cube('Reflective editorial stage',(0,-3.7,-6),(45,.15,60),black,.01)
    bpy.ops.object.camera_add(location=(.8,.55,14.5))
    camera=bpy.context.object
    camera.name='One-idea-to-system camera'
    camera.data.lens=49
    scene.camera=camera
    for name,loc,color,energy,size in [
        ('Grazing source light',(-6,5,4),(.72,.84,1),1400,5),
        ('Warm retained-source rim',(6,2,-1),(1,.57,.29),1050,4),
        ('Signal depth',(-2,-2,6),(.37,.25,1),650,4)]:
        bpy.ops.object.light_add(type='AREA',location=loc)
        light=bpy.context.object
        light.name=name
        light.data.energy,light.data.color,light.data.size=energy,color,size
        aim(light,(0,0,0))
    count=scene.frame_end
    if request['shot']=='cascade':
        # The two strips are the same causal signals introduced by the origin.
        # Once aligned, the sound strip falls away and the render gate stops.
        tracks=[]
        for track,material in ((0,amber),(1,violet)):
            for i in range(64):
                height=.12+.58*abs(math.sin(i*.31)*math.sin(i*.12+track*.75))
                obj=cube(f'Track {track} pulse {i}',(-5.8+i*.183,1.0-track*1.4,.5),(.055,height,.06),material,.008)
                obj.location.x+=(-.45 if track==0 else .5)
                obj.keyframe_insert('location',frame=1)
                obj.location.x+= (.45 if track==0 else -.5)
                obj.keyframe_insert('location',frame=46)
                if track==1:
                    obj.keyframe_insert('location',frame=60)
                    obj.location.y-=5.2
                    obj.keyframe_insert('location',frame=87)
                tracks.append(obj)
        gate=cube('The render gate',(0,0,-1.2),(10.9,5.3,.24),black,.09)
        position_keys(gate,[(1,(0,0,-1.2)),(73,(0,0,-1.2)),(88,(0,0,1.35))])
        fail=lettering('RENDER FAILED',(0,-.4,1.5),.95,red,font,.14)
        scale_keys(fail,[(1,.001),(85,.001),(96,1),(count,1)])
        lettering('SYNC',(0,2.28,.55),.38,metal,font,.04)
        position_keys(camera,[(1,(.9,.5,15)),(65,(0,.2,12.8)),(count,(0,.1,13.6))])
    else:
        zero=lettering('0',(0,-.25,.55),5.2,metal,font,.36)
        zero.name='Documented zero quota'
        target=lettering('3000',(0,.15,.55),2.75,metal,font,.23)
        target.name='Documented 3000 milliGPU capacity'
        zero_points=mesh_points(zero)
        target_points=mesh_points(target)
        if not zero_points or not target_points:
            raise ValueError('Font geometry cannot be sampled')
        rng=random.Random(20261008)
        # The same physical fragments start on 0 and settle on 3000.
        # Text remains behind them so exact digits stay readable at lockup.
        for i in range(144):
            a=zero_points[round(i*(len(zero_points)-1)/143)]
            b=target_points[round(i*(len(target_points)-1)/143)]
            obj=cube(f'Capacity fragment {i}',a,(.045,.045,.09),violet if i%3 else amber,.008)
            obj.keyframe_insert('location',frame=1)
            obj.keyframe_insert('location',frame=88)
            midpoint=(a+b)*.5+Vector((rng.uniform(-1.4,1.4),rng.uniform(-1.0,1.0),rng.uniform(-1.8,1.8)))
            obj.location=midpoint
            obj.keyframe_insert('location',frame=133)
            obj.location=b
            obj.keyframe_insert('location',frame=176)
        position_keys(zero,[(1,(0,-.25,.55)),(87,(0,-.25,.55)),(135,(0,-.25,-10))])
        scale_keys(target,[(1,.001),(150,.001),(181,1),(count,1)])
        subtitle=lettering('milliGPU  ·  historical GPU quota',(0,-2.35,.8),.34,metal,font,.03)
        scale_keys(subtitle,[(1,.001),(173,.001),(194,1),(count,1)])
        left=cube('Left physical capacity wall',(-5.8,0,-.8),(4.6,6,.22),black,.06)
        right=cube('Right physical capacity wall',(5.8,0,-.8),(4.6,6,.22),black,.06)
        position_keys(left,[(1,(-5.8,0,-.8)),(114,(-5.8,0,-.8)),(181,(-11.0,0,-.8))])
        position_keys(right,[(1,(5.8,0,-.8)),(114,(5.8,0,-.8)),(181,(11.0,0,-.8))])
        position_keys(camera,[(1,(1.8,.55,15.8)),(90,(.9,.4,13.7)),(count,(0,.25,14.5))])
    for frame in (1,round(count*.33),round(count*.66),count):
        scene.frame_set(frame)
        aim(camera,(0,0,0))
        camera.keyframe_insert('rotation_quaternion',frame=frame)
    scene.frame_set(1)
    native=root/'scene.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(native))
    indices=[1,round(count*.25),round(count*.55),round(count*.8),count] if request['mode']=='preview' else range(1,count+1)
    started=time.monotonic()
    for frame in indices:
        if time.time()+18>=request['deadlineEpoch']:
            raise RuntimeError('Authorized GPU cutoff reached')
        scene.frame_set(frame)
        dest=root/(f'preview-{frame:04d}.png' if request['mode']=='preview' else f'frame-{frame-1:04d}.png')
        scene.render.filepath=str(dest)
        bpy.ops.render.render(write_still=True)
        if request['mode']=='preview' or frame%24==0:
            print(json.dumps({'shot':request['shot'],'frame':frame,'total':count}),flush=True)
    receipt={'status':'GENERATED_PENDING_CREATIVE_REVIEW','shot':request['shot'],
             'model':'Authored Blender Cycles scene on NVIDIA L40S','modelRevision':bpy.app.version_string,
             'sourceBrief':request['sourceBrief'],'sourceEvidenceSha256':request['evidenceSha256'],
             'settings':request,'device':device,'duration':request['duration'],'frames':list(indices),
             'nativeSceneSha256':hashlib.sha256(native.read_bytes()).hexdigest(),
             'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
             'seconds':time.monotonic()-started,
             'editable':['signal alignment','fragment path','text','materials','camera','lights','timing'],
             'limitation':'Authored story visualization, not a live product UI or proof of autonomous arbitrary-brief quality.'}
    (root/'render-receipt.json').write_text(json.dumps(receipt,indent=2))


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:]
    if len(args)!=2:
        raise SystemExit('Pass request.json and shot output directory')
    run(Path(args[0]),Path(args[1]))
