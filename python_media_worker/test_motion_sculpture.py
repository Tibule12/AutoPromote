import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from python_media_worker.motion_sculpture import (
    CPU_VIDEO_ENCODER,
    get_motion_sculpture_style,
    render_motion_sculpture,
    validate_rendered_media,
)


class MotionSculptureTests(unittest.TestCase):
    def make_source(self, path):
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=160x288:r=12:d=1.25",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=640:duration=1.25",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
                "-y",
                path,
            ],
            check=True,
        )

    def test_intensities_have_distinct_bounded_histories(self):
        clean = get_motion_sculpture_style("clean")
        bold = get_motion_sculpture_style("bold")
        unreal = get_motion_sculpture_style("unreal")

        self.assertLess(len(clean.delays), len(bold.delays))
        self.assertLess(len(bold.delays), len(unreal.delays))
        self.assertLess(clean.opacities[0], bold.opacities[0])
        self.assertLess(clean.glow_strength, bold.glow_strength)
        self.assertLess(clean.cinematic_strength, bold.cinematic_strength)
        self.assertLess(bold.cinematic_strength, unreal.cinematic_strength)
        self.assertGreater(unreal.background_blur, bold.background_blur)
        self.assertGreater(unreal.subject_polish, bold.subject_polish)
        self.assertEqual(unreal.echo_strength, 0.0)
        self.assertEqual(unreal.glow_strength, 0.0)
        self.assertEqual(unreal.edge_strength, 0.0)
        self.assertLessEqual(max(unreal.delays), 60)

    def test_unreal_render_is_h264_keeps_audio_and_uses_cpu_encoder(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = os.path.join(temp_dir, "source.mp4")
            output = os.path.join(temp_dir, "motion.mp4")
            self.make_source(source)

            class FakePersonSegmenter:
                model_selection = 1

                def __init__(self, **_kwargs):
                    pass

                def matte(self, frame, _previous_mask):
                    height, width = frame.shape[:2]
                    mask = np.zeros((height, width), dtype=np.uint8)
                    mask[height // 5 : height * 9 // 10, width // 4 : width * 3 // 4] = 255
                    return mask

                def close(self):
                    pass

            with patch(
                "python_media_worker.motion_sculpture.MediaPipePersonSegmenter",
                FakePersonSegmenter,
            ):
                receipt = render_motion_sculpture(
                    source,
                    output,
                    [
                        {
                            "preset": "motion_sculpture",
                            "intensity": "unreal",
                            "start_time": 0,
                            "end_time": 1.25,
                        }
                    ],
                    approved_tmp_dir=temp_dir,
                )
            validation = validate_rendered_media(output, expected_audio=True)

            self.assertEqual(CPU_VIDEO_ENCODER, "libx264")
            self.assertEqual(receipt["encoder"], "libx264")
            self.assertEqual(receipt["subject_pipeline"], "mediapipe_selfie_segmentation_cpu")
            self.assertEqual(
                receipt["visual_treatment"],
                "cinematic_environment_depth_real_subject",
            )
            self.assertEqual(receipt["face_preservation"], "source_pixels_subject_matte")
            self.assertEqual(validation["video"]["codec_name"], "h264")
            self.assertEqual(validation["audio"]["codec_name"], "aac")
            self.assertGreater(os.path.getsize(output), 1024)

    def test_rejects_paths_outside_the_approved_temp_directory(self):
        with tempfile.TemporaryDirectory() as approved_dir, tempfile.TemporaryDirectory() as other_dir:
            source = os.path.join(other_dir, "source.mp4")
            output = os.path.join(approved_dir, "motion.mp4")
            self.make_source(source)

            with self.assertRaisesRegex(ValueError, "approved tmp directory"):
                render_motion_sculpture(
                    source,
                    output,
                    [{"intensity": "clean", "start_time": 0, "end_time": 1}],
                    approved_tmp_dir=approved_dir,
                )

    def test_invalid_input_fails_without_creating_a_success_artifact(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = os.path.join(temp_dir, "broken.mp4")
            output = os.path.join(temp_dir, "motion.mp4")
            with open(source, "wb") as broken_file:
                broken_file.write(b"not a video")

            with self.assertRaisesRegex(RuntimeError, "could not decode"):
                render_motion_sculpture(
                    source,
                    output,
                    [{"intensity": "bold", "start_time": 0, "end_time": 1}],
                    approved_tmp_dir=temp_dir,
                )
            self.assertFalse(os.path.exists(output))


if __name__ == "__main__":
    unittest.main()
