"""Worker half of the paired Studio start-trim timing fixture."""

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


FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "frontend/src/components/__tests__/fixtures/trim-linked-timing.json"
)


class StudioTrimTimingContractTests(unittest.TestCase):
    def test_trimmed_preview_caption_and_sound_times_match_worker_clock(self):
        fixture = json.loads(FIXTURE.read_text())
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

        worker_cues = validate_design(
            None,
            [
                {**source, "startTime": expected_cue["start_time"]}
                for source, expected_cue in zip(
                    fixture["snapshot"]["soundEffects"], expected["soundCues"]
                )
            ],
        )[1]
        self.assertEqual(len(worker_cues), len(expected["soundCues"]))
        for cue, worker_cue in zip(expected["soundCues"], worker_cues):
            with self.subTest(cue=cue["id"]):
                self.assertEqual(worker_cue["id"], cue["id"])
                self.assertEqual(worker_cue["startTime"], cue["start_time"])
                self.assertAlmostEqual(
                    map_timeline_time(plan, worker_cue["startTime"]),
                    cue["output_start"],
                    places=6,
                )
                self.assertAlmostEqual(
                    float(edit_clock(cue["output_start"], plan)),
                    cue["start_time"],
                    places=6,
                )


if __name__ == "__main__":
    unittest.main()
