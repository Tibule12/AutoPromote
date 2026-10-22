"""Actual FFmpeg RGB/alpha/timing/order checks; no browser output substitutes."""
import subprocess
import itertools

import numpy as np
import pytest

from python_media_worker.studio_composition import (blend_layer_block, validate_layer_order, connect_layer_blocks,
                                                   validate_graphic_groups, connect_grouped_layer_blocks, animated_group_filter, graphic_group_mask)
from python_media_worker.studio_motion import easing_value

BACKGROUND = np.array([40, 80, 120], dtype=float)
FOREGROUND = np.array([128, 64, 192], dtype=float)


def group(identity, children, **transform):
    return dict(id=identity, name=identity, kind='graphic_group', layerIds=children, transform=transform)


def key(identity, property_name, time, value, easing='linear', **extra):
    return dict(id=identity, property=property_name, time=time, value=value, easing=easing, **extra)


@pytest.mark.parametrize('keys', [
    [key('a','cropX',0,20)], [key('a','scale',0,3)], [key('a','x',-1,0)],
    [key('a','x',0,None)], [key('a','x',0,True)], [key('a','x',0,10,'unknown')],
    [key('a','x',0,10,'bezier',curve=[-1,0,1,1])], [key('a','x',0,10),key('b','x',0,12)],
])
def test_group_key_preflight_rejects_invalid_property_time_value_curve_and_duplicates(keys):
    with pytest.raises(ValueError):
        validate_graphic_groups({'groups':[{**group('whole',['image']), 'motion_keyframes':keys}]}, ['image'])


def animated_picture(groups, duration=1, speed_plan=None):
    source=f'color=c=0xff00ff:s=8x4:r=30:d={duration},format=rgba[fg];'
    blocks=[('image',['[base][fg]overlay=4:8:format=auto[child];'],'base','child')]
    filters,output=connect_grouped_layer_blocks(blocks,'base',['image'],{'groups':groups},32,32,duration,speed_plan)
    return decode(background(duration)+source+''.join(filters)+f'[{output}]null[out];',frames=round(duration*30))


def magenta_centroid(frame, red=150, blue=180, green=70):
    ys,xs=np.nonzero((frame[:,:,0]>red)&(frame[:,:,2]>blue)&(frame[:,:,1]<green))
    assert len(xs)>5
    return np.array([xs.mean(),ys.mean()]), len(xs)


def test_actual_group_translation_keys_move_every_child_in_the_saved_clock():
    frames=animated_picture([{**group('whole',['image']), 'motion_keyframes':[key('a','x',0,0),key('b','x',1,25)]}])
    for index in [0,15,27]:
        centre,count=magenta_centroid(frames[index]);np.testing.assert_allclose(centre,[7.5+8*index/30,9.5],atol=1)
        assert count==32


def test_actual_group_scale_and_rotation_keys_keep_an_invariant_parent_canvas():
    frames=animated_picture([{**group('whole',['image']), 'motion_keyframes':[
        key('s0','scale',0,1),key('s1','scale',1,.5),key('r0','rotation',0,0),key('r1','rotation',1,90)]}])
    for index in [0,15,27]:
        time=index/30;angle=np.deg2rad(90*time);scale=1-.5*time
        matrix=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
        expected=np.array([15.5,15.5])+matrix@((np.array([7.5,9.5])-15.5)*scale)
        centre,_=magenta_centroid(frames[index]);np.testing.assert_allclose(centre,expected,atol=1)


