"""Exercise actual alpha-adapter inference/reuse across algorithm revisions."""
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import cv2
import torch

from model_workers.adapters.cpu_matting import refine


class AlphaVersionReuse(unittest.TestCase):
    def check(self, previous_version, expected_calls):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source.mp4'
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi',
                '-i', 'color=c=gray:s=64x64:r=24', '-frames:v', '3', '-c:v', 'libx264',
                '-threads', '1', str(source)], check=True)
            weights = root / 'model.safetensors'
            weights.write_bytes(b'explicit-small-test-double')
            plane = np.zeros((64, 64), np.uint8)
            plane[16:48, 16:48] = 255
            manifest = {'model': 'fixture-alpha', 'model_weights_sha256': hashlib.sha256(weights.read_bytes()).hexdigest(),
                'alpha_semantics': 'ViTMatte fixture', 'prompt': {'version': 1}, 'prompt_sha256': 'fixture'}
            if previous_version is not None:
                manifest['model_version'] = previous_version
            cache = SimpleNamespace(manifest=manifest, frame=lambda _: plane.copy())
            calls = []

            class Network:
                def to(self, *_):
                    return self

                def eval(self):
                    return self

                def __call__(self, *, pixel_values):
                    calls.append(pixel_values.clone())
                    return SimpleNamespace(alphas=torch.full((1, 1, *pixel_values.shape[-2:]), .25))

            network = SimpleNamespace(from_pretrained=lambda *a, **k: Network())
            spec = {'request': {'sourceRange': {'startTick': 0}, 'parameters': {
                'subjectId': 'person', 'initialBox': [.1, .1, .9, .9], 'points': [], 'shotPrompts': [],
                'refinement': {'radius': 4, 'holdouts': []}}},
                'model': {'checkpoint': 'fixture-alpha', 'revision': 'fixture', 'modelVersion': 'new',
                    'weights': [{'path': weights.name, 'sha256': manifest['model_weights_sha256']}],
                    'limits': {'temporalAlpha': True, 'reuseSourceAlpha': True}}}
            output = root / 'outputs'
            output.mkdir()
            with patch.dict(sys.modules, {'transformers': SimpleNamespace(VitMatteForImageMatting=network)}):
                refine(spec, source, {'width': 64, 'height': 64, 'nb_read_frames': 3}, root,
                    output, cache, {'artifactHash': 'private-fixture'})
            self.assertEqual(len(calls), expected_calls)
            import json
            final = json.loads((output / 'subject_masks/manifest.json').read_text())
            self.assertEqual(final['model_version'], 'new')
            self.assertEqual(final['matting_stage']['modelInferencePerformed'], expected_calls > 0)

    def test_previous_algorithm_requires_new_source_conditioned_inference(self):
        self.check('old', 3)

    def test_unversioned_old_alpha_cannot_silently_reuse_defects(self):
        self.check(None, 3)

    def test_identical_algorithm_can_still_reuse_source_alpha(self):
        self.check('new', 0)


if __name__ == '__main__':
    unittest.main()
