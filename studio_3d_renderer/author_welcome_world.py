"""Author an editable native Studio source world; CPU proxy and GPU use one scene.

This produces ordinary source media for contentFactoryStudioAdapter, rather than
an alternative timeline/compositor. Every object/camera/material animation is
stored in the .blend. Final editorial text/audio use the existing Studio worker.
"""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

FPS = 24
DURATION = 38


def frame(t):
    return 1 + round(t * FPS)


def key(obj, prop, values, linear=False):
    for t, v in values:
        setattr(obj, prop, v)
        obj.keyframe_insert(data_path=prop, frame=frame(t))
    if linear and obj.animation_data and obj.animation_data.action:
        for c in obj.animation_data.action.fcurves:
            for p in c.keyframe_points:
                p.interpolation = 'LINEAR'


def color(h):
    v = [int(h[i:i+2], 16)/255 for i in (1, 3, 5)]
    return tuple(x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4 for x in v)+(1,)


def material(name, h, metal=0, rough=.4, glow=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = color(h)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = color(h)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Emission Color'].default_value = color(h)
    p.inputs['Emission Strength'].default_value = glow
    return m


def empty(name):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    return o


def photo(name, path, pos, size, parent=None):
    """An editable UV media surface inside a native scene, never a scene plate."""
    m = bpy.data.materials.get(path.stem)
    if not m:
        m = bpy.data.materials.new(path.stem)
        m.use_nodes = True
        nodes = m.node_tree.nodes
        nodes.clear()
        image = nodes.new('ShaderNodeTexImage')
        image.image = bpy.data.images.load(str(path), check_existing=True)
        emission = nodes.new('ShaderNodeEmission')
        emission.inputs['Strength'].default_value = .9
        transparent = nodes.new('ShaderNodeBsdfTransparent')
        mix = nodes.new('ShaderNodeMixShader')
        output = nodes.new('ShaderNodeOutputMaterial')
        m.node_tree.links.new(image.outputs['Color'], emission.inputs['Color'])
        m.node_tree.links.new(image.outputs['Alpha'], mix.inputs[0])
        m.node_tree.links.new(transparent.outputs[0], mix.inputs[1])
        m.node_tree.links.new(emission.outputs[0], mix.inputs[2])
        m.node_tree.links.new(mix.outputs[0], output.inputs['Surface'])
    w,h = size
    mesh = bpy.data.meshes.new(name+' editable UV surface')
    mesh.from_pydata([(-w/2,0,-h/2),(w/2,0,-h/2),(w/2,0,h/2),(-w/2,0,h/2)],[],[(0,1,2,3)])
    uv = mesh.uv_layers.new()
    for loop,co in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=co
    o = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(o)
    o.parent=parent
    o.location=pos
    mesh.materials.append(m)
    return o


def box(name, pos, dims, mat, parent=None, bevel=.06):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.name = name
    o.parent = parent
    o.location = pos
    o.scale = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        b = o.modifiers.new('Machined soft edge', 'BEVEL')
        b.width = bevel
        b.segments = 3
        o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return o


def text(body, pos, size, mat, parent=None, align='LEFT', depth=0):
    c = bpy.data.curves.new(body, 'FONT')
    c.body = body
    c.font = FONT
    c.size = size
    c.align_x = align
    c.align_y = 'CENTER'
    c.extrude = depth
    c.bevel_depth = .004 if depth else 0
    c.bevel_resolution = 2
    o = bpy.data.objects.new(body, c)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    o.location = pos
    o.rotation_euler = (math.pi/2, 0, 0)
    o.data.materials.append(mat)
    return o


def line(name, points, mat, radius=.025, parent=None):
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions = '3D'
    c.resolution_u = 16
    c.bevel_depth = radius
    c.bevel_resolution = 3
    s = c.splines.new('POLY')
    s.points.add(len(points)-1)
    for p, co in zip(s.points, points):
        p.co = (*co, 1)
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    o.data.materials.append(mat)
    return o


def reveal(o, start, end, leave=None):
    values = [(0, (.001,)*3), (start, (.001,)*3), (end, (1,)*3)]
    if leave:
        values.extend([(leave[0], (1,)*3), (leave[1], (.001,)*3)])
    key(o, 'scale', values)


def point_light(name, loc, power, h, size=8):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = power
    d.color = color(h)[:3]
    d.shape = 'DISK'
    d.size = size
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 0))-o.location).to_track_quat('-Z', 'Y').to_euler()
    return o