def test_actual_opacity_keys_fade_the_overlapping_composite_once_and_hold_at_exact_keys():
    sources=('color=c=red:s=8x8:r=30:d=1,format=rgba[red];color=c=blue:s=8x8:r=30:d=1,format=rgba[blue];')
    blocks=[('image',['[base][red]overlay=8:8:format=auto[first];'],'base','first'),
            ('motion',['[first][blue]overlay=12:8:format=auto[second];'],'first','second')]
    for easing in ['linear','hold','ease_in_out','bezier']:
        keys=[key('a','opacity',0,0),key('b','opacity',.5,1,easing,**({'curve':[.2,0,.8,1]} if easing=='bezier' else {}))]
        filters,out=connect_grouped_layer_blocks(blocks,'base',['image','motion'],
            {'groups':[{**group('whole',['image','motion']), 'motion_keyframes':keys}]},32,32,1)
        frames=decode(background()+sources+''.join(filters)+f'[{out}]null[out];')
        for index,alpha in [(0,0),(15,1),(27,1)]:
            np.testing.assert_allclose(frames[index,10,14],BACKGROUND*(1-alpha)+np.array([0,0,255])*alpha,atol=2)
        alpha=easing_value(.4,easing,[.2,0,.8,1])
        np.testing.assert_allclose(frames[6,10,14],BACKGROUND*(1-alpha)+np.array([0,0,255])*alpha,atol=2)


def test_actual_nested_group_keys_preserve_parent_rotation_and_child_opacity():
    groups=[{**group('inner',['image']), 'motion_keyframes':[key('x0','x',0,0),key('x1','x',1,25),key('a0','opacity',0,.5),key('a1','opacity',1,1)]},
            {**group('outer',['inner'],rotation=90,opacity=.5), 'motion_keyframes':[key('y0','y',0,0),key('y1','y',1,25)]}]
    frame=animated_picture(groups)[15]
    centre,count=magenta_centroid(frame,red=110,blue=160,green=65)
    np.testing.assert_allclose(centre,[21.5,15.5],atol=.1);assert count==32
    alpha=(191/255)*(127/255)
    np.testing.assert_allclose(frame[15,21],BACKGROUND*(1-alpha)+np.array([255,0,255])*alpha,atol=2)


def test_actual_group_keys_follow_the_same_inverse_clock_after_two_x_speed():
    groups=[{**group('whole',['image']), 'motion_keyframes':[key('x0','x',0,0),key('x1','x',2,25)]}]
    frames=animated_picture(groups,speed_plan=[dict(start_time=0,end_time=2,rate=2)])
    centre,_=magenta_centroid(frames[15]);np.testing.assert_allclose(centre,[11.5,9.5],atol=.1)


def test_actual_constant_keys_preserve_the_existing_static_picture_and_group_alpha():
    static=animated_picture([group('whole',['image'],opacity=.5)])
    keyed=animated_picture([{**group('whole',['image'],opacity=1), 'motion_keyframes':[
        key('a','opacity',0,.5),key('b','opacity',1,.5),key('r','rotation',0,0)]}])
    np.testing.assert_array_equal(keyed,static)


def test_constant_rotation_and_scale_keys_do_not_allocate_unused_large_base_or_diagonal_surfaces():
    group_plan={**group('whole',['image'],rotation=0,scale=2), 'motion_keyframes':[
        key('s','scale',0,1),key('r','rotation',0,0)]}
    node=validate_graphic_groups({'groups':[group_plan]},['image'])[0]['whole']
    filters,_,_,_=animated_group_filter(node,'base','group',3840,2160,1,None,30)
    assert 'pad=3842:2162' in ''.join(filters)


@pytest.mark.parametrize('groups', [
    [group('a', ['unknown'])], [group('a', ['image']), group('b', ['image'])],
    [group('a', ['b']), group('b', ['a'])], [group('a', ['image', 'text'])],
    [group('a', ['image'], scale=float('nan'))], [group('a', ['image'], scale=3)],
    [group('a', ['image'], opacity=None)],
    [group('a', ['image'], anchorX=20)], [{**group('a', ['image']), 'keyframes': []}],
])
def test_invalid_group_hierarchy_and_unimplemented_fields_are_rejected(groups):
    with pytest.raises(ValueError):
        validate_graphic_groups({'groups': groups}, ['image', 'motion', 'text'])


