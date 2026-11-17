import asyncio
from pathlib import Path
from types import SimpleNamespace
import subprocess
import shutil
import numpy as np
import pytest
from PIL import Image
from studio_node_mask_grade import render_node_masked_finish,validate_node_mask
from studio_layer_motion import layer_clip_mask

class Overlay(SimpleNamespace):
    def model_dump(self):return vars(self).copy()

@pytest.mark.parametrize('operation',['PolygonMask','Transform'])
def test_actual_grade_uses_native_polygon_coverage(tmp_path,operation):
    source=tmp_path/'source.mp4';output=tmp_path/'out.mp4'
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=1','-c:v','libx264','-pix_fmt','yuv420p','-y',str(source)],check=True)
    overlay=Overlay(id='stencil',type='image',src='unused',start_time=0,duration=1,width=100,height=100,frameShape='edge')
    ref={'layer_id':'stencil','operation':operation}
    layer={'id':'stencil','type':'image','base_transform':{'x':50,'y':50,'scale':1,'rotation':0,'opacity':1},'effects':{'mask':{'enabled':True,'shape':'polygon','path':'polygon(0% 0%, 50% 0%, 50% 100%, 0% 100%)'}}}
    request=SimpleNamespace(overlays=[overlay],composition_plan={'layers':[layer]},finish_plan={'node_mask':ref,'color':{'active':True}},speed_segments=[])
    async def run(cmd,**_):
        result=await asyncio.to_thread(subprocess.run,cmd,capture_output=True)
        assert result.returncode==0,result.stderr.decode()[-1500:]
    def materialize(_src,dest,_cache):Image.new('RGB',(160,90),'white').save(dest);return dest
    def build(plan):return 'lutrgb=r=255:g=255:b=255' if plan.get('color',{}).get('active') else ''
    asyncio.run(render_node_masked_finish(source_path=str(source),output_path=str(output),request=request,width=160,height=90,duration=1,fps=10,job_id='mask',directory=str(tmp_path),temp_paths=set(),run=run,materialize_video=None,materialize_image=materialize,build_finish=build,zoom_filter='',probe=None))
    actual=tmp_path/'mask_node_finish_0.mp4'
    if output.exists():actual=output
    raw=subprocess.run(['ffmpeg','-v','error','-i',str(actual),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],check=True,capture_output=True).stdout
    frame=np.frombuffer(raw,dtype=np.uint8).reshape(90,160,3)
    assert frame[45,20].min()>230
    assert frame[45,130,2]>200 and frame[45,130,0]<25

@pytest.mark.parametrize('op',['add','subtract','intersect','difference'])
def test_boolean_mask_stack_affects_real_alpha(op):
    base={'enabled':True,'shape':'rectangle','radius':0,'secondaryMasks':[{'shape':'ellipse','booleanOp':op,'feather':0}]}
    a=np.array(layer_clip_mask((100,100),base))
    if op in ('subtract','difference'):assert a[50,50]<5 and a[2,2]>240
    if op=='intersect':assert a[50,50]>240 and a[0,0]<5
    if op=='add':assert a.min()>240

def test_invalid_mask_source_fails_before_render():
    with pytest.raises(ValueError):validate_node_mask({'layer_id':'missing','operation':'ChromaKeyer'},[],{'layers':[]})

def test_timed_grade_uses_keyed_image_alpha_and_stops_at_end(tmp_path):
    from test_studio_node_effects import BASE
    import copy
    source=tmp_path/'source.mp4';output=tmp_path/'out.mp4';plate=tmp_path/'plate.png'
    img=Image.new('RGB',(160,90),(0,212,85));img.paste((255,0,0),(0,0,80,90));img.save(plate)
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=1','-c:v','libx264','-pix_fmt','yuv420p','-y',str(source)],check=True)
    spec=copy.deepcopy(BASE);spec['key']['enabled']=True
    overlay=Overlay(id='key',type='image',src='original-owned-key-plate',start_time=0,duration=1,width=100,height=100,frameShape='edge',mediaFit='stretch')
    layer={'id':'key','type':'image','base_transform':{'x':50,'y':50,'scale':1,'rotation':0,'opacity':1},'effects':{'node':spec}}
    ref={'layer_id':'key','operation':'ChromaKeyer'}
    request=SimpleNamespace(overlays=[overlay],composition_plan={'layers':[layer]},finish_plan={'adjustment_layers':[{'id':'adj','startTime':.2,'duration':.4,'effects':{'color':{'active':True},'node_mask':ref}}]},speed_segments=[])
    async def run(cmd,**_):
        result=await asyncio.to_thread(subprocess.run,cmd,capture_output=True);assert result.returncode==0,result.stderr.decode()[-1500:]
    def build(plan):return 'lutrgb=r=255:g=255:b=255' if plan.get('color',{}).get('active') else ''
    def materialize(_src,dest,_cache):shutil.copyfile(plate,dest);return dest
    asyncio.run(render_node_masked_finish(source_path=str(source),output_path=str(output),request=request,width=160,height=90,duration=1,fps=10,job_id='key',directory=str(tmp_path),temp_paths=set(),run=run,materialize_video=None,materialize_image=materialize,build_finish=build,zoom_filter='',probe=None))
    raw=subprocess.run(['ffmpeg','-v','error','-i',str(output),'-f','rawvideo','-pix_fmt','rgb24','-'],check=True,capture_output=True).stdout
    frames=np.frombuffer(raw,dtype=np.uint8).reshape(-1,90,160,3)
    assert frames[3,45,20].min()>230
    assert frames[3,45,130,2]>200 and frames[3,45,130,0]<25
    assert frames[0,45,20,0]<25 and frames[8,45,20,0]<25

def test_masked_grade_skips_neutral_texture_and_keeps_rgb_between_stages(tmp_path):
    source=tmp_path/'source.mp4';output=tmp_path/'out.mp4'
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=0x953767:s=160x90:r=10:d=1','-f','lavfi','-i','sine=frequency=997:sample_rate=48000:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-y',str(source)],check=True)
    request=SimpleNamespace(overlays=[],composition_plan={'layers':[]},finish_plan={'enabled':True,'texture':{'halation':0,'film_grain':0},'adjustment_layers':[{'startTime':.2,'duration':.4,'effects':{'color':{'contrast':1}}}]})
    commands=[]
    async def run(cmd,**_):
        commands.append(cmd)
        result=await asyncio.to_thread(subprocess.run,cmd,capture_output=True)
        assert result.returncode==0,result.stderr.decode()[-2000:]
    def build(_plan):return 'format=gbrp'
    result=asyncio.run(render_node_masked_finish(source_path=str(source),output_path=str(output),request=request,width=160,height=90,duration=1,fps=10,job_id='lossless',directory=str(tmp_path),temp_paths=set(),run=run,materialize_video=None,materialize_image=None,build_finish=build,zoom_filter='',probe=None,main_grade_filter='format=gbrp'))
    assert result==str(output)
    assert len(commands)==1
    assert commands[0].count('-c:v')==1
    assert '[node_stage0_out]' in commands[0][commands[0].index('-filter_complex')+1]
    def rgb(file):return np.frombuffer(subprocess.run(['ffmpeg','-v','error','-i',str(file),'-f','rawvideo','-pix_fmt','rgb24','-'],check=True,capture_output=True).stdout,dtype=np.uint8).astype(float)
    assert np.max(np.abs(rgb(source)-rgb(output)))<=3
    def audio(file):return subprocess.run(['ffmpeg','-v','error','-i',str(file),'-map','0:a:0','-f','s16le','-'],check=True,capture_output=True).stdout
    assert audio(source)==audio(output)
