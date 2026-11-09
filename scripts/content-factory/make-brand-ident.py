"""Editable, bounded AutoPromote studio idents using the existing Blender runtime."""
import hashlib,json,math,random,sys,time
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,"/app")
from blender_scene import configure_render_device,simple_material
args=sys.argv[sys.argv.index("--")+1:]
config=json.loads(Path(args[0]).read_text());out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
style=config.get("style");styles={"cinematic","compute","minimal","creator"}
if style not in styles or config.get("template")!="autopromote_ident":raise ValueError("Unsupported ident direction")
duration=float(config.get("duration",3.5));fps=24;frames=round(duration*fps)
if not 2<=duration<=6:raise ValueError("Ident duration outside bounded contract")
rng=random.Random(config.get("seed",20261007));started=time.monotonic()
bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;device=configure_render_device(scene)
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG";scene.render.fps=fps;scene.frame_start=1;scene.frame_end=frames
scene.world.use_nodes=True;scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.006,.008,.018,1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.04
scene.view_settings.view_transform="AgX";scene.view_settings.look="AgX - Medium High Contrast"
scene.cycles.max_bounces=5;scene.cycles.seed=int(config.get("seed",20261007))%2147483647
metal=simple_material("AutoPromote brushed platinum","#e8e5ff",metallic=.85,roughness=.2)
floor_mat=simple_material("Ink reflection stage","#090b19",metallic=.75,roughness=.2)
def emission(name,color,power):
 m=simple_material(name,color,metallic=.3,roughness=.25);p=m.node_tree.nodes.get("Principled BSDF")
 p.inputs["Emission Color"].default_value=p.inputs["Base Color"].default_value;p.inputs["Emission Strength"].default_value=power;return m