def test_nested_groups_validate_and_require_explicit_order_with_child_blending():
    groups = [group('inner', ['image', 'motion']), group('outer', ['inner', 'text'])]
    nodes, roots, parents = validate_graphic_groups({'groups': groups}, ['image', 'motion', 'text', 'depth'])
    assert roots == ['outer', 'depth'] and parents['inner'] == 'outer' and nodes['inner']['transform']['opacity'] == 1
    with pytest.raises(ValueError, match='explicit'):
        validate_graphic_groups({'groups': groups}, None)
    assert validate_graphic_groups({'groups': groups, 'layers': [{'id': 'image', 'blend_mode': 'screen'}]}, ['image', 'motion', 'text'])[0]


def test_group_count_and_depth_limits_reject_oversized_hierarchies():
    with pytest.raises(ValueError, match='64'):
        validate_graphic_groups({'groups': [group(f'g{i}', ['image']) for i in range(65)]}, ['image'])
    with pytest.raises(ValueError, match='8 levels'):
        validate_graphic_groups({'groups': [group(f'g{i}', [f'g{i-1}' if i else 'image']) for i in range(9)]}, ['image'])


@pytest.mark.parametrize('opacity', [0, .5, 1])
def test_actual_group_opacity_is_applied_after_opaque_overlapping_children(opacity):
    sources = ('color=c=red:s=8x8:r=30:d=1,format=rgba[red];'
               'color=c=blue:s=8x8:r=30:d=1,format=rgba[blue];')
    blocks = [('image', ['[base][red]overlay=8:8:format=auto[first];'], 'base', 'first'),
              ('motion', ['[first][blue]overlay=12:8:format=auto[second];'], 'first', 'second')]
    filters, output = connect_grouped_layer_blocks(blocks, 'base', ['image', 'motion'],
        {'groups': [group('whole', ['image', 'motion'], opacity=opacity)]}, 32, 32, 1)
    frames = decode(background()+sources+''.join(filters)+f'[{output}]null[out];')
    alpha = int(opacity*255)/255
    np.testing.assert_allclose(frames[15, 10, 10], BACKGROUND*(1-alpha)+[255*alpha, 0, 0], atol=2)
    # Overlap has exactly one blue layer at group opacity; red cannot leak through.
    np.testing.assert_allclose(frames[15, 10, 14], BACKGROUND*(1-alpha)+[0, 0, 255*alpha], atol=2)
    np.testing.assert_allclose(frames[15, 0, 0], BACKGROUND, atol=1)


def test_actual_nested_right_angle_rotation_translation_and_opacity_preserve_local_geometry():
    source = 'color=c=0xff00ff:s=8x4:r=30:d=1,format=rgba[fg];'
    blocks = [('image', ['[base][fg]overlay=4:8:format=auto[child];'], 'base', 'child')]
    # Pixel-centre analytic geometry: (7.5,9.5) -> rotate90 around(15.5,15.5)
    # = (21.5,7.5), then translate(-4,+8) = (17.5,15.5).
    groups = [group('inner', ['image'], rotation=90, opacity=.8),
              group('outer', ['inner'], x=-12.5, y=25, opacity=.5)]
    filters, output = connect_grouped_layer_blocks(blocks, 'base', ['image'], {'groups': groups}, 32, 32, 1)
    frame = decode(background()+source+''.join(filters)+f'[{output}]null[out];')[15]
    alpha = (204/255)*(127/255)
    np.testing.assert_allclose(frame[15, 17], BACKGROUND*(1-alpha)+np.array([255,0,255])*alpha, atol=2)
    mask = (frame[:,:,0] > 100) & (frame[:,:,2] > 150) & (frame[:,:,1] < 70)
    ys, xs = np.nonzero(mask)
    assert len(xs) == 32
    assert xs.mean() == 17.5 and ys.mean() == 15.5


def test_group_scaling_retains_alpha_and_child_timing():
    source = 'color=c=0xff00ff:s=8x8:r=30:d=1,format=rgba[fg];'
    blocks = [('image', ["[base][fg]overlay=8:8:format=auto:enable='between(t,0.5,0.75)'[child];"], 'base', 'child')]
    filters, output = connect_grouped_layer_blocks(blocks, 'base', ['image'],
        {'groups': [group('whole', ['image'], scale=.5)]}, 32, 32, 1)
    frames = decode(background()+source+''.join(filters)+f'[{output}]null[out];')
    np.testing.assert_allclose(frames[6], np.broadcast_to(BACKGROUND, (32,32,3)), atol=1)
    np.testing.assert_allclose(frames[18,13,13], [255,0,255], atol=2)
    np.testing.assert_allclose(frames[27], np.broadcast_to(BACKGROUND, (32,32,3)), atol=1)


