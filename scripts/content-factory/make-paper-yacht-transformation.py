"""Bounded, editable material/scale/world transformation; no adjacent clips.

One scene and camera, connected mesh shape keys, animated material conversion,
folded sail expansion, reflected water and atmospheric depth. Raw asset only.
"""
import hashlib,json,math,random,sys,time
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,'/app')
from blender_scene import configure_render_device,simple_material
args=sys.argv[sys.argv.index('--')+1:];config=json.loads(Path(args[0]).read_text());out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
if config.get('template')!='paper_to_yacht' or set(config)-{'template','duration','fps','width','height','seed','sourceBrief','deadlineEpoch','buildOnly'}:raise ValueError('Unsupported bounded transformation')
duration=float(config.get('duration',6));fps=24;frames=round(duration*fps)
if not 4<=duration<=8 or (config.get('width',1280),config.get('height',720))!=(1280,720):raise ValueError('Unsupported transformation geometry')
started=time.monotonic();rng=random.Random(config['seed']);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;device=configure_render_device(scene);scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.fps=fps;scene.render.image_settings.file_format='PNG';scene.frame_end=frames
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.cycles.max_bounces=8;scene.cycles.seed=config['seed']%2147483647
scene.world.use_nodes=True;world=scene.world.node_tree;world.nodes.clear();sky=world.nodes.new('ShaderNodeTexSky');sky.sky_type='NISHITA';sky.sun_elevation=math.radians(12);sky.sun_rotation=math.radians(145);sky.altitude=.2;sky.air_density=1.1;sky.dust_density=2.0
background=world.nodes.new('ShaderNodeBackground');background.inputs['Strength'].default_value=.32;wo=world.nodes.new('ShaderNodeOutputWorld');world.links.new(sky.outputs['Color'],background.inputs['Color']);world.links.new(background.outputs[0],wo.inputs['Surface'])
def frame(p):return max(1,min(frames,round(p*(frames-1))+1))
def key(obj,prop,values):
 for p,v in values:setattr(obj,prop,v);obj.keyframe_insert(prop,frame=frame(p))
def socket_key(socket,values):
 for p,v in values:socket.default_value=v;socket.keyframe_insert('default_value',frame=frame(p))
def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def mesh(name,verts,faces,mat):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update();obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.data.materials.append(mat);return obj
def bevel(obj,width=.02):m=obj.modifiers.new('Soft physical edges','BEVEL');m.width=width;m.segments=3
def cube(name,loc,scale,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat);bevel(o);return o
paper=simple_material('Ivory paper fibres','#e8d7b5',roughness=.72)
wood=simple_material('Polished mahogany','#401c12',roughness=.23)
deckmat=simple_material('Teak deck','#9c6b43',roughness=.48)
canvas=simple_material('Cream woven canvas','#ebe0c3',roughness=.65)
metal=simple_material('Warm brushed brass','#ad8651',metallic=.85,roughness=.2)
# The retained renderer's rgba helper already converts sRGB pigments to linear
# light. Keep those values; a second conversion would crush the timber color.
for mat,scale,strength in [(paper,190,.15),(canvas,230,.12),(wood,6,.18),(deckmat,8,.09)]:
 nodes=mat.node_tree.nodes;tex=nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=scale;tex.inputs['Detail'].default_value=3
 bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=strength;bump.inputs['Distance'].default_value=.006;mat.node_tree.links.new(tex.outputs['Fac'],bump.inputs['Height']);mat.node_tree.links.new(bump.outputs[0],nodes.get('Principled BSDF').inputs['Normal'])
