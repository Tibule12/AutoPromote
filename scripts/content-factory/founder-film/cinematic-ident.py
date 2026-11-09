"""Editable native brand ident. Raw asset generation, never final film editing."""
import hashlib
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, '/app')
sys.path.insert(0, str(Path(__file__).parent))
from blender_scene import configure_render_device, simple_material
from vector_geometry import outline

args=sys.argv[sys.argv.index('--')+1:]
request_path,root=Path(args[0]),Path(args[1])
request=json.loads(request_path.read_text())
if request['template']!='cinematic_original_ident_v4' or request['direction'] not in {'cinematic','compute','minimal'}:
    raise ValueError('Explicit reusable native ident direction required')
duration=float(request['duration'])
timing=request['timing']
if not 3<=duration<=6 or not 0<timing['anticipation']<timing['layerStart']<timing['materialLock']<timing['lockup']<=duration-1:
    raise ValueError('Ident requires ordered anticipation/reveal/lock and a readable hold')
geometry_path=Path(request['logoGeometry'])
geometry=json.loads(geometry_path.read_text())
geometry_sha=hashlib.sha256(geometry_path.read_bytes()).hexdigest()
if geometry_sha!=request['logoGeometrySha256'] or not geometry['uniformScalingOnly']:
    raise ValueError('Exact original logo geometry required')
root.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
device=configure_render_device(scene)
if not device['gpu_verified'] or not any('L40S' in n for n in device['devices']):
    raise RuntimeError('Verified NVIDIA L40S required for this production')
if time.time()+30>=request['deadlineEpoch']:
    raise RuntimeError('Production GPU deadline reached')
fps=24;count=round(duration*fps)
scene.render.resolution_x=request['render']['width'];scene.render.resolution_y=request['render']['height']
scene.render.resolution_percentage=100;scene.render.fps=fps
scene.render.image_settings.file_format='PNG';scene.render.image_settings.compression=0
scene.frame_start=1;scene.frame_end=count
scene.cycles.samples=request['render']['samples'];scene.cycles.max_bounces=8
scene.cycles.transmission_bounces=6;scene.cycles.use_denoising=True
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.004,.006,.014,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.006
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'

def ease(x):
    x=max(0,min(1,x));return x*x*(3-2*x)

def aim(obj,target):
    forward=(Vector(target)-obj.location).normalized()
    right=forward.cross(Vector((0,1,0)))
    if right.length<1e-6:right=forward.cross(Vector((1,0,0)))
    right.normalize();up=right.cross(forward).normalized()
    obj.rotation_mode='QUATERNION'
    q=Matrix((right,up,-forward)).transposed().to_quaternion()
    if q.w<0:q.negate()
    obj.rotation_quaternion=q

def area(name,position,target,energy,color,size,size_y):
    bpy.ops.object.light_add(type='AREA',location=position)
    obj=bpy.context.object;obj.name=name;obj.data.energy=energy;obj.data.color=color
    obj.data.shape='RECTANGLE';obj.data.size=size;obj.data.size_y=size_y
    aim(obj,target);return obj

direction=request['direction']
silver=simple_material('Machined titanium backing','#c1c8d8',.98,.19)
obsidian=simple_material('Optical black spacer','#080c17',.65,.24)
ivory=simple_material('Original outlined wordmark','#e6e9f2',.6,.24)
violet=simple_material('Anodized violet face','#7353c8',.78,.18)
glass=simple_material('Smoked optical crystal','#6a5bd7',.08,.08)
glass.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.72
glass.node_tree.nodes['Principled BSDF'].inputs['IOR'].default_value=1.48
if direction=='minimal':
    violet=simple_material('Satin platinum face','#cad0dd',.95,.28)
    glass=simple_material('Polished platinum detail','#ebedf5',.96,.16)
if direction=='compute':
    violet=simple_material('Violet compute core','#7650b8',.55,.21)
    glass.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(.09,.028,.28,1)
    glass.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=.28
scale=request['geometry']['width']/geometry['lockup']['width']
offset=(-geometry['lockup']['width']/2,-geometry['lockup']['height']/2)
symbol_offset=tuple(a+b for a,b in zip(geometry['lockup']['symbolTranslate'],offset))
symbol_target=(-3.56,.04,0)
layers=[]
for layer_index,(material,depth,z) in enumerate([(silver,.22,-.24),(obsidian,.12,-.04),(violet,.07,.12),(glass,.018,.205)]):
    for part_index,part in enumerate(geometry['symbolParts']):
        obj=outline(part,geometry['symbolTransform'],symbol_offset,scale,material)
        obj.name=f'Identity layer {layer_index} / {part["id"]}'
        obj.data.extrude=depth;obj.data.bevel_depth=request['geometry']['bevel']
        points=[bp.co.copy() for spline in obj.data.splines for bp in spline.bezier_points]
        center=Vector(((min(p.x for p in points)+max(p.x for p in points))/2,
                       (min(p.y for p in points)+max(p.y for p in points))/2,0))
        for spline in obj.data.splines:
            for bp in spline.bezier_points:
                position,left,right=bp.co.copy(),bp.handle_left.copy(),bp.handle_right.copy()
                bp.co=position-center;bp.handle_left=left-center;bp.handle_right=right-center
        obj.location=center
        layers.append((obj,z,layer_index,part_index,center))
