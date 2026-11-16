import json
import os
from pathlib import Path
import subprocess
import numpy as np
import pytest
from python_media_worker.studio_finish_texture import finish_texture_filter, finish_texture_shift_filter, prepare_finish_texture_noise


@pytest.mark.parametrize('grain,chromatic',[(.12,.04),(.8,0),(.4,.2)])
def test_lossless_noise_stream_preserves_every_native_texture_pixel(tmp_path,grain,chromatic):
    width,height,frames=24,16,6
    data=np.random.default_rng(421).integers(0,256,(frames,height,width,3),dtype=np.uint8)
    texture={'pixel_version':1,'film_grain':grain,'chromatic_aberration':chromatic}
    source=tmp_path/'source.mkv';noise=tmp_path/'noise.mkv'
    subprocess.run(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}',
        '-r','24','-i','pipe:0','-c:v','ffv1','-threads','2','-y',str(source)],input=data.tobytes(),check=True)
    prepare_finish_texture_noise(noise,width,height,frames/24,24,grain)
    graph=f"[0:v]{finish_texture_shift_filter(texture)}[signal];[1:v]setparams=range=full,format=gbrp[noise];[signal][noise]blend=all_mode=grainmerge[result]"
    actual=subprocess.check_output(['ffmpeg','-v','error','-filter_complex_threads','4','-i',str(source),'-i',str(noise),
        '-filter_complex',graph,'-map','[result]','-frames:v',str(frames),'-f','rawvideo','-pix_fmt','rgb24','pipe:1'])
    expected=subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-filter_threads','1',
        '-vf',finish_texture_filter(texture),'-frames:v',str(frames),'-f','rawvideo','-pix_fmt','rgb24','pipe:1'])
    assert actual==expected

@pytest.mark.parametrize('grain,chromatic',[(.12,.04),(.8,0),(0,.5),(.4,.2)])
def test_real_ffmpeg_texture_matches_native_equations(grain,chromatic):
    width,height,frames=24,16,3
    data=np.random.default_rng(947).integers(0,256,(frames,height,width,3),dtype=np.uint8)
    texture={'pixel_version':1,'film_grain':grain,'chromatic_aberration':chromatic}
    actual=subprocess.run(['ffmpeg','-v','error','-filter_threads','1','-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}','-r','24','-i','pipe:0','-vf',finish_texture_filter(texture),'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],input=data.tobytes(),capture_output=True,check=True).stdout
    script="""const fs=require('fs'),babel=require('@babel/core'),Module=require('module');const code=babel.transformSync(fs.readFileSync('frontend/src/components/studioFinishTexture.js','utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;const m=new Module('texture');m._compile(code,'texture');const p=JSON.parse(fs.readFileSync(0,'utf8')),out=[];for(let frame=0;frame<p.frames;frame++){const rgba=new Uint8ClampedArray(p.width*p.height*4);for(let i=0;i<p.width*p.height;i++){rgba.set(p.rgb.slice((frame*p.width*p.height+i)*3,(frame*p.width*p.height+i)*3+3),i*4);rgba[i*4+3]=255;}m.exports.applyStudioFinishTexture(rgba,p.width,p.height,p.fx,frame/24,24);for(let i=0;i<rgba.length;i+=4)out.push(...rgba.slice(i,i+3));}process.stdout.write(Buffer.from(out));"""
    root=Path(__file__).resolve().parents[1]
    expected=subprocess.run(['node','-e',script],cwd=root,env={**os.environ,'NODE_PATH':str(root.parent/'AutoPromote/node_modules')},input=json.dumps({'frames':frames,'width':width,'height':height,'rgb':data.flatten().tolist(),'fx':{'filmGrain':grain,'chromaticAberration':chromatic}}).encode(),capture_output=True,check=True).stdout
    error=np.abs(np.frombuffer(actual,np.uint8).astype(int)-np.frombuffer(expected,np.uint8).astype(int))
    assert error.max()<=1
