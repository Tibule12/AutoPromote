import json
import os
import subprocess
import tempfile
import unittest

from studio_audio import (
    build_dialogue_filter,
    build_master_bus_loudnorm,
    build_pan_filter,
    build_smooth_ducking_filter,
    track_pan,
)
from studio_audio_stems import export_bus_stems_with_ffmpeg


def _probe_audio(path):
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    return json.loads(res.stdout)


class StudioAudioProMixAndStemsTests(unittest.TestCase):
    def test_pan_filter_routes_left_center_right_with_ffmpeg(self):
        self.assertEqual(build_pan_filter(0), "")
        self.assertEqual(track_pan({"music": {"pan": -150}}, "music"), -100.0)
        pan_right = build_pan_filter(100)
        self.assertIn("pan=stereo|", pan_right)

        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, "stereo.wav")
            out = os.path.join(tmp, "panned_right.wav")
            subprocess.run(
                ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=f=440:r=48000:d=1", "-ac", "2", "-y", src],
                check=True,
            )
            subprocess.run(
                ["ffmpeg", "-v", "error", "-i", src, "-af", pan_right, "-y", out],
                check=True,
            )
            # Measure RMS of Left (c0) vs Right (c1) via FFmpeg astats
            stat_l = subprocess.run(
                ["ffmpeg", "-i", out, "-af", "pan=mono|c0=c0,astats=metadata=0:reset=0", "-f", "null", "-"],
                capture_output=True, text=True,
            ).stderr
            stat_r = subprocess.run(
                ["ffmpeg", "-i", out, "-af", "pan=mono|c0=c1,astats=metadata=0:reset=0", "-f", "null", "-"],
                capture_output=True, text=True,
            ).stderr
            self.assertIn("-inf", stat_l)
            self.assertNotIn("-inf", stat_r)

    def test_smooth_ducking_and_master_bus_loudnorm_filters(self):
        duck_filter = build_smooth_ducking_filter([(1.0, 2.5, 0.25)], fade_seconds=0.08)
        self.assertTrue(duck_filter.startswith("aeval=exprs="))
        self.assertIn("clip(", duck_filter)

        dlg_no_ln, _ = build_dialogue_filter({"enabled": True, "denoise": 20, "loudness": -16}, include_loudnorm=False)
        self.assertNotIn("loudnorm=", dlg_no_ln)

        master_ln, _ = build_master_bus_loudnorm({"enabled": True, "loudness": -16, "limiter": -1.0})
        self.assertIn("loudnorm=I=-16.0:LRA=9:TP=-1.0", master_ln)
        self.assertIn("alimiter=", master_ln)

        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, "tone.wav")
            out = os.path.join(tmp, "ducked.wav")
            subprocess.run(
                ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=f=440:r=48000:d=3", "-y", src],
                check=True,
            )
            subprocess.run(
                ["ffmpeg", "-v", "error", "-i", src, "-af", duck_filter, "-y", out],
                check=True,
            )
            dur = float(_probe_audio(out)["format"]["duration"])
            self.assertAlmostEqual(dur, 3.0, delta=0.05)

    def test_synced_lossless_wav_stem_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            dlg = os.path.join(tmp, "dlg.wav")
            bgm = os.path.join(tmp, "bgm.wav")
            sfx = os.path.join(tmp, "sfx.wav")
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=f=300:r=48000:d=4", "-y", dlg], check=True)
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=f=600:r=48000:d=4", "-y", bgm], check=True)
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=f=1200:r=48000:d=0.5", "-y", sfx], check=True)

            stems_dir = os.path.join(tmp, "stems")
            manifest = export_bus_stems_with_ffmpeg(
                ["-i", dlg, "-i", bgm, "-i", sfx],
                ["[2:a]adelay=1500|1500[sfx_delayed]"],
                {"originalAudio": "0:a", "music": "1:a", "sfx": "sfx_delayed"},
                duration=4.0,
                output_dir=stems_dir,
            )
            self.assertEqual([item["filename"] for item in manifest], ["01_dialogue.wav", "03_music.wav", "05_sfx.wav"])
            for item in manifest:
                info = _probe_audio(item["path"])
                self.assertEqual(info["streams"][0]["codec_name"], "pcm_s24le")
                self.assertEqual(int(info["streams"][0]["channels"]), 2)
                self.assertAlmostEqual(float(info["format"]["duration"]), 4.0, delta=0.01)


if __name__ == "__main__":
    unittest.main()
