"""Held video poses must use the same geometry as an equivalent keyed pose."""
import copy
import subprocess

import numpy as np
import pytest

from python_media_worker.studio_layer_cache import video_layer_uses_canonical_raster
from python_media_worker.studio_layer_motion import render_video_layer_motion


@pytest.mark.parametrize('change', [
    {'base_transform': {'scale': 100 / 70}},
    {'base_transform': {'scale': .7}},
    {'base_transform': {'rotation': 19}},
    {'base_transform': {'crop_x': 8}},
    {'base_transform': {'crop_y': 6}},
    {'anchor_x': 25},
    {'anchor_y': 75},
])
def test_static_geometry_never_falls_back_to_legacy_broll(change):
    layer = {'id': 'video', **change}
    assert video_layer_uses_canonical_raster('video', layer, {'layers': [layer]})


def test_identity_and_legacy_videos_keep_the_existing_path():
    assert not video_layer_uses_canonical_raster('video', None, {})
    layer = {'id': 'video', 'anchor_x': 50, 'anchor_y': 50,
             'base_transform': {'x': 23, 'y': 63, 'scale': 1,
                                'rotation': 0, 'crop_x': 0, 'crop_y': 0, 'opacity': .7}}
    assert not video_layer_uses_canonical_raster('video', layer, {'layers': [layer]})


def test_real_static_scaled_video_equals_constant_keyed_video(tmp_path):
    source = tmp_path / 'grid.mov'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i',
                    'testsrc2=s=160x90:r=8:d=1', '-c:v', 'qtrle', str(source)], check=True)
    overlay = {'type': 'video', 'start_time': 0, 'duration': 1, 'width': 70,
               'height': 70, 'frameShape': 'edge', 'mediaFit': 'cover'}
    layer = {'id': 'held', 'type': 'video', 'anchor_x': 50, 'anchor_y': 50,
             'base_transform': {'x': 50, 'y': 50, 'scale': 100 / 70, 'rotation': 0, 'opacity': 1},
             'effects': {}, 'motion_keyframes': []}
    assert video_layer_uses_canonical_raster('held', layer, {'layers': [layer]})
    keyed = copy.deepcopy(layer)
    keyed['motion_keyframes'] = [{'property': 'scale', 'time': t, 'value': 100 / 70,
                                  'easing': 'hold'} for t in [0, 1]]
    movies = []
    for name, plan in [('static', layer), ('keyed', keyed)]:
        path = tmp_path / f'{name}.mov'
        render_video_layer_motion(source, path, overlay, plan, 320, 180, 1, [], fps=8)
        data = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path),
                                        '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'])
        movies.append(np.frombuffer(data, np.uint8).reshape(8, 180, 320, 4))
    np.testing.assert_array_equal(movies[0], movies[1])
    assert np.all(movies[0][:, :, :, 3] == 255), '70% × 100/70 must fill the programme canvas'
    assert not np.array_equal(movies[0][0, :, :, :3], movies[0][-1, :, :, :3]), 'Video must keep changing'
