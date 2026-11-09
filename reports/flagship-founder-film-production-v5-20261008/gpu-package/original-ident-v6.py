"""Original folded-aperture AutoPromote ident, editable in Blender.

The three physical blades form one sail/aperture mark. A camera travels from
their actual edge depth to the complete identity; only then does the wordmark
arrive. Sampled previews must be judged before any full render.
"""
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, '/app')
from blender_scene import configure_render_device, simple_material

request_path, output = map(Path, sys.argv[sys.argv.index('--')+1:])
request=json.loads(request_path.read_text())
if request.get('template')!='autopromote-folded-aperture-ident-v6':
    raise ValueError('Unexpected ident template')
if request.get('mode') not in ('preview','full') or not 3<=request['duration']<=6:
    raise ValueError('Bounded ident mode and duration required')
if time.time()+120>=request['deadlineEpoch']:
    raise RuntimeError('Current NVIDIA window too short')
output.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
device=configure_render_device(scene)
if not device['gpu_verified'] or not any('L40S' in n for n in device['devices']):
    raise RuntimeError('Verified NVIDIA L40S required')
fps=24;count=round(request['duration']*fps)
scene.render.resolution_x=request['render']['width']
scene.render.resolution_y=request['render']['height']
scene.render.resolution_percentage=100;scene.render.fps=fps
scene.render.image_settings.file_format='PNG';scene.render.image_settings.compression=0
scene.frame_start=1;scene.frame_end=count
scene.cycles.samples=request['render']['samples'];scene.cycles.use_denoising=True
scene.cycles.max_bounces=8;scene.cycles.transmission_bounces=6
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.002,.004,.011,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.025
timing={'assemblyStart':.18,'assemblyDuration':2.0,'cameraStart':.12,
        'cameraDuration':2.25,'wordmarkStart':2.12,'wordmarkDuration':.40,
        'lightStart':.10,'lightRise':.25,'impactAt':2.77,
        **request.get('timing',{})}
materials=request.get('materials',{})
lighting=request.get('lighting',{})

def ease(v):
    v=max(0,min(1,v));return v*v*(3-2*v)

