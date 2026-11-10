"""Fresh alpha must not inherit old-mask errors in photographed background."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import cv2
from PIL import Image
import torch

from model_workers.adapters.cpu_matting import refine
import model_workers.adapters.source_edge_alpha
import model_workers.adapters.moving_detail_alpha


class FreshBackgroundParent(unittest.TestCase):
    def run_fresh(self, root, previous, *, independent=True, boundary=False):
        root.mkdir()
        source = root / 'source.mp4'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi',
            '-i', 'color=c=gray:s=96x80:r=24', '-frames:v', '4', '-c:v',
            'libx264', '-threads', '1', str(source)], check=True)
        weight = root / 'model.safetensors'
        weight.write_bytes(b'explicit-test-double-not-real-weights')
        weight_sha = hashlib.sha256(weight.read_bytes()).hexdigest()
        guide = root / 'guidance'
        guide.mkdir()
        plane = np.zeros((80, 96), np.uint8)
        plane[20:60, 30:65] = 255
        frames = []
        fixed_frames = []
        for index in range(4):
            file = f'person_{index:04d}.png'
            Image.fromarray(plane).save(guide / file)
            frames.append({'file': file})
            fixed_file = f'fixed_{index:04d}.png'
            Image.fromarray(np.zeros_like(plane)).save(guide / fixed_file)
            fixed_frames.append({'file': fixed_file})
        guidance = (guide, {'_reference_rgb': np.full((80, 96, 3), 128, np.uint8),
            'components': [{'selection': {'id': 'person', 'propagate': True,
                                         'points': [], 'shotPrompts': []},
                            'frames': frames},
                           {'selection': {'id': 'prop', 'propagate': False,
                                          'points': [{'position': [85/96, 3/80],
                                                      'label': 1}]},
                            'frames': fixed_frames}]})
        parent = np.full_like(plane, previous)
        cache = SimpleNamespace(manifest={
            'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'width': 96, 'height': 80, 'frame_count': 4, 'fps': 24,
            'prompt': {'version': 1}, 'prompt_sha256': 'fixture',
            'model': 'fixture', 'model_version': 'old',
            'model_weights_sha256': weight_sha, 'alpha_semantics': 'ViTMatte fixture'},
            frame=lambda _: parent.copy())
        spec = {'request': {'sourceRange': {'startTick': 0}, 'parameters': {
            'subjectId': 'person', 'initialBox': [.2, .2, .8, .8], 'points': [],
            'components': [], 'shotPrompts': [],
            'refinement': {'radius': 4, 'holdouts': [[[.83, .75], [.94, .75],
                                                    [.94, .9], [.83, .9]]]}}},
            'model': {'checkpoint': 'fixture', 'revision': 'fixture',
                'modelVersion': 'fresh',
                'weights': [{'path': weight.name, 'sha256': weight_sha}],
                'limits': {'temporalAlpha': True, 'reuseSourceAlpha': True,
                    'sourceResolutionEdges': True, 'observedMovingDetail': True,
                    'freshComponentTrimap': True,
                    'freshComponentBackground': independent,
                    'motionAwarePersonSourceEdges': boundary}}}

        class Network:
            def to(self, *_): return self
            def eval(self): return self
            def __call__(self, *, pixel_values):
                return SimpleNamespace(alphas=torch.full(
                    (1, 1, *pixel_values.shape[-2:]), .5))

        fake = SimpleNamespace(from_pretrained=lambda *a, **k: Network())
        output = root / 'outputs'
        output.mkdir()
        with patch.dict(sys.modules, {'transformers': SimpleNamespace(
                VitMatteForImageMatting=fake)}), \
             patch('model_workers.adapters.source_edge_alpha.load_guidance',
                   return_value=guidance), \
             patch('model_workers.adapters.source_edge_alpha.refine_source_edge',
                   side_effect=lambda rgb, alpha, *a, **k: alpha.copy()):
            refine(spec, source, {'width': 96, 'height': 80, 'nb_read_frames': 4},
                   root, output, cache, {'artifactHash': 'fixture'})
        support = np.asarray(Image.open(output / 'observed_detail/observed-support.png'))
        reference = np.asarray(Image.open(output / 'observed_detail/photographed-reference.png'))
        return support, reference

    def test_fresh_background_is_independent_of_a_defective_previous_alpha(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            empty = self.run_fresh(root / 'empty-parent', 0)
            opaque = self.run_fresh(root / 'opaque-parent', 255)
            np.testing.assert_array_equal(empty[0], opaque[0])
            np.testing.assert_array_equal(empty[1], opaque[1])
            self.assertEqual(int(opaque[0][0, 0]), 255)

    def test_current_person_and_explicit_holdout_never_become_background(self):
        with tempfile.TemporaryDirectory() as temporary:
            support, _ = self.run_fresh(Path(temporary) / 'fresh', 0)
            self.assertEqual(int(support[40, 45]), 0)
            self.assertEqual(int(support[65, 85]), 0)
            self.assertEqual(int(support[3, 85]), 0)
            self.assertEqual(int(support[0, 0]), 255)

    def test_unrequested_legacy_background_keeps_its_existing_parent_protection(self):
        with tempfile.TemporaryDirectory() as temporary:
            support, _ = self.run_fresh(Path(temporary) / 'legacy', 255,
                                       independent=False)
            self.assertFalse(support.any())

    def test_optional_person_edges_reapply_actual_click_and_holdout_ownership(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)/'boundary'
            with patch('model_workers.adapters.person_material_alpha.refine_person_source_boundaries',
                       side_effect=lambda rgb,alpha,*a,**k: np.zeros_like(alpha)) as boundary:
                self.run_fresh(root,0,boundary=True)
            self.assertEqual(boundary.call_count,4)
            for index in range(4):
                alpha=np.asarray(Image.open(root/f'outputs/subject_masks/matte_{index:04d}.png'))
                self.assertEqual(int(alpha[3,85]),255)
                self.assertEqual(int(alpha[65,85]),255)
                self.assertEqual(int(alpha[0,0]),0)



if __name__ == '__main__':
    unittest.main()
