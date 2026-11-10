import os
import unittest
from unittest.mock import patch
from pathlib import Path

from model_workers.emulator_cuda import execute
from model_workers.adapters.cpu_matting import refine


class LocalCudaGuards(unittest.TestCase):
    def test_parallel_source_solves_cannot_change_default_cpu_execution(self):
        geometry = {'width':96, 'height':80, 'nb_read_frames':4}
        for workers, device in [(2,'cpu'), (3,'cuda'), (True,'cuda')]:
            spec = {'request': {'parameters': {}},
                    'model': {'limits': {'localSourceFrameParallelism':workers}}}
            with self.assertRaisesRegex(ValueError, 'explicit local CUDA'):
                refine(spec, Path('/not-used'), geometry, Path('/not-used'),
                       Path('/not-used'), None, None, device=device)

    def test_missing_explicit_demo_environment_cannot_execute(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'isolated local CUDA'):
                execute({}, Path('/tmp'))

    def test_production_project_cannot_borrow_demo_cuda_switch(self):
        with patch.dict(os.environ, {
                'GCLOUD_PROJECT': 'autopromote-cc6d3', 'STUDIO_BACKGROUND_DEMO': 'true',
                'STUDIO_BACKGROUND_DEMO_LOCAL_CUDA': 'true', 'CUDA_VISIBLE_DEVICES': '0'}, clear=True):
            with self.assertRaisesRegex(ValueError, 'isolated local CUDA'):
                execute({}, Path('/tmp'))

    def test_unqualified_overlay_is_rejected_before_torch_or_model_import(self):
        environment = dict(GCLOUD_PROJECT='demo-autopromote-credits',
                           STUDIO_BACKGROUND_DEMO='true',
                           STUDIO_BACKGROUND_DEMO_LOCAL_CUDA='true', CUDA_VISIBLE_DEVICES='0')
        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaisesRegex(ValueError, 'Unrecognized CUDA overlay'):
                execute({'runtimeOverlay': {'kind': 'cpu'}}, Path('/tmp'))
            with self.assertRaisesRegex(ValueError, 'Unqualified local CUDA directory'):
                execute({'runtimeOverlay': {'kind': 'private_local_cuda_host_overlay_v1',
                                            'directory': '/tmp/untrusted'}}, Path('/tmp'))


if __name__ == '__main__':
    unittest.main()
