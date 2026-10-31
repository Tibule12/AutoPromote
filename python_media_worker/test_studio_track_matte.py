"""FFmpeg pixel-level tests for Studio Alpha and Luma Track Mattes."""
import subprocess
import unittest

import numpy as np

from python_media_worker.studio_composition import (
    connect_grouped_layer_blocks,
    validate_layer_order,
    validate_track_mattes,
)


def decode_filtergraph(graph, width=32, height=32, frames=2):
    cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-filter_threads",
        "1",
        "-filter_complex",
        graph,
        "-map",
        "[out]",
        "-frames:v",
        str(frames),
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=20)
    if result.returncode != 0:
        raise AssertionError(result.stderr.decode("utf-8", errors="replace")[-3000:])
    return np.frombuffer(result.stdout, dtype=np.uint8).reshape(frames, height, width, 3)


class StudioTrackMatteTests(unittest.TestCase):
    def test_validation_rejects_invalid_and_chained_track_mattes(self):
        for bad_plan in [
            {"layers": [{"id": "fill", "track_matte": {"mode": "alpha", "source_layer_id": "matte"}}]},
            {"order": ["fill", "matte"], "layers": [{"id": "fill", "track_matte": {"mode": "bogus", "source_layer_id": "matte"}}, {"id": "matte"}]},
            {"order": ["fill"], "layers": [{"id": "fill", "track_matte": {"mode": "alpha", "source_layer_id": "fill"}}]},
            {"order": ["fill"], "layers": [{"id": "fill", "track_matte": {"mode": "alpha", "source_layer_id": "missing"}}]},
            {
                "order": ["a", "b", "c"],
                "layers": [
                    {"id": "a", "track_matte": {"mode": "alpha", "source_layer_id": "b"}},
                    {"id": "b", "track_matte": {"mode": "luma", "source_layer_id": "c"}},
                    {"id": "c"},
                ],
            },
        ]:
            with self.assertRaises(ValueError):
                if "order" in bad_plan:
                    validate_layer_order(bad_plan, bad_plan["order"], [], [])
                else:
                    validate_layer_order(bad_plan, ["fill", "matte"], [], [])

        active, _ = validate_track_mattes(
            {
                "order": ["matte", "fill"],
                "layers": [
                    {"id": "matte", "type": "text"},
                    {"id": "fill", "type": "image", "track_matte": {"mode": "alpha", "source_layer_id": "matte"}},
                ],
            },
            ["matte", "fill"],
        )
        self.assertEqual(active, {"fill": {"mode": "alpha", "source_layer_id": "matte"}})

    def test_alpha_and_alpha_inverted_track_matte_pixels_and_hidden_matte_source(self):
        # Base is dark blue (0, 0, 80). Matte is green 12x12 box at (10, 10) — MUST be hidden unless keep_matte_visible!
        # Fill is full-frame red (220, 20, 40).
        sources = (
            "color=c=0x000050:s=32x32:r=10:d=0.3,format=rgba[base];"
            "color=c=0x00ff00:s=12x12:r=10:d=0.3,format=rgba[m_src];"
            "color=c=0xdc1428:s=32x32:r=10:d=0.3,format=rgba[f_src];"
        )
        blocks = [
            ("matte", ["[in0][m_src]overlay=10:10:format=auto[out0];"], "in0", "out0"),
            ("fill", ["[in1][f_src]overlay=0:0:format=auto[out1];"], "in1", "out1"),
        ]

        # 1. Alpha matte: red inside (10..21, 10..21), base blue outside, zero green leaked!
        plan_alpha = {
            "order": ["matte", "fill"],
            "layers": [
                {"id": "matte", "type": "image"},
                {"id": "fill", "type": "image", "track_matte": {"mode": "alpha", "source_layer_id": "matte"}},
            ],
        }
        filters, out = connect_grouped_layer_blocks(blocks, "base", ["matte", "fill"], plan_alpha, 32, 32, 0.3, frame_rate=10)
        frames = decode_filtergraph(sources + "".join(filters) + f"[{out}]null[out];")
        inside = frames[0, 15, 15]
        outside = frames[0, 3, 3]
        self.assertGreater(int(inside[0]), 200)
        self.assertLess(int(inside[1]), 30)  # Matte green did NOT leak
        self.assertLess(int(outside[0]), 10)
        self.assertGreater(int(outside[2]), 70)

        # 2. Alpha Inverted matte: base blue inside (10..21, 10..21), red outside!
        plan_inv = {
            "order": ["matte", "fill"],
            "layers": [
                {"id": "matte", "type": "image"},
                {"id": "fill", "type": "image", "track_matte": {"mode": "alpha_inverted", "source_layer_id": "matte"}},
            ],
        }
        filters_inv, out_inv = connect_grouped_layer_blocks(blocks, "base", ["matte", "fill"], plan_inv, 32, 32, 0.3, frame_rate=10)
        frames_inv = decode_filtergraph(sources + "".join(filters_inv) + f"[{out_inv}]null[out];")
        self.assertLess(int(frames_inv[0, 15, 15][0]), 10)
        self.assertGreater(int(frames_inv[0, 15, 15][2]), 70)
        self.assertGreater(int(frames_inv[0, 3, 3][0]), 200)

    def test_luma_and_luma_inverted_track_matte_and_shared_matte_fanout(self):
        # Matte has white left half (x=0..15) and black right half (x=16..31), both opaque!
        # Alpha would pass both halves, whereas Luma passes ONLY the white half!
        sources = (
            "color=c=0x000000:s=32x32:r=10:d=0.3,format=rgba[base];"
            "color=c=0x000000:s=32x32:r=10:d=0.3,drawbox=x=0:y=0:w=16:h=32:color=white:t=fill,format=rgba[m_src];"
            "color=c=0x00c8ff:s=32x16:r=10:d=0.3,format=rgba[f1_src];"
            "color=c=0xffaa00:s=32x16:r=10:d=0.3,format=rgba[f2_src];"
        )
        blocks = [
            ("matte", ["[in0][m_src]overlay=0:0:format=auto[out0];"], "in0", "out0"),
            ("top_fill", ["[in1][f1_src]overlay=0:0:format=auto[out1];"], "in1", "out1"),
            ("bot_fill", ["[in2][f2_src]overlay=0:16:format=auto[out2];"], "in2", "out2"),
        ]
        # Share the SAME matte source across TWO fill layers (top = luma, bottom = luma_inverted)
        plan = {
            "order": ["matte", "top_fill", "bot_fill"],
            "layers": [
                {"id": "matte", "type": "image"},
                {"id": "top_fill", "type": "image", "track_matte": {"mode": "luma", "source_layer_id": "matte"}},
                {"id": "bot_fill", "type": "image", "track_matte": {"mode": "luma_inverted", "source_layer_id": "matte"}},
            ],
        }
        filters, out = connect_grouped_layer_blocks(blocks, "base", ["matte", "top_fill", "bot_fill"], plan, 32, 32, 0.3, frame_rate=10)
        frames = decode_filtergraph(sources + "".join(filters) + f"[{out}]null[out];")
        # Top-left (y=8, x=6): cyan visible via luma
        self.assertGreater(int(frames[0, 8, 6][2]), 220)
        # Top-right (y=8, x=24): black via luma
        self.assertLess(int(frames[0, 8, 24][2]), 10)
        # Bottom-left (y=24, x=6): black via luma_inverted
        self.assertLess(int(frames[0, 24, 6][0]), 10)
        # Bottom-right (y=24, x=24): orange visible via luma_inverted
        self.assertGreater(int(frames[0, 24, 24][0]), 220)


if __name__ == "__main__":
    unittest.main()
