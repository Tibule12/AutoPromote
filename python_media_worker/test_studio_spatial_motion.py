"""Real expression/raster agreement for equal-endpoint spatial curves."""
import subprocess
import unittest

import numpy as np

from python_media_worker.studio_motion import automation_segment_value, build_studio_motion_filter, validate_spatial_curve
from python_media_worker.studio_layer_motion import interpolate_layer_value
from python_media_worker.studio_composition import validate_graphic_groups


def keys():
    return [dict(property=axis, time=time, value=value, easing='linear',
                 **({'spatialCurve': [0, 0] if axis == 'x' else [-40, -40]} if time else {}))
            for axis, values in [('x', [25, 75]), ('y', [50, 50])]
            for time, value in zip([0, 1], values)]


class SpatialMotionTests(unittest.TestCase):
    def test_horizontal_and_vertical_tangents_retain_a_real_arc(self):
        layer = {'motion_keyframes': keys()}
        for t, expected in [(0, (25, 50)), (.25, (32.8125, 27.5)), (.5, (50, 20)), (.75, (67.1875, 27.5)), (1, (75, 50))]:
            actual = tuple(interpolate_layer_value(layer, axis, t, 0) for axis in ('x', 'y'))
            self.assertEqual(actual, expected)
        self.assertEqual(automation_segment_value(50, 50, .25, {'property': 'x', 'spatialCurve': [-30, 30]}), 41.5625)

    def test_actual_ffmpeg_main_transform_matches_the_raster_curve(self):
        graph = build_studio_motion_filter({'keyframes': keys()}, 160, 120)
        result = subprocess.run(['ffmpeg', '-v', 'error', '-filter_threads', '1', '-f', 'lavfi', '-i',
            'color=black:s=160x120:r=4:d=1.25,drawbox=x=78:y=58:w=4:h=4:color=white:t=fill',
            '-vf', graph, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr.decode()[-3000:])
        frames = np.frombuffer(result.stdout, dtype=np.uint8).reshape(5, 120, 160, 3)
        layer = {'motion_keyframes': keys()}
        for index, frame in enumerate(frames):
            y, x = np.nonzero(frame[:, :, 0] > 200)
            self.assertGreater(len(x), 4)
            expected = [interpolate_layer_value(layer, axis, index/4, 50)*size/100 for axis, size in [('x', 160), ('y', 120)]]
            self.assertLessEqual(abs(float(x.mean())+.5-expected[0]), 1.1)
            self.assertLessEqual(abs(float(y.mean())+.5-expected[1]), 1.1)

    def test_hold_and_invalid_controls_cannot_silently_change_delivery(self):
        held = {'motion_keyframes': [{**key, 'easing': 'hold'} for key in keys()]}
        self.assertEqual(interpolate_layer_value(held, 'x', .99999, 0), 25)
        self.assertEqual(interpolate_layer_value(held, 'x', 1, 0), 75)
        for controls in [None, [1], [True, 2], ['1', 2], [float('nan'), 0], [201, 0]]:
            with self.assertRaises(ValueError):
                validate_spatial_curve({'property': 'x', 'spatialCurve': controls})
        with self.assertRaises(ValueError):
            validate_spatial_curve({'property': 'opacity', 'spatialCurve': [1, 2]})
        group = {'id': 'g', 'name': 'g', 'kind': 'graphic_group', 'layerIds': ['art'],
                 'motion_keyframes': [{**key, 'id': str(i)} for i, key in enumerate(keys())]}
        validate_graphic_groups({'groups': [group]}, ['art'])

    def test_multiple_curved_intervals_fit_ffmpeg_argument_and_parser_limits(self):
        motion_keys = [dict(property=axis, time=i/4, value=(25 if i % 2 == 0 else 75) if axis == 'x' else 50,
            easing='linear', **({'spatialCurve': [0, 0] if axis == 'x' else [-40, -40]} if i else {}))
            for axis in ('x', 'y') for i in range(7)]
        graph = build_studio_motion_filter({'keyframes': motion_keys}, 160, 120)
        self.assertLess(len(graph.encode()), 128*1024)
        result = subprocess.run(['ffmpeg', '-v', 'error', '-filter_threads', '1', '-f', 'lavfi', '-i',
            'color=black:s=160x120:r=4:d=1.75', '-vf', graph, '-frames:v', '7', '-f', 'null', '-'],
            capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr.decode()[-2000:])


if __name__ == '__main__':
    unittest.main()
