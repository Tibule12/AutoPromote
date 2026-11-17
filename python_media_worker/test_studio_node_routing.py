import asyncio
from pathlib import Path
from types import SimpleNamespace
import subprocess
import shutil
import numpy as np
import pytest
from PIL import Image
from studio_node_mask_grade import render_node_masked_finish,validate_node_mask

class Overlay(SimpleNamespace):
    def model_dump(self):return vars(self).copy()

async def run_command(cmd,**_):
    result=await asyncio.to_thread(subprocess.run,cmd,capture_output=True)
    assert result.returncode==0,result.stderr.decode()[-2000:]

def base_movie(tmp_path):
    source=tmp_path/'source.mp4'
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=1','-c:v','libx264','-pix_fmt','yuv420p','-y',str(source)],check=True)
    return source

def read_frames(path):
    out=subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True,check=True).stdout
    return np.frombuffer(out,dtype=np.uint8).reshape(-1,90,160,3)

def grade(plan):return 'lutrgb=r=255:g=255:b=255' if plan.get('color') else ''

@pytest.mark.parametrize('operation',['CornerPin','GlowBlur'])
@pytest.mark.parametrize('invert',[False,True])
def test_projected_mask_reads_actual_alpha_stream(tmp_path,operation,invert):
    plate=tmp_path/'white.png';Image.new('RGBA',(160,90),'white').save(plate)
    overlay=Overlay(id='plane',type='image',src='owned-plane',start_time=0,duration=1,width=100,height=100,frameShape='edge',mediaFit='stretch')
    layer={'id':'plane','type':'image','perspective':{'version':1,'corners':[[20,20],[80,20],[80,80],[20,80]]},'base_transform':{'x':50,'y':50,'scale':1,'rotation':0,'opacity':1,'perspective_progress':100},'effects':{}}
    request=SimpleNamespace(overlays=[overlay],composition_plan={'layers':[layer]},finish_plan={'color':{'contrast':1.3},'node_mask':{'layer_id':'plane','operation':operation,**({'invert':True} if invert else {})}})
    assert validate_node_mask(request.finish_plan['node_mask'],request.overlays,request.composition_plan)
    def image(_src,dest,_cache):shutil.copyfile(plate,dest);return dest
    result=asyncio.run(render_node_masked_finish(source_path=str(base_movie(tmp_path)),output_path=str(tmp_path/'out.mp4'),request=request,width=160,height=90,duration=1,fps=10,job_id='projection',directory=str(tmp_path),temp_paths=set(),run=run_command,materialize_video=None,materialize_image=image,build_finish=grade,zoom_filter='',probe=None))
    frame=read_frames(result)[3]
    if invert:
        assert frame[45,80,0]<20 and frame[45,80,2]>230
        assert frame[2,2].min()>230
    else:
        assert frame[45,80].min()>230
        assert frame[2,2,0]<20 and frame[2,2,2]>230
        assert frame[12,20,0]<20

@pytest.mark.parametrize('animated',[False,True])
def test_native_title_alpha_can_drive_a_grade(tmp_path,animated):
    title=Overlay(id='title',type='text',text='NODE',fontFamily='Inter',fontWeight=900,bg='transparent',color='#ffffff',shadow='none',start_time=0,duration=1,width=80,height=30)
    layer={'id':'title','type':'text','base_transform':{'x':50,'y':50,'scale':1.6,'rotation':0,'opacity':1,'text_progress':100},'effects':{}}
    if animated:layer['text_animator']={'version':1,'unit':'character','order':'forward','stagger':65,'fromX':0,'fromY':.9,'fromScale':.65,'fromRotation':0,'fromOpacity':0,'tracking':0,'rangeStart':0,'rangeEnd':100,'easing':'linear'}
    request=SimpleNamespace(overlays=[title],composition_plan={'layers':[layer]},finish_plan={'color':{'contrast':1.3},'node_mask':{'layer_id':'title','operation':'Transform'}})
    result=asyncio.run(render_node_masked_finish(source_path=str(base_movie(tmp_path)),output_path=str(tmp_path/'out.mp4'),request=request,width=160,height=90,duration=1,fps=10,job_id='title',directory=str(tmp_path),temp_paths=set(),run=run_command,materialize_video=None,materialize_image=None,build_finish=grade,zoom_filter='',probe=None))
    frame=read_frames(result)[3]
    assert np.count_nonzero(frame[:,:,0]>150)>50
    assert frame[2,2,0]<20 and frame[2,2,2]>230
