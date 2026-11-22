import asyncio
import threading
import time
from unittest.mock import patch

import unittest

from python_media_worker.studio_layer_batch import layer_parallelism, prepare_layer_batch, render_layer_batch


def check_parallelism_respects_the_container_quota():
    for gpu, quota, expected in [(False, '400000 100000', 2), (True, '2000000 100000', 4),
                                 (True, '100000 100000', 1), (False, 'max 100000', 2)]:
        with patch('os.cpu_count', return_value=64), patch('pathlib.Path.read_text', return_value=quota), \
             patch.dict('os.environ', {'VIDEO_ENCODER': 'h264_nvenc' if gpu else 'libx264',
                                       'MEDIA_WORKER_REQUIRE_GPU': 'true' if gpu else 'false'}):
            assert layer_parallelism() == expected


def check_independent_work_overlaps_but_results_keep_their_original_order():
    barrier = threading.Barrier(2)
    def render(value):
        barrier.wait(timeout=3)
        return value
    with patch('python_media_worker.studio_layer_batch.layer_parallelism', return_value=2):
        result = render_layer_batch([('first', (1,)), ('second', (2,))], render)
    assert list(result.items()) == [('first', 1), ('second', 2)]


def check_failure_joins_encoders_and_does_not_return_partial_receipts():
    entered, finished = threading.Event(), threading.Event()
    def render(value):
        if value == 'fail':
            assert entered.wait(3)
            raise ValueError('Encoder failed')
        entered.set(); time.sleep(.05); finished.set()
    with patch('python_media_worker.studio_layer_batch.layer_parallelism', return_value=2):
        with unittest.TestCase().assertRaisesRegex(ValueError, 'Encoder failed'):
            render_layer_batch([('bad', ('fail',)), ('running', ('wait',))], render)
    assert finished.is_set(), 'Scratch can be cleaned only after the running encoder exits'


def check_cancelled_export_joins_thread_owned_work_before_cleanup():
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()
    def render():
        entered.set(); assert release.wait(3); finished.set()
    async def check():
        task = asyncio.create_task(prepare_layer_batch([('one', ())], render))
        while not entered.is_set():
            await asyncio.sleep(.001)
        task.cancel(); await asyncio.sleep(.01)
        assert not task.done()
        release.set()
        with unittest.TestCase().assertRaises(asyncio.CancelledError):
            await task
        assert finished.is_set()
    asyncio.run(check())


class StudioLayerBatchTests(unittest.TestCase):
    test_parallelism = staticmethod(check_parallelism_respects_the_container_quota)
    test_ordered_overlap = staticmethod(check_independent_work_overlaps_but_results_keep_their_original_order)
    test_failure_cleanup = staticmethod(check_failure_joins_encoders_and_does_not_return_partial_receipts)
    test_cancellation_cleanup = staticmethod(check_cancelled_export_joins_thread_owned_work_before_cleanup)
