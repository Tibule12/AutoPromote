import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import numpy as np

from viral_audio_remix import (
    build_audio_remix_filter,
    normalize_audio_remix,
    render_audio_remix,
)


class AudioRemixContractTests(unittest.TestCase):
    def test_contract_is_bounded_and_keep_pitch_disables_pitch_shift(self):
        remix = normalize_audio_remix(
            dict(
                version=1, enabled=True, preset="sped_up", speed=9,
                pitch_semitones=40, bass_db=-40, reverb_mix=4,
                intensity=2, keep_pitch=True,
            )
        )
        self.assertEqual(remix["speed"], 1.5)
        self.assertEqual(remix["pitch_semitones"], 0)
        self.assertEqual(remix["bass_db"], -12)
        self.assertEqual(remix["reverb_mix"], 1)
        self.assertEqual(remix["intensity"], 1)
        self.assertEqual(remix["target"], "master")
        self.assertEqual(remix["content_type"], "auto")
        self.assertTrue(remix["level_match"])

    def test_unknown_contracts_are_rejected(self):
        with self.assertRaises(ValueError):
            normalize_audio_remix(dict(version=2, preset="sped_up"))
        with self.assertRaises(ValueError):
            normalize_audio_remix(dict(preset="mystery"))
        with self.assertRaises(ValueError):
            normalize_audio_remix(dict(content_type="karaoke"))
        with self.assertRaises(ValueError):
            normalize_audio_remix(dict(target="everything"))

    def test_filter_contains_independent_pitch_eq_reverb_and_limiter(self):
        result, remix = build_audio_remix_filter(
            dict(
                enabled=True, preset="slowed_reverb", pitch_semitones=-3,
                bass_db=4, clarity_db=2, air_db=1, reverb_mix=.68,
                intensity=.7,
            )
        )
        self.assertIn("asetrate=48000", result)
        self.assertIn("atempo=", result)
        self.assertIn("bass=", result)
        self.assertIn("equalizer=", result)
        self.assertIn("treble=", result)
        self.assertIn("aecho=", result)
        self.assertIn("acompressor=", result)
        self.assertIn("loudnorm=", result)
        self.assertIn("alimiter=", result)
        self.assertEqual(remix["preset"], "slowed_reverb")

    def test_choir_and_speech_protection_use_different_professional_chains(self):
        choir, _ = build_audio_remix_filter(
            dict(enabled=True, preset="warm_vocal", content_type="choir")
        )
        speech, _ = build_audio_remix_filter(
            dict(enabled=True, preset="warm_vocal", content_type="speech")
        )
        self.assertIn("equalizer=f=260", choir)
        self.assertIn("extrastereo=", choir)
        self.assertIn("agate=", speech)
        self.assertIn("deesser=", speech)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
class AudioRemixRenderTests(unittest.TestCase):
    def test_real_render_changes_pitch_and_preserves_video_duration(self):
        with tempfile.TemporaryDirectory() as temp:
            source = str(Path(temp) / "source.mp4")
            output = str(Path(temp) / "remixed.mp4")
            subprocess.run(
                [
                    "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                    "color=c=0x181d34:s=320x180:r=30:d=2", "-f", "lavfi",
                    "-i", "sine=frequency=440:sample_rate=48000:duration=2",
                    "-c:v", "libx264", "-threads", "1", "-c:a", "aac",
                    "-shortest", "-y", source,
                ],
                check=True,
            )
            receipt = render_audio_remix(
                source,
                output,
                dict(
                    enabled=True, preset="nightcore", pitch_semitones=12,
                    intensity=1, reverb_mix=0,
                ),
            )
            self.assertEqual(receipt["status"], "applied")
            self.assertAlmostEqual(receipt["duration"], 2, delta=.08)
            raw = subprocess.check_output(
                [
                    "ffmpeg", "-v", "error", "-i", output, "-vn", "-ac", "1",
                    "-ar", "48000", "-t", "1.5", "-f", "f32le", "pipe:1",
                ]
            )
            samples = np.frombuffer(raw, dtype="<f4")
            window = samples[:65536] * np.hanning(min(len(samples), 65536))
            spectrum = np.abs(np.fft.rfft(window))
            peak = np.fft.rfftfreq(len(window), 1 / 48000)[np.argmax(spectrum)]
            self.assertAlmostEqual(peak, 880, delta=12)

    def test_real_choir_and_speech_protection_filters_render(self):
        with tempfile.TemporaryDirectory() as temp:
            source = str(Path(temp) / "source.mp4")
            subprocess.run(
                [
                    "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                    "color=c=0x181d34:s=320x180:r=30:d=1.2", "-f", "lavfi",
                    "-i", "sine=frequency=330:sample_rate=44100:duration=1.2",
                    "-c:v", "libx264", "-threads", "1", "-c:a", "aac",
                    "-shortest", "-y", source,
                ],
                check=True,
            )
            for content_type in ("choir", "speech"):
                output = str(Path(temp) / f"{content_type}.mp4")
                receipt = render_audio_remix(
                    source,
                    output,
                    dict(
                        enabled=True,
                        preset="warm_vocal",
                        content_type=content_type,
                        quality="studio",
                        level_match=True,
                    ),
                )
                self.assertEqual(receipt["status"], "applied")
                self.assertEqual(receipt["content_type"], content_type)
                self.assertGreater(Path(output).stat().st_size, 1000)


if __name__ == "__main__":
    unittest.main()
