"""Real FFmpeg samples: linked speech cuts retain their authored fade clock."""
import tempfile
from pathlib import Path
import unittest
import wave

import numpy as np

from python_media_worker.viral_motion_graphics import prepare_voiceover_samples, validate_design, SAMPLE_RATE


class RetainedVoiceFadeTests(unittest.TestCase):
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
