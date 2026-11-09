"""Real PCM/FFmpeg regression checks for delivery stereo and sync mono."""
import ast
import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import logging
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
import wave

import numpy as np

from viral_motion_graphics import SAMPLE_RATE, probe, validate_design, write_sound_mix


def write_pcm(path, samples):
    with wave.open(str(path), "wb") as out:
        out.setnchannels(samples.shape[1] if samples.ndim == 2 else 1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes((samples * 32767).astype("<i2").tobytes())


def read_pcm(path):
    with wave.open(str(path), "rb") as source:
        return np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").reshape(
            -1, source.getnchannels()
        ) / 32767


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
class StereoDeliveryTests(unittest.TestCase):
    def test_stereo_cue_preserves_channel_separation_trim_gain_fades_and_speed_clock(self):
        with tempfile.TemporaryDirectory() as temp:
            source, result = Path(temp) / "source.wav", Path(temp) / "mix.wav"
            t = np.arange(SAMPLE_RATE) / SAMPLE_RATE
            # Leading silence makes a missing trim independently observable.
            signal = np.column_stack((.4 * np.sin(2 * np.pi * 440 * t), np.zeros(len(t))))
            signal[:SAMPLE_RATE // 4] = 0
            write_pcm(source, signal)
            _, effects = validate_design(None, [dict(
                url="https://example.test/cue.wav", startTime=1, duration=.5,
                trimStart=.25, volume=.5, fadeIn=.1, fadeOut=.1,
            )])
            write_sound_mix(result, effects, 1, [dict(start_time=0, end_time=2, rate=2)],
                            {effects[0]["url"]: source}, channels=2)
            pcm = read_pcm(result)
            self.assertEqual(pcm.shape, (SAMPLE_RATE, 2))
            self.assertEqual(np.abs(pcm[:, 1]).max(), 0, "Silent right must not receive left signal")
            self.assertEqual(np.abs(pcm[:24000]).max(), 0)
            self.assertEqual(np.abs(pcm[36000:]).max(), 0)
            rms = lambda a, b: np.sqrt(np.mean(pcm[int(a*SAMPLE_RATE):int(b*SAMPLE_RATE), 0]**2))
            self.assertAlmostEqual(rms(.57, .63), .2 / np.sqrt(2), delta=.002)
            self.assertLess(rms(.5, .51), rms(.57, .63) * .2)
            self.assertLess(rms(.74, .75), rms(.57, .63) * .2)

    def test_mono_voiceover_remains_centered_and_pitch_preserved_at_double_speed(self):
        with tempfile.TemporaryDirectory() as temp:
            source, result = Path(temp) / "voice.wav", Path(temp) / "mix.wav"
            t = np.arange(SAMPLE_RATE) / SAMPLE_RATE
            write_pcm(source, .3 * np.sin(2 * np.pi * 440 * t))
            _, effects = validate_design(None, [dict(
                kind="voiceover", url="https://example.test/voice.wav", startTime=.5,
                duration=1, volume=.5, fadeIn=.02, fadeOut=.02,
            )])
            write_sound_mix(result, effects, 1, [dict(start_time=0, end_time=2, rate=2)],
                            {effects[0]["url"]: source}, channels=2)
            pcm = read_pcm(result)
            np.testing.assert_array_equal(pcm[:, 0], pcm[:, 1])
            self.assertEqual(np.abs(pcm[:12000]).max(), 0)
            self.assertEqual(np.abs(pcm[36000:]).max(), 0)
            segment = pcm[16800:28800, 0]
            self.assertGreater(np.sqrt(np.mean(segment**2)), .08)
            frequency = np.argmax(np.abs(np.fft.rfft(segment))) * SAMPLE_RATE / len(segment)
            self.assertAlmostEqual(frequency, 440, delta=4)

    def test_sync_materialization_stays_mono_while_delivery_can_preserve_stereo(self):
        # Execute the real materializer with real FFmpeg, without loading ML models.
        tree = ast.parse((Path(__file__).parent / "main_media_server.py").read_text())
        func = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef)
                    and n.name == "materialize_audio_input")
        class HttpError(Exception):
            def __init__(self, status_code, detail):
                self.status_code, self.detail = status_code, detail
        async def execute(command, **kwargs):
            return await asyncio.to_thread(subprocess.run, command, **kwargs)
        ns = dict(os=os, subprocess=subprocess, IS_PRODUCTION_ENV=True,
                  MULTICAM_SYNC_SAMPLE_RATE=16000, HTTPException=HttpError,
                  run_subprocess_async=execute, logger=logging.getLogger(__name__),
                  has_audio_stream=lambda p: any(s["codec_type"] == "audio" for s in probe(p)["streams"]),
                  get_media_duration=lambda p: float(probe(p)["format"]["duration"]))
        exec(compile(ast.Module(body=[func], type_ignores=[]), "audio-materializer", "exec"), ns)
        with tempfile.TemporaryDirectory() as temp:
            t = np.arange(SAMPLE_RATE // 2) / SAMPLE_RATE
            write_pcm(Path(temp) / "source.wav", np.column_stack(
                (.3*np.sin(2*np.pi*440*t), .2*np.sin(2*np.pi*880*t))))
            server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temp))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f"http://127.0.0.1:{server.server_port}/source.wav"
                mono = asyncio.run(ns[func.name](url, str(Path(temp)/"sync.wav")))
                stereo = asyncio.run(ns[func.name](url, str(Path(temp)/"delivery.wav"),
                                                  sample_rate=SAMPLE_RATE, channels=2))
                self.assertEqual(read_pcm(mono).shape[1], 1)
                actual = read_pcm(stereo)
                self.assertEqual(actual.shape, (SAMPLE_RATE//2, 2))
                self.assertLess(abs(np.corrcoef(actual.T)[0, 1]), .001)
                for channels in (True, 1.0, "2", 0, 3):
                    with self.subTest(channels=channels), self.assertRaises(HttpError) as error:
                        asyncio.run(ns[func.name](url, str(Path(temp)/"invalid.wav"), channels=channels))
                    self.assertEqual(error.exception.status_code, 400)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

    def test_default_cue_mix_is_still_mono_and_rejects_invalid_layouts(self):
        with tempfile.TemporaryDirectory() as temp:
            result = Path(temp) / "mix.wav"
            _, effects = validate_design(None, [dict(builtIn=True, tone="impact", duration=.1)])
            plan = [dict(start_time=0, end_time=.5, rate=1)]
            write_sound_mix(result, effects, .5, plan, {})
            self.assertEqual(read_pcm(result).shape, (SAMPLE_RATE//2, 1))
            self.assertGreater(np.abs(read_pcm(result)).max(), .05)
            for channels in (True, 1.0, "2", 0, 3):
                with self.subTest(channels=channels), self.assertRaises(ValueError):
                    write_sound_mix(result, effects, .5, plan, {}, channels=channels)


if __name__ == "__main__":
    unittest.main()
