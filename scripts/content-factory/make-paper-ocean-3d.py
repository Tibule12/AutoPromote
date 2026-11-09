"""A reusable procedural raw asset, rendered by the existing Blender runtime."""
import json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,"/app")
from blender_scene import configure_render_device,simple_material
args=sys.argv[sys.argv.index("--")+1:];config=json.loads(Path(args[0]).read_text());out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
if config.get("template")!="paper_ocean" or set(config)-{"template","duration","fps","width","height","seed","sourceBrief"}:raise ValueError("Unsupported bounded 3D asset request")
duration=float(config.get("duration",4));fps=int(config.get("fps",24));w=int(config.get("width",1280));h=int(config.get("height",704))
if not .5<=duration<=10 or fps!=24 or (w,h)!=(1280,704):raise ValueError("3D asset geometry outside bounds")
bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;device=configure_render_device(scene);scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG";scene.render.fps=fps;scene.world.color=(.006,.01,.015)
scene.view_settings.view_transform="AgX";scene.view_settings.look="AgX - Medium High Contrast";scene.render.film_transparent=False
scene.world.use_nodes=True;scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.006,.012,.025,1);scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.06
scene.cycles.seed=int(config.get("seed",0))%2147483647
scene.cycles.max_bounces=6;scene.cycles.transparent_max_bounces=4
paper=simple_material("Tactile ivory paper","#e8d7b4",roughness=.7)
nodes=paper.node_tree.nodes;noise=nodes.new("ShaderNodeTexNoise");noise.inputs["Scale"].default_value=170
bump=nodes.new("ShaderNodeBump");bump.inputs["Strength"].default_value=.12;bump.inputs["Distance"].default_value=.008
paper.node_tree.links.new(noise.outputs["Fac"],bump.inputs["Height"]);paper.node_tree.links.new(bump.outputs["Normal"],nodes.get("Principled BSDF").inputs["Normal"])
wood=simple_material("Dark warm desk","#211812",roughness=.32)
water=simple_material("Miniature blue ocean","#124455",metallic=0,roughness=.07)
water.node_tree.nodes.get("Principled BSDF").inputs["Transmission Weight"].default_value=.68
water.node_tree.nodes.get("Principled BSDF").inputs["IOR"].default_value=1.333
def mesh(name,verts,faces,mat):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update();obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.data.materials.append(mat);return obj
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,-.42));desk=bpy.context.object;desk.name="Ordinary desk";desk.dimensions=(9,7,.65);desk.data.materials.append(wood)
bevel=desk.modifiers.new("Desk edge","BEVEL");bevel.width=.09;bevel.segments=3
# One blank sheet is the origin of the world, rather than an unrelated prop.
bpy.ops.mesh.primitive_plane_add(size=1,location=(2.8,1.5,-.075));sheet=bpy.context.object;sheet.name="Source idea";sheet.scale=(1.0,1.4,1);sheet.rotation_euler[2]=-.15;sheet.data.materials.append(paper)
rings=80;angles=384;verts=[(0,0,-.04)];faces=[]
for ring in range(1,rings+1):
 radius=2.8*ring/rings
 for j in range(angles):
  angle=2*math.pi*j/angles;verts.append((radius*math.cos(angle),radius*math.sin(angle),-.04))
for j in range(angles):faces.append((0,1+j,1+(j+1)%angles))
for ring in range(1,rings):
 first=1+(ring-1)*angles;second=first+angles
 for j in range(angles):faces.append((first+j,first+(j+1)%angles,second+(j+1)%angles,second+j))
ocean=mesh("An ocean from an idea",verts,faces,water)
for poly in ocean.data.polygons:poly.use_smooth=True
solid=ocean.modifiers.new("Water volume","SOLIDIFY");solid.thickness=.045
hull=mesh("Folded paper hull",[(-.24,-.7,.06),(.24,-.7,.06),(-.45,0,.25),(.45,0,.25),(-.24,.75,.06),(.24,.75,.06),(0,-.7,-.16),(0,.75,-.16),(0,0,-.2)],[(0,2,8,6),(1,6,8,3),(2,4,7,8),(3,8,7,5),(0,6,1),(4,5,7)],paper)
sail=mesh("One crisp triangular sail",[(0,-.66,.18),(0,.5,.18),(0,-.1,1.15),(.035,-.1,.55)],[(0,1,3),(1,2,3),(2,0,3)],paper)
for folded in (hull,sail):
 solid=folded.modifiers.new("Paper thickness","SOLIDIFY");solid.thickness=.009
 edge=folded.modifiers.new("Tactile fold edges","BEVEL");edge.width=.003;edge.segments=2
bpy.ops.object.empty_add();boat=bpy.context.object;boat.name="The idea";hull.parent=boat;sail.parent=boat
boat.location=(0,0,.1)
def light(name,loc,power,color,size):
 bpy.ops.object.light_add(type="AREA",location=loc);obj=bpy.context.object;obj.name=name;obj.data.energy=power;obj.data.color=color;obj.data.shape="DISK";obj.data.size=size;obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat("-Z","Y").to_euler()
light("Warm possibility",(-4,-2,5),1100,(1,.65,.32),4);light("Ocean edge",(2,3,4),850,(.24,.48,1),3);light("Paper readability",(2,-4,4),450,(1,.86,.65),4)
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.lens=48;camera.data.dof.use_dof=True;camera.data.dof.focus_object=boat;camera.data.dof.aperture_fstop=5.6
scene.render.filepath=str(out/"poster.png");frames=round(duration*fps)
camera.location=(3.5,-5.5,2.5);camera.rotation_euler=(Vector((0,0,.08))-camera.location).to_track_quat("-Z","Y").to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(out/"paper-ocean.blend"))
for i in range(frames):
 t=i/fps;progress=i/max(1,frames-1);e=progress*progress*(3-2*progress)
 camera.location=(3.5+4.3*e,-5.5-4.7*e,2.5+3.5*e);camera.rotation_euler=(Vector((0,0,.08))-camera.location).to_track_quat("-Z","Y").to_euler()
 boat.location=(.13*math.sin(t*.6),-.2+progress*.35,.1+.025*math.sin(t*2));boat.rotation_euler=(.02*math.sin(t*1.6),.055*math.cos(t*1.8),-.12+progress*.1)
 for vertex in ocean.data.vertices:
  x,y=vertex.co.x,vertex.co.y;r=math.sqrt(x*x+y*y)
  vertex.co.z=-.03+.035*math.sin(x*4+y*2-t*2)*max(0,1-(r/2.8)**4)+.017*math.sin(y*7-t*1.4)
 scene.render.filepath=str(out/f"frame_{i:04d}.png");bpy.ops.render.render(write_still=True)
 if i%12==0:print(json.dumps({"event":"raw_asset_frame","frame":i+1,"frames":frames}),flush=True)
(out/"scene-receipt.json").write_text(json.dumps({"tool":"Blender","version":bpy.app.version_string,"device":device,"frames":frames,"config":config,"status":"GENERATED_PENDING_REVIEW"},indent=2))
