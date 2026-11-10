"""Second shot-only correction: retain geometry/camera, match existing lighting."""
from pathlib import Path
import math
import sys
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parents[2]/'studio_3d_renderer'))
from cinematic_scene import linear_hex,material
work=ROOT/'private/attempt-2'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'private/Corrected shot.blend'))
scene=bpy.context.scene
scene.render.filepath=str(work/'render')+'/'
(work/'render').mkdir(exist_ok=True)
scene.eevee.taa_render_samples=16
surface=bpy.data.objects['Source-bound presenter alpha surface']
node=next(n for n in surface.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
node.image=bpy.data.images.load(str(work/'presenter/000001.png'),check_existing=False)
node.image.source='SEQUENCE';node.image.colorspace_settings.name='sRGB'
node.image_user.frame_start=1;node.image_user.frame_duration=72;node.image_user.use_auto_refresh=True
for name in ['Walnut acoustic fins','Anodized frame']:
    mat=bpy.data.materials.get(name)
    if mat:mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=linear_hex('#56483f')
purple=material('Existing practical matched to photographed rim','#b965ae',.45,0,1.4)
for obj in bpy.data.objects:
    if obj.name.startswith('Wall practical') and abs(obj.location.x-3.3)<.1:
        obj.location.x=.0
        obj.data.materials.clear();obj.data.materials.append(purple)
light=bpy.data.lights.new('Matched soft rose backlight','AREA')
light.energy=190;light.color=(.72,.28,.56);light.shape='RECTANGLE';light.size=2;light.size_y=4
obj=bpy.data.objects.new('Matched soft rose backlight',light);bpy.context.collection.objects.link(obj)
obj.location=(.3,1.5,3.4)
obj.rotation_euler=(Vector((-1.0,2.6,2))-obj.location).to_track_quat('-Z','Y').to_euler()
# Warm broad illumination now exists on the set, corresponding to the source
# key. The presenter is colour-corrected recorded footage, not physically relit.
bpy.data.objects['key'].data.energy=850
bpy.data.objects['key'].data.color=(1,.84,.68)
bpy.data.objects['fill'].data.energy=400
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
scene.camera.data.dof.aperture_fstop=.8
# Focus is measured along the optical axis. The old off-axis target focused
# beyond the source plane, softening the presenter while the set stayed crisp.
bpy.data.objects['Presenter focus distance'].location=(.05,0,1.9)
scene.frame_set(1)
if '--no-dof' in sys.argv:
    scene.camera.data.dof.use_dof=False
else:
    # The actual A/B still showed that the blended video surface was softened
    # with scene DOF even after correcting focus. Use ordinary Blender scene
    # layers/compositing: sharp source pass over the defocused physical set.
    foreground=bpy.data.scenes.new('Recorded foreground pass')
    foreground.render.engine='BLENDER_EEVEE_NEXT'
    foreground.eevee.taa_render_samples=8
    foreground.render.resolution_x=1280;foreground.render.resolution_y=720
    foreground.render.resolution_percentage=100
    foreground.render.film_transparent=True
    foreground.render.fps=24;foreground.frame_start=1;foreground.frame_end=72
    foreground.view_settings.view_transform=scene.view_settings.view_transform
    source_copy=surface.copy();foreground.collection.objects.link(source_copy)
    source_copy.hide_render=False
    surface.hide_render=True
    # The repaired support belongs with the recorded boom, so its depth of
    # field and composite order must match that foreground pass as well.
    support=bpy.data.objects['Repaired original microphone support']
    support_copy=support.copy();foreground.collection.objects.link(support_copy)
    support_copy.hide_render=False;support.hide_render=True
    for name in ['key','fill']:
        foreground.collection.objects.link(bpy.data.objects[name])
    camera_copy=scene.camera.copy();camera_copy.data=scene.camera.data.copy()
    camera_copy.data.dof.use_dof=False
    foreground.collection.objects.link(camera_copy);foreground.camera=camera_copy
    scene.use_nodes=True;nodes=scene.node_tree.nodes;nodes.clear()
    background_pass=nodes.new('CompositorNodeRLayers');background_pass.label='Physical set and camera'
    foreground_pass=nodes.new('CompositorNodeRLayers');foreground_pass.scene=foreground
    foreground_pass.label='Recorded person: no optical blur added'
    over=nodes.new('CompositorNodeAlphaOver');over.inputs[0].default_value=1
    output=nodes.new('CompositorNodeComposite')
    scene.node_tree.links.new(background_pass.outputs['Image'],over.inputs[1])
    scene.node_tree.links.new(foreground_pass.outputs['Image'],over.inputs[2])
    scene.node_tree.links.new(over.outputs[0],output.inputs[0])
bpy.ops.wm.save_as_mainfile(filepath=str(work/'Shot lighting and matte.blend'))
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
frame=int(args[0]) if args else 1
scene.frame_set(frame)
scene.render.filepath=str(work/f'still-{frame:03d}.png')
bpy.ops.render.render(write_still=True)
