import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
import numpy as np
from python_media_worker.studio_text_animator import AnimatedTitle, text_layout, text_poses, validate_text_animation_layer, METRICS
from python_media_worker.studio_layer_motion import render_image_layer_motion, layer_pose
from python_media_worker.studio_layer_motion import _render_pose, _bounded_text_pose
from python_media_worker.studio_composition import validate_layer_order

SPEC = dict(version=1, unit='character', order='forward', stagger=65, fromX=0, fromY=1.4,
            fromScale=.35, fromRotation=-35, fromOpacity=0, tracking=.3, rangeStart=0, rangeEnd=100, easing='back_out')
SOURCE = dict(id='text', type='text', text='MAKE IT MOVE', width=90, fontFamily='Inter', fontWeight=900,
              x=50, y=50, scale=1, shadow='none', start_time=0, duration=2)


class StudioTextAnimatorTests(unittest.TestCase):
    def test_bounded_title_projection_retains_reference_geometry_and_filter_fallback(self):
        from unittest.mock import patch
        from PIL import Image, ImageDraw
        from scipy.ndimage import binary_erosion, distance_transform_edt
        asset = Image.new('RGBA', (800, 500))
        ImageDraw.Draw(asset).rounded_rectangle((280, 170, 530, 330), 25, fill='white')
        source = {**SOURCE, 'width': 160, 'height': 120, 'mediaFit': 'stretch'}
        layer = {'text_animator': SPEC, 'anchor_x': 47, 'anchor_y': 52}
        for rotation in [0, 3, -23, 90]:
            pose = {'x': 45, 'y': 55, 'rotation': rotation, 'scale': 1, 'opacity': .7, 'crop_x': 0, 'crop_y': 0}
            actual = np.array(_render_pose(asset, source, layer, pose, (320, 180)))[..., 3] > 50
            with patch('python_media_worker.studio_layer_motion._bounded_text_pose', return_value=None):
                reference = np.array(_render_pose(asset, source, layer, pose, (320, 180)))[..., 3] > 50
            assert (actual & reference).sum() / (actual | reference).sum() >= .97
            a,b=actual & ~binary_erosion(actual), reference & ~binary_erosion(reference)
            distances=np.concatenate((distance_transform_edt(~b)[a],distance_transform_edt(~a)[b]))
            assert np.percentile(distances,95) <= 2
        layer['effects']={'glow': {'enabled':True,'radius':2,'color':'#ffffff','intensity':.5}}
        assert _bounded_text_pose(asset, source, layer, pose, (320, 180), 1) is None
        assert _render_pose(asset, source, layer, pose, (320, 180)).getchannel('A').getbbox()

    def test_shared_reference_fixtures_still_match_worker(self):
        fixture_path = Path(__file__).resolve().parents[1] / 'frontend/src/components/__tests__/fixtures/textAnimatorParity.v1.json'
        for fixture in json.loads(fixture_path.read_text()):
            spec = fixture['layer']['textAnimator']
            layout = text_layout(fixture['layer'], fixture['programmeWidth'], spec)
            assert layout == fixture['layout']
            for observation in fixture['observations']:
                assert text_poses(spec, observation['progress'], layout) == observation['poses']

    def test_metrics_are_byte_identical_and_bound_to_bundled_fonts(self):
        root = Path(__file__).resolve().parents[1]
        assert (root/'frontend/src/components/motion/textMetrics.v1.json').read_bytes() == (root/'python_media_worker/assets/studio-text-metrics.v1.json').read_bytes()
        for weight, suffix in [(400, 'Regular'), (600, 'SemiBold'), (800, 'ExtraBold'), (900, 'Black')]:
            actual = hashlib.sha256((root/f'python_media_worker/assets/fonts/Inter-{suffix}.ttf').read_bytes()).hexdigest()
            assert actual == METRICS['weights'][str(weight)]['sha256']

    def test_layout_and_rank_contract_preserves_copy_spaces_and_lines(self):
        layout = text_layout(SOURCE, 1280, SPEC)
        assert layout['lines'] == ['MAKE IT MOVE'] and len(layout['units']) == 10
        assert layout['units'][0]['glyphs'][0]['baseline'] == 38.2
        assert len(text_layout(SOURCE, 1280, {**SPEC, 'unit': 'word'})['units']) == 3
        partial = text_poses({**SPEC, 'rangeStart': 20, 'rangeEnd': 60}, 0, layout)
        assert [p['opacity'] for p in partial] == [1, 1, 0, 0, 0, 0, 1, 1, 1, 1]
        for order in ['forward', 'reverse', 'center_out', 'edges_in']:
            assert all(p['scale'] == 1 and p['opacity'] == 1 for p in text_poses({**SPEC, 'order': order}, 100, layout))
            assert all(p['opacity'] == 0 for p in text_poses({**SPEC, 'order': order}, 0, layout))
        assert all(p['opacity'] == 1 for p in text_poses({**SPEC, 'rangeStart': 80, 'rangeEnd': 20}, 0, layout))

    def test_rejects_unsupported_decisions_before_source_fetch(self):
        for value in [True, float('nan'), -1, 101]:
            with self.assertRaises(ValueError):
                validate_text_animation_layer({'type': 'text', 'text_animator': SPEC, 'base_transform': {'text_progress': value}})
        with self.assertRaisesRegex(ValueError, 'enabled'):
            validate_text_animation_layer({'type': 'text', 'motion_keyframes': [{'property': 'textProgress', 'value': 0}]})
        plan = {'order': ['text'], 'layers': [{'id': 'text', 'type': 'text', 'text_animator': SPEC}]}
        for source in [{**SOURCE, 'bRollMode': 'fullscreen'}, {**SOURCE, 'text': '👋'}, {**SOURCE, 'fontFamily': 'Impact'}]:
            with self.assertRaises(ValueError):
                validate_layer_order(plan, ['text'], [], [], source_overlays=[source])

    def test_progress_uses_the_programme_key_interpolator_and_held_frames(self):
        layer = {'text_animator': SPEC, 'base_transform': {'text_progress': 75},
                 'motion_keyframes': [{'property': 'textProgress', 'time': 0, 'value': 0},
                                      {'property': 'textProgress', 'time': 1, 'value': 100, 'easing': 'linear'},
                                      {'property': 'textProgress', 'time': 2, 'value': 0, 'easing': 'hold'}]}
        assert layer_pose(layer, SOURCE, .5)['text_progress'] == 50
        assert layer_pose(layer, SOURCE, 1.5)['text_progress'] == 100
        assert layer_pose(layer, SOURCE, 2)['text_progress'] == 0

    def test_actual_encoded_reverse_animation_and_hold_never_reuse_stale_glyphs(self):
        with tempfile.TemporaryDirectory() as directory:
            asset, movie = Path(directory)/'title.png', Path(directory)/'motion.mov'
            title = AnimatedTitle(SOURCE, 320, 180, SPEC)
            title.frame(100).save(asset)
            geometry = {k: v for k, v in title.geometry.items() if k not in ('lines', 'clipBox')}
            layer = {'type': 'text', 'text_animator': SPEC, 'anchor_x': title.geometry['anchorX'],
                     'anchor_y': title.geometry['anchorY'], 'clip_box': title.geometry['clipBox'],
                     'motion_keyframes': [{'property': 'textProgress', 'time': 0, 'value': 0},
                                          {'property': 'textProgress', 'time': .5, 'value': 100, 'easing': 'linear'},
                                          {'property': 'textProgress', 'time': 1.5, 'value': 100, 'easing': 'linear'},
                                          {'property': 'textProgress', 'time': 1.9, 'value': 0, 'easing': 'linear'}]}
            calls = []
            original = title.frame
            def observed(progress):
                calls.append(progress)
                return original(progress)
            title.frame = observed
            receipt = render_image_layer_motion(asset, movie, {**SOURCE, **geometry}, layer, 320, 180, 2, [], 10, title_animator=title)
            assert receipt['duration'] == 2
            raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(movie), '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'])
            frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 180, 320, 4)
            assert len(frames) == 20 and frames[0, ..., 3].max() == 0 and frames[-1, ..., 3].max() == 0
            assert frames[5, ..., 3].max() > 240
            assert np.array_equal(frames[5:15], np.repeat(frames[5:6], 10, axis=0))
            assert len(calls) < 15 and calls[0] == calls[-1] == 0
            assert not np.array_equal(frames[2], frames[5])

    def test_blank_copy_and_selector_empty_remain_valid_without_division_by_zero(self):
        layout = text_layout({**SOURCE, 'text': ''}, 1280, SPEC)
        assert text_poses(SPEC, 50, layout) == []
        title = AnimatedTitle({**SOURCE, 'text': '', 'bg': 'transparent'}, 320, 180, SPEC)
        assert np.array(title.frame(50))[..., 3].max() == 0

    def test_one_selected_unit_uses_the_full_progress_window_without_reserved_stagger(self):
        spec = {**SPEC, 'easing': 'linear', 'fromScale': .2}
        layout = text_layout({**SOURCE, 'text': 'A'}, 1280, spec)
        assert abs(text_poses(spec, 50, layout)[0]['scale'] - .6) < 1e-12
        assert text_poses(spec, 50, layout)[0]['opacity'] == .5
        words = text_layout({**SOURCE, 'text': 'ONE TWO THREE'}, 1280, {**spec, 'unit': 'word'})
        poses = text_poses({**spec, 'rangeStart': 40, 'rangeEnd': 60}, 50, words)
        assert [p['opacity'] for p in poses] == [1, .5, 1]
        invisible = AnimatedTitle({**SOURCE, 'text': 'A'}, 320, 180, {**spec, 'fromScale': 0, 'fromOpacity': 1})
        assert np.array(invisible.frame(0))[..., 3].max() == 0


if __name__ == '__main__':
    unittest.main()
