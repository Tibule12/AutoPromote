import json
import math
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

try:
    from python_media_worker.studio_sequence_audio import sequence_audio_window
except ImportError:
    from studio_sequence_audio import sequence_audio_window


class SequenceAudioTests(unittest.TestCase):
    def test_jcut_cannot_precede_programme_or_source(self):
        window = sequence_audio_window(dict(start_time=5, end_time=7, audioTrimOffsetStart=-.8), 0, 4, 10)
        self.assertEqual(window, dict(source_start=5, source_end=7, programme_start=0, duration=2))
        window = sequence_audio_window(dict(start_time=.2, end_time=2, audioTrimOffsetStart=-.8), 2, 5, 10)
        self.assertAlmostEqual(window['source_start'], 0)
        self.assertAlmostEqual(window['programme_start'], 1.8)

    def test_lcut_is_limited_by_source_and_programme(self):
        window = sequence_audio_window(dict(start_time=4, end_time=6, audioTrimOffsetEnd=3), 0, 8, 7)
        self.assertEqual(window['source_end'], 7)
        window = sequence_audio_window(dict(start_time=4, end_time=6, audioTrimOffsetEnd=3), 0, 2, 10)
        self.assertEqual(window['source_end'], 6)

    def test_detached_audio_uses_its_own_source_and_programme_clock(self):
        window = sequence_audio_window(dict(start_time=3, end_time=5, audioDetached=True,
            audioSourceStart=1, audioSourceEnd=3, audioProgrammeStart=.5), 2, 7, 10)
        self.assertEqual(window, dict(source_start=1, source_end=3, programme_start=.5, duration=2))

    def test_invalid_detached_ranges_fail(self):
        for invalid in [None, float('nan'), float('inf'), -1]:
            with self.subTest(value=invalid), self.assertRaises((TypeError, ValueError)):
                sequence_audio_window(dict(start_time=0,end_time=2,audioDetached=True,
                    audioSourceStart=invalid,audioSourceEnd=3,audioProgrammeStart=0),0,4,10)

    def test_actual_encoded_detached_audio_has_the_selected_phase_and_onset(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp)/'source.wav', Path(temp)/'out.m4a'
            rate = 48000
            t = np.arange(rate * 4) / rate
            frequency = 220 * (1 + np.floor(t))
            samples = (np.sin(2*np.pi*frequency*t)*8000).astype('<i2')
            with wave.open(str(source),'wb') as f:
                f.setnchannels(1); f.setsampwidth(2); f.setframerate(rate); f.writeframes(samples.tobytes())
            window = sequence_audio_window(dict(start_time=2,end_time=3,audioDetached=True,
                audioSourceStart=1,audioSourceEnd=2,audioProgrammeStart=.5), 0, 2, 4)
            subprocess.run(['ffmpeg','-v','error','-ss',str(window['source_start']),'-t',str(window['duration']),'-i',str(source),
                '-af',f"adelay={round(window['programme_start']*1000)}:all=1,apad=whole_dur=2,atrim=0:2",
                '-c:a','aac','-y',str(output)],check=True)
            raw = subprocess.check_output(['ffmpeg','-v','error','-i',str(output),'-ac','1','-ar',str(rate),'-f','f32le','pipe:1'])
            decoded = np.frombuffer(raw,dtype='<f4')
            self.assertLess(float(np.max(np.abs(decoded[:int(.4*rate)]))),.001)
            segment = decoded[int(.7*rate):int(1.2*rate)]
            spectrum = np.abs(np.fft.rfft(segment*np.hanning(len(segment))))
            peak = np.fft.rfftfreq(len(segment),1/rate)[np.argmax(spectrum)]
            self.assertAlmostEqual(peak,440,delta=5)
            self.assertLess(float(np.max(np.abs(decoded[int(1.65*rate):int(1.95*rate)]))),.001)


if __name__ == '__main__':
    unittest.main()