violet=emission("Signature violet energy","#9678ff",3);cyan=emission("Compute cyan","#36dce5",2.5);pink=emission("Creator magenta","#f059bf",2.5)
bpy.ops.object.empty_add();brand=bpy.context.object;brand.name="Editable brand assembly"
bpy.ops.object.text_add(location=(0,0,1.5),rotation=(math.pi/2,0,0));logo=bpy.context.object;logo.name="AutoPromote editable wordmark"
logo.data.body="AutoPromote";logo.data.align_x="CENTER";logo.data.align_y="CENTER";logo.data.size=1
font_path=Path(config.get("fontPath","/work/python_media_worker/assets/fonts/StudioMotion-Bold.ttf"))
if not font_path.is_file():raise ValueError("Official existing Studio font required")
logo.data.font=bpy.data.fonts.load(str(font_path));logo.data.extrude=.065 if style!="minimal" else .018;logo.data.bevel_depth=.012;logo.data.bevel_resolution=3
bpy.context.view_layer.update();scale=8.8/logo.dimensions.x;logo.scale=(scale,scale,scale);logo.data.materials.append(metal);logo.parent=brand
def bar(name,loc,scale,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
 bevel=o.modifiers.new("Precision softened edge","BEVEL");bevel.width=.035;bevel.segments=3;return o
cut=bar("Violet edit line",(-4.4,-.13,.61),(.035,.035,.42),violet);cut.rotation_euler[1]=-.42;cut.parent=brand
cut2=bar("Companion edit line",(-4.2,-.13,.61),(.035,.035,.42),violet);cut2.rotation_euler[1]=-.42;cut2.parent=brand
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.06));bpy.context.object.name="Reflection stage";bpy.context.object.data.materials.append(floor_mat)
def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat("-Z","Y").to_euler()
def area(name,loc,power,color,size):
 bpy.ops.object.light_add(type="AREA",location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.color=color;o.data.shape="RECTANGLE";o.data.size=size;o.data.size_y=.5;aim(o,(0,0,1.3));return o
key=area("Travelling studio softbox",(-5,-4,5),1000,(.82,.86,1),5)
area("Violet sculpting rim",(3,2,4),1800,(.43,.22,1),4)
front=area("Front legibility",(0,-6,2.8),550,(.9,.92,1),6)
key.location=(-6,-3,4);key.keyframe_insert("location",frame=1);key.location=(5,-3,4);key.keyframe_insert("location",frame=round(frames*.65))
def keyscale(o,values):
 for frame,s in values:o.scale=s;o.keyframe_insert("scale",frame=frame)
brand.scale=(.001,.001,.001);brand.keyframe_insert("scale",frame=1)
brand.scale=(1,1,1);brand.keyframe_insert("scale",frame=round(frames*.42))
if style=="cinematic":
 brand.animation_data_clear();brand.scale=(1,1,1)
 front.data.energy=35;front.data.keyframe_insert("energy",frame=1);front.data.energy=600;front.data.keyframe_insert("energy",frame=round(frames*.58))
 key.data.energy=0;key.data.keyframe_insert("energy",frame=1);key.data.energy=1500;key.data.keyframe_insert("energy",frame=round(frames*.5));key.data.energy=600;key.data.keyframe_insert("energy",frame=round(frames*.75))
 scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.025
 # A travelling slit lights the extrusion before the complete identity resolves.
 sweep=area("Reveal slit",(-7,-1.5,2.7),2100,(.68,.5,1),.3)
 sweep.location=(-7,-1.5,2.7);sweep.keyframe_insert("location",frame=1);sweep.location=(7,-1.5,2.7);sweep.keyframe_insert("location",frame=round(frames*.65))
elif style=="compute":
 # Data paths converge beneath the wordmark; editable cubes retain each trajectory.
 for i in range(64):
  x=rng.uniform(-7,7);z=rng.uniform(.35,3.1);o=bar(f"Data packet {i:02}",(x,rng.uniform(.6,4),z),(.018,.018,.018),cyan if i%4 else violet)
  o.keyframe_insert("location",frame=1);o.location=(rng.uniform(-4.5,4.5),.6,.35+rng.random()*.16);o.keyframe_insert("location",frame=round(frames*.5))
  keyscale(o,[(1,(.018,.018,.018)),(round(frames*.5),(.045,.045,.045)),(round(frames*.75),(.001,.001,.001))])
 for j in range(7):bar(f"Compute trace {j}",(0,1.2+j*.45,.11),(11,.012,.012),cyan)
elif style=="minimal":
 logo.data.materials.clear();logo.data.materials.append(simple_material("Pearl enamel","#f2eeff",metallic=.3,roughness=.22))
 key.data.energy=1600;scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.11
 brand.scale=(.93,.93,.93);brand.keyframe_insert("scale",frame=1);brand.scale=(1,1,1);brand.keyframe_insert("scale",frame=round(frames*.65))
else:
 # Edit fragments cross the lens, then leave a clean resolved brand rather than permanent noise.
 for i in range(18):
  o=bar(f"Creator edit fragment {i}",(rng.uniform(-10,10),-.5,rng.uniform(.2,3.5)),(rng.uniform(.25,1.1),.025,.028),[violet,pink,cyan][i%3])
  o.rotation_euler[1]=-.5;o.keyframe_insert("location",frame=1);o.location.x=-o.location.x;o.keyframe_insert("location",frame=round(frames*.4))
  keyscale(o,[(1,tuple(o.scale)),(round(frames*.48),(.001,.001,.001))])
scene.use_nodes=True;nt=scene.node_tree;nt.nodes.clear();layers=nt.nodes.new("CompositorNodeRLayers");glow=nt.nodes.new("CompositorNodeGlare")
glow.glare_type="FOG_GLOW";glow.quality="HIGH";glow.threshold=1;glow.size=8;comp=nt.nodes.new("CompositorNodeComposite")
if style in {'cinematic','minimal'}:glow.threshold=2;glow.mix=-.65
nt.links.new(layers.outputs["Image"],glow.inputs["Image"]);nt.links.new(glow.outputs["Image"],comp.inputs["Image"])
bpy.ops.object.camera_add(location=(2.5,-16.5,3.1));cam=bpy.context.object;scene.camera=cam;cam.data.lens=52;aim(cam,(0,0,1.15))
cam.keyframe_insert("location",frame=1);cam.keyframe_insert("rotation_euler",frame=1)
cam.location=(0,-16,2.15);aim(cam,(0,0,1.2));cam.keyframe_insert("location",frame=round(frames*.7));cam.keyframe_insert("rotation_euler",frame=round(frames*.7))
scene.frame_set(frames//2);bpy.ops.wm.save_as_mainfile(filepath=str(out/"autopromote-ident.blend"))
for i in range(frames):
 if time.time()+30>=config["deadlineEpoch"]:raise RuntimeError("Authorized NVIDIA window reached")
 scene.frame_set(i+1);scene.render.filepath=str(out/f"frame_{i:04d}.png");bpy.ops.render.render(write_still=True)
 if i%12==0:print(json.dumps({"event":"brand_ident_frame","style":style,"frame":i+1,"frames":frames}),flush=True)
receipt={"tool":"Blender","version":bpy.app.version_string,"device":device,"frames":frames,"fps":fps,"config":config,
 "nativeScene":"autopromote-ident.blend","editable":["wordmark text","extrusion","materials","studio lights","camera keyframes","data/edit fragment trajectories","glow compositor"],
 "impactAt":round(duration*.42,3),"resolveAt":round(duration*.7,3),"renderSeconds":time.monotonic()-started,"status":"GENERATED_PENDING_REVIEW",
 "scriptSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
(out/"scene-receipt.json").write_text(json.dumps(receipt,indent=2))
