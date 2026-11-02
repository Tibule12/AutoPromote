"""Real FFmpeg samples: linked speech cuts retain their authored fade clock."""
import tempfile
import time
from pathlib import Path
import unittest
from unittest.mock import patch
import wave

import numpy as np

from python_media_worker.viral_motion_graphics import prepare_voiceover_samples, validate_design, SAMPLE_RATE


class RetainedVoiceFadeTests(unittest.TestCase):
    def setUp(self):
        # Keep the real decoder in these regressions, but fail a stuck filter
        # promptly rather than holding the entire emulator suite for 30 minutes.
        import subprocess
        original = subprocess.run
        deadline = time.monotonic() + 30
        def bounded(*args, **kwargs):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(args[0], 30)
            kwargs['timeout'] = min(kwargs.get('timeout', 15), 15, remaining)
            return original(*args, **kwargs)
        patcher = patch('python_media_worker.viral_motion_graphics.subprocess.run', side_effect=bounded)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_one_tick_speed_intervals_keep_a_finite_complete_speech_bus(self):
        tick = 1 / 90000
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'speech.wav'
            pcm = (.2 * np.sin(np.arange(SAMPLE_RATE) * 2 * np.pi * 317 / SAMPLE_RATE) * 32767).astype('<i2')
            with wave.open(str(path), 'wb') as out:
                out.setnchannels(1); out.setsampwidth(2); out.setframerate(SAMPLE_RATE)
                out.writeframes(pcm.tobytes())
            cue = dict(id='voice', kind='voiceover', startTime=0, duration=1,
                       trimStart=0, volume=1, fadeIn=0, fadeOut=0)
            for start in [0, .4, 1 - tick]:
                for rate in [.25, .5, 1.1286, 2, 4]:
                    with self.subTest(start=start, rate=rate):
                        plan = ([dict(start_time=0, end_time=start, rate=1)] if start else [])
                        plan.append(dict(start_time=start, end_time=start + tick, rate=rate))
                        if start + tick < 1:
                            plan.append(dict(start_time=start + tick, end_time=1, rate=1))
                        samples, offset = prepare_voiceover_samples(cue, path, plan)
                        self.assertEqual(offset, 0)
                        expected = sum((p['end_time'] - p['start_time']) / p['rate'] for p in plan)
                        self.assertLessEqual(abs(len(samples) / SAMPLE_RATE - expected), 3 / SAMPLE_RATE)
                        self.assertTrue(np.all(np.isfinite(samples)))
                        self.assertGreater(np.sqrt(np.mean(samples ** 2)), .1)

    def test_dense_cut_joins_do_not_accumulate_rounding_drift(self):
        tick = 1 / 90000
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'speech.wav'
            pcm = (.2 * np.sin(np.arange(SAMPLE_RATE) * 2 * np.pi * 317 / SAMPLE_RATE) * 32767).astype('<i2')
            with wave.open(str(path), 'wb') as out:
                out.setnchannels(1); out.setsampwidth(2); out.setframerate(SAMPLE_RATE)
                out.writeframes(pcm.tobytes())
            plan = []
            for i in range(100):
                start, end = i / 100, (i + 1) / 100
                plan.extend([dict(start_time=start, end_time=start + tick, rate=2),
                             dict(start_time=start + tick, end_time=end, rate=1)])
            cue = dict(startTime=0, duration=1, trimStart=0, volume=1, fadeIn=0, fadeOut=0)
            samples, offset = prepare_voiceover_samples(cue, path, plan)
            expected = round(sum((p['end_time'] - p['start_time']) / p['rate'] for p in plan) * SAMPLE_RATE)
            self.assertEqual(len(samples), expected)
            self.assertEqual(offset, 0)
            self.assertTrue(np.all(np.isfinite(samples)))
            self.assertGreater(np.sqrt(np.mean(samples ** 2)), .1)

    def test_short_stretched_ranges_at_both_cue_edges_have_decoder_context(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'speech.wav'
            pcm = (.2 * np.sin(np.arange(SAMPLE_RATE) * 2 * np.pi * 317 / SAMPLE_RATE) * 32767).astype('<i2')
            with wave.open(str(path), 'wb') as out:
                out.setnchannels(1); out.setsampwidth(2); out.setframerate(SAMPLE_RATE)
                out.writeframes(pcm.tobytes())
            cue = dict(startTime=0, duration=1, trimStart=0, volume=1, fadeIn=0, fadeOut=0)
            for count in [2, 16, 128, 512, 1024]:
                for rate in [.25, .5, 1.1286, 2, 4]:
                    for at_end in [False, True]:
                        with self.subTest(count=count, rate=rate, at_end=at_end):
                            span = count / SAMPLE_RATE
                            plan = ([dict(start_time=0, end_time=1-span, rate=1),
                                     dict(start_time=1-span, end_time=1, rate=rate)] if at_end else
                                    [dict(start_time=0, end_time=span, rate=rate),
                                     dict(start_time=span, end_time=1, rate=1)])
                            samples, _ = prepare_voiceover_samples(cue, path, plan)
                            expected = round(sum((p['end_time']-p['start_time'])/p['rate'] for p in plan)*SAMPLE_RATE)
                            self.assertEqual(len(samples), expected)
                            self.assertTrue(np.all(np.isfinite(samples)))
                            self.assertGreater(np.sqrt(np.mean(samples ** 2)), .1)

    def test_retained_ranges_equal_original_samples_before_and_after_repeated_cuts(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'speech.wav'
            t = np.arange(5 * SAMPLE_RATE) / SAMPLE_RATE
            pcm = (.2 * np.sin(2 * np.pi * (173 * t + 19 * t * t)) * 32767).astype('<i2')
            with wave.open(str(path), 'wb') as out:
                out.setnchannels(1); out.setsampwidth(2); out.setframerate(SAMPLE_RATE)
                out.writeframes(pcm.tobytes())
            original = dict(id='voice', kind='voiceover', url='owned', startTime=0,
                            duration=4, trimStart=.5, volume=1, fadeIn=2, fadeOut=2)
            plan = [dict(start_time=0, end_time=4, rate=1)]
            reference, _ = prepare_voiceover_samples(original, path, plan)
            for offset, duration in [(0, 1), (2, 2), (2.75, .5), (.25, .5), (3.5, .5)]:
                with self.subTest(offset=offset, duration=duration):
                    _, effects = validate_design(None, [{**original, 'startTime': 0, 'duration': duration,
                        'trimStart': .5 + offset, 'fadeOffset': offset, 'fadeDuration': 4}])
                    actual, _ = prepare_voiceover_samples(effects[0], path, plan)
                    first = round(offset * SAMPLE_RATE)
                    np.testing.assert_allclose(actual, reference[first:first + len(actual)], atol=4e-6, rtol=0)

    def test_invalid_or_partial_fade_ranges_are_rejected(self):
        cue = dict(kind='voiceover', url='owned', duration=1)
        for extra in [dict(fadeOffset=0), dict(fadeDuration=4), dict(fadeOffset=-1, fadeDuration=4),
                      dict(fadeOffset=4, fadeDuration=4), dict(fadeOffset=0, fadeDuration=float('nan')),
                      dict(fadeOffset=True, fadeDuration=4), dict(fadeOffset=0, fadeDuration=7201)]:
            with self.subTest(extra=extra), self.assertRaisesRegex(ValueError, 'fade range'):
                validate_design(None, [{**cue, **extra}])
        with self.assertRaisesRegex(ValueError, 'fade range'):
            validate_design(None, [{**cue, 'kind': 'sfx', 'fadeOffset': 0, 'fadeDuration': 4}])


if __name__ == '__main__':
    unittest.main()
