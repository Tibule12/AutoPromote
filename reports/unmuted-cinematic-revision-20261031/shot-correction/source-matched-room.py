"""Manual Blender shot study, not a Studio engine or template expansion.

One real source-frame proof, keeping the photographed equipment/plant overlap.
"""
from pathlib import Path
import math,sys
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parents[2]/'studio_3d_renderer'))
from cinematic_scene import material,box,text,linear_hex
WORK=ROOT/'private/source-matched-20261101'
verified='--verified' in sys.argv
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.name='Source-matched room'
scene.render.engine='BLENDER_EEVEE_NEXT';scene.eevee.taa_render_samples=64
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.render.fps=24;scene.frame_start=1;scene.frame_end=72
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.78,.72,.66,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
wall=material('Warm lime plaster','#b9b0a2',.88)
linen=material('Woven acoustic linen','#afa48e',.96)
wood=material('Oiled walnut','#584335',.68)
floor=material('Warm matte floor','#736355',.9)
charcoal=material('Screen frame','#202023',.55)
rose=material('Screen warm rose glow','#802a4c',.6,0,.7)
cream=material('Screen ivory lettering','#f5d9bb',.55,0,.6)
for mat,scale,strength in [(wall,85,.018),(linen,520,.04),(wood,8,.035)]:
    nodes=mat.node_tree.nodes;links=mat.node_tree.links
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale
    noise.inputs['Roughness'].default_value=.72
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=strength;bump.inputs['Distance'].default_value=.012
    links.new(noise.outputs['Fac'],bump.inputs['Height'])
    links.new(bump.outputs['Normal'],nodes['Principled BSDF'].inputs['Normal'])
root=bpy.data.objects.new('Room wall alignment',None);scene.collection.objects.link(root)
root.location=(0,1.6,0);root.rotation_euler.z=math.radians(-12)
box('Plaster wall',(0,.06,1.4),(5,.12,2.8),wall,root,.012)
box('Floor',(0,0,-.035),(7,10,.07),floor,None,.01)
box('Wall skirting',(0,-.012,.065),(5,.045,.13),wood,root,.006)
for i,x in enumerate([-1.75,-1.28,-.81]):
    box(f'Acoustic frame {i}',(x,-.065,1.28),(.425,.11,1.53),wood,root,.012)
    box(f'Acoustic fabric {i}',(x,-.13,1.28),(.37,.025,1.475),linen,root,.009)
box('Brand monitor casing',(.9,-.09,1.15),(1.90,.10,1.18),charcoal,root,.016)
box('Brand monitor glass',(.9,-.146,1.15),(1.85,.008,1.13),rose,root,.003)
font=bpy.data.fonts.load(str(ROOT.parents[2]/'frontend/src/components/motion/fonts/Inter-SemiBold.ttf'))
text('Monitor show identity','UNMUTED',(.9,-.16,1.33),.24,cream,font,root,'CENTER')
text('Monitor subtitle','THE CONVERSATION CONTINUES',(.9,-.161,1.08),.044,cream,font,root,'CENTER')
box('Low media cabinet',(.85,-.02,.30),(2.0,.36,.48),wood,root,.012)
for x in [.21,.85,1.49]:
    box('Cabinet linen door',(x,-.205,.30),(.60,.018,.41),linen,root,.004)
    box('Cabinet pull',(x,-.22,.37),(.12,.014,.012),charcoal,root,.003)
def area(name,location,target,energy,color,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=location
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
area('Broad source-matched warm key',(-2,-2,3.2),(0,1,1.1),300,(1,.87,.72),4)
area('Soft room fill',(2,-.8,2.6),(0,1,1.3),90,(1,.93,.85),3)
area('Screen rose spill',(1.2,1.1,1.4),(-.5,1.5,1.3),12,(1,.16,.32),1.0)
bpy.ops.object.camera_add(location=(0,-3.57,1.0))
camera=bpy.context.object;camera.name='Fixed source-facing camera';camera.data.lens=50
camera.rotation_euler=(Vector((0,0,1.0))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera=camera;camera.data.dof.use_dof=False
# A sharp recorded foreground is composited over this room. Its original
# furniture/equipment overlaps remain photographic; no fake mic geometry.
bpy.ops.mesh.primitive_plane_add(size=2,location=(0,0,1.0),rotation=(math.pi/2,0,0))
surface=bpy.context.object;surface.name='Recorded person chair equipment and occluders'
surface.scale=(1.8*1430/1000/2,1.8/2,1)
mat=bpy.data.materials.new('Recorded source RGBA');mat.use_nodes=True
nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(WORK/('foreground-verified.png' if verified else 'foreground-first.png')))
tex.image.colorspace_settings.name='sRGB'
emission=nodes.new('ShaderNodeEmission');emission.inputs['Strength'].default_value=1
transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');output=nodes.new('ShaderNodeOutputMaterial')
links.new(tex.outputs['Color'],emission.inputs['Color']);links.new(tex.outputs['Alpha'],mix.inputs[0])
links.new(transparent.outputs[0],mix.inputs[1]);links.new(emission.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs[0])
mat.surface_render_method='BLENDED';surface.data.materials.append(mat)
if verified:
    focus=bpy.data.objects.new('Recorded source plane focus',None);scene.collection.objects.link(focus);focus.location=(0,0,1)
    camera.data.dof.use_dof=True;camera.data.dof.focus_object=focus;camera.data.dof.aperture_fstop=2.8
    foreground=bpy.data.scenes.new('Recorded foreground')
    foreground.render.engine='BLENDER_EEVEE_NEXT';foreground.eevee.taa_render_samples=16
    foreground.render.resolution_x=1280;foreground.render.resolution_y=720;foreground.render.resolution_percentage=100
    foreground.render.film_transparent=True;foreground.render.fps=24;foreground.frame_end=72
    foreground.view_settings.view_transform='Standard';foreground.view_settings.look='None'
    source_copy=surface.copy();foreground.collection.objects.link(source_copy);source_copy.hide_render=False;surface.hide_render=True
    camera_copy=camera.copy();camera_copy.data=camera.data.copy();camera_copy.data.dof.use_dof=False
    foreground.collection.objects.link(camera_copy);foreground.camera=camera_copy
    scene.use_nodes=True;nodes=scene.node_tree.nodes;nodes.clear();links=scene.node_tree.links
    bg=nodes.new('CompositorNodeRLayers');fg=nodes.new('CompositorNodeRLayers');fg.scene=foreground
    over=nodes.new('CompositorNodeAlphaOver');over.inputs[0].default_value=1
    output=nodes.new('CompositorNodeComposite')
    links.new(bg.outputs['Image'],over.inputs[1]);links.new(fg.outputs['Image'],over.inputs[2]);links.new(over.outputs[0],output.inputs[0])
scene.render.filepath=str(WORK/('room-proof-verified.png' if verified else 'room-proof-first.png'))
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/('Source-matched room verified.blend' if verified else 'Source-matched room proof.blend')))
bpy.ops.render.render(write_still=True)
