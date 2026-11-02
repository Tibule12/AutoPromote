"""Actual decoded source frames on the shared scene delivery grid."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
import numpy as np
import pytest
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from render import prepare_video_texture


def test_source_in_decodes_exact_adjacent_frames_and_rejects_wrong_hash_range_and_aspect(tmp_path):
    source=tmp_path/'source.mp4';frames=np.zeros((24,90,160,3),dtype='uint8')
    for i,frame in enumerate(frames):frame[:]=[i*9,220-i*7,50+i*4]
    subprocess.run(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','160x90','-r','12','-i','-',
        '-c:v','libx264','-threads','1','-pix_fmt','yuv420p',str(source)],input=frames.tobytes(),check=True)
    scene=dict(assetType='video',assetSourceStart=1,assetAspect=16/9,assetContentHash=hashlib.sha256(source.read_bytes()).hexdigest())
    spec=dict(scene=scene,duration=1,fps=12);out=tmp_path/'prepared';out.mkdir()
    first=prepare_video_texture(spec,source,out);assert first.name=='texture_0001.png'
    actual=list(sorted((out/'texture').glob('*.png')));assert len(actual)==12
    reference=subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-vf','scale=1280:720:force_original_aspect_ratio=decrease','-f','rawvideo','-pix_fmt','rgb24','-'])
    reference=np.frombuffer(reference,np.uint8).reshape(24,720,1280,3)
    for i,p in enumerate(actual):
        center=np.array(Image.open(p))[360,640,:3]
        np.testing.assert_allclose(center,reference[12+i,360,640],atol=1)
    for patch in [dict(assetContentHash='0'*64),dict(assetSourceStart=1.5),dict(assetAspect=1)]:
        bad={**spec,'scene':{**scene,**patch}}
        with pytest.raises(ValueError):prepare_video_texture(bad,source,tmp_path)
