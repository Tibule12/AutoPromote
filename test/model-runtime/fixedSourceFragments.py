import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from model_workers.adapters.fixed_source_neural import prune_unsupported_fixed_islands


class FixedSourceFragments(unittest.TestCase):
    def fixture(self, directory):
        rgb = np.full((128, 192, 3), 90, np.uint8)
        alpha = np.zeros((128, 192), np.uint8)
        person = np.zeros_like(alpha)
        person[20:100, 5:30] = 255
        alpha[person > 0] = 240
        prop = np.zeros_like(alpha)
        prop[15:115, 100:104] = 255
        alpha[prop > 0] = 255
        # A genuine one-pixel wide wire connects to the selected prop.
        alpha[60, 104:150] = 220
        # A detached false island has no independent object support.
        alpha[30:34, 140:142] = 255
        # A separate fine real part has independent current/reference support.
        alpha[90:94, 145:147] = 190
        prop[90:94, 145:147] = 180
        components = []
        for name, plane, moving in [('person', person, True), ('prop', prop, False)]:
            Image.fromarray(plane).save(Path(directory)/(name+'.png'))
            components.append({'selection': {'id':name, 'propagate':moving, 'points':[]},
                'roi':[75, 10, 180, 120], 'frames':[{'file':name+'.png'}]})
        return rgb, alpha, (Path(directory), {'components':components, '_reference_rgb':rgb.copy()})

    def test_detached_unsupported_fragment_removed_connected_wire_and_supported_detail_exact(self):
        with tempfile.TemporaryDirectory() as directory:
            rgb, alpha, guidance = self.fixture(directory)
            before = alpha.copy()
            result, records = prune_unsupported_fixed_islands(rgb, alpha, guidance, 0, ['prop'])
            expected = before.copy()
            expected[30:34, 140:142] = 0
            self.assertTrue(np.array_equal(result, expected))
            self.assertEqual(records[0]['removedIslands'], 1)
            self.assertEqual(records[0]['changedPixels'], 8)
            self.assertTrue(np.array_equal(alpha, before))

    def test_changed_rgb_and_authored_foreground_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            rgb, alpha, guidance = self.fixture(directory)
            guidance[1]['components'][1]['selection']['points'] = [
                {'label':1, 'position':[140/192, 31/128]}]
            result, _ = prune_unsupported_fixed_islands(rgb, alpha, guidance, 0, ['prop'])
            self.assertTrue(np.array_equal(result, alpha))
            guidance[1]['components'][1]['selection']['points'] = []
            rgb[30,140] = 200
            result, _ = prune_unsupported_fixed_islands(rgb, alpha, guidance, 0, ['prop'])
            self.assertTrue(np.array_equal(result, alpha))

    def test_reference_support_and_crop_edges_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            rgb, alpha, guidance = self.fixture(directory)
            component = guidance[1]['components'][1]
            first = np.asarray(Image.open(Path(directory)/'prop.png')).copy()
            current = first.copy()
            first[30:34,140:142] = 150
            Image.fromarray(first).save(Path(directory)/'reference.png')
            Image.fromarray(current).save(Path(directory)/'current.png')
            component['frames'] = [{'file':'reference.png'}, {'file':'current.png'}]
            guidance[1]['components'][0]['frames'] *= 2
            result, _ = prune_unsupported_fixed_islands(rgb, alpha, guidance, 1, ['prop'])
            self.assertTrue(np.array_equal(result, alpha))
            component['frames'] = [{'file':'current.png'}]
            component['roi'] = [140, 10, 180, 120]
            result, _ = prune_unsupported_fixed_islands(rgb, alpha, guidance, 0, ['prop'])
            self.assertTrue(np.array_equal(result, alpha))

    def test_moving_envelope_and_missing_person_abstain(self):
        with tempfile.TemporaryDirectory() as directory:
            rgb, alpha, guidance = self.fixture(directory)
            person = np.zeros_like(alpha)
            person[20:40, 130:150] = 255
            Image.fromarray(person).save(Path(directory)/'person.png')
            result, _ = prune_unsupported_fixed_islands(rgb, alpha, guidance, 0, ['prop'])
            self.assertTrue(np.array_equal(result, alpha))
            Image.fromarray(np.zeros_like(alpha)).save(Path(directory)/'person.png')
            result, records = prune_unsupported_fixed_islands(rgb, alpha, guidance, 0, ['prop'])
            self.assertTrue(np.array_equal(result, alpha))
            self.assertEqual(records, [])

    def test_another_selected_objects_weak_support_protects_its_fine_parts(self):
        with tempfile.TemporaryDirectory() as directory:
            rgb, alpha, guidance = self.fixture(directory)
            other = np.zeros_like(alpha)
            other[30:34,140:142] = 24
            Image.fromarray(other).save(Path(directory)/'other.png')
            guidance[1]['components'].append({'selection':{
                'id':'other', 'propagate':False, 'points':[]},
                'roi':[130,20,155,50], 'frames':[{'file':'other.png'}]})
            result, _ = prune_unsupported_fixed_islands(rgb, alpha, guidance, 0, ['prop'])
            self.assertTrue(np.array_equal(result, alpha))

    def test_remote_weak_old_set_logits_do_not_protect_a_false_prop_fragment(self):
        with tempfile.TemporaryDirectory() as directory:
            rgb, alpha, guidance = self.fixture(directory)
            person = np.asarray(Image.open(Path(directory)/'person.png')).copy()
            person[30:34,140:142] = 25
            Image.fromarray(person).save(Path(directory)/'person.png')
            result, _ = prune_unsupported_fixed_islands(rgb, alpha, guidance, 0, ['prop'])
            expected = alpha.copy()
            expected[30:34,140:142] = 0
            self.assertTrue(np.array_equal(result, expected))


if __name__ == '__main__':
    unittest.main()
