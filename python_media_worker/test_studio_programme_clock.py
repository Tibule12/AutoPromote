import unittest
from types import SimpleNamespace

from python_media_worker.viral_render_contract import resolve_studio_programme_duration, normalize_speed_plan, speed_plan_output_duration


class StudioProgrammeClockTests(unittest.TestCase):
    def test_codec_tail_cannot_extend_the_requested_speed_plan(self):
        segments = [SimpleNamespace(start_time=0, end_time=8)]
        duration = resolve_studio_programme_duration(segments, 0, 8, 720000)
        plan = normalize_speed_plan(duration, [{'start_time': 0, 'end_time': 8, 'rate': 1}])
        self.assertEqual(speed_plan_output_duration(plan), 8)
        self.assertEqual(len(plan), 1)
        # A 48 kHz AAC frame can add 1024/48000 seconds to an intermediate.
        self.assertNotEqual(duration, 8 + 1024/48000)

    def test_reordered_sources_and_legacy_requests_use_source_ranges(self):
        segments = [{'start_time': 40, 'end_time': 43}, {'start_time': 2, 'end_time': 7}]
        self.assertEqual(resolve_studio_programme_duration(segments, 0, 999), 8)
        self.assertEqual(resolve_studio_programme_duration([], 12, 20), 8)
        duration = resolve_studio_programme_duration(segments, 0, 999, 720000)
        self.assertEqual(speed_plan_output_duration(normalize_speed_plan(duration, preview_speed=2)), 4)

    def test_forged_or_unusable_clocks_reject_before_rendering(self):
        for ticks in [True, '720000', 0, -1, 723840, float('nan'), float('inf')]:
            with self.subTest(ticks=ticks), self.assertRaises(ValueError):
                resolve_studio_programme_duration([], 0, 8, ticks)
        for end in [0, -1, float('inf'), float('nan')]:
            with self.subTest(end=end), self.assertRaises(ValueError):
                resolve_studio_programme_duration([], 0, end)
