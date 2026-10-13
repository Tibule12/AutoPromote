"""Private, editable raw takes for the renewed founder-film brief.

Uses Studio's verified NVIDIA Cycles device configuration. It never assembles
the final film. Frame caches are bound to request/script/source identities.
"""
import bpy
import hashlib
import json
import math
import sys
import time
from pathlib import Path
from mathutils import Matrix, Vector

sys.path.insert(0, '/app')
from blender_scene import configure_render_device, simple_material

args = sys.argv[sys.argv.index('--') + 1:]
request_path, root = Path(args[0]), Path(args[1])
mode = args[2]
request = json.loads(request_path.read_text())
if mode not in {'preview', 'render'}:
    raise ValueError('Explicit preview/render phase required')
T = root / 'textures'

def ease(x):
    x = max(0., min(1., x))
    return x*x*(3-2*x)

def aim(obj, target):
    obj.rotation_mode = 'QUATERNION'
    forward = (Vector(target)-obj.location).normalized()
    right = forward.cross(Vector((0, 1, 0)))
    if right.length < 1e-6:
        right = forward.cross(Vector((1, 0, 0)))
    right.normalize()
    up = right.cross(forward).normalized()
    obj.rotation_quaternion = Matrix((right, up, -forward)).transposed().to_quaternion()

