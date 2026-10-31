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
    render_audio_remix_preview,
)


class AudioRemixContractTests(unittest.TestCase):
    def test_named_spatial_telephone_and_lofi_treatments_reach_the_shared_chain(self):
        spatial, _ = build_audio_remix_filter(dict(enabled=True,preset='spatial_8d',intensity=.8))
        telephone, _ = build_audio_remix_filter(dict(enabled=True,preset='telephone',intensity=.8))
        lofi, _ = build_audio_remix_filter(dict(enabled=True,preset='lo_fi',intensity=.8))
        self.assertIn('apulsator=',spatial)
        self.assertIn('offset_r=0.5',spatial)
        self.assertIn('highpass=f=300',telephone)
        self.assertIn('lowpass=f=3400',telephone)
        self.assertIn('lowpass=f=5200',lofi)

    def test_exact_preview_speed_matches_the_finished_picture_clock(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = str(Path(temp)/'source.wav'), str(Path(temp)/'preview.m4a')
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4','-y',source],check=True)
            for speed in [.8,1.25]:
                receipt=render_audio_remix_preview(source,output,dict(enabled=True,preset='slowed_reverb',speed=speed,keep_pitch=True),duration=4)
                self.assertAlmostEqual(receipt['duration'],4/speed,delta=.08)
                raw=subprocess.check_output(['ffmpeg','-v','error','-i',output,'-ac','1','-ar','48000','-f','f32le','pipe:1'])
                samples=np.frombuffer(raw,dtype='<f4')[24000:48000]
                freq=np.fft.rfftfreq(len(samples),1/48000)[np.argmax(np.abs(np.fft.rfft(samples*np.hanning(len(samples)))))]
                self.assertAlmostEqual(freq,440,delta=4)
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

    def test_new_presets_and_high_bass_are_supported(self):
        for preset_name in ["bass_boost", "lo_fi", "telephone", "spatial_8d"]:
            remix = normalize_audio_remix(dict(preset=preset_name, bass_db=25))
            self.assertEqual(remix["preset"], preset_name)
            self.assertEqual(remix["bass_db"], 18)

    def test_filter_contains_independent_pitch_eq_reverb_and_limiter(self):
        result, remix = build_audio_remix_filter(
            dict(
                enabled=True, preset="slowed_reverb", pitch_semitones=-3,
                bass_db=4, clarity_db=2, air_db=1, reverb_mix=.68,
                intensity=.7,
            )
        )
        self.assertIn("rubberband=tempo=1:pitch=", result)
        self.assertIn("channels=together", result)
        self.assertNotIn("asetrate=", result)
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
    def test_chipmunk_exact_preview_and_export_raise_pitch_without_retiming(self):
        with tempfile.TemporaryDirectory() as temp:
            source = str(Path(temp) / "source.mp4")
            output = str(Path(temp) / "chipmunk.mp4")
            preview = str(Path(temp) / "chipmunk.m4a")
            subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                "color=c=black:s=160x90:r=24:d=2", "-f", "lavfi", "-i",
                "sine=frequency=440:sample_rate=48000:duration=2", "-c:v", "libx264",
                "-threads", "1", "-c:a", "aac", "-shortest", "-y", source,
            ], check=True)
            settings = dict(enabled=True, preset="chipmunk", speed=1, pitch_semitones=12,
                intensity=1, bass_db=-3, clarity_db=2, air_db=3, reverb_mix=0,
                target="voice", content_type="speech", keep_pitch=False)
            final = render_audio_remix(source, output, settings)
            exact = render_audio_remix_preview(source, preview, settings, duration=2)
            self.assertEqual(final["status"], "applied")
            self.assertEqual(exact["status"], "preview_ready")
            for path in (output, preview):
                duration = float(subprocess.check_output([
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=nw=1:nk=1", path,
                ]))
                self.assertAlmostEqual(duration, 2, delta=.08)
                raw = subprocess.check_output([
                    "ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1",
                    "-ar", "48000", "-t", "1.5", "-f", "f32le", "pipe:1",
                ])
                samples = np.frombuffer(raw, dtype="<f4")
                window = samples[:65536] * np.hanning(min(len(samples), 65536))
                spectrum = np.abs(np.fft.rfft(window))
                peak = np.fft.rfftfreq(len(window), 1 / 48000)[np.argmax(spectrum)]
                self.assertAlmostEqual(peak, 880, delta=12)

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

    def test_exact_preview_uses_the_export_chain_and_caps_duration(self):
        with tempfile.TemporaryDirectory() as temp:
            source = str(Path(temp) / "source.mp4")
            music = str(Path(temp) / "music.wav")
            output = str(Path(temp) / "preview.m4a")
            subprocess.run(
                [
                    "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                    "color=c=black:s=320x180:r=24:d=10", "-f", "lavfi", "-i",
                    "sine=frequency=330:sample_rate=48000:duration=10", "-c:v",
                    "libx264", "-threads", "1", "-c:a", "aac", "-shortest", "-y", source,
                ],
                check=True,
            )
            subprocess.run(
                [
                    "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                    "sine=frequency=660:sample_rate=48000:duration=10", "-y", music,
                ],
                check=True,
            )
            receipt = render_audio_remix_preview(
                source,
                output,
                dict(
                    enabled=True,
                    preset="slowed_reverb",
                    content_type="choir",
                    target="master",
                    level_match=True,
                ),
                start_time=1,
                duration=99,
                background_audio=music,
                background_volume=.2,
            )
            self.assertEqual(receipt["status"], "preview_ready")
            self.assertTrue(receipt["includes_voice"])
            self.assertTrue(receipt["includes_music"])
            self.assertAlmostEqual(receipt["duration"], 8, delta=.1)
            self.assertGreater(Path(output).stat().st_size, 1000)


if __name__ == "__main__":
    unittest.main()
