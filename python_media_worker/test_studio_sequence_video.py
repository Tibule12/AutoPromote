import subprocess
import tempfile
import unittest
from pathlib import Path
import numpy as np
from python_media_worker.studio_sequence_video import sequence_picture_window


class SequencePictureTests(unittest.TestCase):
    def test_fractional_cuts_keep_global_frame_budget_and_actual_source_samples(self):
        # Each source frame has a distinct exact grey level: decoded picture
        # proves sample identity, rather than merely a nominal duration.
        data = np.stack([np.full((16, 16, 3), n+10, np.uint8) for n in range(192)])
        windows = [(0, 6.766666666666667, 0), (6.766666666666667, 1.2423333333333337, 6.766666666666667),
                   (8.009, 7.751333333333334, .25766666666666665)]
        expected = [list(range(163)), list(range(163, 192))+[191], list(range(6, 191))]
        with tempfile.TemporaryDirectory() as folder:
            source = str(Path(folder) / 'source.mkv')
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '16x16',
                            '-r', '24', '-i', '-', '-c:v', 'ffv1', '-y', source], input=data.tobytes(), check=True)
            total = 0
            for (start, duration, source_start), samples in zip(windows, expected):
                window = sequence_picture_window(start, duration, 15.760333333333334, source_start, 24, 24)
                output = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', f"{window['seek']:.6f}", '-i', source,
                    '-vf', ','.join(window['clock']), '-frames:v', str(window['frames']),
                    # Match the real sequence encoder. FFmpeg 7 otherwise
                    # resamples this rawvideo observer to its muxer rate.
                    '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
                pictures = np.frombuffer(output, np.uint8).reshape(-1, 16, 16, 3)
                self.assertEqual(len(pictures), len(samples))
                np.testing.assert_allclose(pictures.mean(axis=(1, 2, 3))-10, samples, atol=1)
                total += len(pictures)
            self.assertEqual(total, 378)

    def test_subframe_section_does_not_create_a_phantom_picture(self):
        self.assertEqual(sequence_picture_window(.01, .001, 2, 0, 24, 24)['frames'], 0)
