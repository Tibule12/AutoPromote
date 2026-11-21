import json
import math
import struct
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from studio_adjustment_grade import adjustment_grade_filter
from studio_region_tracking import read_packet, track_frames
from studio_selective_mask import mask_coverage, mask_at, write_material_cube
from studio_texture_repair import repair_offset_at,repair_bounds


def mask(**patch):
    return dict(space='programme',version=1,shape='ellipse',x=.5,y=.5,width=.6,height=.6,
        rotation=0,feather=0,inverted=False,keyframes=[],**patch)


def test_exclusion_tracks_parent_and_inverts_as_a_compound_area():
    child=mask();child.update(width=.3,height=.3)
    m=mask();m['subtract']=[child]
    m['keyframes']=[dict(time=0,x=.5,y=.5,width=.6,height=.6,rotation=0),dict(time=1,x=.7,y=.5,width=.6,height=.6,rotation=20)]
    a=mask_coverage(m,100,100,1);b=mask_coverage({**m,'inverted':True},100,100,1)
    assert a[50,70]==0 and a[50,55]==1
    np.testing.assert_allclose(a+b,1,atol=1e-6)


def test_individual_outline_keys_and_visibility():
    m=mask();m.update(shape='polygon',points=[[0,0],[1,0],[1,1],[0,1]])
    pose={k:m[k]for k in ('x','y','width','height','rotation')}
    m['keyframes']=[dict(time=0,**pose,points=m['points']),dict(time=2,**pose,points=[[0,0],[1,.2],[1,.8],[0,1]],opacity=0)]
    assert math.isclose(mask_at(m,1)['points'][1][1],.1)
    assert mask_coverage(m,40,30,2).max()==0


