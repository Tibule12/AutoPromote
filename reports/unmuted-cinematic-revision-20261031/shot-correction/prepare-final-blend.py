"""Use the refined native-model foreground in the same Blender shot."""
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parent
WORK=ROOT/'private/head-model'
assert len(list((WORK/'presenter').glob('*.png')))==72
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'private/attempt-2/Shot lighting and matte.blend'))
scene=bpy.data.scenes['Scene']
surface=bpy.data.objects['Source-bound presenter alpha surface']
texture=next(n for n in surface.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
texture.image=bpy.data.images.load(str(WORK/'presenter/000001.png'),check_existing=False)
texture.image.source='SEQUENCE';texture.image.colorspace_settings.name='sRGB'
texture.image_user.frame_start=1;texture.image_user.frame_duration=72;texture.image_user.use_auto_refresh=True
(WORK/'render').mkdir(exist_ok=True)
scene.render.filepath=str(WORK/'render')+'/'
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'Final shot.blend'))
