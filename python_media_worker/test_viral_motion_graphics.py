"""Offline integration tests: actual frames/audio plus browser/worker contract parity."""
import json
import ast
import asyncio
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
import wave

import numpy as np

from viral_motion_graphics import (
    PRESETS, SOUNDS, draw_motion_frame, edit_clock, motion_pose, motion_primitives,
    normalize_motion, probe, render_motion_and_sound, run, synthesize_effect, validate_design,
)


class MotionContractTests(unittest.TestCase):
    def test_render_endpoint_rejects_unknown_designs_before_queueing(self):
        # Execute the real HTTP handler without importing heavyweight ML models.
        tree = ast.parse((Path(__file__).parent / "main_media_server.py").read_text())
        handler = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "render_viral_clip")
        handler.decorator_list = []
        handler.returns = None
        for arg in handler.args.args:
            arg.annotation = None
        class HttpError(Exception):
            def __init__(self, status_code, detail):
                self.status_code, self.detail = status_code, detail
        implementation = AsyncMock(return_value={"status": "completed"})
        namespace = dict(validate_design=validate_design, HTTPException=HttpError, render_viral_clip_impl=implementation)
        exec(compile(ast.Module(body=[handler], type_ignores=[]), "render-handler", "exec"), namespace)
        request = SimpleNamespace(motion_graphics={"version": 99}, sound_effects=[], async_mode=False)
        with self.assertRaises(HttpError) as error:
            asyncio.run(namespace["render_viral_clip"](request, None))
        self.assertEqual(error.exception.status_code, 422)
        implementation.assert_not_called()
        request.motion_graphics = {"version": 1, "scenes": []}
        asyncio.run(namespace["render_viral_clip"](request, None))
        implementation.assert_awaited_once_with(request)

    def test_invalid_contracts_fail_instead_of_silently_dropping_edits(self):
        for contract in ({"version": 2}, {"scenes": [{}]}, {"scenes": [{}]*25}):
            with self.assertRaises(ValueError):
                validate_design(contract)
        with self.assertRaises(ValueError):
            validate_design(None, [{"builtIn": True, "tone": "missing"}])
        with self.assertRaises(ValueError):
            validate_design(None, [{}])

    def test_speed_ranges_map_back_to_the_edit_clock(self):
        plan = [{"start_time": 0, "end_time": 2, "rate": 1}, {"start_time": 2, "end_time": 6, "rate": 2}]
        np.testing.assert_allclose(edit_clock([0, 1, 2, 2.5, 3, 4], plan), [0, 1, 2, 3, 4, 6])

    def test_each_preset_draws_and_disappears_at_its_end(self):
        for preset in PRESETS:
            scene = normalize_motion(dict(preset=preset, text="A STRONG IDEA", secondary="A CLEAR STORY", duration=3))
            self.assertIsNotNone(draw_motion_frame([scene], 1, 360, 640).getbbox(), preset)
            self.assertIsNone(draw_motion_frame([scene], 3, 360, 640).getbbox(), preset)

    @unittest.skipUnless(shutil.which("node"), "Node required for browser contract parity")
    def test_browser_worker_pose_artwork_and_pcm_parity(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            motion = Path(temp)/"motion.mjs"
            sound = Path(temp)/"sound.mjs"
            motion.write_text((root/"frontend/src/components/motion/motionModel.js").read_text())
            sound.write_text((root/"frontend/src/components/motion/soundDesign.js").read_text())
            code = f'''import {{normalizeMotion,motionPose,motionPrimitives,MOTION_PRESETS}} from {json.dumps(motion.as_uri())};
import {{synthesizeEffect}} from {json.dumps(sound.as_uri())};
const scenes=MOTION_PRESETS.map(p=>normalizeMotion({{id:p.id,preset:p.id,text:"A STRONG IDEA",secondary:"THE OTHER IDEA",value:-125,prefix:"R",startTime:2,duration:4,x:30,endX:65,y:25,endY:70,rotation:-10,endRotation:20}}));
const poses=scenes.map(s=>[2,2.15,3,4,5.9,6].map(t=>{{const pose=motionPose(s,t);return {{pose,art:pose?motionPrimitives(s,pose):null}};}}));
const sounds={json.dumps(SOUNDS)}.map(tone=>{{const e={{tone,duration:.12,fadeIn:.01,fadeOut:.02}};const pcm=synthesizeEffect(e,8000);return {{e,pcm:Array.from(pcm)}};}});
process.stdout.write(JSON.stringify({{scenes,poses,sounds}}));'''
            browser = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", code]))
        for index, scene in enumerate(browser["scenes"]):
            for frame, time in enumerate([2, 2.15, 3, 4, 5.9, 6]):
                pose = motion_pose(scene, time)
                expected = browser["poses"][index][frame]
                if pose is None:
                    self.assertIsNone(expected["pose"])
                else:
                    for key in pose:
                        self.assertAlmostEqual(pose[key], expected["pose"][key], places=9)
                    # Floats may differ by a final ulp; geometry remains identical.
                    actual = motion_primitives(scene, pose)
                    self.assertEqual(len(actual), len(expected["art"]))
                    for a, b in zip(actual, expected["art"]):
                        for key in a:
                            if isinstance(a[key], (float, int)):
                                self.assertAlmostEqual(a[key], b[key], places=8)
                            else:
                                self.assertEqual(a[key], b[key])
        for sound in browser["sounds"]:
            np.testing.assert_allclose(synthesize_effect(sound["e"], 8000), sound["pcm"], atol=1e-7)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
class MotionRenderTests(unittest.TestCase):
    def test_real_render_keeps_duration_draws_motion_and_mixes_trimmed_cues_at_speed(self):
        with tempfile.TemporaryDirectory() as temp:
            source, result, custom = [str(Path(temp)/name) for name in ("source.mp4", "result.mp4", "custom.wav")]
            run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=0x244255:s=240x426:r=30:d=3",
                 "-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-af", "volume=0.12",
                 "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-shortest", "-y", source])
            # First half silent: only the correct trim makes this cue audible.
            with wave.open(custom, "wb") as audio:
                audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(48000)
                samples = np.concatenate((np.zeros(24000), .3*np.sin(2*math.pi*900*np.arange(24000)/48000)))
                audio.writeframes((samples*32767).astype("<i2").tobytes())
            scenes = [dict(id="a", preset="counter", text="YOUR MILESTONE", value=500, prefix="R", startTime=1, duration=2)]
            effects = [dict(id="cue", builtIn=True, tone="impact", startTime=1, duration=.7, volume=.5),
                       dict(id="upload", builtIn=False, url="https://example.test/cue.wav", startTime=4, duration=.5,
                            trimStart=.5, volume=.7, fadeIn=.01, fadeOut=.02)]
            receipt = render_motion_and_sound(source, result, {"version": 1, "scenes": scenes}, effects,
                         [{"start_time": 0, "end_time": 6, "rate": 2}], {effects[1]["url"]: custom})
            self.assertEqual(receipt["sound_cues"], 2)
            self.assertEqual(receipt["motion_scenes"], 1)
            self.assertAlmostEqual(float(probe(result)["format"]["duration"]), 3, delta=.06)
            pcm = np.frombuffer(run(["ffmpeg", "-v", "error", "-i", result, "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"]), dtype="<f4")
            rms = lambda start, end: np.sqrt(np.mean(pcm[int(start*48000):int(end*48000)]**2))
            baseline = rms(.1, .3)
            self.assertGreater(baseline, .005, "Original voice/audio must remain")
            self.assertGreater(rms(.52, .65), baseline*3, "Impact must start at speed-mapped 0.5s")
            self.assertGreater(rms(2.03, 2.15), baseline*5, "Trimmed uploaded cue must play at 2s")
            self.assertAlmostEqual(rms(2.6, 2.8), baseline, delta=.003)
            def frame(path, time):
                return np.frombuffer(run(["ffmpeg", "-v", "error", "-ss", str(time), "-i", path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]), dtype=np.uint8).astype(float)
            self.assertGreater(np.mean(np.abs(frame(result, .8)-frame(source, .8))), 3)
            self.assertLess(np.mean(np.abs(frame(result, 2.8)-frame(source, 2.8))), 2)

    def test_sound_only_on_a_silent_source(self):
        with tempfile.TemporaryDirectory() as temp:
            source, result = str(Path(temp)/"source.mp4"), str(Path(temp)/"result.mp4")
            run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=s=160x90:d=1:r=30", "-c:v", "libx264", "-threads", "1", "-an", "-y", source])
            render_motion_and_sound(source, result, sound_effects=[dict(builtIn=True, tone="chime", startTime=.2, duration=.5, volume=.4)])
            self.assertTrue(any(s["codec_type"] == "audio" for s in probe(result)["streams"]))
            pcm = np.frombuffer(run(["ffmpeg", "-v", "error", "-i", result, "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"]), dtype="<f4")
            self.assertLess(np.max(np.abs(pcm[:4800])), .001)
            self.assertGreater(np.max(np.abs(pcm[11000:20000])), .05)


if __name__ == "__main__":
    unittest.main()