letters=[]
word_offset=tuple(a+b for a,b in zip(geometry['lockup']['wordmarkTranslate'],offset))
for i,part in enumerate(geometry['wordmark']['parts']):
    obj=outline(part,part['transform'],word_offset,scale,ivory)
    obj.name='Original outlined glyph '+str(i+1)
    obj.data.extrude=.028;obj.data.bevel_depth=.0025
    letters.append(obj)

# A clean world field keeps the final identity readable. Light linking gives
# the symbol its structural anticipation before the wordmark is illuminated.
receivers=bpy.data.collections.new('Identity structural light receivers')
scene.collection.children.link(receivers)
for obj,_,_,_,_ in layers:receivers.objects.link(obj)
key=area('Traveling specular edge',(-7,3.0,4),symbol_target,0,(.79,.87,1),.20,5)
rim=area('Controlled violet rim',(-4,-2.2,1.3),symbol_target,0,(.42,.25,1),3,.13)
fill=area('Clean lockup softbox',(0,3.2,7),(0,0,0),0,(.94,.96,1),8,3)
warm=area('Warm structural reflection',(-3.3,2.2,4),symbol_target,0,(1,.68,.36),3,.12)
for light in [key,rim,warm]:light.light_linking.receiver_collection=receivers
bpy.ops.object.camera_add();camera=bpy.context.object;camera.name='Macro to identity camera'
camera.data.lens=request['camera']['lens'];scene.camera=camera
camera.data.dof.use_dof=True;camera.data.dof.aperture_fstop=7.1
bpy.ops.object.empty_add(location=symbol_target);focus=bpy.context.object;focus.name='Identity focus'
camera.data.dof.focus_object=focus
for f in range(1,count+1):
    t=(f-1)/fps;scene.frame_set(f)
    q=ease((t-.85)/(timing['lockup']-.85))
    camera.location=(-5.4*(1-q),.50*(1-q),request['camera']['macroDistance']*(1-q)+request['camera']['lockupDistance']*q)
    target=Vector(symbol_target)*(1-q);aim(camera,target)
    focus.location=target
    camera.keyframe_insert('location',frame=f);camera.keyframe_insert('rotation_quaternion',frame=f)
    focus.keyframe_insert('location',frame=f)
    for obj,z,layer,part,center in layers:
        start=timing['layerStart']+layer*.17+part*.08
        resolve=ease((t-start)/(timing['materialLock']-start))
        obj.location=center+Vector(((1-resolve)*(-.42 if part==0 else .42),
                                   (1-resolve)*(.12-layer*.05),z-(1-resolve)*(.48+layer*.22)))
        obj.rotation_euler.y=(1-resolve)*(-.95 if part==0 else .95)
        obj.keyframe_insert('location',frame=f);obj.keyframe_insert('rotation_euler',frame=f)
    for i,obj in enumerate(letters):
        begin=timing['materialLock']-.35+i*.027
        resolve=ease((t-begin)/(timing['lockup']-begin))
        obj.location.z=-.6*(1-resolve)
        # Shared material and light resolve the whole word together. Exact
        # glyph dimensions/spacing and original proportions remain constant.
        obj.keyframe_insert('location',frame=f)
    edge=ease((t-timing['anticipation'])/.35)
    key.location.x=-7+12*ease((t-.2)/2.55);aim(key,symbol_target)
    key.data.energy=request['lighting']['edge']*edge*(1-.76*ease((t-2.65)/.5))
    rim.data.energy=request['lighting']['rim']*edge*(1-.5*ease((t-2.5)/.55))
    warm.data.energy=request['lighting']['warm']*edge*(1-.8*ease((t-1.5)/1))
    fill.data.energy=request['lighting']['fill']*ease((t-timing['materialLock'])/(timing['lockup']-timing['materialLock']))
    for light in [key,rim,warm,fill]:
        light.keyframe_insert('location',frame=f);light.keyframe_insert('rotation_quaternion',frame=f)
        light.data.keyframe_insert('energy',frame=f)
scene.frame_set(1)
native=root/'scene.blend';bpy.ops.wm.save_as_mainfile(filepath=str(native))
indices=[0,round(count*.30),round(count*.60),count-1] if request['mode']=='preview' else range(count)
started=time.monotonic()
for index in indices:
    if time.time()+20>=request['deadlineEpoch']:raise RuntimeError('Production GPU deadline reached')
    dest=root/f'frame_{index:04d}.png'
    scene.frame_set(index+1);scene.render.filepath=str(dest);bpy.ops.render.render(write_still=True)
    if index%24==0:print(json.dumps({'event':'native_ident_frame','direction':direction,'frame':index+1,'total':count}),flush=True)
receipt={'status':'GENERATED_PENDING_REVIEW','model':'Authored exact-vector cinematic ident / Blender Cycles','modelRevision':bpy.app.version_string,
    'device':device,'settings':request,'duration':duration,'fps':fps,'renderedFrames':list(indices),
    'sourceBrief':request['sourceBrief'],'logoGeometrySha256':geometry_sha,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'nativeSceneSha256':hashlib.sha256(native.read_bytes()).hexdigest(),'renderSeconds':time.monotonic()-started,
    'editable':['exact vector geometry','layer depth/timing','materials','lights','camera','focus','sound cue timing'],
    'soundCues':request['soundCues'],'scope':'Private authored ident source, pending creative approval; not a customer Studio feature qualification.'}
(root/'render-receipt.json').write_text(json.dumps(receipt,indent=2))
