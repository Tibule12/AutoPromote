from copy import deepcopy
from python_media_worker.studio_layer_cache import video_layer_raster_key


def test_only_pixel_identical_native_video_layers_share_the_pre_matte_movie(tmp_path):
    source = tmp_path / 'prepared.mp4'
    source.write_bytes(b'bounded owned-source bytes')
    overlay = {'id': 'one', 'name': 'F fill', 'type': 'video', 'src': 'one', 'width': 70,
               'sourceStartTime': 0, 'duration': 4, 'trackMatte': {'sourceLayerId': 'F'}}
    layer = {'id': 'one', 'type': 'video', 'base_transform': {'x': 50}, 'effects': {'mask': {'enabled': False}},
             'track_matte': {'source_layer_id': 'F'},
             'motion_keyframes': [{'id': 'key-one', 'property': 'opacity', 'time': 0, 'value': 1}]}
    def key(o=overlay, l=layer, fps=24, clock=None):
        return video_layer_raster_key(source, o, l, 1280, 720, 8, clock or [], fps)
    baseline = key()
    second = deepcopy(layer); second['id'] = 'two'; second['track_matte']['source_layer_id'] = 'R'
    second['motion_keyframes'][0]['id'] = 'key-two'
    assert key({**overlay, 'id': 'two', 'name': 'R fill', 'src': 'another signed URL',
                'trackMatte': {'sourceLayerId': 'R'}}, second) == baseline
    for changed in [{**overlay, 'width': 71}, {**overlay, 'sourceStartTime': .1}]:
        assert key(changed) != baseline
    assert key(fps=30) != baseline
    assert key(clock=[{'start_time': 0, 'end_time': 8, 'rate': 2}]) != baseline
    for field, value in [('base_transform', {'x': 51}), ('effects', {'mask': {'enabled': True}})]:
        assert key(l={**layer, field: value}) != baseline
    moved = deepcopy(layer); moved['motion_keyframes'][0]['value'] = .8
    assert key(l=moved) != baseline
    source.write_bytes(b'a different moving source')
    assert key() != baseline
