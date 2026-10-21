"""Actual two-fit regression: portrait intake with landscape source cuts."""
import subprocess

import numpy as np
import pytest

from python_media_worker.main_media_server import studio_sequence_canvas_dimensions


def decode(source, canvas):
    width, height = canvas
    graph = (f'scale={width}:{height}:force_original_aspect_ratio=decrease,'
             f'pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,'
             'scale=320:180:force_original_aspect_ratio=decrease,'
             'pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1')
    result = subprocess.run(['ffmpeg','-v','error','-filter_threads','1','-f','lavfi',
        '-i',f'color=red:s={source}:r=1:d=1','-vf',graph,'-frames:v','1',
        '-pix_fmt','rgb24','-f','rawvideo','-'],capture_output=True,check=True)
    return np.frombuffer(result.stdout,np.uint8).reshape(180,320,3)


def test_wide_preserve_frame_does_not_bake_the_portrait_upload_into_every_cut():
    plan = dict(enabled=True, mode='center', aspect='16:9')
    canvas = studio_sequence_canvas_dimensions(720,1280,plan)
    old = decode('320x180',(180,320))
    wide = decode('320x180',canvas)
    overhead = decode('180x320',canvas)
    assert np.mean(old[:,:,0] > 180) < .4
    assert np.mean(wide[:,:,0] > 180) > .99
    assert np.min(wide[[0,-1],:,0]) > 180
    assert np.max(overhead[:,0,0]) < 10
    assert np.min(overhead[:,160,0]) > 180
    assert .30 < np.mean(overhead[:,:,0] > 180) < .34


@pytest.mark.parametrize('plan', [None,{},dict(enabled=False,mode='center',aspect='16:9'),
    dict(enabled=True,mode='speaker_track',aspect='16:9'),
    dict(enabled=True,mode='center',aspect='9:16'),
    dict(enabled=True,mode='group_stack',aspect='16:9')])
def test_other_sequence_framing_keeps_its_existing_canvas(plan):
    assert studio_sequence_canvas_dimensions(720,1280,plan) == (720,1280)
