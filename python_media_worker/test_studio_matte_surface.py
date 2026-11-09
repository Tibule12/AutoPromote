import pytest
from python_media_worker.studio_matte_surface import validate_surface,surface_filters
from python_media_worker.studio_composition import validate_track_mattes
spec=dict(enabled=True,glowColor='#20dfff',glowRadius=5,glowIntensity=.6,reflectionEnabled=True,floorY=80,reflectionOpacity=.4,fadeHeight=25)
def test_legacy_identity_and_bounded_post_mask_graph():
    assert surface_filters('source',None,64,128,1,24,'p')==([], 'source')
    parts,pad=surface_filters('source',spec,64,128,1,24,'p');graph=''.join(parts);assert '[source]split' in graph and 'vflip' in graph and 'overlay=0:77' in graph;assert pad=='p_result'
@pytest.mark.parametrize('change',[{'floorY':float('inf')},{'glowRadius':25},{'enabled':1},{'reflectionEnabled':1},{'reflectionOpacity':.9},{'fadeHeight':0},{'shader':'x'}])
def test_invalid_surface_is_rejected(change):
    with pytest.raises(ValueError):validate_surface({**spec,**change})
def test_unisolated_surface_is_rejected():
    with pytest.raises(ValueError,match='isolated'):validate_track_mattes({'layers':[{'id':'fill','type':'video','effects':{'matte_surface':spec}}]},['fill'])

def test_actual_canonical_matte_compositor_reflects_only_the_isolated_subject():
    from python_media_worker.studio_composition import connect_grouped_layer_blocks
    from python_media_worker.test_studio_track_matte import decode_filtergraph
    sources=('color=c=black:s=32x32:r=10:d=0.3,format=rgba[base];'
      'color=c=white:s=10x10:r=10:d=0.3,format=rgba[m_src];'
      'color=c=red:s=32x32:r=10:d=0.3,format=rgba[f_src];')
    blocks=[('mask',['[in0][m_src]overlay=10:6:format=auto[out0];'],'in0','out0'),('fill',['[in1][f_src]overlay=0:0:format=auto[out1];'],'in1','out1')]
    surface={**spec,'glowIntensity':0,'floorY':50,'reflectionOpacity':.6,'fadeHeight':40}
    plan={'order':['mask','fill'],'layers':[{'id':'mask','type':'image'},{'id':'fill','type':'image','track_matte':{'mode':'alpha','source_layer_id':'mask'},'effects':{'matte_surface':surface}}]}
    parts,out=connect_grouped_layer_blocks(blocks,'base',plan['order'],plan,32,32,.3,frame_rate=10)
    frames=decode_filtergraph(sources+''.join(parts)+f'[{out}]null[out];');frame=frames[0]
    assert frame[10,14,0]>240 and frame[19,14,0]>50
    assert frame[19,3].max()<5 and frame[3,14].max()<5
