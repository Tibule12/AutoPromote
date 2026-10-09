"""Source-grounded, reusable founder-film raw scenes. Runs in Studio Blender.

No final editing here: each scene is a reusable take, assembled later by
contentFactoryStudioAdapter and the existing Studio renderer.
"""
import bpy,json,sys,math,re,time,hashlib,random
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,'/app')
from blender_scene import configure_render_device,simple_material
args=sys.argv[sys.argv.index('--')+1:];request=json.loads(Path(args[0]).read_text());root=Path(args[1]);mode=args[2] if len(args)>2 else 'preview'
T=root/'textures';OUT=root/'assets';OUT.mkdir(exist_ok=True)
if mode not in {'preview','render'}:raise ValueError('Unsupported production phase')
if request['duration']!=66 or len(request['scenes'])!=11:raise ValueError('Expected the reviewed story contract')
rng=random.Random(20261008)
def ease(t):return max(0,min(1,t))**2*(3-2*max(0,min(1,t)))
def aim(o,p):
 # Explicit world-up basis prevents to_track_quat roll when sightline approaches Z.
 f=(Vector(p)-o.location).normalized();right=f.cross(Vector((0,1,0))).normalized();up=right.cross(f).normalized()
 q=Matrix((right,up,-f)).transposed().to_quaternion()
 if q.w<0:q.negate()
 o.rotation_mode='QUATERNION';o.rotation_quaternion=q
def cube(name,loc,dims,mat,bevel=.035):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dims;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:m=o.modifiers.new('Machined edge','BEVEL');m.width=bevel;m.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def label(value,loc,size=.24,mat=None,align='CENTER',extrude=.003):
 cu=bpy.data.curves.new(value[:60],'FONT');cu.body=value;cu.align_x=align;cu.align_y='CENTER';cu.size=size;cu.font=bpy.data.fonts.load(str(T/'font.ttf'),check_existing=True);cu.extrude=extrude;cu.bevel_depth=.001
 o=bpy.data.objects.new(value[:60],cu);bpy.context.collection.objects.link(o);o.location=loc;cu.materials.append(mat or ivory);return o
def tube(name,coords,mat,r=.018):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=3;sp=cu.splines.new('POLY');sp.points.add(len(coords)-1)
 for p,v in zip(sp.points,coords):p.co=(*v,1)
 o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);cu.materials.append(mat);return o
def picture(name,loc,width,height,filename,movie=False):
 # Physical carrier with a bright, readable source surface, not a flat overlay.
 backing=cube(name+' platinum carrier',loc,(width+.10,height+.10,.11),metal,.055)
 bpy.ops.mesh.primitive_plane_add(size=1,location=(loc[0],loc[1],loc[2]+.062));o=bpy.context.object;o.name=name+' source surface';o.scale=(width,height,1);o.parent=backing;o.matrix_parent_inverse=backing.matrix_world.inverted()
 image=bpy.data.images.load(str(T/filename),check_existing=not movie)
 ma=bpy.data.materials.new(name+' source');ma.use_nodes=True;nt=ma.node_tree;nt.nodes.clear();tex=nt.nodes.new('ShaderNodeTexImage');tex.image=image
 if movie:image.source='SEQUENCE';tex.image_user.frame_duration=120;tex.image_user.frame_start=1;tex.image_user.use_auto_refresh=True;tex.image_user.use_cyclic=True
 em=nt.nodes.new('ShaderNodeEmission');em.inputs['Strength'].default_value=.85;out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(tex.outputs['Color'],em.inputs['Color']);nt.links.new(em.outputs[0],out.inputs['Surface']);o.data.materials.append(ma)
 return backing
def keys(o,prop,values):
 for f,value in values:setattr(o,prop,value);o.keyframe_insert(prop,frame=f)

