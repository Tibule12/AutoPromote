from pathlib import Path
import bpy,json,time,math
from mathutils import Vector
r=Path('/dev/shm/autopromote-background-finish-20261030');base=Path('/home/tibule12/Projects/AutoPromte/AutoPromote-model-runtime-v1/reports/studio-background-blender-trial-20261030/review/physical-room-test.blend');bpy.ops.wm.open_mainfile(filepath=str(base));s=bpy.context.scene;s.cycles.device='CPU';s.cycles.samples=32;s.render.compositor_device='CPU';s.render.threads_mode='FIXED';s.render.threads=2;s.view_settings.look='AgX - Medium High Contrast'
# Keep a single physical set for both angles and a visible motivation for the
# purple edge light already photographed on the host. Sources remain unchanged.
m=bpy.data.materials.new('Purple practical diffuser');m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.45,.19,.8,1);p.inputs['Emission Color'].default_value=(.45,.12,1,1);p.inputs['Emission Strength'].default_value=3
bpy.ops.mesh.primitive_cube_add(size=1,location=(2.91,2.12,2.2));o=bpy.context.object;o.name='Right purple practical';o.dimensions=(.018,.035,3.9);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
material=bpy.data.materials.new('Low sheen dark oak floor');material.use_nodes=True;p=material.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.065,.04,.026,1);p.inputs['Roughness'].default_value=.65;bpy.ops.mesh.primitive_plane_add(size=30,location=(0,0,-.03));bpy.context.object.data.materials.append(material)
def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='AREA',location=(2.9,1.6,2.7));light=bpy.context.object;light.name='Purple practical wall wash';light.data.energy=14;light.data.color=(.44,.15,1);light.data.size=2;aim(light,(2.5,2.4,2.5))
cameras=[('a',(-.35,-4.5,1.45),(.4,2.4,1.9),28),('b',(.15,-4.2,1.65),(-.15,2.3,2.0),34)];results=[]
for label,loc,target,lens in cameras:
 c=s.camera;c.location=loc;aim(c,target);c.data.lens=lens;c.data.dof.use_dof=True;c.data.dof.focus_distance=3.5;c.data.dof.aperture_fstop=4;s.render.filepath=str(r/f'podcast-acoustic-{label}-cpu-20261030.png');bpy.ops.wm.save_as_mainfile(filepath=str(r/f'podcast-acoustic-{label}-cpu-20261030.blend'));start=time.monotonic();bpy.ops.render.render(write_still=True);results.append({'camera':label,'cpuOnly':True,'seconds':time.monotonic()-start,'file':s.render.filepath});print(json.dumps(results[-1]),flush=True)
(r/'camera-pair-receipt.json').write_text(json.dumps({'blender':bpy.app.version_string,'device':s.cycles.device,'cameras':results,'samePhysicalRoom':True,'visualQualification':False},indent=2))