def test_group_intermediate_budget_fails_before_allocating_oversized_filters():
    with pytest.raises(ValueError, match='4K intermediate budget'):
        connect_grouped_layer_blocks([], 'base', ['image'], {'groups': [group('whole', ['image'], scale=2)]}, 3840, 2160, 1)


def test_explicit_stack_rejects_missing_unknown_duplicate_and_colliding_family_ids():
    known = (["image"], ["motion"], ["depth"])
    assert validate_layer_order({}, *known) is None
    assert validate_layer_order({"order": ["depth", "image", "motion"]}, *known) == ["depth", "image", "motion"]
    for order in (["image", "motion"], ["image", "motion", "unknown"], ["image", "motion", "motion"], "image"):
        with pytest.raises(ValueError, match="every graphic"):
            validate_layer_order({"order": order}, *known)
    with pytest.raises(ValueError, match="every graphic"):
        validate_layer_order({"order": ["image", "motion"]}, ["image"], ["motion"], ["image"])


@pytest.mark.parametrize("order", list(itertools.permutations(["image", "motion", "depth"])))
def test_actual_ffmpeg_cross_family_alpha_stack_uses_the_requested_backdrop(order):
    # These are independent prepared alpha streams, as used by images, motion
    # scenes and resolved owned 3D. Compare all orderings with separate RGBA math.
    colors = {"image": (240, 30, 60), "motion": (20, 220, 80), "depth": (70, 50, 230)}
    sources, blocks, current = "", [], "base"
    for index, (identity, color) in enumerate(colors.items()):
        rgb = ''.join(f'{value:02x}' for value in color)
        sources += f"color=c=0x{rgb}:s=8x8:r=30:d=1,format=rgba,colorchannelmixer=aa=0.5[fg{index}];"
        output = f"layer{index}"
        blocks.append((identity, [f"[{current}][fg{index}]overlay=x=8:y=8:format=auto[{output}];"], current, output))
        current = output
    filters, output = connect_layer_blocks(blocks, 'base', list(order))
    frames = decode(background()+sources+''.join(filters)+f"[{output}]null[out];")
    expected = BACKGROUND.copy()
    for identity in order:
        expected = expected * (1 - 127/255) + np.array(colors[identity]) * (127/255)
    np.testing.assert_allclose(frames[15, 10, 10], expected, atol=2)
    np.testing.assert_allclose(frames[15, 0, 0], BACKGROUND, atol=1)


def blend(base, front, mode):
    if mode == 'multiply':
        return base * front / 255
    if mode == 'screen':
        return 255 - (255-base)*(255-front)/255
    if mode == 'overlay':
        return np.where(base <= 127.5, 2*base*front/255, 255-2*(255-base)*(255-front)/255)
    if mode == 'hard-light':
        return np.where(front <= 127.5, 2*base*front/255, 255-2*(255-base)*(255-front)/255)
    if mode == 'soft-light':
        d = np.where(base <= 63.75, ((16*base/255-12)*base/255+4)*base, np.sqrt(base*255))
        return np.where(front <= 127.5, base-(255-2*front)*base*(255-base)/65025,
                        base+(2*front-255)*(d-base)/255)
    if mode == 'color-dodge':
        return np.where(base == 0, 0, np.minimum(255, base*255/np.maximum(255-front, 1e-9)))
    if mode == 'luminosity':
        l = np.dot(front, [.3,.59,.11])
        c = base+l-np.dot(base, [.3,.59,.11])
        low = c.min()
        if low < 0:
            c = l+(c-l)*l/(l-low)
        high = c.max()
        if high > 255:
            c = l+(c-l)*(255-l)/(high-l)
        return c
    return np.abs(base-front)


