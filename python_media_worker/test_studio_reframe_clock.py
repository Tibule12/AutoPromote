"""Actual fractional-cut sequence regression, without cloud/model imports."""
import ast
import asyncio
import math
import os
from pathlib import Path
import subprocess
import pytest
from python_media_worker.studio_reframe_clock import reframe_picture_segments


def test_fractional_cut_uses_one_shared_picture_boundary():
    rows = reframe_picture_segments([{'start': 0, 'end': 2.218}, {'start': 2.218, 'end': 4}], 24)
    assert [(r['start'], r['end'], r['frame_count']) for r in rows] == [(0, 2.25, 54), (2.25, 4, 42)]
    assert reframe_picture_segments([{'start': 0, 'end': .001}, {'start': .001, 'end': .002}], 24)[0]['frame_count'] == 1
    for fps in [0, float('nan'), 121]:
        with pytest.raises(ValueError):
            reframe_picture_segments([], fps)


@pytest.mark.parametrize('fps,cut', [(24, 2.218), (24, .05), (25, 2.218), (30, 2.218), (50, 2.218), (60, 2.218), (60, 1/60), (60, 2/60)])
def test_real_framing_split_retains_every_cfr_source_picture_once(tmp_path, fps, cut):
    source = Path(__file__).with_name('main_media_server.py')
    tree = ast.parse(source.read_text())
    functions = [n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'render_reframe_timeline_sequential']
    async def run(command, **_):
        subprocess.run(command[:1] + ['-v', 'error'] + command[1:], check=True, capture_output=True)
    runtime = {'os': os, 'math': math, 'reframe_picture_segments': reframe_picture_segments, 'run_subprocess_async': run,
               'MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS': 20,
               'plan_reframe_timeline_segments': lambda *_, **__: [{'start': 0, 'end': cut, 'mode': 'center'}, {'start': cut, 'end': 4, 'mode': 'off'}],
               'build_reframe_segment_filter': lambda *_, **__: '[0:v]null[vout]',
               'build_viral_export_encode_args': lambda _: ['-c:v', 'libx264', '-threads', '1', '-crf', '0'],
               'resolve_viral_export_profile': lambda *_: {},
               'build_studio_timeline_mux_args': lambda duration: ['-t', str(duration)]}
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), runtime)
    original, edited = str(tmp_path / 'source.mp4'), str(tmp_path / 'reframe.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', f'testsrc2=s=64x36:r={fps}:d=4',
                    '-c:v', 'libx264', '-threads', '1', '-crf', '0', original], check=True, capture_output=True)
    asyncio.run(runtime['render_reframe_timeline_sequential'](original, edited, 64, 36, 64, 36, 4, [], programme_fps=fps))
    decode = lambda path: subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-'])
    expected = decode(original)
    assert len(expected) == 64 * 36 * 3 // 2 * (4 * fps)
    assert decode(edited) == expected
