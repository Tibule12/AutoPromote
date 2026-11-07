"""Actual CPU renderer: fractional source cuts retain a complete packet clock.

Also run inside the release image: FFmpeg 6.1 does not reproduce the missing
last-packet duration observed with the deployed FFmpeg 7.1.5 runtime.
"""
import asyncio
from contextlib import ExitStack
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import unittest
from unittest import mock

from python_media_worker import main_media_server as worker
from python_media_worker.studio_sequence_video import preserve_reviewed_sequence_samples


class SequencePacketClockTests(unittest.TestCase):
    def test_lossless_reviewed_sequence_has_a_raw_scratch_budget(self):
        self.assertTrue(preserve_reviewed_sequence_samples(1280,720,24,12,True))
        for values in [(1280,720,24,12,False),(1280,720,24,90,True),
                       (3840,2160,60,12,True),(1280,720,24,float('inf'),True),
                       (1280,720,0,12,True),(1280,720,'source',12,True)]:
            with self.subTest(values=values):
                self.assertFalse(preserve_reviewed_sequence_samples(*values))
        args=worker.build_studio_sequence_encode_args(preserve_samples=True,fps=24)
        self.assertEqual(args[args.index('-crf')+1],'0')
    def test_cut_in_unrepresented_fractional_tail_does_not_reject_a_valid_edit(self):
        self.render_sequence(24, duration=1.9666666666666666, tail_cut=1.966)
    def test_fractional_cuts_at_24fps(self):
        self.render_sequence(24)

    def test_fractional_cuts_at_25fps(self):
        self.render_sequence(25)

    def test_fractional_cuts_at_60fps(self):
        self.render_sequence(60)

    def test_short_reviewed_sequence_preserves_intermediates_but_keeps_delivery_quality(self):
        self.render_sequence(24, framed=True)

    def render_sequence(self, fps, duration=2, tail_cut=None, framed=False):
        with tempfile.TemporaryDirectory(prefix="studio-packet-clock-") as folder, ExitStack() as patches:
            tmp_path = Path(folder)

            def replace(target, name, value):
                patches.enter_context(mock.patch.object(target, name, value))

            def run(*arguments):
                return subprocess.check_output(
                    ["ffmpeg", "-v", "error", "-nostdin", *map(str, arguments)], timeout=60
                )

            def probe(path):
                return json.loads(subprocess.check_output([
                    "ffprobe", "-v", "error", "-show_entries",
                    "stream=codec_type,nb_frames,duration,avg_frame_rate", "-of", "json", str(path)
                ], timeout=30))["streams"]

            source = tmp_path / "source.mp4"
            run("-f", "lavfi", "-i", "testsrc2=s=128x72:r=30:d=2",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                "-c:v", "libx264", "-threads", 1, "-preset", "ultrafast",
                "-c:a", "aac", "-y", source)

            def denied(*_, **__):
                raise AssertionError("The local render regression must not use a network or cloud writer")

            replace(socket, "create_connection", denied)
            replace(socket.socket, "connect", denied)
            replace(worker, "update_firestore_job", denied)
            replace(worker, "studio_render_scratch_directory", lambda _: str(tmp_path))
            replace(worker, "GPU_VIDEO_ENCODER", "libx264")
            replace(worker, "GPU_PRESET", "ultrafast")
            patches.enter_context(mock.patch.dict(os.environ, {"MEDIA_WORKER_STUDIO_FFMPEG_THREADS": "2"}))

            async def materialize(url, destination, **_):
                assert url == "local-regression-source"
                shutil.copyfile(source, destination)
                return destination

            replace(worker, "materialize_video_input", materialize)
            final = tmp_path / "verified-final.mp4"

            def retain_output(path, **_):
                shutil.copyfile(path, final)
                return "local-regression-output"

            replace(worker, "upload_file_to_firebase", retain_output)
            original_run = worker.run_subprocess_async
            checked_segments = []
            checked_finish = []

            async def inspect_intermediates(command, **options):
                result = await original_run(command, **options)
                output = Path(str(command[-1]))
                if "_segment_v_" in output.name or output.name.endswith("_trimmed.mp4"):
                    picture = next(s for s in probe(output) if s["codec_type"] == "video")
                    frames = int(picture["nb_frames"])
                    assert abs(float(picture["duration"]) - frames / fps) < 1e-6
                    numerator, denominator = picture["avg_frame_rate"].split("/")
                    assert float(numerator) / float(denominator) == fps
                    checked_segments.append(output.name)
                if framed and output.name.endswith(("_finish.mp4", "_main_frame.mp4", "_viral.mp4")):
                    expected = "23" if output.name.endswith("_viral.mp4") else "0"
                    self.assertEqual(command[command.index("-crf") + 1], expected)
                    checked_finish.append(output.name)
                return result

            replace(worker, "run_subprocess_async", inspect_intermediates)
            request = worker.RenderViralRequest(
                video_url="local-regression-source", start_time=0, end_time=duration,
                timeline_segments=[
                    {"id": "left", "url": "local-regression-source", "start_time": 0, "end_time": .7},
                    {"id": "right", "url": "local-regression-source", "start_time": .7, "end_time": duration},
                ],
                smart_crop=True, smart_crop_mode="speaker_track",
                finish_plan={"enabled": True, "main_frame": {"enabled": framed,
                    "border_radius_percent": 10, "inset_percent": 2.5, "background": "studio_black"}, "reframe": {
                    "aspect": "9:16", "zoom": 1,
                    "keyframes": [{"time": 0, "x": 50, "y": 50}],
                    "timeline_cuts": [{"time": 0, "mode": "speaker_track"},
                                      {"time": .7, "mode": "speaker_track"}] +
                                     ([{"time": tail_cut, "mode": "speaker_track"}] if tail_cut is not None else []),
                }},
                output_settings={"resolution": "720p", "fps": fps, "quality": "balanced"},
                brand_watermark=False,
            )
            result = asyncio.run(worker.render_viral_clip_impl(request, f"packet-clock-{fps}"))
            assert result["status"] == "completed"
            assert len(checked_segments) == 3
            if framed:
                self.assertEqual(len(checked_finish), 3)
            picture = next(s for s in probe(final) if s["codec_type"] == "video")
            assert int(picture["nb_frames"]) == round(duration * fps)
            assert abs(float(picture["duration"]) - round(duration * fps)/fps) < 1e-6
            assert any(s["codec_type"] == "audio" for s in probe(final))
            run("-xerror", "-err_detect", "explode", "-i", final, "-f", "null", "-")