def aim(obj,target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def blade(name, points, depth, material):
    """Make a closed, bevelled solid from a drawn X/Z polygon."""
    n=len(points);verts=[]
    pivot=Vector((sum(x for x,z in points)/n,0,sum(z for x,z in points)/n))
    for y in (-depth/2,depth/2):verts += [(x-pivot.x,y,z-pivot.z) for x,z in points]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    for i in range(n):faces.append((i,(i+1)%n,(i+1)%n+n,i+n))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    obj.location=pivot
    # Rotate each fold around its physical centre. The old world-origin pivot
    # swung the entire mark outside the close camera for the opening second.
    obj['rest_location']=list(pivot)
    obj.data.materials.append(material)
    mod=obj.modifiers.new('Machined edge and reflected thickness','BEVEL')
    mod.width=.022;mod.segments=3
    obj.modifiers.new('Weighted panel normals','WEIGHTED_NORMAL')
    return obj

def light(name,loc,target,power,color,width,height):
    bpy.ops.object.light_add(type='AREA',location=loc)
    obj=bpy.context.object;obj.name=name;obj.data.energy=power;obj.data.color=color
    obj.data.shape='RECTANGLE';obj.data.size=width;obj.data.size_y=height
    aim(obj,target)
    return obj

# The geometry is original: two unequal rising folds frame a right-facing
# triangular opening, while a third folded ribbon grounds the mark.
metal=simple_material('Shadowed anodized titanium',materials.get('structure','#40516b'),metallic=.95,roughness=materials.get('structureRoughness',.19))
violet=simple_material('Reflective folded face',materials.get('face','#6171a0'),metallic=.88,roughness=materials.get('faceRoughness',.16))
glass=simple_material('Smoked optical fold',materials.get('glass','#b9bbd7'),metallic=.12,roughness=materials.get('glassRoughness',.07))
glass.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=materials.get('transmission',.52)
glass.node_tree.nodes['Principled BSDF'].inputs['IOR'].default_value=1.46
textmat=simple_material('Quiet platinum typography','#e0e5f2',metallic=.48,roughness=.25)
obsidian=simple_material('Reflection field','#060912',metallic=.58,roughness=.24)

# World coordinates. The symbol is placed at -3.12; the original letterforms
# are constructed beside it with measured spacing, without raster tracing.
cx=-3.12
left=blade('Fold A | structural titanium',[(cx-1.00,-.72),(cx-.14,1.06),(cx+.07,1.07),(cx-.51,-.72)],.20,metal)
right=blade('Fold B | reflective violet',[(cx-.10,1.06),(cx+.91,-.72),(cx+.40,-.72),(cx-.29,.73)],.16,violet)
bridge=blade('Fold C | aperture keel',[(cx-.66,-.29),(cx+.43,-.29),(cx+.66,-.49),(cx-.78,-.49)],.12,glass)
parts=[left,right,bridge]
for part in parts:
    part['autopromote_editable_identity_part']=True

font=bpy.data.fonts.load(request['font'])
letters=[];cursor=-1.30
for index,char in enumerate('AutoPromote'):
    curve=bpy.data.curves.new('Identity glyph '+str(index),'FONT')
    curve.body=char;curve.font=font;curve.size=.60;curve.extrude=.018;curve.bevel_depth=.003
    obj=bpy.data.objects.new('AutoPromote / '+char+' / '+str(index),curve)
    bpy.context.collection.objects.link(obj);obj.rotation_euler[0]=math.pi/2
    obj.data.materials.append(textmat)
    bpy.context.view_layer.update()
    width=obj.dimensions.x
    obj.location=(cursor,-.02,-.23)
    letters.append((obj,cursor))
    cursor+=width+.007

floor=blade('Obsidian reflection plane',[(-20,-1.19),(20,-1.19),(20,-1.22),(-20,-1.22)],.0 if False else 24,obsidian)
floor.hide_render=False
key=light('Moving specular knife',(-6,-3.0,3.0),(cx,0,.1),0,(.68,.79,1),.13,5.5)
rim=light('Violet glass rim',(cx+.3,2.0,2.6),(cx,0,.1),0,(.50,.30,1),3.2,.18)
warm=light('Warm physical edge',(cx-1,-2.5,2.5),(cx,0,.2),0,(1,.67,.39),2.0,.14)
fill=light('Wordmark softbox',(.5,-3.5,4),(0,0,0),0,(.82,.88,1),7,3)

bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera
camera.data.lens=request['camera']['macroLens']
camera.data.dof.use_dof=True;camera.data.dof.aperture_fstop=5.6
bpy.ops.object.empty_add(location=(cx,0,.15));focus=bpy.context.object;focus.name='Identity camera focus'
camera.data.dof.focus_object=focus

for frame in range(1,count+1):
    t=(frame-1)/fps
    scene.frame_set(frame)
    exit_macro=ease((t-timing['cameraStart'])/timing['cameraDuration'])
    camera.location=Vector(request['camera'].get('start',[cx-.50,-2.90,.72])).lerp(Vector(request['camera'].get('end',[-.12,-10.2,.92])),exit_macro)
    target=Vector(request['camera'].get('startTarget',[cx-.28,0,.50])).lerp(Vector(request['camera'].get('endTarget',[-.12,0,.03])),exit_macro)
    aim(camera,target);focus.location=target
    camera.data.lens=request['camera']['macroLens']*(1-exit_macro)+request['camera']['lockupLens']*exit_macro
    camera.keyframe_insert('location',frame=frame)
    camera.keyframe_insert('rotation_euler',frame=frame)
    camera.data.keyframe_insert('lens',frame=frame)
    focus.keyframe_insert('location',frame=frame)
    # The blades rotate into a shared physical object, not a glow/fade.
    for index,part in enumerate(parts):
        lag=[0,.19,.42][index]
        q=ease((t-timing['assemblyStart']-lag)/(timing['assemblyDuration']-lag))
        part.location=Vector(part['rest_location'])+Vector(((index-1)*(.18*(1-q)),(-.35+index*.22)*(1-q),(.20-index*.16)*(1-q)))
        part.rotation_euler[1]=(1-q)*([-.63,.72,-.38][index])
        part.keyframe_insert('location',frame=frame)
        part.keyframe_insert('rotation_euler',frame=frame)
    # Each letter follows the same light-triggered lockup, with a short stagger.
    for index,(obj,x) in enumerate(letters):
        q=ease((t-timing['wordmarkStart']-index*.025)/timing['wordmarkDuration'])
        obj.location=(x+.11*(1-q),-.02+.26*(1-q),-.23-.27*(1-q))
        obj.scale=(max(.001,q),)*3
        obj.keyframe_insert('location',frame=frame)
        obj.keyframe_insert('scale',frame=frame)
    sweep=ease((t-timing['lightStart'])/timing['lightRise'])
    key.location.x=-5.3+6*ease((t-.15)/2.5);aim(key,(cx,0,.1))
    key.data.energy=lighting.get('keyPower',1850)*sweep*(1-.70*ease((t-2.5)/.6))
    rim.data.energy=lighting.get('rimPower',1100)*sweep*(1-.53*ease((t-2.5)/.7))
    warm.data.energy=lighting.get('warmPower',750)*ease((t-.3)/.25)*(1-.85*ease((t-1.8)/.4))
    fill.data.energy=lighting.get('fillPower',1050)*ease((t-2.1)/.65)
    for lamp in (key,rim,warm,fill):
        lamp.keyframe_insert('location',frame=frame)
        lamp.keyframe_insert('rotation_euler',frame=frame)
        lamp.data.keyframe_insert('energy',frame=frame)

scene.frame_set(count)
bpy.context.view_layer.update()
projected=[world_to_camera_view(scene,camera,obj.matrix_world@Vector(corner))
           for obj in parts+[obj for obj,x in letters] for corner in obj.bound_box]
lockup_bounds={'left':min(v.x for v in projected),'right':max(v.x for v in projected),
               'bottom':min(v.y for v in projected),'top':max(v.y for v in projected)}
if min(v.z for v in projected)<=0 or not (
    .045<=lockup_bounds['left']<lockup_bounds['right']<=.955 and
    .14<=lockup_bounds['bottom']<lockup_bounds['top']<=.86):
    raise RuntimeError('Complete identity must fit the final readable hold: '+json.dumps(lockup_bounds))
scene.frame_set(1)
native=output/'scene.blend';bpy.ops.wm.save_as_mainfile(filepath=str(native))
indices=sorted({0,round(.5*fps),round(1.35*fps),round(timing['impactAt']*fps),count-1}) if request['mode']=='preview' else range(count)
started=time.monotonic()
for index in indices:
    if time.time()+25>=request['deadlineEpoch']:
        raise RuntimeError('Current NVIDIA window reached')
    scene.frame_set(index+1)
    scene.render.filepath=str(output/f'frame_{index:04d}.png')
    bpy.ops.render.render(write_still=True)
    print(json.dumps({'event':'identity_frame','index':index,'total':count}),flush=True)
receipt={'status':'GENERATED_PENDING_CREATIVE_REVIEW','model':'AutoPromote original folded-aperture ident / Blender Cycles','modelRevision':bpy.app.version_string,
         'sourceBrief':request['sourceBrief'],'device':device,'settings':request,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
         'nativeSceneSha256':hashlib.sha256(native.read_bytes()).hexdigest(),'renderedFrames':list(indices),'fps':fps,'renderSeconds':time.monotonic()-started,
         'impactAt':timing['impactAt'],'resolvedTiming':timing,
         'lockupProjectedBounds':lockup_bounds,
         'editable':['original symbol geometry','fold positions','material transmission','camera path','lighting and timing','wordmark animation','sound cue timing']}
(output/'render-receipt.json').write_text(json.dumps(receipt,indent=2))
