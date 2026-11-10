"""Align the existing word cues to the show title's left picture margin."""
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parent
WORK=ROOT/'private/continuity'
bpy.ops.wm.open_mainfile(filepath=str(WORK/'Real equipment shot.blend'))
for i in range(3):
    bpy.data.objects['Editorial word '+str(i)].location.x=-1.25
scene=bpy.data.scenes['Scene']
scene.render.filepath=str(WORK/'aligned-render')+'/'
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'Shot review.blend'))
