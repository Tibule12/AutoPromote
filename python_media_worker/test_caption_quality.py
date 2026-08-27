import unittest

from python_media_worker.main_media_server import (
    annotate_caption_identity_segments,
    filter_caption_transcription_segments,
    generate_ass_captions,
    normalize_openai_diarized_transcription,
)


class CaptionQualityTests(unittest.TestCase):
    def test_story_pop_captions_include_speaker_scene_badge_and_word_animation(self):
        ass = generate_ass_captions(
            {
                "segments": [
                    {
                        "start": 0.0,
                        "end": 2.0,
                        "text": "kuFacebook bengiscrolla",
                        "speakerLabel": "Guest",
                        "words": [
                            {"word": "kuFacebook", "start": 0.0, "end": 1.0},
                            {"word": "bengiscrolla", "start": 1.0, "end": 2.0},
                        ],
                    }
                ]
            },
            "story_pop",
            960,
            540,
        )

        self.assertIn("GUEST · ONLINE DISCOVERY", ass)
        self.assertIn("Style: StoryLabel", ass)
        self.assertIn("\\fscx118", ass)
        self.assertIn("\\an7\\pos(72,", ass)

    def test_story_pop_respects_creator_placement_and_uses_story_accent(self):
        ass = generate_ass_captions(
            {
                "segments": [
                    {
                        "start": 0.0,
                        "end": 1.5,
                        "text": "I can do this",
                        "speakerLabel": "Guest",
                        "captionPlacement": "top_right",
                        "captionIcon": "payoff",
                        "words": [
                            {"word": "I", "start": 0.0, "end": 0.3},
                            {"word": "can", "start": 0.3, "end": 0.7},
                            {"word": "do", "start": 0.7, "end": 1.0},
                            {"word": "this", "start": 1.0, "end": 1.5},
                        ],
                    }
                ]
            },
            "story_pop",
            1920,
            1080,
        )

        self.assertIn("\\an9\\pos(1776,", ass)
        self.assertIn("TURNING POINT", ass)
        self.assertIn("&H0098F5A6", ass)

    def test_normalizes_diarized_segments_with_speaker_and_word_times(self):
        result = normalize_openai_diarized_transcription(
            {
                "text": "Molo. Ngiyaphila.",
                "duration": 4.0,
                "segments": [
                    {"id": "seg-1", "start": 0.0, "end": 1.5, "speaker": "A", "text": "Molo."},
                    {
                        "id": "seg-2",
                        "start": 1.5,
                        "end": 4.0,
                        "speaker": "B",
                        "text": "Ngiyaphila.",
                    },
                ],
            }
        )

        self.assertEqual(result["engine"], "openai-gpt-4o-transcribe-diarize")
        self.assertEqual([segment["speaker"] for segment in result["segments"]], ["A", "B"])
        self.assertEqual(result["segments"][0]["words"][0]["start"], 0.0)
        self.assertEqual(result["segments"][1]["words"][0]["end"], 4.0)

    def test_preserves_per_utterance_speaker_and_language_identity(self):
        segments = annotate_caption_identity_segments(
            [
                {
                    "start": 0.0,
                    "end": 2.0,
                    "text": "Kunjani, welcome back",
                    "speaker": "host",
                    "speaker_label": "Host",
                    "language": "mixed",
                    "languages": ["xh", "en"],
                    "language_confidence": 0.91,
                },
                {
                    "start": 2.0,
                    "end": 4.0,
                    "text": "Ngiyaphila",
                    "speaker": "guest",
                    "language": "zul",
                },
            ]
        )

        self.assertEqual(segments[0]["speaker"], "host")
        self.assertEqual(segments[0]["language"], "mixed")
        self.assertEqual(segments[0]["languages"], ["xh", "en"])
        self.assertTrue(segments[0]["reviewRequired"])
        self.assertTrue(segments[0]["textReviewRequired"])
        self.assertFalse(segments[0]["textReviewed"])
        self.assertEqual(segments[1]["speakerLabel"], "Speaker guest")
        self.assertEqual(segments[1]["language"], "zu")

    def test_marks_missing_speaker_and_language_for_review_instead_of_guessing(self):
        segments = annotate_caption_identity_segments(
            [{"start": 0.0, "end": 1.0, "text": "Unknown utterance"}],
            detected_language="sw",
        )

        self.assertEqual(segments[0]["speaker"], "unknown")
        self.assertEqual(segments[0]["language"], "und")
        self.assertTrue(segments[0]["reviewRequired"])

    def test_preserves_a_confident_code_switched_caption(self):
        result = filter_caption_transcription_segments(
            [
                {
                    "start": 0.4,
                    "end": 2.8,
                    "text": "Sawubona ekhaya, this story matters",
                    "avg_logprob": -0.2,
                    "no_speech_prob": 0.02,
                    "compression_ratio": 1.2,
                    "words": [
                        {"start": 0.4, "end": 0.9, "word": "Sawubona", "probability": 0.91},
                        {"start": 0.9, "end": 1.3, "word": "ekhaya", "probability": 0.88},
                        {"start": 1.3, "end": 1.6, "word": "this", "probability": 0.94},
                        {"start": 1.6, "end": 2.1, "word": "story", "probability": 0.93},
                        {"start": 2.1, "end": 2.8, "word": "matters", "probability": 0.9},
                    ],
                }
            ]
        )

        self.assertEqual(result["quality"]["status"], "ready")
        self.assertEqual(len(result["segments"]), 1)

    def test_rejects_repetition_and_collapsed_word_timestamps(self):
        result = filter_caption_transcription_segments(
            [
                {
                    "start": 5.88,
                    "end": 5.98,
                    "text": "that is the one that is the one that is the one",
                    "avg_logprob": -1.2,
                    "no_speech_prob": 0.08,
                    "compression_ratio": 3.1,
                    "words": [
                        {
                            "start": 5.98,
                            "end": 5.98,
                            "word": word,
                            "probability": 0.4,
                        }
                        for word in "that is the one that is the one that is the one".split()
                    ],
                }
            ]
        )

        self.assertEqual(result["segments"], [])
        self.assertEqual(result["quality"]["status"], "rejected")
        reasons = result["quality"]["rejections"][0]["reasons"]
        self.assertIn("repeated_phrase", reasons)
        self.assertIn("collapsed_timestamps", reasons)
        self.assertIn("impossible_word_rate", reasons)

    def test_rejects_dominant_low_confidence_placeholder_tokens(self):
        result = filter_caption_transcription_segments(
            [
                {
                    "start": 0.0,
                    "end": 5.42,
                    "text": "isiZulu isiZulu isiZulu isiZulu",
                    "words": [
                        {
                            "start": index * 0.4,
                            "end": (index + 1) * 0.4,
                            "word": "isiZulu",
                            "probability": 0.22,
                        }
                        for index in range(4)
                    ],
                }
            ]
        )

        self.assertEqual(result["segments"], [])
        reasons = result["quality"]["rejections"][0]["reasons"]
        self.assertIn("repeated_token", reasons)
        self.assertIn("low_word_confidence", reasons)


if __name__ == "__main__":
    unittest.main()
