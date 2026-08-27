import unittest

from python_media_worker.viral_studio_plan import (
    build_studio_edit_plan,
    validate_studio_edit_plan,
)


class ViralStudioPlanTests(unittest.TestCase):
    def test_code_switched_speech_requires_review_and_never_forces_translation(self):
        plan = build_studio_edit_plan(
            {
                "id": "clip-1",
                "start": 2,
                "end": 18,
                "contentType": "podcast_interview",
                "hasAudio": True,
                "transcriptConfidence": 0.54,
                "scoreConfidence": 63,
                "source": "scene_detect",
            },
            transcript_quality={"speechEvidenceThreshold": 0.62},
        )
        self.assertEqual(plan["caption_policy"]["mode"], "review_required")
        self.assertTrue(plan["caption_policy"]["preserve_code_switching"])
        self.assertEqual(plan["caption_policy"]["translation"], "creator_opt_in_only")
        self.assertEqual(plan["classification"]["content_family"], "talk_story")

    def test_non_speech_content_gets_visual_strategy_without_fake_captions(self):
        plan = build_studio_edit_plan(
            {
                "id": "clip-2",
                "start": 0,
                "end": 15,
                "contentType": "music_performance",
                "hasAudio": False,
                "motionScore": 0.8,
            }
        )
        self.assertEqual(plan["caption_policy"]["mode"], "off")
        self.assertEqual(
            plan["visual_policy"]["strategy"],
            "performance_preservation_and_rhythm",
        )
        self.assertTrue(validate_studio_edit_plan(plan)["valid"])

    def test_podcast_conversation_uses_talk_story_and_suppresses_untrusted_hook(self):
        plan = build_studio_edit_plan(
            {
                "id": "clip-3",
                "start": 10,
                "end": 20,
                "contentType": "podcast_conversation",
                "hasAudio": True,
                "transcriptConfidence": 0.2,
                "hookText": "CATCH THIS STUNNING VISUAL MOMENT",
            }
        )
        self.assertEqual(plan["classification"]["content_family"], "talk_story")
        self.assertFalse(any(edit["kind"] == "hook" for edit in plan["proposed_edits"]))


if __name__ == "__main__":
    unittest.main()
