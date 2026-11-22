from copy import deepcopy
from python_media_worker.studio_layer_cache import video_layer_raster_key
from python_media_worker.studio_layer_cache import video_preparation_key


def test_prepared_video_reuse_retains_every_source_trim_speed_and_audio_decision():
    from python_media_worker.studio_broll import overlay_commands
    def key(prefix='one', source='owned.mp4', seek=.15, duration=2.3, behavior='loop', offset=.25, audio=True, rate=1):
        commands, _, _, _ = overlay_commands(source, prefix, 1.2, seek, duration,
            behavior, 4.5, [{'start_time': 0, 'end_time': 10, 'rate': rate}], audio, offset)
        return video_preparation_key(source, commands, prefix)
    assert key() == key(prefix='two')
    for changed in [dict(source='other-owned.mp4'), dict(seek=.2), dict(duration=2.2),
                    dict(behavior='hold'), dict(offset=.3), dict(audio=False), dict(rate=1.5)]:
        assert key(**changed) != key()


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
