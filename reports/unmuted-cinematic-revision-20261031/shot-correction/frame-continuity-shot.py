"""Reframe the same Blender set around the actual photographed boom.

The hidden source stand is outside the shot; no substitute geometry is used.
"""
from pathlib import Path
import sys
import bpy

ROOT=Path(__file__).resolve().parent
WORK=ROOT/'private/continuity'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'private/head-model/Final shot.blend'))
scene=bpy.data.scenes['Scene']
for obj in list(bpy.data.objects):
    if obj.name.startswith('Repaired original microphone support'):
        bpy.data.objects.remove(obj,do_unlink=True)
for obj in bpy.data.objects:
    if obj.name.startswith('Source-bound presenter alpha surface'):
        obj.location=(.6,0,1.8)
        obj.scale=(3.6*1280/1000/2,3.6/2,1)
surface=bpy.data.objects['Source-bound presenter alpha surface']
texture=next(n for n in surface.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
texture.image=bpy.data.images.load(str(WORK/'presenter/000001.png'),check_existing=False)
texture.image.source='SEQUENCE';texture.image.colorspace_settings.name='sRGB'
texture.image_user.frame_start=1;texture.image_user.frame_duration=72
texture.image_user.use_auto_refresh=True
bpy.data.objects['Dimensional show identity'].location=(-2.55,2.1,2.75)
bpy.data.objects['Podcast context'].location=(-2.52,2.09,2.41)
bpy.data.objects['Story statement'].location=(-2.3,1.6,.92)
for i in range(3):
    obj=bpy.data.objects['Editorial word '+str(i)]
    # Existing word cue timing is retained, changing only horizontal layout.
    curve=next(c for c in obj.animation_data.action.fcurves if c.data_path=='location' and c.array_index==0) if any(c.data_path=='location' and c.array_index==0 for c in obj.animation_data.action.fcurves) else None
    if curve:
        for key in curve.keyframe_points:key.co.y=-1.85
    obj.location.x=-1.85
for obj in bpy.data.objects:
    if obj.name.startswith('Wall practical') and abs(obj.location.x)<.1:
        obj.location.x=2.3
light=bpy.data.objects.get('Matched soft rose backlight')
if light:light.location.x=2.7
(WORK/'render').mkdir(exist_ok=True)
scene.render.filepath=str(WORK/'render')+'/'
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'Real equipment shot.blend'))
if '--still' in sys.argv:
    frame=int(sys.argv[sys.argv.index('--still')+1]);scene.frame_set(frame)
    scene.render.filepath=str(WORK/f'still-{frame:03d}.png')
    bpy.ops.render.render(write_still=True)
