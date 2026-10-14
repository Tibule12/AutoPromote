"""Actual FFmpeg RGB/alpha/timing/order checks; no browser output substitutes."""
import subprocess
import itertools

import numpy as np
import pytest

from python_media_worker.studio_composition import (blend_layer_block, validate_layer_order, connect_layer_blocks,
                                                   validate_graphic_groups, connect_grouped_layer_blocks)

BACKGROUND = np.array([40, 80, 120], dtype=float)
FOREGROUND = np.array([128, 64, 192], dtype=float)


def group(identity, children, **transform):
    return dict(id=identity, name=identity, kind='graphic_group', layerIds=children, transform=transform)


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


def test_nested_groups_validate_and_require_explicit_order_and_normal_child_blending():
    groups = [group('inner', ['image', 'motion']), group('outer', ['inner', 'text'])]
    nodes, roots, parents = validate_graphic_groups({'groups': groups}, ['image', 'motion', 'text', 'depth'])
    assert roots == ['outer', 'depth'] and parents['inner'] == 'outer' and nodes['inner']['transform']['opacity'] == 1
    with pytest.raises(ValueError, match='explicit'):
        validate_graphic_groups({'groups': groups}, None)
    with pytest.raises(ValueError, match='Normal blend'):
        validate_graphic_groups({'groups': groups, 'layers': [{'id': 'image', 'blend_mode': 'screen'}]}, ['image', 'motion', 'text'])


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


def decode(filters):
    result = subprocess.run(['ffmpeg','-v','error','-filter_complex_threads','1',
                             '-filter_complex',filters,'-map','[out]','-frames:v','30',
                             '-pix_fmt','rgb24','-f','rawvideo','-'], check=True, capture_output=True)
    return np.frombuffer(result.stdout,np.uint8).reshape(-1,32,32,3)


def background():
    return 'color=c=0x285078:s=32x32:r=30:d=1,format=rgba[base];'


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
