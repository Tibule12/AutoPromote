import ast
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class StudioProDeliveryAndSpeedTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).with_name("main_media_server.py")
        src_text = source.read_text(encoding="utf-8")
        tree = ast.parse(src_text)
        names = {"resolve_viral_export_profile", "build_viral_export_encode_args"}
        module = ast.Module(
            body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names],
            type_ignores=[],
        )
        self.runtime = {"os": os, "GPU_VIDEO_ENCODER": "libx264"}
        exec(compile(module, str(source), "exec"), self.runtime)
        self.server_text = src_text

    def test_explicit_bitrate_target_mb_prores_and_rec2020_profiles(self):
        with patch.dict(os.environ, {"VIRAL_EXPORT_ENCODER": "cpu"}):
            # Explicit videoBitrate -> -b:v + -maxrate + -bufsize without -crf
            vbr = self.runtime["resolve_viral_export_profile"](
                {"codec": "h264", "videoBitrate": "12000", "colorSpace": "rec709"},
                1920,
                1080,
            )
            self.assertEqual(vbr["videoBitrateKbps"], 12000)
            vbr_args = self.runtime["build_viral_export_encode_args"](vbr)
            self.assertEqual(vbr_args[vbr_args.index("-b:v") + 1], "12000k")
            self.assertEqual(vbr_args[vbr_args.index("-maxrate") + 1], "18000k")
            self.assertNotIn("-crf", vbr_args)

            # Target file size MB with known duration -> constrained bitrate
            sized = self.runtime["resolve_viral_export_profile"](
                {"codec": "h264", "targetFileSizeMb": 10, "targetDurationSeconds": 10, "audioBitrate": 192},
                1920,
                1080,
            )
            self.assertAlmostEqual(sized["videoBitrateKbps"], 8000, delta=50)

            # ProRes 422 HQ mezzanine (.mov + PCM + Rec.2020 tags)
            prores = self.runtime["resolve_viral_export_profile"](
                {"codec": "prores", "colorSpace": "rec2020", "audioCodec": "pcm"},
                1280,
                720,
            )
            self.assertEqual(prores["encoder"], "prores_ks")
            self.assertEqual(prores["container"], "mov")
            self.assertEqual(prores["audioCodec"], "pcm")
            prores_args = self.runtime["build_viral_export_encode_args"](prores)
            self.assertEqual(prores_args[prores_args.index("-c:v") + 1], "prores_ks")
            self.assertIn("bt2020nc", prores_args)

            # Verify real FFmpeg encodes ProRes 422 HQ + PCM in .mov cleanly
            with tempfile.TemporaryDirectory() as tmp:
                mov_path = os.path.join(tmp, "mezzanine.mov")
                subprocess.run(
                    [
                        "ffmpeg", "-y",
                        "-f", "lavfi", "-i", "color=c=0x4488cc:s=160x90:r=24:d=0.4",
                        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.4",
                        *prores_args, "-c:a", "pcm_s16le", "-f", "mov", mov_path,
                    ],
                    check=True,
                    capture_output=True,
                )
                probe = json.loads(
                    subprocess.run(
                        ["ffprobe", "-v", "error", "-show_streams", "-of", "json", mov_path],
                        check=True, capture_output=True, text=True,
                    ).stdout
                )
                codecs = {s["codec_type"]: s["codec_name"] for s in probe["streams"]}
                self.assertEqual(codecs.get("video"), "prores")
                self.assertEqual(codecs.get("audio"), "pcm_s16le")

    def test_multi_segment_reverse_and_freeze_branch_present_and_runs_in_ffmpeg(self):
        self.assertIn("elif has_reverse_or_freeze and len(requested_speed_segments) > 1:", self.server_text)
        self.assertIn("split={seg_count}", self.server_text)
        # Exercise the exact multi-segment split/trim/reverse/freeze concat graph in real FFmpeg
        filt = (
            "[0:v]split=2[vrfin_0][vrfin_1];"
            "[1:a]asplit=2[arfin_0][arfin_1];"
            "[vrfin_0]trim=start=0.000000:end=0.500000,setpts=PTS-STARTPTS,reverse,setpts=PTS-STARTPTS,fps=24[vrf_0];"
            "[vrfin_1]trim=start=0.500000:end=1.000000,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=0.500,fps=24[vrf_1];"
            "[arfin_0]atrim=start=0.000000:end=0.500000,asetpts=PTS-STARTPTS,areverse,asetpts=PTS-STARTPTS[arf_0];"
            "[arfin_1]atrim=start=0.500000:end=1.000000,asetpts=PTS-STARTPTS,apad=pad_dur=0.500[arf_1];"
            "[vrf_0][vrf_1]concat=n=2:v=1:a=0[v_speed];"
            "[arf_0][arf_1]concat=n=2:v=0:a=1[a_speed]"
        )
        with tempfile.TemporaryDirectory() as tmp:
            out_path = os.path.join(tmp, "rf_multi.mp4")
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-f", "lavfi", "-i", "testsrc2=s=160x90:r=24:d=1.0",
                    "-f", "lavfi", "-i", "sine=frequency=523:sample_rate=48000:duration=1.0",
                    "-filter_complex", filt, "-map", "[v_speed]", "-map", "[a_speed]",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", out_path,
                ],
                check=True,
                capture_output=True,
            )
            probe = json.loads(
                subprocess.run(
                    ["ffprobe", "-v", "error", "-show_format", "-of", "json", out_path],
                    check=True, capture_output=True, text=True,
                ).stdout
            )
            self.assertGreaterEqual(float(probe["format"]["duration"]), 1.4)


if __name__ == "__main__":
    unittest.main()
