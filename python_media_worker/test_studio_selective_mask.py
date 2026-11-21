import tempfile, subprocess
from pathlib import Path
import numpy as np
import pytest
from studio_selective_mask import mask_coverage, render_selective_mask, validate_selective_mask
from studio_adjustment_grade import adjustment_grade_filter
from studio_precision_grade import build_precision_grade_filter

BASE=dict(space='programme',version=1,shape='ellipse',x=.5,y=.5,width=.4,height=.4,rotation=0,feather=.01,inverted=False,keyframes=[])

def test_polygon_inversion_and_motion():
    mask={**BASE,'shape':'polygon','points':[[0,0],[1,0],[.5,1]]};a=mask_coverage(mask,64,36);b=mask_coverage({**mask,'inverted':True},64,36)
    assert a[0,0]==0 and a.max()==1 and np.max(np.abs(a+b-1))<1e-6
    keys=[dict(time=t,x=x,y=.5,width=.3,height=.3,rotation=0)for t,x in [(0,.2),(1,.8)]]
    moved={**BASE,'keyframes':keys};assert mask_coverage(moved,64,36,0)[18,12]>.9 and mask_coverage(moved,64,36,1)[18,12]==0

@pytest.mark.parametrize('patch',[{'x':float('nan')},{'shape':'polygon','points':[[0,0],[1,1]]},{'keyframes':[dict(time=-1,x=.5,y=.5,width=.4,height=.4,rotation=0)]}])
def test_refuse_invalid_masks(patch):
    with pytest.raises(ValueError):validate_selective_mask({**BASE,**patch})

def test_real_rgb_masked_grade_preserves_outside_and_whole_video_clock():
    with tempfile.TemporaryDirectory()as d:
        mask=render_selective_mask(BASE,Path(d)/'mask.mkv',64,36,1,12)
        graph=adjustment_grade_filter({'color':{'precisionGrade':True,'exposureStops':.5},'selective_mask':BASE,'_worker_selective_mask_path':mask,'_worker_selective_mask_fps':12},lambda p:build_precision_grade_filter(p['color']),'selected_')
        source=np.full((12,36,64,3),80,np.uint8)
        proc=subprocess.run(['ffmpeg','-v','error','-filter_complex_threads','1','-f','rawvideo','-s','64x36','-r','12','-pix_fmt','rgb24','-i','pipe:0','-vf',graph,'-frames:v','12','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],input=source.tobytes(),capture_output=True,timeout=15)
        assert proc.returncode==0,proc.stderr.decode();out=np.frombuffer(proc.stdout,np.uint8).reshape((12,36,64,3));assert np.array_equal(out[:,0,0],source[:,0,0]);assert np.all(out[:,18,32]>110)

def test_clone_only_changes_the_masked_defect():
    with tempfile.TemporaryDirectory()as d:
        m={**BASE,'x':.25,'width':.08,'height':.14,'feather':0};mask=render_selective_mask(m,Path(d)/'mask.mkv',64,36,1,12)
        graph=adjustment_grade_filter({'color':{},'selective_mask':m,'_worker_selective_mask_path':mask,'_worker_selective_mask_fps':12,'clone_patch':{'enabled':True,'dx':.25,'dy':0,'strength':1}},lambda p:'null','clean_')
        source=np.full((36,64,3),100,np.uint8);source[17:20,15:18]=[230,20,20]
        proc=subprocess.run(['ffmpeg','-v','error','-filter_complex_threads','1','-f','rawvideo','-s','64x36','-r','12','-pix_fmt','rgb24','-i','pipe:0','-vf',graph,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],input=source.tobytes(),capture_output=True,timeout=15)
        assert proc.returncode==0,proc.stderr.decode();out=np.frombuffer(proc.stdout,np.uint8).reshape((36,64,3));assert np.max(np.abs(out[18,16].astype(int)-100))<=1;assert np.array_equal(out[0],source[0])

def test_animated_mask_uses_programme_time_after_a_nonzero_segment_seek():
    with tempfile.TemporaryDirectory()as d:
        keys=[dict(time=t,x=x,y=.5,width=.15,height=.3,rotation=0)for t,x in [(0,.2),(2,.8)]]
        m={**BASE,'keyframes':keys};mask=render_selective_mask(m,Path(d)/'moving.mkv',64,36,3,12)
        graph=adjustment_grade_filter({'color':{'exposureStops':.5},'selective_mask':m,'_worker_selective_mask_path':mask,'_worker_selective_mask_fps':12},lambda p:build_precision_grade_filter(p['color']),'moving_')
        source=np.full((12,36,64,3),80,np.uint8)
        p=subprocess.run(['ffmpeg','-v','error','-filter_complex_threads','1','-f','rawvideo','-s','64x36','-r','12','-pix_fmt','rgb24','-i','pipe:0','-vf','setpts=PTS+1/TB,'+graph+',setpts=PTS-STARTPTS','-frames:v','12','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],input=source.tobytes(),capture_output=True,timeout=20)
        assert p.returncode==0,p.stderr.decode();out=np.frombuffer(p.stdout,np.uint8).reshape((12,36,64,3));assert np.all(out[0,18,32]>110);assert np.array_equal(out[0,18,12],source[0,18,12]);assert np.all(out[-1,18,49]>105)


@pytest.mark.parametrize('fps',[24,25,30,30000/1001,60])
def test_mask_timebase_cannot_repeat_or_retime_the_source_frames(fps):
    with tempfile.TemporaryDirectory()as d:
        keys=[dict(time=t,x=x,y=.5,width=.15,height=.3,rotation=0)for t,x in [(0,.2),(2,.8)]]
        m={**BASE,'keyframes':keys};mask=render_selective_mask(m,Path(d)/'moving.mkv',64,36,2,fps)
        graph=adjustment_grade_filter({'color':{},'selective_mask':m,'_worker_selective_mask_path':mask,'_worker_selective_mask_fps':fps},lambda p:'null','clock_')
        frames=np.stack([np.full((36,64,3),30+i,np.uint8)for i in range(int(np.ceil(2*fps)))])
        proc=subprocess.run(['ffmpeg','-v','error','-filter_complex_threads','1','-f','rawvideo','-s','64x36','-r',str(fps),'-pix_fmt','rgb24','-i','pipe:0','-vf',graph,'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],input=frames.tobytes(),capture_output=True,timeout=20)
        assert proc.returncode==0,proc.stderr.decode();out=np.frombuffer(proc.stdout,np.uint8).reshape((-1,36,64,3));assert len(out)==len(frames);assert np.array_equal(out[:,0,0],frames[:,0,0])
