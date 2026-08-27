import base64
import json
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from python_media_worker.content_aware_reality import (
    SceneUnderstandingError,
    build_grounded_scene_brief,
    build_reality_captions,
    generate_environment_image,
    generate_story_images,
    relevant_transcript,
    recover_transient_subject_matte,
    render_content_aware_reality,
    search_story_video_candidates,
    validate_scene_brief,
)
from python_media_worker.motion_sculpture import validate_rendered_media


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class ContentAwareRealityTests(unittest.TestCase):
    transcript = [
        {"start": 0.0, "end": 4.0, "text": "Uqale kanjani ukucula"},
        {"start": 4.0, "end": 8.0, "text": "mina ebengiva kakhulu egazini"},
        {"start": 8.0, "end": 12.0, "text": "abafowethu nodadewethu"},
    ]

    def test_reuses_verified_matte_for_only_a_bounded_transient_miss(self):
        frame = np.zeros((12, 8, 3), dtype=np.uint8)
        previous = np.full((12, 8), 255, dtype=np.uint8)

        class MissingSegmenter:
            def matte(self, _frame, _previous):
                raise RuntimeError("No human subject was detected in the current frame")

        recovered, miss_count, used_previous = recover_transient_subject_matte(
            MissingSegmenter(),
            frame,
            previous,
            0,
            max_consecutive_misses=1,
        )

        self.assertTrue(used_previous)
        self.assertEqual(miss_count, 1)
        np.testing.assert_array_equal(recovered, previous)
        with self.assertRaisesRegex(RuntimeError, "No human subject"):
            recover_transient_subject_matte(
                MissingSegmenter(),
                frame,
                previous,
                miss_count,
                max_consecutive_misses=1,
            )

    def make_source(self, path, duration=1.0):
        subprocess.run(
            [
                "ffmpeg", "-v", "error",
                "-f", "lavfi", "-i", f"testsrc2=s=320x180:r=12:d={duration}",
                "-f", "lavfi", "-i", f"sine=frequency=620:duration={duration}",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
                "-shortest", "-y", path,
            ],
            check=True,
        )

    def test_selects_only_timestamp_relevant_transcript_with_context(self):
        selected = relevant_transcript(self.transcript, 5.0, 6.0, context_seconds=0.5)
        self.assertEqual([item["text"] for item in selected], [self.transcript[1]["text"]])

    def test_keeps_code_switching_identity_metadata_for_story_direction(self):
        selected = relevant_transcript(
            [
                {
                    "start": 2.0,
                    "end": 5.0,
                    "text": "Ndiyabona, this matters kakhulu",
                    "speaker": "host",
                    "speakerLabel": "Host",
                    "language": "mixed",
                    "languages": ["xh", "en", "zu"],
                    "reviewRequired": False,
                }
            ],
            2.0,
            5.0,
        )
        self.assertEqual(selected[0]["speakerLabel"], "Host")
        self.assertEqual(selected[0]["languages"], ["xh", "en", "zu"])
        self.assertEqual(selected[0]["text"], "Ndiyabona, this matters kakhulu")

    def test_rejects_low_confidence_or_hallucinated_evidence(self):
        base = {
            "meaning": "Umculi uchaza isipho sokucula esizwakala sisegazini.",
            "visual_metaphor": "Isihlahla esakhiwe amagagasi omsindo.",
            "environment_prompt": "Photoreal cinematic soundstage " * 8,
            "evidence": [{"timestamp": 5, "quote": "kakhulu egazini", "supports": "isipho sisegazini"}],
        }
        with self.assertRaisesRegex(SceneUnderstandingError, "confidence"):
            validate_scene_brief({**base, "confidence": 0.4}, self.transcript)
        with self.assertRaisesRegex(SceneUnderstandingError, "literal transcript evidence"):
            validate_scene_brief(
                {
                    **base,
                    "confidence": 0.9,
                    "evidence": [{"timestamp": 5, "quote": "won a Grammy", "supports": "success"}],
                },
                self.transcript,
            )

    def test_director_brief_keeps_literal_evidence_and_uncertainty(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = os.path.join(temp_dir, "source.mp4")
            self.make_source(source)
            planned = {
                "meaning": "Umculi uxhumanisa ikhono lokucula nento ayizwa isegazini.",
                "confidence": 0.91,
                "evidence": [
                    {"timestamp": 5.1, "quote": "kakhulu egazini", "supports": "ikhono lisegazini"}
                ],
                "uncertainties": ["The person's name is unclear"],
                "visual_metaphor": "A branching family tree made from sound waves.",
                "story_beats": [
                    {
                        "start": 4.0,
                        "end": 8.0,
                        "kind": "metaphor",
                        "exact_quote": "kakhulu egazini",
                        "visual": "A bloodline helix grows into musical branches.",
                    }
                ],
                "integration_surface": {
                    "type": "studio display",
                    "reason": "The display is a real planar surface away from the guest.",
                    "confidence": 0.94,
                    "polygon": [[0.03, 0.08], [0.42, 0.15], [0.41, 0.78], [0.03, 0.78]],
                },
                "environment_prompt": (
                    "Premium photoreal 16:9 cinematic environment with a family tree built from sound waves, "
                    "quiet space for the real source subject, no people, no faces, no text, no logos, no UI."
                ),
            }

            def fake_post(*_args, **_kwargs):
                return FakeResponse(
                    {"choices": [{"message": {"content": json.dumps(planned)}}]}
                )

            brief = build_grounded_scene_brief(
                source,
                self.transcript,
                4.5,
                7.0,
                api_key="test-key",
                request_post=fake_post,
            )
            self.assertEqual(brief["confidence"], 0.91)
            self.assertEqual(brief["evidence"][0]["quote"], "kakhulu egazini")
            self.assertEqual(brief["uncertainties"], ["The person's name is unclear"])
            self.assertEqual(brief["integration_surface"]["type"], "studio display")
            self.assertEqual(brief["story_beats"][0]["exact_quote"], "kakhulu egazini")

    def test_builds_short_literal_code_switched_caption_beats(self):
        segments = [
            {
                "words": [
                    {"start": 34.2, "end": 34.6, "word": "mina", "probability": 0.9},
                    {"start": 34.6, "end": 35.2, "word": "ebengiva", "probability": 0.9},
                    {"start": 35.2, "end": 35.7, "word": "kakhulu", "probability": 0.9},
                    {"start": 35.7, "end": 36.2, "word": "today", "probability": 0.9},
                ]
            }
        ]
        captions = build_reality_captions(segments, 34.0, 40.0, 0.0)
        self.assertEqual(captions[0]["text"], "mina ebengiva kakhulu today")
        self.assertAlmostEqual(captions[0]["start"], 0.2)

    def test_generates_decodable_environment_inside_approved_tmp(self):
        image = np.zeros((96, 160, 3), dtype=np.uint8)
        image[:, :80] = (20, 130, 245)
        ok, encoded = cv2.imencode(".png", image)
        self.assertTrue(ok)

        def fake_post(*_args, **_kwargs):
            return FakeResponse(
                {"data": [{"b64_json": base64.b64encode(encoded.tobytes()).decode("ascii")}]}
            )

        with tempfile.TemporaryDirectory() as temp_dir:
            output = os.path.join(temp_dir, "environment.png")
            receipt = generate_environment_image(
                {"environment_prompt": "A grounded cinematic environment"},
                output,
                approved_tmp_dir=temp_dir,
                api_key="test-key",
                request_post=fake_post,
            )
            self.assertGreater(receipt["size"], 100)
            self.assertIsNotNone(cv2.imread(output))

    def test_generates_one_asset_per_grounded_story_beat(self):
        image = np.full((96, 160, 3), (18, 44, 92), dtype=np.uint8)
        ok, encoded = cv2.imencode(".png", image)
        self.assertTrue(ok)

        def fake_post(*_args, **_kwargs):
            return FakeResponse(
                {"data": [{"b64_json": base64.b64encode(encoded.tobytes()).decode("ascii")}]}
            )

        brief = {
            "environment_prompt": "Premium in-scene visual plate with no people or text.",
            "story_beats": [
                {"start": 1, "end": 2, "kind": "location", "exact_quote": "eDurban", "visual": "Durban coast"},
                {"start": 2, "end": 3, "kind": "object", "exact_quote": "Facebook", "visual": "scrolling glass panels"},
            ],
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            receipts = generate_story_images(
                brief,
                os.path.join(temp_dir, "story"),
                approved_tmp_dir=temp_dir,
                api_key="test-key",
                request_post=fake_post,
            )
            self.assertEqual(len(receipts), 2)
            self.assertTrue(all(os.path.exists(item["path"]) for item in receipts))

    def test_returns_previewable_licensed_candidates_for_reviewed_story_evidence(self):
        payload = {
            "videos": [
                {
                    "id": 6279142,
                    "duration": 14.4,
                    "url": "https://www.pexels.com/video/hands-using-smartphone-close-up-6279142/",
                    "image": "https://images.pexels.com/videos/6279142/free-video-6279142.jpg",
                    "user": {"name": "Artem Podrez"},
                    "video_files": [
                        {
                            "width": 1920,
                            "height": 1080,
                            "link": "https://videos.pexels.com/video-files/6279142/6279142-hd.mp4",
                        },
                        {
                            "width": 720,
                            "height": 1280,
                            "link": "https://videos.pexels.com/video-files/6279142/6279142-vertical.mp4",
                        },
                    ],
                }
            ]
        }

        with patch.dict(os.environ, {"PEXELS_API_KEY": "test-key"}):
            plan = search_story_video_candidates(
                [
                    {
                        "id": "phone-beat",
                        "search_query": "hands scrolling smartphone social feed",
                        "evidence_quote": "kuFacebook, bengiscrolla",
                    }
                ],
                request_get=lambda *_args, **_kwargs: FakeResponse(payload),
            )

        self.assertEqual(plan[0]["status"], "candidates_ready")
        self.assertEqual(plan[0]["evidence_quote"], "kuFacebook, bengiscrolla")
        self.assertEqual(plan[0]["candidates"][0]["provider"], "pexels")
        self.assertEqual(plan[0]["candidates"][0]["width"], 1920)

    def test_blocks_licensed_search_when_caption_evidence_needs_review(self):
        with patch.dict(os.environ, {"PEXELS_API_KEY": "test-key"}):
            plan = search_story_video_candidates(
                [
                    {
                        "id": "uncertain-beat",
                        "search_query": "choir singing",
                        "evidence_quote": "uncertain words",
                        "review_required": True,
                    }
                ],
                request_get=lambda *_args, **_kwargs: self.fail("Search must not run"),
            )

        self.assertEqual(plan[0]["status"], "blocked_by_transcript_review")
        self.assertEqual(plan[0]["candidates"], [])

    def test_subject_preserving_render_keeps_audio_and_h264(self):
        class FakePersonSegmenter:
            model_selection = 1

            def __init__(self, **_kwargs):
                pass

            def matte(self, frame, _previous):
                height, width = frame.shape[:2]
                mask = np.zeros((height, width), dtype=np.uint8)
                cv2.ellipse(
                    mask,
                    (width * 2 // 3, height // 2),
                    (width // 7, height * 2 // 5),
                    0,
                    0,
                    360,
                    255,
                    -1,
                )
                return mask

            def close(self):
                pass

        with tempfile.TemporaryDirectory() as temp_dir:
            source = os.path.join(temp_dir, "source.mp4")
            environment = os.path.join(temp_dir, "environment.png")
            moving_story = os.path.join(temp_dir, "moving-story.mp4")
            output = os.path.join(temp_dir, "reality.mp4")
            self.make_source(source)
            self.make_source(moving_story)
            plate = np.full((180, 320, 3), (120, 25, 8), dtype=np.uint8)
            cv2.imwrite(environment, plate)
            with patch(
                "python_media_worker.content_aware_reality.MediaPipePersonSegmenter",
                FakePersonSegmenter,
            ):
                receipt = render_content_aware_reality(
                    source,
                    output,
                    environment,
                    {
                        "start_time": 0,
                        "end_time": 1,
                        "story_assets": [
                            {"path": moving_story, "start": 0, "end": 1}
                        ],
                    },
                    approved_tmp_dir=temp_dir,
                )
            validation = validate_rendered_media(output, expected_audio=True)
            self.assertEqual(receipt["composition"], "tracked_story_portal_inside_original_scene")
            self.assertTrue(receipt["source_people_preserved"])
            self.assertIn("non_generative", receipt["source_polish"])
            self.assertEqual(
                receipt["story_motion"],
                "grounded_moving_video_monitor",
            )
            self.assertEqual(validation["video"]["codec_name"], "h264")
            self.assertEqual(validation["audio"]["codec_name"], "aac")


if __name__ == "__main__":
    unittest.main()
