import copy
import tempfile
import unittest
from pathlib import Path

from python_media_worker.multicam_chunking import (
    build_multicam_chunk_plan,
    multicam_chunk_checkpoint_paths,
    multicam_chunk_plan_fingerprint,
    partition_multicam_render_segments,
)


class MulticamChunkingTests(unittest.TestCase):
    def test_splits_44_minute_segment_into_300_second_chunks(self):
        segments = [
            {
                "timeline_start": 0.0,
                "timeline_end": 2640.0,
                "camera_id": "cam1",
                "source_start": 10.0,
                "source_end": 2650.0,
                "secondary_camera_id": "cam2",
                "secondary_source_start": 20.0,
                "secondary_source_end": 2660.0,
                "layout_mode": "pip",
            }
        ]

        chunks = partition_multicam_render_segments(segments, 300.0)

        self.assertEqual(len(chunks), 9)
        self.assertEqual([chunk["index"] for chunk in chunks], list(range(9)))
        self.assertEqual(chunks[0]["start"], 0.0)
        self.assertEqual(chunks[0]["end"], 300.0)
        self.assertEqual(chunks[-1]["start"], 2400.0)
        self.assertEqual(chunks[-1]["end"], 2640.0)
        self.assertEqual(chunks[-1]["duration"], 240.0)
        self.assertEqual(chunks[0]["segments"][0]["source_start"], 10.0)
        self.assertEqual(chunks[0]["segments"][0]["source_end"], 310.0)
        self.assertEqual(chunks[-1]["segments"][0]["secondary_source_start"], 2420.0)
        self.assertEqual(chunks[-1]["segments"][0]["secondary_source_end"], 2660.0)

    def test_does_not_drop_subframe_tail_after_exact_chunk_boundary(self):
        chunks = partition_multicam_render_segments(
            [
                {
                    "timeline_start": 0.0,
                    "timeline_end": 300.01,
                    "camera_id": "cam1",
                    "source_start": 7.25,
                    "source_end": 307.26,
                }
            ],
            300.0,
        )

        self.assertEqual(len(chunks), 2)
        self.assertEqual(chunks[-1]["end"], 300.01)
        self.assertAlmostEqual(sum(chunk["duration"] for chunk in chunks), 300.01)

    def test_default_split_preserves_proven_repaired_source_endpoints(self):
        chunks = partition_multicam_render_segments(
            [
                {
                    "timeline_start": 0.0,
                    "timeline_end": 600.0,
                    "camera_id": "cam1",
                    "source_start": 10.25,
                    "source_end": 610.25,
                    "secondary_camera_id": "cam2",
                    "secondary_source_start": 8.75,
                    "secondary_source_end": 608.75,
                }
            ],
            300.0,
        )

        self.assertEqual(chunks[0]["segments"][0]["source_start"], 10.25)
        self.assertEqual(chunks[0]["segments"][0]["source_end"], 310.25)
        self.assertEqual(chunks[1]["segments"][0]["source_start"], 310.25)
        self.assertEqual(chunks[1]["segments"][0]["source_end"], 610.25)
        self.assertEqual(chunks[0]["segments"][0]["secondary_source_start"], 8.75)
        self.assertEqual(chunks[1]["segments"][0]["secondary_source_end"], 608.75)

    def test_splits_multiple_boundary_crossing_segments_without_gaps_or_overlaps(self):
        segments = [
            {
                "timeline_start": 0.0,
                "timeline_end": 125.0,
                "camera_id": "cam1",
                "source_start": 1.0,
                "source_end": 126.0,
            },
            {
                "timeline_start": 125.0,
                "timeline_end": 425.0,
                "camera_id": "cam2",
                "source_start": 200.0,
                "source_end": 500.0,
                "secondary_camera_id": "cam1",
                "secondary_source_start": 150.0,
                "secondary_source_end": 450.0,
            },
            {
                "timeline_start": 425.0,
                "timeline_end": 610.0,
                "camera_id": "cam1",
                "source_start": 500.0,
                "source_end": 685.0,
            },
        ]

        chunks = partition_multicam_render_segments(segments, 200.0)

        self.assertEqual([(item["start"], item["end"]) for item in chunks], [
            (0.0, 200.0),
            (200.0, 400.0),
            (400.0, 600.0),
            (600.0, 610.0),
        ])
        self.assertEqual(
            [(item["timeline_start"], item["timeline_end"]) for item in chunks[0]["segments"]],
            [(0.0, 125.0), (125.0, 200.0)],
        )
        self.assertEqual(
            [(item["timeline_start"], item["timeline_end"]) for item in chunks[2]["segments"]],
            [(400.0, 425.0), (425.0, 600.0)],
        )

        self.assertEqual(chunks[0]["start"], segments[0]["timeline_start"])
        self.assertEqual(chunks[-1]["end"], segments[-1]["timeline_end"])
        for previous, current in zip(chunks, chunks[1:]):
            self.assertEqual(previous["end"], current["start"])
        for chunk in chunks:
            self.assertEqual(chunk["segments"][0]["timeline_start"], chunk["start"])
            self.assertEqual(chunk["segments"][-1]["timeline_end"], chunk["end"])
            for previous, current in zip(chunk["segments"], chunk["segments"][1:]):
                self.assertEqual(previous["timeline_end"], current["timeline_start"])

    def test_uses_resolver_for_primary_and_secondary_source_ranges(self):
        calls = []

        def resolver(camera_id, timeline_start, duration):
            calls.append((camera_id, timeline_start, duration))
            offset = 10.0 if camera_id == "cam1" else 20.0
            rate = 1.01 if camera_id == "cam1" else 0.99
            source_start = offset + (timeline_start * rate)
            return {"source_start": source_start, "source_end": source_start + (duration * rate)}

        chunks = partition_multicam_render_segments(
            [
                {
                    "timeline_start": 0.0,
                    "timeline_end": 450.0,
                    "camera_id": "cam1",
                    "source_start": -999.0,
                    "source_end": -998.0,
                    "secondary_camera_id": "cam2",
                    "secondary_source_start": -999.0,
                    "secondary_source_end": -998.0,
                }
            ],
            300.0,
            source_range_resolver=resolver,
        )

        self.assertEqual(calls, [
            ("cam1", 0.0, 300.0),
            ("cam2", 0.0, 300.0),
            ("cam1", 300.0, 150.0),
            ("cam2", 300.0, 150.0),
        ])
        first = chunks[0]["segments"][0]
        second = chunks[1]["segments"][0]
        self.assertAlmostEqual(first["source_start"], 10.0)
        self.assertAlmostEqual(first["source_end"], 313.0)
        self.assertAlmostEqual(first["secondary_source_start"], 20.0)
        self.assertAlmostEqual(first["secondary_source_end"], 317.0)
        self.assertAlmostEqual(second["source_start"], 313.0)
        self.assertAlmostEqual(second["source_end"], 464.5)

    def test_preserves_nested_layout_and_director_metadata_without_mutating_input(self):
        segment = {
            "timeline_start": 0.0,
            "timeline_end": 450.0,
            "duration": 450.0,
            "camera_id": "cam1",
            "source_start": 5.0,
            "source_end": 455.0,
            "layout_mode": "reaction",
            "layout_reason": "speaker_with_reaction",
            "audio_leader_camera_id": "cam1",
            "audio_decision_reliable": True,
            "director_receipt": {"scores": [0.8, 0.2], "reason": "clean_channel"},
            "layout_metadata": {"reaction_side": "right", "focus": {"x": 0.7}},
        }
        original = copy.deepcopy(segment)

        chunks = partition_multicam_render_segments([segment], 300.0)

        self.assertEqual(segment, original)
        for piece in [chunks[0]["segments"][0], chunks[1]["segments"][0]]:
            self.assertEqual(piece["layout_mode"], "reaction")
            self.assertEqual(piece["layout_reason"], "speaker_with_reaction")
            self.assertEqual(piece["audio_leader_camera_id"], "cam1")
            self.assertTrue(piece["audio_decision_reliable"])
            self.assertEqual(piece["director_receipt"], original["director_receipt"])
            self.assertEqual(piece["layout_metadata"], original["layout_metadata"])
            self.assertIsNot(piece["director_receipt"], segment["director_receipt"])
        self.assertEqual(chunks[0]["segments"][0]["duration"], 300.0)
        self.assertEqual(chunks[1]["segments"][0]["duration"], 150.0)

    def test_rejects_input_gaps_and_overlaps(self):
        base = {"camera_id": "cam1", "source_start": 0.0, "source_end": 10.0}
        for second_start, message in [(11.0, "gap"), (9.0, "overlap")]:
            with self.subTest(second_start=second_start):
                with self.assertRaisesRegex(ValueError, message):
                    partition_multicam_render_segments(
                        [
                            dict(base, timeline_start=0.0, timeline_end=10.0),
                            dict(base, timeline_start=second_start, timeline_end=20.0),
                        ],
                        5.0,
                    )

    def test_fingerprint_is_deterministic_and_changes_with_plan(self):
        segments = [
            {
                "timeline_start": 0.0,
                "timeline_end": 610.0,
                "camera_id": "cam1",
                "source_start": 3.0,
                "source_end": 613.0,
                "layout_mode": "cut",
            }
        ]
        first = build_multicam_chunk_plan(segments, 300.0)
        reordered = [
            {
                "layout_mode": "cut",
                "source_end": 613.0,
                "camera_id": "cam1",
                "timeline_end": 610.0,
                "source_start": 3.0,
                "timeline_start": 0.0,
            }
        ]
        second = build_multicam_chunk_plan(reordered, 300.0)

        self.assertEqual(first["fingerprint"], second["fingerprint"])
        self.assertEqual(first["fingerprint"], multicam_chunk_plan_fingerprint(first["chunks"]))
        self.assertRegex(first["fingerprint"], r"^[0-9a-f]{64}$")

        changed = copy.deepcopy(first["chunks"])
        changed[0]["segments"][0]["layout_mode"] = "pip"
        self.assertNotEqual(first["fingerprint"], multicam_chunk_plan_fingerprint(changed))

    def test_checkpoint_paths_are_deterministic_and_do_not_touch_disk(self):
        fingerprint = multicam_chunk_plan_fingerprint([])
        with tempfile.TemporaryDirectory() as temp_root:
            first = multicam_chunk_checkpoint_paths(temp_root, "job/episode 2", fingerprint, 3)
            second = multicam_chunk_checkpoint_paths(temp_root, "job/episode 2", fingerprint, 3)
            other = multicam_chunk_checkpoint_paths(temp_root, "job/episode 2", fingerprint, 4)

            self.assertEqual(first, second)
            self.assertNotEqual(first["video_path"], other["video_path"])
            self.assertTrue(first["video_path"].endswith("chunk_0003.mp4"))
            self.assertTrue(first["checkpoint_path"].endswith("chunk_0003.checkpoint.json"))
            self.assertFalse(Path(first["directory"]).exists())


if __name__ == "__main__":
    unittest.main()
