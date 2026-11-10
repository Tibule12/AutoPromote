"""Full-size look development through canonical setup/pose/geometry functions."""
import sys,json,math,time
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'studio_3d_renderer'))
from spec import validate_spec
from blender_scene import setup_scene,pose
from objects import animate_objects
args=sys.argv[sys.argv.index('--')+1:]
spec=validate_spec(json.loads(Path(args[0]).read_text()));local=float(args[2]) if len(args)>2 else 4.5
scene,root,camera,animated=setup_scene(spec)
current=pose(spec['scene'],local);root.location=current['position'];root.scale=(current['scale'],)*3
root.rotation_euler=tuple(math.radians(angle) for angle in current['rotation'])
scene.node_tree.nodes['Timeline opacity'].inputs[1].default_value=current['opacity']
animate_objects(animated['objects'],local)
scene.render.filepath=args[1]
start=time.monotonic();bpy.ops.render.render(write_still=True)
print(json.dumps(dict(study=True,canonicalSetup=True,nativeStudioAuthoring=False,seconds=time.monotonic()-start,output=args[1])),flush=True)
