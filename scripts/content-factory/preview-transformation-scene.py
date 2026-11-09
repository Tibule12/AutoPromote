"""Inspect selected frames of the same native scene using the existing device policy."""
import hashlib,json,sys,time
from pathlib import Path
import bpy
sys.path.insert(0,'/app')
from blender_scene import configure_render_device
args=sys.argv[sys.argv.index('--')+1:];native=Path(args[0]);out=Path(args[1]);deadline=float(args[2]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(native));scene=bpy.context.scene;device=configure_render_device(scene)
if not device.get('gpu_verified'):raise RuntimeError('Authorized NVIDIA preview required')
rows=[]
for at in [1,round(scene.frame_end*.5),scene.frame_end]:
 if time.time()+30>=deadline:raise RuntimeError('Authorized window reached')
 scene.frame_set(at);destination=out/f'frame-{at:03d}.png';scene.render.filepath=str(destination);bpy.ops.render.render(write_still=True)
 rows.append({'frame':at,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'path':str(destination)})
(out/'preview-receipt.json').write_text(json.dumps({'status':'NATIVE_PREVIEW_PENDING_VISUAL_REVIEW','nativeSceneSha256':hashlib.sha256(native.read_bytes()).hexdigest(),'device':device,'frames':rows},indent=2))
