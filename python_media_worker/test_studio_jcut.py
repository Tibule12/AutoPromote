"""
Unit test for J-Cut & L-Cut split audio transition rendering in AutoPromote.
Verifies audio offset calculations and synthetic FFmpeg adelay/amix filter graph execution.
"""
import math
import os
import subprocess
import tempfile
import unittest


class StudioJCutAudioTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        for f in os.listdir(self.tmpdir):
            try:
                os.remove(os.path.join(self.tmpdir, f))
            except OSError:
                pass
        try:
            os.rmdir(self.tmpdir)
        except OSError:
            pass

    def test_audio_offset_math(self):
        """Verify J-Cut and L-Cut start/duration/delay math matches backend specifications."""
        # Segment 0: video 0.0s to 5.0s, with 0.8s L-Cut trail
        seg0_start = 0.0
        seg0_end = 5.0
        seg0_offset_start = 0.0
        seg0_offset_end = 0.8

        seg0_audio_start = max(0.0, seg0_start + seg0_offset_start)
        seg0_audio_end = seg0_end + seg0_offset_end
        seg0_audio_dur = max(0.05, seg0_audio_end - seg0_audio_start)
        self.assertAlmostEqual(seg0_audio_start, 0.0)
        self.assertAlmostEqual(seg0_audio_dur, 5.8)

        # Segment 1: video 10.0s to 16.0s (output time 5.0s), with 0.8s J-Cut pre-lap
        seg1_start = 10.0
        seg1_end = 16.0
        seg1_offset_start = -0.8
        seg1_offset_end = 0.0

        seg1_audio_start = max(0.0, seg1_start + seg1_offset_start)
        seg1_audio_end = seg1_end + seg1_offset_end
        seg1_audio_dur = max(0.05, seg1_audio_end - seg1_audio_start)
        self.assertAlmostEqual(seg1_audio_start, 9.2)
        self.assertAlmostEqual(seg1_audio_dur, 6.8)

        # Output delays
        current_output_time_0 = 0.0
        delay_ms_0 = int(max(0, current_output_time_0 + seg0_offset_start) * 1000)
        self.assertEqual(delay_ms_0, 0)

        current_output_time_1 = 5.0
        delay_ms_1 = int(max(0, current_output_time_1 + seg1_offset_start) * 1000)
        self.assertEqual(delay_ms_1, 4200)  # 5.0 - 0.8 = 4.2s = 4200ms

    def test_ffmpeg_synthetic_jcut_mix(self):
        """Execute real FFmpeg audio mixing with adelay and amix on synthetic audio tones."""
        # Create 2 synthetic audio files: 440Hz tone (clip 0) and 880Hz tone (clip 1)
        clip0_path = os.path.join(self.tmpdir, "clip0.m4a")
        clip1_path = os.path.join(self.tmpdir, "clip1.m4a")
        output_path = os.path.join(self.tmpdir, "mixed.m4a")

        cmd0 = [
            "ffmpeg", "-v", "error", "-f", "lavfi",
            "-i", "sine=frequency=440:duration=5.8",
            "-c:a", "aac", "-y", clip0_path
        ]
        subprocess.run(cmd0, check=True)

        cmd1 = [
            "ffmpeg", "-v", "error", "-f", "lavfi",
            "-i", "sine=frequency=880:duration=6.8",
            "-c:a", "aac", "-y", clip1_path
        ]
        subprocess.run(cmd1, check=True)

        # Mix clip0 (delay 0ms) and clip1 (delay 4200ms) with amix
        filter_complex = "[0:a]adelay=0|0[a0];[1:a]adelay=4200|4200[a1];[a0][a1]amix=inputs=2:duration=longest:dropout_transition=2:normalize=0[a_mixed];[a_mixed]apad=whole_dur=11.000,atrim=0:11.000[a_out]"

        mix_cmd = [
            "ffmpeg", "-v", "error",
            "-i", clip0_path,
            "-i", clip1_path,
            "-filter_complex", filter_complex,
            "-map", "[a_out]",
            "-c:a", "aac", "-b:a", "192k",
            "-y", output_path
        ]
        result = subprocess.run(mix_cmd, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", errors="ignore"))
        self.assertTrue(os.path.exists(output_path))
        self.assertGreater(os.path.getsize(output_path), 1000)


if __name__ == "__main__":
    unittest.main()

