import numpy as np
import pytest
import subprocess
from PIL import Image

from python_media_worker.studio_perspective import project_media,validate_perspective,validate_perspective_layer,projected_overlay_options
from python_media_worker.studio_layer_motion import render_image_layer_motion,layer_pose,_render_pose

PLANE={'version':1,'corners':[[0,12],[88,0],[88,100],[0,88]]}

def test_warp_preserves_identity_changes_real_picture_and_clips_alpha():
    a=np.zeros((100,200,4),np.uint8)
    a[:,:,:]=[10,20,30,255]
    a[::10,:,:3]=255
    a[:,::20,:3]=255
    asset=Image.fromarray(a)
    np.testing.assert_array_equal(project_media(asset,PLANE,0),a)
    for progress in [50,100]:
        b=np.asarray(project_media(asset,PLANE,progress))
        assert b[0,0,3]==0 and b[-1,-1,3]==0
        assert b[50,100,3]==255
        assert np.mean(b[:,:,3]>200)<1-.08*progress/100
        assert not np.array_equal(b[:,:,0],a[:,:,0])
    # Homography maps the far vertical edge to x=.88 of the actual picture.
    b=np.asarray(project_media(asset,PLANE,100))
    assert b[:,179:,3].max()==0

@pytest.mark.parametrize('p',[
    [[0,0],[100,100],[100,0],[0,100]],
    [[0,0],[100,0],[50,2],[0,100]],
    [[0,0],[100,0],[100,1],[0,1]],
    [[0,0],[float('inf'),0],[100,100],[0,100]],
    [[0,0],[101,0],[100,100],[0,100]],
])
def test_bad_geometry_rejected(p):
    with pytest.raises(ValueError):validate_perspective({'version':1,'corners':p})

def test_unknown_projection_and_unsupported_consumers_rejected():
    base={'id':'recording','type':'video','perspective':PLANE}
    validate_perspective_layer(base)
    validate_perspective_layer({**base,'motion_keyframes':[{'property':'cropX','value':0}]})
    for extra in [{'id':'main-video'},{'type':'text'},{'effects':{'motion_blur':{'enabled':True}}},
                  {'effects':{'mask':{'enabled':True}}},{'base_transform':{'crop_x':1}},
                  {'motion_keyframes':[{'property':'perspectiveProgress','value':float('nan')}]}]:
        with pytest.raises(ValueError):validate_perspective_layer({**base,**extra})
    with pytest.raises(ValueError):validate_perspective_layer(base,grouped=True)

def test_projected_stream_retains_alpha_and_bounded_colour_error_on_the_delivery_clock(tmp_path):
    path=tmp_path/'plane.mkv'
    overlay={'type':'video','start_time':0,'duration':.5,'width':90,'height':90,'frameShape':'edge'}
    layer={'id':'plane','type':'video','perspective':PLANE,'base_transform':{'x':50,'y':50,'scale':1},
           'motion_keyframes':[{'property':'perspectiveProgress','time':0,'value':0},
                              {'property':'perspectiveProgress','time':.4,'value':100,'easing':'linear'}]}
    def source(index):return Image.new('RGBA',(80,40),(index*10,50,150,255))
    render_image_layer_motion(None,path,overlay,layer,100,60,.5,[],fps=24,frame_source=source)
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-filter_complex','[0:v:0][0:v:1]alphamerge[v]',
                                 '-map','[v]','-pix_fmt','rgba','-f','rawvideo','-'])
    frames=np.frombuffer(raw,np.uint8).reshape(-1,60,100,4)
    assert len(frames)==12
    for i,frame in enumerate(frames):
        expected=_render_pose(source(i),overlay,layer,layer_pose(layer,overlay,i/24),(100,60))
        expected=np.asarray(expected)
        np.testing.assert_array_equal(frame[:,:,3],expected[:,:,3])
        opaque=expected[:,:,3]>250
        assert np.mean(np.abs(frame[:,:,:3].astype(float)-expected[:,:,:3])[opaque])<2

def test_rounded_intermediate_timestamps_keep_the_last_declared_frame_without_leaking_after_cue(tmp_path):
    path=tmp_path/'plane.mkv'
    overlay={'type':'image','start_time':0,'duration':3,'width':80,'height':80,'frameShape':'edge'}
    layer={'id':'plane','type':'image','perspective':PLANE,'base_transform':{'x':50,'y':50,'scale':1}}
    source=tmp_path/'red.png';Image.new('RGBA',(80,40),'red').save(source)
    render_image_layer_motion(source,path,overlay,layer,100,60,3,[],fps=24)
    graph='[1:v:0][1:v:1]alphamerge,settb=1/90000,setpts=STARTPTS+N*90000/24[plane];'
    graph+='[0:v][plane]overlay=0:0:'+projected_overlay_options(0,3)+':format=auto[v]'
    raw=subprocess.check_output(['ffmpeg','-v','error','-filter_complex_threads','1',
        '-f','lavfi','-i','color=blue:s=100x60:r=24:d=3.125','-i',str(path),
        '-filter_complex',graph,'-map','[v]','-pix_fmt','rgb24','-f','rawvideo','-'])
    frames=np.frombuffer(raw,np.uint8).reshape(-1,60,100,3)
    assert len(frames)==75
    assert frames[71,30,50,0]>200,'The last 24fps cue picture must retain its plane'
    assert frames[72,30,50,2]>200,'The plane must disappear at its exact declared end'
