"""CPU geometry preparation only: project the editable boat into control space.

No render, inference or optical tracking is claimed. The resulting silhouette
is used to remove workbench/water-disc edges from a separate control video.
"""
import bpy,hashlib,json,sys
from pathlib import Path
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
source,output=map(Path,sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene;root=bpy.data.objects.get('One idea becomes a real vessel')
if not root or not scene.camera:raise RuntimeError('Expected editable transformation guide')
def hull(points):
 points=sorted(set(points))
 def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
 low=[];high=[]
 for point in points:
  while len(low)>1 and cross(low[-2],low[-1],point)<=0:low.pop()
  low.append(point)
 for point in reversed(points):
  while len(high)>1 and cross(high[-2],high[-1],point)<=0:high.pop()
  high.append(point)
 return low[:-1]+high[:-1]
frames=[]
for i in range(81):
 frame=round(scene.frame_start+(scene.frame_end-scene.frame_start)*i/80);scene.frame_set(frame);deps=bpy.context.evaluated_depsgraph_get();points=[]
 for obj in root.children_recursive:
  if obj.type!='MESH':continue
  evaluated=obj.evaluated_get(deps)
  size=(evaluated.matrix_world@Vector(evaluated.bound_box[6])-evaluated.matrix_world@Vector(evaluated.bound_box[0])).length
  if size<.03:continue
  mesh=evaluated.to_mesh()
  for vertex in mesh.vertices:
   p=world_to_camera_view(scene,scene.camera,evaluated.matrix_world@vertex.co)
   if p.z>0:points.append((round(p.x*(480*16/9)-(480*16/9-832)/2),round((1-p.y)*480)))
  evaluated.to_mesh_clear()
 polygon=hull(points)
 if len(polygon)<3:raise RuntimeError('Motion guide boat is outside the camera')
 frames.append({'index':i,'sceneFrame':frame,'polygon':polygon})
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps({'sourceNativeSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'tool':'CPU evaluated Blender geometry projection',
 'blender':bpy.app.version_string,'width':832,'height':480,'frames':frames,'limitation':'Boat silhouette projection; not generated pixels, segmentation-model inference or creative acceptance.'},indent=2))
print(json.dumps({'event':'motion_guide_projection_prepared','frames':len(frames)}),flush=True)