def svg_contours(path):
 """Exact quadratic→cubic conversion; no raster tracing or silhouette erosion."""
 tokens=re.findall(r'[A-Za-z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?',path);i=0;cmd=None;cur=(0,0);start=None;contours=[];items=[]
 def take(n):
  nonlocal i
  vals=[float(v) for v in tokens[i:i+n]];i+=n;return vals
 while i<len(tokens):
  if tokens[i].isalpha():cmd=tokens[i];i+=1
  if cmd=='Z':
   if cur!=start:items.append((cur,cur,start,start))
   contours.append(items);items=[];cur=start;cmd=None;continue
  if cmd=='M':
   cur=tuple(take(2));start=cur;cmd='L';continue
  if cmd=='L':end=tuple(take(2));items.append((cur,cur,end,end));cur=end
  elif cmd=='H':end=(take(1)[0],cur[1]);items.append((cur,cur,end,end));cur=end
  elif cmd=='V':end=(cur[0],take(1)[0]);items.append((cur,cur,end,end));cur=end
  elif cmd=='C':a,b,c,d,e,f=take(6);end=(e,f);items.append((cur,(a,b),(c,d),end));cur=end
  elif cmd=='Q':a,b,c,d=take(4);end=(c,d);c1=(cur[0]+2*(a-cur[0])/3,cur[1]+2*(b-cur[1])/3);c2=(end[0]+2*(a-end[0])/3,end[1]+2*(b-end[1])/3);items.append((cur,c1,c2,end));cur=end
  else:raise ValueError('Unsupported original SVG command '+str(cmd))
 return contours

def outline(part,transform,offset,scale,material):
 cu=bpy.data.curves.new(part['id']+' original Beziers','CURVE');cu.dimensions='2D';cu.fill_mode='BOTH';cu.resolution_u=16;cu.extrude=.08;cu.bevel_depth=.008;cu.bevel_resolution=3
 a,b,c,d,e,f=transform
 def co(p):x,y=p;return ((a*x+c*y+e+offset[0])*scale,-(b*x+d*y+f+offset[1])*scale,0)
 for segments in svg_contours(part['path']):
  sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(segments)-1);sp.use_cyclic_u=True
  for j,seg in enumerate(segments):
   bp=sp.bezier_points[j];bp.co=co(seg[0]);bp.handle_left_type='FREE';bp.handle_right_type='FREE';bp.handle_right=co(seg[1]);bp.handle_left=co(segments[j-1][2])
 o=bpy.data.objects.new(part['id'],cu);bpy.context.collection.objects.link(o);cu.materials.append(material);return o