def conversion(name,target):
 mat=bpy.data.materials.new(name);mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear();outnode=nt.nodes.new('ShaderNodeOutputMaterial');mix=nt.nodes.new('ShaderNodeMixShader');mix.name='Material conversion';mix.label='Paper becomes real material'
 for i,source in enumerate([paper,target]):
  group=bpy.data.node_groups.new(name+str(i),'ShaderNodeTree');group.interface.new_socket(name='Shader',in_out='OUTPUT',socket_type='NodeSocketShader');groupout=group.nodes.new('NodeGroupOutput')
  bsdf=group.nodes.new('ShaderNodeBsdfPrincipled');source_bsdf=source.node_tree.nodes.get('Principled BSDF')
  for field in ['Base Color','Roughness','Metallic']:bsdf.inputs[field].default_value=source_bsdf.inputs[field].default_value
  tex=group.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=180 if i==0 else (220 if target==canvas else 7);bump=group.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.14;bump.inputs['Distance'].default_value=.005;group.links.new(tex.outputs['Fac'],bump.inputs['Height']);group.links.new(bump.outputs[0],bsdf.inputs['Normal']);group.links.new(bsdf.outputs[0],groupout.inputs[0]);node=nt.nodes.new('ShaderNodeGroup');node.node_tree=group;nt.links.new(node.outputs[0],mix.inputs[i+1])
 nt.links.new(mix.outputs[0],outnode.inputs['Surface']);socket_key(mix.inputs[0],[(0,0),(.28,0),(.68,1),(1,1)]);return mat
hullmat=conversion('Paper fibres to timber grain',wood);sailmat=conversion('Paper crease to woven canvas',canvas)
bpy.ops.object.empty_add();boat=bpy.context.object;boat.name='One idea becomes a real vessel';key(boat,'scale',[(0,(.3,)*3),(.2,(.3,)*3),(.8,(1,)*3),(1,(1,)*3)])
paper_verts=[];real_verts=[];faces=[];stations=33
for j in range(stations):
 u=j/(stations-1);x=-2.1+4.2*u;profile=math.sin(math.pi*u)**1.05
 for side in [-1,1]:
  for level in range(3):
   py=side*profile*[0,.62,.91][level];pz=[-.48,-.13,.18+.6*abs(2*u-1)][level]
   paper_verts.append((x,py,pz));real_verts.append((-4.5+9.5*u,side*(math.sin(math.pi*u)**.6)*[0,1.05,1.28][level],[-1.05,-.55,.34+.18*(2*u-1)**2][level]))
for j in range(stations-1):
 for side in range(2):
  for level in range(2):a0=j*6+side*3+level;b0=(j+1)*6+side*3+level;faces.append((a0,b0,b0+1,a0+1))
