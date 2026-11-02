"""Actual retained-ramp clock: a fractional cut tail must survive CFR delivery."""
import json
import subprocess
from pathlib import Path

import pytest

from python_media_worker.main_media_server import build_studio_sequence_video_filters
from python_media_worker.viral_render_contract import (
    build_delivery_video_clock_filter, build_speed_filter_complex,
    speed_plan_output_duration,
)

# Numeric plan from the ordinary Pacing / split / trim regression. No private
# media, project identity, network source or alternate clock implementation.
RANGES = [(0, 0.11875555555555556, 1),
 (0.11875555555555556, 0.23751111111111112, 1.0001),
 (0.23751111111111112, 0.3562777777777778, 1.0004),
 (0.3562777777777778, 0.4750333333333333, 1.0011),
 (0.4750333333333333, 0.5937888888888889, 1.0024),
 (0.5937888888888889, 0.7125555555555556, 1.0044),
 (0.7125555555555556, 0.8313111111111111, 1.0072),
 (0.8313111111111111, 0.9500666666666666, 1.011),
 (0.9500666666666666, 1.0688333333333333, 1.0161),
 (1.0688333333333333, 1.1875888888888888, 1.0224),
 (1.1875888888888888, 1.3063444444444445, 1.0303),
 (1.3063444444444445, 1.4251111111111112, 1.0398),
 (1.4251111111111112, 1.5438666666666667, 1.0511),
 (1.5438666666666667, 1.6626222222222222, 1.0644),
 (1.6626222222222222, 1.781388888888889, 1.0798),
 (1.781388888888889, 1.9001444444444444, 1.0975),
 (1.9001444444444444, 2.018911111111111, 1.1176),
 (2.018911111111111, 2.0189222222222223, 1.1286),
 (2.0189222222222223, 2.140022222222222, 1.0781),
 (2.140022222222222, 2.2611333333333334, 0.8763),
 (2.2611333333333334, 2.3822444444444444, 0.728),
 (2.3822444444444444, 2.5033555555555553, 0.6249),
 (2.5033555555555553, 2.6244666666666667, 0.5588),
 (2.6244666666666667, 2.7455777777777777, 0.5214),
 (2.7455777777777777, 2.866688888888889, 0.5046),
 (2.866688888888889, 2.9878, 0.5002),
 (2.9878, 7.006488888888889, 0.5)]


@pytest.mark.parametrize('source_fps,delivery_fps', [(30, 24), (24, 24), (30, 60)])
def test_fractional_retained_tail_has_every_delivery_frame(tmp_path, source_fps, delivery_fps):
    source, assembled, speed, final = [tmp_path / p for p in ['source.nut', 'assembled.nut', 'speed.nut', 'final.mp4']]
    plan = [dict(start_time=start, end_time=end, rate=rate) for start, end, rate in RANGES]
    duration = speed_plan_output_duration(plan)
    def run(*args):
        return subprocess.check_output(['ffmpeg', '-v', 'error', '-nostdin', *map(str, args)], timeout=20)
    run('-f', 'lavfi', '-i', f'nullsrc=s=32x18:r={source_fps}:d=8,geq=lum=mod(N\\,220):cb=128:cr=128',
        '-c:v', 'ffv1', '-threads', 1, source)
    cuts = [(0, 2.0189222222222223), (5.012433333333333, 8), (0, 2)]
    segments = []
    for i, (start, end) in enumerate(cuts):
        segment = tmp_path / f'segment-{i}.mp4'
        filters = build_studio_sequence_video_filters('setsar=1', delivery_fps)
        run('-ss', start, '-i', source, '-t', end-start, '-vf', ','.join(filters),
            '-c:v', 'libx264', '-crf', 0, '-threads', 1, segment)
        segments.append(segment)
    listing = tmp_path / 'sequence.txt'
    listing.write_text(''.join(f"file '{p}'\n" for p in segments))
    run('-f', 'concat', '-safe', 0, '-i', listing, '-c:v', 'ffv1', '-threads', 1, assembled)
    run('-i', assembled, '-filter_complex', build_speed_filter_complex(plan, False, delivery_fps),
        '-map', '[v_speed]', '-c:v', 'ffv1', '-threads', 1, speed)
    run('-i', speed, '-vf', build_delivery_video_clock_filter(delivery_fps, duration, delivery_fps),
        '-t', f'{duration:.9f}', '-c:v', 'libx264', '-crf', 0, '-threads', 1, final)
    stream = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=nb_frames,duration', '-of', 'json', str(final)]))['streams'][0]
    assert int(stream['nb_frames']) == round(duration * delivery_fps)
    assert abs(float(stream['duration'])-duration) <= 1/delivery_fps
    original = run('-i', source, '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-')
    actual = run('-i', final, '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-')
    size = 32*18*3//2
    assert actual[:size] == original[:size]
    last = (2*source_fps-1)*size
    assert actual[-size:] == original[last:last+size], 'Retiming lost the final actual source picture'


def test_source_frame_padding_cannot_conceal_a_long_missing_tail(tmp_path):
    source = tmp_path / 'short.nut'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                    'testsrc2=s=32x18:r=24:d=0.5', '-c:v', 'ffv1', '-threads', '1', str(source)],
                   check=True, capture_output=True, timeout=20)
    pixels = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(source), '-t', '2',
        '-vf', ','.join(build_studio_sequence_video_filters('setsar=1', 24)),
        '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-'], timeout=20)
    assert len(pixels)//(32*18*3//2) == 13