for shot in request['scenes']:
 if request.get('only') and shot['id'] not in request['only']:continue
 if time.time()+5>=request['deadlineEpoch']:raise RuntimeError('Bounded film deadline reached')
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 scene=bpy.context.scene;device=configure_render_device(scene)
 if not device['gpu_verified'] or not any('L40S' in n for n in device['devices']):raise RuntimeError('This film requires the authorized NVIDIA L40S')
 scene.render.resolution_x=1920 if shot['id']=='ident' else 1280;scene.render.resolution_y=1080 if shot['id']=='ident' else 720;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.render.fps=24;scene.frame_start=1;N=round(shot['duration']*24);scene.frame_end=N
 scene.cycles.samples=request.get('samples',24) if shot['id']!='ident' else request.get('identSamples',48);scene.cycles.max_bounces=5;scene.cycles.seed=20261008;scene.cycles.use_animated_seed=False
 scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.006,.008,.022,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.06
 scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
 metal=simple_material('Brushed platinum','#c1bccf',.9,.22);ink=simple_material('Ink glass stage','#0b0d18',.72,.22);ivory=simple_material('Story ivory','#f4f0ff',.15,.34,.3)
 violet=simple_material('Living edit line','#aa8aff',.3,.22,3);warm=simple_material('Conversation signal','#f0ad73',.2,.24,2);red=simple_material('Failure signal','#df705b',.2,.32,1.2)
 cube('Reflecting architectural floor',(0,-3.5,-6),(48,.16,70),ink,.06)
 for name,loc,power,color,size in [('Soft studio key',(-5,5,9),1700,(.86,.88,1),7),('Violet depth rim',(7,2,-1),2100,(.46,.24,1),6),('Warm practical',(-6,-1,2),900,(1,.58,.28),5)]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,-1))
 bpy.ops.object.camera_add(location=(0,.25,14));cam=bpy.context.object;cam.name='Narrative camera';cam.data.lens=50;scene.camera=cam;aim(cam,(0,0,-1));cam.data.clip_end=150
 movers=[];waveforms=[];sid=shot['id']
 if sid in {'cold-open','magic'}:
  # Recurring physical edit gate: the second occurrence explains the hook.
  gates=[]
  for j in range(9):
   z=-j*1.9;x=.5*math.sin(j*.6);y=.3*math.cos(j*.4)
   for k,(loc,dims) in enumerate([((x-4.1,y,z),(.11,4.8,.19)),((x+4.1,y,z),(.11,4.8,.19)),((x,y+2.4,z),(8.3,.11,.19)),((x,y-2.4,z),(8.3,.11,.19))]):
    gate=cube('Film gate %02d edge %d'%(j,k),loc,dims,metal if k!=3 else violet,.04);gates.append(gate)
  picture('Generated ocean world',(0,0,-18),17,9.55,'ocean-0001.jpg',True)
  tube('One edit becomes a route',[(-5+10*j/80,-2.5+.13*math.sin(j*.17),-.1-j*.23) for j in range(81)],violet,.022)
  if sid=='magic':
   for j,name in enumerate(['SOURCE TAKE','STORY BEAT','SOUND CUE']):label(name,(-3.6+j*3.6,-2.9,1.2),.19,ivory)
 elif sid in {'origin','cascade','problems'}:
  a=picture('Camera A',(-2.55,.2,0),4.6,2.75,'podcast-host.png');b=picture('Camera B',(2.55,.2,-.4),4.6,2.75,'podcast-guest.png')
  for j,name in enumerate(['CAMERA A','CAMERA B']):label(name,(-2.55+5.1*j,2,0),.23)
  for track in range(2):
   for j in range(90):
    amp=.1+.45*(.5+.5*math.sin(j*.61))*(.3+.7*math.sin(j*.19)**2);o=cube('Conversation pulse %d %03d'%(track,j),(-4.7+j*.106,-1.85-track*.45,.15),(.045,amp,.045),warm if track==0 else violet,.01);waveforms.append((o,o.location.copy(),track))
  if sid=='cascade':
   e=picture('Failure in the route',(0,0,-6),8,5,'error.png');movers += [(a,'fracture',0),(b,'fracture',1),(e,'approach',2)]
  elif sid=='problems':
   for j in range(6):
    p=picture('New format %d'%j,((-1 if j%2 else 1)*(4+j*.3),(-1 if j%3 else 1)*1.9,-2-j*.85),1.35 if j%2 else 2.9,2.4 if j%2 else 1.6,'podcast-host.png' if j%2 else 'podcast-guest.png');movers.append((p,'branch',j))
   label('Every answer opened another problem.',(0,2.9,0),.3)
 elif sid=='failure':
  for j in range(5):
   p=picture('Archived failure %d'%j,(-1.4+j*.58,.45-j*.16,-j*1.25),7.8,4.88,'error.png');p.rotation_euler[1]=-.04+j*.03;movers.append((p,'stack',j))
  tube('Unresolved route',[(-6,-2.65,-j*.2) for j in range(60)],red,.02)
 elif sid=='quota':
  picture('Historical L4 quota denial',(-3.8,.4,-1.2),4.8,3,'quota-zero.png')
  zero=label('0',(2.4,.15,.1),4.5,metal,extrude=.19);label('GPU CAPACITY',(2.4,-2.1,.4),.22,red)
  for j in range(3):cube('Closed capacity gate %d'%j,(2.4,.1,-1.4-j*2),(4.3,5,.12),ink,.04)
 elif sid=='breakthrough':
  for side in [-1,1]:
   o=cube('Capacity door '+str(side),(side*2.5,0,0),(4.95,7,.38),ink,.05);movers.append((o,'door',side))
  z0=label('0',(2.4,.15,.22),4.5,metal,extrude=.19);movers.append((z0,'zero-release',0))
  picture('Real quota grant',(0,0,-2),9,5.625,'quota-grant.png');label('RTX PRO 6000',(0,-2.65,1),.34,ivory)
  for j in range(45):
   x=rng.uniform(-5,5);y=rng.uniform(-2.7,2.7);o=cube('Released signal %02d'%j,(x,y,-3-rng.random()*8),(.023,.023,.20),violet,.007);movers.append((o,'signal',j))
 elif sid=='director':
  for j,(name,z,x,y) in enumerate([('director',-2,-2.25,.5),('rtx-proof',-5,3,.5)]):
   p=picture('Source-grounded '+name,(x,y,z),6.6,4.125,name+'.png');p.rotation_euler[1]=-.08 if j==0 else .1
  picture('Accepted generated take',(0,-.3,1.2),4.3,2.42,'ocean-0001.jpg',True)
  for j,name in enumerate(['UNDERSTAND','CREATE','ASSEMBLE']):label(name,(-3.9+j*3.9,-2.55,1.3),.23,ivory)
  tube('Editorial assembly',[(-6+j*.15,-3+.15*math.sin(j*.18),.7) for j in range(81)],violet,.025)
 elif sid=='reveal':
  # A final render may not claim execution until the canonical adapter receipts exist.
  picture('AutoPromote source-aware Studio',(-3,1,-2),7,3.94,'workspace-studio.png')
  picture('Film source ocean',(3,1,-3),5.8,3.26,'ocean-0001.jpg',True)
  label('The film you just watched',(0,-1.45,1.2),.43,ivory)
  label('was created by AutoPromote.',(0,-2.18,1.2),.43,ivory)
  for j,s in enumerate(request['scenes'][:-1]):
   o=cube('This film shot '+s['id'],(-4.5+j*.99,.04,1.1),(.85,.38,.07),violet if j>5 else warm,.03)
 elif sid=='ident':
  g=json.loads((T/'logo-geometry.json').read_text());ident=request.get('ident',{});scale=8.8/g['lockup']['width'];offset=(-g['lockup']['width']/2,-g['lockup']['height']/2)
  glass=simple_material('Architectural smoke glass','#6c568f',.25,.15);glass.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=ident.get('materials',{}).get('glassTransmission',.55);glass.node_tree.nodes['Principled BSDF'].inputs['IOR'].default_value=ident.get('materials',{}).get('glassIOR',1.46)
  for i,p in enumerate(g['symbolParts']):
   for layer in range(3):
    rear=dict(p,id=p['id']+'-material-layer-'+str(layer));r=outline(rear,g['symbolTransform'],(offset[0]+31,offset[1]+36),scale,glass if layer==1 else ink);r.data.extrude=.028;r.data.bevel_depth=.009;r.location.z=-.26+layer*.075;movers.append((r,'logo-layer',i*3+layer))
   st=g['symbolTransform'];o=outline(p,st,(offset[0]+31,offset[1]+36),scale,simple_material(p['id']+' anodized violet',p['fill'],.78,.18));o.location.z=.035*i;movers.append((o,'logo',i))
  for i,p in enumerate(g['wordmark']['parts']):
   o=outline(p,p['transform'],(offset[0]+230,offset[1]+164),scale,simple_material('Readable platinum '+p['id'],'#e5dff1',.65,.23,.14));movers.append((o,'letter',i))
  # Reflection and light sculpt actual extruded vector parts. No scaling distortion.
  bpy.ops.object.light_add(type='AREA',location=(-8,1,3));sweep=bpy.context.object;sweep.name='Editable moving reveal slit';sweep.data.energy=2300;sweep.data.shape='RECTANGLE';sweep.data.size=.22;sweep.data.size_y=5;aim(sweep,(0,0,0))
  movers.append((sweep,'sweep',0));cam.data.lens=56
  for light in [o for o in scene.objects if o.type=='LIGHT' and o!=sweep]:light.data.energy*=.55
  bpy.ops.object.light_add(type='AREA',location=(0,2,8));fill=bpy.context.object;fill.name='Clean lockup softbox';fill.data.energy=ident.get('lighting',{}).get('lockupFill',2000);fill.data.shape='RECTANGLE';fill.data.size=9;fill.data.size_y=4;aim(fill,(0,0,0));movers.append((fill,'fill',0))
 # Use direct per-frame quaternions; Euler interpolation previously rolled the camera.
 scene.use_nodes=True;nt=scene.node_tree;nt.nodes.clear();rl=nt.nodes.new('CompositorNodeRLayers');gl=nt.nodes.new('CompositorNodeGlare');gl.glare_type='FOG_GLOW';gl.quality='HIGH';gl.threshold=2;gl.size=8;gl.mix=-.85;co=nt.nodes.new('CompositorNodeComposite');nt.links.new(rl.outputs['Image'],gl.inputs['Image']);nt.links.new(gl.outputs['Image'],co.inputs['Image'])
 bases={o.name:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o,_,_ in movers}
 out=OUT/('ident-final' if sid=='ident' else sid);out.mkdir(exist_ok=True)
 def pose(frame):
  scene.frame_set(frame);p=(frame-1)/max(1,N-1);e=ease(p);t=(frame-1)/24
  cam.location=(2.4*(1-e)+.35,1.1-.5*e,15-1.0*e);aim(cam,(0,0,-.2))
  if sid in {'cold-open','magic'}:
   ep=e if sid=='cold-open' else 1-e;cam.location=(1.6*(1-ep),.3,9-6.6*ep);aim(cam,(0,0,-18));cam.data.lens=42
  elif sid=='quota':cam.location=(3.2-1.4*e,.85-.55*e,14-1.9*e);aim(cam,(1.2,0,0))
  elif sid=='breakthrough':cam.location=(1.8*(1-e),.3,12.1+1.0*e);aim(cam,(1.2*(1-e),0,-1.1))
  elif sid=='failure':cam.location=(-.8+.6*e,.15,15-1.5*e);aim(cam,(0,.1,-1))
  elif sid=='ident':ic=request.get('ident',{});cc=ic.get('camera',{});resolve=ease((t-.8)/max(.1,cc.get('resolveSeconds',3.2)-.8));targetx=cc.get('symbolTargetX',-3.75)*(1-resolve);near=cc.get('macroDistance',7.4);far=cc.get('lockupDistance',14.6);cam.location=(targetx+1.0*(1-resolve),.5*(1-resolve),near+(far-near)*resolve);aim(cam,(targetx,0,0));cam.data.lens=cc.get('lens',56)
  for o,base,track in waveforms:
   o.location=base;o.location.x += (1-ease(p/.7))*(1 if track else -1)*.62
   o.scale.y=1+.12*math.sin(t*4+base.x*2-track)
  for o,kind,i in movers:
   loc,rot,sc=bases[o.name];o.location=loc.copy();o.rotation_euler=rot.copy();o.scale=sc.copy()
   if kind=='door':o.location.x += i*5.7*ease((p-.10)/.58)
   elif kind=='logo-layer':
    q=ease((p-(.08+(i%3)*.025+(i//3)*.09))/.32);o.location.z=loc.z-(1-q)*(2.8+(i%3)*.8);o.rotation_euler[1]=(1-q)*(-.24+(i%3)*.16);o.scale=(q,q,q)
   elif kind=='zero-release':o.location.x+=5.7*ease((p-.10)/.58);o.location.z-=.8*e
   elif kind=='signal':o.location.z += 1.6*e;o.scale=tuple(v*(.25+.75*math.sin(p*math.pi)) for v in sc)
   elif kind=='fracture':q=ease((p-.3)/.55);o.location.x += (-1 if i==0 else 1)*4*q;o.location.z+=q*.7;o.rotation_euler[1]+=(-1 if i==0 else 1)*q*.6
   elif kind=='approach':o.location.z+=3.7*ease((p-.25)/.7)
   elif kind=='stack':o.location.z+=.15*e;o.location.x+=.10*math.sin(t*.4+i)
   elif kind=='branch':o.location.x+=(.3 if i%2 else -.3)*e;o.location.z+=.5*e;o.rotation_euler[1]=.08*math.sin(t*.7+i)
   elif kind in {'logo','letter'}:
    start=.07+i*.12 if kind=='logo' else .30+i*.010;q=ease((p-start)/.25)
    if kind=='logo':
     o.location.z=loc.z-(1-q)*1.8;o.rotation_euler[1]=(1-q)*.30;o.location.x=loc.x+(1-q)*(-.20 if i%2 else .20);o.scale=(q,q,q)
    else:
     # Wordmark stays proportionally correct: depth and grazing light reveal it.
     begin=2.25+i*.03;lock=request.get('ident',{}).get('timing',{}).get('wordmarkLock',3.2);q=ease((t-begin)/max(.1,lock-begin));o.location.z=loc.z-(1-q)*1.8;o.scale=(1,1,1);o.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=0;o.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].keyframe_insert('default_value',frame=frame);basecolor=o.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'];basecolor.default_value=(.001+q*.78,.001+q*.74,.002+q*.85,1);basecolor.keyframe_insert('default_value',frame=frame)
   elif kind=='fill':o.data.energy=request.get('ident',{}).get('lighting',{}).get('lockupFill',2000)*ease((t-2.55)/.7)
   elif kind=='sweep':o.location.x=-8+16*ease(p/.70);aim(o,(0,0,0));o.data.energy=2300*ease((t-.15)/.8)*(1-.65*ease((p-.70)/.18))
  # Preserve editable per-frame motion in the native scene.
  cam.keyframe_insert('location',frame=frame);cam.keyframe_insert('rotation_quaternion',frame=frame)
  for o,_,_ in movers:
   for prop in ['location','rotation_euler','scale']:o.keyframe_insert(prop,frame=frame)
  for o,_,_ in waveforms:o.keyframe_insert('location',frame=frame);o.keyframe_insert('scale',frame=frame)
  for o in [x for x in scene.objects if x.type=='LIGHT']:o.data.keyframe_insert('energy',frame=frame)
 started=time.monotonic()
 # Bake all motion before saving; previews and final use identical native curves.
 for frame in range(1,N+1):pose(frame)
 scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'scene.blend'))
 frames=[max(1,round(N*.10)),max(1,round(N*.55)),N] if mode=='preview' else list(range(1,N+1))
 for f in frames:
  if mode=='render' and (out/f'frame-{f-1:04d}.png').exists():continue
  if time.time()+5>=request['deadlineEpoch']:raise RuntimeError('Film GPU deadline reached')
  scene.frame_set(f);scene.render.filepath=str(out/(f'preview-{f:04d}.png' if mode=='preview' else f'frame-{f-1:04d}.png'));bpy.ops.render.render(write_still=True)
  if f%24==0 or mode=='preview':print(json.dumps({'event':'founder_scene','scene':sid,'phase':mode,'frame':f,'total':N}),flush=True)
 (out/(mode+'-receipt.json')).write_text(json.dumps({'status':'GENERATED_PENDING_REVIEW','assetId':sid,'sourceBrief':request['sourceBrief'],'settings':{'duration':shot['duration'],'fps':24,'samples':scene.cycles.samples,'width':scene.render.resolution_x,'height':scene.render.resolution_y},'device':device,'tool':'AutoPromote Studio Blender / original founder-film template','nativeScene':'scene.blend','scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'provenance':'Original authored spatial sequence; archived true records; retained AI-generated ocean source','seconds':time.monotonic()-started,'templateParameters':request.get('ident',{}),'editable':['camera quaternion curves','actual logo Bezier geometry','staggered layer timing','materials','lighting','physical source carriers','film route','sound cue plan']},indent=2))
 print(json.dumps({'event':'scene_ready','scene':sid,'phase':mode,'seconds':time.monotonic()-started}),flush=True)