hull=mesh('Connected folded hull becomes yacht hull',paper_verts,faces,hullmat);hull.parent=boat;hull.shape_key_add(name='Folded paper');real=hull.shape_key_add(name='Real mahogany hull')
for v,co in zip(real.data,real_verts):v.co=co
key(real,'value',[(0,0),(.2,0),(.75,1),(1,1)]);solid=hull.modifiers.new('Material gains thickness','SOLIDIFY');solid.thickness=.035;bevel(hull,.022)
sub=hull.modifiers.new('Fold edges become crafted curves','SUBSURF');sub.levels=0;sub.render_levels=0
for p,v in [(0,0),(.5,0),(.58,1),(.68,2)]:sub.levels=v;sub.render_levels=v;sub.keyframe_insert('levels',frame=frame(p));sub.keyframe_insert('render_levels',frame=frame(p))
# Both sails begin as the recognisable boat's low central folded triangles.
for name,pverts,rverts in [('Central fold becomes mainsail',[(-1.0,0,.18),(.75,0,.18),(-.12,0,1.12)],[(-2.95,0,.62),(.12,0,.62),(.12,0,7.1)]),('Front fold becomes jib',[(.1,.04,.15),(1.1,.04,.25),(.15,.04,.8)],[(.25,.02,6.6),(4.6,.02,.52),(.25,.02,.65)])]:
 subdivisions=16;pv=[];rv=[];triangles=[];indices={}
 for row in range(subdivisions+1):
  for col in range(subdivisions+1-row):
   b=row/subdivisions;c=col/subdivisions;aa=1-b-c;indices[(row,col)]=len(pv)
   pv.append(tuple(Vector(pverts[0])*aa+Vector(pverts[1])*b+Vector(pverts[2])*c))
   position=Vector(rverts[0])*aa+Vector(rverts[1])*b+Vector(rverts[2])*c;position.y+=.32*math.sin(math.pi*b)*math.sin(math.pi*c);rv.append(tuple(position))
 for row in range(subdivisions):
  for col in range(subdivisions-row):
   triangles.append((indices[(row,col)],indices[(row+1,col)],indices[(row,col+1)]))
   if col<subdivisions-row-1:triangles.append((indices[(row+1,col)],indices[(row+1,col+1)],indices[(row,col+1)]))
 o=mesh(name,pv,triangles,sailmat);o.parent=boat;o.shape_key_add(name='Paper fold');shape=o.shape_key_add(name='Wind-filled canvas')
 for v,co in zip(shape.data,rv):v.co=co
 key(shape,'value',[(0,0),(.12,0),(.55,1),(1,1)]);solid=o.modifiers.new('Woven cloth thickness','SOLIDIFY');solid.thickness=.012
 wind=o.shape_key_add(name='Canvas catches the wind');wind.relative_key=shape
 for v,co in zip(wind.data,rv):v.co=co;v.co.y+=.04*math.sin(v.co.z*3)*math.sin(v.co.x*2)
 key(wind,'value',[(0,0),(.55,0),(.7,.8),(.85,.2),(1,.7)])
 for polygon in o.data.polygons:polygon.use_smooth=True
def grow(obj,start=.32,end=.7):
 size=tuple(obj.scale);obj.parent=boat;key(obj,'scale',[(0,(.001,)*3),(start,(.001,)*3),(end,size),(1,size)])
deck=cube('Deck emerges within the same hull',(0,0,.24),(7.3,1.65,.09),deckmat);grow(deck,.36,.73)
cabin=cube('Low mahogany cabin',(-.9,0,.54),(1.6,.85,.42),wood);grow(cabin,.48,.77)
def rod(name,a0,b0,radius,mat):
 midpoint=(Vector(a0)+Vector(b0))/2;bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=(Vector(b0)-Vector(a0)).length,location=midpoint);o=bpy.context.object;o.name=name;aim(o,b0);o.data.materials.append(mat);grow(o,.25,.57);return o
rod('Mast rises along the original crease',(.12,0,.3),(.12,0,7.2),.055,wood)
rod('Boom defines the folded sail edge',(.12,0,.64),(-2.95,0,.64),.027,metal)
for target in [(4.6,0,.32),(-4.1,0,.28),(.1,-1.2,.25),(.1,1.2,.25)]:rod('Rigging follows unfolding geometry',(.12,0,7.05),target,.009,metal)
# Reusable yacht fittings establish believable scale after the folds resolve.
darkglass=simple_material('Smoked cabin glazing','#091823',metallic=.25,roughness=.12)
for side in [-1,1]:
 for x in [-1.35,-.85,-.35]:
  window=cube('Cabin glazing',(x,side*.432,.57),(.34,.015,.17),darkglass);grow(window,.59,.82)
 for x in [-3.3,-2.5,-1.7,-.9,.9,1.7,2.5,3.3]:
  rod('Deck rail stanchion',(x,side*.82,.3),(x,side*.82,.69),.012,metal)
 rod('Continuous deck handrail',(-3.3,side*.82,.69),(3.3,side*.82,.69),.013,metal)
 for y in [side*.15,side*.3,side*.45,side*.6,side*.75]:
  plank=cube('Individual teak plank',(.05,y,.292),(7.05,.125,.025),deckmat);grow(plank,.45,.8)
for x in [-2.8,2.8]:
 cleat=cube('Deck mooring cleat',(x,-.6,.38),(.2,.045,.055),metal);grow(cleat,.65,.85)
