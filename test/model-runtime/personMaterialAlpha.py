import unittest
import cv2
import numpy as np
from model_workers.adapters.person_material_alpha import restore_person_interiors


class PersonMaterialAlpha(unittest.TestCase):
    def fixture(self, shift=0):
        rgb = np.full((128, 224, 3), [215, 210, 200], np.uint8)
        person = np.zeros((128, 224), np.uint8)
        rgb[12:116, 32+shift:112+shift] = [25, 45, 125]
        person[12:116, 32+shift:112+shift] = 250
        alpha = person.copy()
        alpha[40:88, 52+shift:96+shift] = 70
        person[40:88, 52+shift:96+shift] = 90
        return rgb, alpha, person

    def test_opaque_garment_recovers_without_replacing_its_soft_outer_alpha(self):
        rgb, alpha, person = self.fixture()
        out = restore_person_interiors(rgb, alpha, person)
        self.assertEqual(int(out[64, 72]), 255)
        np.testing.assert_array_equal(out[person < 32], alpha[person < 32])
        np.testing.assert_array_equal(out[12:20, 32:112], alpha[12:20, 32:112])

    def test_current_motion_does_not_leave_foreground_at_the_old_pose(self):
        first = restore_person_interiors(*self.fixture())
        rgb, alpha, person = self.fixture(80)
        later = restore_person_interiors(rgb, alpha, person)
        self.assertEqual(int(first[64, 72]), 255)
        self.assertEqual(int(later[64, 72]), 0)
        self.assertEqual(int(later[64, 152]), 255)

    def test_real_open_background_gap_remains_background(self):
        rgb, alpha, person = self.fixture()
        rgb[45:85, 74:86] = [215, 210, 200]
        person[45:85, 74:86] = 45
        alpha[45:85, 74:86] = 0
        out = restore_person_interiors(rgb, alpha, person,
            [{'position': [80/224, 64/128], 'label': 0}])
        self.assertEqual(int(out[64, 80]), 0)

    def test_separate_foreground_and_uncertain_person_are_not_reclassified(self):
        rgb, alpha, person = self.fixture()
        alpha[30:90, 170:180] = 213
        out = restore_person_interiors(rgb, alpha, person)
        np.testing.assert_array_equal(out[:, 160:], alpha[:, 160:])
        np.testing.assert_array_equal(restore_person_interiors(rgb, alpha, person//2), alpha)

    def test_geometry_and_invalid_source_clicks_are_rejected(self):
        rgb, alpha, person = self.fixture()
        with self.assertRaises(ValueError):
            restore_person_interiors(rgb, alpha[:10], person)
        with self.assertRaises(ValueError):
            restore_person_interiors(rgb, alpha, person,
                [{'position': [float('nan'), .5], 'label': 1}])

    def test_broad_person_repair_cannot_fill_refined_hand_gaps_or_soft_fingers(self):
        rgb, alpha, person = self.fixture()
        # Reproduce a coarse connected person prediction enclosing a hand
        # gap already removed by the more specific current-detail refinement.
        alpha[50:66, 68:82] = 0
        alpha[66:74, 68:82] = 73
        detail = np.zeros(alpha.shape, bool)
        detail[45:80, 62:88] = True
        before = restore_person_interiors(rgb, alpha, person)
        after = restore_person_interiors(rgb, alpha, person, preserve=detail)
        self.assertEqual(int(before[58, 74]), 255)
        self.assertEqual(int(after[58, 74]), 0)
        self.assertEqual(int(after[69, 74]), 73)
        np.testing.assert_array_equal(after[detail], alpha[detail])
        self.assertEqual(int(after[84, 74]), 255)

    def test_detail_protection_follows_current_motion_and_requires_valid_geometry(self):
        rgb, alpha, person = self.fixture(80)
        detail = np.zeros(alpha.shape, bool)
        detail[45:80, 142:168] = True
        after = restore_person_interiors(rgb, alpha, person, preserve=detail)
        np.testing.assert_array_equal(after[detail], alpha[detail])
        self.assertEqual(int(after[84, 152]), 255)
        self.assertEqual(int(after[64, 72]), 0)
        for invalid in [detail[:20], detail.astype(np.uint8)]:
            with self.assertRaisesRegex(ValueError, 'protected-detail'):
                restore_person_interiors(rgb, alpha, person, preserve=invalid)


if __name__ == '__main__':
    unittest.main()