def aim(cam, pos, target, t):
    cam.location = pos
    cam.rotation_euler = (Vector(target)-Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    cam.keyframe_insert(data_path='location', frame=frame(t))
    cam.keyframe_insert(data_path='rotation_euler', frame=frame(t))


def ribbon():
    verts = []
    faces = []
    n = 180
    for i in range(n+1):
        u = i/n*math.tau
        r = 2.3 + .38*math.cos(u*3)
        for side in (-1, 1):
            w = .26*side
            verts.append(((r+w*math.cos(u*1.5))*math.cos(u),
                          .72*math.sin(u*2)+w*math.sin(u*1.5),
                          (r+w*math.cos(u*1.5))*math.sin(u)))
    for i in range(n):
        faces.append((2*i, 2*i+1, 2*i+3, 2*i+2))
    mesh = bpy.data.meshes.new('Continuous folded ribbon surface')
    mesh.from_pydata(verts, [], faces)
    o = bpy.data.objects.new('The idea becomes a dimensional ribbon', mesh)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(LAVENDER)
    for p in mesh.polygons:
        p.use_smooth = True
    s = o.modifiers.new('Sculpture thickness', 'SOLIDIFY')
    s.thickness = .075
    b = o.modifiers.new('Polished edge', 'BEVEL')
    b.width = .04
    b.segments = 3
    o.shape_key_add(name='Basis')
    flat = o.shape_key_add(name='One luminous timeline')
    for i, v in enumerate(flat.data):
        u = (i//2)/n
        v.co = ((u-.5)*8, 0, .1*(-1 if i%2==0 else 1))
    for t, v in [(0, 1), (14.5, 1), (19.5, 0), (23.4, 0), (27, 1)]:
        flat.value = v
        flat.keyframe_insert(data_path='value', frame=frame(t))
    reveal(o, 13.8, 15, (26, 29))
    key(o, 'rotation_euler', [(0, (0, 0, 0)), (15, (0, 0, 0)),
         (20, (.17, .5, .25)), (23.5, (.35, 1.1, -.15)), (27, (0, 0, 0))])
    return o


def build(root):
    global FONT, INK, PANEL, WHITE, MUTED, PURPLE, CYAN, LAVENDER, GOLD
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    FONT = bpy.data.fonts.load(str(root/'assets/fonts/Inter-Regular.ttf'))
    INK = material('Obsidian', '#080a14', .35, .26)
    PANEL = material('Graphite panels', '#191d31', .42, .28)
    WHITE = material('Porcelain typography', '#f1efff', .05, .4, .3)
    MUTED = material('Secondary ink', '#83869f', 0, .5, .2)
    PURPLE = material('Idea light', '#bd00ff', .5, .24, 3)
    CYAN = material('Precision light', '#774cff', .3, .2, 2)
    LAVENDER = material('Liquid violet titanium', '#b864ff', .88, .17)
    GOLD = material('Remembered light', '#e8bd83', .6, .23, .8)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 16
    sc.cycles.max_bounces = 5
    sc.cycles.use_denoising = True
    sc.render.fps = FPS
    sc.frame_start = 1
    sc.frame_end = DURATION*FPS
    sc.render.resolution_x = 1920
    sc.render.resolution_y = 1080
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (.014, .016, .035, 1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = .3
    sc.view_settings.view_transform = 'AgX'
    sc.render.film_transparent = False
    sc.render.use_compositing = True
    sc.use_nodes = True
    nodes = sc.node_tree.nodes
    nodes.clear()
    rl = nodes.new('CompositorNodeRLayers')
    gl = nodes.new('CompositorNodeGlare')
    gl.glare_type = 'FOG_GLOW'
    gl.quality = 'HIGH'
    gl.threshold = 2
    gl.mix = -.85
    out = nodes.new('CompositorNodeComposite')
    sc.node_tree.links.new(rl.outputs['Image'], gl.inputs['Image'])
    sc.node_tree.links.new(gl.outputs['Image'], out.inputs['Image'])
    box('Shared reflective stage', (0, 7, -4.8), (90, 90, .12), INK, bevel=0)
    main = point_light('Softbox waking the world', (-6, -8, 8), 1000, '#c7b6ff', 10)
    key(main.data, 'energy', [(0, 0), (1, 20), (4, 900), (8, 1200), (17, 1600), (26, 1100), (32, 550), (35, 1400)])
    fill = point_light('Large frontal silk', (0, -11, 4), 1200, '#ddd7ff', 16)
    key(fill.data, 'energy', [(0,0),(1,0),(4,1300),(14,1500),(21,2400),(29,1600),(32,800),(35,2200)])
    rim = point_light('Moving violet rim', (7, 3, 6), 2200, '#cb38ff', 7)
    key(rim, 'location', [(0, (7, 3, 6)), (14, (7, 3, 6)), (23, (-5, 1, 7)), (32, (-7, -2, 6)), (38, (6, -1, 5))])
    point_light('Purple practical edge', (5, -1, -1), 650, '#9038ff', 5)
    warm = point_light('Story warmth', (0, 9, 6), 50, '#ffcfa4', 12)
    key(warm.data, 'energy', [(0, 10), (24, 50), (28, 2100), (32, 700), (38, 950)])
    studio = empty('01 Creative Studio Workspace — editable group')
    box('Physical creative desk',(0,-1.0,-4.35),(23,12,.22),PANEL,studio,.18)
    box('Monitor pedestal',(0,.5,-4.03),(4,2,.18),INK,studio,.12)
    box('Monitor stand',(0,.8,-3.48),(1.1,.8,1.0),INK,studio,.12)
    box('Keyboard chassis',(-1.4,-3.7,-4.03),(9.2,2.1,.21),INK,studio,.12)
    for row in range(4):
        for col in range(18):
            box('Independent illuminated key %s %s'%(row,col),(-5.65+col*.49,-4.4+row*.46,-3.85),(.4,.35,.12),PANEL,studio,.035)
    line('Keyboard violet edge',[(-6,-4.85,-3.87),(3.1,-4.85,-3.87)],PURPLE,.012,studio)
    box('Sculpted studio mouse',(5.2,-3.4,-3.85),(1.25,1.8,.38),INK,studio,.25)
    line('Mouse light signature',[(4.9,-3.3,-3.62),(5.2,-2.8,-3.62),(5.5,-3.3,-3.62)],PURPLE,.02,studio)
    for x in [-9.2,9.2]:
        line('Practical studio light '+str(x),[(x,2,-3),(x,2,6)],PURPLE,.045,studio)
    box('Studio chassis', (0, .35, .2), (15.6, .18, 8), INK, studio, .18)
    text('AutoPromote', (-7, .13, 3.5), .38, WHITE, studio)
    text('CREATIVE STUDIO', (-3.8, .13, 3.5), .16, MUTED, studio)
    text('One idea. Unlimited possibility.', (-7, .1, 2.65), .27, WHITE, studio)
    box('Media rail', (-5.5, .15, .5), (3.1, .12, 3.4), PANEL, studio)
    text('YOUR CREATIVE WORLD', (-6.85, -.02, 1.9), .16, MUTED, studio)
    for i, name in enumerate(['Studio workspace', 'Story templates', 'Motion / VFX', '3D creative', 'Brand stories']):
        y = 1.28-i*.59
        box('Rail entry '+name, (-5.5, -.03, y), (2.62, .08, .4), PANEL, studio)
        text(name, (-6.63, -.09, y), .17, WHITE if i==0 else MUTED, studio)
    box('The idea preview', (.6, .18, .45), (7.6, .12, 3.4), PANEL, studio)
    portrait=photo('Founder / active real media preview',root/'assets/founder-studio.png',(.6,-.035,.45),(7.35,3.25),studio)
    reveal(portrait,1.3,3.6)
    text('FROM IDEAS', (-2.6, -.075, 1.4), .34, WHITE, studio)
    text('TO IMPACT', (-2.6, -.075, .88), .39, PURPLE, studio)
    text('A STORY IS WAITING TO HAPPEN', (-2.6, -.075, -.72), .13, WHITE, studio)
    seed = line('One idea — first stroke', [(-1.6+4*i/90, -.11, .35+.55*math.sin(i/90*math.tau)) for i in range(91)], PURPLE, .032, studio)
    key(seed.data, 'bevel_factor_end', [(0, 0), (1.6, 0), (5.3, 1), (8, 1)])
    box('Inspector', (5.83, .15, .5), (2.3, .12, 3.4), PANEL, studio)
    text('STORY SETTINGS', (4.87, -.02, 1.92), .15, MUTED, studio)
    for i, label in enumerate(['Depth', 'Light', 'Motion']):
        text(label, (4.87, -.02, 1.22-i*.76), .18, WHITE, studio)
        line(label+' control', [(4.87, -.03, .9-i*.76), (6.75, -.03, .9-i*.76)], MUTED, .012, studio)
        active = line(label+' activation', [(4.87, -.055, .9-i*.76), (5.8+i*.2, -.055, .9-i*.76)], PURPLE, .018, studio)
        key(active.data, 'bevel_factor_end', [(0, 0), (3+i*.45, 0), (4+i*.45, 1)])
    box('Timeline bed', (0, .12, -2.35), (14.2, .1, 1.48), PANEL, studio)
    text('IDEA', (-6.6, -.02, -1.9), .16, WHITE, studio)
    for i in range(7):
        strip = box('Story block '+str(i), (-5.6+i*1.75, -.03, -2.5), (1.54, .06, .28), PURPLE if i%3==0 else LAVENDER, studio, .035)
        reveal(strip, 3+i*.23, 3.6+i*.23)
    timeline = line('Timeline becomes the structural spine', [(-7, -.15, -2.2), (7, -.15, -2.2)], CYAN, .015)
    key(timeline.data, 'bevel_factor_end', [(0, 0), (4.2, 0), (7.3, 1)])
    key(timeline, 'location', [(0, (0, 0, 0)), (8, (0, 0, 0)), (10.5, (0, 0, 2.1)), (14.5, (0, 0, 2.1))])
    key(timeline, 'scale', [(0, (1,1,1)), (14.5, (1,1,1)), (16, (.001,)*3)])
    key(studio, 'location', [(0, (0,0,0)), (7.8, (0,0,0)), (10, (0,8,2))])
    key(studio, 'scale', [(0, (1,)*3), (7.8, (1,)*3), (10.5, (.001,)*3)])
    cards = []
    labels = ['Story templates', 'Motion graphics', 'VFX', 'Captions', 'Transitions', 'Creative components']
    for i, label in enumerate(labels):
        group = empty('02 Library / '+label)
        x = (i%3-1)*4.45
        z = 1.7-(i//3)*3.35
        key(group, 'location', [(0,(x,0,-2.2)), (7.7+i*.18,(x,0,-2.2)), (9.4+i*.3,(x,0,z)), (14,(x,0,z)), (16.8,(x*.56,1.5,z*.56)), (19.3,(math.cos(i/6*math.tau)*4.4,1.3,math.sin(i/6*math.tau)*4.4)), (24,(x*.8,4,z*.8))])
        reveal(group, 7.6+i*.18, 9.1+i*.2, (23.5,26))
        key(group,'rotation_euler',[(0,(0,0,0)),(14,(0,0,0)),(18,(.05,0,(-1 if i%2 else 1)*.15)),(22,(.08,0,(-1 if i%2 else 1)*.3))])
        box(label+' physical card',(0,.2,0),(4.05,.16,2.8),PANEL,group,.14)
        text(label,(-1.72,-.02,1.02),.21,WHITE,group)
        if i in [0,2,3,4]:
            photo(label+' media surface',root/'assets'/('founder-story.png' if i in [0,4] else 'founder-studio.png'),(0,-.045,-.12),(3.55,1.9),group)
        if i==0:
            text('FOUNDER JOURNEY',(-1.57,-.085,-.64),.2,WHITE,group)
        elif i==1:
            for j,word in enumerate(['MOVE.','CREATE.','INSPIRE.']):
                b=text(word,(-1.5,-.07,.45-j*.49),.38,PURPLE if j==2 else WHITE,group)
                key(b,'location',[(0,(-1.5,-.07,.45-j*.49)),(9.2+j*.25,(-1.5,-.07,.45-j*.49)),(10+j*.25,(-1.15,-.07,.45-j*.49)),(14,(-1.5,-.07,.45-j*.49))])
        elif i==2:
            for j in range(3):
                p=line('Tracked violet energy '+str(j),[(-1.4+2.8*k/40,-.08,.1+.5*math.sin(k/40*math.tau+j)) for k in range(41)],PURPLE,.022,group)
                key(p.data,'bevel_factor_end',[(0,0),(10.3+j*.2,0),(11.3+j*.2,1)])
        elif i==3:
            box('Caption backing',(0,-.08,-.64),(3.05,.015,.33),INK,group,.03)
            text('A SMALL IDEA. A BIGGER TOMORROW.',(0,-.1,-.64),.145,WHITE,group,'CENTER')
        elif i==4:
            panel=box('Transition foreground wipe',(0,-.085,-.12),(3.55,.02,1.9),INK,group,.015)
            key(panel,'scale',[(0,(1,1,1)),(12,(1,1,1)),(13.2,(.001,1,1)),(14,(.001,1,1))])
        else:
            for j in range(3):
                b=box(label+' dimensional block '+str(j),(-1.12+j*1.13,-.1,-.2),(.68,.36,.68),LAVENDER if j==1 else GOLD,group,.075)
                key(b,'rotation_euler',[(0,(0,0,0)),(11+j*.2,(0,0,0)),(14,(.3,.3,.35))])
        highlight=line(label+' active underline',[(-1.7,-.08,-1.07),(1.7,-.08,-1.07)],PURPLE,.025,group)
        key(highlight.data,'bevel_factor_end',[(0,0),(9.5+i*.62,0),(10.3+i*.62,1)])
        cards.append(group)
    sculpture=ribbon()
    sculpture.location.y=2.6
    sculpture.scale=(1.25,)*3
    # The timeline releases the same original AP contours into real 3D space.
    sys.path.insert(0,str(root/'assets'))
    from vector_geometry import outline
    geometry=json.loads((root/'assets/logo-geometry.json').read_text())
    power=empty('03 One idea becomes the dimensional AP world')
    reveal(power,15.2,17.2,(24.2,27))
    key(power,'rotation_euler',[(0,(0,0,0)),(17,(0,0,0)),(20,(.06,0,-.12)),(23,(0,0,.08)),(25,(0,0,0))])
    for i,part in enumerate(geometry['symbolParts']):
        mark=outline(part,geometry['symbolTransform'],(-96,-96),.038,LAVENDER if i==0 else GOLD)
        mark.data.extrude=.26
        mark.data.bevel_depth=.035
        mark.parent=power
        mark.rotation_euler=(math.pi/2,0,0)
        key(mark,'location',[(0,((-1 if i==0 else 1)*3,0,0)),(15.2,((-1 if i==0 else 1)*3,0,0)),(18.7,(0,0,0)),(24,(0,0,.15))])
    rock=material('Obsidian geological stage','#21142f',.7,.28)
    for i in range(18):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1)
        r=bpy.context.object;r.name='Native volcanic rock %02d'%i;r.parent=power
        r.location=((i-8.5)*.74,1+(i%4)*.8,-3.5+.2*math.sin(i*2.4))
        r.scale=(.7+(i%3)*.2,.9,.45+(i%5)*.15)
        r.rotation_euler=(i*.4,i*.7,i*.3)
        r.data.materials.append(rock)
    for j in range(3):
        pts=[]
        for i in range(181):
            u=i/180*math.tau
            r=3.9+j*.32
            pts.append((r*math.cos(u), .2+math.sin(u*2+j)*.4, r*math.sin(u)))
        hoop=line('03 Dimensional portal rail '+str(j),pts,PURPLE if j!=1 else CYAN,.012)
        reveal(hoop,14.2+j*.2,17.2+j*.2,(24.2,27.2))
        key(hoop.data,'bevel_factor_end',[(0,0),(14.2+j*.2,0),(17.5+j*.2,1)])
        key(hoop,'rotation_euler',[(0,(0,0,0)),(16,(0,0,0)),(22,(.15*j,.24*j,.3*j)),(26,(0,0,0))])
    # A sparse constellation belongs to the portal; deterministic and no noise.
    for i in range(28):
        a=i*2.39996
        r=4.6+(i%4)*.5
        p=box('Portal particle %02d'%i,(r*math.cos(a),1.2+(i%5)*.24,r*math.sin(a)),(.025,.025,.025),CYAN if i%4==0 else PURPLE,bevel=0)
        reveal(p,15+i*.035,16+i*.035,(23.5,25.6))
        key(p,'location',[(0,tuple(p.location)),(17,tuple(p.location)),(24,(p.location.x*.6,-.8,p.location.z*.6))])
    story=empty('04 Stories That Move Brands — continuous horizon')
    reveal(story,23.4,26,(31.1,33.8))
    # Native landscape is an intentionally graphic creative world, with parallax.
    for k in range(4):
        verts=[]
        n=90
        for i in range(n+1):
            x=(i/n-.5)*24
            z=-1.15+k*.14+.5*math.sin(x*.55+k)+.27*math.sin(x*1.2+k*2)
            verts.extend([(x,4+k*2,z),(x,4+k*2,-4.6)])
        mesh=bpy.data.meshes.new('Story horizon layer')
        mesh.from_pydata(verts,[],[(2*i,2*i+1,2*i+3,2*i+2) for i in range(n)])
        o=bpy.data.objects.new('Remembered landscape / '+str(k),mesh)
        bpy.context.collection.objects.link(o)
        o.parent=story
        o.data.materials.append(material('Atmospheric horizon '+str(k),['#252340','#34304d','#574361','#896277'][k],.1,.6))
        line('Horizon light '+str(k),[verts[i*2] for i in range(n+1)],GOLD if k==3 else PURPLE,.012,story)
    photo('The story / independent sunrise background',root/'assets/story-landscape.png',(0,3,1),(16,9),story)
    subject=photo('The story / independent founder foreground',root/'assets/founder-foreground.png',(-.15,0,1),(14,7.875),story)
    key(subject,'location',[(0,(-.15,0,1)),(25.7,(-.15,0,1)),(30.8,(.1,-.2,1.02)),(32,(.1,-.2,1.02))])
    text('Stories that', (2.8,0,1.8),.77,WHITE,story,'CENTER',.03)
    text('move brands.', (2.8,0,.65),.77,WHITE,story,'CENTER',.03)
    line('Story title underline',[(.35,-.1,-.35),(5.3,-.1,-.35)],PURPLE,.02,story)
    # Independent depth layers move around the photographic story surface.
    for i in range(3):
        tile=photo('Story component '+str(i),root/'assets/founder-studio.png',(-6.3+i*.9,-.3+i*.4,-2.5),(1.7,.96),story)
        key(tile,'location',[(0,tuple(tile.location)),(26,tuple(tile.location)),(30,(-5.6+i*.9,-.3+i*.4,-2.2)),(32,(-5.6+i*.9,-.3+i*.4,-2.2))])
    # The same stroke resolves into the brand plate, through anticipation and light.
    identity=empty('05 AutoPromote — dimensional final lockup')
    reveal(identity,31.5,34.6)
    key(identity,'location',[(0,(0,3,0)),(31.5,(0,3,0)),(34.6,(0,0,0)),(38,(0,-.2,0))])
    key(identity,'rotation_euler',[(0,(0,0,.18)),(31.5,(0,0,.18)),(34.8,(0,0,0)),(38,(0,0,0))])
    text('AutoPromote',(0,-.08,-.1),1.25,WHITE,identity,'CENTER',.075)
    line('One idea / final stroke',[(-3.7,0,-1.0),(3.7,0,-1.0)],PURPLE,.016,identity)
    # Reuse the exact existing vector mark, with native editable Bezier contours.
    sys.path.insert(0, str(root/'assets'))
    from vector_geometry import outline
    geometry=json.loads((root/'assets/logo-geometry.json').read_text())
    for i,part in enumerate(geometry['symbolParts']):
        mark=outline(part,geometry['symbolTransform'],(-96,-96),.018,LAVENDER if i==0 else PURPLE)
        mark.parent=identity
        mark.rotation_euler=(math.pi/2,0,0)
        key(mark,'location',[(0,((-1 if i else 1)*.9,0,2.15)),(32,((-1 if i else 1)*.9,0,2.15)),(34.5,(0,0,2.15))])
    # Camera choreography remains editable with ordinary native keyframes.
    data=bpy.data.cameras.new('Continuous story camera')
    cam=bpy.data.objects.new('Continuous story camera',data)
    bpy.context.collection.objects.link(cam)
    data.lens=43
    sc.camera=cam
    for t,pos,target in [(0,(-.4,-25,3.0),(0,0,.0)),(7.2,(.4,-23.4,2.1),(0,0,-.3)),(10,(.9,-21,1.4),(0,0,0)),(14,(1.7,-22,1.6),(0,0,0)),(18,(5.6,-18.5,3.0),(0,0,0)),(22,(-3.8,-16,1.8),(0,0,0)),(24,(0,-15.6,.6),(0,0,0)),(27,(-.7,-21,1.2),(0,4,.1)),(31,(.8,-21.5,1.4),(0,4,.3)),(33,(1.1,-20.5,1.1),(0,0,0)),(35,(0,-19.5,1.0),(0,0,0)),(38,(0,-19.1,.9),(0,0,0))]:
        aim(cam,pos,target,t)
    sc['AutoPromote_source_role']='canonical generated source / native editable cinematic world'
    sc['AutoPromote_story_clock']=json.dumps({'fps':FPS,'duration':DURATION,'sceneBoundaries':[0,8,15,25,32,38]})
    for t,label in [(0,'IDEA'),(8,'STRUCTURE'),(15,'MOTION'),(21,'EXPERIENCE'),(25,'IMPACT'),(32,'AUTOPROMOTE')]:
        sc.timeline_markers.new(label,frame=frame(t))
    sc.frame_set(1)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/welcome-world.blend'))
    return sc


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--root',type=Path,required=True)
    p.add_argument('--mode',choices=['author','frames','samples'],default='author')
    p.add_argument('--device',choices=['cpu','optix'],default='cpu')
    p.add_argument('--width',type=int,default=640)
    p.add_argument('--samples',type=int,default=2)
    p.add_argument('--step',type=int,default=1)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    a.root=a.root.resolve()
    native=a.root/'assets/welcome-world.blend'
    if a.mode!='author' and native.exists():
        bpy.ops.wm.open_mainfile(filepath=str(native))
        sc=bpy.context.scene
    else:
        sc=build(a.root)
    if a.mode=='author':return
    sc.render.resolution_x=a.width
    sc.render.resolution_y=round(a.width*9/16)
    sc.cycles.samples=a.samples
    sc.render.threads_mode='FIXED'
    sc.render.threads=4 if a.device=='cpu' else 16
    device={'backend':'CPU','gpu_verified':False}
    if a.device=='optix':
        sc.render.use_persistent_data=True
        prefs=bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type='OPTIX'
        prefs.get_devices()
        gpu=[d for d in prefs.devices if d.type=='OPTIX']
        if len(gpu)!=1 or 'RTX PRO 6000' not in gpu[0].name.upper():
            raise RuntimeError('Exactly one RTX PRO 6000 OptiX device is required')
        for d in prefs.devices:d.use=d.type=='OPTIX'
        sc.cycles.device='GPU'
        # The existing Blackwell worker accepts OptiX ray tracing but its
        # separate OptiX denoiser initialization failed. Keep ray tracing on
        # the verified GPU and use the CPU denoiser proven by the proxy.
        sc.cycles.denoiser='OPENIMAGEDENOISE'
        sc.cycles.denoising_use_gpu=False
        sc.cycles.denoising_quality='BALANCED'
        sc.cycles.denoising_prefilter='FAST'
        device={'backend':'OPTIX','gpu_verified':True,'denoiser':'OPENIMAGEDENOISE_CPU','denoisingQuality':'BALANCED','denoisingPrefilter':'FAST','persistentData':True,'devices':[d.name for d in gpu]}
    else:sc.cycles.device='CPU'
    output=a.root/('proxy-frames' if a.device=='cpu' else 'gpu-frames')
    output.mkdir(exist_ok=True)
    frames=[frame(t) for t in [3,6,10,13,17,20,23,27,30,34,36]] if a.mode=='samples' else range(1,DURATION*FPS+1,a.step)
    import time
    started=time.monotonic()
    for n in frames:
        target=output/('frame_%04d.png'%n)
        if target.exists():continue
        sc.frame_set(n)
        sc.render.filepath=str(target)
        bpy.ops.render.render(write_still=True)
        if n%48==1:print(json.dumps({'event':'native_frame','frame':n,'elapsedSeconds':time.monotonic()-started}),flush=True)
    (output/'receipt.json').write_text(json.dumps({'device':device,'width':a.width,'samples':a.samples,'step':a.step,'duration':DURATION,'frameCount':len(list(output.glob('frame_*.png'))),'seconds':time.monotonic()-started},indent=2))


if __name__=='__main__':main()