def decode(filters, frames=30, inputs=()):
    result = subprocess.run(['ffmpeg','-v','error','-filter_complex_threads','1',
                             *inputs,'-filter_complex',filters,'-map','[out]','-frames:v',str(frames),
                             '-pix_fmt','rgb24','-f','rawvideo','-'], check=True, capture_output=True)
    return np.frombuffer(result.stdout,np.uint8).reshape(-1,32,32,3)


def background(duration=1):
    return f'color=c=0x285078:s=32x32:r=30:d={duration},format=rgba[base];'


@pytest.mark.parametrize('mode',['multiply','screen','difference','overlay','soft-light','hard-light','color-dodge','luminosity'])
@pytest.mark.parametrize('alpha',[0,.5,1])
def test_rgb_mode_preserves_alpha_and_the_picture_outside_the_layer(mode,alpha):
    front=f'color=c=0x8040c0:s=8x8:r=30:d=1,format=rgba,colorchannelmixer=aa={alpha}[fg];'
    block=['[base][fg]overlay=x=8:y=8:format=auto[out];']
    frames=decode(background()+front+''.join(blend_layer_block(block,'base','out',mode,32,32,1,'layer')))
    np.testing.assert_allclose(frames[15,2,2],BACKGROUND,atol=1)
    np.testing.assert_allclose(frames[15,10,10],BACKGROUND*(1-alpha)+blend(BACKGROUND,FOREGROUND,mode)*alpha,atol=2)


def test_layer_timing_remains_transparent_before_and_after_its_cue():
    front='color=c=0x8040c0:s=8x8:r=30:d=1,format=rgba[fg];'
    block=["[base][fg]overlay=x=8:y=8:format=auto:enable='between(t,0.5,0.75)'[out];"]
    frames=decode(background()+front+''.join(blend_layer_block(block,'base','out','multiply',32,32,1,'layer')))
    np.testing.assert_allclose(frames[6,10,10],BACKGROUND,atol=1)
    np.testing.assert_allclose(frames[18,10,10],blend(BACKGROUND,FOREGROUND,'multiply'),atol=2)
    np.testing.assert_allclose(frames[27,10,10],BACKGROUND,atol=1)


@pytest.mark.parametrize('mode',['overlay','soft-light','hard-light','color-dodge','luminosity'])
def test_bounded_blending_is_pixel_identical_to_the_full_filter(mode):
    front='color=c=0x8040c0:s=8x8:r=30:d=1,format=rgba[fg];'
    block=["[base][fg]overlay=x=8:y=8:format=auto:enable='between(t,0.5,0.75)'[out];"]
    full=decode(background()+front+''.join(blend_layer_block(block,'base','out',mode,32,32,1,'layer')))
    bounded=decode(background()+front+''.join(blend_layer_block(block,'base','out',mode,32,32,1,'layer',(.5,.75))))
    np.testing.assert_array_equal(bounded,full)


@pytest.mark.parametrize('order',[['multiply','screen'],['screen','multiply']])
def test_the_saved_layer_order_changes_the_actual_combined_pixels(order):
    front='color=c=0x8040c0:s=8x8:r=30:d=1,format=rgba,split=2[fg1][fg2];'
    first=blend_layer_block(['[base][fg1]overlay=x=8:y=8:format=auto[mid];'],
                            'base','mid',order[0],32,32,1,'first')
    second=blend_layer_block(['[mid][fg2]overlay=x=8:y=8:format=auto[out];'],
                             'mid','out',order[1],32,32,1,'second')
    frames=decode(background()+front+''.join(first+second))
    expected=blend(blend(BACKGROUND,FOREGROUND,order[0]),FOREGROUND,order[1])
    np.testing.assert_allclose(frames[15,10,10],expected,atol=3)


def test_normal_path_keeps_the_existing_filter_graph():
    block=['[base][fg]overlay=0:0[out];']
    assert blend_layer_block(block,'base','out','normal',32,32,1,'layer')==block


