"""Worker half of the paired Studio start- and end-trim timing fixtures."""

import json
from pathlib import Path
import unittest

from python_media_worker.viral_motion_graphics import edit_clock, validate_design
from python_media_worker.viral_render_contract import (
    build_edited_caption_transcript,
    map_timeline_time,
    normalize_speed_plan,
    remap_caption_transcript_to_speed_plan,
    speed_plan_output_duration,
)


FIXTURE_DIR = (
    Path(__file__).resolve().parents[1]
    / "frontend/src/components/__tests__/fixtures"
)


class StudioTrimTimingContractTests(unittest.TestCase):
    def test_trimmed_preview_caption_and_sound_times_match_worker_clock(self):
        fixture = json.loads((FIXTURE_DIR / "trim-linked-timing.json").read_text())
        self.assert_worker_timing(fixture)

    def test_end_trimmed_later_captions_and_sound_times_match_worker_clock(self):
        fixture = json.loads((FIXTURE_DIR / "trim-end-linked-timing.json").read_text())
        self.assertEqual(
            [cue["id"] for cue in fixture["expected"]["soundCues"]],
            ["a-cue", "boundary-cue", "b-cue"],
        )
        self.assertEqual(
            [caption["id"] for caption in fixture["expected"]["captions"]],
            [
                "a-caption-timeline-1",
                "boundary-caption-timeline-1",
                "b-caption-timeline-2",
            ],
        )
        self.assertEqual(
            [key["id"] for key in fixture["expected"]["speedKeys"]],
            ["initial-speed", "first-speed", "same-speed", "second-speed", "end-speed"],
        )
        self.assert_worker_timing(fixture)

    def assert_worker_timing(self, fixture):
        expected = fixture["expected"]
        plan = normalize_speed_plan(
            expected["programmeDuration"], expected["renderSpeedSegments"]
        )
        self.assertEqual(plan, expected["renderSpeedSegments"])
        self.assertAlmostEqual(
            speed_plan_output_duration(plan), expected["outputDuration"], places=6
        )

        reviewed = build_edited_caption_transcript(expected["captions"])
        rendered_captions = remap_caption_transcript_to_speed_plan(reviewed, plan)[
            "segments"
        ]
        self.assertEqual(len(rendered_captions), len(expected["captions"]))
        for caption, rendered in zip(expected["captions"], rendered_captions):
            with self.subTest(caption=caption["id"]):
                self.assertEqual(rendered["id"], caption["id"])
                self.assertAlmostEqual(rendered["start"], caption["output_start"], places=6)
                self.assertAlmostEqual(rendered["end"], caption["output_end"], places=6)
                self.assertAlmostEqual(
                    float(edit_clock(caption["output_start"], plan)),
                    caption["start_time"],
                    places=6,
                )

        source_cues = {cue["id"]: cue for cue in fixture["snapshot"]["soundEffects"]}
        worker_cues = validate_design(
            None,
            [
                {
                    **source_cues[cue["id"]],
                    "startTime": cue["start_time"],
                    "duration": cue.get("duration", source_cues[cue["id"]]["duration"]),
                }
                for cue in expected["soundCues"]
            ],
        )[1]
        self.assertEqual(len(worker_cues), len(expected["soundCues"]))
        for cue, worker_cue in zip(expected["soundCues"], worker_cues):
            with self.subTest(cue=cue["id"]):
                self.assertEqual(worker_cue["id"], cue["id"])
                self.assertEqual(worker_cue["startTime"], cue["start_time"])
                if "duration" in cue:
                    self.assertEqual(worker_cue["duration"], cue["duration"])
                self.assertAlmostEqual(
                    map_timeline_time(plan, worker_cue["startTime"]),
                    cue["output_start"],
                    places=6,
                )
                if "output_end" in cue:
                    self.assertAlmostEqual(
                        map_timeline_time(
                            plan, worker_cue["startTime"] + worker_cue["duration"]
                        ),
                        cue["output_end"],
                        places=6,
                    )
                self.assertAlmostEqual(
                    float(edit_clock(cue["output_start"], plan)),
                    cue["start_time"],
                    places=6,
                )


if __name__ == "__main__":
    unittest.main()
