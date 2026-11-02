"""Real FFmpeg scene intervals retain the base before/after and exact last frame."""
import math
import subprocess

import numpy as np
import pytest

from python_media_worker.studio_rendered_scene import rendered_scene_block


@pytest.mark.parametrize("first,last", [(1, 2), (1 / 24, 25 / 24)])
def test_actual_overlay_obeys_half_open_programme_interval(first, last):
    block = rendered_scene_block(1, "base", "output", "proof", 64, 36, first, 1)
    graph = "[0:v]format=rgba[base];" + "".join(block).rstrip(";")
    result = subprocess.run(["ffmpeg", "-v", "error", "-filter_complex_threads", "1",
        "-f", "lavfi", "-i", "color=red:s=64x36:r=24:d=3",
        "-f", "lavfi", "-i", "color=blue:s=64x36:r=24:d=1",
        "-filter_complex", graph, "-map", "[output]", "-threads", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
        capture_output=True, check=True)
    frames = np.frombuffer(result.stdout, np.uint8).reshape(-1, 36, 64, 3)
    assert len(frames) == 72
    for index, frame in enumerate(frames):
        blue = first <= index / 24 < last
        assert frame[18, 32, 2 if blue else 0] > 240, (index, first, last)
        assert frame[18, 32, 0 if blue else 2] < 10


@pytest.mark.parametrize("start,duration", [(math.nan, 1), (0, math.inf), (-1, 1), (0, 0), (False, 1)])
def test_bad_placement_rejected_before_filter_execution(start, duration):
    with pytest.raises(ValueError):
        rendered_scene_block(1, "base", "out", "scene", 64, 36, start, duration)