def test_material_matte_is_computed_before_colour_changes_and_preserves_neutrals():
    material=dict(enabled=True,samples=['#dd2222'],hueRange=.08,saturationRange=.35,lightnessRange=.35,softness=.35)
    with tempfile.TemporaryDirectory()as folder:
        cube=Path(folder)/'material.cube';write_material_cube(material,cube)
        image=np.zeros((8,12,3),np.uint8);image[:,:4]=[221,34,34];image[:,4:8]=[250,250,250];image[:,8:]=[34,80,221]
        src=Path(folder)/'source.png';Image.fromarray(image).save(src)
        result=subprocess.run(['ffmpeg','-v','error','-threads','1','-i',str(src),'-vf',f'lut3d=file={cube}:interp=trilinear','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],check=True,capture_output=True)
        matte=np.frombuffer(result.stdout,np.uint8).reshape(8,12,3)
        assert matte[:,:4].min()>250
        assert matte[:,4:].max()==0


def test_heal_removes_defect_without_copying_clean_source_lighting():
    height,width=80,120
    y,x=np.mgrid[:height,:width];value=(70+x*.9+((x+y)%2)*5).astype(np.uint8)
    rgb=np.repeat(value[:,:,None],3,axis=2);rgb[38:42,28:32]=20
    spec=dict(enabled=True,dx=.25,dy=0,strength=1,mode='heal',radius=.08)
    with tempfile.TemporaryDirectory()as folder:
        src=Path(folder)/'source.png';Image.fromarray(rgb).save(src)
        # Inner grade only: its eventual spatial mix uses the same outer matte.
        effects=dict(selective_mask=mask(),clone_patch=spec,_worker_width=width,_worker_height=height)
        effects.pop('selective_mask')
        # The retouch compiler requires a selection even when testing only its
        # inner grade. Supply a full-picture mask prepared through the worker.
        full=mask();full.update(shape='rectangle',width=1,height=1)
        matte=Path(folder)/'mask.png';Image.fromarray(np.full((height,width),255,np.uint8)).save(matte)
        effects.update(selective_mask=full,_worker_selective_mask_path=str(matte),_worker_selective_mask_fps=30)
        grade=adjustment_grade_filter(effects,lambda _: 'null','test_')
        result=subprocess.run(['ffmpeg','-v','error','-filter_complex_threads','1','-threads','1','-i',str(src),'-vf',grade,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],check=True,capture_output=True)
        healed=np.frombuffer(result.stdout,np.uint8).reshape(height,width,3)
        expected=float(value[40,30]);actual=float(healed[40,30,0])
        assert abs(actual-expected)<7,(actual,expected)
        assert abs(actual-float(rgb[40,60,0]))>15


def test_tracker_follows_texture_and_stops_at_an_unrelated_shot():
    rng=np.random.default_rng(14);base=rng.integers(0,255,(180,320),dtype=np.uint8)
    frames=[cv2.warpAffine(base,np.float32([[1,0,i],[0,1,i*.3]]),(320,180))for i in range(8)]
    frames += [rng.integers(0,255,(180,320),dtype=np.uint8)]*3
    result=track_frames(frames,[i/8 for i in range(len(frames))],mask())
    assert result['stopReason']=='cut'
    keys=result['keyframes']
    assert len(keys)>=8 and keys[-1]['opacity']==0
    assert abs(keys[-2]['x']-(.5+7/320))<.005


def test_binary_packet_rejects_missing_bytes_and_noncontinuous_clocks():
    header=dict(width=32,height=32,times=[0,.125],mask=mask())
    with tempfile.TemporaryDirectory()as folder:
        path=Path(folder)/'frames'
        def write(data):
            body=json.dumps(data).encode();path.write_bytes(b'APGRD001'+struct.pack('<I',len(body))+body+bytes(32*32*2))
        write(header);meta,frames=read_packet(path);assert frames.shape==(2,32,32);frames._mmap.close()
        path.write_bytes(path.read_bytes()[:-1])
        try:read_packet(path);assert False,'Truncated packet was accepted'
        except ValueError:pass
        write({**header,'times':[0,8]})
        try:read_packet(path);assert False,'Sparse clock was accepted'
        except ValueError:pass


def test_actual_frontend_material_and_animated_compound_coverage_match_worker():
    repo=Path(__file__).resolve().parents[1]
    # Evaluate the actual small ES modules without requiring the React build
    # toolchain. The wrappers preserve each module's own lexical constants.
    script=r"""
const fs=require('fs'),vm=require('vm'),context={};vm.createContext(context);
const run=(name,bindings,exports)=>{
 let text=fs.readFileSync('frontend/src/components/'+name+'.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 return vm.runInContext('(function(){'+bindings+text+';return {'+exports+'};})()',context);
};
context.science=run('studioColorScience','','rgbToHsl,hexToHsl');
context.material=run('studioMaterialQualifier','const {rgbToHsl,hexToHsl}=science;','buildMaterialCube,validateMaterialQualifier');
const masks=run('studioSelectiveMask','const {validateMaterialQualifier}=material;','newSelectiveMask,keySelectiveMask,selectiveMaskCoverage');
const material={enabled:true,samples:['#dd2222','#b62e54'],hueRange:.08,saturationRange:.35,lightnessRange:.35,softness:.35};
const base={...masks.newSelectiveMask(),shape:'polygon',width:.5,height:.6,points:[[0,.1],[.9,0],[1,.8],[.2,1]],subtract:[{...masks.newSelectiveMask(),width:.25,height:.2,feather:.03}]};
let animated=masks.keySelectiveMask(masks.keySelectiveMask(base,0),2,{x:.65,rotation:33,points:[[0,0],[1,.2],[.9,1],[.1,.8]],opacity:.4});
const cases=[base,{...base,inverted:true},animated,{...animated,inverted:true}].flatMap(mask=>[0,.7,2].map(time=>({mask,time,coverage:Array.from(masks.selectiveMaskCoverage(mask,80,48,time))})));
process.stdout.write(JSON.stringify({cases,material,cube:context.material.buildMaterialCube(material,5).data}));
"""
    observed=json.loads(subprocess.check_output(['node','-e',script],cwd=repo))
    for case in observed['cases']:
        actual=mask_coverage(case['mask'],80,48,case['time']).ravel()
        np.testing.assert_allclose(actual,case['coverage'],atol=1e-7,rtol=0)
    with tempfile.TemporaryDirectory()as folder:
        path=Path(folder)/'material.cube';write_material_cube(observed['material'],path,size=5)
        actual=np.asarray([[float(v)for v in line.split()]for line in path.read_text().splitlines()if not line.startswith(('LUT','DOMAIN'))]).ravel()
        np.testing.assert_allclose(actual,observed['cube'],atol=1e-8,rtol=0)


def test_moving_patch_export_follows_rotating_material_on_every_sampled_frame():
    from studio_selective_mask import render_selective_mask
    width,height=320,180
    y,x=np.mgrid[:height,:width];rgb=np.stack([x//2,y,np.full_like(x,100)],axis=2).astype(np.uint8)
    m=mask();m.update(x=.4,y=.5,width=.05,height=.1,shape='rectangle')
    m['keyframes']=[dict(time=0,x=.4,y=.5,width=.05,height=.1,rotation=0),dict(time=1,x=.5,y=.5,width=.1,height=.2,rotation=90)]
    patch=dict(enabled=True,dx=.05,dy=0,strength=1,mode='clone',follow=dict(width=.05,height=.1,rotation=0))
    bounds=repair_bounds(patch,m,width,height,4)
    assert bounds[2]*bounds[3]<width*height*.5
    with tempfile.TemporaryDirectory()as folder:
        path=render_selective_mask(m,Path(folder)/'mask.mkv',width,height,1.5,2)
        effects=dict(selective_mask=m,clone_patch=patch,_worker_width=width,_worker_height=height,
            _worker_selective_mask_path=path,_worker_selective_mask_fps=2)
        graph=adjustment_grade_filter(effects,lambda _:'null','follow_')
        result=subprocess.run(['ffmpeg','-v','error','-threads','1','-filter_complex_threads','1','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{width}x{height}','-framerate','2','-i','pipe:0','-vf',graph,'-frames:v','3','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],input=rgb.tobytes()*3,check=True,capture_output=True)
        frames=np.frombuffer(result.stdout,np.uint8).reshape(3,height,width,3)
        for index,t in enumerate([0,.5,1]):
            pose=mask_at(m,t);cx=round(pose['x']*width);cy=round(pose['y']*height)
            dx,dy=repair_offset_at(patch,m,width,height,t)
            expected=[(cx+dx)/2,cy+dy,100]
            assert np.max(np.abs(frames[index,cy,cx].astype(float)-expected))<=1.1
            # The moving correction cannot spill into an unrelated corner.
            np.testing.assert_array_equal(frames[index,:10,:10],rgb[:10,:10])
