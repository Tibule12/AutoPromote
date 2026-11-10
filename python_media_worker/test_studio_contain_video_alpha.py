"""Contain letterboxes on ordinary video layers must expose the layers beneath."""
import subprocess
from types import SimpleNamespace
import numpy as np

from python_media_worker.studio_layer_cache import video_layer_uses_canonical_raster
from python_media_worker.studio_layer_motion import render_video_layer_motion


def test_contain_object_transport_and_legacy_or_fullscreen_boundaries():
    layer = {'base_transform': {'scale': 1}, 'motion_keyframes': []}
    assert video_layer_uses_canonical_raster('p', layer, {}, SimpleNamespace(media_fit='contain'))
    assert not video_layer_uses_canonical_raster('p', None, {}, {'mediaFit': 'contain'})
    assert not video_layer_uses_canonical_raster('p', layer, {}, {'mediaFit': 'cover'})
    assert not video_layer_uses_canonical_raster('p', layer, {}, {'mediaFit': 'contain', 'bRollMode': 'fullscreen'})
    assert not video_layer_uses_canonical_raster('p', layer, {}, {'mediaFit': 'contain', 'coverMainVideo': True})


def test_identity_contain_video_selects_transparent_canonical_raster(tmp_path):
    source = tmp_path / 'portrait.mov'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                    'testsrc2=s=90x160:r=8:d=1', '-c:v', 'qtrle', str(source)], check=True)
    overlay = {'type': 'video', 'bRollMode': 'pip', 'mediaFit': 'contain', 'width': 100,
               'height': 100, 'start_time': 0, 'duration': 1, 'frameShape': 'edge'}
    layer = {'id': 'portrait', 'type': 'video', 'anchor_x': 50, 'anchor_y': 50,
             'base_transform': {'x': 50, 'y': 50, 'scale': 1, 'rotation': 0, 'opacity': 1},
             'effects': {}, 'motion_keyframes': []}
    assert video_layer_uses_canonical_raster('portrait', layer, {'layers': [layer]}, overlay)
    movie = tmp_path / 'identity.mov'
    render_video_layer_motion(source, movie, overlay, layer, 320, 180, 1, [], fps=8)
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(movie), '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'])
    pixels = np.frombuffer(raw, np.uint8).reshape(8, 180, 320, 4)
    assert np.all(pixels[:, :, :100, 3] == 0), 'Left contain bar must expose lower layers'
    assert np.all(pixels[:, :, 220:, 3] == 0), 'Right contain bar must expose lower layers'
    assert np.all(pixels[:, :, 140:180, 3] == 255), 'The live portrait remains opaque'
    assert not np.array_equal(pixels[0], pixels[-1]), 'The contained source must keep moving'
