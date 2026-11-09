import numpy as np
import pytest
from PIL import Image
from python_media_worker.studio_media_colorize import colorize_media,validate_colorize
from python_media_worker.studio_layer_motion import _render_pose
from python_media_worker.studio_layer_cache import video_layer_uses_canonical_raster,video_layer_raster_key
spec={'enabled':True,'color':'#28cfff','strength':1,'gamma':.65,'lift':.045}

def test_texture_shading_alpha_and_identity():
    x=np.zeros((2,64,4),np.uint8);x[:,:,:3]=np.arange(64)[None,:,None]*4;x[:,:,3]=np.array([0,129])[:,None];image=Image.fromarray(x,'RGBA');out=np.asarray(colorize_media(image,spec));assert np.array_equal(out[:,:,3],x[:,:,3]);assert len(np.unique(out[1,:,1]))>45;assert out[1,40,2]>out[1,40,0]*5;assert out[1,40,1]>out[1,10,1];assert colorize_media(image,None)is image;assert colorize_media(image,{**spec,'enabled':False})is image;assert colorize_media(image,{**spec,'strength':0})is image

@pytest.mark.parametrize('change',[{'gamma':0},{'lift':float('nan')},{'strength':2},{'color':'red'},{'enabled':1},{'contrast':float('nan')},{'contrast':3.1},{'contrast':True},{'remoteShader':'x'}])
def test_rejects_malformed(change):
    with pytest.raises(ValueError):validate_colorize({**spec,**change})

def test_actual_ordinary_renderer_and_dispatch_do_not_drop_static_tint(tmp_path):
    a=np.zeros((20,20,4),np.uint8);a[:,:,:3]=np.arange(20)[None,:,None]*12;a[:,:,3]=255;image=Image.fromarray(a,'RGBA');overlay={'type':'video','width':100,'height':100,'frameShape':'edge','mediaFit':'contain'};layer={'id':'v','type':'video','effects':{'colorize':spec},'base_transform':{'x':50,'y':50,'scale':1,'opacity':1}};pose={'x':50,'y':50,'scale':1,'rotation':0,'opacity':1};out=np.asarray(_render_pose(image,overlay,layer,pose,(20,20)));assert np.max(np.abs(out.astype(int)-np.asarray(colorize_media(image,spec)).astype(int)))==0;assert video_layer_uses_canonical_raster('v',layer,{'layers':[layer]});source=tmp_path/'source.png';image.save(source);key=video_layer_raster_key(source,overlay,layer,20,20,1,[],24);assert key!=video_layer_raster_key(source,overlay,{**layer,'effects':{'colorize':{**spec,'color':'#ff34bf'}}},20,20,1,[],24)

def test_detail_contrast_keeps_alpha_and_expands_dark_clothing_separation():
    a=np.zeros((1,2,4),np.uint8);a[0,:,:3]=np.array([12,28])[:,None];a[0,:,3]=[80,210];im=Image.fromarray(a,'RGBA');base={**spec,'gamma':.35,'lift':0};legacy=np.asarray(colorize_media(im,base));identity=np.asarray(colorize_media(im,{**base,'contrast':1}));detail=np.asarray(colorize_media(im,{**base,'contrast':2.4}));assert np.array_equal(legacy,identity);assert np.array_equal(detail[:,:,3],a[:,:,3]);assert int(detail[0,1,2])-int(detail[0,0,2])>2*(int(legacy[0,1,2])-int(legacy[0,0,2]));assert detail.max()<=255