desk=cube('Workbench becomes depth',(0,0,-.34),(8,6,.55),wood);key(desk,'location',[(0,(0,0,-.34)),(.2,(0,0,-.34)),(.72,(0,0,-5)),(1,(0,0,-8))])
water=simple_material('Reflective expanding ocean','#092e3b',roughness=.13);pbsdf=water.node_tree.nodes.get('Principled BSDF');pbsdf.inputs['Base Color'].default_value=(.004,.034,.065,1);pbsdf.inputs['Transmission Weight'].default_value=.12;pbsdf.inputs['IOR'].default_value=1.333
micro=water.node_tree.nodes.new('ShaderNodeTexNoise');micro.inputs['Scale'].default_value=55;micro.inputs['Detail'].default_value=4
microbump=water.node_tree.nodes.new('ShaderNodeBump');microbump.inputs['Strength'].default_value=.3;microbump.inputs['Distance'].default_value=.04;water.node_tree.links.new(micro.outputs['Fac'],microbump.inputs['Height']);water.node_tree.links.new(microbump.outputs[0],pbsdf.inputs['Normal'])
nt=water.node_tree;output=nt.nodes.get('Material Output');nt.links.remove(output.inputs['Surface'].links[0]);transparent=nt.nodes.new('ShaderNodeBsdfTransparent');mix=nt.nodes.new('ShaderNodeMixShader');geo=nt.nodes.new('ShaderNodeNewGeometry');distance=nt.nodes.new('ShaderNodeVectorMath');distance.operation='LENGTH';nt.links.new(geo.outputs['Position'],distance.inputs[0]);less=nt.nodes.new('ShaderNodeMath');less.operation='LESS_THAN';nt.links.new(distance.outputs['Value'],less.inputs[0]);socket_key(less.inputs[1],[(0,.75),(.16,1.0),(.36,4),(.64,30),(1,200)])
nt.links.new(less.outputs[0],mix.inputs[0]);nt.links.new(transparent.outputs[0],mix.inputs[1]);nt.links.new(pbsdf.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],output.inputs['Surface'])
bpy.ops.mesh.primitive_plane_add(size=1);sea=bpy.context.object;sea.name='One pool becomes the sea';sea.data.materials.append(water);ocean=sea.modifiers.new('Growing wave depth','OCEAN');ocean.geometry_mode='GENERATE';ocean.resolution=11;ocean.viewport_resolution=8;ocean.spatial_size=90;ocean.size=2;ocean.repeat_x=2;ocean.repeat_y=2;ocean.wind_velocity=20;ocean.choppiness=1.2;ocean.use_foam=True;ocean.foam_layer_name='wave_foam';ocean.foam_coverage=.3
# Retain real wave geometry, reflections and microstructure. The generated
# foam attribute produced large flat patches in actual frames; omit it until
# a separately qualified crest treatment exists.
ocean.use_foam=False
key(ocean,'wave_scale',[(0,.04),(.25,.05),(.72,1),(1,1)]);key(ocean,'time',[(0,0),(1,duration*.9)])
# Fine fibres become spray along the advancing bow; not a global particle layer.
spraymat=simple_material('Sunlit fibres and sea spray','#f7ead3',roughness=.2)
for i in range(70):
 p0=.24+rng.random()*.42;bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.017);o=bpy.context.object;o.name='Paper fibre to bow spray';o.data.materials.append(spraymat);side=rng.choice([-1,1]);x=3.5+rng.random()*.8;y=side*(.2+rng.random()*.5)
 key(o,'location',[(0,(0,0,-2)),(p0,(x*.32,y*.35,.08)),(min(.96,p0+.14),(x,y*2,.7+rng.random()*.65)),(1,(x+2,y*3,-.8))]);key(o,'scale',[(0,(.001,)*3),(p0,(1,.2,.025)),(min(.94,p0+.08),(1,)*3),(1,(.01,)*3)])
