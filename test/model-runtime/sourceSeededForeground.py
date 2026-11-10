"""Foreground corrections must recover real low-logit material without ghosts."""
import unittest

import cv2
import numpy as np

from model_workers.adapters.source_edge_alpha import classify_corrected_fixed_object


class SourceSeededForeground(unittest.TestCase):
    def setUp(self):
        cv2.setNumThreads(1)
        self.rgb = np.full((80, 80, 3), (235, 45, 20), np.uint8)
        self.rgb[20:56, 20:48] = (105, 70, 50)
        self.prior = np.zeros((80, 80), np.uint8)
        self.prior[24:32, 24:32] = 255
        self.evidence = np.zeros_like(self.prior)
        self.evidence[20:56, 20:48] = 40
        self.evidence[24:32, 24:32] = 255
        self.points = [dict(position=[x/80, y/80], label=label)
                       for label, coordinates in [
                           (1, [(27, 27), (30, 35), (36, 30)]),
                           (0, [(12, 12), (65, 12), (12, 65)])]
                       for x, y in coordinates]

    def solve(self, *, rgb=None, reference=None, protect=None, enabled=True):
        return classify_corrected_fixed_object(
            self.rgb if rgb is None else rgb, self.prior,
            self.rgb if reference is None else reference, self.points,
            [8, 8, 72, 72], self.evidence, protect,
            source_seeded_foreground=enabled, bounded_source_growth=True)

    def test_actual_material_can_recover_below_neural_foreground_threshold(self):
        previous = self.solve(enabled=False)
        corrected = self.solve()
        self.assertLessEqual(previous[45, 42], 1)
        self.assertGreaterEqual(corrected[45, 42], 250)
        self.assertEqual(int(corrected[15, 50]), 0)

    def test_same_colour_elsewhere_is_not_another_selected_object(self):
        self.rgb[60:67, 60:67] = (105, 70, 50)
        corrected = self.solve()
        self.assertEqual(int(corrected[63, 63]), 0)
        self.assertGreaterEqual(corrected[45, 42], 250)

    def test_nearby_background_cannot_grow_from_a_kept_object_by_colour_alone(self):
        # A nearby dark panel touches the kept material, but neither its
        # current track nor its authored material samples identify that panel.
        self.rgb[35:55, 48:68] = (128, 90, 68)
        from unittest.mock import patch
        original = cv2.grabCut
        def misclassified_panel(picture, labels, *args):
            original(picture, labels, *args)
            # Reproduce the actual native stand classifier's erroneous
            # proposal: an unselected adjacent panel becomes probable FG.
            labels[35-8:55-8, 48-8:68-8] = cv2.GC_PR_FGD
        with patch('cv2.grabCut', side_effect=misclassified_panel):
            corrected = self.solve()
        self.assertLessEqual(int(corrected[45, 60]), 1)
        self.assertGreaterEqual(int(corrected[45, 42]), 250)

    def test_source_change_cannot_leave_foreground_at_the_old_pose(self):
        moved = self.rgb.copy()
        moved[40:52, 37:47] = (235, 45, 20)
        corrected = self.solve(rgb=moved)
        np.testing.assert_array_equal(corrected[40:52, 37:47], self.prior[40:52, 37:47])
        self.assertGreaterEqual(corrected[38, 25], 250)

    def test_another_objects_fractional_foreground_stays_exact(self):
        self.prior[40:50, 38:46] = 103
        protect = np.zeros(self.prior.shape, bool)
        protect[40:50, 38:46] = True
        corrected = self.solve(protect=protect)
        np.testing.assert_array_equal(corrected[protect], self.prior[protect])
        np.testing.assert_array_equal(corrected[:8], self.prior[:8])
        self.assertGreaterEqual(corrected[38, 25], 250)

    def test_ambiguous_material_abstains_instead_of_painting_foreground(self):
        self.rgb[:] = (105, 70, 50)
        self.assertIsNone(self.solve())

    def test_fixed_source_evidence_prevents_confidence_drop_cutting_same_material(self):
        from unittest.mock import patch
        # A gradient on a photographed stem is outside the narrow colour
        # sample but was present in the first source-bound component mask.
        # Its later logit drops despite identical current source RGB.
        self.rgb[40:54, 35:45] = (128, 90, 68)
        reference_evidence = self.evidence.copy()
        self.evidence[40:54, 35:45] = 4
        original = cv2.grabCut
        def source_selected(picture, labels, *args):
            original(picture, labels, *args)
            labels[40-8:54-8, 35-8:45-8] = cv2.GC_PR_FGD
        kwargs = dict(source_seeded_foreground=True, bounded_source_growth=True)
        with patch('cv2.grabCut', side_effect=source_selected):
            before = classify_corrected_fixed_object(
                self.rgb, self.prior, self.rgb, self.points,
                [8, 8, 72, 72], self.evidence, **kwargs)
            after = classify_corrected_fixed_object(
                self.rgb, self.prior, self.rgb, self.points,
                [8, 8, 72, 72], self.evidence,
                reference_evidence=reference_evidence, **kwargs)
        self.assertLessEqual(int(before[47, 40]), 1)
        self.assertGreaterEqual(int(after[47, 40]), 250)
        self.assertEqual(int(after[16, 60]), 0)
        self.assertEqual(int(self.evidence[47, 40]), 4)

    def test_reference_support_cannot_retain_a_changed_or_protected_pose(self):
        reference = self.rgb.copy()
        reference_evidence = self.evidence.copy()
        current = reference.copy()
        current[40:54, 35:45] = (235, 45, 20)
        self.evidence[40:54, 35:45] = 0
        self.prior[34:39, 35:45] = 117
        protect = np.zeros(self.prior.shape, bool)
        protect[34:39, 35:45] = True
        corrected = classify_corrected_fixed_object(
            current, self.prior, reference, self.points, [8, 8, 72, 72],
            self.evidence, protect, source_seeded_foreground=True,
            bounded_source_growth=True, reference_evidence=reference_evidence)
        np.testing.assert_array_equal(corrected[40:54, 35:45], self.prior[40:54, 35:45])
        np.testing.assert_array_equal(corrected[protect], self.prior[protect])

    def test_reference_support_requires_the_same_source_geometry(self):
        with self.assertRaisesRegex(ValueError, 'reference evidence geometry'):
            classify_corrected_fixed_object(
                self.rgb, self.prior, self.rgb, self.points,
                [8, 8, 72, 72], self.evidence,
                reference_evidence=self.evidence[:20])

    def reference_sequence(self, *, start_with_reference):
        """A real stem loses confidence beside same-coloured rejected casing."""
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from PIL import Image
        from model_workers.adapters.source_edge_alpha import refine_source_edge

        self.rgb[40:54, 35:45] = (128, 90, 68)
        self.rgb[35:55, 48:68] = (128, 90, 68)
        first = self.evidence.copy()
        first[35:55, 48:68] = 40
        current = first.copy()
        current[40:54, 35:45] = 0
        current[35:55, 48:68] = 0
        original = cv2.grabCut
        phase = [0]

        def classify(picture, labels, *args):
            original(picture, labels, *args)
            # The photographed source classifier rejects the old casing at
            # frame 0, but makes the same erroneous proposal seen in the
            # actual later native frame. The real stem remains selected.
            labels[40-8:54-8, 35-8:45-8] = cv2.GC_PR_FGD
            labels[35-8:55-8, 48-8:68-8] = (
                cv2.GC_PR_FGD if phase[0] else cv2.GC_BGD)

        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            for name, plane in [('person', np.zeros_like(first)),
                                ('first', first), ('current', current)]:
                Image.fromarray(plane).save(p / (name + '.png'))
            guide = (p, {'_reference_rgb': self.rgb.copy(), 'components': [
                {'selection': {'propagate': True},
                 'frames': [{'file': 'person.png'}] * 2},
                {'selection': {'id': 'rig', 'propagate': False,
                               'box': [.1, .1, .9, .9], 'points': self.points},
                 'roi': [8, 8, 72, 72],
                 'frames': [{'file': 'first.png'}, {'file': 'current.png'}]}]})
            options = dict(colour_component_ids=['rig'],
                           classify_fixed_objects=True,
                           source_seeded_foreground=True,
                           bounded_source_growth=True,
                           reference_fixed_evidence=True)
            with patch('cv2.grabCut', side_effect=classify):
                initial = refine_source_edge(
                    self.rgb, self.prior, guide, 0, **options
                ) if start_with_reference else None
                phase[0] = 1
                following = refine_source_edge(
                    self.rgb, self.prior, guide, 1, **options)
            return initial, following

    def test_source_classified_reference_retains_stem_without_reviving_rejected_casing(self):
        initial, following = self.reference_sequence(start_with_reference=True)
        self.assertGreaterEqual(int(initial[47, 40]), 250)
        self.assertLessEqual(int(initial[45, 60]), 1)
        self.assertGreaterEqual(int(following[47, 40]), 250)
        self.assertLessEqual(int(following[45, 60]), 1)

    def test_unclassified_reference_cannot_authorize_later_foreground(self):
        _, following = self.reference_sequence(start_with_reference=False)
        self.assertLessEqual(int(following[47, 40]), 1)
        self.assertLessEqual(int(following[45, 60]), 1)


if __name__ == '__main__':
    unittest.main()