@pytest.mark.parametrize('mode',['hue','unknown'])
def test_unimplemented_modes_are_rejected_instead_of_rendering_as_normal(mode):
    with pytest.raises(ValueError,match='not implemented'):
        blend_layer_block(['[base][fg]overlay=0:0[out];'],'base','out',mode,32,32,1,'layer')


@pytest.mark.parametrize('decision', [
    {'blendMode':'unknown'}, {'blendMode':None}, {'mask':None}, {'mask':[]},
    {'mask':{'enabled':'yes'}}, {'mask':{'inverted':1}}, {'mask':{'shape':'triangle'}},
    {'mask':{'feather':float('nan')}}, {'mask':{'radius':51}}, {'mask':{'feather':101}},
    {'mask':{'path':'polygon(0% 0%, 10% 20%)'}}, {'mask':{'points':[]}},
])
def test_group_composite_preflight_rejects_unsupported_and_malformed_decisions(decision):
    with pytest.raises(ValueError):
        validate_graphic_groups({'groups':[{**group('whole',['image']), **decision}]},['image'])


@pytest.mark.parametrize('mode', ['multiply','screen','difference','overlay','soft-light','hard-light','color-dodge','luminosity'])
@pytest.mark.parametrize('backdrop_alpha', [0,.5,1])
def test_actual_child_blend_uses_the_isolated_backdrop_alpha(mode,backdrop_alpha):
    source=(f'color=c=0x285078:s=32x32:r=30:d=1,format=rgba,colorchannelmixer=aa={backdrop_alpha}[local];'
            'color=c=0x8040c0:s=8x8:r=30:d=1,format=rgba,colorchannelmixer=aa=.5[fg];')
    block=['[local][fg]overlay=x=8:y=8:format=auto[child];']
    filters=blend_layer_block(block,'local','child',mode,32,32,1,'nested')
    frames=decode(background()+source+''.join(filters)+'[base][child]overlay=0:0:format=auto[out];')
    ba=round(backdrop_alpha*255)/255;fa=127/255
    effective=FOREGROUND*(1-ba)+blend(BACKGROUND,FOREGROUND,mode)*ba
    # The lower child has the same RGB as the outer background. Porter-Duff
    # source-over therefore reduces to this independently computed blend color.
    np.testing.assert_allclose(frames[15,10,10],BACKGROUND*(1-fa)+effective*fa,atol=2)
    np.testing.assert_allclose(frames[15,0,0],BACKGROUND,atol=1)


@pytest.mark.parametrize('mode', ['multiply','screen','difference','overlay','soft-light','hard-light','color-dodge','luminosity'])
def test_actual_group_blend_applies_after_child_overlap_and_whole_group_opacity(mode):
    sources=('color=c=red:s=12x8:r=30:d=1,format=rgba[red];'
             'color=c=0x8040c0:s=8x8:r=30:d=1,format=rgba[purple];')
    blocks=[('lower',['[base][red]overlay=4:8:format=auto[first];'],'base','first'),
            ('upper',['[first][purple]overlay=8:8:format=auto[second];'],'first','second')]
    filters,out=connect_grouped_layer_blocks(blocks,'base',['lower','upper'],
        {'groups':[{**group('whole',['lower','upper'],opacity=.5), 'blendMode':mode}]},32,32,1)
    frames=decode(background()+sources+''.join(filters)+f'[{out}]null[out];')
    a=127/255
    np.testing.assert_allclose(frames[15,10,10],BACKGROUND*(1-a)+blend(BACKGROUND,FOREGROUND,mode)*a,atol=2)
    np.testing.assert_allclose(frames[15,0,0],BACKGROUND,atol=1)


