"""Shot-only edits to the exact rejected .blend, using existing Blender tools.

This is an editable scene correction, not an application/template expansion.
"""
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
REPORT=ROOT.parent
REPO=REPORT.parent.parent
sys.path.insert(0,str(REPO/'studio_3d_renderer'))
from cinematic_scene import linear_hex, smoother, box, material

baseline=REPORT/'private-local/engine/jobs/efaae1643c2a32511cc6d1f4241fcf2c8a4ae24c8734ca69151e3f3f3acaa79a/scene.blend'
bpy.ops.wm.open_mainfile(filepath=str(baseline))
scene=bpy.context.scene
work=ROOT/'private'
out=work/'render'
out.mkdir(exist_ok=True)
scene.frame_start=1; scene.frame_end=72; scene.render.fps=24
scene.render.resolution_x=1280; scene.render.resolution_y=720
scene.render.resolution_percentage=100
scene.eevee.taa_render_samples=48
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGB'
scene.render.filepath=str(out)+'/'
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35

# Remove the disconnected fake desk/support and the foreground columns. The
# actual photographed chair and complete original mic now supply seated context.
remove=['Podcast console','Console front reveal','Set microphone mount','Microphone console clamp',
        'Foreground architectural column','Column edge practical','Raised podcast platform','Platform bronze reveal']
for obj in list(bpy.data.objects):
    if any(obj.name==name or obj.name.startswith(name+'.') for name in remove):
        bpy.data.objects.remove(obj,do_unlink=True)
for name in ['Walnut acoustic fins','Anodized frame']:
    mat=bpy.data.materials.get(name)
    if mat:
        bsdf=mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value=linear_hex('#49423c')
        bsdf.inputs['Roughness'].default_value=.68
        bsdf.inputs['Metallic'].default_value=.05
for obj in bpy.data.objects:
    if obj.name.startswith('Walnut depth fin'):
        obj.dimensions.x=.075
    if obj.name.startswith('Wall practical'):
        # Existing strips retained as practical lights, below the old blown-out
        # brightness and moved away from the head/microphone silhouette.
        if abs(obj.location.x-.15)<.1:
            obj.location.x=3.3
for name in ['Warm practical strips','Cool practical strips']:
    mat=bpy.data.materials.get(name)
    mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=.8
for obj in bpy.data.objects:
    if obj.type=='LIGHT':
        obj.data.energy=520 if obj.name=='key' else 280
        obj.data.size=5
        obj.data.color=(1,.89,.78) if obj.name=='key' else (.83,.91,1)

surface=bpy.data.objects['Source-bound presenter alpha surface']
surface.location=(-.95,0,1.8)
surface.rotation_euler=(math.pi/2,0,0)
surface.scale=(3.6*800/720/2,3.6/2,1)
mat=surface.data.materials[0]
tex=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE')
tex.image=bpy.data.images.load(str(work/'presenter/000001.png'),check_existing=False)
tex.image.source='SEQUENCE'; tex.image.colorspace_settings.name='sRGB'
tex.image_user.frame_start=1; tex.image_user.frame_duration=72
tex.image_user.use_auto_refresh=True
next(n for n in mat.node_tree.nodes if n.type=='EMISSION').inputs['Strength'].default_value=1
post=box('Repaired original microphone support',(.75,-.025,.73),(.073,.073,1.65),
    material('Original stand charcoal','#17191c',.6,.2),bevel=.012)

# Keep show identity in the existing physical set; reduce its visual weight.
brand=bpy.data.objects['Dimensional show identity']; brand.location=(.9,2.1,2.75)
brand.data.size=.37; brand.data.extrude=.012
context=bpy.data.objects['Podcast context']; context.location=(.93,2.09,2.41); context.data.size=.085
headline=bpy.data.objects['Story statement']; headline.location=(1.45,1.6,.92)
headline.data.size=.16
camera=scene.camera
camera.animation_data_clear()
camera.data.lens=42
camera.data.dof.use_dof=True
focus=bpy.data.objects.new('Presenter focus distance',None)
bpy.context.collection.objects.link(focus)
focus.location=(-.95,0,1.95)
camera.data.dof.focus_object=focus
camera.data.dof.aperture_fstop=1.2
cards=[bpy.data.objects['Editorial word '+str(i)] for i in range(3)]
for i,card in enumerate(cards):
    card.animation_data_clear()
    card.location=(2.18,1.25,2.0-i*.39)
    card.rotation_euler=(0,0,0)
    for child in card.children:
        if child.name.startswith('Floating bronze type rail'):
            child.dimensions.x=2.25
        elif child.name.startswith('Editable word'):
            child.data.size=.185
        elif child.name.startswith('Rail warm edge'):
            child.location.x=-1.1
for frame in range(1,73):
    t=(frame-1)/24
    # One 12cm axial push; no orbit, tilt change or flat-person yaw.
    camera.location=(.05,-5.7+.12*smoother(t/3),1.9)
    target=Vector((.05,0,1.9))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.keyframe_insert('location',frame=frame)
    camera.keyframe_insert('rotation_euler',frame=frame)
    for i,card in enumerate(cards):
        # Original word cues at programme 5.26 / 6.10 / 6.36, now shot-relative.
        cue=[1.26,2.10,2.36][i]
        reveal=smoother((t-cue)/.2)
        card.hide_render=t<cue
        card.keyframe_insert('hide_render',frame=frame)
        for child in card.children:
            child.hide_render=t<cue
            child.keyframe_insert('hide_render',frame=frame)
        card.scale=(.86,.86,max(.001,.86*reveal))
        card.keyframe_insert('scale',frame=frame)
for obj in [camera]+cards:
    for curve in obj.animation_data.action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation='LINEAR'
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(work/'Corrected shot.blend'))
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if '--frame' in args:
    frame=int(args[args.index('--frame')+1]);scene.frame_set(frame)
    scene.render.filepath=str(ROOT/'frames'/f'candidate-{frame:03d}.png')
    bpy.ops.render.render(write_still=True)
else:
    bpy.ops.render.render(animation=True)
