"""Exercise real video-render admission without model or cloud imports."""
import unittest
try:
    from .studio_layer_cache import video_layer_uses_canonical_raster as canonical
except ImportError:
    from studio_layer_cache import video_layer_uses_canonical_raster as canonical


class VideoMatteAdmission(unittest.TestCase):
    def test_held_matte_source_and_fill_keep_canonical_geometry(self):
        source = {'id': 'm', 'base_transform': {'x': 50, 'y': 50, 'scale': 100/70}}
        fill = {'id': 'v', 'track_matte': {'mode': 'luma', 'source_layer_id': 'm'}}
        graph = {'layers': [source, fill]}
        self.assertTrue(canonical('m', source, graph))
        self.assertTrue(canonical('v', fill, graph))

    def test_legacy_unaffected_and_disabled_matte_does_not_lose_source_binding(self):
        self.assertFalse(canonical('v', None, {}))
        self.assertFalse(canonical('v', {'id': 'v'}, {'layers': []}))
        self.assertFalse(canonical('v', {'id': 'v', 'track_matte': {'mode': 'none'}}, {}))

    def test_ordinary_animated_and_pixel_effect_videos_use_shared_renderer(self):
        for layer in [{'motion_keyframes': [{'property': 'x'}]}, {'perspective': {'version': 1}},
                      *[{'effects': {name: {'enabled': True}}} for name in ['mask', 'motion_blur', 'shadow', 'glow']],
                      {'effects': {'blur': 2}}]:
            with self.subTest(layer=layer):
                self.assertTrue(canonical('v', layer, {}))


if __name__ == '__main__':
    unittest.main()