@pytest.mark.parametrize('mask', [
    {'enabled':True,'shape':'polygon','path':'polygon(0% 0%, 50% 0%, 50% 100%, 0% 100%)'},
    {'enabled':True,'shape':'ellipse'},
    {'enabled':True,'shape':'ellipse','inverted':True},
    {'enabled':True,'shape':'rectangle','radius':0,'feather':20},
])
def test_actual_group_mask_clips_assembled_children_before_transform_opacity_and_blend(tmp_path,mask):
    node={**group('whole',['lower','upper'],x=12.5,opacity=.5),'mask':mask,'blendMode':'screen'}
    matte=graphic_group_mask(node,32,32);path=tmp_path/'mask.png';matte.save(path)
    sources=('color=c=red:s=32x32:r=30:d=1,format=rgba[red];'
             'color=c=0x8040c0:s=32x32:r=30:d=1,format=rgba[purple];')
    blocks=[('lower',['[base][red]overlay=0:0:format=auto[first];'],'base','first'),
            ('upper',['[first][purple]overlay=0:0:format=auto[second];'],'first','second')]
    filters,out=connect_grouped_layer_blocks(blocks,'base',['lower','upper'],{'groups':[node]},32,32,1,
        mask_inputs={'whole':'0:v'})
    frames=decode(background()+sources+''.join(filters)+f'[{out}]null[out];',
        inputs=['-loop','1','-framerate','30','-i',str(path)])
    for x,y in [(8,8),(28,8),(8,24),(28,24),(20,16)]:
        alpha=int(matte.getpixel((x-4,y)))*127//255/255
        expected=BACKGROUND*(1-alpha)+blend(BACKGROUND,FOREGROUND,'screen')*alpha
        np.testing.assert_allclose(frames[15,y,x],expected,atol=2)
    np.testing.assert_allclose(frames[15,10,0],BACKGROUND,atol=1)
    if mask['shape']=='polygon':
        np.testing.assert_allclose(frames[15,8,8],BACKGROUND*(1-127/255)+blend(BACKGROUND,FOREGROUND,'screen')*127/255,atol=2)
        np.testing.assert_allclose(frames[15,8,28],BACKGROUND,atol=1)


def test_enabled_group_mask_rejects_a_missing_prepared_matte():
    with pytest.raises(ValueError,match='prepared local matte'):
        connect_grouped_layer_blocks([], 'base', ['image'],
            {'groups':[{**group('whole',['image']), 'mask':{'enabled':True}}]},32,32,1)

@pytest.mark.parametrize('timing',[None,{'startTime':-1,'duration':2},{'startTime':0,'duration':float('nan')},
                                  {'startTime':True,'duration':1},{'startTime':0,'duration':1,'sourceOffset':2}])
def test_group_timing_rejects_malformed_or_unsupported_clock_decisions(timing):
    with pytest.raises(ValueError,match='timing'):
        validate_graphic_groups({'groups':[{**group('whole',['image']),'timing':timing}]},['image'])

@pytest.mark.parametrize('mode',['normal','screen'])
def test_group_in_out_limits_use_half_open_frame_times_without_changing_child_animation(mode):
    groups=[{**group('whole',['image']),'blendMode':mode,'timing':{'startTime':.25,'duration':.25}}]
    frames=animated_picture(groups)
    for index in [0,7,15,27]:
        np.testing.assert_allclose(frames[index,9,7],BACKGROUND,atol=1)
    rgb=np.array([255,0,255]);expected=rgb if mode=='normal' else blend(BACKGROUND,rgb,mode)
    np.testing.assert_allclose(frames[8,9,7],expected,atol=2)


def test_nested_group_timing_intersects_parent_and_child_windows_after_two_x_retime():
    groups=[{**group('inner',['image']),'timing':{'startTime':.2,'duration':1}},
            {**group('outer',['inner']),'timing':{'startTime':.5,'duration':.5}}]
    frames=animated_picture(groups,speed_plan=[dict(start_time=0,end_time=2,rate=2)])
    for index in [0,7,15,27]:np.testing.assert_allclose(frames[index,9,7],BACKGROUND,atol=1)
    np.testing.assert_allclose(frames[8,9,7],[255,0,255],atol=2)


def test_a_fully_ripple_deleted_group_window_renders_no_descendant_pixels():
    frames=animated_picture([{**group('whole',['image']),'timing':{'startTime':.3,'duration':0}}])
    for index in [0,9,15,27]:np.testing.assert_allclose(frames[index,9,7],BACKGROUND,atol=1)
