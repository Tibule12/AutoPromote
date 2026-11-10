import threading
import unittest

from model_workers.adapters.source_edge_alpha import source_frame_results


class SourceFrameParallelism(unittest.TestCase):
    def test_reference_initializes_before_parallel_work_and_results_keep_source_order(self):
        reference = {}
        def solve(index):
            if index == 0:
                reference['ready'] = True
            self.assertTrue(reference.get('ready'))
            return index * 7
        self.assertEqual(list(source_frame_results(9, solve, 2)),
                         [(i, i * 7) for i in range(9)])

    def test_no_more_than_two_frames_are_in_flight(self):
        active = 0
        maximum = 0
        lock = threading.Lock()
        entered = threading.Barrier(2)
        def solve(index):
            nonlocal active, maximum
            if index == 0:
                return index
            with lock:
                active += 1
                maximum = max(maximum, active)
            entered.wait(timeout=5)
            with lock:
                active -= 1
            return index
        self.assertEqual(list(source_frame_results(5, solve, 2)), [(i,i) for i in range(5)])
        self.assertEqual(maximum, 2)

    def test_first_frame_failure_stops_before_any_other_frame_is_submitted(self):
        called = []
        def solve(index):
            called.append(index)
            raise ValueError('actual source failed')
        with self.assertRaisesRegex(ValueError, 'actual source failed'):
            list(source_frame_results(7, solve, 2))
        self.assertEqual(called, [0])

    def test_single_thread_default_and_invalid_bounds(self):
        self.assertEqual(list(source_frame_results(3, lambda i: i)), [(i,i) for i in range(3)])
        for count,workers in [(0,2),(2,3),(2,True),(True,1),(2,1.5)]:
            with self.assertRaises(ValueError):
                list(source_frame_results(count, lambda i: i, workers))


if __name__ == '__main__':
    unittest.main()
