"""Real PCM regression for envelopes deeper than FFmpeg's parser limit."""
import subprocess

import numpy as np
import pytest

from python_media_worker.studio_audio import build_volume_filter


@pytest.mark.parametrize('retimed', [False, True])
def test_dense_gain_envelope_preserves_every_sample_and_hold_in_real_pcm(retimed):
    keys = [{'time': i * .25, 'value': [25, 90, 40, 120][i % 4],
             'easing': 'hold' if i % 5 == 0 else 'ease_in_out'} for i in range(33)]
    plan = ([{'start_time': 0, 'end_time': 2, 'rate': 1},
             {'start_time': 2, 'end_time': 6, 'rate': 2},
             {'start_time': 6, 'end_time': 8, 'rate': .5}] if retimed else None)
    graph, points = build_volume_filter(keys, 8, speed_plan=plan)
    assert len(points) > 180
    result = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
        'aevalsrc=0.5:s=48000:d=8', '-af', graph, '-f', 'f32le', 'pipe:1'],
        capture_output=True, check=True)
    pcm = np.frombuffer(result.stdout, '<f4')
    assert len(pcm) == 8 * 48000
    # Check every curve segment, including values on either side of held jumps.
    for left, right in zip(points, points[1:]):
        time = (left['time'] + right['time']) / 2
        if time > 7.99:
            continue
        expected = left['value'] if right['easing'] == 'hold' else (left['value'] + right['value']) / 2
        assert abs(float(pcm[round(time * 48000)]) - .5 * expected) < .012
    for point in points[::5]:
        if point['time'] < 7.99:
            assert abs(float(pcm[round((point['time'] + .002) * 48000)]) - .5 * point['value']) < .018