def cube(name, loc, size, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        b = obj.modifiers.new('Physical edge', 'BEVEL')
        b.width, b.segments = bevel, 3
        obj.modifiers.new('Surface normals', 'WEIGHTED_NORMAL')
    return obj

def text(value, loc, size, mat, depth=.035):
    curve = bpy.data.curves.new(value, 'FONT')
    curve.body, curve.align_x, curve.align_y = value, 'CENTER', 'CENTER'
    curve.font = bpy.data.fonts.load(str(T/'font.ttf'), check_existing=True)
    curve.size, curve.extrude, curve.bevel_depth = size, depth, .007
    curve.bevel_resolution, curve.resolution_u = 2, 8
    obj = bpy.data.objects.new(value, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.data.materials.append(mat)
    return obj

def image_material(name, filename, sequence=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(T/filename), check_existing=False)
    if sequence:
        tex.image.source = 'SEQUENCE'
        tex.image_user.frame_duration = 288 if filename.startswith('conversation') else 156
        tex.image_user.frame_start = 1
        tex.image_user.use_auto_refresh = True
        tex.image_user.use_cyclic = False
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = .9
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(tex.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return mat

def screen(name, loc, width, height, filename, sequence=True):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name, obj.scale = name, (width, height, 1)
    obj.data.materials.append(image_material(name, filename, sequence))
    return obj

def tube(name, coords, mat, radius=.015):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions, curve.bevel_depth, curve.bevel_resolution = '3D', radius, 2
    sp = curve.splines.new('POLY')
    sp.points.add(len(coords)-1)
    for p, c in zip(sp.points, coords):
        p.co = (*c, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

def area(name, loc, target, energy, color, width, height):
    bpy.ops.object.light_add(type='AREA', location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.energy, obj.data.color = energy, color
    obj.data.shape, obj.data.size, obj.data.size_y = 'RECTANGLE', width, height
    aim(obj, target)
    return obj

for shot in request['scenes']:
    if request.get('only') and shot['id'] not in request['only']:
        continue
    if time.time()+20 >= request['deadlineEpoch']:
        raise RuntimeError('Renewed production deadline reached')
    out = root/'assets'/shot['id']
    out.mkdir(parents=True, exist_ok=True)
    identity = hashlib.sha256(json.dumps({'shot':shot, 'settings':request['render'],
        'script':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'sources':request['sourceHashes']}, sort_keys=True).encode()).hexdigest()
    cache = out/'input-identity.json'
    if cache.exists() and json.loads(cache.read_text())['sha256'] != identity:
        raise RuntimeError('Cached take belongs to different inputs; use a new directory')
    cache.write_text(json.dumps({'sha256':identity}))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    device = configure_render_device(scene)
    if not device['gpu_verified'] or not any('L40S' in n for n in device['devices']):
        raise RuntimeError('Verified NVIDIA L40S required; CPU fallback forbidden for raw 3D takes')
    settings = request['render']
    scene.render.resolution_x, scene.render.resolution_y = settings['width'], settings['height']
    scene.render.resolution_percentage = 100
    scene.render.fps = 24
    scene.render.image_settings.file_format = 'PNG'
    # Lossless PNG compression trades remote disk space for shorter GPU leases.
    scene.render.image_settings.compression = 0
    scene.cycles.samples = settings['samples']
    scene.cycles.max_bounces, scene.cycles.transmission_bounces = 4, 3
    scene.cycles.use_denoising = True
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (.014,.020,.035,1)
    bg.inputs['Strength'].default_value = .12
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    N = round(shot['duration']*24)
    scene.frame_start, scene.frame_end = 1, N
    platinum = simple_material('Machined platinum', '#dce0ea', .96, .19)
    ink = simple_material('Obsidian reflection stage', '#070b13', .7, .2)
    ivory = simple_material('Readable ivory', '#f1f3ff', .12, .32, .12)
    violet = simple_material('Story signal', '#826cff', .3, .21, 1.1)
    amber = simple_material('Human signal', '#ffbe7b', .3, .27, .8)
    red = simple_material('Broken signal', '#ec735f', .3, .26, .5)
    # Objects face +Z; Y is the cinematic up axis. Floor is physically below.
    floor = cube('Continuous reflective stage', (0,-3.8,-8), (65,.12,80), ink, .01)
    area('Long studio reflection', (-5,6,6), (0,0,0), 1400, (.82,.88,1), 7, 2)
    area('Violet rim', (7,1,-2), (0,0,0), 1800, (.35,.24,1), 2, 6)
    area('Warm depth', (-7,-1,1), (0,0,-3), 1100, (1,.65,.38), 3, 5)
    bpy.ops.object.camera_add(location=(0,.15,13))
    cam = bpy.context.object
    cam.name, cam.data.lens = 'Story camera', 46
    cam.data.clip_end = 250
    scene.camera = cam
    movers, pulses = [], []
    sid = shot['id']
    # The conversation actually moves. It is not a still repeated on carriers.
    if sid in {'origin','cascade','problems','director','reveal'}:
        picture = screen('Moving conversation', (0,0,-.5), 10.8, 6.08, 'conversation-0001.jpg')
        movers.append((picture,'conversation',0))
        if sid == 'origin':
            for track in range(2):
                for j in range(80):
                    amplitude = .12+.65*abs(math.sin(j*.39)*math.sin(j*.17))
                    obj = cube('Sync sample %d %d'%(track,j), (-5+j*.126,-2.05-track*.38,.25), (.045,amplitude,.045), amber if track==0 else violet, .007)
                    pulses.append((obj,obj.location.copy(),track))
            text('ONE CONVERSATION', (0,2.35,.4), .38, ivory)
        elif sid == 'cascade':
            for j, word in enumerate(['SYNC','SOUND','RENDER']):
                obj = text(word, (-3.9+j*3.9,-2.35,.5), .48, ivory)
                movers.append((obj,'failure-word',j))
            split = cube('Failed render interrupts the image', (0,0,.9), (15,8.5,.08), ink, .0)
            movers.append((split,'failure-shutter',0))
            failed = text('FAILED.', (0,0,1.05), 1.55, red, .08)
            movers.append((failed,'failed',0))
        elif sid == 'problems':
            for j, word in enumerate(['CAPTIONS','CLIPS','FORMATS']):
                obj = text(word, (-2.8+j*2.8,2.10,.7), .32, ivory)
                movers.append((obj,'branch-word',j))
            # Different crops grow from the exact same moving source identity.
            for j in range(3):
                obj = screen('The same source in a new frame '+str(j), (-4.5+j*4.5,0,1+j*.18), 3.8, 5.1, 'conversation-0001.jpg')
                # Portrait output samples a portrait crop instead of stretching people.
                nt=obj.data.materials[0].node_tree
                tex=next(n for n in nt.nodes if n.type=='TEX_IMAGE')
                uv=nt.nodes.new('ShaderNodeTexCoord')
                crop=nt.nodes.new('ShaderNodeVectorMath');crop.operation='MULTIPLY';crop.inputs[1].default_value=(.419,1,1)
                offset=nt.nodes.new('ShaderNodeVectorMath');offset.operation='ADD';offset.inputs[1].default_value=(.10+j*.18,0,0)
                nt.links.new(uv.outputs['UV'],crop.inputs[0]);nt.links.new(crop.outputs[0],offset.inputs[0]);nt.links.new(offset.outputs[0],tex.inputs['Vector'])
                movers.append((obj,'format',j))
        elif sid == 'director':
            picture.scale = (10.8,6.08,1)
            for j, word in enumerate(['STORY','SHOT','CUT','SOUND']):
                obj = text(word, (-3.3+j*2.2,-1.95,1.25), .38, ivory, .06)
                movers.append((obj,'decision',j))
            ocean = screen('Actual generated source becomes the chosen shot', (0,0,1), 10.8,6.08,'ocean-0001.jpg')
            movers.append((ocean,'chosen',0))
        else:
            picture.scale = (10.8,6.08,1)
            veil = cube('Readable reveal field',(0,0,1),(17,9.6,.05),ink,0)
            veil.data.materials.clear()
            mat = simple_material('Dark reveal glass','#101626',0,.3)
            mat.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.8
            veil.data.materials.append(mat)
            for i,line in enumerate(['The film you just watched','was created by AutoPromote.']):
                text(line,(0,.5-i*.78,1.3),.53,ivory,.01)
    elif sid == 'failure':
        # A short consequence, not a paragraph about engineering.
        screen('Retained real failure archive',(-3.3,.2,-2),7,4.4,'error.png',False)
        word = text('AGAIN.',(1.5,0,.5),1.45,ivory,.12)
        movers.append((word,'again',0))
        tube('The route reaches a wall',[(-6+j*.15,-2.6,.6) for j in range(70)],red,.026)
    elif sid in {'quota','breakthrough'}:
        zero = text('0',(0,0,0),5.8,platinum,.42)
        movers.append((zero,'zero',0))
        text('NO CAPACITY' if sid=='quota' else 'A WAY THROUGH',(0,-2.35,.3),.33,ivory)
        if sid=='breakthrough':
            ocean=screen('The world behind the capacity wall',(0,0,-4),22,12.38,'ocean-0001.jpg')
            movers.append((ocean,'world',0))
            for side in [-1,1]:
                door=cube('Physical capacity wall '+str(side),(side*4.2,0,-1),(8.3,10,.32),ink,.07)
                movers.append((door,'door',side))
            text('3000 milliGPU',(0,2.30,1.4),.4,ivory)
    elif sid in {'magic','cold-open'}:
        # The picture itself folds into space, gathers into the sail, then opens
        # into its moving world. Geometry and UVs are continuous through the wipe.
        mat=image_material('Generated ocean on the folded image','ocean-0001.jpg',True)
        nx,ny=64,36
        verts=[((x/nx-.5)*16,(y/ny-.5)*9,0) for y in range(ny+1) for x in range(nx+1)]
        faces=[]
        for y in range(ny):
            for x in range(nx):
                i=y*(nx+1)+x;faces.append((i,i+1,i+nx+2,i+nx+1))
        mesh=bpy.data.meshes.new('Continuous picture geometry')
        mesh.from_pydata(verts,[],faces);mesh.update()
        obj=bpy.data.objects.new('The image becomes a world',mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(mat)
        uv=mesh.uv_layers.new(name='Persistent source UV')
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                vi=mesh.loops[li].vertex_index;uv.data[li].uv=(vi%(nx+1)/nx,vi//(nx+1)/ny)
        movers.append((obj,'folding-world',verts))
        for j in range(11):
            strip=cube('Physical image seam '+str(j),(-7.2+j*1.44,-3.0,-.15),(.035,8.8,.03),platinum,.006)
            movers.append((strip,'seam',j))
        tube('One unresolved line',[(-7+14*j/100,-3.25+.08*math.sin(j*.19),.2) for j in range(101)],violet,.025)
    elif sid=='ident':
        # A new wordmark treatment: original name proportions, no rejected AP mark.
        # Machined extrusions and glass inlays emerge behind physical shutters.
        ident=request['ident']
        base=text('AutoPromote',(0,0,0),1.35,platinum,ident['materials']['extrusion'])
        bpy.context.view_layer.update()
        uniform=10/base.dimensions.x
        base.scale=(uniform,)*3
        inlay=text('AutoPromote',(0,0,.25),1.35,simple_material('Violet glass inlay','#615ba8',.35,.14),.06)
        inlay.scale=(uniform*.985,)*3
        inlay.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.65
        movers.extend([(base,'logo-base',0),(inlay,'logo-inlay',0)])
        for j in range(12):
            shutter=cube('Reveal blade %02d'%j,(-5.5+j*1.0,0,1.1),(1.04,3.2,.15),ink,.03)
            movers.append((shutter,'logo-blade',j))
        floor.location.y=-1.2
        sweep=area('Moving grazing reflection',(-8,1.5,4),(0,0,0),ident['lighting']['sweep'],(.75,.84,1),.3,5)
        movers.append((sweep,'light-sweep',0))
        fill=area('Lockup softbox',(0,3.5,9),(0,0,0),0,(1,.94,.88),8,2)
        movers.append((fill,'lockup-fill',0))
    else:
        raise ValueError('Unknown story beat '+sid)
    bases={o.name:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o,_,_ in movers}
    def pose(frame):
        scene.frame_set(frame)
        t=(frame-1)/24; p=(frame-1)/max(1,N-1); e=ease(p)
        cam.location=(.65*(1-e),.35*(1-e),14.0-.5*e)
        aim(cam,(0,0,0))
        if sid in {'cold-open','magic'}:
            # Revisit the same event from its start to earn the initial hook.
            q=(.48+.52*p) if sid=='cold-open' else p
            cam.location=(1.7*(1-ease(q)),.7*(1-ease(q)),13.8-2.4*ease(q));aim(cam,(0,0,0))
        if sid=='failure':cam.location=(2.8-1.6*e,.5,11.5-.4*e);aim(cam,(.1,0,0))
        if sid in {'quota','breakthrough'}:cam.location=(1.1*(1-e),.35,14.0-.5*e);aim(cam,(0,0,0))
        if sid=='ident':
            q=ease((t-.25)/request['ident']['camera']['resolveSeconds'])
            cam.location=(-3.1*(1-q),.65*(1-q),7.2+12*q);aim(cam,(-3.2*(1-q),0,0));cam.data.lens=54
        for o,base,track in pulses:
            o.location=base.copy();o.location.x+=(1-ease(p/.6))*(.55 if track else -.55)
            o.scale.y=1+.25*math.sin(t*5+base.x*1.5-track)
            o.keyframe_insert('location',frame=frame);o.keyframe_insert('scale',frame=frame)
        for o,kind,i in movers:
            loc,rot,sc=bases[o.name];o.location=loc.copy();o.rotation_euler=rot.copy();o.scale=sc.copy()
            if kind=='conversation':
                o.location.z+=.25*e
                if sid=='cascade':o.location.x=.07*math.sin(t*65)*ease((p-.65)/.1)
            elif kind=='failure-shutter':o.location.y=12*(1-ease((p-.68)/.07))
            elif kind=='failed':o.scale=tuple(v*ease((p-.72)/.05) for v in sc)
            elif kind=='failure-word':o.data.materials[0]=red if p>(i+1)*.2 else ivory
            elif kind=='branch-word':o.location.z+=.6*ease((p-i*.15)/.2)
            elif kind=='format':
                q=ease((p-i*.13)/.3);o.scale=(sc.x*q,sc.y*q,1);o.location.x=loc.x*(.6+.4*q);o.rotation_euler.y=(-.1+i*.1)*(1-q)
            elif kind=='again':o.location.z+=.6*e
            elif kind=='zero':
                o.rotation_euler.y=.22*(1-e)
                if sid=='breakthrough':o.location.x=-11*ease((p-.08)/.65);o.rotation_euler.y=-.6*e
            elif kind=='door':o.location.x+=i*9*ease((p-.08)/.65)
            elif kind=='decision':
                q=ease((p-i*.12)/.15);o.scale=tuple(v*q for v in sc);o.location.z+=.4*q
            elif kind=='chosen':
                q=ease((p-.43)/.26);o.location.y=12*(1-q);o.rotation_euler.y=-.1*(1-q)
            elif kind=='folding-world':
                q=(.48+.52*p) if sid=='cold-open' else p
                unfold=ease((q-.10)/.67)
                for v,original in zip(o.data.vertices,i):
                    x,y,z=original
                    phase=x*.42-q*4
                    bend=(1-unfold)*(2.4*math.sin(phase)+.07*y*y)
                    v.co=(x,y*.65+(y*.35)*unfold,bend)
                o.data.update()
            elif kind=='seam':
                q=(.48+.52*p) if sid=='cold-open' else p
                o.location.z=.4+2*(1-ease((q-.10)/.6))*math.sin(loc.x*.42-q*4)
                o.scale.y=1-ease((q-.48)/.3)
            elif kind=='logo-base':o.location.z=-1.5*(1-ease((t-.3)/1.7))
            elif kind=='logo-inlay':o.location.z=.25-2*(1-ease((t-.8)/1.6))
            elif kind=='logo-blade':
                q=ease((t-(.4+i*.095))/1.35);o.location.y+=(1 if i%2 else -1)*4.5*q
            elif kind=='light-sweep':o.location.x=-8+16*ease((t-.15)/2.8);aim(o,(0,0,0))
            elif kind=='lockup-fill':o.data.energy=request['ident']['lighting']['holdFill']*ease((t-2.3)/.8);o.data.keyframe_insert('energy',frame=frame)
            for prop in ['location','rotation_euler','scale']:o.keyframe_insert(prop,frame=frame)
        cam.keyframe_insert('location',frame=frame);cam.keyframe_insert('rotation_quaternion',frame=frame)
    # Bake ordinary transform curves for re-editability. Folding geometry is
    # reproducible from the versioned script/settings, not a fake baked morph.
    for f in range(1,N+1):pose(f)
    pose(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'scene.blend'))
    frames=[1,round(N*.5),N] if mode=='preview' else range(1,N+1)
    started=time.monotonic()
    for f in frames:
        if time.time()+15>=request['deadlineEpoch']:raise RuntimeError('GPU render deadline reached')
        dest=out/(f'preview-{f:04d}.png' if mode=='preview' else f'frame-{f-1:04d}.png')
        if mode=='render' and dest.exists():continue
        pose(f)
        scene.render.filepath=str(dest)
        bpy.ops.render.render(write_still=True)
        if mode=='preview' or f%24==0:print(json.dumps({'event':'rebuild_frame','shot':sid,'frame':f,'total':N}),flush=True)
    receipt={'status':'GENERATED_PENDING_REVIEW','assetId':sid,'inputIdentity':identity,'device':device,'settings':settings,'duration':shot['duration'],'sourceHashes':request['sourceHashes'],'sourceBrief':request['sourceBrief'],'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'seconds':time.monotonic()-started,'nativeScene':'scene.blend','scope':'Authored NVIDIA raw scene; retained video provenance, not arbitrary-brief autonomy','editable':['camera','lights','materials','physical reveal transforms','timing','source image sequence'],'proceduralGeometry':'Versioned script reproduces folded picture deformation'}
    (out/(mode+'-receipt.json')).write_text(json.dumps(receipt,indent=2))
