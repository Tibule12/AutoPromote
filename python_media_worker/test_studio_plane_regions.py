import numpy as np
import pytest
from PIL import Image
from python_media_worker.studio_perspective import IDENTITY,validate_perspective_layer
from python_media_worker.studio_layer_motion import _render_pose,layer_pose


def test_valid_endpoints_cannot_hide_an_interior_plane_collapse():
    keys=[dict(property=f'planeCorner{i}{axis}',time=t,value=v,easing='linear')
          for i,p in enumerate(IDENTITY) for j,axis in enumerate(('X','Y')) for t,v in [(0,p[j]),(2,100-p[j])]]
    with pytest.raises(ValueError,match='between'):
        validate_perspective_layer(dict(id='p',type='video',perspective=dict(version=1,corners=IDENTITY),motion_keyframes=keys))


def test_two_cropped_planes_reconstruct_the_original_picture_without_repeating_texture():
    y,x=np.indices((90,160));rgb=np.stack((x,x*0+y,255-x),axis=-1).astype(np.uint8)
    source=Image.fromarray(rgb).convert('RGBA');result=Image.new('RGBA',source.size)
    overlay=dict(type='video',width=100,height=100,frameShape='edge',mediaFit='stretch')
    for left,right in [(0,50),(50,100)]:
        plane=dict(version=1,corners=[[left,0],[right,0],[right,100],[left,100]],sourceRect=[left,0,right,100])
        layer=dict(id=str(left),type='video',perspective=plane,base_transform=dict(scale=1,x=50,y=50))
        validate_perspective_layer(layer)
        result.alpha_composite(_render_pose(source,overlay,layer,layer_pose(layer,overlay,0),source.size))
    # Edge resampling may differ by one level; source regions must not repeat,
    # shift half a picture, introduce a black seam, or stretch the wrong half.
    pixels=np.asarray(result);assert pixels[:,:,3].min()==255
    assert np.abs(pixels[:,:,:3].astype(float)-rgb).mean()<.5


@pytest.mark.parametrize('region',[[0,0,0,100],[50,0,25,100],[0,0,101,100],[0,float('nan'),50,100],[True,0,50,100]])
def test_malformed_source_regions_reject(region):
    with pytest.raises(ValueError):
        validate_perspective_layer(dict(id='p',type='video',perspective=dict(version=1,corners=IDENTITY,sourceRect=region)))


def test_narrow_uv_surfaces_keep_their_own_edge_and_winding_protection():
    corners=[[10,5],[14,5],[14,95],[10,95]]
    validate_perspective_layer(dict(id='p',type='video',perspective=dict(version=1,corners=corners,sourceRect=[0,0,10,100])))
    from python_media_worker.studio_perspective import project_media
    picture=project_media(Image.new('RGBA',(160,90),'red'),dict(version=1,corners=corners,sourceRect=[0,0,10,100]),100)
    assert picture.getbbox() is not None
    with pytest.raises(ValueError):validate_perspective_layer(dict(id='p',type='video',perspective=dict(version=1,corners=corners)))
    with pytest.raises(ValueError):validate_perspective_layer(dict(id='p',type='video',perspective=dict(version=1,corners=[[10,5],[11,5],[11,95],[10,95]],sourceRect=[0,0,10,100])))


def test_combined_progress_and_corner_trajectories_remain_gated():
    layer=dict(id='p',type='video',perspective=dict(version=1,corners=IDENTITY,sourceRect=[0,0,50,100]),
               motion_keyframes=[dict(property='planeCorner0X',time=0,value=0,easing='linear')])
    with pytest.raises(ValueError,match='progress at 100'):validate_perspective_layer({**layer,'base_transform':{'perspective_progress':50}})
    with pytest.raises(ValueError,match='progress at 100'):validate_perspective_layer({**layer,'motion_keyframes':layer['motion_keyframes']+[dict(property='perspectiveProgress',time=1,value=50,easing='linear')]})
    validate_perspective_layer(layer)