def light(name,loc,power,color,size):
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,1));return o
light('Amber light carried through the reveal',(-3,-4,7),600,(1,.64,.31),5);light('Blue reflected depth',(4,5,6),750,(.26,.55,1),5);light('Canvas edge light',(0,1,10),900,(1,.9,.7),4)
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.lens=40;cam.data.dof.use_dof=True;cam.data.dof.focus_object=boat;cam.data.dof.aperture_fstop=5.6
for p,loc,target in [(0,(1.8,-2.8,1.25),(0,0,.1)),(.2,(2,-3.2,1.7),(0,0,.25)),(.5,(9,-15,5.6),(0,0,2.3)),(.75,(12,-19,6.5),(0,0,3.2)),(1,(14,-22,7),(0,0,3.6))]:cam.location=loc;aim(cam,target);cam.keyframe_insert('location',frame=frame(p));cam.keyframe_insert('rotation_euler',frame=frame(p))
scene.use_nodes=True;comp=scene.node_tree;comp.nodes.clear();layers=comp.nodes.new('CompositorNodeRLayers');glow=comp.nodes.new('CompositorNodeGlare');glow.glare_type='FOG_GLOW';glow.threshold=2;glow.quality='HIGH';glow.mix=-.75;final=comp.nodes.new('CompositorNodeComposite');comp.links.new(layers.outputs['Image'],glow.inputs['Image']);comp.links.new(glow.outputs[0],final.inputs[0])
# Bake editable heave against this actual ocean surface. The hull must stay
# on the water rather than letting the animated wave field swallow it.
for at in range(1,frames+1):
 scene.frame_set(at);deps=bpy.context.evaluated_depsgraph_get();evaluated=sea.evaluated_get(deps)
 hit,position,normal,index=evaluated.ray_cast(Vector((0,0,20)),Vector((0,0,-1)))
 boat.location.z=(position.z if hit else 0)+.035;boat.keyframe_insert('location',frame=at)
 progress=(at-1)/max(1,frames-1);amplitude=max(0,min(1,(progress-.35)/.35))
 boat.rotation_euler=(math.radians(1.1)*math.sin(progress*math.pi*3)*amplitude,math.radians(.65)*math.sin(progress*math.pi*2.7)*amplitude,0);boat.keyframe_insert('rotation_euler',frame=at)
scene.frame_set(1);native=out/'paper-yacht.blend';bpy.ops.wm.save_as_mainfile(filepath=str(native))
if config.get('buildOnly'):print(json.dumps({'event':'transformation_native_scene_ready'}));sys.exit(0)
for i in range(frames):
 if time.time()+30>=config['deadlineEpoch']:raise RuntimeError('Authorized NVIDIA window reached')
 scene.frame_set(i+1);scene.render.filepath=str(out/f'frame_{i:04d}.png');bpy.ops.render.render(write_still=True)
 if i%12==0:print(json.dumps({'event':'native_transform_frame','frame':i+1,'frames':frames}),flush=True)
receipt={'status':'GENERATED_PENDING_VISUAL_REVIEW','model':'Blender connected paper-to-yacht transformation','modelRevision':bpy.app.version_string,'tool':'AutoPromote editable 3D raw asset','device':device,'sourceBrief':config['sourceBrief'],'settings':config,'nativeScene':'paper-yacht.blend','nativeSceneSha256':hashlib.sha256(native.read_bytes()).hexdigest(),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'frames':frames,'fps':fps,'seconds':time.monotonic()-started,'editable':['connected hull shape keys','sail unfold shape keys','paper-to-timber and paper-to-canvas material keys','mast and rigging growth','ocean expansion and wave depth','workbench descent','camera path','reflection lighting','fibre-to-spray trajectories','glow compositor'],'limitation':'Authored 3D transformation; visual quality and continuity with adjoining generated footage require separate review. No semantic transformation feature is declared released.'}
(out/'scene-receipt.json').write_text(json.dumps(receipt,indent=2))
