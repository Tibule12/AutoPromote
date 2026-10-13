"""Real frame identities expose ramp rounding drift; no GPU or retained scratch."""
import math
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pytest

from python_media_worker.viral_render_contract import (
    build_speed_filter_complex, normalize_speed_plan, map_timeline_time,
    speed_plan_output_duration,
)


def run(*args):
    return subprocess.check_output(['ffmpeg', '-v', 'error', '-threads', '1', *args])


@pytest.mark.parametrize('audio', [False, True])
def test_short_ramp_preserves_unchanged_frames_and_the_continuous_output_clock(audio):
    with tempfile.TemporaryDirectory(prefix='studio-ramp-clock-') as folder:
        source, output = [str(Path(folder) / name) for name in ['source.nut', 'output.nut']]
        args = ['-f', 'lavfi', '-i', 'nullsrc=s=16x16:r=24:d=3,geq=lum=N:cb=128:cr=128']
        if audio:
            args += ['-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=3']
        run(*args, '-c:v', 'ffv1', '-threads', '1', '-c:a', 'pcm_s16le', source)
        # Eight tiny ranges are short enough for independent CFR rounding to
        # extend the assembled video past its intended mapped clock.
        plan = normalize_speed_plan(3, [
            {'start_time': 1 + i / 8, 'end_time': 1 + (i + 1) / 8,
             'rate': 1 + (i + 1) / 16} for i in range(8)
        ])
        args = ['-i', source, '-filter_complex', build_speed_filter_complex(plan, audio, 24),
                '-map', '[v_speed]']
        if audio:
            args += ['-map', '[a_speed]']
        run(*args, '-c:v', 'ffv1', '-threads', '1', '-c:a', 'pcm_s16le', output)
        def pixels(file):
            return np.frombuffer(run('-i', file, '-map', '0:v:0', '-pix_fmt', 'yuv420p',
                                     '-f', 'rawvideo', '-'), np.uint8).reshape(-1, 16 * 16 * 3 // 2)
        before, after = pixels(source), pixels(output)
        np.testing.assert_array_equal(after[:24], before[:24],
            err_msg='A later ramp changed earlier unretimed source frames')
        source_ids = [int(frame[0]) for frame in after]
        # This reference derives expected identities from the numeric map,
        # independently of the generated FFmpeg expression and segment graph.
        output_ticks = [math.floor(map_timeline_time(plan, i / 24) * 90000 + .5) for i in range(72)]
        mapped_ticks = [(tick * 24 + 45000) // 90000 for tick in output_ticks]
        expected = [max(i for i, tick in enumerate(mapped_ticks) if tick <= out)
                    for out in range(len(after) - 1)]
        assert source_ids[:-1] == expected, 'Ramp boundaries accumulated source-picture drift'
        assert abs(len(after) / 24 - speed_plan_output_duration(plan)) <= 1 / 24


def test_sixty_fps_speedup_retains_every_source_picture_in_order():
    with tempfile.TemporaryDirectory(prefix='studio-speed60-') as folder:
        source = str(Path(folder) / 'source.nut')
        run('-f', 'lavfi', '-i', 'testsrc2=s=32x18:r=30:d=1',
            '-c:v', 'ffv1', '-threads', '1', source)
        original = run('-i', source, '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-')
        actual = run('-i', source, '-filter_complex',
            build_speed_filter_complex(normalize_speed_plan(1, preview_speed=2), False, 60),
            '-map', '[v_speed]', '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-')
        assert actual == original
